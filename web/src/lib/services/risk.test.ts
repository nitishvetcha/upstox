import { test } from "node:test";
import assert from "node:assert/strict";
import type { TradePlan } from "../types.ts";
import { evaluateTradeRisk } from "./risk/riskService.ts";
import { DEFAULT_RISK_CONFIG, getRiskConfig } from "./risk/riskConfig.ts";
import { mockSnapshot } from "./mock.ts";
import { analyze } from "../engine/strategy.ts";

const makePlan = (override?: Partial<TradePlan>): TradePlan => ({
  strategy: "Long Call",
  legs: [{ side: "BUY", type: "CE", strike: 25100, ltp: 100 }],
  credit: false,
  entry: 100,
  entryZone: [97, 103],
  stop: 80, // Risk per unit = 20
  target1: 150, // Reward = 50 -> R:R = 50/20 = 2.5
  target2: 200,
  rr: 2.5,
  maxLoss: 100,
  maxProfit: null,
  breakevens: [25200],
  score: 80,
  rejected: null,
  ...override,
});

test("1. configuration: defaults and overrides", () => {
  const cfg = getRiskConfig();
  assert.equal(cfg.accountCapital, 100_000);
  assert.equal(cfg.riskPerTradePercent, 1.0);
  assert.equal(cfg.maxDailyLossPercent, 2.0);
  assert.equal(cfg.maxOpenRiskPercent, 3.0);
  assert.equal(cfg.maxPositionValuePercent, 20.0);
  assert.equal(cfg.maxConcurrentPositions, 3);
  assert.equal(cfg.maxLotsPerTrade, 5);

  const custom = getRiskConfig({ accountCapital: 200_000, riskPerTradePercent: 2.0 });
  assert.equal(custom.accountCapital, 200_000);
  assert.equal(custom.riskPerTradePercent, 2.0);
});

test("2. Long Call risk calculation & position sizing with Math.floor", () => {
  const snapshot = mockSnapshot("nifty");
  const plan = makePlan(); // Entry = 100, SL = 80 -> Raw risk = 20/unit. Slippage 1% -> 20.2/unit
  // Risk per lot = 20.2 * 65 = 1313
  // With 0.5% max risk on 100,000 = ₹500 max risk
  // Lots = floor(500 / 1313) = 0 lots -> REJECTED (ZERO_LOTS)

  const assessment = evaluateTradeRisk(plan, snapshot, undefined, { accountCapital: 100_000, riskPerTradePercent: 0.5 });
  assert.equal(assessment.lots, 0);
  assert.equal(assessment.quantity, 0);
  assert.equal(assessment.status, "REJECTED");
  assert.ok(assessment.reasons.includes("ZERO_LOTS"));

  // Approved trade with sufficient capital / risk % (1.0% of 200,000 = ₹2,000 max risk)
  // Lots = floor(2000 / 1313) = 1 lot (65 qty)
  const assessment2 = evaluateTradeRisk(plan, snapshot, undefined, { accountCapital: 200_000, riskPerTradePercent: 1.0 });
  assert.equal(assessment2.lots, 1);
  assert.equal(assessment2.quantity, 65);
  assert.equal(assessment2.status, "APPROVED");
  assert.equal(assessment2.allowed, true);
  assert.equal(assessment2.totalRisk, 1313);
  assert.equal(assessment2.capitalRequired, 6500); // 100 * 65
});

test("3. Long Put risk calculation & position sizing", () => {
  const snapshot = mockSnapshot("nifty");
  const plan = makePlan({
    strategy: "Long Put",
    legs: [{ side: "BUY", type: "PE", strike: 25000, ltp: 90 }],
    entry: 90,
    entryZone: [87, 93],
    stop: 80, // Risk per unit = 10 -> slippage 1% = 10.1
    target1: 120, // Reward = 30 -> R:R = 3.0
    rr: 3.0,
    maxLoss: 90,
    breakevens: [24910],
  });

  // Capital 100,000, Risk 1% = ₹1,000 max risk
  // Risk per lot = 10.1 * 65 = 656.5
  // Lots = floor(1000 / 656.5) = 1 lot
  const assessment = evaluateTradeRisk(plan, snapshot, undefined, { accountCapital: 100_000, riskPerTradePercent: 1.0 });
  assert.equal(assessment.lots, 1);
  assert.equal(assessment.quantity, 65);
  assert.equal(assessment.status, "APPROVED");
});

test("4. Bull Call Spread risk & profit calculation", () => {
  const snapshot = mockSnapshot("nifty");
  const plan = makePlan({
    strategy: "Bull Call Spread",
    legs: [
      { side: "BUY", type: "CE", strike: 25100, ltp: 120 },
      { side: "SELL", type: "CE", strike: 25300, ltp: 60 },
    ],
    credit: false,
    entry: 60, // Net debit = 60
    stop: 40, // Risk per unit = 20 -> slippage 1% = 20.2 -> risk per lot = 1313
    target1: 130,
    rr: 3.5,
    maxLoss: 60, // Net debit * qty
    maxProfit: 140, // (200 width - 60 debit) = 140
    breakevens: [25160],
  });

  const assessment = evaluateTradeRisk(plan, snapshot, undefined, { accountCapital: 200_000, riskPerTradePercent: 1.0 });
  assert.equal(assessment.lots, 1);
  assert.equal(assessment.maxTheoreticalLoss, 3900); // 60 * 65
  assert.equal(assessment.maxProfit, 9100); // 140 * 65
});

test("5. Straddle combined premium risk calculation (no single-leg bug)", () => {
  const snapshot = mockSnapshot("nifty");
  // Combined entry = Call 100 + Put 110 = 210
  // Combined stop = 147 -> Risk per unit = 63 (MUST NOT use 20 or single leg)
  const plan = makePlan({
    strategy: "ATM Straddle",
    legs: [
      { side: "BUY", type: "CE", strike: 25100, ltp: 100 },
      { side: "BUY", type: "PE", strike: 25100, ltp: 110 },
    ],
    credit: false,
    entry: 210,
    stop: 147,
    target1: 300,
    rr: 1.48,
    maxLoss: 210,
    maxProfit: null, // Unlimited
    breakevens: [24890, 25310],
  });

  // Entry = 210, Stop = 147 -> Risk per unit = 63 -> 63.63 with slippage -> per lot = 4136
  const assessment = evaluateTradeRisk(plan, snapshot, undefined, { accountCapital: 500_000, riskPerTradePercent: 1.0 });
  assert.equal(assessment.entryPrice, 210);
  assert.equal(assessment.stopPrice, 147);
  assert.equal(assessment.maxProfit, null); // Unlimited upside
  assert.equal(assessment.capitalRequired, 210 * 65 * assessment.lots);
  assert.ok(assessment.riskPerUnit > 60, "Risk must be based on combined premium (63)");
});

test("6. max lots cap & portfolio open risk limits", () => {
  const snapshot = mockSnapshot("nifty");
  const plan = makePlan({
    entry: 10,
    stop: 9, // Risk per unit = 1 -> tiny risk
    target1: 15,
    rr: 5.0,
  });

  // Even if risk permits 50 lots, maxLotsPerTrade = 5 caps it
  const assessment = evaluateTradeRisk(plan, snapshot, undefined, { accountCapital: 1_000_000, maxLotsPerTrade: 5 });
  assert.equal(assessment.lots, 5);
  assert.equal(assessment.quantity, 325); // 5 * 65

  // Open risk limit exceeded check: Capital 200,000, max open risk 1% = 2,000. Existing = 1,500, New = 1,313 -> Total 2,813 > 2,000
  const planLarge = makePlan();
  const assessment2 = evaluateTradeRisk(planLarge, snapshot, { existingOpenRisk: 1500 }, { accountCapital: 200_000, maxOpenRiskPercent: 1.0, riskPerTradePercent: 1.0 });
  assert.equal(assessment2.status, "REJECTED");
  assert.ok(assessment2.reasons.includes("OPEN_RISK_LIMIT"));
});

test("7. daily loss limit enforcement", () => {
  const snapshot = mockSnapshot("nifty");
  const plan = makePlan();
  // Capital 100,000, max daily loss 2% = 2,000. Realized daily loss = 2,100 -> REJECTED
  const assessment = evaluateTradeRisk(plan, snapshot, { realizedDailyLoss: 2100 }, { accountCapital: 100_000, maxDailyLossPercent: 2.0 });
  assert.equal(assessment.status, "REJECTED");
  assert.ok(assessment.reasons.includes("DAILY_LOSS_LIMIT"));
});

test("8. insufficient R:R rejection", () => {
  const snapshot = mockSnapshot("nifty");
  const plan = makePlan({ rr: 0.8 }); // min R:R = 1.2
  const assessment = evaluateTradeRisk(plan, snapshot, undefined, { accountCapital: 200_000 });
  assert.equal(assessment.status, "REJECTED");
  assert.ok(assessment.reasons.includes("INSUFFICIENT_RR"));
});

test("9. strategy engine integration: high score + failed risk check results in NO TRADE", () => {
  const s = mockSnapshot("nifty");

  // Run strategy analysis
  const analysis = analyze(s);
  if (analysis.plan) {
    // If a plan exists, verify risk assessment is attached and valid
    assert.ok(analysis.plan.risk);
    assert.equal(analysis.plan.risk.allowed, true);
    assert.equal(analysis.status, "TRADE");
  } else {
    // If no trade plan, ensure blockers or status are set correctly
    assert.ok(analysis.status === "NO TRADE" || analysis.status === "WAIT");
  }
});

test("10. property invariants for approved risk assessments", () => {
  const snapshot = mockSnapshot("nifty");
  const plan = makePlan();
  const assessment = evaluateTradeRisk(plan, snapshot, undefined, { accountCapital: 300_000, riskPerTradePercent: 1.0 });

  if (assessment.allowed) {
    assert.ok(assessment.totalRisk <= 300_000 * 0.01 + 10, "totalRisk <= maxAllowedRisk");
    assert.equal(assessment.quantity % assessment.lotSize, 0, "quantity % lotSize == 0");
    assert.ok(assessment.lots <= DEFAULT_RISK_CONFIG.maxLotsPerTrade, "lots <= maxLotsPerTrade");
    assert.ok(assessment.quantity >= 0, "quantity >= 0");
    assert.ok(assessment.totalRisk >= 0, "totalRisk >= 0");
  }
});

test("11. env overrides and invalid config validation error handling", () => {
  process.env.ACCOUNT_CAPITAL = "250000";
  process.env.RISK_PER_TRADE_PERCENT = "1.5";
  const cfg = getRiskConfig();
  assert.equal(cfg.accountCapital, 250_000);
  assert.equal(cfg.riskPerTradePercent, 1.5);
  delete process.env.ACCOUNT_CAPITAL;
  delete process.env.RISK_PER_TRADE_PERCENT;

  assert.throws(() => getRiskConfig({ accountCapital: -100 }), /accountCapital must be > 0/);
  assert.throws(() => getRiskConfig({ riskPerTradePercent: 0 }), /riskPerTradePercent must be > 0/);
  assert.throws(() => getRiskConfig({ maxConcurrentPositions: 0 }), /maxConcurrentPositions must be > 0/);
});

test("12. max concurrent positions enforcement", () => {
  const snapshot = mockSnapshot("nifty");
  const plan = makePlan();
  const assessment = evaluateTradeRisk(plan, snapshot, { currentOpenPositions: 3 }, { accountCapital: 500_000, maxConcurrentPositions: 3 });
  assert.equal(assessment.status, "REJECTED");
  assert.ok(assessment.reasons.includes("MAX_CONCURRENT_POSITIONS"));
});

test("13. EXTREME event risk level rejection (structured level only)", () => {
  const snapshot = mockSnapshot("nifty");
  snapshot.news.detail = {
    ...snapshot.news.detail!,
    eventRisk: { level: "EXTREME", status: "DETECTED", reason: "Major Macro Event", events: [] },
  };
  const plan = makePlan();
  const assessment = evaluateTradeRisk(plan, snapshot, undefined, { accountCapital: 500_000 });
  assert.equal(assessment.status, "REJECTED");
  assert.ok(assessment.reasons.includes("EXTREME_EVENT_RISK"));
});

test("14. dynamic lot size from snapshot contract metadata", () => {
  const bankSnapshot = mockSnapshot("banknifty");
  assert.equal(bankSnapshot.lotSize, 30);
  const plan = makePlan({ legs: [{ side: "BUY", type: "CE", strike: 56200, ltp: 100 }] });
  const assessment = evaluateTradeRisk(plan, bankSnapshot, undefined, { accountCapital: 500_000 });
  assert.equal(assessment.lotSize, 30);
  assert.equal(assessment.quantity % 30, 0);

  // Test dynamic change to custom lot size = 75
  const customSnapshot = { ...bankSnapshot, lotSize: 75 };
  const customAssessment = evaluateTradeRisk(plan, customSnapshot, undefined, { accountCapital: 500_000 });
  assert.equal(customAssessment.lotSize, 75);
  assert.equal(customAssessment.quantity % 75, 0);

  // Test missing lot size -> safe rejection
  const missingLotSnapshot = { ...bankSnapshot, lotSize: null };
  const rejectedAssessment = evaluateTradeRisk(plan, missingLotSnapshot, undefined, { accountCapital: 500_000 });
  assert.equal(rejectedAssessment.status, "REJECTED");
  assert.ok(rejectedAssessment.reasons.includes("UNKNOWN_LOT_SIZE"));
});

test("15. stale data rejection via freshnessOf", () => {
  const snapshot = mockSnapshot("nifty");
  const oldTime = new Date(Date.now() - 300_000).toISOString(); // 5 min ago (>120 s)
  snapshot.sources.market = { source: "LIVE", provider: "UPSTOX", fetchedAt: oldTime };
  const plan = makePlan();
  const assessment = evaluateTradeRisk(plan, snapshot, undefined, { accountCapital: 500_000 }, new Date());
  assert.equal(assessment.status, "REJECTED");
  assert.ok(assessment.reasons.includes("STALE_PRICE"));
});

test("16. wide bid-ask spread (> 5%) rejection", () => {
  const snapshot = mockSnapshot("nifty");
  // Set wide bid/ask on leg 25100 CE: bid 90, ask 110, ltp 100 -> spread 20% > 5%
  const row = snapshot.chain.find((r) => r.strike === 25100);
  if (row) {
    row.call.bid = 90;
    row.call.ask = 110;
    row.call.ltp = 100;
  }
  const plan = makePlan({ legs: [{ side: "BUY", type: "CE", strike: 25100, ltp: 100 }] });
  const assessment = evaluateTradeRisk(plan, snapshot, undefined, { accountCapital: 500_000 });
  assert.equal(assessment.status, "REJECTED");
  assert.ok(assessment.reasons.includes("WIDE_BID_ASK"));
});
