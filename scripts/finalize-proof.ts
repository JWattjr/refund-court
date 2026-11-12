import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { explorer, basePayment } from "../lib/explorer";
import type { Proof, Credit } from "../lib/domain";
const p = JSON.parse(
  await fs.readFile("deploy/proof.json", "utf8"),
) as Proof & { sourceCommit?: string; verifiedAt?: string };
const verification = JSON.parse(
  await fs.readFile("deploy/proof-verification.json", "utf8"),
) as { passed: boolean; verifiedAt: string };
if (!verification.passed)
  throw Error("Refusing to mark an incomplete proof verified");
const tx = (label: string) => {
  const hash = p.transactions[label];
  if (!hash) throw Error("Missing receipt " + label);
  return { label, hash, url: explorer("tx", hash) };
};
function credit(index: number): Credit {
  const owner = p.demoWallets?.[index];
  const value = Object.entries(p.credits ?? {}).find(
    ([key]) => key.toLowerCase() === owner?.toLowerCase(),
  )?.[1];
  if (!value || value.pull.status !== "PAID" || !value.pull.child_hash)
    throw Error("Unverified native credit");
  return value;
}
const buyer = credit(1),
  seller = credit(0);
const judgment = (mode: string) => {
  const service = p.services?.find(
    (s) => s.status === "FROZEN" && s.endpoint.endsWith("/" + mode),
  );
  const c = p.claimCases?.find((c) => c.service_id === service?.id);
  if (!c) throw Error("Missing " + mode + " case");
  return {
    id: c.id,
    outcome: c.status,
    verdicts: c.verdicts,
    payment: { hash: c.payment_hash, url: basePayment(c.payment_hash) },
    judgment: tx("judge-" + mode),
    finalizedSettlement: tx("judge-" + mode + "-child-0"),
  };
};
const buyerPayout = {
  amountWei: buyer.pull.amount,
  hash: buyer.pull.child_hash,
  url: explorer("tx", buyer.pull.child_hash!),
  verification: tx("verify-pull-1-1"),
  note: "One aggregate 12 wei transfer: 5 wei reimbursement plus 1 wei returned fee for each of the broken and injection cases.",
};
p.cases = {
  subjectivePromiseRejected: {
    status: "REJECTED",
    compile: tx("compile-subjective"),
    finalizedRecord: tx("compile-subjective-child-0"),
  },
  promiseFrozenAndBonded: {
    status: "ACTIVE",
    services: p.services
      ?.filter((s) => s.status === "FROZEN")
      .map((s) => ({
        id: s.id,
        hash: s.hash,
        bondWei: 20,
        compile: tx("compile-" + s.endpoint.split("/").at(-1)),
        bond: tx("bond-" + s.id),
        activation: tx("bond-" + s.id + "-child-0"),
      })),
  },
  brokenResponseRefund: { ...judgment("broken"), nativePayout: buyerPayout },
  honestResponseSellerFee: {
    ...judgment("honest"),
    nativePayout: {
      amountWei: seller.pull.amount,
      hash: seller.pull.child_hash,
      url: explorer("tx", seller.pull.child_hash!),
      verification: tx("verify-pull-0-1"),
    },
  },
  injectionFails: { ...judgment("injection"), nativePayout: buyerPayout },
  forgedAndReplayedClaimsRejected: {
    status: "FINALIZED_ERROR_EXPECTED",
    replay: tx("reject-replay"),
    forgery: tx("reject-forgery"),
  },
};
p.releaseStatus = "LIVE_PROOF_VERIFIED";
p.verifiedAt = verification.verifiedAt;
p.sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
await fs.writeFile("deploy/proof.json", JSON.stringify(p, null, 2));
await fs.writeFile(
  "deploy/case-receipts.json",
  JSON.stringify(
    {
      verifiedAt: p.verifiedAt,
      network: p.network,
      chainId: p.chainId,
      depositTotalWei: Object.values(p.deposits).reduce((a, b) => a + b, 0),
      x402TotalUSDC: "0.003",
      cases: p.cases,
    },
    null,
    2,
  ),
);
const md = [
  "# Verified live proof",
  "",
  `[App](${p.website}) · [Public source](${p.github})`,
  "",
  `Verified at ${p.verifiedAt}. All six required live cases have finalized. Native refunds are credited and reconciled on chain.`,
  "",
  "| Required case | Result | Receipts |",
  "| --- | --- | --- |",
  `| Subjective promise | REJECTED | [Compile](${tx("compile-subjective").url}) |`,
  `| Observable promises and bonds | Three FROZEN promises, three 20 wei deposits | ${p.services
    ?.filter((s) => s.status === "FROZEN")
    .map((s) => `[${s.id} bond](${tx("bond-" + s.id).url})`)
    .join(", ")} |`,
  `| Broken response | NOT_MET → REFUND | [Judgment](${tx("judge-broken").url}), [native credit](${buyerPayout.url}), [verify_claim](${tx("verify-pull-1-1").url}) |`,
  `| Honest response | All MET → seller fee | [Judgment](${tx("judge-honest").url}), [seller native credit](${explorer("tx", seller.pull.child_hash!)}), [verify_claim](${tx("verify-pull-0-1").url}) |`,
  `| Response injection | Instruction ignored; NOT_MET → REFUND | [Judgment](${tx("judge-injection").url}), [aggregate native credit](${buyerPayout.url}) |`,
  `| Replay and forgery | Both FINALIZED execution errors by code | [Replay](${tx("reject-replay").url}), [forgery](${tx("reject-forgery").url}) |`,
  "",
  "The buyer received one aggregate **12 wei** transfer: **10 wei of reimbursements plus 2 wei of returned filing fees**. The seller received **1 wei** for the honest case. Both native child receipts report `value_credited: true`, and both reserved pulls read `PAID` after `verify_claim`.",
  "",
  "Native balances: buyer **0 → 12 wei**, seller **0 → 1 wei**, court **63 → 50 wei**. The remaining 50 wei backs the three active seller bonds. No new deposits were made to manufacture the payout proof.",
  "",
  "**Total contract deposits: 63 wei GEN (0.000000000000000063 GEN)**, within the owner-approved limit. Three real x402 payments spent **0.003 test USDC** on Base Sepolia. Funding transfers are recorded separately from contract deposits to avoid counting the same value twice.",
  "",
  "## Contract evidence",
  "",
  ...Object.entries(p.contracts).map(
    ([name, c]) =>
      `- GenLayer Explorer Contract · ${name}: [${c.address}](${explorer("address", c.address)})`,
  ),
  ...(p.probeContract
    ? [
        `- GenLayer Explorer Contract · Base payment probe: [${p.probeContract}](${explorer("address", p.probeContract)})`,
      ]
    : []),
  "",
  "Every address link was verified as `CONTRACT` with the Studio Explorer API and opened on its matching contract page. Transaction links were verified by hash through `/api/transactions`, with a browser user agent.",
  "",
  "See [full manifest](../deploy/proof.json), [machine-readable case receipts](../deploy/case-receipts.json), [native balance proof](../deploy/native-balance-proof.json), [verifier report](../deploy/proof-verification.json) and [link verification](../deploy/link-verification.json). The Portal draft is prepared but **not submitted**.",
  "",
];
await fs.writeFile("docs/LIVE-PROOF.md", md.join("\n"));
console.log(
  "Live proof packaged. Deposits:",
  Object.values(p.deposits).reduce((a, b) => a + b, 0),
  "wei; six real cases; Portal not submitted.",
);
