import { getAnalysis } from "@/lib/services/market";
import { isIndexId } from "@/lib/services/instrumentRegistry";

export async function GET(_req: Request, ctx: RouteContext<"/api/analysis/[index]">) {
  const { index } = await ctx.params;
  if (!isIndexId(index)) return Response.json({ error: `Unknown index: ${index}` }, { status: 404 });
  return Response.json(await getAnalysis(index));
}
