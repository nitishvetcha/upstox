import { getSnapshot } from "@/lib/services/market";
import { isIndexId } from "@/lib/services/instrumentRegistry";
import { FALLBACK_LABELS } from "@/lib/fallback";

export async function GET(_req: Request, ctx: RouteContext<"/api/breadth/[index]">) {
  const { index } = await ctx.params;
  if (!isIndexId(index)) {
    return Response.json({ error: `Unknown index: ${index}` }, { status: 404 });
  }
  const s = await getSnapshot(index);
  return Response.json({
    ...s.breadth,
    fallbackReason: s.fallbackReason,
    fallbackMessage: s.fallbackReason && FALLBACK_LABELS[s.fallbackReason],
  });
}
