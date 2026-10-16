export const dynamic = "force-dynamic";

// Aggregates best opportunity from all engines.
// Sections: OPTIONS (NIFTY+BANKNIFTY) | STOCK_INTRADAY | STOCK_SWING
// Best is selected by score within priority tier; never by simple numeric + bonus.
import { getSnapshot } from "@/lib/services/market";
import { evaluateOptionsOpportunity } from "@/lib/engine/opportunityEngine";
import { scanStocks } from "@/lib/engine/stockOpportunityEngine";
import { scanLongTerm, NO_FUNDAMENTAL_PROVIDER } from "@/lib/engine/longTermEngine";

export async function GET() {
  try {
    const now = new Date();

    const [niftySnap, bnSnap, intradayResult, swingResult, ltResult] = await Promise.all([
      getSnapshot("nifty"),
      getSnapshot("banknifty"),
      scanStocks("intraday", now),
      scanStocks("swing", now),
      scanLongTerm(NO_FUNDAMENTAL_PROVIDER),
    ]);

    const niftyOptions = evaluateOptionsOpportunity(niftySnap, "NIFTY", now);
    const bnOptions = evaluateOptionsOpportunity(bnSnap, "BANKNIFTY", now);

    // Best options: higher of the two
    const optionsBest = (niftyOptions.topOpportunities[0]?.opportunityScore ?? 0) >=
      (bnOptions.topOpportunities[0]?.opportunityScore ?? 0)
      ? { result: niftyOptions, top: niftyOptions.topOpportunities[0] ?? null }
      : { result: bnOptions, top: bnOptions.topOpportunities[0] ?? null };

    const intradayBest = intradayResult.topOpportunities[0] ?? null;
    const swingBest = swingResult.topOpportunities[0] ?? null;

    // Determine overall best across all engines (not by fixed bonus — use raw score comparison)
    const candidates = [
      { engine: "OPTIONS", score: optionsBest.top?.opportunityScore ?? 0, item: optionsBest.top },
      { engine: "STOCK_INTRADAY", score: intradayBest?.opportunityScore ?? 0, item: intradayBest },
      { engine: "STOCK_SWING", score: swingBest?.opportunityScore ?? 0, item: swingBest },
    ].filter((c) => c.item !== null);
    candidates.sort((a, b) => b.score - a.score);
    const overall = candidates[0] ?? null;

    return Response.json({
      timestamp: now.toISOString(),
      bestOpportunity: overall
        ? { engine: overall.engine, score: overall.score, opportunity: overall.item }
        : null,
      noOpportunityReason: overall === null ? "No opportunities found across all engines." : null,
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
