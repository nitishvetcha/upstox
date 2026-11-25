// Builds the price input for monitoring an OPEN option paper opportunity from a market snapshot.
// An option premium may only be treated as LIVE when BOTH the underlying market data and the option chain
// were LIVE in that snapshot, AND the individual contract quote has verified freshness and executable pricing.
// Upstox's chain endpoint carries no generation timestamp, so a chain classified STALE/UNAVAILABLE/END_OF_DAY/MOCK
// must not move stops, targets or MFE/MAE. Returns null (skipped as "price_unavailable", the position stays
// untouched) otherwise, or when the contract has no verified fresh quote or executable bid.
import type { Snapshot, UnderlyingId } from "../types.ts";
import type { EvalInput } from "./paperOpportunityMonitor.ts";
import { tradeFreshnessOf, commodityMarketStatus, marketStatus } from "../time.ts";
import { isCommodityId, isUnderlyingId } from "./instrumentRegistry.ts";

// Paper records store display symbols (NIFTY, CRUDEOIL, etc.), while market
// APIs use normalized ids. Resolve only known instruments: unknown labels must
// fail closed instead of silently being monitored against NIFTY.
export function optionUnderlyingId(underlying: string): UnderlyingId | null {
  const id = underlying.trim().toLowerCase();
  return isUnderlyingId(id) ? id : null;
}

export function optionMonitorInput(
  snap: Pick<Snapshot, "index" | "spot" | "chain" | "sources">,
  instrumentKey: string | null,
  now = new Date(),
): EvalInput | null {
  if (!instrumentKey) return null;
  if (snap.sources.market.source !== "LIVE" || snap.sources.optionChain.source !== "LIVE") return null;
  for (const row of snap.chain ?? []) {
    for (const q of [row.call, row.put]) {
      if (q.instrumentKey === instrumentKey) {
        if (!Number.isFinite(q.ltp) || q.ltp <= 0) return null;
        if (q.lastTradeTime !== undefined) {
          if (!q.lastTradeTime) return null;
          const session = isCommodityId(snap.index) ? commodityMarketStatus(now) : marketStatus(now);
          if (tradeFreshnessOf(q.lastTradeTime, now, 1, session).freshness !== "LIVE") return null;
        }
        if (q.bid == null || q.bid <= 0) return null;
        return { currentPrice: q.bid, currentUnderlying: snap.spot, source: "LIVE" };
      }
    }
  }
  return null;
}
