import { test } from "node:test";
import assert from "node:assert/strict";
import { runPositionalV2, v2Signal, type V2Config } from "./positionalV2.ts";
import { DEFAULT_COSTS } from "./positionalBacktest.ts";
import type { Candle } from "../types.ts";

function weekdays(n: number): string[] {
  const out: string[] = [];
  const d = new Date("2023-01-02T00:00:00Z");
  while (out.length < n) {
    if (d.getUTCDay() % 6 !== 0) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
const N = 320;
const D = weekdays(N);
const mk = (f: (i: number) => number): Candle[] => D.map((date, i) => { const c = f(i); return { timestamp: `${date}T00:00:00+05:30`, open: c * 0.999, high: c * 1.01, low: c * 0.99, close: c, volume: 1e6 }; });
const set = (cs: Candle[], i: number, o: Partial<Candle>) => cs.map((c, k) => (k === i ? { ...c, ...o } : c));
const up = (i: number) => 100 * 1.003 ** i;
const benchUp = mk((i) => 20000 + i * 10);
const zero = { ...DEFAULT_COSTS, brokeragePerOrder: 0, sttPct: 0, exchangePct: 0, sebiPct: 0, stampBuyPct: 0, gstPct: 0, dpPerSell: 0, slippagePct: 0 };
const cfg = (o: Partial<V2Config> = {}): V2Config => ({ capital: 1_000_000, maxPositions: 5, atrMult: 3, costs: zero, tradeFrom: D[210], tradeTo: D[N - 1], ...o });
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

test("signals only on the week's last trading day; fills at the next session's open", () => {
  const data = { A: mk(up) };
  const r = runPositionalV2(data, benchUp, cfg());
  assert.ok(r.trades.length >= 1);
  const t = r.trades[0];
  assert.equal(dow(t.signalDate), 5, "Friday signal");
  assert.equal(t.entryDate, D[D.indexOf(t.signalDate) + 1]);
  assert.equal(t.entry, Math.round(data.A[D.indexOf(t.entryDate)].open * 100) / 100);
});

test("stop triggers on a CLOSE below it and exits at the next open, even through a gap", () => {
  let a = mk(up);
  const t0 = runPositionalV2({ A: a }, benchUp, cfg()).trades[0];
  const k = D.indexOf(t0.entryDate) + 10;
  a = set(a, k, { close: a[k].close * 0.8, low: a[k].close * 0.8 });           // close far below the stop
  a = set(a, k + 1, { open: a[k].close * 0.85 }); // ordinary gap down next morning (under the 25% corporate-action line)
  const t = runPositionalV2({ A: a }, benchUp, cfg()).trades[0];
  assert.equal(t.exitReason, "TRAIL_STOP");
  assert.equal(t.exitDate, D[k + 1]);
  assert.equal(t.exit, Math.round(a[k + 1].open * 100) / 100, "filled at the gapped open, not the stop");
});

test("an intraday low below the stop does not exit when the close holds", () => {
  let a = mk(up);
  const t0 = runPositionalV2({ A: a }, benchUp, cfg()).trades[0];
  const k = D.indexOf(t0.entryDate) + 10;
  a = set(a, k, { low: a[k].close * 0.5 });
  const t = runPositionalV2({ A: a }, benchUp, cfg()).trades[0];
  assert.notEqual(t.exitDate, D[k + 1]);
});

test("market filter: no entries while NIFTY is below its 200-day average", () => {
  const benchDown = mk((i) => 30000 - i * 20);
  assert.equal(runPositionalV2({ A: mk(up) }, benchDown, cfg()).trades.length, 0);
});

test("holdings are not replaced; extra candidates wait for a vacancy", () => {
  const data: Record<string, Candle[]> = {};
  for (let s = 0; s < 7; s++) data[`S${s}`] = mk((i) => (100 + s) * (1.002 + s * 0.0005) ** i);
  const r = runPositionalV2(data, benchUp, cfg());
  const open = r.trades.filter((t) => t.exitReason === "END");
  assert.ok(open.length <= 5);
  assert.equal(new Set(r.trades.map((t) => t.entryDate)).size >= 1, true);
  for (const t of r.trades) if (t.exitReason === "END") assert.equal(t.exitDate, D[N - 1]);
});

test("candles after tradeTo are invisible (no peeking into validation)", () => {
  const a = mk(up);
  const cut = D[280];
  const r1 = runPositionalV2({ A: a }, benchUp, cfg({ tradeTo: cut }));
  const crashedFuture = a.map((c, i) => (i > 280 ? { ...c, open: 1, high: 1, low: 1, close: 1 } : c));
  const r2 = runPositionalV2({ A: crashedFuture }, benchUp, cfg({ tradeTo: cut }));
  assert.deepEqual(r1.trades, r2.trades);
  assert.equal(r1.to, cut);
});

test("books balance with costs: capital + Σ net P&L = final equity", () => {
  const data = { A: mk(up), B: mk((i) => 50 * 1.002 ** i + Math.sin(i / 3) * 3) };
  const r = runPositionalV2(data, benchUp, cfg({ costs: DEFAULT_COSTS }));
  const sum = r.trades.reduce((x, t) => x + t.netPnl, 0);
  assert.ok(Math.abs(1_000_000 + sum - r.equity.at(-1)!.strategy) < 1e-6);
  assert.ok(r.stats.totalCosts > 0);
});

test("eligibility requires the 100-session highest close", () => {
  const a = mk(up);
  assert.ok(v2Signal(a.slice(0, 250)));
  const dipped = set(a, 249, { close: a[249].close * 0.97 });
  assert.equal(v2Signal(dipped.slice(0, 250)), null);
});
