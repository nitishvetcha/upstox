// Phase D: indicator checks against values derived by hand from the textbook definitions (not from the code's output).
// EMA: seeded with the simple mean of the first n values, then k = 2/(n+1). RSI and ATR: Wilder smoothing.
import test from "node:test";
import assert from "node:assert/strict";
import { ema, rsi, atr } from "./technicalAnalysis.ts";

const close = (a: number | null, b: number, tol = 1e-9) => {
  assert.ok(a !== null, "value is null");
  assert.ok(Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);
};

test("EMA(3) of 1..6: seed = mean(1,2,3)=2, k=0.5, then 3, 4, 5", () => {
  const out = ema([1, 2, 3, 4, 5, 6], 3);
  assert.equal(out[0], null);
  assert.equal(out[1], null);
  close(out[2], 2);
  close(out[3], 3);
  close(out[4], 4);
  close(out[5], 5);
});

test("EMA returns all null when there are fewer values than the period", () => {
  assert.deepEqual(ema([1, 2], 3), [null, null]);
});

test("RSI(2) on closes 1,2,3,2,4 by Wilder: avgGain 1.25, avgLoss 0.25, RS 5, RSI 83.333…", () => {
  close(rsi([1, 2, 3, 2, 4], 2), 100 - 100 / 6, 1e-9);
});

test("RSI is 100 when there are only gains, and 50 when price never moves", () => {
  assert.equal(rsi([1, 2, 3, 4, 5], 2), 100);
  assert.equal(rsi([5, 5, 5, 5], 2), 50);
});

test("RSI needs period+1 closes", () => {
  assert.equal(rsi([1, 2], 2), null);
});

test("ATR(2) on four candles with true range 2 everywhere is 2", () => {
  const c = [
    { high: 11, low: 9, close: 10 },
    { high: 12, low: 10, close: 11 },
    { high: 13, low: 11, close: 12 },
    { high: 14, low: 12, close: 13 },
  ].map((x) => ({ ...x, open: x.close, volume: 0 }));
  close(atr(c as never, 2), 2);
});

test("ATR true range uses the previous close when there is a gap", () => {
  // Candle 2 gaps up: high 20, low 18, previous close 10 -> TR = max(2, |20-10|, |18-10|) = 10.
  // Candle 1 TR = 2. ATR(2) on these two TRs = mean(2, 10) = 6.
  const c = [
    { open: 10, high: 11, low: 9, close: 10, volume: 0 },
    { open: 10, high: 11, low: 9, close: 10, volume: 0 },
    { open: 19, high: 20, low: 18, close: 19, volume: 0 },
  ];
  close(atr(c as never, 2), 6);
});
