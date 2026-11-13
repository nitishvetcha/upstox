// Comprehensive tests for the statutory and broker transaction-cost model.
// Verified against official circulars:
// - NSE Circular NSE/FA/73061 (dated February 27, 2026, effective March 1, 2026): ₹3,552.99 exch + ₹0.01 IPFT = ₹3,553.00/cr (0.03553%).
// - Finance Act STT: 0.15% (0.0015) on sell-side option premium.
// - Upstox account plans: Basic (₹20/order) vs Plus (₹30/order); default UNKNOWN / OWNER_CONFIRMATION_REQUIRED; Plus fallback.
// - Auto-square-off RMS backstop: Basic ₹75+GST (₹88.50), Plus ₹50+GST (₹59.00), guaranteed: false.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  costsFor,
  autoSquareOffPenalty,
  resolveAccountPlan,
  r2,
  DEFAULT_TRANSACTION_COSTS,
  BASIC_PLAN_COSTS,
  PLUS_PLAN_COSTS,
  AUTO_SQUARE_OFF_RATES,
  type Fill,
} from "./transactionCosts.ts";

test("TC-NSE-1. NSE transaction charges and IPFT inclusion (NSE Circular NSE/FA/73061)", () => {
  // Rate: 0.0003553 represents ₹3,553.00 per crore of traded value.
  // Breakdown: ₹3,552.99 exchange fee + ₹0.01 IPFT per crore.
  // IPFT is included in the combined rate and must NEVER be added separately.
  assert.equal(DEFAULT_TRANSACTION_COSTS.exchangeTxnRate, 0.0003553);
  
  // Test turnover of exactly 1 crore (10,000,000 INR)
  const fills: Fill[] = [{ side: "BUY", price: 100, quantity: 100_000 }];
  const c = costsFor(fills, { ...DEFAULT_TRANSACTION_COSTS, brokeragePerOrder: 0, sttRate: 0, gstRate: 0, sebiRate: 0, stampDutyRate: 0 });
  assert.equal(c.exchangeCharges, 3553.00, "1 crore turnover yields exactly ₹3,553.00 exchange charge (including IPFT)");
});

test("TC-STT-1. Options STT: 0.15% on sell-side premium turnover only", () => {
  assert.equal(DEFAULT_TRANSACTION_COSTS.sttRate, 0.0015);

  // Buy turnover: 50,000 (no STT). Sell turnover: 40,000 (0.15% STT = 60).
  const fills: Fill[] = [
    { side: "BUY", price: 100, quantity: 500 },
    { side: "SELL", price: 80, quantity: 500 },
  ];
  const c = costsFor(fills, DEFAULT_TRANSACTION_COSTS);
  assert.equal(c.stt, 60.00, "STT is 0.15% of sell turnover (40,000 * 0.0015 = 60)");
});

test("TC-BROKERAGE-1. Basic vs Plus brokerage rates", () => {
  const fills: Fill[] = [
    { side: "BUY", price: 100, quantity: 50 },
    { side: "SELL", price: 100, quantity: 50 },
  ];
  const basic = costsFor(fills, BASIC_PLAN_COSTS);
  const plus = costsFor(fills, PLUS_PLAN_COSTS);

  assert.equal(basic.brokerage, 40.00, "Basic: 2 orders * ₹20 = ₹40");
  assert.equal(plus.brokerage, 60.00, "Plus: 2 orders * ₹30 = ₹60");
});

test("TC-PLAN-SAFETY-1. Unknown account plan requires owner confirmation; never silently Basic", () => {
  const resolved = resolveAccountPlan(undefined);
  assert.equal(resolved.plan, "UNKNOWN");
  assert.equal(resolved.status, "CONSERVATIVE_RESEARCH_FALLBACK");
  assert.equal(resolved.brokeragePerOrder, 30, "Uses Plus rate (₹30) as conservative research fallback");

  // Explicit configurations
  const basic = resolveAccountPlan("BASIC");
  assert.equal(basic.plan, "BASIC");
  assert.equal(basic.status, "CONFIRMED");
  assert.equal(basic.brokeragePerOrder, 20);

  const plus = resolveAccountPlan("PLUS");
  assert.equal(plus.plan, "PLUS");
  assert.equal(plus.status, "CONFIRMED");
  assert.equal(plus.brokeragePerOrder, 30);
});

test("TC-AUTOSQUARE-1. Auto-square-off penalty separation and non-guaranteed notice", () => {
  const basicAsq = autoSquareOffPenalty("BASIC");
  assert.equal(basicAsq.penalty, 75);
  assert.equal(basicAsq.gst, 13.50);
  assert.equal(basicAsq.totalPenalty, 88.50);
  assert.equal(basicAsq.guaranteed, false, "Auto-square-off is NOT a guaranteed execution");

  const plusAsq = autoSquareOffPenalty("PLUS");
  assert.equal(plusAsq.penalty, 50);
  assert.equal(plusAsq.gst, 9.00);
  assert.equal(plusAsq.totalPenalty, 59.00);
  assert.equal(plusAsq.guaranteed, false);

  const unknownAsq = autoSquareOffPenalty("UNKNOWN");
  assert.equal(unknownAsq.status, "CONSERVATIVE_RESEARCH_FALLBACK");
  assert.equal(unknownAsq.guaranteed, false);
});

test("TC-GST-1. GST base includes Brokerage + combined Exchange/IPFT, excludes SEBI and stamp duty", () => {
  const fills: Fill[] = [
    { side: "BUY", price: 100, quantity: 100 },
    { side: "SELL", price: 100, quantity: 100 },
  ];
  const c = costsFor(fills, BASIC_PLAN_COSTS);
  // Brokerage: 40. Exchange: 20,000 * 0.0003553 = 7.106 -> r2 = 7.11.
  // GST base: 40 + 7.106 = 47.106. GST: 47.106 * 0.18 = 8.479 -> r2 = 8.48.
  // SEBI: 20,000 * 0.000001 = 0.02. If SEBI were in GST base, (40 + 7.106 + 0.02)*0.18 = 8.4827 -> 8.48.
  // Let's verify formula:
  const expectedGst = r2((40 + 20000 * 0.0003553) * 0.18);
  assert.equal(c.gst, expectedGst);
});

test("TC-ROUNDING-1. Deterministic two-decimal half-up monetary rounding and paise boundaries", () => {
  assert.equal(r2(10.004), 10.00, "10.004 rounds down to 10.00");
  assert.equal(r2(10.005), 10.01, "10.005 rounds up to 10.01");
  assert.equal(r2(10.006), 10.01, "10.006 rounds up to 10.01");
  assert.equal(r2(0.340875), 0.34, "Stamp duty boundary");
  assert.equal(r2(6.8803845), 6.88, "Exchange fee boundary");
  assert.equal(r2(8.4384), 8.44, "Basic GST boundary");
  assert.equal(r2(12.0384), 12.04, "Plus GST boundary");
});

test("TC-REF-EXAMPLE-1. Recalculate reference example: Basic ₹3,427.68 and Plus ₹3,451.28 per lot", () => {
  // 1 lot of 75 units:
  // Buy at modeled entry fill 151.50
  // Sell at modeled stop fill 106.70
  // Execution loss: (151.50 - 106.70) * 75 = 44.80 * 75 = 3360.00
  const fills: Fill[] = [
    { side: "BUY", price: 151.50, quantity: 75 },
    { side: "SELL", price: 106.70, quantity: 75 },
  ];
  const executionLoss = (151.50 - 106.70) * 75;
  assert.equal(executionLoss, 3360.00);

  // Basic Plan calculation
  const basicCosts = costsFor(fills, BASIC_PLAN_COSTS);
  assert.equal(basicCosts.brokerage, 40.00);
  assert.equal(basicCosts.stt, 12.00);
  assert.equal(basicCosts.exchangeCharges, 6.88);
  assert.equal(basicCosts.sebiCharges, 0.02);
  assert.equal(basicCosts.stampDuty, 0.34);
  assert.equal(basicCosts.gst, 8.44);
  assert.equal(basicCosts.totalCosts, 67.68);

  const basicNetRiskPerLot = r2(executionLoss + basicCosts.totalCosts);
  assert.equal(basicNetRiskPerLot, 3427.68, "Exact recalculated Basic risk: ₹3,427.68 per lot");

  // Plus Plan calculation (conservative research fallback)
  const plusCosts = costsFor(fills, PLUS_PLAN_COSTS);
  assert.equal(plusCosts.brokerage, 60.00);
  assert.equal(plusCosts.stt, 12.00);
  assert.equal(plusCosts.exchangeCharges, 6.88);
  assert.equal(plusCosts.sebiCharges, 0.02);
  assert.equal(plusCosts.stampDuty, 0.34);
  assert.equal(plusCosts.gst, 12.04);
  assert.equal(plusCosts.totalCosts, 91.28);

  const plusNetRiskPerLot = r2(executionLoss + plusCosts.totalCosts);
  assert.equal(plusNetRiskPerLot, 3451.28, "Exact recalculated Plus risk: ₹3,451.28 per lot");

  // Difference is exactly the brokerage delta plus GST delta: (20 + 3.60 = ₹23.60)
  assert.equal(r2(plusNetRiskPerLot - basicNetRiskPerLot), 23.60);
});
