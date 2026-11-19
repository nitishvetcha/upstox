import type { NextRequest } from "next/server";
import { sourceMeta, withFallback } from "@/lib/services/market";
import { INSTRUMENTS, isIndexId } from "@/lib/services/instrumentRegistry";
import { InvalidRequestError } from "@/lib/services/errors";
import { FALLBACK_LABELS } from "@/lib/fallback";
import { atmFor, chainLotSize, chainStrikes } from "@/lib/optionChainPayload";

const DEFAULT_RANGE = Number(process.env.OPTION_CHAIN_RANGE ?? 10);

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
      atmStrike: atmFor(data),
      strikeStep: data.strikeStep,
      lotSize: chainLotSize(data),
      // Diagnostic: per-contract price verification summary (which strikes were live, aging, stale or unavailable).
      optionPriceVerification: data.optionPriceVerification ?? null,
      range,
      strikes: chainStrikes(data, range),
      ...sourceMeta(data.source),
      fallbackReason,
      fallbackMessage: fallbackReason && FALLBACK_LABELS[fallbackReason],
    });
  } catch (e) {
    if (e instanceof InvalidRequestError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
