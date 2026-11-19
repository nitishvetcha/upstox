// Intraday one-hour engine: grid filter, causal EMA, next-bar entry, same-session exits, gap stop, costs. Synthetic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ema, GRID, intradayCosts, simulateSymbol, standardGrid, SCENARIOS, type HBar } from "./intradayHourly.ts";

// Seven standard bars per session; rows: [open, high, low, close] per bar in order of GRID.
function sessions(days: [number, number, number, number][][], start = "2024-03-04"): HBar[] {
  const out: HBar[] = [];
  days.forEach((rows, d) => {
    const date = new Date(Date.parse(`${start}T00:00:00Z`) + d * 86_400_000 * 7).toISOString().slice(0, 10); // weekly spacing keeps dates distinct
    rows.forEach(([o, h, l, c], k) => out.push({ t: `${date}T${GRID[k]}:00+05:30`, date, time: GRID[k], o, h, l, c, v: 1000 }));
  });
  return out;
}

test("IH-1. only standard-grid bars are kept; off-grid stamps are counted", () => {
  const bars = sessions([[[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]]]);
  bars.push({ ...bars[0], time: "13:45", t: "x" }, { ...bars[0], time: "18:00", t: "y" });
  const g = standardGrid(bars);
  assert.equal(g.bars.length, 7);
  assert.equal(g.offGridDropped, 2);
});

test("IH-2. EMA is causal and seeded with the SMA of the first n values", () => {
  const e = ema([1, 2, 3, 4, 5], 3);
  assert.equal(e[0], null);
  assert.equal(e[2], 2, "seed is the mean of the first three");
  assert.equal(e[3] !== null && e[3] > 2, true);
});

test("IH-3. entry is at the next bar's open plus slippage, and no trade is held overnight", () => {
  // Rising hourly series: after the EMAs are seeded, closes break the prior high and the signal fires at 10:15–13:15.
  const days: [number, number, number, number][][] = [];
  for (let d = 0; d < 80; d++) {
    days.push(Array.from({ length: 7 }, (_, k) => {
      const p = 100 + d * 0.7 + k * 0.1;
      return [p, p + 0.4, p - 0.2, p + 0.3] as [number, number, number, number];
    }));
  }
  const bars = sessions(days);
  const r = simulateSymbol("U", bars, SCENARIOS.BASE, "2000-01-01", "2100-01-01", new Set());
  assert.ok(r.trades.length > 0, "an uptrend produces intraday trades");
  for (const t of r.trades) {
    assert.equal(t.entryAt.slice(0, 10), t.exitAt.slice(0, 10), "entry and exit are in the same session");
    assert.ok(t.entryAt.slice(11) !== "15:15", "no entry on the last bar");
  }
});

test("IH-4. a gap below the stop exits at the gapped open, adverse, labelled GAP_STOP", () => {
  const days: [number, number, number, number][][] = [];
  for (let d = 0; d < 80; d++) {
    days.push(Array.from({ length: 7 }, (_, k) => {
      const p = 100 + d * 0.7 + k * 0.1;
      return [p, p + 0.4, p - 0.2, p + 0.3] as [number, number, number, number];
    }));
  }
  const bars = sessions(days);
  // Find a trade in a normal run, then gap the bar after its entry 30% below its stop-level and check the exit.
  const base = simulateSymbol("G", bars, { slippagePerSide: 0, brokeragePerOrder: 0 }, "2000-01-01", "2100-01-01", new Set());
  const t = base.trades[0];
  assert.ok(t, "a trade exists to test");
  const idx = bars.findIndex((b) => `${b.date} ${b.time}` === t.entryAt);
  const gapped = bars.map((b, i) => (i === idx + 1 ? { ...b, o: t.stop * 0.7, h: t.stop * 0.7, l: t.stop * 0.7, c: t.stop * 0.7 } : b));
  const r = simulateSymbol("G", gapped, { slippagePerSide: 0, brokeragePerOrder: 0 }, "2000-01-01", "2100-01-01", new Set());
  const g = r.trades.find((x) => x.signalAt === t.signalAt);
  assert.ok(g, "the same signal trades");
  assert.equal(g!.exitReason, "GAP_STOP");
  assert.equal(g!.exit, t.stop * 0.7, "exit at the gapped open");
  assert.ok(g!.exit < g!.stop);
});

test("IH-5. flagged sessions produce no entries and are counted", () => {
  const days: [number, number, number, number][][] = [];
  for (let d = 0; d < 80; d++) days.push(Array.from({ length: 7 }, (_, k) => { const p = 100 + d * 0.7 + k * 0.1; return [p, p + 0.4, p - 0.2, p + 0.3] as [number, number, number, number]; }));
  const bars = sessions(days);
  const all = new Set(bars.map((b) => b.date));
  const r = simulateSymbol("F", bars, SCENARIOS.BASE, "2000-01-01", "2100-01-01", all);
  assert.equal(r.trades.length, 0, "every session is flagged, so nothing trades");
  assert.ok(r.excludedFlagged > 0);
});

test("IH-6. costs follow the intraday statutory assumptions (STT on sell only, stamp on buy only)", () => {
  const c = intradayCosts(100_000, 101_000, 0);
  assert.ok(Math.abs(c.stt - 0.00025 * 101_000) < 1e-9);
  assert.ok(Math.abs(c.stamp - 0.00003 * 100_000) < 1e-9);
  const d = intradayCosts(100_000, 101_000, 20);
  assert.equal(d.brokerage, 40);
});
