import fs from "node:fs/promises";
import { explorer } from "../lib/explorer";
import type { Proof } from "../lib/domain";
const p = JSON.parse(await fs.readFile("deploy/proof.json", "utf8")) as Proof;
let verified = false;
try {
  verified =
    JSON.parse(await fs.readFile("deploy/proof-verification.json", "utf8"))
      .passed === true;
} catch {}
const evidence = [
  ...Object.entries(p.contracts).map(([name, c]) => ({
    type: "GenLayer Explorer Contract",
    title: `${name} · StudioNet 61999`,
    url: explorer("address", c.address),
  })),
  ...(p.probeContract
    ? [
        {
          type: "GenLayer Explorer Contract",
          title: "Base payment access probe · StudioNet 61999",
          url: explorer("address", p.probeContract),
        },
      ]
    : []),
  ...(p.website
    ? [{ type: "Live Demo", title: "Refund Court desktop app", url: p.website }]
    : []),
  ...(p.github
    ? [
        {
          type: "GitHub Repository",
          title: "Public source and finalized receipts",
          url: p.github,
        },
      ]
    : []),
];
const fields = {
  category: "Projects",
  mission: "Internet Court: Partner Demo Lab",
  partner: "x402",
  name: "Refund Court",
  oneLiner:
    "Chargebacks for agents: GenLayer validators judge signed x402 API responses and refund broken promises from the seller’s bond.",
  description:
    "Refund Court adds delivery recourse to paid agent APIs. Sellers freeze plain-English promises into 2–4 observable criteria and post a GEN refund bond. A buyer pays 0.001 test USDC through x402 on Base Sepolia, then files byte-exact request and response evidence signed by the seller. Deterministic code verifies the secp256k1 signature and blocks replay. GenLayer validators independently confirm the USDC transfer and judge each criterion with a literal response quote. Breaches pay a fixed 5 wei GEN demo reimbursement; fulfilled promises award the filing fee to the seller; uncertainty voids the case. Pull-based native claims require finalized receipt verification. The desktop app separates recorded proof from live chain reads and resumes transaction polling after reload.",
  outcome: verified
    ? "All six live cases finalized: subjective compilation rejected; promises frozen and bonded; breached and injected responses refunded with verified native credit; honest delivery paid the seller fee; replay and forgery rejected by code."
    : "In progress. Contracts and the Base RPC probe are deployed on StudioNet. Required payment, refund and rejection evidence must be completed and independently verified before this draft can be called ready.",
  howTo:
    "Open the desktop app without a wallet. Inspect recorded proof, frozen seller criteria and contract links. Select Live chain reads to fetch current finalized state. Use Try it with Base Sepolia test USDC to pay an honest, broken or injection endpoint, file its seller-signed evidence, post the 1 wei GEN filing fee, and request judgment after three Base confirmations. Claim GEN credit and verify its finalized native transfer. Run npm run verify:proof from the public repo to validate every required live case.",
  contracts: evidence.filter((e) => e.type === "GenLayer Explorer Contract"),
  evidence,
  status: verified
    ? "DRAFT_VERIFIED_NOT_SUBMITTED"
    : "DRAFT_INCOMPLETE_NOT_SUBMITTED",
  website: p.website ?? "",
  repository: p.github ?? "",
  submitted: false,
};
for (const [name, limit] of [
  ["oneLiner", 180],
  ["description", 1000],
  ["outcome", 500],
] as const) {
  if (fields[name].length > limit) throw Error(name + " exceeds " + limit);
}
await fs.mkdir("docs/submission", { recursive: true });
await fs.writeFile(
  "docs/submission/portal-fields.json",
  JSON.stringify(fields, null, 2),
);
console.log("Portal draft prepared; no submission sent.", {
  oneLiner: fields.oneLiner.length,
  description: fields.description.length,
  outcome: fields.outcome.length,
  contracts: fields.contracts.length,
});
