// Builds the price input for monitoring an OPEN option paper opportunity from a market snapshot.
// An option premium may only be treated as LIVE when BOTH the underlying market data and the option chain
// were LIVE in that snapshot, AND the individual contract quote has verified freshness and executable pricing.
// Upstox's chain endpoint carries no generation timestamp, so a chain classified STALE/UNAVAILABLE/END_OF_DAY/MOCK
// must not move stops, targets or MFE/MAE. Returns null (skipped as "price_unavailable", the position stays
// untouched) otherwise, or when the contract has no verified fresh quote or executable bid.
import type { Snapshot } from "../types.ts";
import type { EvalInput } from "./paperOpportunityMonitor.ts";
import { tradeFreshnessOf } from "../time.ts";

export function optionMonitorInput(
  snap: Pick<Snapshot, "spot" | "chain" | "sources">,
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
          if (tradeFreshnessOf(q.lastTradeTime, now).freshness !== "LIVE") return null;
        }
        if (q.bid == null || q.bid <= 0) return null;
        return { currentPrice: q.bid, currentUnderlying: snap.spot, source: "LIVE" };
      }
    }
  }
  return null;
}
