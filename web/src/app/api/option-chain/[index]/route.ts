import type { NextRequest } from "next/server";
import { sourceMeta, withFallback } from "@/lib/services/market";
import { INSTRUMENTS, isIndexId } from "@/lib/services/instrumentRegistry";
import { atmStrike, sliceAroundAtm } from "@/lib/services/optionChainAnalytics";
import { InvalidRequestError } from "@/lib/services/errors";
import { FALLBACK_LABELS } from "@/lib/fallback";
import type { Quote } from "@/lib/types";

const DEFAULT_RANGE = Number(process.env.OPTION_CHAIN_RANGE ?? 10);

const side = (q: Quote) => ({
  ltp: q.ltp,
  bid: q.bid,
  ask: q.ask,
  volume: q.volume,
  oi: q.oi,
  changeOi: q.chgOi,
  iv: q.iv,
  delta: q.delta,
  gamma: q.gamma ?? null,
  theta: q.theta ?? null,
  vega: q.vega ?? null,
});

// GET /api/option-chain/nifty?expiry=YYYY-MM-DD&range=10  (range = strikes either side of ATM, 1–50)
export async function GET(req: NextRequest, ctx: RouteContext<"/api/option-chain/[index]">) {
  const { index } = await ctx.params;
  if (!isIndexId(index)) return Response.json({ error: `Unknown index: ${index}` }, { status: 404 });
  const expiry = req.nextUrl.searchParams.get("expiry") ?? undefined;
  const range = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("range")) || DEFAULT_RANGE));

  try {
    const { data, fallbackReason } = await withFallback((p) => p.getOptionChain(index, expiry));
    return Response.json({
      index: INSTRUMENTS[index].symbol,
      expiry: data.expiry,
      spot: data.spot,
      atmStrike: atmStrike(data.rows, data.spot),
      strikeStep: data.strikeStep,
      range,
      strikes: sliceAroundAtm(data.rows, data.spot, range).map((r) => ({ strike: r.strike, call: side(r.call), put: side(r.put) })),
      ...sourceMeta(data.source),
      fallbackReason,
      fallbackMessage: fallbackReason && FALLBACK_LABELS[fallbackReason],
    });
  } catch (e) {
    if (e instanceof InvalidRequestError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
