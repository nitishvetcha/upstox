export const dynamic = "force-dynamic";

import { getAllJournalEntries } from "@/lib/services/recommendationStore";
import { computeAnalytics } from "@/lib/journalOutcome";

export async function GET() {
  try {
    const entries = getAllJournalEntries();
    return Response.json(computeAnalytics(entries));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
