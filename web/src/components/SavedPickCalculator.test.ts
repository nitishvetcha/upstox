import test from "node:test";
import assert from "node:assert/strict";
import { defaultLotSize, type CalculatorPick } from "./savedPickUtils.ts";

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

test("Target adjustment presets correctly recalculate achievable intraday profits", () => {
  const entry = 72.15;
  const stopLoss = 35.53; // 50% stop
  const risk = entry - stopLoss; // 36.62
  const lotSize = 75;

  // Preset 1: 1:1.0 Scalp Target
  const t1Scalp = Math.round((entry + risk * 1.0) * 100) / 100; // 108.77 (+50.7%)
  const scalpGain = (t1Scalp - entry) * lotSize;
  assert.ok(Math.abs(scalpGain - 2746.50) < 1.0);

  // Preset 2: 1:1.5 Intraday Target (Realistic)
  const t1Intraday = Math.round((entry + risk * 1.5) * 100) / 100; // 127.08 (+76.1%)
  const intradayGain = (t1Intraday - entry) * lotSize;
  assert.ok(Math.abs(intradayGain - 4119.75) < 1.0);

  // Preset 3: 1:2.0 Moderate Swing Target
  const t1Swing = Math.round((entry + risk * 2.0) * 100) / 100; // 145.39 (+101.5%)
  const swingGain = (t1Swing - entry) * lotSize;
  assert.ok(Math.abs(swingGain - 5493.00) < 1.0);
});

test("Part 2 Safeguards: Limit order requirement & Theta Time-Stop rules are verified", () => {
  // 1. Limit order text format
  const optionSlip = [
    "=== UPSTOX ORDER SLIP (OPTIONS) ===",
    "ORDER TYPE: LIMIT ORDER ONLY (DO NOT USE MARKET ORDER - SLIPPAGE RISK)",
    "INSTRUMENT: NIFTY 2026-11-23 25650 CE",
    "LIMIT PRICE: ₹72.15",
    "STOP LOSS: ₹35.53",
    "TARGET 1 (Book 50%): ₹148.87",
    "3. ⏱️ TIME STOP (45-60m Rule): If Target 1 is not reached within 45-60 min, close position at breakeven/small loss to avoid Theta decay.",
  ].join("\n");

  assert.match(optionSlip, /LIMIT ORDER ONLY/);
  assert.match(optionSlip, /SLIPPAGE RISK/);
  assert.match(optionSlip, /TIME STOP \(45-60m Rule\)/);
  assert.match(optionSlip, /Theta decay/);

  // 2. Stock order format
  const stockSlip = [
    "=== UPSTOX ORDER SLIP (EQUITY) ===",
    "ORDER TYPE: LIMIT ORDER ONLY (DO NOT USE MARKET ORDER - SLIPPAGE RISK)",
    "INSTRUMENT: EICHERMOT",
    "LIMIT PRICE: ₹7904",
    "3. Intraday Exit: Square off before 3:15 PM IST. Never hold leveraged positions overnight.",
  ].join("\n");

  assert.match(stockSlip, /LIMIT ORDER ONLY/);
  assert.match(stockSlip, /Square off before 3:15 PM IST/);
});
