// Near-month index futures: contract discovery + session VWAP. Futures VWAP is a proxy/reference for the
// index (index candles carry no volume) and is always labelled as FUTURES VWAP, never as spot VWAP.
import { gunzipSync } from "node:zlib";
import type { Candle, FuturesVwap, SourceInfo, Timeframe } from "../types.ts";
import { isTradingDay, istMinutes, istToday } from "../time.ts";
import { istDate } from "./technicalAnalysis.ts";
import { cached } from "./cache.ts";
import { UpstoxError } from "./errors.ts";

// Upstox's public, daily-refreshed NSE instrument master (no token needed).
const INSTRUMENTS_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";
const CONTRACTS_TTL_MS = 60 * 60_000;
export const AT_VWAP_PCT = 0.02; // |futures − VWAP| below 0.02% of VWAP = AT VWAP

// Rollover rule: if the nearest contract has ≤ FUTURES_ROLLOVER_DAYS trading days left (counting today,
// and the expiry day itself), use the next contract instead. Default 2 = roll on expiry day and the day before.
export function rolloverDays() {
  const n = Number(process.env.FUTURES_ROLLOVER_DAYS ?? 2);
  return Number.isFinite(n) && n >= 0 ? n : 2;
}

export interface FuturesContract {
  instrumentKey: string;
  tradingSymbol: string;
  underlyingKey: string;
  expiry: string; // YYYY-MM-DD (IST)
  expiryAt: number; // epoch ms of last trading moment
  lotSize: number | null;
}

type Raw = Record<string, unknown>;

export function normalizeFuturesContracts(raw: unknown): FuturesContract[] {
  if (!Array.isArray(raw)) throw new UpstoxError("UPSTOX_BAD_RESPONSE", "instrument master not a list");
  return (raw as Raw[])
    .filter(
      (x) =>
        x?.instrument_type === "FUT" &&
        x.segment === "NSE_FO" &&
        typeof x.instrument_key === "string" &&
        typeof x.underlying_key === "string" &&
        typeof x.expiry === "number",
    )
    .map((x) => ({
      instrumentKey: x.instrument_key as string,
      tradingSymbol: String(x.trading_symbol ?? x.instrument_key),
      underlyingKey: x.underlying_key as string,
      expiry: istDate(new Date(x.expiry as number).toISOString()),
      expiryAt: x.expiry as number,
      lotSize: typeof x.lot_size === "number" ? x.lot_size : null,
    }));
}

// Trading days from today through `expiry`, both included (0 if already past).
export function tradingDaysLeft(expiry: string, now: Date): number {
  let n = 0;
  for (let d = istToday(now); d <= expiry; d = new Date(Date.parse(d + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10))
    if (isTradingDay(d)) n++;
  return n;
}

export function selectFuturesContract(contracts: FuturesContract[], underlyingKey: string, now: Date, rollover = rolloverDays()) {
  const valid = contracts
    .filter((c) => c.underlyingKey === underlyingKey && c.expiryAt > now.getTime()) // never an expired contract
    .sort((a, b) => a.expiryAt - b.expiryAt);
  if (!valid.length) return null;
  const roll = valid.length > 1 && tradingDaysLeft(valid[0].expiry, now) <= rollover;
  return { contract: roll ? valid[1] : valid[0], rolledOver: roll };
}

// Contract list cached per IST day; selection re-runs on every call, so expiry is always re-checked.
export function fetchFuturesContracts(now: Date): Promise<FuturesContract[]> {
  return cached(`futures-contracts:${istToday(now)}`, CONTRACTS_TTL_MS, async () => {
    const t0 = Date.now();
    const log = (status: number | null, ok: boolean, extra: object = {}) =>
      console[ok ? "info" : "warn"](JSON.stringify({ evt: "upstox_request", endpoint: "instruments/NSE.json.gz", status, durationMs: Date.now() - t0, ok, ...extra }));
    let status: number | null = null;
    try {
      const res = await fetch(INSTRUMENTS_URL, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
      status = res.status;
      if (!res.ok) throw new UpstoxError("UPSTOX_API_ERROR", `instrument master HTTP ${status}`, status);
      const list = normalizeFuturesContracts(JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8")));
      log(status, true, { futures: list.length });
      return list;
    } catch (e) {
      const err = e instanceof UpstoxError ? e : new UpstoxError("UPSTOX_NETWORK", (e as Error).message);
      log(status, false, { reason: err.reason, message: err.message });
      throw err;
    }
  });
}

export function unavailableVwap(timeframe: Timeframe, reason: string, contract?: FuturesContract | null, source?: SourceInfo): FuturesVwap {
  return {
    instrument: contract?.tradingSymbol ?? null,
    instrumentKey: contract?.instrumentKey ?? null,
    expiry: contract?.expiry ?? null,
    timeframe,
    price: null,
    vwap: null,
    distance: null,
    distancePercent: null,
    state: "UNAVAILABLE",
    reason,
    sessionDate: null,
    candleCount: 0,
    source: source ?? { source: "UNAVAILABLE", provider: null, fetchedAt: null },
  };
}

// Standard session VWAP on the latest IST session of the futures candles: Σ(typical × volume) / Σ volume.
export function futuresVwapFrom(input: {
  candles: Candle[]; // futures, oldest first
  timeframe: Timeframe;
  contract: FuturesContract;
  ltp: number | null;
  source: SourceInfo;
  now: Date;
}): FuturesVwap {
  const { candles, timeframe, contract, ltp, source, now } = input;
  if (timeframe === "1d") return unavailableVwap(timeframe, "VWAP is intraday only", contract, source);
  if (!candles.length) return unavailableVwap(timeframe, "Futures candles unavailable", contract, source);
  const sessionDate = istDate(candles[candles.length - 1].timestamp);
  const session = candles.filter((c) => istDate(c.timestamp) === sessionDate);
  const total = session.reduce((t, c) => t + (c.volume ?? 0), 0);
  if (session.some((c) => c.volume === null) || total <= 0) return unavailableVwap(timeframe, "Futures volume unavailable", contract, source);
  const vwap = session.reduce((t, c) => t + ((c.high + c.low + c.close) / 3) * c.volume!, 0) / total;
  // Before today's open the latest session is a previous day: its VWAP is history, not a live signal.
  const today = istToday(now);
  if (sessionDate !== today && isTradingDay(today) && istMinutes(now).minutes >= 9 * 60 + 15)
    return { ...unavailableVwap(timeframe, `No futures candles yet for today (latest session ${sessionDate})`, contract, source), sessionDate };
  const price = ltp ?? session[session.length - 1].close;
  const distance = price - vwap;
  const pct = (distance / vwap) * 100;
  return {
    instrument: contract.tradingSymbol,
    instrumentKey: contract.instrumentKey,
    expiry: contract.expiry,
    timeframe,
    price,
    vwap: Math.round(vwap * 100) / 100,
    distance: Math.round(distance * 100) / 100,
    distancePercent: Math.round(pct * 1000) / 1000,
    state: Math.abs(pct) < AT_VWAP_PCT ? "AT VWAP" : distance > 0 ? "ABOVE VWAP" : "BELOW VWAP",
    reason: null,
    sessionDate,
    candleCount: session.length,
    source,
  };
}
