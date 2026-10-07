export const dynamic = "force-dynamic";

import { getSnapshot } from "@/lib/services/market";
import { analyze } from "@/lib/engine/strategy";
import { buildRecommendationResponse } from "@/lib/recommendationEnricher";
import { saveJournalEntry } from "@/lib/services/recommendationStore";
import type { IndexId } from "@/lib/types";
import type { RecommendationJournalEntry } from "@/lib/journalTypes";
import { STRATEGY_VERSION } from "@/lib/journalTypes";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const index: IndexId = body.index === "banknifty" ? "banknifty" : "nifty";
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
    saveJournalEntry(entry);

    return Response.json(rec);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
