import test from "node:test";
import assert from "node:assert/strict";
import { permittedPayments } from "../../lib/payment-policy";
const seller = "0x" + "11".repeat(20);
const good = {
  scheme: "exact",
  network: "eip155:84532" as const,
  asset: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
  payTo: seller,
  amount: "1000",
  maxTimeoutSeconds: 300,
  extra: {},
};
test("only the frozen seller, token, network and capped exact price may be authorized", () => {
  assert.equal(permittedPayments(2, [good], seller).length, 1);
  for (const changed of [
    { amount: "1001" },
    { payTo: "0x" + "22".repeat(20) },
    { network: "eip155:8453" as const },
    { asset: "0x" + "33".repeat(20) },
    { maxTimeoutSeconds: 3600 },
    { scheme: "upto" },
  ])
    assert.deepEqual(
      permittedPayments(2, [{ ...good, ...changed }], seller),
      [],
    );
  assert.deepEqual(permittedPayments(1, [good], seller), []);
});
