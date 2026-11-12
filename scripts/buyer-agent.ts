import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { privateKeyToAccount } from "viem/accounts";
import { recoverAddress } from "viem";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import type { Envelope, Proof } from "../lib/domain";
const mode = process.argv[2] ?? "broken";
if (!["honest", "broken", "injection"].includes(mode))
  throw Error("Choose honest, broken or injection");
const proof = JSON.parse(
  await fs.readFile("deploy/proof.json", "utf8"),
) as Proof;
const path = `deploy/payments/${mode}.json`;
try {
  await fs.access(path);
  console.log("Existing signed payment artifact retained:", path);
  process.exit(0);
} catch {}
const endpoint = proof.services?.find(
  (s) => s.status === "FROZEN" && s.endpoint.endsWith("/" + mode),
);
if (!endpoint || proof.bonds?.[endpoint.id]?.status !== "ACTIVE")
  throw Error("A finalized bonded promise is required");
const keys = JSON.parse(
  await fs.readFile(".secrets/accounts.json", "utf8"),
) as string[];
const signer = privateKeyToAccount(
  ("0x" + keys[1].replace(/^0x/, "")) as `0x${string}`,
);
const intentPath = `.secrets/payment-${mode}-intent.json`;
try {
  await fs.access(intentPath);
  throw Error(
    "A previous payment attempt is unresolved. Reconcile its wallet and facilitator before any retry.",
  );
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
const nonce = randomUUID();
await fs.writeFile(
  intentPath,
  JSON.stringify({
    mode,
    nonce,
    buyer: signer.address,
    startedAt: new Date().toISOString(),
  }),
);
const xclient = new x402Client().register(
  "eip155:84532",
  new ExactEvmScheme(signer),
);
const paidFetch = wrapFetchWithPayment(fetch, xclient);
const response = await paidFetch(
  `${endpoint.endpoint}?city=Lagos&nonce=${nonce}`,
);
const body = (await response.json()) as Envelope & { error?: string };
if (!response.ok) throw Error(body.error ?? JSON.stringify(body));
const digest = createHash("sha256")
  .update(body.request + body.response + body.payment_hash)
  .digest("hex");
if (
  (await recoverAddress({ hash: `0x${digest}`, signature: body.signature })) !==
  privateKeyToAccount(("0x" + keys[0].replace(/^0x/, "")) as `0x${string}`)
    .address
)
  throw Error("Seller signature mismatch");
await fs.mkdir("deploy/payments", { recursive: true });
await fs.writeFile(
  path,
  JSON.stringify(
    {
      ...body,
      capturedAt: new Date().toISOString(),
      settlementHeader: response.headers.get("payment-response"),
    },
    null,
    2,
  ),
);
await fs.unlink(intentPath);
console.log("x402 settled and seller signature verified:", body.payment_hash);
console.log("Saved byte-exact evidence:", path);
if (process.argv.includes("--file"))
  execFileSync("python", ["scripts/release.py", "file", mode], {
    stdio: "inherit",
  });
