// Independent known-answer tests for position sizing and risk gating (evaluateTradeRisk).
// Costs, slippage and stop gap are set to zero so expected values follow from the sizing definitions alone.
// Limits are passed explicitly and the RISK_* / COST_* / ACCOUNT_CAPITAL environment is cleared, so no
// environment value can change a result. Risk parameters are not modified: these are test inputs only.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { evaluateTradeRisk } from "./riskService.ts";
import type { RiskConfig } from "./riskConfig.ts";
import type { TradePlan } from "../../types.ts";

const ENV_KEYS = Object.keys(process.env).filter((k) => /^(RISK_|COST_|MAX_|ACCOUNT_CAPITAL)/.test(k));
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const ZERO_COSTS = { version: "test", brokeragePerOrder: 0, sttRate: 0, exchangeTxnRate: 0, gstRate: 0, sebiRate: 0, stampDutyRate: 0, source: "test-zero" };
const CFG: Partial<RiskConfig> = {
  accountCapital: 1_000_000,
  riskPerTradePercent: 1,          // 10,000 INR max risk per trade
  maxDailyLossPercent: 3,
  maxOpenRiskPercent: 5,
  maxPositionValuePercent: 10,     // 100,000 INR max capital per position
  maxConcurrentPositions: 5,
  minRiskReward: 1.5,
  maxLotsPerTrade: 100,
  optionSlippagePercent: 0,
  entrySlippagePercent: 0,
  exitSlippagePercent: 0,
  stopGapPercent: 0,
  costs: ZERO_COSTS,
};

const plan = (over: Partial<TradePlan> = {}): TradePlan => ({
  strategy: "LONG_CALL", legs: [], credit: false, entry: 100, entryZone: [99, 101], stop: 90, target1: 120, target2: 130,
  rr: 2, maxLoss: null, maxProfit: null, breakevens: [], score: 0, rejected: null, ...over,
} as unknown as TradePlan);
// Fixture: only the fields the sizing path reads. News is neutral (no event risk).
const LIVE_SRC = { source: "LIVE", provider: "UPSTOX", fetchedAt: "2026-11-11T05:00:00.000Z", lastTradeTime: "2026-11-11T05:00:00.000Z" };
const snap = (lotSize: number | null) => ({
  index: "nifty", lotSize, spot: 100, prevClose: 100, expiry: "2026-11-17", strikeStep: 50, ivPercentile: null, indicators: null, breadth: null,
  sources: { market: LIVE_SRC, optionChain: LIVE_SRC, technical: LIVE_SRC, news: LIVE_SRC, breadth: LIVE_SRC },
  news: { status: "LIVE", detail: { eventRisk: null } },
} as never);
const run = (p: TradePlan, lotSize: number | null, cfg: Partial<RiskConfig> = CFG) =>
  evaluateTradeRisk(p, snap(lotSize), undefined, cfg, new Date("2026-11-11T05:00:00Z"));

// Worked example: entry 100, stop 90 → risk 10 per unit. Lot 50 → risk 500 per lot.
// Risk budget 10,000 → lotsByRisk = 20. Capital per lot 100×50 = 5,000; position cap 100,000 → lotsByCapital = 20.
// maxLotsPerTrade 100 → lots = 20, quantity = 1,000, total risk = 10,000.
test("sizing: risk and capital both allow 20 lots of 50 (hand-derived)", () => {
  const r = run(plan(), 50);
  assert.equal(r.lots, 20);
  assert.equal(r.quantity, 1000);
  assert.equal(r.totalRisk, 10000);
  assert.equal(r.capitalRequired, 100000);
  assert.equal(r.allowed, true);
});

// Same trade, position cap 5% = 50,000 → lotsByCapital = floor(50,000 / 5,000) = 10 → lots 10.
test("sizing: the capital limit binds when it is tighter than the risk limit", () => {
  const r = run(plan(), 50, { ...CFG, maxPositionValuePercent: 5 });
  assert.equal(r.lots, 10);
  assert.equal(r.quantity, 500);
});

// Hard lot cap 3 overrides both other limits (20 and 20) → lots 3.
test("sizing: maxLotsPerTrade is a hard cap", () => {
  const r = run(plan(), 50, { ...CFG, maxLotsPerTrade: 3 });
  assert.equal(r.lots, 3);
});

// Risk per trade 0.1% = 1,000 INR budget → floor(1,000 / 500) = 2 lots.
test("sizing: floor, not round, on the risk budget (1,000 / 500 = 2 lots)", () => {
  const r = run(plan(), 50, { ...CFG, riskPerTradePercent: 0.1 });
  assert.equal(r.lots, 2);
});

// Risk budget 1,200 with 500 risk per lot → floor(2.4) = 2 lots, not 3 (a conservative floor).
test("sizing: 1,200 budget over 500 per lot gives 2 lots, never a fractional or rounded-up lot", () => {
  const r = run(plan(), 50, { ...CFG, riskPerTradePercent: 0.12 });
  assert.equal(r.lots, 2);
});

test("risk gate: unknown lot size is rejected (UNKNOWN_LOT_SIZE) and not allowed", () => {
  const r = run(plan(), null);
  assert.ok(r.reasons.includes("UNKNOWN_LOT_SIZE"));
  assert.equal(r.allowed, false);
});

test("risk gate: a stop above entry for a debit trade gives INVALID_STOP and zero lots", () => {
  const r = run(plan({ stop: 110 }), 50);
  assert.ok(r.reasons.includes("INVALID_STOP"));
  assert.equal(r.lots, 0);
  assert.equal(r.allowed, false);
});

test("risk gate: a non-finite entry fails closed with INVALID_ENTRY and zero lots (no exception)", () => {
  const r = run(plan({ entry: Number.NaN }), 50);
  assert.ok(r.reasons.includes("INVALID_ENTRY"));
  assert.equal(r.lots, 0);
  assert.equal(r.allowed, false);
});

test("risk gate: a non-finite target is rejected", () => {
  const r = run(plan({ target1: Number.POSITIVE_INFINITY }), 50);
  assert.ok(r.reasons.includes("INVALID_TARGET"));
  assert.equal(r.allowed, false);
});

// Credit trade: entry 50 (premium received), stop 60 → risk 10 per unit against a 60 buy-back. Lot 50 → 500 per lot.
test("credit trade: risk is stop minus entry, sized the same way (hand-derived 20 lots)", () => {
  const r = run(plan({ credit: true, entry: 50, stop: 60, target1: 40, maxLoss: 10 }), 50);
  assert.equal(r.lots, 20);
});
