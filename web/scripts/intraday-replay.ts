// Historical replay of the intraday stock strategy (docs/intraday-replay-rules.md, intraday-replay-1).
// Resumable: completed history chunks are cached in .data/history. Writes results only to .data/intraday-replay/.
// Run: node --max-old-space-size=6144 scripts/intraday-replay.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadHistory } from "../src/lib/marketHistory.ts";
import { upstoxHistoryFetcher } from "../src/lib/services/upstoxMarket.ts";
import { getAccessToken } from "../src/lib/services/upstoxAuth.ts";
import { NIFTY_50 } from "../src/lib/services/breadthConstituents.generated.ts";
import { replayDay, validateDay, REPLAY_VERSION, type DayBars, type DayCounters, type ReplayTrade } from "../src/lib/engine/intradayReplay.ts";
import { netTrade, groupStats, type EvalTrade } from "../src/lib/intradayEvaluation.ts";
import type { PaperOpportunity } from "../src/lib/services/paperOpportunityStore.ts";
import type { Candle } from "../src/lib/types.ts";

const FROM = "2022-01-03", TO = "2026-10-23", DEV_END = "2024-12-31";
const token = await getAccessToken();
if (!token) throw new Error("BLOCKER: Upstox not connected — log in, then re-run (cached data is kept)");
const f = upstoxHistoryFetcher(token);
const say = console.log;
console.info = () => {}; // per-request logs off; failures still print via console.warn

const days = new Map<string, DayBars[]>();
const counters: DayCounters = { droppedOutsideSession: 0, droppedBadTz: 0, duplicates: 0, reordered: 0 };
const excluded: Record<string, number> = {};
const coverage: Record<string, { firstDate: string | null; validDays: number; excludedDays: number; failedChunks: number }> = {};
let k = 0;
for (const s of NIFTY_50) {
  const daily = (await loadHistory(s.instrumentKey, "1d", "5Y", f)).candles;
  const prevClose = new Map<string, number>();
  for (let i = 1; i < daily.length; i++) prevClose.set(daily[i].timestamp.slice(0, 10), daily[i - 1].close);
  const h = await loadHistory(s.instrumentKey, "1m", "MAX", f);
  const byDay = new Map<string, Candle[]>();
  for (const c of h.candles) {
    const d = c.timestamp.slice(0, 10);
    if (d < FROM || d > TO) continue;
    const arr = byDay.get(d); if (arr) arr.push(c); else byDay.set(d, [c]);
  }
  const cov = { firstDate: null as string | null, validDays: 0, excludedDays: 0, failedChunks: h.coverage?.failedChunks?.length ?? 0 };
  for (const d of [...byDay.keys()].sort()) {
    const r = validateDay(s.symbol, byDay.get(d)!, prevClose.get(d), counters);
    if (typeof r === "string") { excluded[r] = (excluded[r] ?? 0) + 1; cov.excludedDays++; continue; }
    cov.firstDate ??= d;
    cov.validDays++;
    const list = days.get(d); if (list) list.push(r); else days.set(d, [r]);
  }
  coverage[s.symbol] = cov;
  say(`[${++k}/${NIFTY_50.length}] ${s.symbol}: ${cov.validDays} valid days, ${cov.excludedDays} excluded, first ${cov.firstDate}, failed chunks ${cov.failedChunks}`);
}

// Replay chronologically; identity set spans the whole replay (as the live collector's store does).
const order = new Map<string, number>(NIFTY_50.map((s, i) => [s.symbol, i]));
const seen = new Set<string>();
const trades: ReplayTrade[] = [];
let sessionsReplayed = 0, sessionsSkipped = 0;
for (const d of [...days.keys()].sort()) {
  const stocks = days.get(d)!.sort((a, b) => order.get(a.symbol)! - order.get(b.symbol)!);
  if (stocks.length <= 10) { sessionsSkipped++; continue; }
  sessionsReplayed++;
  trades.push(...replayDay(d, stocks, seen));
}

const asPaper = (t: ReplayTrade, i: number) => ({ id: `r${i}`, createdAt: `${t.date}T05:00:00.000Z`, direction: t.direction, entry: t.entry,
  exitPrice: t.exit, riskPerUnit: t.riskPerUnit, realizedR: t.grossR }) as unknown as PaperOpportunity;
const ev: EvalTrade[] = trades.map((t, i) => netTrade(asPaper(t, i)));
const period = (from: string, to: string) => {
  const p = ev.filter((t) => t.session >= from && t.session <= to);
  const pt = trades.filter((t) => t.date >= from && t.date <= to);
  return {
    from, to,
    combined: groupStats(p), long: groupStats(p.filter((t) => t.side === "LONG")), short: groupStats(p.filter((t) => t.side === "SHORT")),
    grossMeanR: p.length ? +(p.reduce((a, t) => a + t.grossR, 0) / p.length).toFixed(3) : null,
    exits: pt.reduce((m: Record<string, number>, t) => ((m[t.exitReason] = (m[t.exitReason] ?? 0) + 1), m), {}),
  };
};
const byYear = Object.fromEntries([...new Set(ev.map((t) => t.session.slice(0, 4)))].sort().map((y) => {
  const ys = ev.filter((t) => t.session.startsWith(y));
  return [y, { trades: ys.length, sessions: new Set(ys.map((t) => t.session)).size, meanNetR: +(ys.reduce((a, t) => a + t.netR, 0) / ys.length).toFixed(3), meanGrossR: +(ys.reduce((a, t) => a + t.grossR, 0) / ys.length).toFixed(3) }];
}));
const result = {
  version: REPLAY_VERSION, strategy: "Opportunity Engine v20.1 intraday stock (live code via scoreIntradayQuote)",
  range: { FROM, TO }, sessionsReplayed, sessionsSkipped, dataValidation: { ...counters, excludedStockDays: excluded }, coverage,
  development: period(FROM, DEV_END), validation: period("2025-01-01", TO), byYear,
};
const out = path.join(process.cwd(), ".data", "intraday-replay");
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, `RESULT_${REPLAY_VERSION}.json`), JSON.stringify({ ...result, trades }));
say(JSON.stringify({ ...result, coverage: undefined }, null, 2));
