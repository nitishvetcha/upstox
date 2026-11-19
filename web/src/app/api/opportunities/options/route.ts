export const dynamic = "force-dynamic";

import { getSnapshot } from "@/lib/services/market";
import { evaluateOptionsOpportunity } from "@/lib/engine/opportunityEngine";
import { INDICES, INSTRUMENTS } from "@/lib/services/instrumentRegistry";
import type { IndexId } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = (searchParams.get("underlying") ?? "nifty").toLowerCase();
    if (!(INDICES as string[]).includes(raw)) return Response.json({ error: `unknown underlying "${raw}"; expected one of ${INDICES.join(", ")}` }, { status: 400 });
    const index = raw as IndexId;
    const underlyingLabel = INSTRUMENTS[index].symbol;

    const snapshot = await getSnapshot(index);
    const result = evaluateOptionsOpportunity(snapshot, underlyingLabel);
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
