import { requireOperator } from "../../../../lib/operatorSession.ts";
export const dynamic = "force-dynamic";

import { getSnapshot } from "../../../../lib/services/market.ts";
import { analyze } from "../../../../lib/engine/strategy.ts";
import { buildRecommendationResponse } from "../../../../lib/recommendationEnricher.ts";
import { saveJournalEntry } from "../../../../lib/services/recommendationStore.ts";
import type { IndexId } from "../../../../lib/types.ts";
import type { RecommendationJournalEntry } from "../../../../lib/journalTypes.ts";
import { STRATEGY_VERSION } from "../../../../lib/journalTypes.ts";
import { hasMockInput } from "../../../../lib/services/mockInputs.ts";
import { INDICES } from "../../../../lib/services/instrumentRegistry.ts";

export async function POST(request: Request) {
  const __refused = requireOperator(request);
  if (__refused) return __refused;
  try {
    const body = await request.json().catch(() => ({}));
    // Absent input keeps the previous default (NIFTY). Anything supplied must be a registered index.
    const supplied = body.underlying ?? body.index;
    const rawUnderlying = supplied == null || supplied === "" ? "nifty" : String(supplied).toLowerCase();
    if (!(INDICES as string[]).includes(rawUnderlying)) {
      return Response.json({ error: `unknown underlying "${rawUnderlying}"; expected one of ${INDICES.join(", ")}` }, { status: 400 });
    }
    const index = rawUnderlying as IndexId;
    const snapshot = await getSnapshot(index);
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

    return Response.json({ ...rec, journaled });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
