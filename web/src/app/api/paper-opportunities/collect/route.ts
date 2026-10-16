export const dynamic = "force-dynamic";

// POST /api/paper-opportunities/collect
// Triggers one live collection cycle: fetches current opportunities and creates paper trades.
// Only runs during OPEN market session with LIVE data. No real orders.
import { runLiveOpportunityCollection, saveCollectionRun, listCollectionRuns } from "@/lib/services/liveOpportunityCollector";
import { evaluateOptionsOpportunity } from "@/lib/engine/opportunityEngine";
import { scanStocks } from "@/lib/engine/stockOpportunityEngine";
import { getSnapshot } from "@/lib/services/market";

export async function POST() {
  const start = Date.now();
  try {
    const result = await runLiveOpportunityCollection(
      () => getSnapshot("nifty").then((s) => Promise.resolve(evaluateOptionsOpportunity(s, "NIFTY"))),
      () => getSnapshot("banknifty").then((s) => Promise.resolve(evaluateOptionsOpportunity(s, "BANKNIFTY"))),
      () => scanStocks("intraday"),
    );

    saveCollectionRun({
      id: `${start}_api`,
      timestamp: new Date().toISOString(),
      marketStatus: result.market,
      sourceStatus: result.source,
      generatedCount: result.generated,
      acceptedCount: result.accepted,
      createdCount: result.created,
      duplicateCount: result.duplicates,
      rejectedCount: result.rejected,
      niftyCount: result.niftyCount,
      bankNiftyCount: result.bankNiftyCount,
      stockCount: result.stockCount,
      durationMs: Date.now() - start,
      errors: result.errors,
    });

    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET() {
  const runs = listCollectionRuns().slice(0, 10);
  return Response.json({ runs });
}
