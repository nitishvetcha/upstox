import { isIndexId } from "@/lib/services/instrumentRegistry";
import { indexNews, sentimentSummary } from "@/lib/services/newsApi";

export async function GET(_req: Request, ctx: RouteContext<"/api/sentiment/[index]">) {
  const { index } = await ctx.params;
  if (!isIndexId(index)) return Response.json({ error: `Unknown index: ${index}` }, { status: 404 });
  return Response.json(sentimentSummary(await indexNews(index)));
}
