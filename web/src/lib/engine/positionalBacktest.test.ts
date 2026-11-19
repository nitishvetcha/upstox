import { test } from "node:test";
import assert from "node:assert/strict";
import { runPositionalBacktest, orderCost, DEFAULT_CONFIG, DEFAULT_COSTS } from "./positionalBacktest.ts";
import type { Candle } from "../types.ts";

function days(n: number): string[] {
  const out: string[] = [];
  const d = new Date("2025-01-01T00:00:00Z");
  while (out.length < n) {
    if (d.getUTCDay() % 6 !== 0) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
const N = 140;
const D = days(N);
const bar = (date: string, o: number, h: number, l: number, c: number, v = 1e6): Candle => ({ timestamp: `${date}T00:00:00+05:30`, open: o, high: h, low: l, close: c, volume: v });
const trend = (f: (i: number) => number, vol = (_: number) => 1e6) => D.map((d, i) => { const c = f(i); return bar(d, c * 0.998, c * 1.01, c * 0.99, c, vol(i)); });
const flat = trend(() => 20000);
const noCosts = { ...DEFAULT_CONFIG, costs: { ...DEFAULT_COSTS, brokeragePerOrder: 0, sttPct: 0, exchangePct: 0, sebiPct: 0, stampBuyPct: 0, gstPct: 0, dpPerSell: 0, slippagePct: 0 } };

test("entry fills at the NEXT session's open, never the signal day's close", () => {
  const r = runPositionalBacktest({ UP: trend((i) => 100 + i * 0.5) }, flat, noCosts);
  assert.ok(r.trades.length > 0);
  for (const t of r.trades) {
    assert.ok(t.entryDate > t.signalDate, "entry after signal");
    const i = D.indexOf(t.entryDate);
    assert.equal(t.entry, Math.round(trend((k) => 100 + k * 0.5)[i].open * 100) / 100);
  }
});

test("a gap below the stop exits at the open (worse than the stop), not at the stop", () => {
  const base = trend((i) => 100 + i * 0.5);
  const r0 = runPositionalBacktest({ UP: base }, flat, noCosts);
  const first = r0.trades[0];
  const k = D.indexOf(first.entryDate) + 1;
  const gapOpen = first.stop - 5;
  const data = base.map((c, i) => (i === k ? bar(D[i], gapOpen, gapOpen + 1, gapOpen - 1, gapOpen) : c));
  const t = runPositionalBacktest({ UP: data }, flat, noCosts).trades[0];
  assert.equal(t.exitReason, "STOP_GAP");
  assert.equal(t.exit, gapOpen);
  assert.ok(t.grossR < -1, `gap loss beyond 1R, got ${t.grossR}`);
});

test("future candles cannot change past decisions (no look-ahead)", () => {
  const base = trend((i) => 100 + i * 0.5);
  const full = runPositionalBacktest({ UP: base }, flat, noCosts);
  const cut = runPositionalBacktest({ UP: base.slice(0, 120) }, flat.slice(0, 120), noCosts);
  const firstFull = full.trades[0], firstCut = cut.trades[0];
  assert.equal(firstFull.signalDate, firstCut.signalDate);
  assert.equal(firstFull.entry, firstCut.entry);
});

test("costs: ₹1,00,000 delivery buy and sell are in a realistic range and reduce net P&L", () => {
  const buy = orderCost(100_000, "BUY", DEFAULT_COSTS);
  const sell = orderCost(100_000, "SELL", DEFAULT_COSTS);
  assert.ok(buy > 100 && buy < 200, `buy ${buy}`);   // ≈ STT 100 + stamp 15 + brokerage 20 + small fees
  assert.ok(sell > 130 && sell < 200, `sell ${sell}`); // + DP charge, no stamp
  const r = runPositionalBacktest({ UP: trend((i) => 100 + i * 0.5) }, flat);
  assert.ok(r.stats.totalCosts > 0);
  for (const t of r.trades) assert.ok(t.netR < t.grossR, "net below gross");
});

test("downtrending stock generates no trades; flat benchmark returns 0%", () => {
  const r = runPositionalBacktest({ DOWN: trend((i) => 300 - i) }, flat, noCosts);
  assert.equal(r.stats.tradeCount, 0);
  assert.equal(r.stats.netReturnPct, 0);
  assert.equal(r.benchmark.netReturnPct, 0);
  assert.equal(r.stats.profitFactor, null);
});

test("books balance exactly: capital + Σ net P&L = final equity", () => {
  const r = runPositionalBacktest({ A: trend((i) => 100 + i * 0.5), B: trend((i) => 50 + i * 0.3 + Math.sin(i) * 2) }, flat);
  const sum = r.trades.reduce((a, t) => a + t.netPnl, 0);
  assert.ok(Math.abs(DEFAULT_CONFIG.capital + sum - r.equity.at(-1)!.strategy) < 1e-6);
});
