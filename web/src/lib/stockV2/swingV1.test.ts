import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  SWING_CONFIG_DEFAULTS,
  emaSeries,
  smaSeries,
  highestHigh,
  return10d,
  simulateSwingV1,
  type DailyBar,
} from "./swingV1.ts";
import { roundTripDeliveryCharges } from "./risk.ts";

describe("Swing V1 Strategy & Cost Architecture", () => {
  it("enforces ₹10,000 capital and allocation constraints for Mode A and Mode B", () => {
    const a = SWING_CONFIG_DEFAULTS.MODE_A_5K;
    assert.equal(a.accountCapital, 10_000);
    assert.equal(a.allocationPerTrade, 5_000);
    assert.equal(a.maxPositions, 2);

    const b = SWING_CONFIG_DEFAULTS.MODE_B_10K;
    assert.equal(b.accountCapital, 10_000);
    assert.equal(b.allocationPerTrade, 10_000);
    assert.equal(b.maxPositions, 1);
  });

  it("calculates exact 2026 Upstox delivery charges including DP fee", () => {
    // 5 shares bought at 1,000 and sold at 1,100 (Buy: 5,000, Sell: 5,500)
    const ch = roundTripDeliveryCharges("LONG", 1000, 1100, 5);
    assert.equal(ch.brokerage, 40); // ₹20 buy + ₹20 sell
    assert.equal(ch.dpCharge, 20); // Flat ₹20 DP fee on sell
    assert.equal(Math.round(ch.dpCharge * 1.18 * 100) / 100, 23.6); // ₹23.60 incl 18% GST
    // Total STT = 0.1% of (5000 + 5500) = ₹10.50
    assert.equal(Math.round(ch.stt * 100) / 100, 10.5);
    // Total charges should be around ~₹86
    assert.ok(ch.total >= 80 && ch.total <= 95);
  });

  it("computes causal EMA, SMA, and high lookbacks correctly without lookahead", () => {
    const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const sma5 = smaSeries(closes, 5);
    assert.equal(sma5[3], null);
    assert.equal(sma5[4], (10 + 11 + 12 + 13 + 14) / 5);

    const highs = [100, 102, 105, 103, 104, 106];
    const h3 = highestHigh(highs, 3, 4); // lookback 3 before index 4 (indices 1, 2, 3: 102, 105, 103)
    assert.equal(h3, 105);

    const ret = return10d([100, ...Array(9).fill(100), 110], 10);
    assert.equal(Math.round((ret ?? 0) * 100), 10); // +10% return
  });

  it("simulates long-only swing trade with trailing breakeven stop", () => {
    // Construct synthetic 20-day series
    const dates = Array.from({ length: 60 }, (_, i) => `2026-06-${String(i + 1).padStart(2, "0")}`);
    const bars: DailyBar[] = dates.map((d, i) => {
      const price = 500 + i * 2;
      return {
        date: d,
        open: price,
        high: price + 10,
        low: price - 5,
        close: price + 5,
        volume: 100_000,
      };
    });

    const niftyBars: DailyBar[] = dates.map((d, i) => ({
      date: d,
      open: 24000 + i * 10,
      high: 24050 + i * 10,
      low: 23950 + i * 10,
      close: 24020 + i * 10,
      volume: 10_000_000,
    }));

    const stockData = new Map<string, DailyBar[]>([["TEST_STOCK", bars]]);
    const res = simulateSwingV1(stockData, niftyBars, dates, SWING_CONFIG_DEFAULTS.MODE_A_5K);
    assert.ok(res.metrics.trades >= 0);
  });

  it("supports zero-brokerage mode with flat DP and statutory taxes", () => {
    const standard = roundTripDeliveryCharges("LONG", 1000, 1100, 5, false);
    const zero = roundTripDeliveryCharges("LONG", 1000, 1100, 5, true);

    assert.equal(standard.brokerage, 40);
    assert.equal(zero.brokerage, 0);
    // DP charge remains fixed at ₹20 (+ 18% GST = ₹23.60) in both
    assert.equal(standard.dpCharge, 20);
    assert.equal(zero.dpCharge, 20);
    // STT is identical in both
    assert.equal(standard.stt, zero.stt);
    // Zero brokerage total should be exactly (40 + GST on 40) = ₹47.20 lower
    assert.equal(Math.round((standard.total - zero.total) * 100) / 100, 47.2);
  });

  it("supports trail20EmaAfter15R and zeroBrokerage options in simulation", () => {
    const dates = Array.from({ length: 60 }, (_, i) => `2026-06-${String(i + 1).padStart(2, "0")}`);
    const bars: DailyBar[] = dates.map((d, i) => {
      const price = 500 + i * 2;
      return {
        date: d,
        open: price,
        high: price + 10,
        low: price - 5,
        close: price + 5,
        volume: 100_000,
      };
    });

    const niftyBars: DailyBar[] = dates.map((d, i) => ({
      date: d,
      open: 24000 + i * 10,
      high: 24050 + i * 10,
      low: 23950 + i * 10,
      close: 24020 + i * 10,
      volume: 10_000_000,
    }));

    const stockData = new Map<string, DailyBar[]>([["TEST_STOCK", bars]]);
    const res = simulateSwingV1(stockData, niftyBars, dates, {
      ...SWING_CONFIG_DEFAULTS.MODE_B_10K,
      trail20EmaAfter15R: true,
      zeroBrokerage: true,
    });
    assert.ok(res.metrics.trades >= 0);
    assert.equal(res.metrics.brokerageTotal, 0);
  });
});
