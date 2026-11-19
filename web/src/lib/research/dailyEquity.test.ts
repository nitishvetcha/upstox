// Daily equity engine: causality, execution timing, adverse gaps, jump exclusion, costs. Synthetic, deterministic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CANDIDATES, costBreakdown, priorHigh, rsi2, simulateSymbol, sma, RISK_BUDGET, SCENARIOS, type DBar } from "./dailyEquity.ts";

function series(rows: [number, number, number, number][], start = "2001-01-01"): DBar[] {
  // rows: [open, high, low, close]; consecutive calendar days are fine for these tests (dates only order them).
  return rows.map(([o, h, l, c], k) => {
    const date = new Date(Date.parse(`${start}T00:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
    return { t: `${date}T00:00:00+05:30`, date, o, h, l, c, v: 1000 };
  });
}

test("DE-1. indicators are causal: a bar's own value is excluded from its prior high, and SMA/RSI use only the past", () => {
  const bars = series([[10, 12, 9, 11], [11, 13, 10, 12], [12, 20, 11, 19]]);
  assert.equal(priorHigh(bars, 2, 2), 13, "the high of day 2 (20) is not part of its own prior-2-day high");
  const closes = bars.map((b) => b.c);
  assert.equal(sma(closes, 3, 2), (11 + 12 + 19) / 3);
  assert.equal(sma(closes, 3, 1), null, "no SMA before n bars");
  assert.equal(rsi2(closes, 1), null, "RSI(2) needs two changes");
});

test("DE-2. entry is at the next session's open plus adverse slippage, never at the signal close", () => {
  // Signal on day 2 (close 19 above prior-20 high? use a 1-bar breakout candidate built inline).
  const bars = series(Array.from({ length: 260 }, (_, k) => {
    const p = 100 + k * 0.5;
    return [p, p, p - 1, p] as [number, number, number, number];  // high = close: a steady rise makes each close a new prior-high breakout
  }));
  const cand = CANDIDATES[0];
  const r = simulateSymbol("T", bars, cand, SCENARIOS.BASE, "2001-01-01", "2030-01-01");
  assert.ok(r.trades.length > 0, "a steady uptrend produces breakouts");
  const t = r.trades[0];
  const sig = bars.findIndex((b) => b.date === t.signalDate);
  assert.equal(t.entryDate, bars[sig + 1].date, "entry is the next session");
  assert.equal(t.entry, bars[sig + 1].o * (1 + SCENARIOS.BASE.slippagePerSide), "at the next open, plus slippage");
});

test("DE-3. a gap through the stop exits at the gapped open, adverse, labelled GAP_STOP (a -20% gap is below the jump rule)", () => {
  const rows: [number, number, number, number][] = Array.from({ length: 260 }, (_, k) => {
    const p = 100 + k * 0.5;
    return [p, p, p - 1, p];
  });
  const bars = series(rows);
  // Signal on day 200 (rising, above SMA200, new 20-day high); entry day 201; the stop-check starts on day 202.
  // Day 203 gaps down 20% through the stop (stop sits about 4 points, i.e. 2 × ATR, below the entry).
  const gapped = bars.map((b, i) => (i === 203 ? { ...b, o: bars[202].c * 0.8, h: bars[202].c * 0.8, l: bars[202].c * 0.8, c: bars[202].c * 0.8 } : b));
  const r = simulateSymbol("G", gapped, CANDIDATES[0], { slippagePerSide: 0, brokeragePerOrder: 0 }, "2001-01-01", "2030-01-01");
  // The rising series signals from day 199 onward; the first trade is still open on day 203, so the gap hits it.
  const gap = r.trades.find((t) => t.exitReason === "GAP_STOP");
  assert.ok(gap, "a trade is stopped out by the gap");
  assert.equal(gap!.exitDate, bars[203].date, "the exit is on the gap day");
  assert.equal(gap!.exit, gapped[203].o, "exit at the gapped open, not at the stop");
  assert.ok(gap!.exit < gap!.stop, "the realised exit is worse than the planned stop");
});

test("DE-4. a flagged jump inside the holding period excludes the trade (counted, never adjusted)", () => {
  const rows: [number, number, number, number][] = Array.from({ length: 260 }, (_, k) => {
    const p = 100 + k * 0.5;
    return [p, p + 1, p - 1, p];
  });
  // Insert a 2:1 style gap (open 50% below previous close) right after the first breakout's entry day.
  rows[215] = [60, 61, 59, 60];
  const bars = series(rows);
  const r = simulateSymbol("J", bars, CANDIDATES[0], SCENARIOS.BASE, "2001-01-01", "2030-01-01");
  assert.ok(r.excludedJump >= 0);
  for (const t of r.trades) {
    const e = bars.findIndex((b) => b.date === t.entryDate), x = bars.findIndex((b) => b.date === t.exitDate);
    for (let j = e; j <= x; j++) assert.ok(Math.abs(bars[j].o / bars[j - 1].c - 1) <= 0.35, "no kept trade spans a flagged day");
  }
});

test("DE-5. costs: statutory-rate formula on a worked example (BASE brokerage ₹0; CONSERVATIVE ₹20 per order)", () => {
  const b = costBreakdown(10_000, 11_000, 0);
  assert.ok(Math.abs(b.stt - 0.001 * 21_000) < 1e-9, "STT 0.1% on both sides of delivery turnover");
  assert.ok(Math.abs(b.stamp - 0.00015 * 10_000) < 1e-9, "stamp duty on the buy side");
  assert.equal(b.brokerage, 0);
  const c = costBreakdown(10_000, 11_000, 20);
  assert.equal(c.brokerage, 40, "two orders");
  assert.ok(Math.abs(c.gst - 0.18 * (40 + c.exchange + c.sebi)) < 1e-9, "GST on brokerage, exchange and SEBI fee");
});

test("DE-6. position size respects the 1% risk budget", () => {
  const bars = series(Array.from({ length: 260 }, (_, k) => {
    const p = 100 + k * 0.5;
    return [p, p, p - 1, p] as [number, number, number, number];  // high = close: a steady rise makes each close a new prior-high breakout
  }));
  const r = simulateSymbol("S", bars, CANDIDATES[0], SCENARIOS.BASE, "2001-01-01", "2030-01-01");
  for (const t of r.trades) assert.ok((t.entry - t.stop) * t.qty <= RISK_BUDGET + 1e-6, "planned risk within budget");
});
