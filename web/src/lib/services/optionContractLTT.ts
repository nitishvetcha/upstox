// Phase 30.4 — Prototype: associate per-contract exchange trade times with option-chain rows.
//
// DISABLED BY DEFAULT (OPTION_QUOTE_LTT_ENABLED = false).
// The production chain path (classified STALE when LTT absent) is UNCHANGED.
// This module is informational only. Do not feed its output into the production
// data-quality gates or gradeOpportunity until a freshness policy for IV/Greeks
// is explicitly approved.
//
// Background: Upstox /v2/option/chain omits last_trade_time from market_data.
// /v2/market-quote/quotes, when called with an option instrument_key, returns
// last_trade_time (exchange trade time). Batch queries confirmed working for 14+ keys.
// The response object key uses the contract symbol (NSE_FO:NAME) but instrument_token
// matches the key we sent (NSE_FO|44620), so join MUST use instrument_token.

import type { IndexId, OptionRow } from "../types.ts";
import { FILTERS } from "../engine/opportunityEngine.ts";
import { tradeFreshnessOf } from "../time.ts";
import { get } from "./upstoxMarket.ts";

/** Feature flag — disabled by default.
 *  Do NOT enable in production until the freshness policy for IV/Greeks
 *  (which have no independent timestamp) is explicitly approved. */
export const OPTION_QUOTE_LTT_ENABLED = false;

/** Defensive batch limit. Upstox has no published cap; 14 confirmed working in Phase 30.3. */
const BATCH_SIZE = 20;

/** 2 % of chain LTP. Options can move within a tick between two fetches; >2 % suggests
 *  a data mismatch or illiquid strike and warrants ineligibility. */
const LTP_CONSISTENCY_THRESHOLD_PCT = 0.02;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContractQuoteFreshness {
  instrumentKey: string;

  // --- Chain-sourced ---
  chainLtp: number;
  iv: number | null;
  greeksPresent: boolean;
  /** Always "NONE": the exchange does not timestamp IV or Greeks independently.
   *  A recent last_trade_time does NOT imply the Greeks reflect the current volatility surface. */
  ivFreshnessEvidence: "NONE";

  // --- Quote-sourced ---
  quoteLtp: number | null;
  /** Exchange-reported time of the most recent matched trade for this contract (ISO string).
   *  Derived from last_trade_time (epoch ms). Null when absent, zero, or implausible. */
  exchangeTradeTime: string | null;
  /** Wall-clock time of the batch quote API request (ISO string).
   *  Kept strictly separate from exchangeTradeTime. Must NOT be used as freshness evidence. */
  quoteResponseTime: string;
  tradeFreshness: "LIVE" | "AGING" | "STALE" | "UNAVAILABLE";

  // --- Consistency ---
  ltpDiscrepancy: number | null;   // |chainLtp - quoteLtp|; null when quoteLtp absent
  ltpConsistent: boolean | null;   // within 2 % of chainLtp; null when quoteLtp absent

  // --- Verdict ---
  eligible: boolean;
  ineligibleReason: string | null;
}

export interface ChainLTTAudit {
  readonly enabled: true;
  requestedKeys: number;
  coveredKeys: number;
  missingKeys: string[];
  liveCount: number;
  agingCount: number;
  staleCount: number;
  eligibleCount: number;
  contracts: ContractQuoteFreshness[];
  /** Non-null when the batch fetch failed entirely (auth error, timeout, etc.). */
  error: string | null;
}

// ── Key extraction ─────────────────────────────────────────────────────────────

/** Collect all instrument keys for both CE and PE sides of the strikes the engine
 *  can evaluate (ATM ± FILTERS.maxStrikesAtm, matching the engine's candidate set). */
export function extractEvaluationKeys(rows: OptionRow[], spot: number): string[] {
  if (!rows.length) return [];
  const sorted = [...rows].sort((a, b) => a.strike - b.strike);
  const atm = sorted.reduce(
    (best, r) => Math.abs(r.strike - spot) < Math.abs(best.strike - spot) ? r : best,
    sorted[0],
  );
  const atmIdx = sorted.indexOf(atm);
  const keys = new Set<string>();
  for (let i = 0; i < sorted.length; i++) {
    if (Math.abs(i - atmIdx) > FILTERS.maxStrikesAtm) continue;
    const row = sorted[i];
    if (row.call.instrumentKey) keys.add(row.call.instrumentKey);
    if (row.put.instrumentKey) keys.add(row.put.instrumentKey);
  }
  return [...keys];
}

// ── LTT parsing ───────────────────────────────────────────────────────────────

/** Parse last_trade_time from a raw Upstox market-quote entry.
 *  Returns an ISO string, or null for absent / zero / implausible values.
 *  "Implausible" = before 2020-01-01 in epoch ms, which catches both 0 and non-ms timestamps. */
export function parseLTT(raw: Record<string, unknown>): string | null {
  const ltt = Number(raw.last_trade_time);
  if (!Number.isFinite(ltt) || ltt <= 0) return null;
  if (ltt < 1_577_836_800_000) return null; // before 2020-01-01 UTC
  return new Date(ltt).toISOString();
}

// ── Per-contract result builder ───────────────────────────────────────────────

function buildContractFreshness(
  instrumentKey: string,
  chain: { ltp: number; iv: number | null; greeksPresent: boolean } | null,
  quoteEntry: Record<string, unknown> | null,
  fetchedAt: string,
  now: Date,
): ContractQuoteFreshness {
  const chainLtp = chain?.ltp ?? 0;
  const iv = chain?.iv ?? null;
  const greeksPresent = chain?.greeksPresent ?? false;

  if (!quoteEntry) {
    return {
      instrumentKey, chainLtp, iv, greeksPresent, ivFreshnessEvidence: "NONE",
      quoteLtp: null, exchangeTradeTime: null, quoteResponseTime: fetchedAt,
      tradeFreshness: "UNAVAILABLE",
      ltpDiscrepancy: null, ltpConsistent: null,
      eligible: false, ineligibleReason: "quote not returned in batch",
    };
  }

  const rawLtp = quoteEntry.last_price;
  const quoteLtp =
    typeof rawLtp === "number" && Number.isFinite(rawLtp) && rawLtp > 0 ? rawLtp : null;

  const exchangeTradeTime = parseLTT(quoteEntry);
  const tf = tradeFreshnessOf(exchangeTradeTime, now);

  const tradeFreshness: ContractQuoteFreshness["tradeFreshness"] =
    tf.freshness === "LIVE" ? "LIVE"
    : tf.freshness === "AGING" ? "AGING"
    : tf.source === "UNAVAILABLE" ? "UNAVAILABLE"
    : "STALE"; // END_OF_DAY, STALE

  const ltpDiscrepancy = quoteLtp !== null ? Math.abs(chainLtp - quoteLtp) : null;
  const ltpConsistent =
    ltpDiscrepancy !== null && chainLtp > 0
      ? ltpDiscrepancy <= chainLtp * LTP_CONSISTENCY_THRESHOLD_PCT
      : ltpDiscrepancy !== null ? true // zero-ltp chain row: no threshold applicable
      : null;

  let eligible = true;
  let ineligibleReason: string | null = null;

  if (!exchangeTradeTime) {
    eligible = false; ineligibleReason = "no valid last_trade_time";
  } else if (tradeFreshness === "STALE" || tradeFreshness === "UNAVAILABLE") {
    eligible = false; ineligibleReason = `trade freshness ${tradeFreshness}`;
  } else if (ltpConsistent === false) {
    const pct = chainLtp > 0 ? ((ltpDiscrepancy ?? 0) / chainLtp * 100).toFixed(1) : "?";
    eligible = false;
    ineligibleReason = `LTP discrepancy ${ltpDiscrepancy?.toFixed(2)} (${pct}%) exceeds 2 % of chain LTP ${chainLtp}`;
  }

  return {
    instrumentKey, chainLtp, iv, greeksPresent, ivFreshnessEvidence: "NONE",
    quoteLtp, exchangeTradeTime, quoteResponseTime: fetchedAt,
    tradeFreshness,
    ltpDiscrepancy, ltpConsistent,
    eligible, ineligibleReason,
  };
}

// ── Main audit function ───────────────────────────────────────────────────────

/**
 * Batch-fetch individual option contract quotes to retrieve per-contract last_trade_time,
 * then produce a freshness audit for each contract in the engine's evaluation universe.
 *
 * Safety: fails closed on auth errors, timeouts, partial responses, and missing keys.
 * Never modifies the chain data. IV/Greeks provenance is always marked "NONE".
 * The production options collection path is not affected by this function.
 */
export async function buildChainLTTAudit(
  rows: OptionRow[],
  spot: number,
  index: IndexId,
  token: string,
  now: Date,
): Promise<ChainLTTAudit> {
  const keys = extractEvaluationKeys(rows, spot);

  if (!keys.length) {
    return {
      enabled: true, requestedKeys: 0, coveredKeys: 0, missingKeys: [],
      liveCount: 0, agingCount: 0, staleCount: 0, eligibleCount: 0,
      contracts: [], error: "no instrument keys found in evaluation universe",
    };
  }

  // Build chain-info lookup by instrument key.
  const chainInfo = new Map<string, { ltp: number; iv: number | null; greeksPresent: boolean }>();
  for (const row of rows) {
    for (const side of [row.call, row.put]) {
      if (side.instrumentKey) {
        chainInfo.set(side.instrumentKey, {
          ltp: side.ltp,
          iv: side.iv ?? null,
          greeksPresent: side.delta !== null,
        });
      }
    }
  }

  // Batch-fetch quotes. Joins on instrument_token (= the key we sent, with '|').
  // Response object keys use contract symbol names — never use them for the join.
  const uniqueKeys = [...new Set(keys)];
  const fetchedAt = now.toISOString();
  const quoteMap = new Map<string, Record<string, unknown>>();
  let fetchError: string | null = null;

  try {
    for (let i = 0; i < uniqueKeys.length; i += BATCH_SIZE) {
      const batch = uniqueKeys.slice(i, i + BATCH_SIZE);
      const raw = await get(
        token,
        "/v2/market-quote/quotes",
        { instrument_key: batch.join(",") },
        { index },
      ) as Record<string, Record<string, unknown>>;
      for (const entry of Object.values(raw)) {
        // instrument_token in the response matches the key we sent (NSE_FO|44620).
        const token_val = entry?.instrument_token;
        if (typeof token_val === "string" && token_val) quoteMap.set(token_val, entry);
      }
    }
  } catch (e) {
    fetchError = (e as Error).message ?? "batch quote fetch failed";
  }

  const missingKeys: string[] = [];
  const contracts: ContractQuoteFreshness[] = [];

  for (const key of uniqueKeys) {
    const entry = fetchError ? null : (quoteMap.get(key) ?? null);
    if (!fetchError && !entry) missingKeys.push(key);
    contracts.push(
      buildContractFreshness(key, chainInfo.get(key) ?? null, entry, fetchedAt, now),
    );
  }

  return {
    enabled: true,
    requestedKeys: uniqueKeys.length,
    coveredKeys: uniqueKeys.length - missingKeys.length,
    missingKeys,
    liveCount: contracts.filter((c) => c.tradeFreshness === "LIVE").length,
    agingCount: contracts.filter((c) => c.tradeFreshness === "AGING").length,
    staleCount: contracts.filter((c) => c.tradeFreshness === "STALE" || c.tradeFreshness === "UNAVAILABLE").length,
    eligibleCount: contracts.filter((c) => c.eligible).length,
    contracts,
    error: fetchError,
  };
}
