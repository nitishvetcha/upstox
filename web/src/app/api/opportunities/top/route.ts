export const dynamic = "force-dynamic";

// Aggregates best opportunity from all engines.
// Sections: OPTIONS (NIFTY+BANKNIFTY) | STOCK_INTRADAY | STOCK_SWING
// Best is selected by score within priority tier; never by simple numeric + bonus.
import { getSnapshot } from "@/lib/services/market";
import { evaluateOptionsOpportunity } from "@/lib/engine/opportunityEngine";
import { scanStocks } from "@/lib/engine/stockOpportunityEngine";
import { scanLongTerm } from "@/lib/engine/longTermEngine";
import { selectBestRecommendation } from "@/lib/bestRecommendation";

export async function GET() {
  try {
    const now = new Date();

    const [niftySnap, bnSnap, intradayResult, swingResult, ltResult] = await Promise.all([
      getSnapshot("nifty"),
      getSnapshot("banknifty"),
      scanStocks("intraday", now),
      scanStocks("swing", now),
      scanLongTerm(),
    ]);

    const niftyOptions = evaluateOptionsOpportunity(niftySnap, "NIFTY", now);
    const bnOptions = evaluateOptionsOpportunity(bnSnap, "BANKNIFTY", now);

    const intradayBest = intradayResult.topOpportunities[0] ?? null;
    const swingBest = swingResult.topOpportunities[0] ?? null; // retired strategy: reported, never ranked as best

    // Same grade-first policy as the dashboard. C and REJECT are watch-only, never "best".
    const candidates = [
      ...[niftyOptions, bnOptions].flatMap((result) => result.topOpportunities.map((item) => ({
        engine: "OPTIONS" as const,
        grade: item.grade,
        score: item.opportunityScore,
        netRewardToRisk: item.estimatedValues?.netRewardToRisk ?? null,
        item,
      }))),
      ...intradayResult.topOpportunities.map((item) => ({
        engine: "STOCK_INTRADAY" as const,
        grade: item.grade,
        score: item.opportunityScore,
        netRewardToRisk: null,
        item,
      })),
    ];
    const overall = selectBestRecommendation<unknown>(candidates);

    return Response.json({
      timestamp: now.toISOString(),
      recommendationStatus: overall.status,
      bestOpportunity: overall.status === "RECOMMENDATION"
        ? { engine: overall.candidate.engine, grade: overall.candidate.grade, score: overall.candidate.score, opportunity: overall.candidate.item }
        : null,
      noOpportunityReason: overall.status === "NO_TRADE" ? overall.reason : null,
      watchOnlyCount: overall.watchOnlyCount,
      sections: {
        options: {
          nifty: {
            topScore: niftyOptions.topOpportunities[0]?.opportunityScore ?? null,
            regime: niftyOptions.marketRegime,
            direction: niftyOptions.marketDirection,
            eventRiskPenalty: niftyOptions.eventRiskPenalty,
            top: niftyOptions.topOpportunities[0] ?? null,
          },
          banknifty: {
            topScore: bnOptions.topOpportunities[0]?.opportunityScore ?? null,
            regime: bnOptions.marketRegime,
            direction: bnOptions.marketDirection,
            eventRiskPenalty: bnOptions.eventRiskPenalty,
            top: bnOptions.topOpportunities[0] ?? null,
          },
        },
        stockIntraday: {
          topScore: intradayBest?.opportunityScore ?? null,
          stocksScanned: intradayResult.stocksScanned,
          top: intradayBest,
          freshness: intradayResult.freshness,
        },
        stockSwing: {
          topScore: swingBest?.opportunityScore ?? null,
          top: swingBest,
          freshness: swingResult.freshness,
          retired: true,
        },
        longTerm: {
          dataAvailable: ltResult.fundamentalDataAvailable,
          message: ltResult.dataAvailabilityMessage,
        },
      },
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
