import { requireOperator } from "../../../../../lib/operatorSession.ts";
export const dynamic = "force-dynamic";
// Phase 11.3 — Refresh outcome for an open TRADE recommendation.
// Idempotent: calling multiple times does not create duplicates.
// WAIT / NO_TRADE: returns NOT_EXECUTABLE immediately, no market fetch.
// Decision logic lives in lib/services/journalRefreshService.ts (injectable for tests).

import { getJournalEntry, updateJournalEntry } from "../../../../../lib/services/recommendationStore.ts";
import { computeOutcome } from "../../../../../lib/journalOutcome.ts";
import { getSnapshot } from "../../../../../lib/services/market.ts";
import { refreshJournalOutcome } from "../../../../../lib/services/journalRefreshService.ts";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const __refused = requireOperator(_req);
  if (__refused) return __refused;
  try {
    const { id } = await params;
    const result = await refreshJournalOutcome(id, {
      getEntry: (x) => getJournalEntry(x) as never,
      getSnapshot: (index) => getSnapshot(index) as never,
      updateEntry: (x, patch) => updateJournalEntry(x, patch as never) as never,
      computeOutcome: (rec, price, now, prev) => computeOutcome(rec as never, price, now, prev as never) as never,
      now: () => new Date(),
    });
    return Response.json(result.body, { status: result.status });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
