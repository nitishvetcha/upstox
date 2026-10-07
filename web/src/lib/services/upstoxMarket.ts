// READ-ONLY Upstox market data: quotes, option contracts (expiries) and option chains.
// No order endpoints exist in this codebase. Raw Upstox shapes stop here; callers get normalized types.
import type { Candle, CandleSeries, ConstituentQuote, DataSource, FallbackReason, FuturesVwap, IndexId, IndexQuote, Indicators, MarketBreadth, MarketDataProvider, OptionChain, Quote, SourceInfo, TechnicalAnalysis, Technicals, Timeframe } from "../types.ts";
import { INSTRUMENTS } from "./instrumentRegistry.ts";
import { strikeStep, validExpiries } from "./optionChainAnalytics.ts";
import { InvalidRequestError, UpstoxError } from "./errors.ts";
import { istToday, marketStatus, tradeFreshnessOf } from "../time.ts";
import { CANDLE_PLAN, DAILY_TTL_MS, HISTORY_TTL_MS, mergeCandles, normalizeCandles } from "./candles.ts";
import { analyzeTechnicals } from "./technicalAnalysis.ts";
import type { ChunkFetcher } from "./historicalCandles.ts";
import { cached, clearUpstoxCache } from "./cache.ts";
import { fetchFuturesContracts, futuresVwapFrom, selectFuturesContract, unavailableVwap } from "./futures.ts";
import { INDEX_CONSTITUENTS } from "./breadthConfig.ts";
import { calculateBreadth, unavailableBreadth } from "./breadthService.ts";

const HOST = "https://api.upstox.com";
const TIMEOUT_MS = 8_000;
export const TTL_MS = { quote: 5_000, chain: 15_000, expiries: 60 * 60_000 };

// --- cache: see cache.ts (keys are per index/expiry/timeframe, so NIFTY and BANK NIFTY never collide) ---
export { clearUpstoxCache };

// --- request + structured log (never logs the token, secret or auth code) ---
function reasonFor(status: number, message: string): FallbackReason {
  if (status === 401) return "UPSTOX_AUTH_EXPIRED";
  if (status === 403) return "UPSTOX_FORBIDDEN";
  if (status === 429) return "UPSTOX_RATE_LIMITED";
  if (status === 400 && /instrument/i.test(message)) return "UPSTOX_INVALID_INSTRUMENT";
  return "UPSTOX_API_ERROR";
}

export async function get(token: string, endpoint: string, params: Record<string, string>, ctx: { index: IndexId; expiry?: string }) {
  const t0 = Date.now();
  const log = (status: number | null, ok: boolean, extra: object = {}) =>
    console[ok ? "info" : "warn"](
      JSON.stringify({ evt: "upstox_request", endpoint, index: ctx.index, expiry: ctx.expiry ?? null, status, durationMs: Date.now() - t0, ok, ...extra }),
    );
  let status: number | null = null;
  try {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${HOST}${endpoint}${qs ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    status = res.status;
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = body?.errors?.[0]?.message ?? `HTTP ${status}`;
      throw new UpstoxError(reasonFor(status, msg), msg, status);
    }
    if (!body || body.status !== "success" || body.data == null) throw new UpstoxError("UPSTOX_BAD_RESPONSE", "malformed response", status);
    log(status, true);
    return body.data as unknown;
  } catch (e) {
    const err =
      e instanceof UpstoxError
        ? e
        : (e as Error).name === "TimeoutError"
          ? new UpstoxError("UPSTOX_TIMEOUT", `no response within ${TIMEOUT_MS} ms`)
          : new UpstoxError("UPSTOX_NETWORK", (e as Error).message);
    log(status, false, { reason: err.reason, message: err.message });
    throw err;
  }
}

// --- normalizers (pure; exported for tests) ---
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pos = (v: unknown) => {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
};
type Raw = Record<string, unknown> | null | undefined;

export function normalizeQuote(data: unknown, index: IndexId): Omit<IndexQuote, "source"> & { lastTradeTime: string | null } {
  const key = INSTRUMENTS[index].underlyingKey;
  if (!data || typeof data !== "object") throw new UpstoxError("UPSTOX_BAD_RESPONSE", "quote data missing");
  // Response keys use ':' (NSE_INDEX:Nifty 50); instrument_token keeps the '|' form.
  const entry = Object.entries(data as Record<string, Raw>).find(
    ([k, v]) => v?.instrument_token === key || k === key.replace("|", ":"),
  )?.[1];
  if (!entry) throw new UpstoxError("UPSTOX_INVALID_INSTRUMENT", `no quote for ${key}`);
  const spot = pos(entry.last_price);
  if (spot === null) throw new UpstoxError("UPSTOX_BAD_RESPONSE", "quote without last_price");
  const change = num(entry.net_change);
  const ltt = Number(entry.last_trade_time);
  const lastTradeTime = Number.isFinite(ltt) && ltt > 0 ? new Date(ltt).toISOString() : null;
  return { index, spot, prevClose: change === null ? null : Math.round((spot - change) * 100) / 100, lastTradeTime };
}

export function normalizeExpiries(data: unknown): string[] {
  if (!Array.isArray(data)) throw new UpstoxError("UPSTOX_BAD_RESPONSE", "option contracts not a list");
  return [...new Set(data.map((c: Raw) => c?.expiry).filter((e): e is string => typeof e === "string"))].sort();
}

export function normalizeOptionContracts(data: unknown): { expiries: string[]; lotSize: number | null } {
  if (!Array.isArray(data)) throw new UpstoxError("UPSTOX_BAD_RESPONSE", "option contracts not a list");
  const expiries = normalizeExpiries(data);
  const lotSize = (data as Raw[]).map((c: Raw) => pos(c?.lot_size)).find((v) => v !== null) ?? null;
  return { expiries, lotSize };
}

// Missing numbers: ltp/oi/volume → 0 (nothing traded); bid/ask/IV → null; Greeks → null (never computed here).
// Live check (2026-10-05): when Upstox can't compute IV it sends iv: 0 with placeholder Greeks
// (delta 1 or 0, gamma/theta/vega 0), so without a real IV every Greek is reported as unavailable.
function normalizeSide(side: Raw): Quote {
  const md = (side?.market_data ?? {}) as Record<string, unknown>;
  const gr = (side?.option_greeks ?? {}) as Record<string, unknown>;
  const iv = pos(gr.iv);
  const greek = (v: unknown) => (iv === null ? null : num(v));
  const oi = num(md.oi);
  const prevOi = num(md.prev_oi);
  // Preserve the actual Upstox instrument key — never construct it; null when absent.
  const instrumentKey = typeof side?.instrument_key === "string" && side.instrument_key ? side.instrument_key : null;
  return {
    ltp: num(md.ltp) ?? 0,
    bid: pos(md.bid_price),
    ask: pos(md.ask_price),
    oi: oi ?? 0,
    chgOi: oi !== null && prevOi !== null ? oi - prevOi : null,
    volume: num(md.volume) ?? 0,
    iv, // percent (live ATM values ~16–21); 0 means "not computed"
    delta: greek(gr.delta),
    gamma: greek(gr.gamma),
    theta: greek(gr.theta),
    vega: greek(gr.vega),
    instrumentKey,
  };
}

export function normalizeChain(data: unknown, index: IndexId, expiry: string): Omit<OptionChain, "source"> & { lastTradeTime: string | null } {
  if (!Array.isArray(data)) throw new UpstoxError("UPSTOX_BAD_RESPONSE", "option chain not a list");
  if (!data.length) throw new UpstoxError("UPSTOX_EMPTY_CHAIN", `no strikes for ${expiry}`);
  const rows = (data as Raw[])
    .filter((r) => num(r?.strike_price) !== null)
    .map((r) => ({ strike: num(r!.strike_price)!, call: normalizeSide(r!.call_options as Raw), put: normalizeSide(r!.put_options as Raw) }))
    .sort((a, b) => a.strike - b.strike);
  const spot = (data as Raw[]).map((r) => pos(r?.underlying_spot_price)).find((v) => v !== null) ?? null;
  const lotSize = (data as Raw[]).map((r) => pos(r?.lot_size) ?? pos((r?.call_options as Raw)?.lot_size) ?? pos((r?.put_options as Raw)?.lot_size)).find((v) => v !== null) ?? null;
  const ltts = (data as Record<string, unknown>[])
    .map((r) => {
      const callOpt = r?.call_options as Record<string, unknown> | undefined;
      const putOpt = r?.put_options as Record<string, unknown> | undefined;
      const callMarket = callOpt?.market_data as Record<string, unknown> | undefined;
      const putMarket = putOpt?.market_data as Record<string, unknown> | undefined;
      return Number(r?.last_trade_time) || Number(callMarket?.last_trade_time) || Number(putMarket?.last_trade_time);
    })
    .filter((t) => Number.isFinite(t) && t > 0);
  const lastTradeTime = ltts.length ? new Date(Math.max(...ltts)).toISOString() : null;
  if (!rows.length || spot === null) throw new UpstoxError("UPSTOX_BAD_RESPONSE", "option chain rows malformed");
  return { index, expiry, spot, strikeStep: strikeStep(rows, spot), lotSize, rows, lastTradeTime };
}

// Engine inputs need the core indicators; null means "can't trade on technicals" (never filled in).
export function toIndicators(t: TechnicalAnalysis | null): Indicators | null {
  if (!t || t.ema9 === null || t.ema21 === null || t.ema50 === null || t.rsi === null || t.macdHistogram === null) return null;
  if (t.dailyAtr === null || t.previousDayHigh === null || t.previousDayLow === null) return null;
  return {
    ema9: t.ema9,
    ema21: t.ema21,
    ema50: t.ema50,
    ema200: t.ema200,
    vwap: t.vwap,
    rsi: t.rsi,
    macdHist: t.macdHistogram,
    atr: t.dailyAtr,
    pdh: t.previousDayHigh,
    pdl: t.previousDayLow,
    orHigh: t.openingRangeHigh,
    orLow: t.openingRangeLow,
    futuresVwapState: t.futuresVwap && t.futuresVwap.state !== "UNAVAILABLE" ? t.futuresVwap.state : null,
  };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const shiftDays = (date: string, days: number) => ymd(new Date(Date.parse(date + "T00:00:00Z") + days * 86_400_000));

// --- provider ---
export function upstoxProvider(token: string, now = () => new Date()): MarketDataProvider {
  const live = (): SourceInfo => ({ source: "LIVE", provider: "UPSTOX", fetchedAt: now().toISOString() });
  const liveQuoteSource = (lastTradeTime?: string | null): SourceInfo => {
    const current = now();
    const fetchedAt = current.toISOString();
    let src: DataSource;
    if (lastTradeTime) {
      src = tradeFreshnessOf(lastTradeTime, current).source;
    } else {
      src = marketStatus(current) === "CLOSED" ? "END_OF_DAY" : "LIVE";
    }
    return {
      source: src,
      provider: "UPSTOX",
      fetchedAt,
      lastTradeTime: lastTradeTime ?? null,
    };
  };

  // Real candles only: completed history (cached ~1 h, keyed by IST date) + today's intraday bars (short TTL).
  // `label` namespaces the cache: spot "candles:NIFTY:15m", futures "futures-candles:NIFTY:2026-10-27:15m".
  const loadCandles = async (index: IndexId, instrumentKey: string, label: string, timeframe: Timeframe, historyDays?: number) => {
    const plan = CANDLE_PLAN[timeframe];
    const today = istToday(now());
    const key = encodeURIComponent(instrumentKey);
    const to = timeframe === "1d" ? today : shiftDays(today, -1);
    const from = shiftDays(today, -(historyDays ?? plan.historyDays));
    const history = cached(`${label}:history:${today}`, timeframe === "1d" ? DAILY_TTL_MS : HISTORY_TTL_MS, async () =>
      normalizeCandles(await get(token, `/v3/historical-candle/${key}/${plan.unit}/${plan.interval}/${to}/${from}`, {}, { index })),
    );
    const intraday =
      plan.intradayTtlMs === null
        ? Promise.resolve({ candles: [] as Candle[], fetchedAt: now().toISOString() })
        : cached(`${label}:intraday`, plan.intradayTtlMs, async () => ({
            candles: normalizeCandles(await get(token, `/v3/historical-candle/intraday/${key}/${plan.unit}/${plan.interval}`, {}, { index })),
            fetchedAt: now().toISOString(),
          }));
    const [h, d] = await Promise.all([history, intraday]);
    return { candles: mergeCandles(h, d.candles), fetchedAt: d.fetchedAt };
  };

  const getCandles = async (index: IndexId, timeframe: Timeframe): Promise<CandleSeries> => {
    const { symbol, underlyingKey } = INSTRUMENTS[index];
    const { candles, fetchedAt } = await loadCandles(index, underlyingKey, `candles:${symbol}:${timeframe}`, timeframe);
    const d = { fetchedAt };
    return {
      index,
      timeframe,
      candles,
      source: candles.length ? { source: "LIVE", provider: "UPSTOX", fetchedAt: d.fetchedAt } : { source: "UNAVAILABLE", provider: "UPSTOX", fetchedAt: d.fetchedAt },
    };
  };

  // FUTURES VWAP for intraday timeframes. Any failure → UNAVAILABLE with the reason; never mock, never spot.
  const getFuturesVwap = async (index: IndexId, timeframe: Timeframe): Promise<FuturesVwap | null> => {
    if (timeframe === "1d") return null;
    const { symbol, underlyingKey } = INSTRUMENTS[index];
    let contract = null;
    try {
      const picked = selectFuturesContract(await fetchFuturesContracts(now()), underlyingKey, now());
      if (!picked) return unavailableVwap(timeframe, "No valid futures contract found");
      contract = picked.contract;
      const c = contract;
      const label = `futures-candles:${symbol}:${c.expiry}:${timeframe}`;
      const [series, ltp] = await Promise.all([
        loadCandles(index, c.instrumentKey, label, timeframe, 7), // VWAP needs only the latest session
        cached(`futures-quote:${symbol}:${c.expiry}`, TTL_MS.quote, async () => {
          const data = (await get(token, "/v2/market-quote/quotes", { instrument_key: c.instrumentKey }, { index })) as Record<string, Record<string, unknown>>;
          const q = Object.values(data ?? {}).find((v) => v?.instrument_token === c.instrumentKey);
          return pos(q?.last_price);
        }),
      ]);
      return futuresVwapFrom({ candles: series.candles, timeframe, contract: c, ltp, source: live(), now: now() });
    } catch (e) {
      if (e instanceof UpstoxError && e.reason !== "UPSTOX_AUTH_EXPIRED") return unavailableVwap(timeframe, `Futures data unavailable: ${e.message}`, contract);
      throw e;
    }
  };

  const getTechnicals = async (index: IndexId, timeframe: Timeframe = "15m"): Promise<Technicals> => {
    const unavailable = (why: string): Technicals => ({
      indicators: null,
      breadth: null,
      ivPercentile: null,
      analysis: null,
      source: { source: "UNAVAILABLE", provider: null, fetchedAt: null },
      unavailableReason: why,
    });
    try {
      const intradayTf = timeframe === "5m" || timeframe === "15m";
      const [series, daily, opening, futuresVwap] = await Promise.all([
        getCandles(index, timeframe),
        timeframe === "1d" ? null : getCandles(index, "1d"),
        intradayTf || timeframe === "1d" ? null : getCandles(index, "15m"),
        getFuturesVwap(index, timeframe),
      ]);
      if (!series.candles.length) return unavailable("MARKET CLOSED / NO DATA");
      const analysis = analyzeTechnicals({
        timeframe,
        candles: series.candles,
        daily: (daily ?? series).candles,
        openingCandles: (opening ?? series).candles,
        futuresVwap,
        now: now(),
      });
      const breadth = await getBreadth(index).catch(() => null);
      return { indicators: toIndicators(analysis), breadth, ivPercentile: null, analysis, source: series.source };
    } catch (e) {
      // A dead session must still fall back as a whole; any other candle failure only blanks technicals.
      if (e instanceof UpstoxError && e.reason !== "UPSTOX_AUTH_EXPIRED") return unavailable(`Candles unavailable: ${e.message}`);
      throw e;
    }
  };

  const getBreadth = async (index: IndexId): Promise<MarketBreadth> => {
    const constituents = INDEX_CONSTITUENTS[index];
    const { symbol } = INSTRUMENTS[index];
    return cached(`breadth:${symbol}`, TTL_MS.quote, async () => {
      try {
        const keys = constituents.map((c) => c.instrumentKey).join(",");
        const data = (await get(token, "/v2/market-quote/quotes", { instrument_key: keys }, { index })) as Record<string, Raw>;
        const spotQuote = await cached(`quote:${symbol}`, TTL_MS.quote, async () => {
          const norm = normalizeQuote(await get(token, "/v2/market-quote/quotes", { instrument_key: INSTRUMENTS[index].underlyingKey }, { index }), index);
          return {
            ...norm,
            source: liveQuoteSource(norm.lastTradeTime),
          };
        }).catch(() => null);

        const spotChgPct = spotQuote && spotQuote.prevClose ? ((spotQuote.spot - spotQuote.prevClose) / spotQuote.prevClose) * 100 : null;

        const constituentQuotes: ConstituentQuote[] = [];
        for (const c of constituents) {
          const key = c.instrumentKey;
          const entry = Object.entries(data ?? {}).find(
            ([k, v]) => v?.instrument_token === key || k === key || k === key.replace("|", ":"),
          )?.[1];
          if (!entry) continue;
          const lastPrice = pos(entry.last_price);
          const netChange = num(entry.net_change);
          if (lastPrice === null || netChange === null) continue;
          const previousClose = Math.round((lastPrice - netChange) * 100) / 100;
          if (!(previousClose > 0)) continue;
          const change = netChange;
          const changePercent = Math.round((change / previousClose) * 10000) / 100;
          const ltt = Number(entry.last_trade_time);
          constituentQuotes.push({
            symbol: c.symbol,
            lastPrice,
            previousClose,
            change,
            changePercent,
            timestamp: Number.isFinite(ltt) && ltt > 0 ? new Date(ltt).toISOString() : now().toISOString(),
          });
        }

        return calculateBreadth(index, constituentQuotes, spotChgPct, now());
      } catch (e) {
        if (e instanceof UpstoxError && e.reason === "UPSTOX_AUTH_EXPIRED") throw e;
        const msg = e instanceof Error ? e.message : "Breadth fetch failed";
        return unavailableBreadth(index, msg);
      }
    });
  };

  const getOptionContracts = async (index: IndexId) => {
    const { symbol, underlyingKey } = INSTRUMENTS[index];
    const all = await cached(`contracts:${symbol}:${istToday(now())}`, TTL_MS.expiries, async () => {
      const raw = await get(token, "/v2/option/contract", { instrument_key: underlyingKey }, { index });
      const norm = normalizeOptionContracts(raw);
      return { ...norm, source: live() };
    });
    return { expiries: validExpiries(all.expiries, now()), lotSize: all.lotSize, source: all.source };
  };

  const getExpiries = async (index: IndexId) => {
    const contracts = await getOptionContracts(index);
    return { expiries: contracts.expiries, source: contracts.source };
  };

  return {
    name: "UPSTOX",
    getMarketSnapshot: (index) => {
      const { symbol, underlyingKey } = INSTRUMENTS[index];
      return cached(`quote:${symbol}`, TTL_MS.quote, async () => {
        const norm = normalizeQuote(await get(token, "/v2/market-quote/quotes", { instrument_key: underlyingKey }, { index }), index);
        return {
          ...norm,
          source: liveQuoteSource(norm.lastTradeTime),
        };
      });
    },

    getExpiries,

    getOptionChain: async (index, expiry) => {
      const { symbol, underlyingKey } = INSTRUMENTS[index];
      const { expiries, lotSize: contractLotSize } = await getOptionContracts(index);
      if (expiry && !expiries.includes(expiry)) throw new InvalidRequestError(`Expiry ${expiry} is not available for ${symbol}`);
      const chosen = expiry ?? expiries[0];
      if (!chosen) throw new UpstoxError("UPSTOX_NO_EXPIRY", `no current expiry for ${symbol}`);
      return cached(`option-chain:${symbol}:${chosen}`, TTL_MS.chain, async () => {
        const norm = normalizeChain(await get(token, "/v2/option/chain", { instrument_key: underlyingKey, expiry_date: chosen }, { index, expiry: chosen }), index, chosen);
        const resolvedLotSize = norm.lotSize ?? contractLotSize ?? null;
        return {
          ...norm,
          lotSize: resolvedLotSize,
          source: liveQuoteSource(norm.lastTradeTime),
        };
      });
    },

    getTechnicals,
    getCandles,
    getBreadth,
  };
}

// Read-only chunk fetcher for the historical range loader: GET /v3/historical-candle/{key}/{unit}/{n}/{to}/{from}.
// Spaced ≥ 130 ms apart (≈ 460/min) to stay inside Upstox's per-minute API limit on long multi-instrument loads.
let lastHistoricalCall = 0;
export function upstoxChunkFetcher(token: string): ChunkFetcher {
  return async (req, chunk) => {
    const wait = lastHistoricalCall + 130 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastHistoricalCall = Date.now();
    const plan = CANDLE_PLAN[req.interval];
    const key = encodeURIComponent(req.instrumentKey);
    const index: IndexId = req.instrumentKey.includes("Bank") ? "banknifty" : "nifty";
    return get(token, `/v3/historical-candle/${key}/${plan.unit}/${plan.interval}/${chunk.to}/${chunk.from}`, {}, { index });
  };
}

// Same endpoint and spacing for any instrument (equities/indices) and any v3 unit, incl. weeks/months.
export function upstoxHistoryFetcher(token: string) {
  return async (instrumentKey: string, unit: string, n: number, chunk: { from: string; to: string }) => {
    const wait = lastHistoricalCall + 130 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastHistoricalCall = Date.now();
    const index: IndexId = instrumentKey.includes("Bank") ? "banknifty" : "nifty"; // log context only
    return get(token, `/v3/historical-candle/${encodeURIComponent(instrumentKey)}/${unit}/${n}/${chunk.to}/${chunk.from}`, {}, { index });
  };
}
