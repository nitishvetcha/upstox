// Phase 13 — long-term history for indices and NSE equities (read-only).
// Splits any range into provider-sized chunks, fetches sequentially with retry/backoff, persists completed chunks,
// and reports the coverage actually returned. Nothing is synthesized: unavailable history stays missing.
import fs from "node:fs";
import path from "node:path";
import type { Candle } from "./types.ts";
import { normalizeCandles } from "./services/candles.ts";
import { ema, vwap as sessionVwap } from "./services/technicalAnalysis.ts";

export const HISTORY_RANGES = ["1M", "3M", "6M", "1Y", "2Y", "3Y", "5Y", "MAX"] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];
export const HISTORY_INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1mo"] as const;
export type HistoryInterval = (typeof HISTORY_INTERVALS)[number];

// Upstox v3 historical-candle limits per request (documented): minutes ≤15 → 1 month, minutes >15 and hours →
// 1 quarter, days → 1 decade, weeks/months → unlimited. Intraday history starts Jan 2022; daily+ from Jan 2000.
// Chunks stay a little inside each limit. `earliest` is the provider floor; real coverage is what comes back.
export const PROVIDER_PLAN: Record<HistoryInterval, { unit: string; n: number; chunkDays: number; earliest: string }> = {
  "1m": { unit: "minutes", n: 1, chunkDays: 28, earliest: "2022-01-01" },
  "5m": { unit: "minutes", n: 5, chunkDays: 28, earliest: "2022-01-01" },
  "15m": { unit: "minutes", n: 15, chunkDays: 28, earliest: "2022-01-01" },
  "30m": { unit: "minutes", n: 30, chunkDays: 85, earliest: "2022-01-01" },
  "1h": { unit: "hours", n: 1, chunkDays: 85, earliest: "2022-01-01" },
  "4h": { unit: "hours", n: 4, chunkDays: 85, earliest: "2022-01-01" },
  "1d": { unit: "days", n: 1, chunkDays: 3600, earliest: "2000-01-01" },
  "1w": { unit: "weeks", n: 1, chunkDays: 100_000, earliest: "2000-01-01" },
  "1mo": { unit: "months", n: 1, chunkDays: 100_000, earliest: "2000-01-01" },
};

const MONTHS: Record<Exclude<HistoryRange, "MAX">, number> = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12, "2Y": 24, "3Y": 36, "5Y": 60 };
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: string, n: number) => ymd(new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000));

export function rangeStart(range: HistoryRange, interval: HistoryInterval, endDate: string): { start: string; clamped: boolean } {
  const floor = PROVIDER_PLAN[interval].earliest;
  if (range === "MAX") return { start: floor, clamped: false };
  const d = new Date(`${endDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - MONTHS[range]);
  const start = ymd(d);
  return start < floor ? { start: floor, clamped: true } : { start, clamped: false };
}

export interface HistoryChunk { from: string; to: string }

export function planHistoryChunks(start: string, end: string, interval: HistoryInterval): HistoryChunk[] {
  if (start > end) return [];
  const days = PROVIDER_PLAN[interval].chunkDays;
  const out: HistoryChunk[] = [];
  for (let from = start; from <= end; from = addDays(from, days)) {
    const to = addDays(from, days - 1);
    out.push({ from, to: to < end ? to : end });
  }
  return out;
}

export type HistoryFetcher = (instrumentKey: string, unit: string, n: number, chunk: HistoryChunk) => Promise<unknown>;

export interface HistoryCoverage {
  requestedStart: string;
  requestedEnd: string;
  providerEarliest: string;
  clampedToProviderFloor: boolean;
  actualStart: string | null;
  actualEnd: string | null;
  bars: number;
  chunks: number;
  cachedChunks: number;
  failedChunks: HistoryChunk[];
  status: "FULL" | "PARTIAL" | "EMPTY";
}

export interface HistoryResult {
  instrumentKey: string;
  interval: HistoryInterval;
  range: HistoryRange;
  candles: Candle[];
  coverage: HistoryCoverage;
  source: "UPSTOX_HISTORICAL";
  quality: "HISTORICAL_MEASURED";
  derivedTimeframe: false;
  fetchedAt: string;
}

export interface HistoryOptions {
  cacheDir?: string | null; // persistent cache of completed chunks; null disables
  retries?: number;
  backoffMs?: number;
  now?: Date;
}

const DEFAULT_CACHE = path.join(process.cwd(), ".data", "history");

function cacheFile(dir: string, key: string, interval: string, c: HistoryChunk) {
  return path.join(dir, `${key.replace(/[^\w]/g, "_")}_${interval}_${c.from}_${c.to}.json`);
}

export async function loadHistory(
  instrumentKey: string,
  interval: HistoryInterval,
  range: HistoryRange,
  fetcher: HistoryFetcher,
  opts: HistoryOptions = {},
): Promise<HistoryResult> {
  const now = opts.now ?? new Date();
  const today = ymd(now);
  const cacheDir = opts.cacheDir === undefined ? DEFAULT_CACHE : opts.cacheDir;
  const retries = opts.retries ?? 2;
  const backoff = opts.backoffMs ?? 500;
  const plan = PROVIDER_PLAN[interval];
  const { start, clamped } = rangeStart(range, interval, today);
  const chunks = planHistoryChunks(start, today, interval);

  const byTs = new Map<string, Candle>();
  const failed: HistoryChunk[] = [];
  let cachedChunks = 0;

  for (const c of chunks) {
    const file = cacheDir ? cacheFile(cacheDir, instrumentKey, interval, c) : null;
    // Only chunks that ended before today are immutable and safe to persist/reuse.
    const immutable = c.to < today;
    if (file && immutable && fs.existsSync(file)) {
      for (const k of JSON.parse(fs.readFileSync(file, "utf8")) as Candle[]) byTs.set(k.timestamp, k);
      cachedChunks++;
      continue;
    }
    let got: Candle[] | null = null;
    for (let attempt = 0; attempt <= retries && got === null; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, backoff * 2 ** (attempt - 1)));
      try {
        got = normalizeCandles(await fetcher(instrumentKey, plan.unit, plan.n, c));
      } catch {
        got = null;
      }
    }
    if (got === null) { failed.push(c); continue; }
    for (const k of got) byTs.set(k.timestamp, k);
    if (file && immutable) {
      try {
        fs.mkdirSync(cacheDir!, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(got));
      } catch {
        // best-effort persistence
      }
    }
  }

  const candles = [...byTs.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  return {
    instrumentKey,
    interval,
    range,
    candles,
    coverage: {
      requestedStart: start,
      requestedEnd: today,
      providerEarliest: plan.earliest,
      clampedToProviderFloor: clamped,
      actualStart: candles[0]?.timestamp.slice(0, 10) ?? null,
      actualEnd: candles.at(-1)?.timestamp.slice(0, 10) ?? null,
      bars: candles.length,
      chunks: chunks.length,
      cachedChunks,
      failedChunks: failed,
      status: !candles.length ? "EMPTY" : failed.length ? "PARTIAL" : "FULL",
    },
    source: "UPSTOX_HISTORICAL",
    quality: "HISTORICAL_MEASURED",
    derivedTimeframe: false,
    fetchedAt: now.toISOString(),
  };
}

// ── Indicator series for charts ───────────────────────────────────────────────

function rsiSeries(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = closes.map(() => null);
  if (closes.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    gain += Math.max(d, 0);
    loss += Math.max(-d, 0);
  }
  gain /= period; loss /= period;
  const val = () => (loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss));
  out[period] = val();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = val();
  }
  return out;
}

export interface ChartPoint {
  t: string; open: number; high: number; low: number; close: number; volume: number | null;
  ema20: number | null; ema50: number | null; ema100: number | null; ema200: number | null;
  rsi: number | null; macd: number | null; macdSignal: number | null; macdHist: number | null; vwap: number | null;
}

const INTRADAY: HistoryInterval[] = ["1m", "5m", "15m", "30m", "1h", "4h"];

export function chartPoints(candles: Candle[], interval: HistoryInterval): { points: ChartPoint[]; support: number | null; resistance: number | null } {
  const closes = candles.map((c) => c.close);
  const [e20, e50, e100, e200] = [20, 50, 100, 200].map((p) => ema(closes, p));
  const e12 = ema(closes, 12), e26 = ema(closes, 26);
  const line = closes.map((_, i) => (e12[i] !== null && e26[i] !== null ? e12[i]! - e26[i]! : null));
  const firstDef = line.findIndex((v) => v !== null);
  const sigDefined = firstDef < 0 ? [] : ema(line.slice(firstDef) as number[], 9);
  const signal = line.map((_, i) => (firstDef >= 0 && i >= firstDef ? sigDefined[i - firstDef] : null));
  const rs = rsiSeries(closes);

  // VWAP only where meaningful: intraday bars with volume, reset each IST session.
  const vw: (number | null)[] = candles.map(() => null);
  if (INTRADAY.includes(interval) && candles.some((c) => c.volume)) {
    let day = "", session: Candle[] = [];
    candles.forEach((c, i) => {
      const d = c.timestamp.slice(0, 10);
      if (d !== day) { day = d; session = []; }
      session.push(c);
      vw[i] = sessionVwap(session);
    });
  }

  const recent = candles.slice(-60);
  return {
    points: candles.map((c, i) => ({
      t: c.timestamp, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
      ema20: e20[i], ema50: e50[i], ema100: e100[i], ema200: e200[i],
      rsi: rs[i], macd: line[i], macdSignal: signal[i], macdHist: line[i] !== null && signal[i] !== null ? line[i]! - signal[i]! : null,
      vwap: vw[i],
    })),
    // ponytail: 60-bar swing low/high; swap for pivot clustering if levels need more precision.
    support: recent.length ? Math.min(...recent.map((c) => c.low)) : null,
    resistance: recent.length ? Math.max(...recent.map((c) => c.high)) : null,
  };
}
