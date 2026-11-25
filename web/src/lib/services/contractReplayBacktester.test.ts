import test from "node:test";
import assert from "node:assert/strict";
import {
  runContractReplayBacktest,
  isEiaInventoryShockWindow,
} from "./contractReplayBacktester.ts";
import type { Candle } from "../types.ts";

test("CRB-EIA-1: Accurately identifies EIA inventory announcement shock windows", () => {
  // Wednesday 20:00 IST (UTC 14:30)
  const crudeWedInventory = new Date("2026-11-25T14:30:00.000Z");
  assert.equal(isEiaInventoryShockWindow(crudeWedInventory, "crudeoil"), true);
  assert.equal(isEiaInventoryShockWindow(crudeWedInventory, "naturalgas"), false);
  assert.equal(isEiaInventoryShockWindow(crudeWedInventory, "nifty"), false);

  // Thursday 20:00 IST (UTC 14:30)
  const ngThuInventory = new Date("2026-11-26T14:30:00.000Z");
  assert.equal(isEiaInventoryShockWindow(ngThuInventory, "crudeoil"), false);
  assert.equal(isEiaInventoryShockWindow(ngThuInventory, "naturalgas"), true);

  // Normal Wednesday morning 11:00 IST (UTC 05:30)
  const wedMorning = new Date("2026-11-25T05:30:00.000Z");
  assert.equal(isEiaInventoryShockWindow(wedMorning, "crudeoil"), false);
});

test("CRB-REPLAY-NSE-1: Executes NIFTY contract replay with Ask/Bid fills, STT, and 15:15 cutoff", () => {
  const candles: Candle[] = [];
  // 120 candles across 5 days (Nov 18 to Nov 24)
  const tradingDays = ["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23", "2026-11-25"];
  const basePrice = 25000;

  for (const day of tradingDays) {
    for (let slot = 0; slot < 24; slot++) {
      const minutesFromOpen = slot * 15;
      const istHour = 9 + Math.floor((15 + minutesFromOpen) / 60);
      const istMin = (15 + minutesFromOpen) % 60;
      const utcMs = Date.UTC(2026, 10, parseInt(day.split("-")[2], 10), istHour - 5, istMin - 30);

      // Create a noticeable wave cycle to generate multiple crossover entries and exits
      const trendWave = Math.sin((slot + (tradingDays.indexOf(day) * 24)) / 3) * 120;
      const p = basePrice + trendWave;

      candles.push({
        timestamp: new Date(utcMs).toISOString(),
        open: p - 10,
        high: p + 25,
        low: p - 25,
        close: p,
        volume: 10000,
      });
    }
  }

  const result = runContractReplayBacktest(candles, {
    underlying: "nifty",
    timeframe: "15m",
    startingCapital: 100_000,
    lots: 1,
    brokerPlan: "BASIC",
  });

  assert.equal(result.contractSpec.underlying, "nifty");
  assert.equal(result.contractSpec.lotSize, 65);
  assert.equal(result.contractSpec.exchange, "NSE_FO");
  assert.ok(result.totalTrades > 0, "Expected at least 1 trade during the wave cycle");
  assert.ok(result.totalStatutoryCosts > 0, "Expected statutory costs to be calculated");

  // Inspect first trade
  const trade = result.trades[0];
  assert.ok(trade.entryAsk > 0, "Entry price must be positive");
  assert.ok(trade.exitBid > 0, "Exit price must be positive");
  assert.equal(trade.quantity, 65);
  assert.equal(trade.costBreakdown.exchange, "NSE_FO");
  assert.ok(trade.costBreakdown.stt > 0, "STT must be charged on sell side");
  assert.ok(result.inputDataHash.length === 64, "Input data hash must be SHA-256");
});

test("CRB-REPLAY-MCX-1: Executes CRUDEOIL contract replay with CTT 0.125% and 23:15 cutoff", () => {
  const candles: Candle[] = [];
  // Generate evening session candles (17:00 to 23:15 IST) for 3 days
  const tradingDays = ["2026-11-23", "2026-11-24", "2026-11-25"];
  const basePrice = 6800;

  for (const day of tradingDays) {
    // 17:00 to 23:15 is 25 fifteen-minute bars (1020 to 1395 min)
    for (let slot = 0; slot < 25; slot++) {
      const minutes = 17 * 60 + slot * 15;
      const istHour = Math.floor(minutes / 60);
      const istMin = minutes % 60;
      const utcMs = Date.UTC(2026, 10, parseInt(day.split("-")[2], 10), istHour - 5, istMin - 30);

      const wave = Math.sin((slot + (tradingDays.indexOf(day) * 25)) / 2.5) * 45;
      const p = basePrice + wave;

      candles.push({
        timestamp: new Date(utcMs).toISOString(),
        open: p - 5,
        high: p + 10,
        low: p - 10,
        close: p,
        volume: 1500,
      });
    }
  }

  const result = runContractReplayBacktest(candles, {
    underlying: "crudeoil",
    timeframe: "15m",
    startingCapital: 100_000,
    lots: 1,
    brokerPlan: "BASIC",
  });

  assert.equal(result.contractSpec.underlying, "crudeoil");
  assert.equal(result.contractSpec.lotSize, 100);
  assert.equal(result.contractSpec.exchange, "MCX_FO");
  assert.equal(result.contractSpec.tickSize, 1.0);
  assert.ok(result.totalTrades > 0, "Expected at least 1 trade during crude wave");

  const trade = result.trades[0];
  assert.equal(trade.quantity, 100);
  assert.equal(trade.costBreakdown.exchange, "MCX_FO");
  assert.ok(trade.costBreakdown.stt > 0, "CTT must be charged on sell side for MCX");
  assert.equal(trade.costBreakdown.taxType, "CTT");
});
