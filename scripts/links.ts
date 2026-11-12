import fs from "node:fs/promises";
import { explorer, explorerApi } from "../lib/explorer";
import type { Proof } from "../lib/domain";
const p = JSON.parse(await fs.readFile("deploy/proof.json", "utf8")) as Proof;
const entries = [
  ...Object.entries(p.contracts).map(([name, c]) => ({
    name,
    kind: "address" as const,
    value: c.address,
  })),
  ...(p.probeContract
    ? [
        {
          name: "BasePaymentProbe",
          kind: "address" as const,
          value: p.probeContract,
        },
      ]
    : []),
  ...Object.entries(p.transactions).map(([name, value]) => ({
    name,
    kind: "tx" as const,
    value,
  })),
];
const results = [];
for (const e of entries) {
  const url = explorer(e.kind, e.value),
    api = explorerApi(e.kind, e.value);
  let r: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      r = await fetch(api, {
        headers: { "User-Agent": "Mozilla/5.0 RefundCourt/1.0" },
        signal: AbortSignal.timeout(30000),
      });
      if (![429, 502, 503, 504].includes(r.status) || attempt === 2) break;
      console.log(e.name, "transient Explorer HTTP", r.status, "retrying");
      await r.arrayBuffer();
    } catch (error) {
      if (attempt === 2) throw error;
      console.log(e.name, "transient Explorer transport failure; retrying");
    }
    await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
  }
  if (!r) throw Error("Explorer response missing");
  const body = (await r.json()) as Record<string, unknown>;
  const item = (body.transaction ?? body.address ?? body) as Record<
    string,
    unknown
  >;
  const id = String(
    item.hash ??
      (typeof body.address === "string" ? body.address : item.address) ??
      "",
  );
  const valid =
    r.ok &&
    (e.kind === "address"
      ? String(item.type ?? body.type) === "CONTRACT" &&
        id.toLowerCase() === e.value.toLowerCase()
      : id.toLowerCase() === e.value.toLowerCase());
  results.push({
    ...e,
    url,
    api,
    valid,
    httpStatus: r.status,
    type: item.type ?? body.type,
  });
  console.log(e.name, valid ? "VERIFIED" : "FAILED", url);
  await new Promise((resolve) => setTimeout(resolve, 350));
}
await fs.writeFile(
  "deploy/link-verification.json",
  JSON.stringify(
    {
      network: "StudioNet",
      chainId: 61999,
      verifiedAt: new Date().toISOString(),
      entries: results,
    },
    null,
    2,
  ),
);
if (results.some((x) => !x.valid)) process.exitCode = 1;
