export const dynamic = "force-dynamic";

import { getSnapshot } from "@/lib/services/market";
import { evaluateOptionsOpportunity } from "@/lib/engine/opportunityEngine";
import type { IndexId } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = (searchParams.get("underlying") ?? "nifty").toLowerCase();
    const index: IndexId = raw === "banknifty" ? "banknifty" : "nifty";
    const underlyingLabel = index === "banknifty" ? "BANKNIFTY" : "NIFTY";

    const snapshot = await getSnapshot(index);
    const result = evaluateOptionsOpportunity(snapshot, underlyingLabel);
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
