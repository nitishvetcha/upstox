// Phase 10 historical inputs beyond the index's own candles (read-only Upstox history):
//   • India VIX (15m + daily): observed index-level implied volatility → option-pricing IV and IV percentile.
//   • Index constituents (15m): reconstructed point-in-time breadth (advances/declines vs previous session close).
// Every lookup is point-in-time: at a decision time T only bars that CLOSED at or before T are visible.
// Nothing is filled in: a missing VIX bar or constituent bar is reported, never invented.
import type { Candle, ConstituentQuote, IndexId } from "../types.ts";
import { INDEX_CONSTITUENTS } from "./breadthConfig.ts";
import { GENERATED_AT } from "./breadthConstituents.generated.ts";
import { addCalendarDays, istDay, loadHistoricalRange, mergeAndValidate, type ChunkFetcher, type Coverage } from "./historicalCandles.ts";

export type HistoricalDataQuality =
  | "HISTORICAL_MEASURED"
  | "HISTORICAL_RECONSTRUCTED"
  | "MODEL_DERIVED"
  | "SYNTHETIC"
  | "MOCK"
  | "PARTIAL"
  | "NOT_AVAILABLE"
  | "SIMULATED"
  | "MODELED";

export interface ComponentQuality {
  source: string;
  quality: HistoricalDataQuality;
  fetchedAt?: string;
  observedAt?: string;
  coverageStart?: string;
  coverageEnd?: string;
  coveragePercent?: number;
  notes?: string;
}

export type OptionsDataMode = "FULL" | "PARTIAL" | "SYNTHETIC" | "UNAVAILABLE";
export type IvSource = "OBSERVED" | "IMPLIED_FROM_HISTORICAL_OPTION_PRICE" | "MODEL_DERIVED" | "SYNTHETIC" | "UNAVAILABLE";

export const VIX_KEY = "NSE_INDEX|India VIX";
export const VIX_PERCENTILE_LOOKBACK = 252; // trailing completed sessions
export const VIX_MIN_HISTORY = 120; // fewer completed sessions → IV percentile NOT AVAILABLE
export const VIX_DAILY_WARMUP_DAYS = 400; // calendar days of daily VIX before the start (≥ 252 sessions)

// Findings from probing the read-only APIs (documented so the data-quality report can cite them):
export const OPTIONS_HISTORY_FINDING =
  "Upstox expired-instrument history (/v2/expired-instruments/*) returned UDAPI1149: available only with an Upstox Plus plan. " +
  "Historical option quotes, OI, bid/ask and IV for expired contracts are therefore NOT AVAILABLE to this account.";
export const NEWS_HISTORY_FINDING =
  "No accessible timestamped historical news archive: the configured RSS feeds and NewsAPI only return recent articles. " +
  "Historical news is NOT AVAILABLE; a neutral placeholder (score 0, confidence 0) is used so it can neither confirm nor veto.";

export interface HistoricalContext {
  index: IndexId;
  vix: Candle[];
  vixDaily: Candle[];
  vixCoverage: Coverage | null;
  constituents: { symbol: string; candles: Candle[] }[];
  constituentCoverage: { symbol: string; bars: number; firstDay: string | null; lastDay: string | null; coveragePercent: number }[];
  expectedConstituents: number;
  membershipAsOf: string; // constituent list snapshot date (today's list, not point-in-time membership)
  survivorshipBiasRisk: boolean;
  fetchedAt?: string; // metadata only
}

const BAR_MS = 15 * 60_000;

export async function loadHistoricalContext(index: IndexId, startDate: string, endDate: string, intradayFrom: string, fetchChunk: ChunkFetcher): Promise<HistoricalContext> {
  const vix = await loadHistoricalRange({ instrumentKey: VIX_KEY, interval: "15m", startDate: intradayFrom, endDate }, fetchChunk);
  const vixDaily = await loadHistoricalRange({ instrumentKey: VIX_KEY, interval: "1d", startDate: addCalendarDays(startDate, -VIX_DAILY_WARMUP_DAYS), endDate }, fetchChunk);
  const constituents: HistoricalContext["constituents"] = [];
  const constituentCoverage: HistoricalContext["constituentCoverage"] = [];
  for (const c of INDEX_CONSTITUENTS[index]) {
    const r = await loadHistoricalRange({ instrumentKey: c.instrumentKey, interval: "15m", startDate: intradayFrom, endDate }, fetchChunk);
    constituents.push({ symbol: c.symbol, candles: r.candles });
    const cov = mergeAndValidate([r.candles], startDate, endDate, "15m", 1).coverage;
    constituentCoverage.push({ symbol: c.symbol, bars: cov.barCount, firstDay: cov.actualStart, lastDay: cov.actualEnd, coveragePercent: cov.coveragePercent });
  }
  return {
    index,
    vix: vix.candles,
    vixDaily: vixDaily.candles,
    vixCoverage: vix.coverage,
    constituents,
    constituentCoverage,
    expectedConstituents: INDEX_CONSTITUENTS[index].length,
    membershipAsOf: GENERATED_AT.slice(0, 10),
    survivorshipBiasRisk: true, // historical index membership is not available here; today's list is used throughout
    fetchedAt: vix.fetchedAt,
  };
}

export interface PointInTimeInputs {
  iv: number | null; // India VIX close of the latest bar closed by T (percent)
  ivObservedAt: string | null; // close time of that bar
  ivPercentile: number | null;
  breadthQuotes: ConstituentQuote[];
  breadthObservedAt: string | null; // latest constituent bar close used
}

// Sorted bars → binary search for the last bar whose OPEN timestamp ≤ cutoff.
function lastAtOrBefore(ts: number[], cutoff: number): number {
  let lo = 0, hi = ts.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= cutoff) {
      ans = mid;
      lo = mid + 1;
    }
    else hi = mid - 1;
  }
  return ans;
}

interface Series { ts: number[]; close: number[]; day: string[] }
const series = (candles: Candle[]): Series => {
  const s = [...candles].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  return { ts: s.map((c) => Date.parse(c.timestamp)), close: s.map((c) => c.close), day: s.map((c) => istDay(c.timestamp)) };
};

export class HistoricalInputs {
  private vix: Series;
  private vixDaily: Series;
  private cons: { symbol: string; s: Series }[];
  readonly ctx: HistoricalContext;
  constructor(ctx: HistoricalContext) {
    this.ctx = ctx;
    this.vix = series(ctx.vix);
    this.vixDaily = series(ctx.vixDaily);
    this.cons = ctx.constituents.map((c) => ({ symbol: c.symbol, s: series(c.candles) }));
  }

  // Inputs visible at decision time T = barOpen + 15m: bars with open ≤ barOpen (closed by T); same-day only for
  // intraday values, previous sessions for reference closes.
  at(barOpenIso: string): PointInTimeInputs {
    const cutoff = Date.parse(barOpenIso);
    const today = istDay(barOpenIso);
    const vi = lastAtOrBefore(this.vix.ts, cutoff);
    const vixOk = vi >= 0 && this.vix.day[vi] === today;
    const iv = vixOk ? this.vix.close[vi] : null;

    // IV percentile: rank of the current VIX among the trailing completed daily closes (days strictly before T's day).
    let ivPercentile: number | null = null;
    if (iv !== null) {
      const di = lastAtOrBefore(this.vixDaily.ts, cutoff);
      let end = di;
      while (end >= 0 && this.vixDaily.day[end] >= today) end--;
      const hist = this.vixDaily.close.slice(Math.max(0, end - VIX_PERCENTILE_LOOKBACK + 1), end + 1);
      if (hist.length >= VIX_MIN_HISTORY) ivPercentile = Math.round((hist.filter((x) => x < iv).length / hist.length) * 100);
    }

    const breadthQuotes: ConstituentQuote[] = [];
    let latest = -Infinity;
    for (const { symbol, s } of this.cons) {
      const i = lastAtOrBefore(s.ts, cutoff);
      if (i < 0 || s.day[i] !== today) continue; // no bar for this constituent today yet → not counted
      let p = i;
      while (p >= 0 && s.day[p] === today) p--;
      if (p < 0) continue; // no previous session in the loaded history
      const last = s.close[i], prev = s.close[p];
      latest = Math.max(latest, s.ts[i]);
      breadthQuotes.push({
        symbol,
        lastPrice: last,
        previousClose: prev,
        change: last - prev,
        changePercent: ((last - prev) / prev) * 100,
        timestamp: new Date(s.ts[i] + BAR_MS).toISOString(),
      });
    }
    return {
      iv,
      ivObservedAt: vixOk ? new Date(this.vix.ts[vi] + BAR_MS).toISOString() : null,
      ivPercentile,
      breadthQuotes,
      breadthObservedAt: Number.isFinite(latest) ? new Date(latest + BAR_MS).toISOString() : null,
    };
  }
}

// --- look-ahead guard ---------------------------------------------------------------------------------------------

export interface SnapshotTimes {
  underlying: string | null;
  option: string | null;
  oi: string | null;
  iv: string | null;
  news: string | null;
  breadth: string | null;
}

// Every input timestamp must be ≤ the decision time. Returns the offending components (empty = valid).
export function lookAheadViolations(times: SnapshotTimes, decisionTime: Date): string[] {
  const t = decisionTime.getTime();
  return Object.entries(times)
    .filter(([, v]) => v !== null && Date.parse(v) > t)
    .map(([k, v]) => `${k} observed ${v} after decision time ${decisionTime.toISOString()}`);
}

// News may influence a snapshot only when published at or before the decision time.
export function newsVisibleAt<T extends { publishedAt: string }>(articles: T[], decisionTime: Date): T[] {
  return articles.filter((a) => Date.parse(a.publishedAt) <= decisionTime.getTime());
}

// --- dataset fingerprint ------------------------------------------------------------------------------------------

export function fnv(s: string, h = 0x811c9dc5): number {
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
const hashCandles = (cs: Candle[], h: number) => cs.reduce((acc, c) => fnv(`${c.timestamp}|${c.open}|${c.high}|${c.low}|${c.close}|${c.volume ?? ""};`, acc), h);

// Fingerprint of every input series the run consumed (index intraday + daily, VIX, constituents).
export function datasetHash(candles: Candle[], daily: Candle[], ctx?: HistoricalContext | null): string {
  let h = hashCandles(daily, hashCandles(candles, 0x811c9dc5));
  if (ctx) {
    h = hashCandles(ctx.vixDaily, hashCandles(ctx.vix, h));
    for (const c of ctx.constituents) h = hashCandles(c.candles, fnv(c.symbol, h));
  }
  return `ds_${h.toString(16).padStart(8, "0")}`;
}
