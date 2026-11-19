import { test } from "node:test";
import assert from "node:assert/strict";
import { experimentReadiness, classifyLocalDataset, MIN_COMPLETED_EXPIRIES, type Inventory } from "./optionsInventory.ts";

const inv = (o: Partial<Inventory> = {}): Inventory => ({
  version: "t", id: "t", createdAt: "", activeContracts: [], activeExpiries: {}, underlying: {}, localDatasets: [],
  expiredHistory: { available: false, status: 401, errorCode: "UDAPI1149", message: "Plus plan" }, completedExpiriesRetrievable: 0,
  fields: { bidAsk: { available: false, source: "", note: "" } }, ...o,
});

test("without expired-contract history every backtest-type experiment is disabled, with the reason", () => {
  for (const e of experimentReadiness(inv())) {
    assert.equal(e.enabled, false, e.id);
    assert.ok(e.reasons.length > 0, `${e.id} explains why`);
  }
  assert.match(experimentReadiness(inv())[0].reasons.join(" "), /UDAPI1149/);
});

test("access alone is not enough: too few completed expiries keeps the backtest disabled", () => {
  const some = inv({ expiredHistory: { available: true, status: 200, errorCode: null, message: null }, completedExpiriesRetrievable: 10 });
  assert.equal(experimentReadiness(some).find((e) => e.id === "expiry-cycle-backtest")!.enabled, false);
  const enough = inv({ expiredHistory: { available: true, status: 200, errorCode: null, message: null }, completedExpiriesRetrievable: MIN_COMPLETED_EXPIRIES });
  assert.equal(experimentReadiness(enough).find((e) => e.id === "expiry-cycle-backtest")!.enabled, true);
  assert.equal(experimentReadiness(enough).find((e) => e.id === "intraday-option-replay")!.enabled, false, "still no bid/ask");
});

test("active-contract exploration can never back a performance claim", () => {
  const all = inv({ expiredHistory: { available: true, status: 200, errorCode: null, message: null }, completedExpiriesRetrievable: 999, fields: { bidAsk: { available: true, source: "", note: "" } } });
  assert.equal(experimentReadiness(all).find((e) => e.id === "active-contract-exploration")!.enabled, false);
});

test("synthetic Black-Scholes backtests are never labelled historical", () => {
  assert.equal(classifyLocalDataset("backtests").class, "MODEL_DERIVED_SYNTHETIC");
  assert.equal(classifyLocalDataset("options-audit").class, "LIVE_SNAPSHOT");
  assert.equal(classifyLocalDataset(".test-data").class, "TEST_FIXTURE");
});
