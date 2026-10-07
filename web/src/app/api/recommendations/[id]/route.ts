export const dynamic = "force-dynamic";

import { getJournalEntry } from "@/lib/services/recommendationStore";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const entry = getJournalEntry(id);
    if (!entry) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(entry);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
