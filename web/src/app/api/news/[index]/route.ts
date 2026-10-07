import { isIndexId } from "@/lib/services/instrumentRegistry";
import { indexNews, sentimentSummary } from "@/lib/services/newsApi";

export async function GET(_req: Request, ctx: RouteContext<"/api/news/[index]">) {
  const { index } = await ctx.params;
  if (!isIndexId(index)) return Response.json({ error: `Unknown index: ${index}` }, { status: 404 });
  const n = await indexNews(index);
  return Response.json({ ...sentimentSummary(n), articles: n.articles });
}
