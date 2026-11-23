import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeIvPercentile } from "./upstoxMarket.ts";
import { VIX_MIN_HISTORY } from "./historicalContext.ts";
import type { Candle } from "../types.ts";

function makeCandle(date: string, close: number): Candle {
  return { timestamp: `${date}T06:00:00.000Z`, open: close, high: close, low: close, close, volume: 0 };
}

// 130 candles of VIX history (all before 2026-11-23)
function makeHistory(n: number, baseClose = 15): Candle[] {
  const candles: Candle[] = [];
  const base = new Date("2026-06-01");
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getTime() + i * 86_400_000);
    const date = d.toISOString().slice(0, 10);
    candles.push(makeCandle(date, baseClose + (i % 10))); // values 15–24 cycling
  }
  return candles;
}

describe("computeIvPercentile", () => {
  const now = new Date("2026-11-23T06:00:00.000Z"); // IST: 2026-11-23

  it("returns null when fewer than VIX_MIN_HISTORY completed sessions exist", () => {
    const candles = makeHistory(VIX_MIN_HISTORY - 1);
    assert.equal(computeIvPercentile(candles, now), null);
  });

  it("computes percentile once enough history exists", () => {
    const candles = makeHistory(130, 15);
    const pct = computeIvPercentile(candles, now);
    assert.ok(pct !== null, "should return a number");
    assert.ok(pct >= 0 && pct <= 100, `percentile ${pct} out of range`);
  });

  it("current VIX at max → percentile near 100", () => {
    // 120 candles with low VIX (10), last candle has high VIX (100)
    const candles = makeHistory(120, 10);
    // override last candle to a very high value
    candles[candles.length - 1] = makeCandle(candles[candles.length - 1].timestamp.slice(0, 10), 100);
    const pct = computeIvPercentile(candles, now);
    assert.ok(pct !== null && pct >= 95, `expected near 100 but got ${pct}`);
  });

  it("current VIX at min → percentile near 0", () => {
    const candles = makeHistory(120, 50);
    candles[candles.length - 1] = makeCandle(candles[candles.length - 1].timestamp.slice(0, 10), 1);
    const pct = computeIvPercentile(candles, now);
    assert.ok(pct !== null && pct <= 5, `expected near 0 but got ${pct}`);
  });

  it("excludes today's candle (look-ahead guard)", () => {
    const candles = makeHistory(130, 15);
    // Add a candle for today — should not affect the result
    candles.push(makeCandle("2026-11-23", 999));
    const pct = computeIvPercentile(candles, now);
    // Result should be the same as without the today candle
    const pctWithout = computeIvPercentile(candles.slice(0, -1), now);
    assert.equal(pct, pctWithout);
  });

  it("returns null for empty candle array", () => {
    assert.equal(computeIvPercentile([], now), null);
  });
});
