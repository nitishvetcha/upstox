export const dynamic = "force-dynamic";

import { requireOperator } from "../../../lib/operatorSession.ts";
import { listPaperOpportunities, savePaperOpportunity } from "../../../lib/services/paperOpportunityStore.ts";
import { createPaperOpportunity } from "../../../lib/services/paperOpportunityMonitor.ts";
import type { DataSourceState } from "../../../lib/services/paperOpportunityStore.ts";
import { OPPORTUNITY_ENGINE_VERSION } from "../../../lib/engine/opportunityEngine.ts";
import type { OpportunityGrade } from "../../../lib/engine/opportunityEngine.ts";

export async function GET(req: Request) {
  const refused = requireOperator(req);
  if (refused) return refused;
  const records = listPaperOpportunities();
  return Response.json({ total: records.length, records });
}

export async function POST(req: Request) {
  const refused = requireOperator(req);
  if (refused) return refused;
  try {
    const body = await req.json() as Record<string, unknown>;

    // Source validation — refuse MOCK/STALE/EOD/UNAVAILABLE labels sent by the client.
    const sources = body.dataQuality as Record<string, string> | null;
    const sourceValues = sources ? Object.values(sources) : [];
    const hasNonLive = sourceValues.some((s) => s !== "LIVE");
    if (hasNonLive) {
      return Response.json(
        { error: "Cannot create paper opportunity from non-LIVE data", sources },
        { status: 422 },
      );
    }
    // Manual UI entries are never verified LIVE evidence. Client labels can reject a record, but they can never grant LIVE.
    // Verified LIVE opportunities come only from the server collector (LIVE_COLLECTOR), which checks its own snapshot.
    const dataSource: DataSourceState = "UNAVAILABLE";

    const instrumentType = (body.instrumentType as string) ?? (body.optionType ? "OPTION" : "STOCK");

    const opp = createPaperOpportunity({
      instrumentType: instrumentType as "OPTION" | "STOCK",
      underlying: body.underlying as string,
      symbol: body.symbol as string | null,
      instrumentKey: body.instrumentKey as string | null,
      optionType: body.optionType as "CE" | "PE" | null,
      strike: body.strike as number | null,
      expiry: body.expiry as string | null,
      strategyType: (body.strategyType as string) ?? "UNKNOWN",
      direction: (body.direction as "BULLISH" | "BEARISH" | "NEUTRAL") ?? "NEUTRAL",
      entry: body.entry as number,
      stop: body.stop as number,
      target1: body.target1 as number,
      target2: body.target2 as number,
      spotAtEntry: body.spotAtEntry as number | null ?? body.spot as number | null,
      iv: body.iv as number | null,
      delta: body.delta as number | null,
      oi: body.oi as number | null,
      volume: body.volume as number | null,
      spread: body.spreadPct as number | null,
      atr: null,
      score: (body.opportunityScore as number) ?? (body.score as number) ?? 0,
      confidence: (body.confidence as number) ?? 0,
      grade: (body.grade as OpportunityGrade) ?? "C",
      signalAgreement: body.signalAgreement as number,
      regime: (body.regime as string) ?? "UNKNOWN",
      eventRisk: body.eventRisk as string | null,
      reasons: (body.reasons as string[]) ?? [],
      reasonCodes: [],
      strategyVersion: (body.strategyVersion as string) ?? OPPORTUNITY_ENGINE_VERSION,
      source: dataSource,
      provenance: "MANUAL_UI",
    });

    if (!opp.entry || !opp.stop || !opp.target1) {
      return Response.json({ error: "entry, stop, target1 required" }, { status: 400 });
    }

    savePaperOpportunity(opp);
    return Response.json(
      { id: opp.id, message: "Paper opportunity created. No real order placed.", record: opp },
      { status: 201 },
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
