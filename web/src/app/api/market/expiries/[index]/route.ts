import { sourceMeta, withFallback } from "@/lib/services/market";
import { getUnderlyingInstrument } from "@/lib/services/instrumentRegistry";
import { FALLBACK_LABELS } from "@/lib/fallback";

export async function GET(_req: Request, ctx: RouteContext<"/api/market/expiries/[index]">) {
  const { index } = await ctx.params;
  const inst = getUnderlyingInstrument(index);
  if (!inst) return Response.json({ error: `Unknown index: ${index}` }, { status: 404 });
  const { data, fallbackReason } = await withFallback((p) => p.getExpiries(inst.id));
  return Response.json({
    index: inst.symbol,
    expiries: data.expiries,
    nearest: data.expiries[0] ?? null,
    ...sourceMeta(data.source),
    fallbackReason,
    fallbackMessage: fallbackReason && FALLBACK_LABELS[fallbackReason],
  });
}
