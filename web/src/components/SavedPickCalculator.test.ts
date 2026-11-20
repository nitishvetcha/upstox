import test from "node:test";
import assert from "node:assert/strict";
import { defaultLotSize, type CalculatorPick } from "./SavedPickCalculator.tsx";

test("defaultLotSize correctly identifies exchange standard multipliers", () => {
  assert.equal(defaultLotSize("NIFTY 2026-11-23 25650 CE", "INDEX_OPTION"), 75);
  assert.equal(defaultLotSize("BANKNIFTY 2026-11-27 52000 PE", "INDEX_OPTION"), 15);
  assert.equal(defaultLotSize("FINNIFTY 2026-11-25 24000 CE", "INDEX_OPTION"), 25);
  assert.equal(defaultLotSize("MIDCPNIFTY 2026-11-24 13000 CE", "INDEX_OPTION"), 50);
  assert.equal(defaultLotSize("SENSEX 2026-11-28 84000 CE", "INDEX_OPTION"), 10);
  assert.equal(defaultLotSize("BANKEX 2026-11-28 58000 CE", "INDEX_OPTION"), 15);
  assert.equal(defaultLotSize("EICHERMOT", "STOCK"), 1);
});

test("Math calculations for NIFTY 25650 CE from user screenshot", () => {
  const entry = 72.15;
  const stopLoss = 35.53;
  const target1 = 148.87;
  const target2 = 217.07;
  const lotSize = 75;
  const lots = 1;
  const totalQty = lots * lotSize;

  // 1. Capital required
  const capitalRequired = entry * totalQty;
  assert.equal(capitalRequired, 5411.25);

  // 2. Max loss at Stop Loss
  const riskPerUnit = entry - stopLoss;
  assert.ok(Math.abs(riskPerUnit - 36.62) < 0.001);
  const totalMaxRisk = riskPerUnit * totalQty;
  assert.ok(Math.abs(totalMaxRisk - 2746.50) < 0.01);
  const stopLossPct = (riskPerUnit / entry) * 100;
  assert.ok(Math.abs(stopLossPct - 50.76) < 0.1);

  // 3. Profit at Target 1
  const gainT1PerUnit = target1 - entry;
  assert.ok(Math.abs(gainT1PerUnit - 76.72) < 0.001);
  const totalGainT1 = gainT1PerUnit * totalQty;
  assert.ok(Math.abs(totalGainT1 - 5754.00) < 0.01);
  const rr1 = gainT1PerUnit / riskPerUnit;
  assert.ok(Math.abs(rr1 - 2.10) < 0.01);

  // 4. Profit at Target 2
  const gainT2PerUnit = target2 - entry;
  assert.ok(Math.abs(gainT2PerUnit - 144.92) < 0.001);
  const totalGainT2 = gainT2PerUnit * totalQty;
  assert.ok(Math.abs(totalGainT2 - 10869.00) < 0.01);
  const rr2 = gainT2PerUnit / riskPerUnit;
  assert.ok(Math.abs(rr2 - 3.96) < 0.01);

  // 5. Breakeven Win Rate formula: 1 / (1 + RR)
  const breakevenWinRate = (1 / (1 + rr1)) * 100;
  assert.ok(Math.abs(breakevenWinRate - 32.3) < 0.2);

  // 6. Live P&L test if price moves to 100
  const simulatedLtp = 100;
  const livePnl = (simulatedLtp - entry) * totalQty;
  assert.ok(Math.abs(livePnl - 2088.75) < 0.01);
});
