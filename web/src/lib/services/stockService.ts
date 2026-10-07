// Phase 13 — NSE equity + index market data (read-only). Independent of the options strategy.
// Search uses the public Upstox NSE instrument master (same source as scripts/sync-constituents.mjs), cached daily.
// Quotes/history need an Upstox token; without one they report UNAVAILABLE — never mock prices.
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { get, upstoxHistoryFetcher } from "./upstoxMarket.ts";
import { getAccessToken } from "./upstoxAuth.ts";
import { INSTRUMENTS } from "./instrumentRegistry.ts";
import { marketStatus } from "../time.ts";
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
  ltp: number | null;
  open?: number;
  high?: number;
  low?: number;
  previousClose?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  marketStatus: "OPEN" | "CLOSED" | "PRE_OPEN" | "UNKNOWN";
  freshness: "LIVE" | "END_OF_DAY" | "STALE" | "UNAVAILABLE";
  source: "UPSTOX" | null;
  unavailableReason: string | null;
}

const MASTER_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";
const MASTER_FILE = path.join(process.cwd(), ".data", "instruments", "NSE_EQ.json");
const DAY_MS = 86_400_000;

const INDEX_ENTRIES: StockInstrument[] = Object.values(INSTRUMENTS).map((i) => ({
  symbol: i.symbol, name: i.name, exchange: "NSE", instrumentKey: i.underlyingKey, kind: "INDEX",
}));

// Offline fallback so search still works without network: the verified NIFTY 50 / BANK NIFTY constituents.
const CONSTITUENTS: StockInstrument[] = [...new Map([...NIFTY_50, ...BANK_NIFTY].map((c) => [c.symbol, {
  symbol: c.symbol, name: c.name, exchange: "NSE" as const, instrumentKey: c.instrumentKey, kind: "EQUITY" as const,
}])).values()];

const g = globalThis as typeof globalThis & { __nseEq?: { at: number; list: StockInstrument[]; source: string } };

export async function equityMaster(fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<{ at: number; list: StockInstrument[]; source: string }> {
  if (g.__nseEq && now - g.__nseEq.at < DAY_MS) return g.__nseEq;
  try {
    const st = fs.statSync(MASTER_FILE);
    if (now - st.mtimeMs < DAY_MS) {
      return (g.__nseEq = { at: st.mtimeMs, list: JSON.parse(fs.readFileSync(MASTER_FILE, "utf8")), source: "UPSTOX_INSTRUMENT_MASTER" });
    }
  } catch { /* no cache yet */ }
  try {
    const res = await fetchImpl(MASTER_URL, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8")) as Record<string, string>[];
    const list: StockInstrument[] = rows
      .filter((r) => r.segment === "NSE_EQ" && r.instrument_type === "EQ")
      .map((r) => ({ symbol: r.trading_symbol, name: r.name, exchange: "NSE", instrumentKey: r.instrument_key, kind: "EQUITY" }));
    fs.mkdirSync(path.dirname(MASTER_FILE), { recursive: true });
    fs.writeFileSync(MASTER_FILE, JSON.stringify(list));
    return (g.__nseEq = { at: now, list, source: "UPSTOX_INSTRUMENT_MASTER" });
  } catch {
    return { at: now, list: CONSTITUENTS, source: "CONSTITUENT_FALLBACK" };
  }
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

export function normalizeStockQuote(raw: unknown, inst: StockInstrument, now: Date): StockMarketData {
  const entry = Object.values((raw ?? {}) as Record<string, Record<string, unknown>>).find((v) => v?.instrument_token === inst.instrumentKey)
    ?? Object.values((raw ?? {}) as Record<string, Record<string, unknown>>)[0];
  const ms = MS_TO_STATUS[marketStatus(now)] ?? "UNKNOWN";
  const base = { symbol: inst.symbol, exchange: "NSE" as const, instrumentKey: inst.instrumentKey, timestamp: now.toISOString(), marketStatus: ms };
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const ltp = n(entry?.last_price);
  if (ltp === undefined) return { ...base, ltp: null, freshness: "UNAVAILABLE", source: null, unavailableReason: "quote missing last_price" };
  const ohlc = (entry?.ohlc ?? {}) as Record<string, unknown>;
  const change = n(entry?.net_change);
  const prev = change !== undefined ? Math.round((ltp - change) * 100) / 100 : undefined;
  const ltt = Number(entry?.last_trade_time);
  const ageMs = Number.isFinite(ltt) && ltt > 0 ? now.getTime() - ltt : null;
  return {
    ...base,
    timestamp: ageMs !== null ? new Date(ltt).toISOString() : base.timestamp,
    ltp,
    open: n(ohlc.open), high: n(ohlc.high), low: n(ohlc.low),
    previousClose: prev,
    change,
    changePercent: change !== undefined && prev ? Math.round((change / prev) * 10_000) / 100 : undefined,
    volume: n(entry?.volume) || undefined, // indices report 0 = no volume
    freshness: ms !== "OPEN" ? "END_OF_DAY" : ageMs !== null && ageMs > 120_000 ? "STALE" : "LIVE",
    source: "UPSTOX",
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
    return normalizeStockQuote(raw, inst, now);
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
