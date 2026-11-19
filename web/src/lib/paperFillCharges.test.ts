// Paper post-fill sizing: per-lot percentage charges are recomputed at the realised fill, not taken from the plan.
// Offline and deterministic: mock snapshot, fixed clock, in-memory engine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mockSnapshotTradeInputs as mockSnapshot } from "./testFixtures/mockSnapshotTradeInputs.ts";
import { analyze } from "./engine/strategy.ts";
import { PaperTradingEngine } from "./paperEngine.ts";
import { costsFor, DEFAULT_TRANSACTION_COSTS } from "./services/transactionCosts.ts";

const M = new Date("2026-10-05T07:00:00Z");

test("PFC-1. riskAmount = fixed charges + one lot at the realised fill, with charges recomputed at the realised prices", () => {
  // 388,500 capital: the plan sizes 2 lots, the realised fill (56.71) re-sizes to 1 (see paperTradingHardening).
  const analysis = analyze(mockSnapshot("nifty", M), M, { accountCapital: 388_500 });
  const engine = new PaperTradingEngine({ accountCapital: 388_500 });
  const r = engine.processRecommendation(analysis, M);
  assert.equal(r.created, true, r.reason);
  const t = r.trade!;
  assert.equal(t.lots, 1);
  const fill = t.legs[0].entryFillPrice;
  const stopExit = t.riskAssessmentSnapshot.worstStopFill!;
  const lot = t.riskAssessmentSnapshot.lotSize;
  const variable = costsFor(
    [{ side: "BUY", price: fill, quantity: lot }, { side: "SELL", price: stopExit, quantity: lot }],
    { ...DEFAULT_TRANSACTION_COSTS, brokeragePerOrder: 0 },
  ).totalCosts;
  const expected = t.riskAssessmentSnapshot.fixedCostsInr! + (fill - stopExit) * lot + variable;
  assert.ok(Math.abs(t.riskAmount - expected) <= 1, `riskAmount ${t.riskAmount} vs independent ${expected.toFixed(2)}`);
});
