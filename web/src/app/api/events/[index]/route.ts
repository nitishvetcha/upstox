import { isIndexId } from "@/lib/services/instrumentRegistry";
import { eventSummary, indexNews } from "@/lib/services/newsApi";

export async function GET(_req: Request, ctx: RouteContext<"/api/events/[index]">) {
  const { index } = await ctx.params;
  if (!isIndexId(index)) return Response.json({ error: `Unknown index: ${index}` }, { status: 404 });
  return Response.json(eventSummary(await indexNews(index)));
}
