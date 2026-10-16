export const dynamic = "force-dynamic";

import { listOpportunityRecords, updateOpportunityRecord } from "@/lib/services/opportunityTrackingStore";
import type { OutcomeState } from "@/lib/services/opportunityTrackingStore";

export async function GET() {
  const records = listOpportunityRecords();
  const open = records.filter((r) => r.outcome === "OPEN");
  const closed = records.filter((r) => r.outcome !== "OPEN");
  return Response.json({ total: records.length, open: open.length, closed: closed.length, records });
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as { id: string; outcome?: OutcomeState; mfe?: number; mae?: number; exitPrice?: number; exitAt?: string; notes?: string };
    if (!body.id) return Response.json({ error: "id required" }, { status: 400 });
    const updated = updateOpportunityRecord(body.id, {
      ...(body.outcome !== undefined && { outcome: body.outcome }),
      ...(body.mfe !== undefined && { mfe: body.mfe }),
      ...(body.mae !== undefined && { mae: body.mae }),
      ...(body.exitPrice !== undefined && { exitPrice: body.exitPrice }),
      ...(body.exitAt !== undefined && { exitAt: body.exitAt }),
      ...(body.notes !== undefined && { notes: body.notes }),
    });
    if (!updated) return Response.json({ error: "record not found" }, { status: 404 });
    return Response.json(updated);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
