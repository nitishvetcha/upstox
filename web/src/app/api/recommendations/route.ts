export const dynamic = "force-dynamic";

import { getAllJournalEntries } from "@/lib/services/recommendationStore";

export async function GET() {
  try {
    return Response.json(getAllJournalEntries());
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
