// Phase D: MACD checks from the definitions (MACD = EMA12 - EMA26; signal = EMA9 of MACD; histogram = MACD - signal).
import test from "node:test";
import assert from "node:assert/strict";
import { macd, ema } from "./technicalAnalysis.ts";

test("MACD of a constant price series is zero on every component", () => {
  const closes = Array.from({ length: 40 }, () => 10);
  const m = macd(closes);
  assert.ok(m !== null);
  assert.equal(m.macd, 0);
  assert.equal(m.signal, 0);
  assert.equal(m.histogram, 0);
});

test("MACD line equals EMA12 minus EMA26 at the last bar (identity check against the EMA definition)", () => {
  const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5 + i * 0.1);
  const m = macd(closes);
  const e12 = ema(closes, 12).at(-1)!;
  const e26 = ema(closes, 26).at(-1)!;
  assert.ok(m !== null);
  assert.ok(Math.abs(m.macd - (e12 - e26)) < 1e-9);
});

test("histogram equals MACD minus signal at the last bar", () => {
  const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5 + i * 0.1);
  const m = macd(closes);
  assert.ok(m !== null);
  assert.ok(Math.abs(m.histogram - (m.macd - m.signal)) < 1e-12);
});

test("MACD is positive on a steady uptrend (fast EMA above slow EMA)", () => {
  const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
  const m = macd(closes);
  assert.ok(m !== null);
  assert.ok(m.macd > 0);
});

test("MACD returns null when history is too short for the signal line", () => {
  assert.equal(macd(Array.from({ length: 20 }, (_, i) => i)), null);
});
