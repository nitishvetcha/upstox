// Independent known-answer tests for the technical indicators in technicalAnalysis.ts.
// Every expected value below was derived by hand from the textbook definition (shown in the comments),
// NOT by calling the implementation or another function that shares its logic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ema, rsi, atr, macd, vwap } from "./technicalAnalysis.ts";
import type { Candle } from "../types.ts";

const close = (a: number | null, b: number, eps = 1e-9) => {
  assert.ok(a !== null && Math.abs(a - b) <= eps, `expected ${b}, got ${a}`);
};
const c = (high: number, low: number, closeP: number, volume: number | null = 1): Candle => ({ timestamp: "2026-01-05T09:15:00+05:30", open: closeP, high, low, close: closeP, volume });

// ── EMA ──────────────────────────────────────────────────────────────────────
// EMA(3) of [1,2,3,4,5]: seed = SMA(1,2,3) = 2 at index 2; k = 2/(3+1) = 0.5.
// i=3: (4-2)*0.5+2 = 3.  i=4: (5-3)*0.5+3 = 4.
test("EMA(3) of 1..5 = [null,null,2,3,4] (SMA seed, k=0.5)", () => {
  const out = ema([1, 2, 3, 4, 5], 3);
  assert.equal(out[0], null);
  assert.equal(out[1], null);
  close(out[2], 2);
  close(out[3], 3);
  close(out[4], 4);
});

test("EMA of a constant series equals the constant", () => {
  const out = ema(Array(30).fill(100), 9);
  close(out[29], 100);
  close(out[8], 100);
});

test("EMA with fewer values than the period is all null (no invented value)", () => {
  assert.deepEqual(ema([1, 2], 3), [null, null]);
});

test("EMA when length equals the period has exactly one value (the SMA)", () => {
  const out = ema([2, 4, 6], 3);
  assert.deepEqual(out.map((v) => v === null), [true, true, false]);
  close(out[2], 4);
});

// ── RSI (Wilder) ─────────────────────────────────────────────────────────────
// closes [1,2,3,2,3], period 2. Changes: +1,+1,-1,+1. Gains [1,1,0,1], losses [0,0,1,0].
// Seed: avgGain=(1+1)/2=1, avgLoss=(0+0)/2=0.
// i=2: avgGain=(1*1+0)/2=0.5, avgLoss=(0*1+1)/2=0.5.  i=3: avgGain=(0.5*1+1)/2=0.75, avgLoss=(0.5*1+0)/2=0.25.
// RS=0.75/0.25=3. RSI = 100 - 100/(1+3) = 75.
test("RSI(2) of [1,2,3,2,3] = 75 (hand-derived Wilder smoothing)", () => {
  close(rsi([1, 2, 3, 2, 3], 2), 75);
});

test("RSI of a strictly rising series is 100", () => {
  close(rsi([1, 2, 3, 4, 5], 2), 100);
});

test("RSI of a strictly falling series is 0", () => {
  close(rsi([5, 4, 3, 2, 1], 2), 0);
});

test("RSI of a flat series is 50 (no gains, no losses), not NaN", () => {
  close(rsi([5, 5, 5, 5, 5], 2), 50);
});

test("RSI needs period+1 closes; fewer returns null", () => {
  assert.equal(rsi([1, 2], 2), null);
  assert.equal(rsi([], 14), null);
});

// ── ATR (Wilder) ─────────────────────────────────────────────────────────────
// Period 2. Candle0 close 10. Candle1 H12 L9 C11: TR=max(3,|12-10|=2,|9-10|=1)=3.
// Candle2 H13 L10 C12 (prev close 11): TR=max(3,2,1)=3. Candle3 H15 L11 C14 (prev close 12): TR=max(4,3,1)=4.
// TR=[3,3,4]. Seed=(3+3)/2=3. i=2: (3*1+4)/2=3.5.
test("ATR(2) = 3.5 for the hand-derived candle set", () => {
  const candles = [c(10, 10, 10), c(12, 9, 11), c(13, 10, 12), c(15, 11, 14)];
  close(atr(candles, 2), 3.5);
});

// Gap-up: previous close 10, next candle H20 L18 C19. TR=max(20-18=2,|20-10|=10,|18-10|=8)=10. ATR(1)=10.
test("ATR uses the previous close for gaps (true range, not high-low)", () => {
  close(atr([c(10, 10, 10), c(20, 18, 19)], 1), 10);
});

test("ATR needs period+1 candles; fewer returns null", () => {
  assert.equal(atr([c(10, 9, 9.5), c(11, 9, 10)], 2), null);
});

// ── MACD ─────────────────────────────────────────────────────────────────────
// On a constant series every EMA equals the constant: MACD line, signal and histogram are all 0.
test("MACD of a constant series is exactly zero", () => {
  const r = macd(Array(60).fill(100));
  assert.ok(r);
  close(r!.macd, 0);
  close(r!.signal, 0);
  close(r!.histogram, 0);
});

// On a unit ramp x_i = i an SMA-seeded EMA(p) has a constant lag of (p-1)/2 from the first value onward
// (the seed lag equals the steady-state lag 1/k - 1 = (p-1)/2). So EMA12 = i-5.5, EMA26 = i-12.5,
// MACD line = 7 for every defined index, the signal EMA of a constant 7 is 7, and the histogram is 0.
test("MACD of the ramp 0..59 is line=7, signal=7, histogram=0 (analytic result)", () => {
  const ramp = Array.from({ length: 60 }, (_, i) => i);
  const r = macd(ramp);
  assert.ok(r);
  close(r!.macd, 7, 1e-9);
  close(r!.signal, 7, 1e-9);
  close(r!.histogram, 0, 1e-9);
});

test("MACD with too little history returns null (no invented value)", () => {
  assert.equal(macd(Array.from({ length: 20 }, (_, i) => i)), null);
});

// ── VWAP ─────────────────────────────────────────────────────────────────────
// Candle1 H10 L8 C9 V100 → typical 9. Candle2 H12 L10 C11 V300 → typical 11.
// VWAP = (9*100 + 11*300) / 400 = 4200/400 = 10.5.
test("VWAP of two candles = 10.5 (hand-derived)", () => {
  close(vwap([c(10, 8, 9, 100), c(12, 10, 11, 300)]), 10.5);
});

test("VWAP is null when any candle has no volume (index candles carry none)", () => {
  assert.equal(vwap([c(10, 8, 9, 100), c(12, 10, 11, null)]), null);
});

test("VWAP is null for an empty session and for zero total volume", () => {
  assert.equal(vwap([]), null);
  assert.equal(vwap([c(10, 8, 9, 0), c(12, 10, 11, 0)]), null);
});
