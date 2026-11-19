import type { IndexId, OptionRow, Quote } from "../types.ts";
import { tradeFreshnessOf } from "../time.ts";
import { bs } from "./mock.ts";
import { candidateWindow, CANDIDATE_MAX_STRIKES_ATM } from "./optionCandidateWindow.ts";

export const OPTION_QUOTE_BATCH_SIZE = 500;
export const OPTION_LTP_CONSISTENCY_THRESHOLD_PCT = 0.02;
// NSE option premiums move in ₹0.05 steps. A difference of one step is rounding to the tick grid, not a mismatch.
export const OPTION_PRICE_TICK = 0.05;

// Tick-aware consistency (B2): 2% of the price, but never less than one tick. A percentage below one tick would turn an
// ordinary one-tick difference on a cheap option into a false mismatch. Two or more ticks on a cheap option, or a
// percentage beyond 2% on a dear one, is still a mismatch.
export function optionPriceTolerance(ltp: number): number {
  return Math.max(ltp * OPTION_LTP_CONSISTENCY_THRESHOLD_PCT, OPTION_PRICE_TICK);
}
export function optionPricesConsistent(chainLtp: number, quoteLtp: number): boolean {
  if (!(chainLtp > 0) || !Number.isFinite(quoteLtp)) return false;
  return Math.abs(chainLtp - quoteLtp) <= optionPriceTolerance(chainLtp) + 1e-9;
}
export const OPTION_MODEL_RISK_FREE_RATE = 0.065;
export const OPTION_MODEL_DIVIDEND_YIELD = 0;

/**
 * Independent model policy:
 * - European Black-Scholes on the underlying index spot (not a futures/forward price).
 * - Continuously compounded 6.5% annual risk-free rate and zero dividend/basis adjustment.
 * - Time ends at 15:30 IST on expiry day, using a 365-day year.
 * - The solver consumes the independently fetched Full Quotes V3 LTP.
 * These outputs are INDEPENDENTLY_DERIVED, never exchange-verified. Invalid inputs,
 * expired contracts and non-convergent prices leave IV/Greeks unavailable.
 */

export type ContractPriceQuality =
  | "CONTRACT_PRICE_LIVE"
  | "CONTRACT_PRICE_AGING"
  | "CONTRACT_PRICE_STALE"
  | "CONTRACT_PRICE_UNAVAILABLE"
  | "CONTRACT_PRICE_MISMATCH";

// Candidate-window verification (B3/B7): the engine's ATM ±N strikes, reported next to the full-chain gate.
export interface OptionWindowSummary {
  atmStrike: number;
  maxStrikesAtm: number;
  strikes: number[];               // strikes inside the window, ascending
  verifiedContracts: number;       // window contracts with an instrument key that were price-verified
  eligibleContracts: number;       // LIVE and independently consistent
  rejectedContracts: number;       // verified but not eligible
  rejectionReasons: Record<string, number>; // contract quality (or PRICE_INCONSISTENT) → count, window only
  outsideWindowContracts: number;  // contracts with a key outside the window (verified for analytics only)
}

export interface OptionPriceVerificationSummary {
  state: ContractPriceQuality;
  window?: OptionWindowSummary;
  chainAnalytics: "CHAIN_ANALYTICS_VERIFIED_BOUNDED" | "CHAIN_ANALYTICS_UNVERIFIED";
  oiAnalytics: "OI_ANALYTICS_VERIFIED_BOUNDED" | "OI_ANALYTICS_UNAVAILABLE";
  volumeAnalytics: "VOLUME_ANALYTICS_VERIFIED_BOUNDED" | "VOLUME_ANALYTICS_UNAVAILABLE";
  analyticsProvenance: "UPSTOX_FULL_QUOTES_V3_BOUNDED_REST_SNAPSHOT" | "UNAVAILABLE";
  quoteResponseTime: string;
  requestedKeys: number;
  coveredKeys: number;
  liveKeys: number;
  agingKeys: number;
  staleKeys: number;
  unavailableKeys: number;
  mismatchedKeys: number;
  eligibleKeys: number;
  missingKeys: string[];
  error: string | null;
}

type RawQuote = Record<string, unknown>;
type QuoteFetcher = (keys: string[], index: IndexId) => Promise<Record<string, RawQuote>>;

function allContractKeys(rows: OptionRow[]): string[] {
  const keys = new Set<string>();
  rows.forEach((row) => {
    if (row.call.instrumentKey) keys.add(row.call.instrumentKey);
    if (row.put.instrumentKey) keys.add(row.put.instrumentKey);
  });
  return [...keys];
}

const finiteNonNegative = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const finitePositive = (v: unknown): number | null => {
  const n = finiteNonNegative(v);
  return n !== null && n > 0 ? n : null;
};

function depthPrice(raw: RawQuote, side: "buy" | "sell"): number | null {
  const depth = raw.depth && typeof raw.depth === "object" ? raw.depth as Record<string, unknown> : null;
  const levels = depth && Array.isArray(depth[side]) ? depth[side] as Record<string, unknown>[] : [];
  return levels.map((level) => finitePositive(level.price)).find((price) => price !== null) ?? null;
}

function yearsToExpiry(expiry: string | undefined, now: Date): number | null {
  if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return null;
  const years = (new Date(`${expiry}T15:30:00+05:30`).getTime() - now.getTime()) / (365 * 86_400_000);
  return Number.isFinite(years) && years > 0 ? years : null;
}

function deriveIv(price: number, spot: number, strike: number, years: number, type: "CE" | "PE"): number | null {
  if (!(price > 0 && spot > 0 && strike > 0 && years > 0)) return null;
  const value = (vol: number) => (type === "CE" ? bs(spot, strike, years, vol).call : bs(spot, strike, years, vol).put) - price;
  let low = 0.001;
  let high = 5;
  if (value(low) > 0 || value(high) < 0) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    if (value(mid) > 0) high = mid;
    else low = mid;
  }
  return (low + high) / 2;
}

function verifyQuote(
  q: Quote,
  raw: RawQuote | undefined,
  now: Date,
  spot: number,
  strike: number,
  type: "CE" | "PE",
  expiry?: string,
): Quote {
  if (!raw) return {
    ...q,
    lastTradeTime: null,
    independentQuoteLtp: null,
    ltpDiscrepancy: null,
    ltpConsistent: null,
    contractPriceQuality: "CONTRACT_PRICE_UNAVAILABLE",
    previousOi: null,
    quoteResponseTime: null,
    analyticsProvenance: "UNAVAILABLE",
    oiAnalyticsAvailable: false,
    volumeAnalyticsAvailable: false,
    ivProvenance: q.iv === null ? "UNAVAILABLE" : "VENDOR_REPORTED_UNVERIFIED",
    greeksProvenance: q.delta === null ? "UNAVAILABLE" : "VENDOR_REPORTED_UNVERIFIED",
  };
  // Analytics fields are independent of whether this contract traded recently.
  // REST receipt time bounds the reconstruction; it is not an exchange OI timestamp.
  const oi = finiteNonNegative(raw.oi);
  const previousOi = finiteNonNegative(raw.previous_oi);
  const volume = finiteNonNegative(raw.volume);
  const oiAnalyticsAvailable = oi !== null && previousOi !== null;
  const volumeAnalyticsAvailable = volume !== null;
  const analyticsComplete = oiAnalyticsAvailable && volumeAnalyticsAvailable;
  const bid = depthPrice(raw, "buy");
  const ask = depthPrice(raw, "sell");
  const quoteLtp = typeof raw.last_price === "number" && Number.isFinite(raw.last_price) && raw.last_price > 0
    ? raw.last_price
    : null;
  const rawLtt = Number(raw.last_trade_time);
  const lastTradeTime = Number.isFinite(rawLtt) && rawLtt > 0 ? new Date(rawLtt).toISOString() : null;
  const quoteResponseTime = now.toISOString();
  if (quoteLtp === null || !lastTradeTime) return {
    ...q,
    bid: bid ?? q.bid,
    ask: ask ?? q.ask,
    oi: oi ?? q.oi,
    previousOi,
    chgOi: oiAnalyticsAvailable ? oi - previousOi : null,
    volume: volume ?? q.volume,
    lastTradeTime,
    independentQuoteLtp: quoteLtp,
    ltpDiscrepancy: null,
    ltpConsistent: null,
    contractPriceQuality: "CONTRACT_PRICE_UNAVAILABLE",
    quoteResponseTime,
    analyticsProvenance: analyticsComplete ? "UPSTOX_FULL_QUOTES_V3_BOUNDED_REST_SNAPSHOT" : "UNAVAILABLE",
    oiAnalyticsAvailable,
    volumeAnalyticsAvailable,
    ivProvenance: q.iv === null ? "UNAVAILABLE" : "VENDOR_REPORTED_UNVERIFIED",
    greeksProvenance: q.delta === null ? "UNAVAILABLE" : "VENDOR_REPORTED_UNVERIFIED",
  };

  const freshness = tradeFreshnessOf(lastTradeTime, now);
  const discrepancy = Math.abs(q.ltp - quoteLtp);
  const consistent = optionPricesConsistent(q.ltp, quoteLtp);
  const quality: ContractPriceQuality = !consistent
    ? "CONTRACT_PRICE_MISMATCH"
    : freshness.freshness === "LIVE"
      ? "CONTRACT_PRICE_LIVE"
      : freshness.freshness === "AGING"
        ? "CONTRACT_PRICE_AGING"
        : "CONTRACT_PRICE_STALE";
  const years = yearsToExpiry(expiry, now);
  const derivedIv = years === null ? null : deriveIv(quoteLtp, spot, strike, years, type);
  const model = derivedIv === null || years === null ? null : bs(spot, strike, years, derivedIv);

  return {
    ...q,
    bid: bid ?? q.bid,
    ask: ask ?? q.ask,
    oi: oi ?? q.oi,
    previousOi,
    chgOi: oi !== null && previousOi !== null ? oi - previousOi : null,
    volume: volume ?? q.volume,
    iv: derivedIv === null ? q.iv : derivedIv * 100,
    delta: model === null ? q.delta : (type === "CE" ? model.callDelta : model.putDelta),
    gamma: model?.gamma ?? q.gamma ?? null,
    theta: model === null ? q.theta ?? null : (type === "CE" ? model.callTheta : model.putTheta),
    vega: model?.vega ?? q.vega ?? null,
    lastTradeTime,
    independentQuoteLtp: quoteLtp,
    ltpDiscrepancy: discrepancy,
    ltpConsistent: consistent,
    contractPriceQuality: quality,
    quoteResponseTime,
    analyticsProvenance: analyticsComplete ? "UPSTOX_FULL_QUOTES_V3_BOUNDED_REST_SNAPSHOT" : "UNAVAILABLE",
    oiAnalyticsAvailable,
    volumeAnalyticsAvailable,
    ivProvenance: derivedIv === null ? (q.iv === null ? "UNAVAILABLE" : "VENDOR_REPORTED_UNVERIFIED") : "INDEPENDENTLY_DERIVED",
    greeksProvenance: model === null ? (q.delta === null ? "UNAVAILABLE" : "VENDOR_REPORTED_UNVERIFIED") : "INDEPENDENTLY_DERIVED",
  };
}

function safeError(error: unknown): string {
  const e = error as { reason?: unknown; status?: unknown; message?: unknown };
  const reason = typeof e?.reason === "string" ? e.reason : "OPTION_QUOTE_FETCH_FAILED";
  const status = typeof e?.status === "number" ? ` (HTTP ${e.status})` : "";
  return `${reason}${status}`;
}

export async function verifyEvaluationOptionPrices(
  rows: OptionRow[],
  spot: number,
  index: IndexId,
  now: Date,
  fetchQuotes: QuoteFetcher,
  maxStrikesAtm = CANDIDATE_MAX_STRIKES_ATM,
  expiry?: string,
): Promise<{ rows: OptionRow[]; summary: OptionPriceVerificationSummary }> {
  // PCR, OI and volume aggregate the entire returned chain, so verification
  // must cover that same universe. Candidate selection may still remain ATM-bounded.
  const requestedKeys = allContractKeys(rows);
  const requested = new Set(requestedKeys);
  const quotes = new Map<string, RawQuote>();
  let error: string | null = null;

  try {
    for (let offset = 0; offset < requestedKeys.length; offset += OPTION_QUOTE_BATCH_SIZE) {
      const batch = requestedKeys.slice(offset, offset + OPTION_QUOTE_BATCH_SIZE);
      const raw = await fetchQuotes(batch, index);
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("malformed option quote response");
      for (const entry of Object.values(raw)) {
        const token = entry?.instrument_token;
        if (typeof token === "string" && requested.has(token) && !quotes.has(token)) quotes.set(token, entry);
      }
    }
  } catch (e) {
    error = safeError(e);
    quotes.clear();
  }

  const missingKeys = requestedKeys.filter((key) => !quotes.has(key));
  const verifiedRows = rows.map((row) => ({
    ...row,
    call: row.call.instrumentKey && requested.has(row.call.instrumentKey)
      ? verifyQuote(row.call, quotes.get(row.call.instrumentKey), now, spot, row.strike, "CE", expiry)
      : row.call,
    put: row.put.instrumentKey && requested.has(row.put.instrumentKey)
      ? verifyQuote(row.put, quotes.get(row.put.instrumentKey), now, spot, row.strike, "PE", expiry)
      : row.put,
  }));
  const verified = verifiedRows.flatMap((row) => [row.call, row.put]).filter((q) => q.instrumentKey && requested.has(q.instrumentKey));
  const liveKeys = verified.filter((q) => q.contractPriceQuality === "CONTRACT_PRICE_LIVE").length;
  const agingKeys = verified.filter((q) => q.contractPriceQuality === "CONTRACT_PRICE_AGING").length;
  const staleKeys = verified.filter((q) => q.contractPriceQuality === "CONTRACT_PRICE_STALE").length;
  const unavailableKeys = verified.filter((q) => q.contractPriceQuality === "CONTRACT_PRICE_UNAVAILABLE").length;
  const mismatchedKeys = verified.filter((q) => q.contractPriceQuality === "CONTRACT_PRICE_MISMATCH").length;
  const eligibleKeys = verified.filter((q) => q.contractPriceQuality === "CONTRACT_PRICE_LIVE" && q.ltpConsistent === true).length;
  const coverageComplete = requestedKeys.length > 0 && missingKeys.length === 0 && verified.length === requestedKeys.length;
  const oiAnalyticsComplete = coverageComplete && verified.every((q) => q.oiAnalyticsAvailable === true);
  const volumeAnalyticsComplete = coverageComplete && verified.every((q) => q.volumeAnalyticsAvailable === true);
  const analyticsComplete = oiAnalyticsComplete && volumeAnalyticsComplete;

  const windowInfo = candidateWindow(rows, spot, maxStrikesAtm);
  const windowQuotes = verifiedRows
    .filter((r) => windowInfo.strikeSet.has(r.strike))
    .flatMap((r) => [r.call, r.put])
    .filter((q) => q.instrumentKey && requested.has(q.instrumentKey));
  const windowRejectionReasons: Record<string, number> = {};
  let windowEligible = 0;
  for (const q of windowQuotes) {
    if (q.contractPriceQuality === "CONTRACT_PRICE_LIVE" && q.ltpConsistent === true) { windowEligible++; continue; }
    const reason = q.contractPriceQuality === "CONTRACT_PRICE_LIVE" ? "PRICE_INCONSISTENT" : (q.contractPriceQuality ?? "UNVERIFIED");
    windowRejectionReasons[reason] = (windowRejectionReasons[reason] ?? 0) + 1;
  }
  const allQuoteCount = rows.reduce((n, r) => n + (r.call.instrumentKey ? 1 : 0) + (r.put.instrumentKey ? 1 : 0), 0);
  const windowSummary: OptionWindowSummary = {
    atmStrike: windowInfo.atmStrike,
    maxStrikesAtm,
    strikes: windowInfo.strikes,
    verifiedContracts: windowQuotes.length,
    eligibleContracts: windowEligible,
    rejectedContracts: windowQuotes.length - windowEligible,
    rejectionReasons: windowRejectionReasons,
    outsideWindowContracts: Math.max(0, allQuoteCount - windowQuotes.length),
  };

  const state: ContractPriceQuality = requestedKeys.length > 0 && liveKeys === requestedKeys.length && eligibleKeys === requestedKeys.length
    ? "CONTRACT_PRICE_LIVE"
    : verified.some((q) => q.contractPriceQuality === "CONTRACT_PRICE_MISMATCH")
      ? "CONTRACT_PRICE_MISMATCH"
      : verified.some((q) => q.contractPriceQuality === "CONTRACT_PRICE_STALE")
        ? "CONTRACT_PRICE_STALE"
        : verified.some((q) => q.contractPriceQuality === "CONTRACT_PRICE_AGING")
          ? "CONTRACT_PRICE_AGING"
          : "CONTRACT_PRICE_UNAVAILABLE";

  return {
    rows: verifiedRows,
    summary: {
      state,
      window: windowSummary,
      chainAnalytics: analyticsComplete ? "CHAIN_ANALYTICS_VERIFIED_BOUNDED" : "CHAIN_ANALYTICS_UNVERIFIED",
      oiAnalytics: oiAnalyticsComplete ? "OI_ANALYTICS_VERIFIED_BOUNDED" : "OI_ANALYTICS_UNAVAILABLE",
      volumeAnalytics: volumeAnalyticsComplete ? "VOLUME_ANALYTICS_VERIFIED_BOUNDED" : "VOLUME_ANALYTICS_UNAVAILABLE",
      analyticsProvenance: analyticsComplete ? "UPSTOX_FULL_QUOTES_V3_BOUNDED_REST_SNAPSHOT" : "UNAVAILABLE",
      quoteResponseTime: now.toISOString(),
      requestedKeys: requestedKeys.length,
      coveredKeys: requestedKeys.length - missingKeys.length,
      liveKeys,
      agingKeys,
      staleKeys,
      unavailableKeys,
      mismatchedKeys,
      eligibleKeys,
      missingKeys,
      error,
    },
  };
}
