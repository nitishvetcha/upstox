import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePositional, withTodayBar, checkDailyCandles } from "./positionalTrend.ts";
import type { Candle } from "../types.ts";

const NOW = new Date("2026-10-23T10:00:00Z");
// Weekday-only daily series ending on NOW's date; close follows f(i).
function series(n: number, f: (i: number) => number, vol = (_i: number) => 1_000_000): Candle[] {
  const out: Candle[] = [];
  const d = new Date("2026-10-23T00:00:00Z");
  while (out.length < n) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.unshift({ timestamp: `${d.toISOString().slice(0, 10)}T09:15:00+05:30`, open: 0, high: 0, low: 0, close: 0, volume: 0 });
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out.map((c, i) => { const cl = f(i); return { ...c, open: cl * 0.995, high: cl * 1.01, low: cl * 0.99, close: cl, volume: vol(i) }; });
}

const flatBench = series(120, () => 20000);

test("steady uptrend with volume breakout → BREAKOUT, long, sane plan", () => {
  const c = series(120, (i) => 100 + i * 0.5 + (i === 119 ? 3 : 0), (i) => (i === 119 ? 2_500_000 : 1_000_000));
  const r = evaluatePositional(c, flatBench, NOW, true);
  assert.ok(r.ok, !r.ok ? r.reason : "");
  if (!r.ok) return;
  assert.equal(r.setup, "BREAKOUT");
  assert.ok(r.stop < r.entry && r.target1 > r.entry && r.target2 > r.target1);
  assert.ok(r.rr >= 1.5);
  assert.ok(r.rs20! > 0, "beat a flat benchmark");
  assert.ok(r.score >= 70, `score ${r.score}`);
  assert.ok(r.confidence > 70 && r.confidence <= 100);
});

test("downtrend is rejected (long-only)", () => {
  const r = evaluatePositional(series(120, (i) => 300 - i), flatBench, NOW);
  assert.equal(r.ok, false);
});

test("one big green day inside a downtrend is NOT a positional setup", () => {
  const r = evaluatePositional(series(120, (i) => (i === 119 ? 200 * 1.04 : 300 - i)), flatBench, NOW);
  assert.equal(r.ok, false);
});

test("parabolic move far above the 20-day average is rejected as stretched", () => {
  const r = evaluatePositional(series(120, (i) => (i < 110 ? 100 + i * 0.2 : 100 + i * 0.2 + (i - 109) * 6)), flatBench, NOW);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /stretched/);
});

test("data quality: too short, out of order, stale", () => {
  assert.match(checkDailyCandles(series(30, () => 100), NOW)!, /need/);
  const c = series(80, (i) => 100 + i);
  assert.match(checkDailyCandles([...c.slice(0, 40), c[45], ...c.slice(41)], NOW)!, /order|duplicated/);
  assert.match(checkDailyCandles(c, new Date("2026-11-10T10:00:00Z"))!, /days old/);
});

test("today bar replaces the same-session candle instead of duplicating it", () => {
  const c = series(70, () => 100);
  const out = withTodayBar(c, { ltp: 105, open: 100, high: 106, low: 99, volume: 5 }, "2026-10-23");
  assert.equal(out.length, 70);
  assert.equal(out.at(-1)!.close, 105);
});

test("a split-like overnight gap is not read as a crash", () => {
  // 100 bars uptrend, then a 1:2 split (price halves), then 20 more bars: too little clean history → explicit reason
  const c = series(120, (i) => (i < 100 ? 200 + i : (200 + i) / 2));
  const r = evaluatePositional(c, null, NOW);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /split\/demerger/);
});
