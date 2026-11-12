import fs from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { recoverAddress } from "viem";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { permittedPayments } from "../lib/payment-policy";
import type { Envelope } from "../lib/domain";

const approval = JSON.parse(
  await fs.readFile(".secrets/deposit-approval.json", "utf8"),
);
if (approval.approvedAdditionalUSDCMicro !== 1000)
  throw Error(
    "Explicit owner approval required for the one additional 0.001 test USDC compatibility check",
  );
const file = "deploy/api-core-paid-check.json",
  intent = ".secrets/api-core-check-intent.json";
try {
  await fs.access(file);
  console.log("Existing paid core API check retained");
  process.exit(0);
} catch {}
try {
  await fs.access(intent);
  throw Error(
    "Reconcile the existing supplemental payment intent before retrying",
  );
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
const keys = JSON.parse(
  await fs.readFile(".secrets/accounts.json", "utf8"),
) as string[];
const buyer = privateKeyToAccount(
  ("0x" + keys[1].replace(/^0x/, "")) as `0x${string}`,
);
const seller = privateKeyToAccount(
  ("0x" + keys[0].replace(/^0x/, "")) as `0x${string}`,
);
const nonce = randomUUID();
await fs.writeFile(
  intent,
  JSON.stringify({
    nonce,
    buyer: buyer.address,
    maximumMicroUSDC: 1000,
    startedAt: new Date().toISOString(),
  }),
);
const client = new x402Client()
  .register("eip155:84532", new ExactEvmScheme(buyer))
  .registerPolicy((v, r) => permittedPayments(v, r, seller.address));
const response = await wrapFetchWithPayment(
  fetch,
  client,
)(
  `https://refund-court.vercel.app/api/weather/honest?city=Lagos&nonce=${nonce}`,
);
const body = (await response.json()) as Envelope & { error?: string };
if (!response.ok) throw Error(body.error ?? JSON.stringify(body));
const digest = createHash("sha256")
  .update(body.request + body.response + body.payment_hash)
  .digest("hex");
if (
  (await recoverAddress({ hash: `0x${digest}`, signature: body.signature })) !==
  seller.address
)
  throw Error("Seller signature mismatch");
const rpc = await fetch("https://sepolia.base.org", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getTransactionReceipt",
    params: [body.payment_hash],
  }),
});
const receipt = (await rpc.json()).result;
if (receipt?.status !== "0x1")
  throw Error("Payment receipt is not successful; reconcile intent");
await fs.writeFile(
  file,
  JSON.stringify(
    {
      ...body,
      receipt,
      paidMicroUSDC: 1000,
      capturedAt: new Date().toISOString(),
      purpose:
        "Live validation after removing the unused default paywall UI dependencies; no additional GenLayer claim or deposit.",
    },
    null,
    2,
  ),
);
await fs.unlink(intent);
console.log(
  "Core SDK paid route confirmed with a real 0.001 test USDC payment and verified seller signature:",
  body.payment_hash,
);
