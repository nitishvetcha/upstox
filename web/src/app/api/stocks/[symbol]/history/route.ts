export const dynamic = "force-dynamic";

import { resolveSymbol, stockHistory } from "@/lib/services/stockService";
import { chartPoints, HISTORY_INTERVALS, HISTORY_RANGES, type HistoryInterval, type HistoryRange } from "@/lib/marketHistory";

// GET /api/stocks/[symbol]/history?range=1Y&interval=1d — chunked, cached, coverage-reported history + chart series.
export async function GET(req: Request, ctx: RouteContext<"/api/stocks/[symbol]/history">) {
  const { symbol } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const range = (sp.get("range") ?? "1Y") as HistoryRange;
  const interval = (sp.get("interval") ?? "1d") as HistoryInterval;
  if (!HISTORY_RANGES.includes(range)) return Response.json({ error: `range must be one of ${HISTORY_RANGES.join(", ")}` }, { status: 400 });
  if (!HISTORY_INTERVALS.includes(interval)) return Response.json({ error: `interval must be one of ${HISTORY_INTERVALS.join(", ")}` }, { status: 400 });
  const inst = await resolveSymbol(symbol);
  if (!inst) return Response.json({ error: `Unknown NSE symbol: ${symbol}` }, { status: 404 });
  const h = await stockHistory(inst, interval, range);
  if ("error" in h) return Response.json({ instrument: inst, range, interval, ...h, coverage: null, points: [] });
  const { points, support, resistance } = chartPoints(h.candles, interval);
  const { candles: _omit, ...meta } = h;
  void _omit;
  return Response.json({ instrument: inst, ...meta, points, support, resistance });
}
