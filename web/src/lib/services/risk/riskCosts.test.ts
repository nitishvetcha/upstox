// Transaction costs, adverse slippage on entry and exit, and stop-gap allowance in trade risk. Offline, deterministic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateTradeRisk } from "./riskService.ts";
import { getRiskConfig, DEFAULT_RISK_CONFIG, validateRiskConfig } from "./riskConfig.ts";
import { costsFor, DEFAULT_TRANSACTION_COSTS, BASIC_PLAN_COSTS, PLUS_PLAN_COSTS } from "../transactionCosts.ts";
import { mockSnapshot } from "../mock.ts";
import type { Snapshot, TradePlan } from "../../types.ts";

const NOW = new Date("2026-10-05T07:00:00Z");
function snap(): Snapshot {
  const s = structuredClone(mockSnapshot("nifty", NOW));
  for (const k of Object.keys(s.sources) as (keyof Snapshot["sources"])[]) s.sources[k] = { ...s.sources[k], source: "LIVE", provider: "UPSTOX", fetchedAt: NOW.toISOString() };
  s.lotSize = 75;
  return s;
}
const plan = (o: Partial<TradePlan> = {}): TradePlan => ({
  strategy: "Long Call", legs: [], credit: false, entry: 10, entryZone: [9.9, 10.1], stop: 8, target1: 15, target2: 20,
  rr: 2.5, maxLoss: 10, maxProfit: null, breakevens: [], score: 70, rejected: null, ...o,
} as TradePlan);
const cfg = (o: Record<string, unknown> = {}) => ({ accountCapital: 100_000, ...o });

test("TC-1. the shared charge model: a 75-unit BUY at 10 and SELL at 8 match hand-computed statutory charges", () => {
  // Basic plan: Brokerage ₹20 × 2 = ₹40; STT 0.15% on sell turnover 600 = ₹0.90; exchange 0.03553% on turnover 1350 = ₹0.48; stamp 0.003% on buy 750 = ₹0.02.
  const basic = costsFor(
    [{ side: "BUY", price: 10, quantity: 75 }, { side: "SELL", price: 8, quantity: 75 }],
    BASIC_PLAN_COSTS,
  );
  assert.equal(basic.brokerage, 40);
  assert.equal(basic.stt, 0.9);
  assert.equal(basic.exchangeCharges, 0.48);
  assert.equal(basic.stampDuty, 0.02);
  assert.equal(basic.gst, Math.round((40 + 1350 * 0.0003553) * 0.18 * 100) / 100, "GST on brokerage + exchange/IPFT (Basic)");

  // Default / Plus research fallback: Brokerage ₹30 × 2 = ₹60; STT ₹0.90; exchange ₹0.48; stamp ₹0.02.
  const plus = costsFor(
    [{ side: "BUY", price: 10, quantity: 75 }, { side: "SELL", price: 8, quantity: 75 }],
    DEFAULT_TRANSACTION_COSTS,
  );
  assert.equal(plus.brokerage, 60);
  assert.equal(plus.stt, 0.9);
  assert.equal(plus.exchangeCharges, 0.48);
  assert.equal(plus.stampDuty, 0.02);
  assert.equal(plus.gst, Math.round((60 + 1350 * 0.0003553) * 0.18 * 100) / 100, "GST on brokerage + exchange/IPFT (Plus)");
});

test("TC-2. fixed brokerage does not scale with lots: 1 lot and 5 lots carry the same fixed charge", () => {
  // Conservative fallback (Plus rate): 2 orders * ₹30 = ₹60 + 18% GST = ₹70.80 fixed charge
  const a = evaluateTradeRisk(plan(), snap(), undefined, cfg({ accountCapital: 40_000 }), NOW); // budget 400 − 70.8 → 1 lot
  const b = evaluateTradeRisk(plan(), snap(), undefined, cfg({ accountCapital: 100_000 }), NOW); // 5 lots (lot cap)
  assert.equal(a.fixedCostsInr, b.fixedCostsInr);
  assert.equal(a.fixedCostsInr, 70.8);
  assert.equal(a.lots, 1);
  assert.equal(b.lots, 5);
  // Total risk = fixed + lots × net per lot (within rounding), so the fixed part is paid once per trade.
  assert.ok(Math.abs(b.totalRisk - (70.8 + b.lots * (b.netRiskPerLot ?? 0))) <= 1);

  // Under Basic plan config: fixed charge is ₹47.20
  const basicRisk = evaluateTradeRisk(plan(), snap(), undefined, cfg({ accountCapital: 100_000, costs: BASIC_PLAN_COSTS }), NOW);
  assert.equal(basicRisk.fixedCostsInr, 47.2);
});

test("TC-3. adverse slippage on entry (buy above) and on exit (sell below); credit side mirrored", () => {
  const debit = evaluateTradeRisk(plan(), snap(), undefined, cfg(), NOW);
  assert.equal(debit.entryFill, 10.1);
  assert.equal(debit.targetFill, 14.85);
  const credit = evaluateTradeRisk(plan({ credit: true, entry: 5, stop: 6, target1: 2, maxLoss: 1, rr: 3 }), snap(), undefined, cfg(), NOW);
  assert.equal(credit.entryFill, 4.95, "credit: receive less");
  assert.equal(credit.targetFill, 2.02, "credit: buy back a little dearer");
});

test("TC-4. the stop-gap allowance worsens the stop fill; zero gap leaves only the exit slippage", () => {
  const withGap = evaluateTradeRisk(plan(), snap(), undefined, cfg(), NOW);
  assert.equal(withGap.worstStopFill, 7.76, "8 × (1 − 1% − 2%)");
  const noGap = evaluateTradeRisk(plan(), snap(), undefined, cfg({ stopGapPercent: 0 }), NOW);
  assert.equal(noGap.worstStopFill, 7.92, "8 × (1 − 1%)");
  assert.ok((noGap.netRiskPerLot ?? 0) < (withGap.netRiskPerLot ?? 0), "a smaller gap allowance gives a smaller worst-case risk");
});

test("TC-5. the net reward-to-risk check blocks a trade whose gross ratio passes but whose net ratio does not", () => {
  // Gross 1.5 : 1 clears the 1.2 minimum. After 1% slippage, a 2% gap and charges it does not.
  const r = evaluateTradeRisk(plan({ entry: 10, stop: 9, target1: 11.5, rr: 1.5 }), snap(), undefined, cfg(), NOW);
  assert.equal(r.allowed, false);
  assert.ok(r.reasons.includes("INSUFFICIENT_RR"));
  assert.ok(r.humanReasons.some((h) => /Net risk\/reward after slippage and charges/.test(h)));
});

test("TC-6. assumptions are stated on every assessment, and a zero brokerage rate is flagged as understated", () => {
  const r = evaluateTradeRisk(plan(), snap(), undefined, cfg({ costs: { ...DEFAULT_TRANSACTION_COSTS, brokeragePerOrder: 0 } }), NOW);
  assert.ok((r.assumptions ?? []).length >= 3);
  assert.ok((r.assumptions ?? []).some((a) => /Stop gap allowance/.test(a)));
  assert.ok(r.warnings.some((w) => /Brokerage is configured as ₹0/.test(w)));
});

test("TC-7. configuration from the environment overrides the defaults; invalid values are rejected", () => {
  const keys = ["COST_BROKERAGE_PER_ORDER", "RISK_STOP_GAP_PERCENT", "RISK_EXIT_SLIPPAGE_PERCENT"] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    process.env.COST_BROKERAGE_PER_ORDER = "0";
    process.env.RISK_STOP_GAP_PERCENT = "3.5";
    process.env.RISK_EXIT_SLIPPAGE_PERCENT = "0.5";
    const c = getRiskConfig();
    assert.equal(c.costs.brokeragePerOrder, 0);
    assert.equal(c.stopGapPercent, 3.5);
    assert.equal(c.exitSlippagePercent, 0.5);
    assert.equal(c.entrySlippagePercent, DEFAULT_RISK_CONFIG.optionSlippagePercent, "entry falls back to the default");
    process.env.RISK_STOP_GAP_PERCENT = "-1";
    assert.throws(() => getRiskConfig(), /stopGapPercent/);
  } finally {
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
});

test("TC-8. validateRiskConfig rejects a negative charge rate", () => {
  assert.throws(() => validateRiskConfig({ ...DEFAULT_RISK_CONFIG, costs: { ...DEFAULT_RISK_CONFIG.costs, stampDutyRate: -0.1 } }), /stampDutyRate/);
});

test("TC-9. position-size-zero rejection when 1 lot exceeds the 1% risk budget", () => {
  // Account capital: 10,000 INR -> 1% risk budget = 100 INR.
  // Fixed charges (70.80) + 1 lot net risk (~200) = ~270.80 > 100 INR.
  // Engine must reject with ZERO_LOTS and allowed = false.
  const r = evaluateTradeRisk(plan(), snap(), undefined, cfg({ accountCapital: 10_000 }), NOW);
  assert.equal(r.allowed, false);
  assert.equal(r.lots, 0);
  assert.equal(r.quantity, 0);
  assert.equal(r.totalRisk, 0);
  assert.ok(r.reasons.includes("ZERO_LOTS"));
  assert.ok(r.humanReasons.some((h) => /Position size rounds to 0 lots/.test(h)));
});

test("TC-10. 1% per-trade risk limit is strictly preserved: total risk never exceeds 1% of capital", () => {
  for (const cap of [50_000, 100_000, 250_000, 1_000_000]) {
    const r = evaluateTradeRisk(plan(), snap(), undefined, cfg({ accountCapital: cap }), NOW);
    const maxAllowedRisk = cap * 0.01;
    assert.ok(r.totalRisk <= maxAllowedRisk, `Total risk ${r.totalRisk} exceeds 1% limit (${maxAllowedRisk}) for capital ${cap}`);
  }
});
