export const dynamic = "force-dynamic";

// POST /api/paper-opportunities/collect
// Triggers one live collection cycle: fetches current opportunities and creates paper trades.
// Only runs during OPEN market session with LIVE data. No real orders.
import { requireOperator } from "../../../../lib/operatorSession.ts";
import { runLiveOpportunityCollection, saveCollectionRun, listCollectionRuns } from "../../../../lib/services/liveOpportunityCollector.ts";
import { evaluateOptionsOpportunity } from "../../../../lib/engine/opportunityEngine.ts";
import { scanStocks } from "../../../../lib/engine/stockOpportunityEngine.ts";
import { getSnapshot, providerMode } from "../../../../lib/services/market.ts";
import { verifyCurrentCredential } from "../../../../lib/services/upstoxAuth.ts";

export async function POST(req: Request) {
  const refused = requireOperator(req);
  if (refused) return refused;
  const start = Date.now();
  try {
    const mode = providerMode();
    // Collection needs a verified connection: a configured credential is verified here, once, before any collection.
    const auth = await verifyCurrentCredential();

    // Provenance gate: check actual authentication state before collection
    if (mode === "mock") {
      const mockResult = {
        market: "OPEN",
        source: "MOCK",
        generated: 0,
        accepted: 0,
        created: 0,
        duplicates: 0,
        rejected: 0,
        niftyCount: 0,
        bankNiftyCount: 0,
        stockCount: 0,
        errors: ["Mock market provider active: live paper collection disabled"],
        reason: "MOCK_DATA_SOURCE",
      };
      saveCollectionRun({
        id: `${start}_api`,
        timestamp: new Date().toISOString(),
        marketStatus: mockResult.market,
        sourceStatus: "MOCK",
        generatedCount: 0,
        acceptedCount: 0,
        createdCount: 0,
        duplicateCount: 0,
        rejectedCount: 0,
        niftyCount: 0,
        bankNiftyCount: 0,
        stockCount: 0,
        durationMs: Date.now() - start,
        errors: mockResult.errors,
      });
      return Response.json(mockResult);
    }

    if (auth.status === "EXPIRED" || auth.status === "INVALID") {
      const expiredResult = {
        market: "OPEN",
        source: "AUTH_EXPIRED",
        generated: 0,
        accepted: 0,
        created: 0,
        duplicates: 0,
        rejected: 0,
        niftyCount: 0,
        bankNiftyCount: 0,
        stockCount: 0,
        errors: [`Upstox authentication token is ${auth.status}`],
        reason: "AUTH_EXPIRED",
      };
      saveCollectionRun({
        id: `${start}_api`,
        timestamp: new Date().toISOString(),
        marketStatus: expiredResult.market,
        sourceStatus: "AUTH_EXPIRED",
        generatedCount: 0,
        acceptedCount: 0,
        createdCount: 0,
        duplicateCount: 0,
        rejectedCount: 0,
        niftyCount: 0,
        bankNiftyCount: 0,
        stockCount: 0,
        durationMs: Date.now() - start,
        errors: expiredResult.errors,
      });
      return Response.json(expiredResult);
    }

    if (auth.status === "MISSING" || auth.status === "UNKNOWN") {
      const unavailResult = {
        market: "OPEN",
        source: "AUTH_UNAVAILABLE",
        generated: 0,
        accepted: 0,
        created: 0,
        duplicates: 0,
        rejected: 0,
        niftyCount: 0,
        bankNiftyCount: 0,
        stockCount: 0,
        errors: [`Upstox authentication token is ${auth.status}`],
        reason: "AUTH_UNAVAILABLE",
      };
      saveCollectionRun({
        id: `${start}_api`,
        timestamp: new Date().toISOString(),
        marketStatus: unavailResult.market,
        sourceStatus: "AUTH_UNAVAILABLE",
        generatedCount: 0,
        acceptedCount: 0,
        createdCount: 0,
        duplicateCount: 0,
        rejectedCount: 0,
        niftyCount: 0,
        bankNiftyCount: 0,
        stockCount: 0,
        durationMs: Date.now() - start,
        errors: unavailResult.errors,
      });
      return Response.json(unavailResult);
    }

    if (auth.status !== "VERIFIED_CONNECTED") {
      const unverifiedResult = {
        market: "OPEN",
        source: "AUTH_UNVERIFIED",
        generated: 0,
        accepted: 0,
        created: 0,
        duplicates: 0,
        rejected: 0,
        niftyCount: 0,
        bankNiftyCount: 0,
        stockCount: 0,
        errors: [`Upstox credential is ${auth.status}: collection requires a verified connection`],
        reason: "AUTH_UNVERIFIED",
      };
      saveCollectionRun({
        id: `${start}_api`,
        timestamp: new Date().toISOString(),
        marketStatus: unverifiedResult.market,
        sourceStatus: "AUTH_UNVERIFIED",
        generatedCount: 0,
        acceptedCount: 0,
        createdCount: 0,
        duplicateCount: 0,
        rejectedCount: 0,
        niftyCount: 0,
        bankNiftyCount: 0,
        stockCount: 0,
        durationMs: Date.now() - start,
        errors: unverifiedResult.errors,
      });
      return Response.json(unverifiedResult);
    }

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

export async function GET(req: Request) {
  const refused = requireOperator(req);
  if (refused) return refused;
  const runs = listCollectionRuns().slice(0, 10);
  return Response.json({ runs });
}
