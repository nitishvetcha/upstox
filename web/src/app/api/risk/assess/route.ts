import { requireOperator } from "../../../../lib/operatorSession.ts";
import { getSnapshot } from "../../../../lib/services/market.ts";
import { isIndexId } from "../../../../lib/services/instrumentRegistry.ts";
import { evaluateTradeRisk } from "../../../../lib/services/risk/riskService.ts";
import type { TradePlan } from "../../../../lib/types.ts";

export async function POST(req: Request) {
  const __refused = requireOperator(req);
  if (__refused) return __refused;
  // Malformed or missing JSON is a client error (400), not a server fault.
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  try {
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
