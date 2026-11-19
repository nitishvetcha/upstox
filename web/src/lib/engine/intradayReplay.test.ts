import { test } from "node:test";
import assert from "node:assert/strict";
import { replayDay, validateDay, type DayBars } from "./intradayReplay.ts";
import type { Candle } from "../types.ts";

const OPEN = 555, LAST = 929;
// A stock whose price follows f(minuteIndex); bars span ±0.1% around close.
function stock(symbol: string, prevClose: number, f: (i: number) => number, from = OPEN, to = LAST): DayBars {
  const n = to - from + 1;
  const b: DayBars = { symbol, prevClose, minute: new Int16Array(n), o: new Float32Array(n), h: new Float32Array(n), l: new Float32Array(n), c: new Float32Array(n), v: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    const c = f(i), o = i ? f(i - 1) : c;
    b.minute[i] = from + i; b.o[i] = o; b.c[i] = c; b.h[i] = Math.max(o, c) * 1.001; b.l[i] = Math.min(o, c) * 0.999; b.v[i] = 1000;
  }
  return b;
}
const flat = (s: string) => stock(s, 100, () => 100);
const universe = (lead: DayBars) => [lead, ...Array.from({ length: 12 }, (_, k) => flat(`F${k}`))];
const rally = stock("UP", 100, (i) => 100 * (1 + Math.min(i, 60) * 0.0006)); // +3.6% in the first hour, then flat

test("a strong mover is entered at a bar close, and exits are on later bars", () => {
  const t = replayDay("2026-01-05", universe(rally)).filter((x) => x.symbol === "UP");
  assert.ok(t.length >= 1, "trade taken");
  for (const x of t) {
    assert.equal(x.direction, "BULLISH");
    assert.ok(x.exitMinute > x.entryMinute - 1);
    assert.ok(x.entryMinute < 870, "entered before 14:30");
  }
});

test("no look-ahead: changing bars after the first entry leaves that entry unchanged", () => {
  const a = replayDay("2026-01-05", universe(rally)).find((x) => x.symbol === "UP")!;
  const crashed = stock("UP", 100, (i) => (i + OPEN + 1 > a.entryMinute ? 50 : 100 * (1 + Math.min(i, 60) * 0.0006)));
  const b = replayDay("2026-01-05", universe(crashed)).find((x) => x.symbol === "UP")!;
  assert.deepEqual([b.entryMinute, b.entry, b.stop, b.target1], [a.entryMinute, a.entry, a.stop, a.target1]);
});

test("no entries from 14:30: a move that only starts after the cutoff is never traded", () => {
  const late = stock("LATE", 100, (i) => (i + OPEN < 875 ? 100 : 100 * (1 + (i + OPEN - 875) * 0.002)));
  assert.equal(replayDay("2026-01-05", universe(late)).filter((x) => x.symbol === "LATE").length, 0);
});

test("a bar touching both stop and target exits at the stop (conservative), a gap exits at the open", () => {
  const first = replayDay("2026-01-05", universe(rally)).find((x) => x.symbol === "UP")!;
  const k = first.entryMinute - OPEN; // index of the first bar after entry
  const both = { ...rally, h: rally.h.slice(), l: rally.l.slice(), o: rally.o.slice() };
  both.h[k] = first.target2 * 1.01; both.l[k] = first.stop * 0.99;
  const t1 = replayDay("2026-01-05", universe(both)).find((x) => x.symbol === "UP")!;
  assert.equal(t1.exitReason, "STOP");
  assert.equal(t1.exit, first.stop);
  const gap = { ...rally, o: rally.o.slice(), l: rally.l.slice(), h: rally.h.slice() };
  gap.o[k] = first.stop - 1; gap.l[k] = first.stop - 2;
  const t2 = replayDay("2026-01-05", universe(gap)).find((x) => x.symbol === "UP")!;
  assert.equal(t2.exitReason, "STOP_GAP");
  assert.ok(Math.abs(t2.exit - (first.stop - 1)) < 1e-3);
  assert.ok(t2.grossR < -1);
});

test("positions still open after 15:29 exit at the last close; one position per stock at a time", () => {
  const t = replayDay("2026-01-05", universe(rally));
  const bySym = new Map<string, typeof t>();
  for (const x of t) bySym.set(x.symbol, [...(bySym.get(x.symbol) ?? []), x]);
  for (const xs of bySym.values()) for (let i = 1; i < xs.length; i++) assert.ok(xs[i].entryMinute > xs[i - 1].exitMinute - 1, "no overlap");
  for (const x of t.filter((y) => y.exitReason === "EOD")) assert.equal(x.exitMinute, 930);
});

const raw = (n: number, f: (i: number) => Partial<Candle> = () => ({})): Candle[] =>
  Array.from({ length: n }, (_, i) => {
    const m = 555 + i, hh = String(Math.floor(m / 60)).padStart(2, "0"), mm = String(m % 60).padStart(2, "0");
    return { timestamp: `2026-01-05T${hh}:${mm}:00+05:30`, open: 100, high: 101, low: 99, close: 100, volume: 10, ...f(i) };
  });
const counters = () => ({ droppedOutsideSession: 0, droppedBadTz: 0, duplicates: 0, reordered: 0 });

test("validation: clean day passes; duplicates dropped and counted; nothing invented", () => {
  const n = counters();
  const c = raw(375);
  const r = validateDay("X", [...c, c[10], ...raw(0)], 100, n);
  assert.ok(typeof r !== "string");
  if (typeof r !== "string") assert.equal(r.minute.length, 375);
  assert.equal(n.duplicates, 1);
});

test("validation: bad OHLC, too few bars, missing previous close, corporate action, bars outside session", () => {
  assert.equal(validateDay("X", raw(375, (i) => (i === 7 ? { high: 98 } : {})), 100, counters()), "bad_ohlc");
  assert.equal(validateDay("X", raw(299), 100, counters()), "too_few_bars");
  assert.equal(validateDay("X", raw(375), undefined, counters()), "no_prev_close");
  assert.equal(validateDay("X", raw(375), 50, counters()), "corporate_action", "open 100 vs prev close 50 = 1:2 split");
  const n = counters();
  validateDay("X", [...raw(375), { timestamp: "2026-01-05T15:30:00+05:30", open: 1, high: 1, low: 1, close: 1, volume: 0 }], 100, n);
  assert.equal(n.droppedOutsideSession, 1);
});

test("identical setups are not re-entered on a later day (identity spans the replay)", () => {
  const seen = new Set<string>();
  const key = (t: { symbol: string; direction: string; setup: string; entry: number; stop: number; target1: number }) => [t.symbol, t.direction, t.setup, t.entry, t.stop, t.target1].join("|");
  const d1 = replayDay("2026-01-05", universe(rally), seen);
  assert.ok(d1.length > 0);
  const k1 = new Set(d1.map(key));
  for (const t of replayDay("2026-01-06", universe(rally), seen)) assert.ok(!k1.has(key(t)), "a day-1 setup was re-entered");
});
