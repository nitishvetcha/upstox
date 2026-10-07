export const dynamic = "force-dynamic";

import { resolveSymbol, stockHistory } from "@/lib/services/stockService";
import { chartPoints } from "@/lib/marketHistory";
import { atr } from "@/lib/services/technicalAnalysis";

// GET /api/stocks/[symbol]/technicals — latest daily indicators from 1Y of daily history.
export async function GET(_req: Request, ctx: RouteContext<"/api/stocks/[symbol]/technicals">) {
  const { symbol } = await ctx.params;
  const inst = await resolveSymbol(symbol);
  if (!inst) return Response.json({ error: `Unknown NSE symbol: ${symbol}` }, { status: 404 });
  const h = await stockHistory(inst, "1d", "1Y");
  if ("error" in h) return Response.json({ instrument: inst, status: "UNAVAILABLE", reason: h.error });
  const { points, support, resistance } = chartPoints(h.candles, "1d");
  const last = points.at(-1);
  if (!last) return Response.json({ instrument: inst, status: "UNAVAILABLE", reason: "no candles returned" });
  const trend = last.ema50 !== null && last.ema200 !== null ? (last.close > last.ema50 && last.ema50 > last.ema200 ? "UPTREND" : last.close < last.ema50 && last.ema50 < last.ema200 ? "DOWNTREND" : "MIXED") : "INSUFFICIENT_HISTORY";
  return Response.json({
    instrument: inst,
    status: "READY",
    asOf: last.t,
    close: last.close,
    ema20: last.ema20, ema50: last.ema50, ema100: last.ema100, ema200: last.ema200,
    rsi: last.rsi, macd: last.macd, macdSignal: last.macdSignal, macdHist: last.macdHist,
    atr: atr(h.candles),
    support, resistance, trend,
    coverage: h.coverage,
    quality: h.quality,
  });
}
