import { requireOperator } from "../../../../lib/operatorSession.ts";
export const dynamic = "force-dynamic";

import { getSnapshot } from "../../../../lib/services/market.ts";
import { analyze } from "../../../../lib/engine/strategy.ts";
import { buildRecommendationResponse } from "../../../../lib/recommendationEnricher.ts";
import { saveJournalEntry } from "../../../../lib/services/recommendationStore.ts";
import type { RecommendationJournalEntry } from "../../../../lib/journalTypes.ts";
import { STRATEGY_VERSION } from "../../../../lib/journalTypes.ts";
import { hasMockInput } from "../../../../lib/services/mockInputs.ts";
import { isUnderlyingId, ALL_UNDERLYINGS } from "../../../../lib/services/instrumentRegistry.ts";
import { recordSignalAudit, hashSnapshotInputs } from "../../../../lib/services/signalAuditStore.ts";

export async function POST(request: Request) {
  const __refused = requireOperator(request);
  if (__refused) return __refused;
  try {
    const body = await request.json().catch(() => ({}));
    // Absent input keeps the previous default (NIFTY). Anything supplied must be a registered index or commodity.
    const supplied = body.underlying ?? body.index;
    const rawUnderlying = supplied == null || supplied === "" ? "nifty" : String(supplied).toLowerCase();
    if (!isUnderlyingId(rawUnderlying)) {
      return Response.json({ error: `unknown underlying "${rawUnderlying}"; expected one of ${ALL_UNDERLYINGS.join(", ")}` }, { status: 400 });
    }
    const snapshot = await getSnapshot(rawUnderlying);
    const analysis = analyze(snapshot);
    const rec = buildRecommendationResponse(analysis);

    // Journal every generated recommendation — immutable snapshot, no outcome yet.
    const entry: RecommendationJournalEntry = {
      id: rec.recommendationId,
      createdAt: rec.generatedAt,
      snapshot: rec,
      status: rec.decision === "TRADE" ? "MONITORING" : "NOT_EXECUTABLE",
      paperTradeId: null,
      outcome: rec.decision !== "TRADE"
        ? { status: "NOT_EXECUTABLE", exitPrice: null, exitTimestamp: null, exitReason: null, highestPrice: null, lowestPrice: null, mfe: null, mae: null, pnl: null, pnlPercent: null, rMultiple: null, durationMinutes: null, target1HitAt: null, target2HitAt: null, lastRefreshedAt: rec.generatedAt }
        : null,
      versionInfo: STRATEGY_VERSION,
    };
    // Simulated runs are returned but never written to the production journal.
    const journaled = !hasMockInput(snapshot);
    if (journaled) saveJournalEntry(entry);

    try {
      recordSignalAudit({
        timestamp: rec.generatedAt,
        underlying: rawUnderlying,
        action: "SIGNAL_GENERATED",
        spotPrice: snapshot.spot,
        snapshotHash: hashSnapshotInputs(snapshot),
        strategy: analysis.plan?.strategy ?? "No Trade",
        bias: analysis.bias,
        regime: analysis.regime,
        score: analysis.total,
        tradePlan: analysis.plan
          ? {
              strategy: analysis.plan.strategy,
              legs: analysis.plan.legs,
              entry: analysis.plan.entry,
              stop: analysis.plan.stop,
              target1: analysis.plan.target1,
              target2: analysis.plan.target2,
              rr: analysis.plan.rr,
            }
          : null,
        engineVersion: STRATEGY_VERSION.strategyVersion,
        inputSnapshotSummary: {
          atmStrike: analysis.chain.atmStrike,
          atmIv: analysis.chain.atmIv.average,
          pcrOi: analysis.chain.pcrOi,
          lotSize: snapshot.lotSize ?? null,
          source: snapshot.sources?.market?.source ?? "UNKNOWN",
          indicatorsAvailable: snapshot.indicators !== null,
        },
        blockers: analysis.blockers,
      });
    } catch {
      // Non-blocking
    }

    return Response.json({ ...rec, journaled });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
