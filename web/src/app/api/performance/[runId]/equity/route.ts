import { json, loadReport } from "@/lib/services/performance/api";

export async function GET(req: Request, ctx: RouteContext<"/api/performance/[runId]/equity">) {
  const r = await loadReport(req, ctx.params);
  return "error" in r ? r.error : json({ basis: r.report.equityBasis, points: r.report.equity, drawdown: r.report.drawdown, dailyReturns: r.report.dailyReturns });
}
