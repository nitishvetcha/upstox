// Phase 13 — NSE equity + index market data (read-only). Independent of the options strategy.
// Search uses the public Upstox NSE instrument master (same source as scripts/sync-constituents.mjs), cached daily.
// Quotes/history need an Upstox token; without one they report UNAVAILABLE — never mock prices.
import fs from "node:fs";
import path from "node:path";
import { dataRoot } from "../dataRoot.ts";
import { parseGzipJsonArrayStream } from "./streamJsonArray.ts";
import { get, upstoxHistoryFetcher } from "./upstoxMarket.ts";
import { getAccessToken } from "./upstoxAuth.ts";
import { INSTRUMENTS } from "./instrumentRegistry.ts";
import { istToday, marketStatus, MIN_LTT_EPOCH_MS, tradeFreshnessOf } from "../time.ts";
import { NIFTY_50, BANK_NIFTY } from "./breadthConstituents.generated.ts";
import { loadHistory, type HistoryInterval, type HistoryRange, type HistoryResult } from "../marketHistory.ts";

export interface StockInstrument {
  symbol: string;
  name: string;
  exchange: "NSE";
  instrumentKey: string;
  kind: "EQUITY" | "INDEX";
}

export interface StockMarketData {
  symbol: string;
  exchange: "NSE" | "BSE";
  instrumentKey: string | null;
  timestamp: string;
  fetchedAt?: string;
  exchangeTimestamp?: string | null;
  dataAgeSeconds?: number | null;
  sessionDate?: string | null;
  ltp: number | null;
  open?: number;
  high?: number;
  low?: number;
  previousClose?: number;
  previousDayHigh?: number;
  previousDayLow?: number;
  pdh?: number;
  pdl?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  marketStatus: "OPEN" | "CLOSED" | "PRE_OPEN" | "UNKNOWN";
  freshness: "LIVE" | "END_OF_DAY" | "STALE" | "UNAVAILABLE";
  // Provider that actually produced this quote. null = unknown/none; never inferred.
  source: StockProvider | null;
  unavailableReason: string | null;
  atr?: number | null;
  avgVolume?: number | null;
  rvol?: number | null;
  /** Session VWAP calculated from intraday price/volume bars. Never substitute typical price. */
  vwap?: number | null;
  openingRangeHigh?: number | null;
  openingRangeLow?: number | null;
  orbHigh?: number | null;
  orbLow?: number | null;
}

export type StockProvider = "UPSTOX" | "MOCK";

const MASTER_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";
const MASTER_FILE = path.join(dataRoot(), "instruments", "NSE_EQ.json");
const DAY_MS = 86_400_000;

const INDEX_ENTRIES: StockInstrument[] = Object.values(INSTRUMENTS).map((i) => ({
  symbol: i.symbol, name: i.name, exchange: "NSE", instrumentKey: i.underlyingKey, kind: "INDEX",
}));

// Offline fallback so search still works without network: the verified NIFTY 50 / BANK NIFTY constituents.
const CONSTITUENTS: StockInstrument[] = [...new Map([...NIFTY_50, ...BANK_NIFTY].map((c) => [c.symbol, {
  symbol: c.symbol, name: c.name, exchange: "NSE" as const, instrumentKey: c.instrumentKey, kind: "EQUITY" as const,
}])).values()];

const g = globalThis as typeof globalThis & {
  __nseEq?: { at: number; list: StockInstrument[]; source: string };
  __nseEqPromise?: Promise<{ at: number; list: StockInstrument[]; source: string }>;
};

export async function equityMaster(fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<{ at: number; list: StockInstrument[]; source: string }> {
  // Mock mode never contacts Upstox and never writes the protected data directory: the offline constituent list is used.
  if (process.env.MARKET_DATA_PROVIDER !== "upstox") return { at: now, list: CONSTITUENTS, source: "CONSTITUENT_FALLBACK" };
  if (g.__nseEq && now - g.__nseEq.at < DAY_MS) return g.__nseEq;
  try {
    const st = fs.statSync(MASTER_FILE);
    if (now - st.mtimeMs < DAY_MS) {
      return (g.__nseEq = { at: st.mtimeMs, list: JSON.parse(fs.readFileSync(MASTER_FILE, "utf8")), source: "UPSTOX_INSTRUMENT_MASTER" });
    }
  } catch { /* no cache yet */ }
  if (g.__nseEqPromise) return g.__nseEqPromise;
  g.__nseEqPromise = (async () => {
    try {
      const res = await fetchImpl(MASTER_URL, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await parseGzipJsonArrayStream<StockInstrument>(res, (r) => {
        if (
          r?.segment !== "NSE_EQ" ||
          r?.instrument_type !== "EQ" ||
          typeof r.trading_symbol !== "string" ||
          typeof r.instrument_key !== "string"
        ) {
          return null;
        }
        return {
          symbol: r.trading_symbol,
          name: typeof r.name === "string" ? r.name : r.trading_symbol,
          exchange: "NSE",
          instrumentKey: r.instrument_key,
          kind: "EQUITY",
        };
      });
      fs.mkdirSync(path.dirname(MASTER_FILE), { recursive: true });
      fs.writeFileSync(MASTER_FILE, JSON.stringify(list));
      return (g.__nseEq = { at: now, list, source: "UPSTOX_INSTRUMENT_MASTER" });
    } catch {
      return { at: now, list: CONSTITUENTS, source: "CONSTITUENT_FALLBACK" };
    } finally {
      g.__nseEqPromise = undefined;
    }
  })();
  return g.__nseEqPromise;
}

export function searchInstruments(list: StockInstrument[], q: string, limit = 20): StockInstrument[] {
  const query = q.trim().toUpperCase();
  if (!query) return [];
  const all = [...INDEX_ENTRIES, ...list];
  const score = (i: StockInstrument) =>
    i.symbol === query ? 0 : i.symbol.startsWith(query) ? 1 : i.name.toUpperCase().startsWith(query) ? 2 :
    i.symbol.includes(query) || i.name.toUpperCase().includes(query) ? 3 : 9;
  return all.map((i) => [score(i), i] as const).filter(([s]) => s < 9).sort((a, b) => a[0] - b[0] || a[1].symbol.localeCompare(b[1].symbol)).slice(0, limit).map(([, i]) => i);
}

export async function resolveSymbol(symbol: string): Promise<StockInstrument | null> {
  const s = symbol.toUpperCase();
  const idx = INDEX_ENTRIES.find((i) => i.symbol === s);
  if (idx) return idx;
  const { list } = await equityMaster();
  return list.find((i) => i.symbol === s) ?? CONSTITUENTS.find((i) => i.symbol === s) ?? null;
}

const MS_TO_STATUS = { OPEN: "OPEN", CLOSED: "CLOSED", "PRE-OPEN": "PRE_OPEN" } as const;

export function normalizeStockQuote(raw: unknown, inst: StockInstrument, now: Date, provider: StockProvider | null = null): StockMarketData {
  const entry = Object.values((raw ?? {}) as Record<string, Record<string, unknown>>).find((v) => v?.instrument_token === inst.instrumentKey)
    ?? Object.values((raw ?? {}) as Record<string, Record<string, unknown>>)[0];
  const ms = MS_TO_STATUS[marketStatus(now)] ?? "UNKNOWN";
  const fetchedAt = now.toISOString();
  const base = { symbol: inst.symbol, exchange: "NSE" as const, instrumentKey: inst.instrumentKey, timestamp: fetchedAt, fetchedAt, exchangeTimestamp: null, dataAgeSeconds: null, sessionDate: null, marketStatus: ms };
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const ltp = n(entry?.last_price);
  if (ltp === undefined) return { ...base, ltp: null, freshness: "UNAVAILABLE", source: null, unavailableReason: "quote missing last_price" };
  const ohlc = (entry?.ohlc ?? {}) as Record<string, unknown>;
  const change = n(entry?.net_change);
  const prev = change !== undefined ? Math.round((ltp - change) * 100) / 100 : undefined;
  const pdh = n(entry?.previous_day_high ?? entry?.prev_high ?? entry?.pdh ?? ohlc?.previous_day_high ?? ohlc?.prev_high ?? ohlc?.pdh);
  const pdl = n(entry?.previous_day_low ?? entry?.prev_low ?? entry?.pdl ?? ohlc?.previous_day_low ?? ohlc?.prev_low ?? ohlc?.pdl);
  const ltt = Number(entry?.last_trade_time);
  const exchangeTimestamp = Number.isFinite(ltt) && ltt >= MIN_LTT_EPOCH_MS ? new Date(ltt).toISOString() : null;
  const freshness = tradeFreshnessOf(exchangeTimestamp, now);
  return {
    ...base,
    timestamp: exchangeTimestamp ?? base.timestamp,
    exchangeTimestamp,
    dataAgeSeconds: freshness.freshnessSeconds,
    sessionDate: exchangeTimestamp ? istToday(new Date(exchangeTimestamp)) : null,
    ltp,
    open: n(ohlc.open), high: n(ohlc.high), low: n(ohlc.low),
    previousClose: prev,
    previousDayHigh: pdh,
    previousDayLow: pdl,
    pdh,
    pdl,
    change,
    changePercent: change !== undefined && prev ? Math.round((change / prev) * 10_000) / 100 : undefined,
    volume: n(entry?.volume) || undefined, // indices report 0 = no volume
    // Exchange LTT is authoritative. Missing, implausible and future-dated timestamps fail closed.
    freshness: freshness.freshness === "AGING" ? "STALE" : freshness.freshness,
    source: provider,
    unavailableReason: null,
  };
}

export async function stockQuote(inst: StockInstrument, now = new Date()): Promise<StockMarketData> {
  const token = await getAccessToken();
  if (!token) {
    return { symbol: inst.symbol, exchange: "NSE", instrumentKey: inst.instrumentKey, timestamp: now.toISOString(), ltp: null,
      marketStatus: MS_TO_STATUS[marketStatus(now)] ?? "UNKNOWN", freshness: "UNAVAILABLE", source: null, unavailableReason: "UPSTOX_NOT_CONNECTED" };
  }
  try {
    const raw = await get(token, "/v2/market-quote/quotes", { instrument_key: inst.instrumentKey }, { index: "nifty" });
    return normalizeStockQuote(raw, inst, now, "UPSTOX"); // this call is the Upstox request
  } catch (e) {
    return { symbol: inst.symbol, exchange: "NSE", instrumentKey: inst.instrumentKey, timestamp: now.toISOString(), ltp: null,
      marketStatus: MS_TO_STATUS[marketStatus(now)] ?? "UNKNOWN", freshness: "UNAVAILABLE", source: null, unavailableReason: (e as Error).message };
  }
}

export async function stockHistory(inst: StockInstrument, interval: HistoryInterval, range: HistoryRange): Promise<HistoryResult | { error: string }> {
  const token = await getAccessToken();
  if (!token) return { error: "UPSTOX_NOT_CONNECTED: historical candles require an Upstox login" };
  return loadHistory(inst.instrumentKey, interval, range, upstoxHistoryFetcher(token));
}
