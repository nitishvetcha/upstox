export const dynamic = "force-dynamic";

// Track a live opportunity for outcome monitoring.
// Body: ContractOpportunity or StockOpportunity from the engine.
// Does NOT create a real order.
import { saveOpportunityRecord } from "@/lib/services/opportunityTrackingStore";
import type { OpportunityRecord } from "@/lib/services/opportunityTrackingStore";

export async function POST(req: Request) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const now = new Date().toISOString();
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const rec: OpportunityRecord = {
      id,
      trackedAt: now,
      engineVersion: (body.engineVersion as string) ?? "20.1",
      underlying: (body.underlying as string) ?? (body.symbol as string) ?? "UNKNOWN",
      instrumentKey: (body.instrumentKey as string | null) ?? null,
      symbol: (body.symbol as string | null) ?? null,
      optionType: (body.optionType as "CE" | "PE" | null) ?? null,
      expiry: (body.expiry as string | null) ?? null,
      strike: (body.strike as number | null) ?? null,
      strategyType: (body.strategyType as string) ?? "UNKNOWN",
      entry: body.entry as number,
      stop: body.stop as number,
      target1: body.target1 as number,
      target2: body.target2 as number,
      rr: body.rr as number,
      opportunityScore: body.opportunityScore as number,
      grade: (body.grade as OpportunityRecord["grade"]) ?? "C",
      confidence: (body.confidence as number) ?? 0,
      regime: (body.regime as string) ?? "UNKNOWN",
      direction: (body.direction as string) ?? "UNKNOWN",
      reasons: (body.reasons as string[]) ?? [],
      outcome: "OPEN",
      mfe: null, mae: null, exitPrice: null, exitAt: null, notes: null,
    };

    if (!rec.entry || !rec.stop || !rec.target1) {
      return Response.json({ error: "entry, stop, target1 required" }, { status: 400 });
    }

    saveOpportunityRecord(rec);
    return Response.json({ id, message: "Tracked. No real order placed.", record: rec }, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
