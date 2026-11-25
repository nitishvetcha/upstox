import { getSnapshot } from "./market.ts";
import { evaluateOptionsOpportunity } from "../engine/opportunityEngine.ts";
import { scanStocks } from "../engine/stockOpportunityEngine.ts";
import { selectBestRecommendation, type BestRecommendation, type RecommendationCandidate } from "../bestRecommendation.ts";

export interface AuthoritativePickDisplay {
  label: string;
  strategy: string;
  horizon: string;
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  grossRr: number;
  netRr: number | null;
  dataAgeSeconds: number | null;
  invalidation: string;
  executablePrice: string;
  contractRole?: string;
  engine: "OPTIONS" | "STOCK_INTRADAY";
}

/**
 * Returns the authoritative best recommendation across all active engines
 * (Equity Index Options, MCX Commodities if open, and Intraday Stocks),
 * enforcing the exact same eligibility gates, Net R:R >= 1.5x minimum,
 * and grade prioritization (A+ > A > B) as the Opportunities page.
 */
export async function getAuthoritativeRecommendation(
  now: Date = new Date()
): Promise<BestRecommendation<AuthoritativePickDisplay>> {
  const [niftySnap, bnSnap, intradayResult] = await Promise.all([
    getSnapshot("nifty").catch(() => null),
    getSnapshot("banknifty").catch(() => null),
    scanStocks("intraday", now).catch(() => ({
      stocksScanned: 0,
      stocksAvailable: 0,
      stocksRejected: 0,
      topOpportunities: [],
      source: "UNAVAILABLE" as const,
    })),
  ]);

  const activeOptionResults = [
    ...(niftySnap ? [evaluateOptionsOpportunity(niftySnap, "NIFTY", now)] : []),
    ...(bnSnap ? [evaluateOptionsOpportunity(bnSnap, "BANKNIFTY", now)] : []),
  ];

  const candidates: RecommendationCandidate<AuthoritativePickDisplay>[] = [
    ...activeOptionResults.flatMap((result) =>
      result.topOpportunities.map((item) => {
        const tradeAt = item.lastTradeTime ? Date.parse(item.lastTradeTime) : NaN;
        return {
          engine: "OPTIONS" as const,
          grade: item.grade,
          score: item.opportunityScore,
          netRewardToRisk: item.estimatedValues?.netRewardToRisk ?? null,
          item: {
            label: `${item.underlying} ${item.strike} ${item.optionType}`,
            strategy: item.strategyType,
            horizon: item.expiry ? `Expires ${item.expiry}` : "Intraday options",
            entry: item.entry,
            stop: item.stop,
            target1: item.target1,
            target2: item.target2,
            grossRr: item.rr,
            netRr: item.estimatedValues?.netRewardToRisk ?? null,
            dataAgeSeconds: Number.isFinite(tradeAt) ? Math.max(0, (now.getTime() - tradeAt) / 1000) : null,
            invalidation: item.invalidation,
            executablePrice: item.executablePricing ? `₹${item.executablePricing.entryPrice.toFixed(2)}` : "Unavailable",
            contractRole: item.contractRole,
            engine: "OPTIONS" as const,
          },
        };
      })
    ),
    ...intradayResult.topOpportunities.map((item) => ({
      engine: "STOCK_INTRADAY" as const,
      grade: item.grade,
      score: item.opportunityScore,
      netRewardToRisk: null,
      item: {
        label: item.symbol,
        strategy: item.setup,
        horizon: "Intraday · exit by session close",
        entry: item.entry,
        stop: item.stop,
        target1: item.target1,
        target2: item.target2,
        grossRr: item.rr,
        netRr: null,
        dataAgeSeconds: item.dataAgeSeconds ?? null,
        invalidation: item.invalidation,
        executablePrice: "Unavailable — verify live bid/ask before manual entry",
        engine: "STOCK_INTRADAY" as const,
      },
    })),
  ];

  return selectBestRecommendation(candidates);
}
