export const dynamic = "force-dynamic";

import { getPaperOpportunity } from "@/lib/services/paperOpportunityStore";
import { evaluatePaperOpportunity } from "@/lib/services/paperOpportunityMonitor";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const opp = getPaperOpportunity(id);
    if (!opp) return Response.json({ error: "not found" }, { status: 404 });

    const body = await req.json() as {
      currentPrice: number;
      currentUnderlying?: number;
      source?: string;
    };

    if (typeof body.currentPrice !== "number") {
      return Response.json({ error: "currentPrice required" }, { status: 400 });
    }

    const result = evaluatePaperOpportunity(opp, {
      currentPrice: body.currentPrice,
      currentUnderlying: body.currentUnderlying,
      source: (body.source as import("@/lib/services/paperOpportunityStore").DataSourceState) ?? "LIVE",
    });

    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
