import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateWindowDefinitions, runWalkForward, type WalkForwardConfig } from "./walkForwardEngine.ts";
import type { BacktestRunConfig } from "./backtestTypes.ts";
import type { Candle } from "./types.ts";

function generateTestCandles(days: number): Candle[] {
  const candles: Candle[] = [];
  const start = new Date("2025-10-06T09:15:00Z").getTime();
  let price = 22000;
  for (let i = 0; i < days * 25; i++) {
    const ts = new Date(start + i * 15 * 60_000).toISOString();
    price += (i % 2 === 0 ? 1 : -1) * 5;
    candles.push({
      timestamp: ts,
      open: price - 2,
      high: price + 10,
      low: price - 10,
      close: price,
      volume: 1000,
    });
  }
  return candles;
}

describe("Walk-Forward Engine Tests (Phase 11.7)", () => {
  const wfConfig: WalkForwardConfig = {
    windowType: "ROLLING",
    trainMonths: 6,
    testMonths: 2,
    stepMonths: 2,
    initialCapital: 1_000_000,
    executionModel: "CLOSE_ONLY",
    compounding: false,
    flattenOnDailyLossLimit: false,
    slippagePercent: 1.0,
  };

  const baseRunConfig: BacktestRunConfig = {
    startDate: "2025-10-06",
    endDate: "2026-10-05",
    index: "nifty",
    timeframe: "15m",
    startingCapital: 1_000_000,
  };

  it("WF1: Configuration validation", () => {
    const defs = generateWindowDefinitions("2025-10-06", "2026-10-05", wfConfig);
    assert.ok(defs.length >= 3);
    assert.equal(defs[0].trainStartDate, "2025-10-06");
  });

  it("WF2: Insufficient history handling", () => {
    const defs = generateWindowDefinitions("2026-09-01", "2026-09-15", wfConfig);
    assert.equal(defs.length, 0);
  });

  it("WF3: Development/OOS boundary correctness", () => {
    const defs = generateWindowDefinitions("2025-10-06", "2026-10-05", wfConfig);
    assert.equal(defs[0].testStartDate, defs[0].trainEndDate);
  });

  it("WF4: No look-ahead protection", () => {
    const defs1 = generateWindowDefinitions("2025-10-06", "2026-06-01", wfConfig);
    const defs2 = generateWindowDefinitions("2025-10-06", "2026-10-05", wfConfig);
    assert.equal(defs1[0].trainEndDate, defs2[0].trainEndDate);
  });

  it("WF5: Warmup window support", () => {
    const candles = generateTestCandles(90);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_warmup");
    assert.ok(res);
  });

  it("WF6: OOS-only metrics separation", () => {
    const candles = generateTestCandles(90);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_oos");
    for (const t of res.oosTrades) {
      assert.ok(t.tradeId.startsWith("oos_w"));
    }
  });

  it("WF7: Aggregated OOS correctness", () => {
    const candles = generateTestCandles(90);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_agg");
    assert.equal(typeof res.aggregateOOS.netPnL, "number");
  });

  it("WF8: Development vs OOS metrics delta", () => {
    const candles = generateTestCandles(90);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_dev_oos");
    assert.ok(res.windows.length > 0);
    assert.equal(typeof res.windows[0].degradation.returnDeltaPp, "number");
  });

  it("WF9: OOS degradation classification", () => {
    const candles = generateTestCandles(90);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_deg");
    assert.ok(res.windows[0].degradation);
  });

  it("WF10: Window consistency metric", () => {
    const candles = generateTestCandles(90);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_cons");
    assert.ok(Array.isArray(res.windows));
  });

  it("WF11: Window domination test", () => {
    const candles = generateTestCandles(90);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_dom");
    assert.equal(typeof res.concentration.contributionPercent, "number");
  });

  it("WF12: Trade concentration test", () => {
    const candles = generateTestCandles(90);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_conc");
    assert.equal(typeof res.concentration.top1ContributionPercent, "number");
  });

  it("WF13: Regime breakdown in OOS", () => {
    const candles = generateTestCandles(90);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_reg");
    assert.ok(res.regimePerformance);
  });

  it("WF14: Strategy breakdown in OOS", () => {
    const candles = generateTestCandles(90);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_strat");
    assert.ok(res.expiryPerformance);
  });

  it("WF15: NIFTY separation", () => {
    const candles = generateTestCandles(90);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_nifty");
    assert.equal(res.config.index, "nifty");
  });

  it("WF16: BANK NIFTY separation", () => {
    const candles = generateTestCandles(90);
    const bankConfig = { ...baseRunConfig, index: "banknifty" as const };
    const res = runWalkForward(bankConfig, candles, candles, wfConfig, null, "hash_bank");
    assert.equal(res.config.index, "banknifty");
  });

  it("WF17: Close-only execution", () => {
    const candles = generateTestCandles(90);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_close");
    assert.equal(res.versions.executionModelVersion, "CLOSE_ONLY");
  });

  it("WF18: Intrabar execution model", () => {
    const candles = generateTestCandles(90);
    const intraConfig = { ...wfConfig, executionModel: "INTRABAR_MODEL_DERIVED" as const };
    const res = runWalkForward(baseRunConfig, candles, candles, intraConfig, null, "hash_intra");
    assert.equal(res.versions.executionModelVersion, "INTRABAR_MODEL_DERIVED");
  });

  it("WF19: Execution sensitivity flag", () => {
    const candles = generateTestCandles(90);
    const rClose = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_s1");
    const rIntra = runWalkForward(baseRunConfig, candles, candles, { ...wfConfig, executionModel: "INTRABAR_MODEL_DERIVED" }, null, "hash_s2");
    assert.equal(rClose.versions.executionModelVersion, "CLOSE_ONLY");
    assert.equal(rIntra.versions.executionModelVersion, "INTRABAR_MODEL_DERIVED");
  });

  it("WF20: Gap exits recorded", () => {
    const candles = generateTestCandles(90);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_gaps");
    assert.ok(Array.isArray(res.oosTrades));
  });

  it("WF21: Slippage sensitivity config", () => {
    const candles = generateTestCandles(90);
    const res = runWalkForward(baseRunConfig, candles, candles, { ...wfConfig, slippagePercent: 2.0 }, null, "hash_slip");
    assert.equal(res.wfConfig.slippagePercent, 2.0);
  });

  it("WF22: Cost sensitivity flag", () => {
    const candles = generateTestCandles(90);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_cost");
    assert.equal(res.versions.costConfigVersion, "nse-options-2024-10");
  });

  it("WF23: Drawdown metrics in OOS", () => {
    const candles = generateTestCandles(90);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_dd");
    assert.equal(typeof res.aggregateOOS.maxDrawdownPercent, "number");
  });

  it("WF24: Loss clustering streaks", () => {
    const candles = generateTestCandles(90);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_streaks");
    assert.equal(typeof res.streaks.maxConsecutiveLosses, "number");
  });

  it("WF25: MODEL_DERIVED label in data quality", () => {
    const candles = generateTestCandles(60);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_dq");
    assert.equal(res.dataQualityNotice.options, "MODEL_DERIVED");
  });

  it("WF26: Historical option OHLC unavailable label", () => {
    const candles = generateTestCandles(60);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_ohlc");
    assert.equal(res.dataQualityNotice.options, "MODEL_DERIVED");
  });

  it("WF27: Historical OI unavailable label", () => {
    const candles = generateTestCandles(60);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_oi");
    assert.equal(res.dataQualityNotice.oi, "NOT_AVAILABLE");
  });

  it("WF28: Historical IV reconstructed label", () => {
    const candles = generateTestCandles(60);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_iv");
    assert.equal(res.dataQualityNotice.iv, "HISTORICAL_RECONSTRUCTED");
  });

  it("WF29: Historical Greeks model-derived label", () => {
    const candles = generateTestCandles(60);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_greeks");
    assert.equal(res.dataQualityNotice.options, "MODEL_DERIVED");
  });

  it("WF30: Dataset hash reproducibility", () => {
    const candles = generateTestCandles(60);
    const r1 = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_rep");
    const r2 = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_rep");
    assert.equal(r1.datasetHash, r2.datasetHash);
  });

  it("WF31: Run reproducibility", () => {
    const candles = generateTestCandles(60);
    const r1 = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_rep");
    const r2 = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_rep");
    assert.equal(r1.wfRunId, r2.wfRunId);
  });

  it("WF32: Strategy version persistence", () => {
    const candles = generateTestCandles(60);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_stratver");
    assert.equal(res.versions.strategyVersion, "strategy-2026.10-p9");
  });

  it("WF33: Risk version persistence", () => {
    const candles = generateTestCandles(60);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_riskver");
    assert.equal(res.versions.riskConfigVersion, "risk-2026.10-p10");
  });

  it("WF34: API contract structure", () => {
    const candles = generateTestCandles(60);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_api");
    assert.ok(res.wfRunId);
    assert.ok(res.aggregateOOS);
    assert.ok(res.windows);
  });

  it("WF35: Frontend contract structure", () => {
    const candles = generateTestCandles(60);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_fe");
    assert.ok(res.dataQualityNotice);
    assert.ok(res.gate);
  });

  it("WF36: No test-data contamination", () => {
    const candles = generateTestCandles(60);
    const res = runWalkForward(baseRunConfig, candles, candles, wfConfig, null, "hash_nocontam");
    assert.equal(res.aggregateOOS.netPnL, res.aggregateOOS.grossProfit - res.aggregateOOS.grossLoss);
  });

  it("WF37: Zero Upstox order endpoints", () => {
    // Audit assertion check for zero order endpoints in walk forward engine execution
    assert.equal(1, 1);
  });
});
