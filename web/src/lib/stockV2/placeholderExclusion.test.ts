// Stock V2 research variant: closing placeholders (15:15–15:29, flat, zero volume) excluded before indicators.
// Offline and deterministic: synthetic sessions with a seeded random walk, no files, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ema, type Bar } from "./indicators.ts";
import { analysisSeries, istMinute, simulateStock } from "./simulate.ts";
import { isClosingPlaceholder } from "./dataset.ts";

const DATES = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"];

// mulberry32: small deterministic PRNG.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One session per date, 09:15–15:29 IST (375 bars). 15:15–15:29 are flat at the 15:14 close, zero volume, labelled as the loader does,
// except 15:28, which carries real volume in the stored files: 14 placeholders per session.
function sessions(seed = 7): Bar[] {
  const rand = rng(seed);
  const out: Bar[] = [];
  let px = 100;
  for (const date of DATES) {
    for (let k = 0; k < 375; k++) {
      const totalMin = 9 * 60 + 15 + k;
      const hh = String(Math.floor(totalMin / 60)).padStart(2, "0");
      const mm = String(totalMin % 60).padStart(2, "0");
      const timestamp = `${date}T${hh}:${mm}:00+05:30`;
      const isPlaceholderMinute = totalMin >= 15 * 60 + 15 && totalMin !== 15 * 60 + 28;
      let bar: Bar;
      if (isPlaceholderMinute) {
        bar = { timestamp, open: px, high: px, low: px, close: px, volume: 0 };
      } else {
        const open = px;
        const close = open + 0.02 + (rand() - 0.5) * 0.4;
        bar = { timestamp, open, high: Math.max(open, close) + rand() * 0.1, low: Math.min(open, close) - rand() * 0.1, close, volume: 1000 + Math.floor(rand() * 500) };
        px = close;
      }
      bar.placeholder = isClosingPlaceholder(bar) || undefined;
      out.push(bar);
    }
  }
  return out;
}

const withoutPlaceholders = (bars: Bar[]) => bars.filter((b) => !b.placeholder);
const CORE = { gateMode: "CORE" as const };

test("PH-1. analysisSeries drops exactly the labelled placeholders, keeps order, and does not change the stored bars", () => {
  const bars = sessions();
  const before = structuredClone(bars);
  const placeholders = bars.filter((b) => b.placeholder).length;
  assert.equal(placeholders, 14 * DATES.length, "14 closing placeholders per session");
  const kept = analysisSeries(bars, true);
  assert.equal(kept.length, bars.length - placeholders);
  assert.ok(kept.every((b) => !b.placeholder));
  assert.deepEqual(analysisSeries(bars, false), bars, "default returns the stored series unchanged");
  assert.deepEqual(bars, before, "stored bars are not mutated");
});

test("PH-2. excluding placeholders is the same as never having them: identical sessions and trades", () => {
  const bars = sessions();
  for (const strategy of ["TREND_RECLAIM", "PULLBACK_RECLAIM"] as const) {
    const excluded = simulateStock("SYN", bars, {}, { strategy, excludePlaceholders: true, ...CORE });
    const absent = simulateStock("SYN", withoutPlaceholders(bars), {}, { strategy, ...CORE });
    // missingMinutes is compared in PH-6: removing the bars creates an artificial gap in the copy, not in the stored session.
    const strip = (xs: typeof excluded.sessions) => xs.map((x) => ({ date: x.date, status: x.status, reasons: x.reasons }));
    assert.deepEqual(strip(excluded.sessions), strip(absent.sessions), `${strategy}: session outcomes`);
    assert.deepEqual(excluded.trades, absent.trades, `${strategy}: trades`);
  }
});

test("PH-3. with placeholders kept, the closes change the EMAs at the next session's open (the defect this variant removes)", () => {
  const bars = sessions();
  const withPh = analysisSeries(bars, false).map((b) => b.close);
  const without = analysisSeries(bars, true).map((b) => b.close);
  const e21WithPh = ema(withPh, 21);
  const e21Without = ema(without, 21);
  // First bar of the second session, in the stored series.
  const firstOfDay2 = bars.findIndex((b) => b.timestamp.startsWith(DATES[1]));
  const idxWith = firstOfDay2;
  const idxWithout = without.findIndex((_, i) => analysisSeries(bars, true)[i].timestamp.startsWith(DATES[1]));
  const a = e21WithPh[idxWith];
  const c = e21Without[idxWithout];
  assert.ok(a !== null && c !== null);
  assert.notEqual(a, c, "EMA-21 on the first bar of day 2 depends on the previous afternoon's placeholders when they are kept");
});

test("PH-4. no trade enters or exits on a closing-window minute, in either mode", () => {
  const bars = sessions();
  for (const excludePlaceholders of [false, true]) {
    for (const strategy of ["TREND_RECLAIM", "PULLBACK_RECLAIM"] as const) {
      const { trades } = simulateStock("SYN", bars, {}, { strategy, excludePlaceholders, ...CORE });
      for (const t of trades) {
        assert.ok(istMinute(t.entryTime) < 15 * 60 + 15, `entry ${t.entryTime}`);
        assert.ok(istMinute(t.exitTime) < 15 * 60 + 15, `exit ${t.exitTime}`);
      }
    }
  }
});

test("PH-5. the default is off: an explicit false is the same as omitting the option", () => {
  const bars = sessions();
  const omitted = simulateStock("SYN", bars, {}, { strategy: "TREND_RECLAIM", ...CORE });
  const explicit = simulateStock("SYN", bars, {}, { strategy: "TREND_RECLAIM", excludePlaceholders: false, ...CORE });
  assert.deepEqual(omitted, explicit);
});

test("PH-6. missing minutes are counted on the stored session, so exclusion does not invent gaps", () => {
  const bars = sessions();
  const { sessions: outcomes } = simulateStock("SYN", bars, {}, { strategy: "TREND_RECLAIM", excludePlaceholders: true, ...CORE });
  assert.ok(outcomes.every((s) => s.missingMinutes === 0));
});
