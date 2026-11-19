// Runs docs/PREDICTIVE_POWER_DIAGNOSTIC_G1.md on the one-hour grid. Diagnostic only: forward returns, time-of-day baseline,
// time-of-day-matched random nulls and regimes. No exits, costs or trade acceptance. Holdout not used. New directory only.
import * as fs from "node:fs";
import * as path from "node:path";
import { ema, standardGrid, type HBar } from "../src/lib/research/intradayHourly.ts";
import { rsi14, sessionVwap, sessionContext, relativeStrengthLeaders } from "../src/lib/research/intradayHypotheses.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const CLEAN = path.join(ROOT, ".research-data", "upstox-clean-2026-11-06-v1");
const OUT = path.join(ROOT, ".research-data", "predictive-g1-2026-11-06-1h");
const PERIODS = { development: ["2022-01-03", "2023-12-31"], validation: ["2024-01-01", "2025-06-30"] } as const;
const NULL_DRAWS = 200;
const SIGNALS = ["I1_TREND_CONTINUATION", "I2_BREAKOUT_VOLUME", "I3_MOMENTUM_PULLBACK", "I4_RELATIVE_STRENGTH", "I5_OPENING_RANGE", "I6_VWAP_RECLAIM", "I7_MEAN_REVERSION_SIDEWAYS", "I8_FAILED_BREAKDOWN"] as const;

interface Doc<T> { summary: { symbol: string }; bars: T[] }
interface U { symbol: string; std: HBar[]; flagged: Set<string> }

function loadUniverse(): U[] {
  const out: U[] = [];
  for (const f of fs.readdirSync(CLEAN).sort()) {
    if (!f.startsWith("NSE_EQ_") || !f.endsWith("__1h.json")) continue;
    const h = JSON.parse(fs.readFileSync(path.join(CLEAN, f), "utf8")) as Doc<{ t: string; o: number; h: number; l: number; c: number; v: number }>;
    const d = JSON.parse(fs.readFileSync(path.join(CLEAN, f.replace("__1h.json", "__1d.json")), "utf8")) as Doc<{ t: string; o: number; c: number }>;
    const flagged = new Set<string>();
    for (let i = 1; i < d.bars.length; i++) if (Math.abs(d.bars[i].o / d.bars[i - 1].c - 1) > 0.35) flagged.add(d.bars[i].t.slice(0, 10));
    const raw: HBar[] = h.bars.map((b) => ({ t: b.t, date: b.t.slice(0, 10), time: b.t.slice(11, 16), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
    out.push({ symbol: h.summary.symbol, std: standardGrid(raw).bars.filter((b) => !flagged.has(b.date)), flagged });
  }
  return out;
}

// Signal flags on one stock's grid, with the time-of-day restriction removed (first bar of a session excluded).
function flags(sig: typeof SIGNALS[number], bars: HBar[], leaders: Map<string, Set<string>>, symbol: string): boolean[] {
  const closes = bars.map((b) => b.c);
  const e20 = ema(closes, 20), e50 = ema(closes, 50), rsi = rsi14(closes), vwap = sessionVwap(bars), ctx = sessionContext(bars);
  const out = new Array(bars.length).fill(false);
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    if (b.time === "09:15") continue;
    const up = e20[i] !== null && e50[i] !== null && (e20[i] as number) > (e50[i] as number);
    let f = false;
    switch (sig) {
      case "I1_TREND_CONTINUATION": f = up && b.c > bars[i - 1].h; break;
      case "I2_BREAKOUT_VOLUME": {
        if (i < 20 || !up) break;
        let hh = -Infinity; for (let k = i - 10; k < i; k++) hh = Math.max(hh, bars[k].h);
        let vs = 0; for (let k = i - 20; k < i; k++) vs += bars[k].v;
        f = b.c > hh && b.v >= 1.5 * (vs / 20); break;
      }
      case "I3_MOMENTUM_PULLBACK": {
        const pv = e20[i - 1];
        f = up && pv !== null && bars[i - 1].l <= pv && b.c > (e20[i] as number) && b.c > bars[i - 1].c; break;
      }
      case "I4_RELATIVE_STRENGTH": f = !!leaders.get(b.t)?.has(symbol) && up; break;
      case "I5_OPENING_RANGE": { const or = ctx.openingRangeHigh[i]; f = or !== null && b.c > or; break; }
      case "I6_VWAP_RECLAIM": { const vp = vwap[i - 1], vn = vwap[i]; f = vp !== null && vn !== null && bars[i - 1].date === b.date && bars[i - 1].c < vp && b.c > vn; break; }
      case "I7_MEAN_REVERSION_SIDEWAYS": { const a = e20[i], c = e50[i], r = rsi[i]; f = a !== null && c !== null && r !== null && Math.abs(a - c) / b.c < 0.002 && r < 30; break; }
      case "I8_FAILED_BREAKDOWN": { const pl = ctx.prevSessionLow[i]; f = pl !== null && bars[i - 1].l < pl && b.c > pl; break; }
    }
    out[i] = f;
  }
  return out;
}

// Forward log return from bar i over horizon: 1, 3 bars, or the session end. Same-session only; null if unavailable.
function forward(bars: HBar[], i: number, h: 1 | 3 | "END"): number | null {
  let j: number;
  if (h === "END") {
    j = i;
    while (j + 1 < bars.length && bars[j + 1].date === bars[i].date) j++;
    if (j === i) return null;
  } else {
    j = i + h;
    if (j >= bars.length || bars[j].date !== bars[i].date) return null;
  }
  return Math.log(bars[j].c / bars[i].c);
}

const slotKey = (b: HBar) => b.time;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs: number[]) => { const m = mean(xs); return m === null || xs.length < 2 ? null : Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); };

function regimes(universe: U[]): Map<string, { trend: "UP" | "DOWN" | null; vol: "HIGH" | "LOW" | null }> {
  // NIFTY 50 daily, restricted to the equity calendar (dates where at least half the stocks traded).
  const dailyDir = CLEAN;
  const nifty = JSON.parse(fs.readFileSync(path.join(dailyDir, "NSE_INDEX_Nifty_50__1d.json"), "utf8")) as Doc<{ t: string; c: number }>;
  const cal = new Set<string>();
  const counts = new Map<string, number>();
  for (const u of universe) for (const b of u.std) counts.set(b.date, (counts.get(b.date) ?? 0) + 1);
  for (const [d, n] of counts) if (n >= Math.ceil(universe.length / 2)) cal.add(d);
  const days = nifty.bars.map((b) => ({ d: b.t.slice(0, 10), c: b.c })).filter((x) => cal.has(x.d));
  const rv: (number | null)[] = days.map((_, i) => {
    if (i < 20) return null;
    const rets: number[] = [];
    for (let k = i - 19; k <= i; k++) rets.push(Math.log(days[k].c / days[k - 1].c));
    return Math.sqrt(rets.reduce((a, r) => a + r * r, 0) / rets.length) * Math.sqrt(252);
  });
  const valid = rv.filter((x): x is number => x !== null).sort((a, b) => a - b);
  const medVol = valid[Math.floor(valid.length / 2)];
  const out = new Map<string, { trend: "UP" | "DOWN" | null; vol: "HIGH" | "LOW" | null }>();
  days.forEach((x, i) => {
    let trend: "UP" | "DOWN" | null = null;
    if (i >= 199) {
      let s = 0; for (let k = i - 199; k <= i; k++) s += days[k].c;
      trend = x.c > s / 200 ? "UP" : "DOWN";
    }
    const v = rv[i];
    out.set(x.d, { trend, vol: v === null ? null : v > medVol ? "HIGH" : "LOW" });
  });
  return out;
}

function main() {
  if (fs.existsSync(OUT)) throw new Error(`${OUT} exists: diagnostics are written once`);
  fs.mkdirSync(OUT, { recursive: true });
  const universe = loadUniverse();
  const leaders = relativeStrengthLeaders(new Map(universe.map((u) => [u.symbol, u.std])));
  const reg = regimes(universe);
  const results: Record<string, unknown>[] = [];
  for (const [pname, [from, to]] of Object.entries(PERIODS)) {
    // Per stock: eligible bars with forward returns, and time-of-day baselines.
    const H = [1, 3, "END"] as const;
    const baseline = new Map<string, number[]>(); // key: h|slot → forward returns of all eligible bars
    const perStock: { symbol: string; bars: HBar[]; flagsBySig: Map<string, boolean[]> }[] = [];
    for (const u of universe) {
      const bars = u.std.filter((b) => b.date >= from && b.date <= to);
      const fl = new Map<string, boolean[]>();
      // flags need the full history for indicators; compute on the full series, then restrict.
      for (const s of SIGNALS) fl.set(s, flags(s, u.std, leaders, u.symbol).filter((_, i) => u.std[i].date >= from && u.std[i].date <= to));
      perStock.push({ symbol: u.symbol, bars, flagsBySig: fl });
      for (const h of H) for (let i = 0; i < bars.length; i++) {
        const r = forward(bars, i, h);
        if (r === null || bars[i].time === "09:15") continue;
        const key = `${h}|${slotKey(bars[i])}`;
        const arr = baseline.get(key) ?? []; arr.push(r); baseline.set(key, arr);
      }
    }
    const baseMean = (h: typeof H[number], slot: string) => mean(baseline.get(`${h}|${slot}`) ?? []) ?? 0;
    for (const sig of SIGNALS) {
      for (const h of H) {
        const excess: { x: number; regime: string; slot: string; symbol: string; time: string }[] = [];
        const eligibleBySymbol = new Map<string, { slot: string; i: number; bars: HBar[] }[]>();
        for (const ps of perStock) {
          const f = ps.flagsBySig.get(sig)!;
          const elig: { slot: string; i: number; bars: HBar[] }[] = [];
          for (let i = 0; i < ps.bars.length; i++) {
            if (ps.bars[i].time === "09:15") continue;
            if (forward(ps.bars, i, h) === null) continue;
            elig.push({ slot: ps.bars[i].time, i, bars: ps.bars });
            if (!f[i]) continue;
            const r = forward(ps.bars, i, h)!;
            const rg = reg.get(ps.bars[i].date) ?? { trend: null, vol: null };
            excess.push({ x: r - baseMean(h, ps.bars[i].time), regime: `${rg.trend ?? "NA"}/${rg.vol ?? "NA"}`, slot: ps.bars[i].time, symbol: ps.symbol, time: ps.bars[i].date });
          }
          eligibleBySymbol.set(ps.symbol, elig);
        }
        const obs = excess.map((e) => e.x);
        const m = mean(obs), s = sd(obs);
        // Time-of-day-matched null: for each signal occurrence, draw an eligible bar of the same stock and slot.
        const nullMeans: number[] = [];
        // Precompute, per stock: the signal occurrences' slots, and the eligible bars grouped by slot.
        const occSlots = new Map<string, string[]>();
        for (const e of excess) occSlots.set(e.symbol, [...(occSlots.get(e.symbol) ?? []), e.slot]);
        const poolBySymbol = new Map<string, Map<string, { bars: HBar[]; i: number }[]>>();
        for (const [sym, elig] of eligibleBySymbol) {
          const m2 = new Map<string, { bars: HBar[]; i: number }[]>();
          for (const x of elig) m2.set(x.slot, [...(m2.get(x.slot) ?? []), { bars: x.bars, i: x.i }]);
          poolBySymbol.set(sym, m2);
        }
        for (let d = 0; d < NULL_DRAWS; d++) {
          let sum = 0, n = 0;
          for (const [sym, slots] of occSlots) {
            const pools = poolBySymbol.get(sym)!;
            for (const slot of slots) {
              const pool = pools.get(slot);
              if (!pool || !pool.length) continue;
              const pick = pool[Math.floor(Math.random() * pool.length)];
              sum += forward(pick.bars, pick.i, h)! - baseMean(h, slot); n++;
            }
          }
          if (n) nullMeans.push(sum / n);
        }
        const pct = m === null ? null : nullMeans.filter((x) => x < m).length / nullMeans.length * 100;
        const byRegime: Record<string, { n: number; meanBps: number | null }> = {};
        for (const e of excess) {
          const r = byRegime[e.regime] ?? { n: 0, meanBps: null };
          byRegime[e.regime] = { n: r.n + 1, meanBps: null };
        }
        for (const k of Object.keys(byRegime)) {
          const xs = excess.filter((e) => e.regime === k).map((e) => e.x);
          byRegime[k] = { n: xs.length, meanBps: mean(xs) === null ? null : Math.round(mean(xs)! * 1e4 * 100) / 100 };
        }
        results.push({
          period: pname, signal: sig, horizon: String(h), n: obs.length,
          meanExcessBps: m === null ? null : Math.round(m * 1e4 * 100) / 100,
          tStatUpperBound: m === null || s === null || obs.length < 2 ? null : Math.round((m / (s / Math.sqrt(obs.length))) * 100) / 100,
          hitRate: obs.length ? Math.round(obs.filter((x) => x > 0).length / obs.length * 1000) / 1000 : null,
          nullPercentile: pct === null ? null : Math.round(pct * 10) / 10,
          byRegime,
        });
        console.log(JSON.stringify({ period: pname, signal: sig, h, n: obs.length, excessBps: results.at(-1)!.meanExcessBps, pct: results.at(-1)!.nullPercentile }));
      }
    }
  }
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ createdAt: new Date().toISOString(), protocol: "docs/PREDICTIVE_POWER_DIAGNOSTIC_G1.md", holdoutUsed: false, results }, null, 2));
  console.log("written", path.relative(ROOT, OUT));
}

main();
