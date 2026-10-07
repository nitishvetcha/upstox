import { filtersFrom } from "@/lib/services/performance/api";
import { getBacktestRun } from "@/lib/services/backtestStore";
import { filterTrades } from "@/lib/services/performance/report";
import { legsCsv, tradesCsv } from "@/lib/services/performance/journal";

// GET /api/performance/[runId]/export?type=trades|legs (+ journal filters) → CSV. legs.csv joins trades.csv on run_id + trade_id.
export async function GET(req: Request, ctx: RouteContext<"/api/performance/[runId]/export">) {
  const { runId } = await ctx.params;
  const run = getBacktestRun(runId);
  if (!run) return Response.json({ status: "error", message: `Backtest run ${runId} not found` }, { status: 404 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type") === "legs" ? "legs" : "trades";
  const trades = filterTrades(run.trades, filtersFrom(url));
  const csv = type === "legs" ? legsCsv(run, trades) : tradesCsv(run, trades);
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${runId}_${type}.csv"` },
  });
}
