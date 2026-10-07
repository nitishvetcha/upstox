import { getSnapshot } from "@/lib/services/market";
import { isIndexId } from "@/lib/services/instrumentRegistry";
import { evaluateTradeRisk } from "@/lib/services/risk/riskService";
import type { TradePlan } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { index, plan, inputs, overrideConfig } = body as {
      index: string;
      plan: TradePlan;
      inputs?: { existingOpenRisk?: number; realizedDailyLoss?: number; overrideCapital?: number };
      overrideConfig?: Record<string, number>;
    };

    if (!isIndexId(index)) {
      return Response.json({ error: `Unknown index: ${index}` }, { status: 404 });
    }
    if (!plan || typeof plan !== "object" || !plan.strategy || !plan.entry) {
      return Response.json({ error: "Invalid trade plan" }, { status: 400 });
    }

    const s = await getSnapshot(index);
    const assessment = evaluateTradeRisk(plan, s, inputs, overrideConfig);

    return Response.json(assessment);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
