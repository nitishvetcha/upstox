// Phase B, stage 2: coverage and quality report over the immutable raw store, and a separate derived (cleaned) dataset.
// Raw files are read only. Derived output goes to a NEW directory. Prices are never adjusted here: candidate corporate
// actions are flagged, not corrected.
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { expectedBarsPerSession } from "../src/lib/services/historicalCandles.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const RAW = path.join(ROOT, ".research-data", "upstox-raw-2026-11-06-v1");
const OUT = path.join(ROOT, ".research-data", "upstox-clean-2026-11-06-v1");
const JUMP = 0.35; // open versus previous close: flag for review, do not adjust

type Bar = { t: string; o: number; h: number; l: number; c: number; v: number };
interface Series { key: string; symbol: string; interval: "1d" | "1h"; bars: Bar[]; rawChunks: number; rawBars: number }

function istDate(iso: string): string {
  return new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 10);
}

function loadSeries(): Map<string, Series> {
  const out = new Map<string, Series>();
  for (const interval of ["1d", "1h"] as const) {
    const dir = path.join(RAW, interval);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const rec = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const id = `${rec.instrumentKey}|${interval}`;
      let s = out.get(id);
      if (!s) { s = { key: rec.instrumentKey, symbol: rec.symbol, interval, bars: [], rawChunks: 0, rawBars: 0 }; out.set(id, s); }
      s.rawChunks++;
      const candles = rec.body?.data?.candles ?? [];
      s.rawBars += candles.length;
      for (const row of candles) {
        s.bars.push({ t: row[0], o: row[1], h: row[2], l: row[3], c: row[4], v: row[5] });
      }
    }
  }
  return out;
}

// Trading calendar, derived from the equity daily series. The NIFTY 50 daily series is NOT usable: it publishes bars
// with zero volume on exchange holidays (checked: 2003-03-22, 2003-10-25, 2003-11-15, with only 4 of 52 stocks trading).
// A session is a date on which at least half of the stocks already listed that day have a bar. The NSE holiday table in
// the app only covers 2025–2026, so it is not used.
let CALENDAR: Set<string> = new Set();
function calendarFrom(series: Map<string, Series>) {
  const stocks = [...series.values()].filter((x) => x.interval === "1d" && x.key.startsWith("NSE_EQ"));
  const firstBar = stocks.map((x) => x.bars.reduce((m, b) => (m === null || b.t < m ? b.t : m), null as string | null)).filter(Boolean) as string[];
  const perDay = new Map<string, number>();
  for (const x of stocks) for (const b of x.bars) { const d = istDate(b.t); perDay.set(d, (perDay.get(d) ?? 0) + 1); }
  const days = [...perDay.keys()].sort();
  CALENDAR = new Set();
  for (const d of days) {
    const listed = firstBar.filter((t) => istDate(t) <= d).length;
    if (listed > 0 && (perDay.get(d) ?? 0) >= Math.max(1, Math.ceil(listed / 2))) CALENDAR.add(d);
  }
  if (!CALENDAR.size) throw new Error("equity calendar could not be derived");
}

function analyse(s: Series) {
  const seen = new Map<string, Bar>();
  let duplicates = 0, conflicting = 0;
  for (const b of s.bars) {
    const prev = seen.get(b.t);
    if (prev) {
      duplicates++;
      if (prev.o !== b.o || prev.c !== b.c || prev.h !== b.h || prev.l !== b.l) conflicting++;
      continue;
    }
    seen.set(b.t, b);
  }
  const bars = [...seen.values()].sort((a, b) => a.t.localeCompare(b.t));
  const bySession = new Map<string, number>();
  for (const b of bars) bySession.set(istDate(b.t), (bySession.get(istDate(b.t)) ?? 0) + 1);
  const first = bars[0]?.t.slice(0, 10) ?? null, last = bars.at(-1)?.t.slice(0, 10) ?? null;
  const jumps: { t: string; movePct: number }[] = [];
  for (let i = 1; i < bars.length; i++) {
    const move = bars[i].o / bars[i - 1].c - 1;
    if (Math.abs(move) > JUMP && s.interval === "1d") jumps.push({ t: bars[i].t.slice(0, 10), movePct: Math.round(move * 1000) / 10 });
  }
  const missingSessions: string[] = [];
  const partial: { day: string; bars: number; expected: number }[] = [];
  let tradingCount = 0;
  if (first && last) {
    const cal = [...CALENDAR].filter((d) => d >= first && d <= last).sort();
    tradingCount = cal.length;
    for (const d of cal) {
      const n = bySession.get(d) ?? 0;
      if (n === 0) missingSessions.push(d);
      else if (s.interval === "1h" && n < expectedBarsPerSession("1h", d)) partial.push({ day: d, bars: n, expected: expectedBarsPerSession("1h", d) });
    }
  }
  const hash = crypto.createHash("sha256").update(JSON.stringify(bars)).digest("hex");
  return {
    instrumentKey: s.key, symbol: s.symbol, interval: s.interval,
    rawChunks: s.rawChunks, rawBars: s.rawBars, uniqueBars: bars.length, duplicateBars: duplicates, conflictingDuplicates: conflicting,
    firstSession: first, lastSession: last, tradingSessionsInSpan: tradingCount,
    sessionsWithBars: bySession.size, missingSessions: missingSessions.length, missingSessionSample: missingSessions.slice(0, 8),
    partialSessions: partial.length, possibleCorporateActionsOrBadPrints: jumps, cleanedSha256: hash,
    bars,
  };
}

function main() {
  const series = loadSeries();
  calendarFrom(series);
  fs.mkdirSync(OUT, { recursive: true });
  const report: Record<string, unknown>[] = [];
  for (const s of series.values()) {
    const a = analyse(s);
    const { bars, ...summary } = a;
    fs.writeFileSync(path.join(OUT, `${s.key.replace(/[^A-Za-z0-9]+/g, "_")}__${s.interval}.json`), JSON.stringify({ summary, bars }));
    report.push({ ...summary, possibleCorporateActionsOrBadPrints: summary.possibleCorporateActionsOrBadPrints.length });
  }
  fs.writeFileSync(path.join(OUT, "coverage-report.json"), JSON.stringify({ createdAt: new Date().toISOString(), sourceRaw: path.relative(ROOT, RAW), jumpThreshold: JUMP, series: report }, null, 2));
  console.log(JSON.stringify({ series: report.length, outDir: path.relative(ROOT, OUT) }));
}

main();
