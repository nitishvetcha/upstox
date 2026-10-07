import { filtersFrom, json } from "@/lib/services/performance/api";
import { getBacktestRun } from "@/lib/services/backtestStore";
import { filterTrades } from "@/lib/services/performance/report";
import { journal } from "@/lib/services/performance/journal";

// GET /api/performance/[runId]/trades?strategy=&regime=&outcome=win|loss|breakeven&exitReason=&from=&to=&minR=&maxR=&sort=date|pnl|r|duration&dir=asc|desc
export async function GET(req: Request, ctx: RouteContext<"/api/performance/[runId]/trades">) {
  const { runId } = await ctx.params;
  const run = getBacktestRun(runId);
  if (!run) return Response.json({ status: "error", message: `Backtest run ${runId} not found` }, { status: 404 });
  const url = new URL(req.url);
  const rows = journal(run, filterTrades(run.trades, filtersFrom(url)));
  const sort = url.searchParams.get("sort") ?? "date";
  const dir = url.searchParams.get("dir") === "asc" ? 1 : -1;
  const key = (j: (typeof rows)[number]) => (sort === "pnl" ? j.netPnL : sort === "r" ? j.rMultiple : sort === "duration" ? (j.holdingMinutes ?? -1) : Date.parse(j.timestamp));
  rows.sort((a, b) => (key(a) - key(b)) * dir || a.tradeId.localeCompare(b.tradeId));
  return json({ count: rows.length, trades: rows });
}
