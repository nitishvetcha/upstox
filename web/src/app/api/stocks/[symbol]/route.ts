export const dynamic = "force-dynamic";

import { resolveSymbol, stockQuote } from "@/lib/services/stockService";

// GET /api/stocks/[symbol] — current quote (UNAVAILABLE when Upstox is not connected; never mock).
export async function GET(_req: Request, ctx: RouteContext<"/api/stocks/[symbol]">) {
  const { symbol } = await ctx.params;
  const inst = await resolveSymbol(symbol);
  if (!inst) return Response.json({ error: `Unknown NSE symbol: ${symbol}` }, { status: 404 });
  return Response.json({ instrument: inst, quote: await stockQuote(inst) });
}
