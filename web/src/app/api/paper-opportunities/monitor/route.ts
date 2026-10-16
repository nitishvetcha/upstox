export const dynamic = "force-dynamic";

// POST /api/paper-opportunities/monitor
// Runs one evaluation cycle over all OPEN paper trades.
// Fetches current live prices for each instrument and checks targets/stop/expiry.
// Idempotent. No real orders.
import { runOnce, listMonitorRuns } from "@/lib/services/paperTradeMonitorRunner";
import type { PriceFetcher } from "@/lib/services/paperTradeMonitorRunner";
import { getSnapshot } from "@/lib/services/market";

// Build a price fetcher that uses live Upstox data for each open opportunity.
function buildPriceFetcher(): PriceFetcher {
  // Cache snapshots within the run to avoid redundant API calls.
  const snapshotCache = new Map<string, { spot: number; premiums: Map<string | null, number> }>();

  return async (opp) => {
    if (opp.instrumentType === "OPTION") {
      const key = opp.underlying.toLowerCase() as "nifty" | "banknifty";
      if (!snapshotCache.has(key)) {
        try {
          const snap = await getSnapshot(key === "banknifty" ? "banknifty" : "nifty");
          // Build from full chain (not just topOpportunities) so any open contract can be priced.
          const premiums = new Map<string | null, number>();
          for (const row of snap.chain ?? []) {
            if (row.call.instrumentKey) premiums.set(row.call.instrumentKey, row.call.ltp);
            if (row.put.instrumentKey) premiums.set(row.put.instrumentKey, row.put.ltp);
          }
          snapshotCache.set(key, { spot: snap.spot, premiums });
        } catch {
          return null;
        }
      }
      const cached = snapshotCache.get(key);
      if (!cached) return null;
      // Use the live premium for this specific contract if available
      const premium = opp.instrumentKey ? (cached.premiums.get(opp.instrumentKey) ?? null) : null;
      if (!premium) return null;
      return { currentPrice: premium, currentUnderlying: cached.spot, source: "LIVE" as const };
    }

    if (opp.instrumentType === "STOCK") {
      // First check cache of scanned top opportunities
      const cached = snapshotCache.get("stocks");
      let price = opp.instrumentKey ? (cached?.premiums.get(opp.instrumentKey) ?? null) : null;
      let source: "LIVE" | "END_OF_DAY" | "STALE" = "LIVE";

      if (!price && !cached) {
        try {
          const { scanStocks } = await import("@/lib/engine/stockOpportunityEngine");
          const result = await scanStocks("intraday");
          const premiums = new Map<string | null, number>();
          for (const s of result.topOpportunities) {
            // Only exchange-verified LIVE quotes may price a position. After 15:30 IST the scanner
            // still returns END_OF_DAY quotes; caching them as LIVE let post-close prices move MFE/MAE.
            if (s.freshness === "LIVE") premiums.set(s.instrumentKey, s.ltp);
          }
          snapshotCache.set("stocks", { spot: 0, premiums });
          price = opp.instrumentKey ? (premiums.get(opp.instrumentKey) ?? null) : null;
        } catch {
          // Fall through to direct stockQuote fetch
        }
      }

      // If not present in top opportunities or scanner failed, fetch directly for this specific stock
      if (!price && opp.instrumentKey && opp.symbol) {
        try {
          const { stockQuote } = await import("@/lib/services/stockService");
          const quote = await stockQuote({
            symbol: opp.symbol,
            name: opp.symbol,
            exchange: "NSE",
            instrumentKey: opp.instrumentKey,
            kind: "EQUITY",
          });
          if (quote.ltp !== null && quote.freshness === "LIVE") {
            price = quote.ltp;
            source = quote.freshness;
          }
        } catch {
          return null;
        }
      }

      if (!price) return null;
      return { currentPrice: price, source };
    }

    return null;
  };
}

export async function POST() {
  try {
    const result = await runOnce(buildPriceFetcher());
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET() {
  const runs = listMonitorRuns().slice(0, 10);
  return Response.json({ runs });
}
