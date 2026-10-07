export const dynamic = "force-dynamic";
// Phase 11.3 — Create a paper trade directly from a stored recommendation.
// Preserves: instrumentKey, entry, stop, targets, quantity, lots, strategy from the snapshot.
// NO Upstox order placement. Purely paper.

import { getJournalEntry, updateJournalEntry } from "@/lib/services/recommendationStore";
import { getPaperTradingEngine } from "@/lib/services/paperStore";
import { getSnapshot } from "@/lib/services/market";
import { analyze } from "@/lib/engine/strategy";
import type { IndexId } from "@/lib/types";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const entry = getJournalEntry(id);
    if (!entry) return Response.json({ error: "Not found" }, { status: 404 });

    const rec = entry.snapshot;
    if (rec.decision !== "TRADE" || !rec.execution) {
      return Response.json({ status: "rejected", reason: "NOT_EXECUTABLE: recommendation is not a TRADE" });
    }

    // Idempotent: if already linked to a paper trade, return the existing link
    if (entry.paperTradeId) {
      return Response.json({ status: "already_linked", paperTradeId: entry.paperTradeId, recommendationId: id });
    }

    // Re-run strategy on the same index to feed the paper engine
    // (paper engine requires Analysis; we preserve the snapshot values via risk engine)
    const index: IndexId = rec.underlying === "BANKNIFTY" ? "banknifty" : "nifty";
    const snapshot = await getSnapshot(index);
    const analysis = analyze(snapshot);

    const engine = getPaperTradingEngine();
    const result = engine.processRecommendation(analysis);

    if (!result.created || !result.trade) {
      return Response.json({ status: "rejected", reason: result.reason, recommendationId: id });
    }

    // Link paper trade to this recommendation
    updateJournalEntry(id, { paperTradeId: result.trade.id });

    return Response.json({
      status: "success",
      mode: "PAPER",
      paperTradeId: result.trade.id,
      recommendationId: id,
      data: result.trade,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
