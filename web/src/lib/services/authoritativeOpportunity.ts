import { getCachedSnapshot, getSnapshot } from "./market.ts";
import { evaluateOptionsOpportunity } from "../engine/opportunityEngine.ts";
import { scanStocks } from "../engine/stockOpportunityEngine.ts";
import { selectBestRecommendation, type BestRecommendation, type RecommendationCandidate } from "../bestRecommendation.ts";
import { commodityMarketStatus } from "../time.ts";

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

const AUTH_REC_FRESH_MS = 20_000;
const AUTH_REC_STALE_MS = 10 * 60_000;
const AUTH_REC_COLD_BUDGET_MS = 1_200;

const gAuthRec = globalThis as typeof globalThis & {
  __warmAuthRec?: { data: BestRecommendation<AuthoritativePickDisplay>; updatedAt: number };
  __refreshingAuthRec?: Promise<BestRecommendation<AuthoritativePickDisplay>> | null;
};

async function computeAuthoritativeRecommendation(
  now: Date
): Promise<BestRecommendation<AuthoritativePickDisplay>> {
  const isMcxOpen = commodityMarketStatus(now) === "OPEN";

  const [niftySnap, bnSnap, crudeSnap, ngSnap, intradayResult] = await Promise.all([
    getSnapshot("nifty").catch(() => null),
    getSnapshot("banknifty").catch(() => null),
    isMcxOpen ? getSnapshot("crudeoil").catch(() => null) : Promise.resolve(null),
    isMcxOpen ? getSnapshot("naturalgas").catch(() => null) : Promise.resolve(null),
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
    ...(crudeSnap ? [evaluateOptionsOpportunity(crudeSnap, "CRUDEOIL", now)] : []),
    ...(ngSnap ? [evaluateOptionsOpportunity(ngSnap, "NATURALGAS", now)] : []),
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

export function triggerAuthoritativeRevalidate(): Promise<BestRecommendation<AuthoritativePickDisplay>> {
  if (gAuthRec.__refreshingAuthRec) return gAuthRec.__refreshingAuthRec;
  gAuthRec.__refreshingAuthRec = computeAuthoritativeRecommendation(new Date())
    .then((data) => {
      gAuthRec.__warmAuthRec = { data, updatedAt: Date.now() };
      return data;
    })
    .finally(() => {
      gAuthRec.__refreshingAuthRec = null;
    });
  return gAuthRec.__refreshingAuthRec;
}

/**
 * Returns the authoritative best recommendation across all active engines
 * (Equity Index Options, MCX Commodities if open, and Intraday Stocks),
 * enforcing the exact same eligibility gates, Net R:R >= 1.5x minimum,
 * and grade prioritization (A+ > A > B) as the Opportunities page.
 * Uses stale-while-revalidate caching so Overview loads in < 2s.
 */
export async function getAuthoritativeRecommendation(
  now?: Date
): Promise<BestRecommendation<AuthoritativePickDisplay>> {
  // Deterministic test calls passing an explicit historical/custom date bypass the SWR cache
  if (now && Math.abs(Date.now() - now.getTime()) > 120_000) {
    return computeAuthoritativeRecommendation(now);
  }

  const nowMs = Date.now();
  const cachedEntry = gAuthRec.__warmAuthRec;
  if (cachedEntry && nowMs - cachedEntry.updatedAt <= AUTH_REC_FRESH_MS) {
    return cachedEntry.data;
  }
  if (cachedEntry && nowMs - cachedEntry.updatedAt <= AUTH_REC_STALE_MS) {
    void triggerAuthoritativeRevalidate().catch(() => {});
    return cachedEntry.data;
  }

  const refreshPromise = triggerAuthoritativeRevalidate();
  const completed = await Promise.race<BestRecommendation<AuthoritativePickDisplay> | null>([
    refreshPromise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), AUTH_REC_COLD_BUDGET_MS)),
  ]);
  if (completed) return completed;
  if (gAuthRec.__warmAuthRec) return gAuthRec.__warmAuthRec.data;

  // Cold-boot fallback using any already-warmed snapshots without blocking page render
  const current = now ?? new Date();
  const cachedResults = (["nifty", "banknifty", "crudeoil", "naturalgas"] as const)
    .map((id) => {
      const snap = getCachedSnapshot(id);
      return snap ? evaluateOptionsOpportunity(snap, id.toUpperCase(), current) : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (cachedResults.length > 0) {
    const partial = selectBestRecommendation(
      cachedResults.flatMap((result) =>
        result.topOpportunities.map((item) => ({
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
            dataAgeSeconds: null,
            invalidation: item.invalidation,
            executablePrice: item.executablePricing ? `₹${item.executablePricing.entryPrice.toFixed(2)}` : "Unavailable",
            contractRole: item.contractRole,
            engine: "OPTIONS" as const,
          },
        }))
      )
    );
    if (partial.status === "RECOMMENDATION") return partial;
  }
  return {
    status: "NO_TRADE",
    candidate: null,
    reason: "Warming live options & stock scan in background — recommendations will appear automatically.",
    watchOnlyCount: 0,
  };
}
