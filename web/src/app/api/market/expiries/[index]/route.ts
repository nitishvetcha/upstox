import { sourceMeta, withFallback } from "@/lib/services/market";
import { INSTRUMENTS, isIndexId } from "@/lib/services/instrumentRegistry";
import { FALLBACK_LABELS } from "@/lib/fallback";

export async function GET(_req: Request, ctx: RouteContext<"/api/market/expiries/[index]">) {
  const { index } = await ctx.params;
  if (!isIndexId(index)) return Response.json({ error: `Unknown index: ${index}` }, { status: 404 });
  const { data, fallbackReason } = await withFallback((p) => p.getExpiries(index));
  return Response.json({
    index: INSTRUMENTS[index].symbol,
    expiries: data.expiries,
    nearest: data.expiries[0] ?? null,
    ...sourceMeta(data.source),
    fallbackReason,
    fallbackMessage: fallbackReason && FALLBACK_LABELS[fallbackReason],
  });
}
