// Chain freshness is two separate facts and must never be merged:
//  1. The chain snapshot: Upstox /v2/option/chain has no exchange generation timestamp, so the snapshot is always
//     unverified. A successful response or a fresh local receipt time proves nothing about the exchange snapshot.
//  2. Each contract's own last-trade time, judged individually. A fresh contract says nothing about its neighbours.
import { tradeFreshnessOf } from "../time.ts";

export type ChainQuoteState = "CONTRACT_QUOTES_FRESH" | "CONTRACT_QUOTES_STALE" | "CONTRACT_QUOTES_MIXED" | "CONTRACT_QUOTES_UNKNOWN";

export interface ChainFreshness {
  snapshot: "CHAIN_SNAPSHOT_UNVERIFIED";
  quotes: ChainQuoteState;
  total: number;
  fresh: number;
  stale: number;
  endOfDay: number;
  unknown: number;
}

type SideQuote = { lastTradeTime?: string | null };
type FreshnessRow = { call: SideQuote; put: SideQuote };

// Counts both sides of every row. Only a LIVE trade time counts as fresh; END_OF_DAY, STALE, missing and future-dated
// timestamps are never fresh (tradeFreshnessOf fails closed on them).
export function chainFreshness(rows: FreshnessRow[], now: Date): ChainFreshness {
  let fresh = 0, stale = 0, endOfDay = 0, unknown = 0;
  for (const row of rows) {
    for (const side of [row.call, row.put]) {
      const { source } = tradeFreshnessOf(side?.lastTradeTime ?? null, now);
      if (source === "LIVE") fresh++;
      else if (source === "UNAVAILABLE") unknown++;
      else if (source === "END_OF_DAY") endOfDay++;
      else stale++;
    }
  }
  const total = fresh + stale + endOfDay + unknown;
  const quotes: ChainQuoteState =
    fresh === 0 && stale === 0 && endOfDay === 0 ? "CONTRACT_QUOTES_UNKNOWN"
      : fresh === total ? "CONTRACT_QUOTES_FRESH"
        : fresh === 0 ? "CONTRACT_QUOTES_STALE"
          : "CONTRACT_QUOTES_MIXED";
  return { snapshot: "CHAIN_SNAPSHOT_UNVERIFIED", quotes, total, fresh, stale, endOfDay, unknown };
}

export function chainFreshnessLabel(f: ChainFreshness): string {
  const quotes = f.quotes === "CONTRACT_QUOTES_UNKNOWN"
    ? "contract quote times unavailable"
    : `${f.fresh}/${f.total} contract quotes fresh`;
  const state = f.quotes.replace("CONTRACT_QUOTES_", "").toLowerCase();
  return `snapshot unverified · ${quotes} (${state})`;
}
