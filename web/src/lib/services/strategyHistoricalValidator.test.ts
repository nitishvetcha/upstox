import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateHistoricalStrategy } from "./strategyHistoricalValidator.ts";
import type { Candle } from "../types.ts";

function createCandle(
  isoTime: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 1000,
): Candle {
  return {
    timestamp: isoTime,
    open,
    high,
    low,
    close,
    volume,
  };
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

describe("strategyHistoricalValidator", () => {
  it("returns zero metrics when candles array is empty or too short", () => {
    const report = validateHistoricalStrategy([]);
    assert.equal(report.metrics.totalTrades, 0);
    assert.equal(report.trades.length, 0);
    assert.ok(report.pineScript.includes("//@version=5"));
  });

  it("identifies a Bullish ORB Breakout and tracks through Target 2", () => {
    const date = "2026-11-20";
    const candles: Candle[] = [];

    // Warmup candles (to initialize EMA 9/21/50)
    for (let i = 0; i < 20; i++) {
      const h = pad(Math.floor(i / 4) + 4);
      const m = pad((i % 4) * 15);
      candles.push(createCandle(`2026-11-19T${h}:${m}:00.000Z`, 100, 102, 98, 100));
    }

    // Day of trade: 09:15 to 09:30 IST (03:45 to 04:00 UTC)
    candles.push(createCandle(`${date}T03:45:00.000Z`, 100, 102, 98, 101)); // 09:15 IST
    candles.push(createCandle(`${date}T04:00:00.000Z`, 101, 102, 99, 101)); // 09:30 IST

    // Breakout Candle: 09:45 IST (Close = 105 > ORB High 102)
    candles.push(createCandle(`${date}T04:15:00.000Z`, 101, 106, 101, 105));

    // Follow-through Candle reaching Target 2: 10:00 IST
    candles.push(createCandle(`${date}T04:30:00.000Z`, 105, 130, 104, 128));

    const report = validateHistoricalStrategy(candles, { symbol: "NIFTY" });
    assert.ok(report.trades.length >= 1);
    const trade = report.trades[0];
    assert.equal(trade.direction, "CE_LONG");
    assert.equal(trade.outcome, "TARGET_2_HIT");
    assert.equal(trade.pnlR, 2.5);
    assert.ok(report.metrics.winningTrades >= 1);
    assert.ok(report.chartMarkers.length >= 2);
  });

  it("identifies a Bearish ORB Breakdown and executes short trade", () => {
    const date = "2026-11-20";
    const candles: Candle[] = [];

    // Warmup downward trending candles
    for (let i = 0; i < 20; i++) {
      const h = pad(Math.floor(i / 4) + 4);
      const m = pad((i % 4) * 15);
      candles.push(createCandle(`2026-11-19T${h}:${m}:00.000Z`, 200 - i, 201 - i, 198 - i, 199 - i));
    }

    // Day of trade: 09:15 to 09:30 IST (ORB high=180, low=175)
    candles.push(createCandle(`${date}T03:45:00.000Z`, 178, 180, 175, 176));
    candles.push(createCandle(`${date}T04:00:00.000Z`, 176, 178, 175, 176));

    // Breakdown Candle: 09:45 IST (Close = 170 < ORB Low 175)
    candles.push(createCandle(`${date}T04:15:00.000Z`, 176, 176, 169, 170));

    // Follow-through hitting Target 2
    candles.push(createCandle(`${date}T04:30:00.000Z`, 170, 171, 140, 145));

    const report = validateHistoricalStrategy(candles, { symbol: "BANKNIFTY" });
    assert.ok(report.trades.length >= 1);
    const trade = report.trades[0];
    assert.equal(trade.direction, "PE_SHORT");
    assert.equal(trade.outcome, "TARGET_2_HIT");
    assert.equal(trade.pnlR, 2.5);
  });

  it("exits with Theta Time-Stop when trade is held for max bars without reaching Target 1", () => {
    const date = "2026-11-20";
    const candles: Candle[] = [];

    // Warmup
    for (let i = 0; i < 20; i++) {
      const h = pad(Math.floor(i / 4) + 4);
      const m = pad((i % 4) * 15);
      candles.push(createCandle(`2026-11-19T${h}:${m}:00.000Z`, 100, 102, 98, 100));
    }

    // 09:15 - 09:30 ORB
    candles.push(createCandle(`${date}T03:45:00.000Z`, 100, 102, 98, 101));
    candles.push(createCandle(`${date}T04:00:00.000Z`, 101, 102, 99, 101));

    // Breakout at 09:45 (Entry ~ 104)
    candles.push(createCandle(`${date}T04:15:00.000Z`, 101, 105, 101, 104));

    // Bar 1 (10:00) sideways
    candles.push(createCandle(`${date}T04:30:00.000Z`, 104, 105, 103, 104.2));
    // Bar 2 (10:15) sideways
    candles.push(createCandle(`${date}T04:45:00.000Z`, 104.2, 105, 103, 104.1));
    // Bar 3 (10:30) sideways -> hits theta max bars (3 bars = 45m)
    candles.push(createCandle(`${date}T05:00:00.000Z`, 104.1, 105, 103, 104.0));

    const report = validateHistoricalStrategy(candles, { symbol: "NIFTY", thetaMaxBars: 3 });
    assert.ok(report.trades.length >= 1);
    const trade = report.trades[0];
    assert.equal(trade.outcome, "THETA_TIME_STOP");
    assert.ok(trade.notes.includes("Theta decay protection"));
  });
});
