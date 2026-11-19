/* eslint-disable @typescript-eslint/no-explicit-any -- research runner kept byte-for-byte in logic; typed interfaces deferred to avoid changing research code */
// G-1 protocol V2 runner (docs/PREDICTIVE_POWER_G1_PROTOCOL_V2.md). Diagnostic only: no exits, costs or trade acceptance.
// usage: node --experimental-strip-types scripts/predictive-g1-v2.ts <1h|15m> <verifiedDir> <calendarDir> <corpValidationJson> <outDir>
// The holdout (dates after 2025-06-30) is never loaded. Refuses to run if the completeness gate fails. Writes to a new outDir.
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { ema, type HBar } from "../src/lib/research/intradayHourly.ts";
import { rsi14, sessionVwap, sessionContext, relativeStrengthLeaders } from "../src/lib/research/intradayHypotheses.ts";
import { expectedBarsPerSession } from "../src/lib/services/historicalCandles.ts";
import { NSE_SPECIAL_SESSIONS } from "../src/lib/time.ts";

const [grid, verifiedDir, calendarDir, corpJson, outDir] = process.argv.slice(2) as [string, string, string, string, string];
if (!["1h", "15m"].includes(grid) || !outDir) throw new Error("usage: <1h|15m> <verifiedDir> <calendarDir> <corpValidationJson> <outDir>");
if (fs.existsSync(outDir)) throw new Error(`${outDir} exists; diagnostic outputs are written once`);

const START = "2022-01-03", END_WINDOW = "2025-06-30";
const PERIODS: Record<string, [string, string]> = { development: ["2022-01-03", "2023-12-31"], validation: ["2024-01-01", "2025-06-30"] };
const SEED = 20261108, DRAWS = 1000, MIN_SERIES = 40;
const CFG: Record<string, { horizons: (number | "END")[]; primary: (number | "END")[] }> = {
  "1h": { horizons: [1, 3, "END"], primary: [1, "END"] },
  "15m": { horizons: [1, 4, 12, "END"], primary: [4, "END"] },
};
const SIGNALS = ["I1_TREND_CONTINUATION", "I2_BREAKOUT_VOLUME", "I3_MOMENTUM_PULLBACK", "I4_RELATIVE_STRENGTH", "I5_OPENING_RANGE", "I6_VWAP_RECLAIM", "I7_MEAN_REVERSION_SIDEWAYS", "I8_FAILED_BREAKDOWN"];
const MONTHS: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
const sha = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");
const safe = (k: string) => k.replace(/[^A-Za-z0-9]+/g, "_");
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const round = (x: number, d = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const toBps = (x: number) => x * 1e4;
const inRange = (d: string, [a, b]: [string, string]) => d >= a && d <= b;
const dOf = (t: string) => t.slice(0, 10);
const tOf = (t: string) => t.slice(11, 16);
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const isoFromExDate = (s: string) => { const m = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/); return m ? `${m[3]}-${MONTHS[m[2]]}-${m[1]}` : null; };

// ── 1. Gate ────────────────────────────────────────────────────────────────
const verification = JSON.parse(fs.readFileSync(path.join(verifiedDir, "verification.json"), "utf8"));
const coverage = JSON.parse(fs.readFileSync(path.join(verifiedDir, "coverage.json"), "utf8")).series as any[];
const calendarDoc = JSON.parse(fs.readFileSync(path.join(calendarDir, "calendar.json"), "utf8")) as { sessions: string[]; firstDaily: Record<string, string> };
const globalFailures = [
  ["missing files", verification.missingFiles.length], ["invalid files", verification.invalidFiles.length],
  ["extra files", verification.extraFiles.length], ["tmp files", verification.tmpFiles.length],
  ["manifest mismatches", verification.manifestMismatches.length], ["duplicate STORED rows", verification.manifestDuplicateStoredRows],
].filter(([, n]) => (n as number) > 0);
const gate: Record<string, unknown> = { grid, globalFailures, perSeries: {} };
if (globalFailures.length) { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, "gate.json"), JSON.stringify({ ...gate, result: "GLOBAL GATE FAILED: diagnostic not run" }, null, 1)); throw new Error(`global gate failed: ${JSON.stringify(globalFailures)}`); }

// ── 2. Exclusion inputs ───────────────────────────────────────────────────
const corp = JSON.parse(fs.readFileSync(corpJson, "utf8"));
const exDatesByIsin = new Map<string, Set<string>>();
for (const t of corp.tests as any[]) {
  const iso = isoFromExDate(t.exDate);
  if (!iso) continue;
  exDatesByIsin.set(t.isin, (exDatesByIsin.get(t.isin) ?? new Set<string>()).add(iso));
}
const special = new Set(Object.keys(NSE_SPECIAL_SESSIONS));
const calWindow = calendarDoc.sessions.filter((d) => inRange(d, [START, END_WINDOW]));
const calAll = calendarDoc.sessions;

type Series = { key: string; symbol: string; bars: [string, number, number, number, number, number][] };
const gridBars = new Map<string, Series>();
for (const f of fs.readdirSync(path.join(verifiedDir, "series")).sort()) {
  if (!f.startsWith("NSE_EQ_") || !f.endsWith(`__${grid}.json`)) continue;
  const doc = JSON.parse(fs.readFileSync(path.join(verifiedDir, "series", f), "utf8")) as Series;
  gridBars.set(doc.key, { key: doc.key, symbol: doc.symbol, bars: doc.bars.filter((b) => dOf(b[0]) <= END_WINDOW) });
}
const keys = [...gridBars.keys()].sort();
const countBy = new Map<string, Map<string, number>>();
for (const k of keys) {
  const m = new Map<string, number>();
  for (const b of gridBars.get(k)!.bars) m.set(dOf(b[0]), (m.get(dOf(b[0])) ?? 0) + 1);
  countBy.set(k, m);
}
const expectedOn = (d: string) => expectedBarsPerSession(grid as "1h" | "15m", d);

// Market-wide irregular sessions: >= 25% of listed equities have fewer bars than the regular session.
const irregular = new Set<string>();
for (const d of calWindow) {
  if (special.has(d)) continue;
  const listed = keys.filter((k) => (calendarDoc.firstDaily[k] ?? "9999") <= d);
  if (!listed.length) continue;
  const short = listed.filter((k) => (countBy.get(k)!.get(d) ?? 0) < expectedOn(d)).length;
  if (short / listed.length >= 0.25) irregular.add(d);
}

// Flagged daily moves per stock (open versus previous close > 35%), from the verified daily series.
const flaggedBy = new Map<string, Set<string>>();
for (const k of keys) {
  const f = path.join(calendarDir, "series", `${safe(k)}__1d.json`);
  const daily = JSON.parse(fs.readFileSync(f, "utf8")).bars as Series["bars"];
  const s = new Set<string>();
  for (let i = 1; i < daily.length; i++) if (Math.abs(daily[i][1] / daily[i - 1][4] - 1) > 0.35) s.add(dOf(daily[i][0]));
  flaggedBy.set(k, s);
}

// ── 3. Completeness gate per series ───────────────────────────────────────
const covByKey = new Map(coverage.map((s: any) => [s.key, s]));
const included: string[] = [];
for (const k of keys) {
  const listing = calendarDoc.firstDaily[k] ?? START;
  const exdates = exDatesByIsin.get(k.split("|")[1]) ?? new Set<string>();
  const expected = calWindow.filter((d) => d >= (listing > START ? listing : START) && !special.has(d) && !irregular.has(d) && !exdates.has(d));
  const cnt = countBy.get(k)!;
  const missing = expected.filter((d) => !cnt.has(d)).length;
  const partial = expected.filter((d) => cnt.has(d) && (cnt.get(d) as number) < expectedOn(d)).length;
  const cov = covByKey.get(k) as any;
  const droppedRatio = cov.droppedTotal / Math.max(1, cov.rawCandles);
  const pass = expected.length > 0 && missing / expected.length <= 0.01 && partial / expected.length <= 0.05 && droppedRatio <= 0.001;
  (gate.perSeries as Record<string, unknown>)[k] = { symbol: gridBars.get(k)!.symbol, expectedSessions: expected.length, missing, partial, droppedRatio: round(droppedRatio, 5), pass };
  if (pass) included.push(k);
}
gate.irregularSessions = [...irregular].sort();
gate.includedSeries = included.length;
gate.result = included.length >= MIN_SERIES ? "PASS" : "FAIL";
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "gate.json"), JSON.stringify(gate, null, 1));
if (included.length < MIN_SERIES) throw new Error(`series gate failed: ${included.length} < ${MIN_SERIES}`);

// ── 4. Analysis data per included stock (exclusions applied) ─────────────
const excludedDays = (k: string) => {
  const s = new Set<string>([...flaggedBy.get(k)!, ...(exDatesByIsin.get(k.split("|")[1]) ?? [])]);
  for (const d of special) s.add(d);
  for (const d of irregular) s.add(d);
  return s;
};
const hbars = new Map<string, HBar[]>();
for (const k of included) {
  const ex = excludedDays(k);
  hbars.set(k, gridBars.get(k)!.bars.filter((b) => !ex.has(dOf(b[0]))).map((b) => ({ t: b[0], date: dOf(b[0]), time: tOf(b[0]), o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] })));
}
const leaders = relativeStrengthLeaders(hbars);

interface Prep {
  key: string; n: number; date: string[]; time: string[]; c: Float64Array; l: Float64Array; h: Float64Array; v: Float64Array;
  e20: Float64Array; e50: Float64Array; rsi: Float64Array; vwap: Float64Array; prevLow: Float64Array; orHigh: Float64Array;
  fwd: Record<string, Float64Array>; elig: Record<string, Uint8Array>; flags: Record<string, Uint8Array>;
}
const nan = (xs: (number | null)[]) => Float64Array.from(xs.map((x) => (x === null ? NaN : x)));
const preps: Prep[] = [];
for (const k of included) {
  const hb = hbars.get(k)!;
  const n = hb.length;
  const closes = hb.map((b) => b.c);
  const e20 = nan(ema(closes, 20)), e50 = nan(ema(closes, 50)), rsi = nan(rsi14(closes));
  const vwap = nan(sessionVwap(hb));
  const ctx = sessionContext(hb);
  const prevLow = nan(ctx.prevSessionLow);
  // Opening range: highest high of the session's bars that start before 10:15.
  const orMap = new Map<string, number>();
  for (const b of hb) if (b.time < "10:15") orMap.set(b.date, Math.max(orMap.get(b.date) ?? -Infinity, b.h));
  const orHigh = Float64Array.from(hb.map((b) => orMap.get(b.date) ?? NaN));
  const last = new Int32Array(n);
  for (let i = n - 1; i >= 0; i--) last[i] = i + 1 < n && hb[i + 1].date === hb[i].date ? last[i + 1] : i;
  const fwd: Record<string, Float64Array> = {}, elig: Record<string, Uint8Array> = {};
  const c = Float64Array.from(closes), l = Float64Array.from(hb.map((b) => b.l)), h = Float64Array.from(hb.map((b) => b.h)), v = Float64Array.from(hb.map((b) => b.v));
  for (const hz of CFG[grid].horizons) {
    const f = new Float64Array(n).fill(NaN), e = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let j: number;
      if (hz === "END") { j = last[i]; if (j <= i) continue; }
      else { j = i + (hz as number); if (j >= n || hb[j].date !== hb[i].date) continue; }
      f[i] = Math.log(c[j] / c[i]);
      if (hb[i].time >= "10:15") e[i] = 1;
    }
    fwd[String(hz)] = f; elig[String(hz)] = e;
  }
  const up = (i: number) => e20[i] > e50[i];
  const flagsFor = (sig: string) => {
    const f = new Uint8Array(n);
    for (let i = 1; i < n; i++) {
      let x = false;
      switch (sig) {
        case "I1_TREND_CONTINUATION": x = up(i) && c[i] > h[i - 1]; break;
        case "I2_BREAKOUT_VOLUME": {
          if (i < 20 || !up(i)) break;
          let hh = -Infinity; for (let q = i - 10; q < i; q++) hh = Math.max(hh, h[q]);
          let vs = 0; for (let q = i - 20; q < i; q++) vs += v[q];
          x = c[i] > hh && v[i] >= 1.5 * (vs / 20); break;
        }
        case "I3_MOMENTUM_PULLBACK": x = up(i) && !Number.isNaN(e20[i - 1]) && l[i - 1] <= e20[i - 1] && c[i] > e20[i] && c[i] > c[i - 1]; break;
        case "I4_RELATIVE_STRENGTH": x = !!leaders.get(hb[i].t)?.has(k) && up(i); break;
        case "I5_OPENING_RANGE": x = !Number.isNaN(orHigh[i]) && c[i] > orHigh[i]; break;
        case "I6_VWAP_RECLAIM": x = !Number.isNaN(vwap[i - 1]) && !Number.isNaN(vwap[i]) && hb[i - 1].date === hb[i].date && c[i - 1] < vwap[i - 1] && c[i] > vwap[i]; break;
        case "I7_MEAN_REVERSION_SIDEWAYS": x = !Number.isNaN(e20[i]) && !Number.isNaN(e50[i]) && !Number.isNaN(rsi[i]) && Math.abs(e20[i] - e50[i]) / c[i] < 0.002 && rsi[i] < 30; break;
        case "I8_FAILED_BREAKDOWN": x = !Number.isNaN(prevLow[i]) && l[i - 1] < prevLow[i] && c[i] > prevLow[i]; break;
      }
      f[i] = x ? 1 : 0;
    }
    return f;
  };
  const flags: Record<string, Uint8Array> = {};
  for (const s of SIGNALS) flags[s] = flagsFor(s);
  preps.push({ key: k, n, date: hb.map((b) => b.date), time: hb.map((b) => b.time), c, l, h, v, e20, e50, rsi, vwap, prevLow, orHigh, fwd, elig, flags });
}

// ── 5. Regimes (labels use only the previous session; volatility median per period) ───────
const niftyFile = path.join(calendarDir, "series", "NSE_INDEX_Nifty_50__1d.json");
const niftyBars = JSON.parse(fs.readFileSync(niftyFile, "utf8")).bars as Series["bars"];
const niftyClose = new Map(niftyBars.map((b) => [dOf(b[0]), b[4]]));
const closesCal = calAll.map((d) => niftyClose.get(d) ?? NaN);
const rv: (number | null)[] = calAll.map((_, j) => {
  if (j < 21) return null;
  const rets: number[] = [];
  for (let q = j - 20; q < j; q++) rets.push(Math.log(closesCal[q] / closesCal[q - 1]));
  if (rets.some((x) => !Number.isFinite(x))) return null;
  const m = mean(rets);
  return Math.sqrt(rets.reduce((a, x) => a + (x - m) ** 2, 0) / (rets.length - 1)) * Math.sqrt(252);
});
const regimeOf = new Map<string, string>();
const periodMedian: Record<string, number> = {};
for (const [p, range] of Object.entries(PERIODS)) {
  const vals = calAll.map((d, j) => ({ d, v: rv[j] })).filter((x) => inRange(x.d, range) && x.v !== null).map((x) => x.v as number).sort((a, b) => a - b);
  periodMedian[p] = vals[Math.floor(vals.length / 2)];
}
calAll.forEach((d, j) => {
  if (!inRange(d, [START, END_WINDOW]) || j < 200) return;
  const prevClose = closesCal[j - 1];
  const sma = mean(closesCal.slice(j - 200, j));
  if (!Number.isFinite(prevClose) || !Number.isFinite(sma)) return;
  const trend = prevClose > sma ? "UP" : "DOWN";
  const p = Object.keys(PERIODS).find((x) => inRange(d, PERIODS[x]))!;
  const vol = rv[j] === null ? "NA" : (rv[j] as number) > periodMedian[p] ? "HIGH" : "LOW";
  regimeOf.set(d, `${trend}/${vol}`);
});

// ── 6. Baselines, pools, occurrences, nulls, statistics ─────────────────
const rng = mulberry32(SEED);
const results: Record<string, unknown>[] = [];
const cells: Record<string, any> = {};
const cellKey = (p: string, sig: string, hz: string) => `${p}|${sig}|${hz}`;
for (const [p, range] of Object.entries(PERIODS)) {
  for (const hz of CFG[grid].horizons.map(String)) {
    // Per stock, time-of-day baseline and null pools for this period and horizon (eligible bars only).
    const base: Map<string, number>[] = [], pool: Map<string, number[]>[] = [];
    preps.forEach((pr) => {
      const b = new Map<string, number>(), sum = new Map<string, number>(), cnt = new Map<string, number>(), pl = new Map<string, number[]>();
      for (let i = 0; i < pr.n; i++) {
        if (!inRange(pr.date[i], range) || !pr.elig[hz][i]) continue;
        const s = pr.time[i], x = pr.fwd[hz][i];
        sum.set(s, (sum.get(s) ?? 0) + x); cnt.set(s, (cnt.get(s) ?? 0) + 1);
        const arr = pl.get(s) ?? []; arr.push(i); pl.set(s, arr);
      }
      for (const [s, t] of sum) b.set(s, t / (cnt.get(s) as number));
      base.push(b); pool.push(pl);
    });
    for (const sig of SIGNALS) {
      const occ: { k: number; i: number; x: number; date: string; fwd: number; pl: number[]; fa: Float64Array; b: number }[] = [];
      preps.forEach((pr, k) => {
        for (let i = 0; i < pr.n; i++) {
          if (!inRange(pr.date[i], range) || !pr.elig[hz][i] || !pr.flags[sig][i]) continue;
          const b = base[k].get(pr.time[i]) as number;
          occ.push({ k, i, x: pr.fwd[hz][i] - b, date: pr.date[i], fwd: pr.fwd[hz][i], pl: pool[k].get(pr.time[i]) as number[], fa: pr.fwd[hz], b });
        }
      });
      const N = occ.length;
      const xs = occ.map((o) => o.x);
      const obs = mean(xs);
      const sd = N > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - obs) ** 2, 0) / (N - 1)) : NaN;
      const byDate = new Map<string, number>();
      for (const o of occ) byDate.set(o.date, (byDate.get(o.date) ?? 0) + (o.x - obs));
      const seSum = [...byDate.values()].reduce((a, s) => a + s * s, 0);
      const se = N > 0 ? Math.sqrt(seSum) / N : NaN;
      // Null: same stock, period and time-of-day slot, fixed seed, DRAWS repetitions.
      const nulls: number[] = [];
      for (let d = 0; d < DRAWS && N > 0; d++) {
        let sm = 0;
        for (const o of occ) sm += o.fa[o.pl[Math.floor(rng() * o.pl.length)]] - o.b;
        nulls.push(sm / N);
      }
      const pct = N > 0 ? (100 * nulls.filter((x) => x < obs).length) / DRAWS : NaN;
      const regimes: Record<string, { n: number; meanBps: number | null; hit: number | null }> = {};
      const regimeGroups = new Map<string, number[]>();
      for (const o of occ) { const r = regimeOf.get(o.date) ?? "NA"; regimeGroups.set(r, [...(regimeGroups.get(r) ?? []), o.x]); }
      for (const [r, arr] of regimeGroups) regimes[r] = { n: arr.length, meanBps: round(toBps(mean(arr))), hit: round(arr.filter((x) => x > 0).length / arr.length, 3) };
      const stocks: Record<string, { n: number; meanBps: number | null }> = {};
      preps.forEach((pr, k) => {
        const arr = occ.filter((o) => o.k === k).map((o) => o.x);
        if (arr.length) stocks[pr.key.split("|")[1]] = { n: arr.length, meanBps: round(toBps(mean(arr))) };
      });
      const baselineFwdMean = mean(preps.flatMap((pr, k) => { const out: number[] = []; for (let i = 0; i < pr.n; i++) if (inRange(pr.date[i], range) && pr.elig[hz][i]) out.push(pr.fwd[hz][i]); return out; }));
      cells[cellKey(p, sig, hz)] = {
        period: p, signal: sig, horizon: hz, n: N, distinctDates: byDate.size,
        forwardReturnBps: round(toBps(mean(occ.map((o) => o.fwd)))),
        eligibleUnconditionalForwardBps: round(toBps(baselineFwdMean)),
        meanExcessBps: round(toBps(obs)), ci95Bps: N > 0 ? [round(toBps(obs - 1.96 * se)), round(toBps(obs + 1.96 * se))] : null,
        tIID: round(obs / (sd / Math.sqrt(N))), tDateClustered: round(obs / se),
        hitRate: round(xs.filter((x) => x > 0).length / N, 3),
        nullMeanBps: round(toBps(mean(nulls))), nullPercentile: round(pct, 1),
        byRegime: regimes, byStock: stocks,
      };
    }
  }
}

// ── 7. Decision rule (V2) ───────────────────────────────────────────────
const decisions = SIGNALS.map((sig) => {
  const per = CFG[grid].primary.map(String).map((hz) => {
    const v = cells[cellKey("validation", sig, hz)], d = cells[cellKey("development", sig, hz)];
    const ok = v.n > 0 && v.meanExcessBps > 0 && v.nullPercentile >= 97.5 && v.ci95Bps[0] > 0 && d.meanExcessBps > 0;
    return { horizon: hz, validationMeanBps: v.meanExcessBps, validationNullPct: v.nullPercentile, validationCi95Bps: v.ci95Bps, developmentMeanBps: d.meanExcessBps, pass: ok };
  });
  return { signal: sig, primaryHorizons: per, pass: per.every((x) => x.pass) };
});
for (const c of Object.values(cells)) results.push(c);
const runMeta = {
  createdAt: new Date().toISOString(), grid, protocol: "docs/PREDICTIVE_POWER_G1_PROTOCOL_V2.md", protocolSha256: sha(fs.readFileSync(path.resolve(import.meta.dirname, "..", "..", "docs", "PREDICTIVE_POWER_G1_PROTOCOL_V2.md"))),
  seed: SEED, draws: DRAWS, includedSeries: included, periods: PERIODS, periodVolatilityMedian: periodMedian,
  inputs: { verificationSha256: sha(fs.readFileSync(path.join(verifiedDir, "verification.json"))), calendarSha256: sha(fs.readFileSync(path.join(calendarDir, "calendar.json"))), corpValidationSha256: sha(fs.readFileSync(corpJson)) },
  holdoutLoaded: false, multiplicity: `${SIGNALS.length} signals x ${CFG[grid].horizons.length} horizons x ${Object.keys(PERIODS).length} periods`,
};
fs.writeFileSync(path.join(outDir, `g1v2-${grid}.json`), JSON.stringify({ runMeta, decisions, cells: results }, null, 1));
console.log(JSON.stringify({ grid, included: included.length, irregularSessions: irregular.size, decisions: decisions.map((d) => ({ s: d.signal, pass: d.pass, primary: d.primaryHorizons.map((x) => ({ h: x.horizon, valMeanBps: x.validationMeanBps, pct: x.validationNullPct, ci: x.validationCi95Bps, devMeanBps: x.developmentMeanBps })) })) }));
