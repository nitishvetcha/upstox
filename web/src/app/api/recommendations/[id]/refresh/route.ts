export const dynamic = "force-dynamic";
// Phase 11.3 — Refresh outcome for an open TRADE recommendation.
// Idempotent: calling multiple times does not create duplicates.
// WAIT / NO_TRADE: returns NOT_EXECUTABLE immediately, no market fetch.

import { getJournalEntry, updateJournalEntry } from "@/lib/services/recommendationStore";
import { computeOutcome } from "@/lib/journalOutcome";
import { getSnapshot } from "@/lib/services/market";
import type { IndexId } from "@/lib/types";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const entry = getJournalEntry(id);
    if (!entry) return Response.json({ error: "Not found" }, { status: 404 });

    const rec = entry.snapshot;

    // Non-trade: idempotent NOT_EXECUTABLE
    if (rec.decision !== "TRADE" || !rec.execution) {
      return Response.json({ ...entry, outcome: entry.outcome });
    }

    // Already closed: no market fetch needed
    const closed = entry.status === "STOPPED_OUT" || entry.status === "TARGET_1_HIT" || entry.status === "TARGET_2_HIT" || entry.status === "EXPIRED" || entry.status === "INVALIDATED" || entry.status === "CANCELLED";
    if (closed) {
      return Response.json(entry);
    }

    // Fetch current option price for the canonical instrument key
    const index: IndexId = rec.underlying === "BANKNIFTY" ? "banknifty" : "nifty";
    const snapshot = await getSnapshot(index);
    const instrumentKey = rec.contract?.instrumentKey;

    let currentPrice: number = rec.execution.entry; // fallback
    if (instrumentKey) {
      const row = snapshot.chain.find((r) => r.call.instrumentKey === instrumentKey || r.put.instrumentKey === instrumentKey);
      if (row) {
        const side = row.call.instrumentKey === instrumentKey ? row.call : row.put;
        currentPrice = side.ltp || side.ask || currentPrice;
      }
    } else {
      // No instrument key — search by strike + type
      const contract = rec.contract;
      if (contract) {
        const row = snapshot.chain.find((r) => r.strike === contract.strike);
        if (row) {
          const side = contract.optionType === "CE" ? row.call : row.put;
          currentPrice = side.ltp || currentPrice;
        }
      }
    }

    const now = new Date();
    const outcome = computeOutcome(rec, currentPrice, now, entry.outcome);
    const updated = updateJournalEntry(id, { status: outcome.status, outcome });
    return Response.json(updated);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
