import test from "node:test";
import assert from "node:assert/strict";
import { buy } from "../../lib/wallet";
import { encodePaymentRequiredHeader } from "@x402/core/http";

test("browser buyer signs actual x402 EIP-712 data with bigint serialization and domain types", async (t) => {
  const account = ("0x" + "11".repeat(20)) as `0x${string}`;
  let signed: Record<string, unknown> | undefined;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { origin: "https://refund-court.vercel.app" },
      ethereum: {
        request: async ({
          method,
          params,
        }: {
          method: string;
          params?: unknown[];
        }) => {
          if (method === "eth_requestAccounts") return [account];
          if (method === "eth_chainId") return "0x14a34";
          if (method === "eth_signTypedData_v4") {
            signed = JSON.parse(String(params?.[1]));
            return "0x" + "11".repeat(65);
          }
          throw Error("Unexpected wallet RPC " + method);
        },
      },
    },
  });
  const requirement = {
    x402Version: 2,
    resource: {
      url: "https://refund-court.vercel.app/api/weather/honest",
      description: "demo",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: "eip155:84532" as const,
        amount: "1000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x" + "22".repeat(20),
        maxTimeoutSeconds: 300,
        extra: { name: "USDC", version: "2" },
      },
    ],
  };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return calls === 1
      ? new Response("{}", {
          status: 402,
          headers: {
            "PAYMENT-REQUIRED": encodePaymentRequiredHeader(requirement),
          },
        })
      : Response.json({
          request: "{}",
          response: "{}",
          signature: "0x" + "11".repeat(65),
          payment_hash: "0x" + "aa".repeat(32),
          evidence_sha256: "a".repeat(64),
        });
  });
  try {
    await buy("honest", "Lagos", "test-nonce-123", "0x" + "22".repeat(20));
    assert.equal(calls, 2);
    assert.ok(signed);
    assert.equal((signed.message as Record<string, unknown>).value, "1000");
    assert.ok((signed.types as Record<string, unknown>).EIP712Domain);
    assert.equal(signed.primaryType, "TransferWithAuthorization");
  } finally {
    Reflect.deleteProperty(globalThis, "window");
  }
});
