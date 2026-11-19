import { getAnalysis } from "../../../../lib/services/market.ts";
import { isIndexId } from "../../../../lib/services/instrumentRegistry.ts";
import { toApiAnalysis } from "../../../../lib/analysisResponse.ts";

// Public analysis response: actionable levels only when status is TRADE (see src/lib/analysisResponse.ts).
export async function GET(_req: Request, ctx: RouteContext<"/api/analysis/[index]">) {
  const { index } = await ctx.params;
  if (!isIndexId(index)) return Response.json({ error: `Unknown index: ${index}` }, { status: 404 });
  return Response.json(toApiAnalysis(await getAnalysis(index)));
}
