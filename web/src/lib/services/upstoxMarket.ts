// READ-ONLY Upstox market data: quotes, option contracts (expiries) and option chains.
// No order endpoints exist in this codebase. Raw Upstox shapes stop here; callers get normalized types.
import { UPSTOX_API_BASE } from "./upstoxEndpoints.ts";
import type { Candle, CandleSeries, ConstituentQuote, DataSource, FallbackReason, FuturesVwap, IndexId, IndexQuote, Indicators, MarketBreadth, MarketDataProvider, OptionChain, OptionRow, Quote, SourceInfo, TechnicalAnalysis, Technicals, Timeframe } from "../types.ts";
import { INSTRUMENTS } from "./instrumentRegistry.ts";
import { strikeStep, validExpiries } from "./optionChainAnalytics.ts";
import { InvalidRequestError, UpstoxError } from "./errors.ts";
import { FUTURE_TIMESTAMP_TOLERANCE_MS, istToday, marketStatus, MIN_LTT_EPOCH_MS, tradeFreshnessOf } from "../time.ts";
import { CANDLE_PLAN, DAILY_TTL_MS, HISTORY_TTL_MS, mergeCandles, normalizeCandles } from "./candles.ts";
import { classifyTechnicalSeries, completedDailyCandles, completedIntradayCandles, newestCandleUsable, newestRowShape } from "./candleFreshness.ts";
import { analyzeTechnicals } from "./technicalAnalysis.ts";
import type { ChunkFetcher } from "./historicalCandles.ts";
import { cached, clearUpstoxCache } from "./cache.ts";
import { assertUpstoxNetworkAllowed } from "./upstoxNetworkGate.ts";
import { fetchFuturesContracts, futuresVwapFrom, selectFuturesContract, unavailableVwap } from "./futures.ts";
import { INDEX_CONSTITUENTS } from "./breadthConfig.ts";
import { calculateBreadth, unavailableBreadth } from "./breadthService.ts";
import { verifyEvaluationOptionPrices } from "./optionPriceVerification.ts";

const HOST = UPSTOX_API_BASE;
const TIMEOUT_MS = 8_000;
export const TTL_MS = { quote: 5_000, chain: 15_000, expiries: 60 * 60_000 };

// --- cache: see cache.ts (keys are per index/expiry/timeframe, so NIFTY and BANK NIFTY never collide) ---
export { clearUpstoxCache };

// --- request + structured log (never logs the token, secret or auth code) ---
// Upstox error codes the project has verified. Only documented codes are mapped; the message text is never matched.
// UDAPI100060 = resource not found (seen on a 404 in the 2026-11-06 discovery record).
// No invalid-instrument code has been verified yet, so the list is empty. Add a code here only once it is documented.
export const UDAPI_NOT_FOUND = "UDAPI100060";
export const DOCUMENTED_INVALID_INSTRUMENT_CODES: readonly string[] = [];

export function reasonFor(status: number, errorCode: string | null): FallbackReason {
  if (status === 401) return "UPSTOX_AUTH_EXPIRED";
  if (status === 403) return "UPSTOX_FORBIDDEN";
  if (status === 429) return "UPSTOX_RATE_LIMITED";
  if (status === 404 || errorCode === UDAPI_NOT_FOUND) return "UPSTOX_NOT_FOUND";
  if (status === 400 && errorCode !== null && DOCUMENTED_INVALID_INSTRUMENT_CODES.includes(errorCode)) return "UPSTOX_INVALID_INSTRUMENT";
  return "UPSTOX_API_ERROR";
}

export async function get(token: string, endpoint: string, params: Record<string, string>, ctx: { index: IndexId; expiry?: string }) {
  const t0 = Date.now();
  const log = (status: number | null, ok: boolean, extra: object = {}) =>
    console[ok ? "info" : "warn"](
      JSON.stringify({ evt: "upstox_request", endpoint, index: ctx.index, expiry: ctx.expiry ?? null, status, durationMs: Date.now() - t0, ok, ...extra }),
    );
  let status: number | null = null;
  let errorCode: string | null = null;
  assertUpstoxNetworkAllowed(endpoint); // gate: refuses unless MARKET_DATA_PROVIDER=upstox
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
      const code = typeof body?.errors?.[0]?.errorCode === "string" ? body.errors[0].errorCode : null;
      errorCode = code;
      throw new UpstoxError(reasonFor(status, code), msg, status);
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
    log(status, false, { reason: err.reason, message: err.message, errorCode, instrumentKey: params.instrument_key ?? null });
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
  // Missing from a well-formed response is missing data, not proof that the instrument is invalid.
  if (!entry) throw new UpstoxError("UPSTOX_QUOTE_MISSING", `quote response did not include ${key}`);
  const spot = pos(entry.last_price);
  if (spot === null) throw new UpstoxError("UPSTOX_BAD_RESPONSE", "quote without last_price");
  const change = num(entry.net_change);
  const ltt = Number(entry.last_trade_time);
  const lastTradeTime = Number.isFinite(ltt) && ltt >= MIN_LTT_EPOCH_MS ? new Date(ltt).toISOString() : null;
  return { index, spot, prevClose: change === null ? null : Math.round((spot - change) * 100) / 100, lastTradeTime };
}

export function normalizeExpiries(data: unknown): string[] {
  if (!Array.isArray(data)) throw new UpstoxError("UPSTOX_BAD_RESPONSE", "option contracts not a list");
  return [...new Set(data.map((c: Raw) => c?.expiry).filter((e): e is string => typeof e === "string"))].sort();
}

export interface CanonicalOptionContract {
  instrumentKey: string;
  underlyingKey: string;
  expiry: string;
  strike: number;
  type: "CE" | "PE";
  lotSize: number;
}

export function normalizeOptionContracts(data: unknown): { expiries: string[]; lotSize: number | null; contracts: CanonicalOptionContract[] } {
  if (!Array.isArray(data)) throw new UpstoxError("UPSTOX_BAD_RESPONSE", "option contracts not a list");
  const expiries = normalizeExpiries(data);
  const lotSize = (data as Raw[]).map((c: Raw) => pos(c?.lot_size)).find((v) => v !== null) ?? null;
  const contracts = (data as Raw[]).flatMap((contract): CanonicalOptionContract[] => {
    const instrumentKey = typeof contract?.instrument_key === "string" ? contract.instrument_key : null;
    const underlyingKey = typeof contract?.underlying_key === "string" ? contract.underlying_key : null;
    const expiry = typeof contract?.expiry === "string" ? contract.expiry : null;
    const strike = pos(contract?.strike_price);
    const type = contract?.instrument_type;
    const size = pos(contract?.lot_size);
    if (!instrumentKey || !underlyingKey || !expiry || strike === null || (type !== "CE" && type !== "PE") || size === null) return [];
    return [{ instrumentKey, underlyingKey, expiry, strike, type, lotSize: size }];
  });
  return { expiries, lotSize, contracts };
}

export function validateCanonicalOptionRows(
  rows: OptionRow[],
  contracts: CanonicalOptionContract[],
  underlyingKey: string,
  expiry: string,
): void {
  const byKey = new Map(contracts.map((contract) => [contract.instrumentKey, contract]));
  const seen = new Set<string>();
  for (const row of rows) {
    for (const [type, quote] of [["CE", row.call], ["PE", row.put]] as const) {
      if (!quote.instrumentKey || seen.has(quote.instrumentKey)) {
        throw new UpstoxError("UPSTOX_BAD_RESPONSE", `missing or duplicate canonical key for ${row.strike}${type}`);
      }
      seen.add(quote.instrumentKey);
      const contract = byKey.get(quote.instrumentKey);
      if (!contract || contract.underlyingKey !== underlyingKey || contract.expiry !== expiry || contract.strike !== row.strike || contract.type !== type) {
        throw new UpstoxError("UPSTOX_BAD_RESPONSE", `canonical contract mismatch for ${row.strike}${type}`);
      }
    }
  }
  const expected = contracts.filter((contract) => contract.underlyingKey === underlyingKey && contract.expiry === expiry);
  const missing = expected.filter((contract) => !seen.has(contract.instrumentKey));
  if (missing.length > 0 || seen.size !== expected.length) {
    throw new UpstoxError("UPSTOX_BAD_RESPONSE", `incomplete canonical contract coverage: expected ${expected.length}, received ${seen.size}`);
  }
}

// Missing numbers: ltp/oi/volume → 0 (nothing traded); bid/ask/IV → null; Greeks → null (never computed here).
// Live check (2026-10-05): when Upstox can't compute IV it sends iv: 0 with placeholder Greeks
// (delta 1 or 0, gamma/theta/vega 0), so without a real IV every Greek is reported as unavailable.
// Lot size used for sizing. Two independent sources must agree when both are present: a disagreement makes the lot size
// UNKNOWN (null), which the risk layer blocks. It is never resolved by silently preferring one source.
export function resolveLotSize(chainLot: number | null, contractLot: number | null): number | null {
  if (chainLot !== null && contractLot !== null && chainLot !== contractLot) return null;
  return chainLot ?? contractLot ?? null;
}

function normalizeSide(side: Raw): Quote {
  const md = (side?.market_data ?? {}) as Record<string, unknown>;
  const gr = (side?.option_greeks ?? {}) as Record<string, unknown>;
  const iv = pos(gr.iv);
  const greek = (v: unknown) => (iv === null ? null : num(v));
  const oi = num(md.oi);
  const prevOi = num(md.prev_oi);
  // Preserve the actual Upstox instrument key — never construct it; null when absent.
  const instrumentKey = typeof side?.instrument_key === "string" && side.instrument_key ? side.instrument_key : null;
  const rawLtt = Number(md.last_trade_time) || Number(side?.last_trade_time);
  const lastTradeTime = Number.isFinite(rawLtt) && rawLtt >= MIN_LTT_EPOCH_MS
    ? new Date(rawLtt).toISOString()
    : null;
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
    lastTradeTime,
  };
}

export function normalizeChain(data: unknown, index: IndexId, expiry: string): Omit<OptionChain, "source"> & { lastTradeTime: string | null } {
  if (!Array.isArray(data)) throw new UpstoxError("UPSTOX_BAD_RESPONSE", "option chain not a list");
  if (!data.length) throw new UpstoxError("UPSTOX_EMPTY_CHAIN", `no strikes for ${expiry}`);
  // One row per strike: a duplicate strike would double the candidate list and request the same contract twice.
  // The first occurrence wins, deterministically. Non-positive strikes are not contracts.
  const seenStrikes = new Set<number>();
  const rows: { strike: number; call: ReturnType<typeof normalizeSide>; put: ReturnType<typeof normalizeSide> }[] = [];
  for (const r of data as Raw[]) {
    const strike = num(r?.strike_price);
    if (strike === null || strike <= 0 || seenStrikes.has(strike)) continue;
    seenStrikes.add(strike);
    rows.push({ strike, call: normalizeSide(r!.call_options as Raw), put: normalizeSide(r!.put_options as Raw) });
  }
  rows.sort((a, b) => a.strike - b.strike);
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
    .filter((t) => Number.isFinite(t) && t >= MIN_LTT_EPOCH_MS);
  const lastTradeTime = ltts.length ? new Date(Math.max(...ltts)).toISOString() : null;

  if (!rows.length || spot === null) throw new UpstoxError("UPSTOX_BAD_RESPONSE", "option chain rows malformed");
  return { index, expiry, spot, strikeStep: strikeStep(rows, spot), lotSize, rows, lastTradeTime };
}

// Engine inputs need the core indicators; null means "can't trade on technicals" (never filled in).
import { toIndicators } from "./technicalMapping.ts";
export { toIndicators };

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
      // No trade timestamp in response — cannot verify freshness.
      // Conservative: CLOSED → END_OF_DAY; OPEN/PRE-OPEN → STALE (not LIVE — LTT absent means unverified).
      src = marketStatus(current) === "CLOSED" ? "END_OF_DAY" : "STALE";
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
    // v2 key: the cached value now carries its own fetch time (B5). Older in-memory entries are never read.
    // Cached payloads hold only data and the newest row's shape. No freshness verdict is cached (B5).
    const rawRows = (data: unknown) => (data as { candles?: unknown[] } | null)?.candles;
    // A response whose rows are all malformed is a data-quality failure (fail-closed), not a transport error.
    const normalizeOrFlag = (data: unknown): { candles: Candle[]; allMalformed: boolean } => {
      try {
        return { candles: normalizeCandles(data), allMalformed: false };
      } catch (e) {
        if (e instanceof UpstoxError && e.reason === "UPSTOX_BAD_RESPONSE") return { candles: [], allMalformed: true };
        throw e;
      }
    };
    const history = cached(`${label}:history:v2:${today}`, timeframe === "1d" ? DAILY_TTL_MS : HISTORY_TTL_MS, async () => {
      const data = await get(token, `/v3/historical-candle/${key}/${plan.unit}/${plan.interval}/${to}/${from}`, {}, { index });
      const n = normalizeOrFlag(data);
      return {
        candles: n.candles,
        fetchedAt: now().toISOString(), // when this payload was actually fetched, not when it was read from cache
        shape: n.allMalformed ? { wellFormed: false, startMs: null } : newestRowShape(rawRows(data)),
      };
    });
    const intraday: Promise<{ candles: Candle[]; fetchedAt: string | null; shape: ReturnType<typeof newestRowShape> }> =
      plan.intradayTtlMs === null
        ? Promise.resolve({ candles: [] as Candle[], fetchedAt: null, shape: { wellFormed: true, startMs: null } }) // 1d: history only
        : cached(`${label}:intraday`, plan.intradayTtlMs, async () => {
            const data = await get(token, `/v3/historical-candle/intraday/${key}/${plan.unit}/${plan.interval}`, {}, { index });
            const n = normalizeOrFlag(data);
            return { candles: n.candles, fetchedAt: now().toISOString(), shape: n.allMalformed ? { wellFormed: false, startMs: null } : newestRowShape(rawRows(data)) };
          });
    const [h, d] = await Promise.all([history, intraday]);
    // Judged at request time, including on cache hits. A bar starting more than the approved 5 s after now is impossible.
    const at = now();
    const nowMs = at.getTime();
    const notFuture = (cs: Candle[]) => cs.filter((c) => Date.parse(c.timestamp) <= nowMs + FUTURE_TIMESTAMP_TOLERANCE_MS);
    // The newest expected row: intraday for intraday timeframes, history for 1d.
    const newestUsable = newestCandleUsable(timeframe === "1d" ? h.shape : d.shape, at);
    // Attribution: freshness comes from the intraday fetch. History is completed sessions, used when there is no intraday request.
    const fetchedAt = d.fetchedAt ?? h.fetchedAt;
    return { candles: mergeCandles(notFuture(h.candles), notFuture(d.candles)), fetchedAt, newestUsable };
  };

  const getCandles = async (index: IndexId, timeframe: Timeframe): Promise<CandleSeries> => {
    const { symbol, underlyingKey } = INSTRUMENTS[index];
    const { candles, fetchedAt, newestUsable } = await loadCandles(index, underlyingKey, `candles:${symbol}:${timeframe}`, timeframe);
    const at = now();
    // Only completed candles feed indicators and prices. The forming candle is excluded.
    const completed = timeframe === "1d" ? completedDailyCandles(candles, at) : completedIntradayCandles(candles, timeframe, at);
    const cls = classifyTechnicalSeries({
      timeframe, completed, now: at, market: marketStatus(at), newestUsable,
      fetchAgeMs: fetchedAt ? at.getTime() - Date.parse(fetchedAt) : null, // fetch age, judged at request time (B6)
    });
    return {
      index,
      timeframe,
      candles: completed,
      source: { source: cls.source, provider: "UPSTOX", fetchedAt, lastTradeTime: cls.lastCompletedAt },
      unavailableReason: cls.reason,
      reasonCode: cls.reasonCode,
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
      // Completed candles only, and only when the newest expected candle passed the data-quality check (B5).
      if (!series.newestUsable) return unavailableVwap(timeframe, "Futures candles failed the data-quality check", c);
      return futuresVwapFrom({ candles: completedIntradayCandles(series.candles, timeframe, now()), timeframe, contract: c, ltp, source: live(), now: now() });
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
      // Unavailable (no completed candles, malformed newest candle, pre-open, no intraday yet, ...): carry the reason through.
      if (series.source.source === "UNAVAILABLE") {
        return { ...unavailable(series.unavailableReason ?? "No completed candles are available for technical analysis."), reasonCode: series.reasonCode ?? null, source: series.source };
      }
      const analysis = analyzeTechnicals({
        timeframe,
        candles: series.candles,
        daily: (daily ?? series).candles,
        openingCandles: (opening ?? series).candles,
        futuresVwap,
        now: now(),
      });
      const breadth = await getBreadth(index).catch(() => null);
      return { indicators: toIndicators(analysis), breadth, ivPercentile: null, analysis, source: series.source, reasonCode: series.reasonCode ?? null, unavailableReason: series.unavailableReason ?? undefined };
    } catch (e) {
      // A dead session must still fall back as a whole; any other candle failure only blanks technicals.
      if (e instanceof UpstoxError && e.reason !== "UPSTOX_AUTH_EXPIRED") return unavailable(`Candles unavailable: ${e.message}`);
      throw e;
    }
  };

  const getBreadth = async (index: IndexId): Promise<MarketBreadth> => {
    const constituents = INDEX_CONSTITUENTS[index];
    if (!constituents || constituents.length === 0) {
      return unavailableBreadth(index, "No constituent mapping configured for this index (BSE constituent download not automated)");
    }
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
            // No usable trade time → null (undated). Never substitute the current time: that made the quote look fresh (B4).
            timestamp: Number.isFinite(ltt) && ltt >= MIN_LTT_EPOCH_MS ? new Date(ltt).toISOString() : null,
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
    return { expiries: validExpiries(all.expiries, now()), lotSize: all.lotSize, contracts: all.contracts, source: all.source };
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
      const { expiries, lotSize: contractLotSize, contracts } = await getOptionContracts(index);
      if (expiry && !expiries.includes(expiry)) throw new InvalidRequestError(`Expiry ${expiry} is not available for ${symbol}`);
      const chosen = expiry ?? expiries[0];
      if (!chosen) throw new UpstoxError("UPSTOX_NO_EXPIRY", `no current expiry for ${symbol}`);
      return cached(`option-chain:${symbol}:${chosen}`, TTL_MS.chain, async () => {
        const norm = normalizeChain(await get(token, "/v2/option/chain", { instrument_key: underlyingKey, expiry_date: chosen }, { index, expiry: chosen }), index, chosen);
        validateCanonicalOptionRows(norm.rows, contracts, underlyingKey, chosen);
        const verified = await verifyEvaluationOptionPrices(
          norm.rows,
          norm.spot,
          index,
          now(),
          async (keys) => await get(token, "/v3/market-quote/quotes", { instrument_key: keys.join(",") }, { index }) as Record<string, Record<string, unknown>>,
          7,
          chosen,
        );
        const resolvedLotSize = resolveLotSize(norm.lotSize ?? null, contractLotSize ?? null);
        return {
          ...norm,
          rows: verified.rows,
          lotSize: resolvedLotSize,
          source: liveQuoteSource(norm.lastTradeTime),
          optionPriceVerification: verified.summary,
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
// Reservations are synchronous and sequential so concurrent callers never race on the rate limit.
let nextHistoricalSlot = 0;
export const MIN_HISTORICAL_SPACING_MS = 130;

export function resetHistoricalCallThrottle(): void {
  nextHistoricalSlot = 0;
}

export async function scheduleHistoricalCall<T>(action: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const scheduledTime = Math.max(now, nextHistoricalSlot);
  nextHistoricalSlot = scheduledTime + MIN_HISTORICAL_SPACING_MS;
  const wait = scheduledTime - now;
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  return action();
}

export function upstoxChunkFetcher(token: string): ChunkFetcher {
  return async (req, chunk) => {
    const plan = CANDLE_PLAN[req.interval];
    const key = encodeURIComponent(req.instrumentKey);
    const index: IndexId = req.instrumentKey.includes("Bank") ? "banknifty" : "nifty";
    return scheduleHistoricalCall(() =>
      get(token, `/v3/historical-candle/${key}/${plan.unit}/${plan.interval}/${chunk.to}/${chunk.from}`, {}, { index })
    );
  };
}

// Same endpoint and spacing for any instrument (equities/indices) and any v3 unit, incl. weeks/months.
export function upstoxHistoryFetcher(token: string) {
  return async (instrumentKey: string, unit: string, n: number, chunk: { from: string; to: string }) => {
    const index: IndexId = instrumentKey.includes("Bank") ? "banknifty" : "nifty"; // log context only
    return scheduleHistoricalCall(() =>
      get(token, `/v3/historical-candle/${encodeURIComponent(instrumentKey)}/${unit}/${n}/${chunk.to}/${chunk.from}`, {}, { index })
    );
  };
}
