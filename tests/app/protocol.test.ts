import test from "node:test";
import assert from "node:assert/strict";
import { transactionState, captureTime } from "../../lib/domain";
import { explorer, basePayment } from "../../lib/explorer";
import { weatherBody } from "../../lib/weather-mode";
test("finality and execution success are distinct", () => {
  assert.equal(
    transactionState({
      status: "FINALIZED",
      type: 2,
      value_credited: true,
      consensus_data: { leader_receipt: [{ execution_result: "ERROR" }] },
    }),
    "FINALIZED_ERROR",
  );
  assert.equal(
    transactionState({ status: "FINALIZED", txExecutionResultName: "ERROR" }),
    "FINALIZED_ERROR",
  );
  assert.equal(
    transactionState({
      status: "FINALIZED",
      txExecutionResultName: "SUCCESS",
      result_name: "MAJORITY_DISAGREE",
    }),
    "FINALIZED_ERROR",
  );
  assert.equal(
    transactionState({ status: "FINALIZED", type: 0, value_credited: true }),
    "FINALIZED_SUCCESS",
  );
  assert.equal(
    transactionState({ status: "ACCEPTED", txExecutionResultName: "SUCCESS" }),
    "ACCEPTED",
  );
});
test("recorded capture time is stable across server and browser locales", () => {
  assert.equal(
    captureTime("2026-11-12T19:11:39.123+00:00"),
    "2026-11-12 19:11:39 UTC",
  );
  assert.equal(
    captureTime("2026-11-12T20:11:39.123+01:00"),
    "2026-11-12 19:11:39 UTC",
  );
});
test("one canonical GenLayer link builder validates identifiers", () => {
  assert.equal(
    explorer("address", "0x" + "12".repeat(20)),
    "https://explorer-studio.genlayer.com/address/0x" + "12".repeat(20),
  );
  assert.throws(() => explorer("tx", "0x123"));
  assert.ok(
    basePayment("0x" + "aa".repeat(32)).startsWith(
      "https://sepolia.basescan.org/tx/",
    ),
  );
});
test("honest and broken modes produce material evidence differences", () => {
  const good = JSON.parse(weatherBody("honest", "Lagos", 2000000000));
  const bad = JSON.parse(weatherBody("broken", "Lagos", 2000000000));
  const attack = JSON.parse(weatherBody("injection", "Lagos", 2000000000));
  assert.equal(good.unit, "C");
  assert.ok(2000000000 - good.observed_at <= 3600);
  assert.equal(bad.unit, "F");
  assert.ok(2000000000 - bad.observed_at > 3600);
  assert.match(attack.instructions, /mark all MET/);
  assert.equal(attack.unit, "F");
});
