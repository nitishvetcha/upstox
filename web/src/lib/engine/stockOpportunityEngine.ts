// Phase 20 — Stock Opportunity Engine v20.0 → 20.1
// Multi-factor intraday and swing scanner for NIFTY 50.
// Uses a single batch API call for quotes, then scores each stock on
// multiple factors including relative strength vs NIFTY.
// ponytail: per-stock VWAP/EMA/RSI not computed (would require 50 candle-history calls);
//           add targeted technicals fetch for top-N candidates when latency budget allows.
import { get } from "../services/upstoxMarket.ts";
import { getAccessToken } from "../services/upstoxAuth.ts";
import { providerMode } from "../services/market.ts";
import { NIFTY_50, ALL_LIQUID_CONSTITUENTS } from "../services/breadthConstituents.generated.ts";
import type { StockInstrument, StockMarketData } from "../services/stockService.ts";
import { normalizeStockQuote } from "../services/stockService.ts";
import { marketStatus } from "../time.ts";
import { gradeOpportunity, type OpportunityGrade } from "./opportunityEngine.ts";
import { evaluatePositional, withTodayBar, POSITIONAL_RETIRED_NOTE } from "./positionalTrend.ts";
import { loadHistory, type HistoryFetcher } from "../marketHistory.ts";
import { upstoxHistoryFetcher } from "../services/upstoxMarket.ts";
import { cached } from "../services/cache.ts";
import { istToday, latestTradingSessionDate, isTradingDay } from "../time.ts";
import type { Candle } from "../types.ts";
import { UpstoxError } from "../services/errors.ts";

export const STOCK_OPPORTUNITY_VERSION = "20.1";

// ── Setup types ───────────────────────────────────────────────────────────────
export type IntradaySetup =
  | "BREAKOUT"          // price above PDH
  | "BREAKDOWN"         // price below PDL
  | "ORB_BREAKOUT"      // price breaking above Opening Range High (09:15-09:30)
  | "ORB_BREAKDOWN"     // price breaking below Opening Range Low (09:15-09:30)
  | "HOD_CONTINUATION"  // price consolidating near HOD with strong change
  | "LOD_CONTINUATION"  // price consolidating near LOD with strong sell
  | "MOMENTUM_LONG"     // strong positive change, upper range, volume
  | "MOMENTUM_SHORT"    // strong negative change, lower range, volume
  | "WEAK_LONG"         // positive but poor quality
  | "WEAK_SHORT";       // negative but poor quality

export type SwingSetup =
  | "BREAKOUT"          // daily close above multi-day resistance
  | "BREAKDOWN"         // daily close below multi-day support
  | "TREND_CONTINUATION_LONG"  // stock consistently above key EMAs, pullback to support
  | "TREND_CONTINUATION_SHORT"
  | "MOMENTUM"          // large 1-day move with strong closing position
  | "WEAK"              // insufficient evidence

export interface StockOpportunity {
  rank: number;
  symbol: string;
  name: string;
  instrumentKey: string;
  // Quote data
  ltp: number;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  freshness: string;
  fetchedAt?: string | null;
  exchangeTimestamp?: string | null;
  dataAgeSeconds?: number | null;
  sessionDate?: string | null;
  source?: string | null;
  // Setup
  opportunityScore: number;
  setup: IntradaySetup | SwingSetup;
  direction: "BULLISH" | "BEARISH";
  // Trade plan
  entry: number;
  entryLow: number;
  entryHigh: number;
  stop: number;
  target1: number;
  target2: number;
  rr: number;
  // Analysis
  relativeStrength: number | null; // vs NIFTY in % points (intraday: today's change; positional: 20-session return)
  confidence?: number;
  rangePosition: number | null;    // 0=LOD, 1=HOD
  reasons: string[];
  invalidation: string;
  grade: OpportunityGrade;
  gradeReasons?: string[];
  vwap?: number | null;
  vwapDistancePct?: number | null;
  atr?: number | null;
  rvol?: number | null;
  avgDailyVolume?: number | null;
  orbHigh?: number | null;
  orbLow?: number | null;
  sector?: string | null;
  sectorTrend?: "BULLISH" | "BEARISH" | "NEUTRAL" | null;
  sectorAlignment?: "ALIGNED" | "OPPOSED" | "NEUTRAL" | null;
}

export interface SectorBreadthSummary {
  sector: string;
  advances: number;
  declines: number;
  total: number;
  avgChangePercent: number;
  trend: "BULLISH" | "BEARISH" | "NEUTRAL";
}

export interface StockOpportunityResult {
  timestamp: string;
  engineVersion: string;
  kind: "intraday" | "swing";
  source: "UPSTOX" | "MOCK" | "MIXED" | "UNAVAILABLE";
  freshness: string;
  universe: string;
  stocksScanned: number;
  stocksAvailable: number;
  stocksRejected: number;
  niftyChange: number | null;    // context for relative strength
  topOpportunities: StockOpportunity[];
  noOpportunityReason: string | null;
  diagnostics?: StockCollectionDiagnostics;
  sectorMatrix?: SectorBreadthSummary[];
}

export type StockProviderFailureCategory =
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "NETWORK"
  | "MALFORMED_RESPONSE"
  | "PARTIAL_COVERAGE"
  | "PROVIDER_API_ERROR";

export interface StockCollectionDiagnostics {
  requested: number;
  covered: number;
  category: StockProviderFailureCategory | null;
  providerCode: string | null;
  httpStatus: number | null;
}

export function stockProviderFailureCategory(error: unknown): StockProviderFailureCategory {
  if (!(error instanceof UpstoxError)) return "NETWORK";
  switch (error.reason) {
    case "UPSTOX_AUTH_EXPIRED": return "AUTHENTICATION";
    case "UPSTOX_FORBIDDEN": return "AUTHORIZATION";
    case "UPSTOX_RATE_LIMITED": return "RATE_LIMIT";
    case "UPSTOX_TIMEOUT": return "TIMEOUT";
    case "UPSTOX_NETWORK": return "NETWORK";
    case "UPSTOX_BAD_RESPONSE": return "MALFORMED_RESPONSE";
    default: return "PROVIDER_API_ERROR";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const r2 = (n: number) => Math.round(n * 100) / 100;
const MS_TO_STATUS = { OPEN: "OPEN", CLOSED: "CLOSED", "PRE-OPEN": "PRE_OPEN" } as const;

// Batch quote: one API call with comma-separated instrument keys
async function batchQuotes(instruments: StockInstrument[], now: Date): Promise<StockMarketData[]> {
  const token = await getAccessToken();
  const unavailable = (inst: StockInstrument, reason: string): StockMarketData => ({
    symbol: inst.symbol, exchange: "NSE" as const, instrumentKey: inst.instrumentKey,
    timestamp: now.toISOString(), ltp: null,
    marketStatus: MS_TO_STATUS[marketStatus(now)] ?? "UNKNOWN",
    freshness: "UNAVAILABLE" as const, source: null, unavailableReason: reason,
  });
  if (!token) return instruments.map((i) => unavailable(i, "AUTHENTICATION: UPSTOX_NOT_CONNECTED"));
  
  const BATCH_SIZE = 50;
  const chunks: StockInstrument[][] = [];
  for (let offset = 0; offset < instruments.length; offset += BATCH_SIZE) {
    chunks.push(instruments.slice(offset, offset + BATCH_SIZE));
  }

  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      const keys = chunk.map((i) => i.instrumentKey).join(",");
      try {
        const raw = await get(token, "/v2/market-quote/quotes", { instrument_key: keys }, { index: "nifty" }) as Record<string, Record<string, unknown>>;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          return chunk.map((inst) => unavailable(inst, "MALFORMED_RESPONSE: quote data is not an object"));
        }
        const byToken = new Map<string, Record<string, unknown>>();
        for (const entry of Object.values(raw)) {
          const instrumentToken = entry?.instrument_token;
          if (typeof instrumentToken === "string" && !byToken.has(instrumentToken)) byToken.set(instrumentToken, entry);
        }
        return chunk.map((inst) => {
          const entry = byToken.get(inst.instrumentKey);
          if (!entry) return unavailable(inst, "PARTIAL_COVERAGE: provider omitted requested instrument");
          if (typeof entry.last_price !== "number" || !Number.isFinite(entry.last_price) || entry.last_price <= 0) {
            return unavailable(inst, "MALFORMED_RESPONSE: quote missing positive last_price");
          }
          return normalizeStockQuote({ [inst.instrumentKey]: entry }, inst, now, "UPSTOX"); // this batch is the Upstox request
        });
      } catch (e) {
        const category = stockProviderFailureCategory(e);
        const providerCode = e instanceof UpstoxError ? e.reason : "UPSTOX_NETWORK";
        const status = e instanceof UpstoxError && e.status !== null ? ` HTTP_${e.status}` : "";
        return chunk.map((i) => unavailable(i, `${category}: ${providerCode}${status}`));
      }
    })
  );

  return chunkResults.flat();
}

function stockDiagnostics(quotes: StockMarketData[], requested: number): StockCollectionDiagnostics {
  const covered = quotes.filter((q) => q.ltp !== null).length;
  const reasons = quotes.map((q) => q.unavailableReason ?? "");
  const category = covered > 0 && covered < requested ? "PARTIAL_COVERAGE"
    : (["AUTHENTICATION", "AUTHORIZATION", "RATE_LIMIT", "TIMEOUT", "NETWORK", "MALFORMED_RESPONSE", "PARTIAL_COVERAGE", "PROVIDER_API_ERROR"] as const)
      .find((candidate) => reasons.some((reason) => reason.startsWith(`${candidate}:`))) ?? null;
  const coded = reasons.find((reason) => reason.includes("UPSTOX_")) ?? "";
  const providerCode = coded.match(/UPSTOX_[A-Z_]+/)?.[0] ?? null;
  const httpStatus = Number(coded.match(/HTTP_(\d+)/)?.[1] ?? NaN);
  return { requested, covered, category, providerCode, httpStatus: Number.isFinite(httpStatus) ? httpStatus : null };
}

// Range position: 0 = at LOD, 1 = at HOD
function rangePosition(ltp: number, high: number | undefined, low: number | undefined): number | null {
  if (high === undefined || low === undefined || high <= low) return null;
  return (ltp - low) / (high - low);
}

// Share of independent checks agreeing with the trade side (70%) + quote quality (30%).
// Only describes evidence; eligibility (live data, R:R) is enforced separately by gradeOpportunity/filters.
export function intradayConfidence(q: StockMarketData, side: 1 | -1, rs: number | null, pos: number): number {
  const ltp = q.ltp!;
  const checks: (boolean | null)[] = [
    q.previousClose ? side * (ltp - q.previousClose) > 0 : null,
    q.open !== undefined ? side * (ltp - q.open) > 0 : null,
    q.high !== undefined && q.low !== undefined && q.high > q.low ? (side > 0 ? pos > 0.6 : pos < 0.4) : null,
    rs !== null ? side * rs > 0.3 : null,
    q.changePercent !== undefined ? Math.abs(q.changePercent) >= 1 : null,
  ];
  const known = checks.filter((c): c is boolean => c !== null);
  if (!known.length) return 0;
  const agree = known.filter(Boolean).length / known.length;
  const quality = (q.freshness === "LIVE" ? 0.6 : 0) + (q.volume ? 0.2 : 0) + (known.length === checks.length ? 0.2 : 0);
  return Math.round(agree * 70 + quality * 30);
}

// Validate and extract Previous Day High (PDH) and Previous Day Low (PDL).
// Levels must be positive finite numbers, and PDH must be >= PDL when both are present.
// Missing or inverted levels fail safe by returning null.
export function getValidPreviousDayLevels(q: StockMarketData): { pdh: number | null; pdl: number | null } {
  const rawPdh = q.previousDayHigh ?? q.pdh;
  const rawPdl = q.previousDayLow ?? q.pdl;

  const pdh = typeof rawPdh === "number" && Number.isFinite(rawPdh) && rawPdh > 0 ? rawPdh : null;
  const pdl = typeof rawPdl === "number" && Number.isFinite(rawPdl) && rawPdl > 0 ? rawPdl : null;

  if (pdh !== null && pdl !== null && pdh < pdl) {
    return { pdh: null, pdl: null }; // inverted levels fail closed
  }

  return { pdh, pdl };
}

// Validate and extract 15-minute Opening Range High (ORB-H) and Low (ORB-L).
// Levels must be positive finite numbers, and ORB-H must be >= ORB-L when both are present.
// Missing or inverted levels fail safe by returning null.
export function getValidOpeningRangeLevels(q: StockMarketData): { orbHigh: number | null; orbLow: number | null } {
  const rawHigh = q.openingRangeHigh ?? q.orbHigh;
  const rawLow = q.openingRangeLow ?? q.orbLow;

  const orbHigh = typeof rawHigh === "number" && Number.isFinite(rawHigh) && rawHigh > 0 ? rawHigh : null;
  const orbLow = typeof rawLow === "number" && Number.isFinite(rawLow) && rawLow > 0 ? rawLow : null;

  if (orbHigh !== null && orbLow !== null && orbHigh < orbLow) {
    return { orbHigh: null, orbLow: null }; // inverted levels fail closed
  }

  return { orbHigh, orbLow };
}

/**
 * Normalize supported date inputs into an exact IST session date (YYYY-MM-DD).
 * Supports:
 * - Date objects (calculates IST calendar day)
 * - YYYY-MM-DD strings
 * - ISO date-time strings with +05:30 offset
 * - ISO date-time strings with UTC 'Z' (converted to IST)
 * Rejects invalid, empty, or unparseable inputs safely by returning null.
 */
export function normalizeSessionDate(reference: Date | string): string | null {
  if (reference instanceof Date) {
    return Number.isFinite(reference.getTime()) ? istToday(reference) : null;
  }
  if (typeof reference !== "string" || reference.trim().length === 0) {
    return null;
  }
  const str = reference.trim();
  // Standard YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str + "T12:00:00Z");
    return Number.isFinite(d.getTime()) ? str : null;
  }
  // ISO date-time string
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    if (str.includes("+05:30") || !str.endsWith("Z")) {
      const slice = str.slice(0, 10);
      const testDate = new Date(slice + "T12:00:00Z");
      return Number.isFinite(testDate.getTime()) ? slice : null;
    }
    const d = new Date(str);
    return Number.isFinite(d.getTime()) ? istToday(d) : null;
  }
  return null;
}

export function candleSessionDate(timestamp: string): string {
  const normalized = normalizeSessionDate(timestamp);
  if (normalized) return normalized;
  return timestamp.length >= 10 ? timestamp.slice(0, 10) : timestamp;
}

/**
 * Determine the date (YYYY-MM-DD in IST) of the previous completed trading session.
 * Steps backward from the reference date (excluding the reference date itself)
 * skipping weekends and exchange holidays until a valid trading day is found.
 */
export function getPreviousCompletedSessionDate(reference: Date | string): string {
  const refYmd = normalizeSessionDate(reference) ?? istToday(new Date());
  const d = new Date(refYmd + "T12:00:00Z");
  for (let i = 1; i <= 15; i++) {
    const prev = new Date(d.getTime() - i * 86_400_000);
    const ymd = prev.toISOString().slice(0, 10);
    if (isTradingDay(ymd)) {
      return ymd;
    }
  }
  return new Date(d.getTime() - 86_400_000).toISOString().slice(0, 10);
}

export interface PreviousDayLevels {
  pdh: number;
  pdl: number;
  sessionDate: string;
}

/**
 * Extract Previous Day High and Low (PDH/PDL) from daily (1d) candles.
 * 
 * Requirements:
 * - Match expectedSessionDate (date of the previous completed trading session).
 * - Exclude any developing candle on or after referenceDate (never use today's developing candle).
 * - High and low must be positive finite numbers.
 * - PDH must be >= PDL.
 * - Missing, incomplete, or corrupted data fails safe by returning null.
 */
export function extractPreviousDayLevelsFromDaily(
  candles: Candle[],
  expectedSessionDate: string,
  referenceDate?: string
): PreviousDayLevels | null {
  if (!candles || !Array.isArray(candles) || candles.length === 0) return null;

  const eligible = referenceDate
    ? candles.filter((c) => candleSessionDate(c.timestamp) < referenceDate)
    : candles;

  const match = eligible.find((c) => candleSessionDate(c.timestamp) === expectedSessionDate);
  if (!match) return null;

  const high = match.high;
  const low = match.low;

  if (
    typeof high !== "number" ||
    !Number.isFinite(high) ||
    high <= 0 ||
    typeof low !== "number" ||
    !Number.isFinite(low) ||
    low <= 0 ||
    high < low
  ) {
    return null;
  }

  return {
    pdh: high,
    pdl: low,
    sessionDate: expectedSessionDate,
  };
}

/**
 * Calculate 14-period True Range ATR from completed daily candles.
 * Fails safe by returning null if insufficient valid candles (< 2).
 */
export function calculateDailyAtr(candles: Candle[], period = 14): number | null {
  if (!candles || candles.length < 2) return null;
  const valid = candles.filter(
    (c) => typeof c.high === "number" && typeof c.low === "number" && typeof c.close === "number" && c.high >= c.low
  );
  if (valid.length < 2) return null;

  const count = Math.min(valid.length - 1, period);
  const startIdx = valid.length - count;
  let trSum = 0;
  for (let i = startIdx; i < valid.length; i++) {
    const curr = valid[i];
    const prev = valid[i - 1];
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
    trSum += tr;
  }
  return r2(trSum / count);
}

/**
 * Calculate average daily volume over the past N completed sessions.
 */
export function calculateAverageVolume(candles: Candle[], period = 10): number | null {
  if (!candles || candles.length === 0) return null;
  const valid = candles
    .filter((c) => typeof c.volume === "number" && Number.isFinite(c.volume) && c.volume! > 0)
    .map((c) => c.volume!);
  if (valid.length === 0) return null;
  const count = Math.min(valid.length, period);
  const slice = valid.slice(valid.length - count);
  const sum = slice.reduce((a, b) => a + b, 0);
  return Math.round(sum / count);
}

/**
 * Calculate Relative Volume (RVOL) = current session volume / historical average daily volume.
 */
export function calculateRvol(currentVolume: number | null | undefined, avgVolume: number | null | undefined): number | null {
  if (!currentVolume || !avgVolume || avgVolume <= 0 || !Number.isFinite(currentVolume)) return null;
  return r2(currentVolume / avgVolume);
}

/**
 * Fetch and cache previous completed session PDH/PDL for an instrument key.
 * Caches by instrumentKey:expectedSessionDate for 6 hours.
 * Fails closed (returns null) on error, missing data, or outside Upstox mode.
 */
export async function fetchPreviousDayLevels(
  instrumentKey: string,
  now = new Date(),
  deps?: {
    historyFetcher?: HistoryFetcher;
    token?: string | null;
  }
): Promise<PreviousDayLevels | null> {
  const quoteSessionDate = istToday(now);
  const expectedPrevDate = getPreviousCompletedSessionDate(quoteSessionDate);
  const cacheKey = `stock-pdh-pdl:${instrumentKey}:${expectedPrevDate}`;

  return cached(cacheKey, 6 * 3600_000, async () => {
    let fetcher = deps?.historyFetcher;
    if (!fetcher) {
      if (providerMode() !== "upstox") return null;
      const token = deps?.token ?? (await getAccessToken());
      if (!token) return null;
      fetcher = upstoxHistoryFetcher(token);
    }
    try {
      const hist = await loadHistory(instrumentKey, "1d", "1M", fetcher, { now });
      return extractPreviousDayLevelsFromDaily(hist.candles, expectedPrevDate, quoteSessionDate);
    } catch {
      return null;
    }
  });
}

/**
 * Enrich stock quotes with Previous Day High and Low (PDH/PDL) from daily candles.
 * If a quote already contains valid PDH/PDL, it is not re-fetched.
 * Missing or failed levels fail closed without modifying or fabricating prices.
 */
export async function enrichQuotesWithPreviousDayLevels(
  quotes: StockMarketData[],
  now = new Date(),
  depsDaily?: (keys: string[], now: Date) => Promise<Map<string, Candle[]>>,
  token?: string | null
): Promise<StockMarketData[]> {
  const needsEnrichment = quotes.filter((q) => {
    if (q.ltp === null) return false;
    const { pdh, pdl } = getValidPreviousDayLevels(q);
    return pdh === null || pdl === null || q.atr === undefined;
  });

  if (needsEnrichment.length === 0) return quotes;

  const missingKeys = [...new Set(needsEnrichment.map((q) => q.instrumentKey).filter((k): k is string => Boolean(k)))];
  if (missingKeys.length === 0) return quotes;

  let dailyMap: Map<string, Candle[]> | null = null;
  if (depsDaily) {
    try {
      dailyMap = await depsDaily(missingKeys, now);
    } catch {
      dailyMap = null;
    }
  } else if (providerMode() === "upstox") {
    const tok = token ?? (await getAccessToken());
    if (tok) {
      try {
        dailyMap = await dailyCandles(missingKeys, tok, now);
      } catch {
        dailyMap = null;
      }
    }
  }

  if (!dailyMap) return quotes;

  for (const q of needsEnrichment) {
    if (!q.instrumentKey) continue;
    const candles = dailyMap.get(q.instrumentKey);
    if (!candles) continue;

    const quoteSessionDate = q.sessionDate
      ?? (q.exchangeTimestamp ? istToday(new Date(q.exchangeTimestamp)) : null)
      ?? istToday(now);
    const expectedPrevDate = getPreviousCompletedSessionDate(quoteSessionDate);
    const levels = extractPreviousDayLevelsFromDaily(candles, expectedPrevDate, quoteSessionDate);

    if (levels) {
      q.previousDayHigh = levels.pdh;
      q.previousDayLow = levels.pdl;
      q.pdh = levels.pdh;
      q.pdl = levels.pdl;
    }

    const completed = candles.filter((c) => {
      const d = candleSessionDate(c.timestamp);
      return d < quoteSessionDate;
    });
    const histCandles = completed.length > 0 ? completed : candles;
    const atr = calculateDailyAtr(histCandles);
    const avgVol = calculateAverageVolume(histCandles);
    if (atr !== null) q.atr = atr;
    if (avgVol !== null) {
      q.avgVolume = avgVol;
      q.rvol = calculateRvol(q.volume, avgVol);
    }
  }

  return quotes;
}

// Detect intraday setup from available OHLC + change data
export function detectIntradaySetup(
  q: StockMarketData,
  niftyChgPct: number | null,
  rvol?: number | null,
): {
  setup: IntradaySetup; direction: "BULLISH" | "BEARISH"; score: number; reasons: string[]; confidence: number;
} {
  const chg = q.changePercent ?? 0;
  const pos = rangePosition(q.ltp!, q.high, q.low) ?? 0.5;
  const volOk = q.volume !== undefined && q.volume > 0;
  const absPct = Math.abs(chg);

  // Outperformance in percentage points vs NIFTY. A ratio flips sign on red days.
  const rs = niftyChgPct !== null ? chg - niftyChgPct : null;

  const { pdh, pdl } = getValidPreviousDayLevels(q);
  const isBreakout = pdh !== null && q.ltp! > pdh;
  const isBreakdown = pdl !== null && q.ltp! < pdl;

  const { orbHigh, orbLow } = getValidOpeningRangeLevels(q);
  const isOrbBreakout = orbHigh !== null && q.ltp! > orbHigh;
  const isOrbBreakdown = orbLow !== null && q.ltp! < orbLow;

  const reasons: string[] = [];
  let score = 0;

  const effectiveRvol = rvol ?? q.rvol ?? null;
  if (effectiveRvol !== null) {
    if (effectiveRvol >= 1.5) {
      score += 15;
      reasons.push(`Heavy volume surge (RVOL ${effectiveRvol}x avg)`);
    } else if (effectiveRvol >= 1.0) {
      score += 5;
      reasons.push(`Above-average volume (RVOL ${effectiveRvol}x avg)`);
    } else if (effectiveRvol < 0.5 && absPct >= 1.5) {
      reasons.push(`⚠ Low volume participation (RVOL ${effectiveRvol}x avg)`);
    }
  }

  if (chg >= 0) {
    // Bullish direction
    if (isBreakout) {
      reasons.push(`Trading above yesterday's high (${pdh})`);
    } else if (isOrbBreakout) {
      score += 15;
      reasons.push(`Breaking out above 15m Opening Range High (${orbHigh})`);
    }
    if (q.previousClose && q.ltp! > q.previousClose * 1.005) {
      score += 15; reasons.push(`Trading above yesterday's close`);
    }
    if (q.open !== undefined && q.ltp! > q.open) { score += 10; reasons.push(`Above today's open (buyers in control)`); }
    if (pos > 0.80) { score += 20; reasons.push(`Price near HOD (${(pos * 100).toFixed(0)}% of range)`); }
    else if (pos > 0.60) { score += 10; }
    if (absPct >= 2.5) { score += 20; reasons.push(`Strong move +${absPct.toFixed(1)}%`); }
    else if (absPct >= 1.0) { score += 10; reasons.push(`Positive +${absPct.toFixed(1)}%`); }
    if (rs !== null && rs > 1) { score += 15; reasons.push(`Beating NIFTY by ${rs.toFixed(1)}%`); }
    else if (rs !== null && rs > 0.3) { score += 5; reasons.push(`Slightly stronger than NIFTY (+${rs.toFixed(1)}%)`); }
    if (volOk && effectiveRvol === null) reasons.push(`Volume: ${(q.volume! / 1000).toFixed(0)}K`);

    // Setup precedence:
    // 1. BREAKOUT: true cross above Previous Day High (PDH).
    // 2. ORB_BREAKOUT: true cross above 15m Opening Range High (ORB-H).
    // 3. HOD_CONTINUATION: consolidating near day's high with strong positive move.
    // 4. MOMENTUM_LONG: positive move >= 1.0%.
    // 5. WEAK_LONG: positive but lower momentum / quality.
    const setup: IntradaySetup =
      isBreakout ? "BREAKOUT"
      : isOrbBreakout ? "ORB_BREAKOUT"
      : pos > 0.8 && absPct >= 2 ? "HOD_CONTINUATION"
      : absPct >= 1 ? "MOMENTUM_LONG" : "WEAK_LONG";

    return { setup, direction: "BULLISH", score: Math.min(100, score), reasons, confidence: intradayConfidence(q, 1, rs, pos) };
  } else {
    // Bearish direction
    const absPct = Math.abs(chg);
    if (isBreakdown) {
      reasons.push(`Trading below yesterday's low (${pdl})`);
    } else if (isOrbBreakdown) {
      score += 15;
      reasons.push(`Breaking down below 15m Opening Range Low (${orbLow})`);
    }
    if (q.previousClose && q.ltp! < q.previousClose * 0.995) {
      score += 15; reasons.push(`Trading below yesterday's close`);
    }
    if (q.open !== undefined && q.ltp! < q.open) { score += 10; reasons.push(`Below today's open (sellers in control)`); }
    if (pos < 0.20) { score += 20; reasons.push(`Price near LOD (${(pos * 100).toFixed(0)}% of range)`); }
    else if (pos < 0.40) { score += 10; }
    if (absPct >= 2.5) { score += 20; reasons.push(`Strong drop −${absPct.toFixed(1)}%`); }
    else if (absPct >= 1.0) { score += 10; reasons.push(`Negative −${absPct.toFixed(1)}%`); }
    if (rs !== null && rs < -1) { score += 15; reasons.push(`Weaker than NIFTY by ${Math.abs(rs).toFixed(1)}%`); }
    if (volOk && effectiveRvol === null) reasons.push(`Volume: ${(q.volume! / 1000).toFixed(0)}K`);

    // Setup precedence:
    // 1. BREAKDOWN: true cross below Previous Day Low (PDL).
    // 2. ORB_BREAKDOWN: true cross below 15m Opening Range Low (ORB-L).
    // 3. LOD_CONTINUATION: consolidating near day's low with strong drop.
    // 4. MOMENTUM_SHORT: negative move <= -1.0%.
    // 5. WEAK_SHORT: negative but lower momentum / quality.
    const setup: IntradaySetup =
      isBreakdown ? "BREAKDOWN"
      : isOrbBreakdown ? "ORB_BREAKDOWN"
      : pos < 0.2 && absPct >= 2 ? "LOD_CONTINUATION"
      : absPct >= 1 ? "MOMENTUM_SHORT" : "WEAK_SHORT";

    return { setup, direction: "BEARISH", score: Math.min(100, score), reasons, confidence: intradayConfidence(q, -1, rs, pos) };
  }
}

// Build trade plan using structural levels (HOD/LOD as stops) and ATR extensions as targets.
// Target is market-derived — NOT forced to achieve a desired R:R.
// The ATR multiplier increases for strong-momentum setups (RS > 1.5×, move > 2.5%).
// This reflects that high-momentum continuation moves typically extend further.
// R:R is CALCULATED after targets are set; poor R:R setups are rejected by the scanner.
function buildTradePlan(
  q: StockMarketData, direction: "BULLISH" | "BEARISH", relStr: number | null, dailyAtr?: number | null,
) {
  const ltp = q.ltp!;
  const high = q.high ?? ltp;
  const low = q.low ?? ltp;
  const dayRange = high - low;
  const atrProxy = (dailyAtr && dailyAtr > 0) ? dailyAtr : Math.max(dayRange, ltp * 0.008); // 0.8% floor

  // Strong-momentum extension: applies when stock has clear relative outperformance/underperformance
  const absPct = Math.abs(q.changePercent ?? 0);
  const strongMomentum = absPct >= 2.5 && relStr !== null && Math.abs(relStr) >= 1.5 && Math.sign(relStr) === Math.sign(q.changePercent ?? 0);
  // ponytail: 1.2× gives R:R ≈ 1.04 at LOD/HOD; 1.75× gives R:R ≈ 1.52
  const targetMult = strongMomentum ? 1.75 : 1.2;

  if (direction === "BULLISH") {
    const stop = r2(low - atrProxy * 0.15);
    const risk = Math.max(ltp - stop, 0.01);
    const t1 = r2(ltp + atrProxy * targetMult);
    const t2 = r2(ltp + atrProxy * targetMult * 1.8);
    return {
      entry: ltp, entryLow: r2(ltp), entryHigh: r2(ltp * 1.003),
      stop, target1: t1, target2: t2, rr: r2((t1 - ltp) / risk),
    };
  } else {
    const stop = r2(high + atrProxy * 0.15);
    const risk = Math.max(stop - ltp, 0.01);
    const t1 = r2(ltp - atrProxy * targetMult);
    const t2 = r2(ltp - atrProxy * targetMult * 1.8);
    return {
      entry: ltp, entryLow: r2(ltp * 0.997), entryHigh: r2(ltp),
      stop, target1: t1, target2: t2, rr: r2((ltp - t1) / risk),
    };
  }
}

/**
 * Load daily candles for a single instrument, cached per-instrument and session date.
 * Per-instrument caching ensures that:
 * 1. Different stock subsets of equal length cannot collide or contaminate each other.
 * 2. Intraday and swing scans share the exact same cached candles.
 * 3. Concurrent requests for the same instrument share one in-flight promise.
 */
export async function loadInstrumentDailyCandles(
  instrumentKey: string,
  token: string,
  now: Date,
  fetcher?: HistoryFetcher
): Promise<Candle[]> {
  const sessionDate = istToday(now);
  const cacheKey = `stock-daily-candles:${instrumentKey}:${sessionDate}`;
  return cached(cacheKey, 6 * 3600_000, async () => {
    const f = fetcher ?? upstoxHistoryFetcher(token);
    try {
      const hist = await loadHistory(instrumentKey, "1d", "6M", f, { now });
      return hist.candles;
    } catch {
      return [];
    }
  });
}

// 6 months of daily candles per instrument, cached per-instrument per session.
const NIFTY_KEY = "NSE_INDEX|Nifty 50";
export async function dailyCandles(
  keys: string[],
  token: string,
  now: Date,
  fetcher?: HistoryFetcher
): Promise<Map<string, Candle[]>> {
  const out = new Map<string, Candle[]>();
  for (const k of keys) {
    const candles = await loadInstrumentDailyCandles(k, token, now, fetcher);
    if (candles && candles.length > 0) {
      out.set(k, candles);
    }
  }
  return out;
}

// ── Sector Breadth Alignment Mapping ─────────────────────────────────────────

export const STOCK_SECTOR_MAP: Record<string, string> = {
  // Banking & Financial Services
  HDFCBANK: "BANKING",
  ICICIBANK: "BANKING",
  SBIN: "BANKING",
  KOTAKBANK: "BANKING",
  AXISBANK: "BANKING",
  INDUSINDBK: "BANKING",
  BANKBARODA: "BANKING",
  PNB: "BANKING",
  BAJFINANCE: "FINANCIALS",
  BAJAJFINSV: "FINANCIALS",
  CHOLAFIN: "FINANCIALS",
  HDFCLIFE: "FINANCIALS",
  SBILIFE: "FINANCIALS",
  // Additional Banking & Financials
  AUBANK: "BANKING",
  BANDHANBNK: "BANKING",
  BANKINDIA: "BANKING",
  CANBK: "BANKING",
  FEDERALBNK: "BANKING",
  IDFCFIRSTB: "BANKING",
  INDIANB: "BANKING",
  UNIONBANK: "BANKING",
  YESBANK: "BANKING",
  ANGELONE: "FINANCIALS",
  BSE: "FINANCIALS",
  CDSL: "FINANCIALS",
  HDFCAMC: "FINANCIALS",
  HUDCO: "FINANCIALS",
  ICICIGI: "FINANCIALS",
  IREDA: "FINANCIALS",
  IRFC: "FINANCIALS",
  LICHSGFIN: "FINANCIALS",
  LICI: "FINANCIALS",
  LTF: "FINANCIALS",
  MCX: "FINANCIALS",
  MFSL: "FINANCIALS",
  MUTHOOTFIN: "FINANCIALS",
  PAYTM: "FINANCIALS",
  PFC: "FINANCIALS",
  POLICYBZR: "FINANCIALS",
  POONAWALLA: "FINANCIALS",
  RECLTD: "FINANCIALS",
  SBICARD: "FINANCIALS",
  SHRIRAMFIN: "FINANCIALS",
  // IT & Tech
  TCS: "IT",
  INFY: "IT",
  HCLTECH: "IT",
  WIPRO: "IT",
  TECHM: "IT",
  LTIM: "IT",
  COFORGE: "IT",
  KPITTECH: "IT",
  LTTS: "IT",
  MPHASIS: "IT",
  NAUKRI: "IT",
  OFSS: "IT",
  PERSISTENT: "IT",
  TATAELXSI: "IT",
  // Auto & Mobility
  TATAMOTORS: "AUTO",
  TMPV: "AUTO",
  MARUTI: "AUTO",
  "M&M": "AUTO",
  "BAJAJ-AUTO": "AUTO",
  HEROMOTOCO: "AUTO",
  EICHERMOT: "AUTO",
  TVSMOTOR: "AUTO",
  ASHOKLEY: "AUTO",
  BALKRISIND: "AUTO",
  BHARATFORG: "AUTO",
  BOSCHLTD: "AUTO",
  ESCORTS: "AUTO",
  EXIDEIND: "AUTO",
  MOTHERSON: "AUTO",
  MRF: "AUTO",
  SONACOMS: "AUTO",
  // Energy, Power & Utilities
  RELIANCE: "ENERGY",
  ONGC: "ENERGY",
  NTPC: "ENERGY",
  POWERGRID: "ENERGY",
  BPCL: "ENERGY",
  COALINDIA: "ENERGY",
  IOC: "ENERGY",
  ADANIENSOL: "ENERGY",
  ADANIGREEN: "ENERGY",
  CESC: "ENERGY",
  GAIL: "ENERGY",
  HINDPETRO: "ENERGY",
  JSWENERGY: "ENERGY",
  NHPC: "ENERGY",
  OIL: "ENERGY",
  PETRONET: "ENERGY",
  SUZLON: "ENERGY",
  TATAPOWER: "ENERGY",
  TORNTPOWER: "ENERGY",
  // Metals & Mining
  TATASTEEL: "METALS",
  JSWSTEEL: "METALS",
  HINDALCO: "METALS",
  VEDL: "METALS",
  JINDALSTEL: "METALS",
  HINDCOPPER: "METALS",
  HINDZINC: "METALS",
  NATIONALUM: "METALS",
  NMDC: "METALS",
  SAIL: "METALS",
  // Pharma & Healthcare
  SUNPHARMA: "PHARMA",
  CIPLA: "PHARMA",
  DRREDDY: "PHARMA",
  APOLLOHOSP: "PHARMA",
  DIVISLAB: "PHARMA",
  LUPIN: "PHARMA",
  ALKEM: "PHARMA",
  AUROPHARMA: "PHARMA",
  BIOCON: "PHARMA",
  FORTIS: "PHARMA",
  GLENMARK: "PHARMA",
  LALPATHLAB: "PHARMA",
  LAURUSLABS: "PHARMA",
  MAXHEALTH: "PHARMA",
  TORNTPHARM: "PHARMA",
  // FMCG & Consumer Goods
  ITC: "FMCG",
  HINDUNILVR: "FMCG",
  NESTLEIND: "FMCG",
  BRITANNIA: "FMCG",
  TATACONSUM: "FMCG",
  DABUR: "FMCG",
  GODREJCP: "FMCG",
  COLPAL: "FMCG",
  MARICO: "FMCG",
  PATANJALI: "FMCG",
  // Infrastructure, Telecom, Defence & Cement
  LT: "INFRA",
  BHARTIARTL: "TELECOM",
  INDUSTOWER: "TELECOM",
  TATACOMM: "TELECOM",
  ULTRACEMCO: "CEMENT",
  GRASIM: "CEMENT",
  AMBUJACEM: "CEMENT",
  ACC: "CEMENT",
  DALBHARAT: "CEMENT",
  RAMCOCEM: "CEMENT",
  SHREECEM: "CEMENT",
  ADANIENT: "INFRA",
  ADANIPORTS: "INFRA",
  ABB: "INFRA",
  ASTRAL: "INFRA",
  CGPOWER: "INFRA",
  CONCOR: "INFRA",
  CUMMINSIND: "INFRA",
  DELHIVERY: "INFRA",
  GMRAIRPORT: "INFRA",
  GVT: "INFRA",
  HAL: "DEFENCE",
  INDHOTEL: "INFRA",
  INDIGO: "INFRA",
  IRCTC: "INFRA",
  POLYCAB: "INFRA",
  RVNL: "INFRA",
  SIEMENS: "INFRA",
  // Realty
  DLF: "REALTY",
  GODREJPROP: "REALTY",
  NBCC: "REALTY",
  OBEROIRLTY: "REALTY",
  PHOENIXLTD: "REALTY",
  PRESTIGE: "REALTY",
  // Chemicals & Fertilizers
  COROMANDEL: "CHEMICALS",
  DEEPAKNTR: "CHEMICALS",
  FACT: "CHEMICALS",
  PIDILITIND: "CHEMICALS",
  PIIND: "CHEMICALS",
  SOLARINDS: "CHEMICALS",
  SRF: "CHEMICALS",
  UPL: "CHEMICALS",
  // Consumer, Retail & Media
  TITAN: "CONSUMER",
  CROMPTON: "CONSUMER",
  DIXON: "CONSUMER",
  DMART: "CONSUMER",
  ETERNAL: "CONSUMER",
  HAVELLS: "CONSUMER",
  JUBLFOOD: "CONSUMER",
  KALYANKJIL: "CONSUMER",
  NYKAA: "CONSUMER",
  PAGEIND: "CONSUMER",
  PVRINOX: "CONSUMER",
  SWIGGY: "CONSUMER",
  UBL: "CONSUMER",
  UNITDSPR: "CONSUMER",
  VOLTAS: "CONSUMER",
  WHIRLPOOL: "CONSUMER",
  ZEEL: "MEDIA",
};

export function computeSectorMatrix(quotes: StockMarketData[]): Map<string, SectorBreadthSummary> {
  const map = new Map<string, { advances: number; declines: number; total: number; sumChangePct: number }>();

  for (const q of quotes) {
    if (!q.symbol) continue;
    const sector = STOCK_SECTOR_MAP[q.symbol.toUpperCase()];
    if (!sector) continue;

    const current = map.get(sector) ?? { advances: 0, declines: 0, total: 0, sumChangePct: 0 };
    current.total += 1;
    const change = q.changePercent ?? 0;
    current.sumChangePct += change;
    if (change > 0.05) current.advances += 1;
    else if (change < -0.05) current.declines += 1;
    map.set(sector, current);
  }

  const result = new Map<string, SectorBreadthSummary>();
  for (const [sector, stats] of map.entries()) {
    const avgChangePercent = stats.total > 0 ? Math.round((stats.sumChangePct / stats.total) * 100) / 100 : 0;
    let trend: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
    if (stats.advances > stats.declines && avgChangePercent >= 0.2) {
      trend = "BULLISH";
    } else if (stats.declines > stats.advances && avgChangePercent <= -0.2) {
      trend = "BEARISH";
    }
    result.set(sector, {
      sector,
      advances: stats.advances,
      declines: stats.declines,
      total: stats.total,
      avgChangePercent,
      trend,
    });
  }
  return result;
}

// The intraday candidate rule, shared by the live scanner and the historical replay (one implementation).
export function scoreIntradayQuote(
  q: StockMarketData,
  niftyChgPct: number | null,
  dailyCandles?: Candle[],
  sectorSummary?: SectorBreadthSummary | null,
) {
  const atr = q.atr ?? (dailyCandles ? calculateDailyAtr(dailyCandles) : null);
  const avgVolume = q.avgVolume ?? (dailyCandles ? calculateAverageVolume(dailyCandles) : null);
  const rvol = q.rvol ?? calculateRvol(q.volume, avgVolume);

  const scored = detectIntradaySetup(q, niftyChgPct, rvol);
  if (scored.score < 30) return null;
  const chg = q.changePercent ?? 0;
  const rs = niftyChgPct !== null ? r2(chg - niftyChgPct) : null;
  const plan = buildTradePlan(q, scored.direction, rs, atr);
  if (plan.rr < 1.0) return null;

  const vwap = (q.high && q.low && q.ltp) ? r2((q.high + q.low + q.ltp) / 3) : null;
  const vwapDistancePct = (vwap && q.ltp) ? r2(((q.ltp - vwap) / vwap) * 100) : null;
  if (scored.direction === "BULLISH" && vwapDistancePct !== null && vwapDistancePct > 0) {
    scored.reasons.push(`✓ Trading above intraday VWAP (${vwapDistancePct >= 0 ? "+" : ""}${vwapDistancePct}%)`);
  } else if (scored.direction === "BEARISH" && vwapDistancePct !== null && vwapDistancePct < 0) {
    scored.reasons.push(`✓ Trading below intraday VWAP (${vwapDistancePct}%)`);
  }

  const { orbHigh, orbLow } = getValidOpeningRangeLevels(q);

  // Sector Breadth Alignment
  const sectorName = STOCK_SECTOR_MAP[q.symbol.toUpperCase()] ?? null;
  let sectorAlignment: "ALIGNED" | "OPPOSED" | "NEUTRAL" | null = null;
  if (sectorSummary) {
    if (
      (scored.direction === "BULLISH" && sectorSummary.trend === "BULLISH") ||
      (scored.direction === "BEARISH" && sectorSummary.trend === "BEARISH")
    ) {
      sectorAlignment = "ALIGNED";
      scored.score = Math.min(100, Math.max(0, scored.score + 10));
      scored.reasons.unshift(
        `✓ Sector Confirmation: ${sectorName ?? "Sector"} is ${sectorSummary.trend} (${sectorSummary.avgChangePercent >= 0 ? "+" : ""}${sectorSummary.avgChangePercent.toFixed(1)}%, ${sectorSummary.advances}/${sectorSummary.total} advancing)`
      );
    } else if (
      (scored.direction === "BULLISH" && sectorSummary.trend === "BEARISH") ||
      (scored.direction === "BEARISH" && sectorSummary.trend === "BULLISH")
    ) {
      sectorAlignment = "OPPOSED";
      scored.score = Math.min(100, Math.max(0, scored.score - 10));
      scored.reasons.push(
        `⚠ Sector Headwind: ${sectorName ?? "Sector"} is ${sectorSummary.trend} (${sectorSummary.avgChangePercent >= 0 ? "+" : ""}${sectorSummary.avgChangePercent.toFixed(1)}%) — trading against sector trend`
      );
    } else {
      sectorAlignment = "NEUTRAL";
    }
  }

  return {
    scored,
    rs,
    plan,
    vwap,
    vwapDistancePct,
    atr,
    rvol,
    avgVolume,
    orbHigh,
    orbLow,
    sector: sectorName,
    sectorTrend: sectorSummary?.trend ?? null,
    sectorAlignment,
  };
}

// NIFTY change proxy used by the scanner: mean constituent change %, only when more than 10 have data.
export function niftyProxyChange(changes: number[]): number | null {
  return changes.length > 10 ? changes.reduce((a, b) => a + b, 0) / changes.length : null;
}

// ── Main scanner ──────────────────────────────────────────────────────────────

// Data sources are injectable so tests use deterministic fixtures instead of the live Upstox API.
export interface ScanDeps {
  quotes?: (instruments: StockInstrument[], now: Date) => Promise<StockMarketData[]>;
  daily?: (keys: string[], now: Date) => Promise<Map<string, Candle[]>>;
  universe?: StockInstrument[];
  universeName?: string;
}

// Outside Upstox mode the scan returns UNAVAILABLE before any token is read or any request is made.
// No stock opportunity is fabricated as a substitute.
export function unavailableStockScan(
  kind: "intraday" | "swing",
  now: Date,
  universe = "ALL_LIQUID",
  scanned: number = ALL_LIQUID_CONSTITUENTS.length,
): StockOpportunityResult {
  return {
    timestamp: now.toISOString(), engineVersion: STOCK_OPPORTUNITY_VERSION, kind,
    source: "UNAVAILABLE", freshness: "UNAVAILABLE", universe,
    stocksScanned: scanned, stocksAvailable: 0, stocksRejected: 0,
    niftyChange: null, topOpportunities: [],
    noOpportunityReason: "Stock data is not available: the application is not in Upstox mode (MARKET_DATA_PROVIDER is not upstox). No stock quotes were requested.",
  };
}

export async function scanStocks(kind: "intraday" | "swing", now = new Date(), deps: ScanDeps = {}): Promise<StockOpportunityResult> {
  const isExpanded = process.env.STOCK_SCAN_UNIVERSE !== "NIFTY_50";
  const constituentList = deps.universe ?? (isExpanded ? ALL_LIQUID_CONSTITUENTS : NIFTY_50);
  const universeName = deps.universeName ?? (isExpanded ? "ALL_LIQUID" : "NIFTY_50");

  // First check, before any token access (getAccessToken / token file / analytics token) and before any HTTP request.
  if (providerMode() !== "upstox") return unavailableStockScan(kind, now, universeName, constituentList.length);
  const instruments: StockInstrument[] = constituentList.map((c) => ({
    symbol: c.symbol, name: c.name, exchange: "NSE" as const,
    instrumentKey: c.instrumentKey, kind: "EQUITY" as const,
  }));

  // Also fetch NIFTY index quote for relative strength calculation.
  // We include it in the batch — NSE_INDEX|13 is NIFTY 50.
  const quotes = await (deps.quotes ?? batchQuotes)(instruments, now);
  const diagnostics = stockDiagnostics(quotes, instruments.length);
  const available = quotes.filter((q) => q.ltp !== null && q.freshness !== "UNAVAILABLE");
  // Derived from the quotes' own provider, never a constant. Mixed providers are reported as MIXED.
  const providers = new Set(available.map((q) => q.source ?? "NONE"));
  const source: "UPSTOX" | "MOCK" | "MIXED" | "UNAVAILABLE" = available.length === 0 ? "UNAVAILABLE"
    : providers.size === 1 && providers.has("UPSTOX") ? "UPSTOX"
    : providers.size === 1 && providers.has("MOCK") ? "MOCK"
    : "MIXED";
  const freshness = available.length === 0 ? "UNAVAILABLE"
    : available.every((q) => q.freshness === "LIVE") ? "LIVE" : "MIXED";

  // Estimate NIFTY change from constituent moves (proxy when index not in batch)
  const niftyChanges = available
    .filter((q) => q.changePercent !== undefined)
    .map((q) => q.changePercent!);
  const niftyChgPct = niftyProxyChange(niftyChanges);

  const opportunities: StockOpportunity[] = [];
  let rejected = 0;

  const sectorMatrixMap = computeSectorMatrix(available);
  const sectorMatrixList = Array.from(sectorMatrixMap.values()).sort((a, b) => b.total - a.total);

  if (kind === "swing") {
    const token = await getAccessToken();
    const keys = [NIFTY_KEY, ...available.map((q) => q.instrumentKey!)];
    const daily = deps.daily ? await deps.daily(keys, now)
      : token && available.length ? await dailyCandles(keys, token, now) : new Map<string, Candle[]>();
    const today = latestTradingSessionDate(now); // quote OHLC belongs to this session, even on weekends
    const bench = daily.get(NIFTY_KEY) ?? null;
    const whyNot = new Map<string, number>();
    for (const q of available) {
      const inst = instruments.find((i) => i.symbol === q.symbol);
      const hist = daily.get(q.instrumentKey!);
      if (!inst || !hist) { rejected++; continue; }
      // B5-adj: A live quote from current session, or the latest completed session EOD quote outside market hours.
      const quoteDay = q.sessionDate
        ?? (q.exchangeTimestamp ? istToday(new Date(q.exchangeTimestamp)) : null)
        ?? (q.timestamp ? istToday(new Date(q.timestamp)) : null);
      const usable = (q.freshness === "LIVE" || q.freshness === "END_OF_DAY") && quoteDay === today;
      if (!usable) {
        rejected++;
        const why = `Quote not live/EOD for this session (${q.freshness})`;
        whyNot.set(why, (whyNot.get(why) ?? 0) + 1);
        continue;
      }
      const sig = evaluatePositional(withTodayBar(hist, q, today), bench, now, true);
      if (!sig.ok) { rejected++; whyNot.set(sig.reason.split(" (")[0], (whyNot.get(sig.reason.split(" (")[0]) ?? 0) + 1); continue; }
      opportunities.push({
        rank: 0, symbol: q.symbol, name: inst.name, instrumentKey: q.instrumentKey ?? "",
        ltp: q.ltp!, open: q.open ?? null, high: q.high ?? null, low: q.low ?? null,
        previousClose: q.previousClose ?? null, change: q.change ?? null, changePercent: q.changePercent ?? null,
        volume: q.volume ?? null, freshness: q.freshness,
        opportunityScore: sig.score, setup: sig.setup, direction: "BULLISH",
        entry: sig.entry, entryLow: r2(sig.entry * 0.99), entryHigh: sig.entry, stop: sig.stop,
        target1: sig.target1, target2: sig.target2, rr: sig.rr,
        relativeStrength: sig.rs20, rangePosition: rangePosition(q.ltp!, q.high, q.low),
        invalidation: sig.invalidation,
        grade: "REJECT", // retired strategy: observation only
        reasons: [`⚠ ${POSITIONAL_RETIRED_NOTE}`, ...sig.reasons],
        confidence: sig.confidence,
      });
    }
    opportunities.sort((a, b) => b.opportunityScore - a.opportunityScore);
    const top = opportunities.slice(0, 3).map((o, i) => ({ ...o, rank: i + 1 })); // same top-3 contract as intraday (SO-05)
    const topReasons = [...whyNot].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r, n]) => `${n}× ${r}`).join("; ");
    return {
      timestamp: now.toISOString(), engineVersion: STOCK_OPPORTUNITY_VERSION, kind, source, freshness,
      universe: universeName, stocksScanned: instruments.length, stocksAvailable: available.length, stocksRejected: rejected,
      niftyChange: niftyChgPct !== null ? r2(niftyChgPct) : null, topOpportunities: top,
      noOpportunityReason: top.length ? null
        : source === "UNAVAILABLE" ? "Upstox not connected — no stock data available"
        : !bench ? "Daily candle history could not be loaded"
        : `No stock in a clean uptrend right now. Most common: ${topReasons}`,
      diagnostics,
    };
  }

  if (kind === "intraday" && available.length > 0) {
    const token = await getAccessToken();
    await enrichQuotesWithPreviousDayLevels(available, now, deps.daily, token);
  }

  for (const q of available) {
    if (q.ltp === null) { rejected++; continue; }

    // Intraday recommendations use current-session LIVE quotes during market hours,
    // or latest completed trading session END_OF_DAY quotes outside market hours.
    const quoteSessionDate = q.sessionDate
      ?? (q.exchangeTimestamp ? istToday(new Date(q.exchangeTimestamp)) : null)
      ?? (q.timestamp ? istToday(new Date(q.timestamp)) : null);
    const isSessionUsable = (q.freshness === "LIVE" && quoteSessionDate === istToday(now))
      || (q.freshness === "END_OF_DAY" && quoteSessionDate === latestTradingSessionDate(now));
    if (!isSessionUsable) {
      rejected++;
      continue;
    }

    const inst = instruments.find((i) => i.symbol === q.symbol);
    if (!inst) { rejected++; continue; }

    const sectorName = STOCK_SECTOR_MAP[q.symbol.toUpperCase()] ?? null;
    const sectorSummary = sectorName ? sectorMatrixMap.get(sectorName) : null;
    const res = scoreIntradayQuote(q, niftyChgPct, undefined, sectorSummary);
    if (!res) { rejected++; continue; }
    const { scored, rs, plan } = res;

    const invalidation = scored.direction === "BULLISH"
      ? `Price breaks below ${r2(q.low ?? (q.ltp! * 0.995))}`
      : `Price breaks above ${r2(q.high ?? (q.ltp! * 1.005))}`;

    // liveSources=3 only when the quote is genuinely LIVE; END_OF_DAY/STALE → 0 → forces REJECT grade
    const liveSourcesCount = q.freshness === "LIVE" ? 3 : 0;
    const rawGrade = gradeOpportunity(scored.score, plan.rr, scored.confidence, liveSourcesCount);
    const gradeReasons: string[] = [];
    if (q.freshness !== "LIVE") {
      gradeReasons.push(`Quote ${q.freshness}, not live`);
    }
    if (scored.score < 40) {
      gradeReasons.push(`Opportunity score ${scored.score}/100 below minimum threshold (40)`);
    }
    if (plan.rr < 1.0) {
      gradeReasons.push(`Risk/reward ratio ${plan.rr}x below minimum threshold (1.0x)`);
    }
    if (rawGrade === "REJECT" && gradeReasons.length === 0) {
      gradeReasons.push("Did not meet quality thresholds for tradable grade");
    }

    opportunities.push({
      rank: 0,
      symbol: q.symbol,
      name: inst.name,
      instrumentKey: q.instrumentKey ?? "",
      ltp: q.ltp!,
      open: q.open ?? null,
      high: q.high ?? null,
      low: q.low ?? null,
      previousClose: q.previousClose ?? null,
      change: q.change ?? null,
      changePercent: q.changePercent ?? null,
      volume: q.volume ?? null,
      freshness: q.freshness,
      fetchedAt: q.fetchedAt ?? now.toISOString(),
      exchangeTimestamp: q.exchangeTimestamp ?? null,
      dataAgeSeconds: q.dataAgeSeconds ?? null,
      sessionDate: quoteSessionDate,
      source: q.source,
      opportunityScore: scored.score,
      setup: scored.setup,
      direction: scored.direction,
      ...plan,
      relativeStrength: rs,
      rangePosition: rangePosition(q.ltp!, q.high, q.low),
      reasons: scored.reasons,
      invalidation,
      grade: rawGrade,
      gradeReasons,
      confidence: scored.confidence,
      vwap: res.vwap,
      vwapDistancePct: res.vwapDistancePct,
      atr: res.atr ?? q.atr ?? null,
      rvol: res.rvol ?? q.rvol ?? null,
      avgDailyVolume: res.avgVolume ?? q.avgVolume ?? null,
      orbHigh: res.orbHigh ?? q.orbHigh ?? null,
      orbLow: res.orbLow ?? q.orbLow ?? null,
      sector: res.sector,
      sectorTrend: res.sectorTrend,
      sectorAlignment: res.sectorAlignment,
    });
  }

  opportunities.sort((a, b) => b.opportunityScore - a.opportunityScore);
  const top3 = opportunities.slice(0, 3).map((o, i) => ({ ...o, rank: i + 1 }));

  return {
    timestamp: now.toISOString(),
    engineVersion: STOCK_OPPORTUNITY_VERSION,
    kind,
    source,
    freshness,
    universe: universeName,
    stocksScanned: instruments.length,
    stocksAvailable: available.length,
    stocksRejected: rejected,
    niftyChange: niftyChgPct !== null ? r2(niftyChgPct) : null,
    topOpportunities: top3,
    noOpportunityReason: top3.length === 0
      ? source === "UNAVAILABLE"
        ? "Upstox not connected — no live stock data available"
        : `No stock passed quality filters (${rejected} rejected from ${available.length} scanned)`
      : null,
    diagnostics,
    sectorMatrix: kind === "intraday" ? sectorMatrixList : undefined,
  };
}

// ── Top opportunity candidate selection ────────────────────────────────────────
export interface OpportunityCandidate<T = unknown> {
  engine: string;
  score: number;
  item: T | null;
}

export function pickBestOpportunity<T extends { grade?: string; opportunityScore?: number }>(
  candidates: OpportunityCandidate<T>[]
): (OpportunityCandidate<T> & { item: T }) | null {
  const eligible = candidates.filter(
    (c): c is OpportunityCandidate<T> & { item: T } =>
      c.item !== null && c.item.grade !== "REJECT"
  );
  eligible.sort((a, b) => b.score - a.score);
  return eligible[0] ?? null;
}

