import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCandleGeometry,
  isCandleWithinSession,
  assessDataQuality,
} from "./historicalDataQuality.ts";
import type { Candle } from "../types.ts";

test("HDQ-GEOMETRY-1: Validates candle geometry rules", () => {
  const validBar: Candle = {
    timestamp: "2026-11-25T04:00:00.000Z", // 09:30 IST
    open: 25000,
    high: 25050,
    low: 24980,
    close: 25020,
    volume: 50000,
  };
  assert.equal(validateCandleGeometry(validBar).valid, true);

  // High < Low
  assert.equal(validateCandleGeometry({ ...validBar, high: 24900, low: 25000 }).valid, false);

  // High < Open
  assert.equal(validateCandleGeometry({ ...validBar, high: 24990, open: 25000 }).valid, false);

  // Low > Close
  assert.equal(validateCandleGeometry({ ...validBar, low: 25030, close: 25020 }).valid, false);

  // Non-positive price
  assert.equal(validateCandleGeometry({ ...validBar, close: 0 }).valid, false);

  // Negative volume
  assert.equal(validateCandleGeometry({ ...validBar, volume: -100 }).valid, false);
});

test("HDQ-SESSION-1: Validates session boundaries for NSE vs MCX", () => {
  // 10:00 IST on Wednesday 2026-11-25
  const nseTradingBar: Candle = {
    timestamp: "2026-11-25T04:30:00.000Z", // 10:00 IST
    open: 25000,
    high: 25050,
    low: 24980,
    close: 25020,
    volume: 1000,
  };
  assert.equal(isCandleWithinSession(nseTradingBar, "nifty"), true);
  assert.equal(isCandleWithinSession(nseTradingBar, "crudeoil"), true);

  // 19:00 IST on Wednesday 2026-11-25
  const mcxEveningBar: Candle = {
    timestamp: "2026-11-25T13:30:00.000Z", // 19:00 IST
    open: 6800,
    high: 6850,
    low: 6790,
    close: 6830,
    volume: 500,
  };
  // NSE is closed at 19:00 IST
  assert.equal(isCandleWithinSession(mcxEveningBar, "nifty"), false);
  // MCX is open at 19:00 IST
  assert.equal(isCandleWithinSession(mcxEveningBar, "crudeoil"), true);

  // Midnight 02:00 IST
  const midnightBar: Candle = {
    timestamp: "2026-11-25T20:30:00.000Z", // 02:00 IST next day
    open: 6800,
    high: 6850,
    low: 6790,
    close: 6830,
    volume: 10,
  };
  assert.equal(isCandleWithinSession(midnightBar, "crudeoil"), false);
});

test("HDQ-ASSESS-1: Audits a 120-bar series and certifies replay readiness", () => {
  const candles: Candle[] = [];
  const tradingDays = ["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23", "2026-11-25"];
  for (const day of tradingDays) {
    for (let slot = 0; slot < 24; slot++) {
      const minutesFromOpen = slot * 15; // 0 to 345 min
      const istHour = 9 + Math.floor((15 + minutesFromOpen) / 60);
      const istMin = (15 + minutesFromOpen) % 60;
      const utcMs = Date.UTC(2026, 10, parseInt(day.split("-")[2], 10), istHour - 5, istMin - 30);
      candles.push({
        timestamp: new Date(utcMs).toISOString(),
        open: 25000 + slot,
        high: 25020 + slot,
        low: 24990 + slot,
        close: 25010 + slot,
        volume: 5000,
      });
    }
  }

  const report = assessDataQuality(candles, "nifty", "15m");
  assert.equal(report.totalBars, 120);
  assert.equal(report.validBars, 120);
  assert.equal(report.anomalyCount, 0);
  assert.equal(report.gapCount, 0);
  assert.equal(report.qualityScore, 100);
  assert.equal(report.isReplayReady, true);
});

test("HDQ-ASSESS-2: Detects geometric corruptions and fails replay readiness", () => {
  const corruptBars: Candle[] = [
    { timestamp: "2026-11-25T04:00:00.000Z", open: 25000, high: 24900, low: 25050, close: 25000, volume: 100 },
    { timestamp: "2026-11-25T04:15:00.000Z", open: 25000, high: 25050, low: 24980, close: -10, volume: 100 },
  ];
  const report = assessDataQuality(corruptBars, "nifty", "15m");
  assert.equal(report.validBars, 0);
  assert.equal(report.isReplayReady, false);
  assert.ok(report.anomalies.some((a) => a.type === "INVALID_OHLC"));
});
