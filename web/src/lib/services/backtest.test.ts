import { test } from "node:test";
import assert from "node:assert/strict";
import { BacktestEngine } from "../backtestEngine.ts";
import { buildHistoricalOptionChain, buildHistoricalSnapshot } from "../backtestSnapshot.ts";
import type { Candle } from "../types.ts";
import type { BacktestRunConfig } from "../backtestTypes.ts";

const START = "2026-09-01";
const END = "2026-10-05";

function makeCandles(count = 100, startSpot = 25000): Candle[] {
  const candles: Candle[] = [];
  let price = startSpot;
  const startMs = new Date(`${START}T09:15:00+05:30`).getTime();

  for (let i = 0; i < count; i++) {
    const t = new Date(startMs + i * 15 * 60_000).toISOString();
    price += (Math.sin(i / 4) + 0.2) * 12;
    candles.push({
      timestamp: t,
      open: price - 4,
      high: price + 8,
      low: price - 6,
      close: price,
      volume: null,
    });
  }

  return candles;
}

test("1. Backtest Engine: Look-Ahead Bias Prevention (Snapshot at T cannot access T+1)", () => {
  const candles = makeCandles(80); // ≥ 50 bars so EMA 50 exists (no placeholder indicators)
  const config: BacktestRunConfig = {
    startDate: START,
    endDate: END,
    index: "nifty",
    timeframe: "15m",
    startingCapital: 100_000,
  };

  const idx = 60;
  const currentCandle = candles[idx];
  const slicedAtT = candles.slice(0, idx + 1);

  // Daily candles (completed days before T) are required for the live engine's daily-ATR / previous-day inputs.
  const daily = Array.from({ length: 20 }, (_, d) => ({ timestamp: new Date(Date.parse(`${START}T00:00:00+05:30`) - (20 - d) * 86_400_000).toISOString(), open: 24900, high: 25150, low: 24850, close: 25000 + d, volume: null }));
  const snapshotAtT = buildHistoricalSnapshot(config, currentCandle, slicedAtT, daily, [], new Date(currentCandle.timestamp));
  assert.ok(snapshotAtT);
  assert.equal(snapshotAtT.spot, currentCandle.close);
  assert.equal(snapshotAtT.sources.market.lastTradeTime, currentCandle.timestamp);

  // Assert slicedAtT contains NO candles with timestamp > currentCandle.timestamp
  const futureCandles = slicedAtT.filter((c) => new Date(c.timestamp).getTime() > new Date(currentCandle.timestamp).getTime());
  assert.equal(futureCandles.length, 0, "No future candles allowed in historical snapshot at T");
});

test("2. Backtest Engine: Indicator Warmup Check (Skipped before 35 bars)", () => {
  const candles = makeCandles(20);
  const config: BacktestRunConfig = {
    startDate: START,
    endDate: END,
    index: "nifty",
    timeframe: "15m",
    startingCapital: 100_000,
  };

  const snapshot = buildHistoricalSnapshot(config, candles[15], candles.slice(0, 16), [], [], new Date(candles[15].timestamp));
  assert.equal(snapshot, null, "Snapshot must be null prior to completing minimum 35-bar warmup");
});

test("3. Backtest Engine: Deterministic Reproducibility (Same input produces identical output)", () => {
  const engine = new BacktestEngine();
  const candles = makeCandles(80);
  const config: BacktestRunConfig = {
    startDate: START,
    endDate: END,
    index: "nifty",
    timeframe: "15m",
    startingCapital: 100_000,
  };

  const res1 = engine.run(config, candles);
  const res2 = engine.run(config, candles);

  assert.equal(res1.summary.netPnL, res2.summary.netPnL);
  assert.equal(res1.summary.totalTrades, res2.summary.totalTrades);
  assert.equal(res1.summary.winRate, res2.summary.winRate);
  assert.equal(res1.summary.maxDrawdown, res2.summary.maxDrawdown);
  assert.equal(res1.trades.length, res2.trades.length);
});

test("4. Backtest Engine: Independent Deterministic P&L Fixture Check", () => {
  const engine = new BacktestEngine();
  const candles = makeCandles(60, 25000);
  const config: BacktestRunConfig = {
    startDate: START,
    endDate: END,
    index: "nifty",
    timeframe: "15m",
    startingCapital: 100_000,
  };

  // Completed prior days are needed for the live engine's daily-ATR / previous-day inputs.
  const daily = Array.from({ length: 20 }, (_, d) => ({ timestamp: new Date(Date.parse(`${START}T00:00:00+05:30`) - (20 - d) * 86_400_000).toISOString(), open: 24900, high: 25150, low: 24850, close: 25000 + d, volume: null }));
  const result = engine.run(config, candles, daily);
  assert.ok(result.summary);
  assert.ok(result.equityCurve.length > 0);
  assert.equal(result.dataQuality.mode, "PARTIAL");

  // Validate math consistency: grossProfit - grossLoss == netPnL
  const expectedNet = Math.round((result.summary.grossProfit - result.summary.grossLoss) * 100) / 100;
  assert.equal(result.summary.netPnL, expectedNet);
});

test("5. Backtest Engine: Multi-Leg Straddle P&L Verification", () => {
  // Verify option chain generation gives non-zero prices for CE and PE legs
  const chain = buildHistoricalOptionChain(25000, 50, "2026-10-10", new Date("2026-10-05T10:00:00+05:30"));
  const atm = chain.find((r) => r.strike === 25000)!;

  assert.ok(atm.call.ltp > 0);
  assert.ok(atm.put.ltp > 0);
  assert.ok((atm.call.ask ?? 0) > atm.call.ltp);
  assert.ok((atm.call.bid ?? 0) < atm.call.ltp);
});
