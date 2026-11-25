export const dynamic = "force-dynamic";

import { getSnapshot } from "../../../../lib/services/market.ts";
import { evaluateOptionsOpportunity } from "../../../../lib/engine/opportunityEngine.ts";
import { isUnderlyingId, getUnderlyingInstrument, ALL_UNDERLYINGS } from "../../../../lib/services/instrumentRegistry.ts";
import { recordSignalAudit, hashSnapshotInputs } from "../../../../lib/services/signalAuditStore.ts";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = (searchParams.get("underlying") ?? "nifty").toLowerCase();
    if (!isUnderlyingId(raw)) {
      return Response.json({ error: `unknown underlying "${raw}"; expected one of ${ALL_UNDERLYINGS.join(", ")}` }, { status: 400 });
    }
    const inst = getUnderlyingInstrument(raw);
    const underlyingLabel = inst?.symbol ?? raw.toUpperCase();

    const snapshot = await getSnapshot(raw);
    const result = evaluateOptionsOpportunity(snapshot, underlyingLabel);
    const top = result.topOpportunities[0];

    try {
      recordSignalAudit({
        timestamp: result.timestamp,
        underlying: raw,
        action: "OPPORTUNITY_EVALUATED",
        spotPrice: result.spot,
        snapshotHash: hashSnapshotInputs(snapshot),
        strategy: top ? top.strategyType : result.recommendedStrategy,
        bias: result.marketDirection,
        regime: result.marketRegime,
        grade: top?.grade ?? "NO_OPPORTUNITY",
        score: top?.opportunityScore ?? result.directionScore,
        tradePlan: top
          ? {
              strategy: top.strategyType,
              legs: [
                {
                  side: "BUY" as const,
                  type: top.optionType,
                  strike: top.strike,
                  ltp: top.ltp,
                },
              ],
              entry: top.entry,
              stop: top.stop,
              target1: top.target1,
              target2: top.target2,
              rr: top.rr,
            }
          : null,
        engineVersion: result.engineVersion,
        inputSnapshotSummary: {
          atmStrike: result.atmStrike,
          atmIv: top?.iv ?? null,
          pcrOi: result.pcrOi,
          lotSize: snapshot.lotSize ?? null,
          source: result.source,
          indicatorsAvailable: snapshot.indicators !== null,
        },
      });
    } catch {
      // Audit recording error must never block API response
    }

    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
