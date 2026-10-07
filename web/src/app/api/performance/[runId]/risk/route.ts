import { json, loadReport } from "@/lib/services/performance/api";

export async function GET(req: Request, ctx: RouteContext<"/api/performance/[runId]/risk">) {
  const r = await loadReport(req, ctx.params);
  return "error" in r ? r.error : json({ ...r.report.risk, exitReasons: r.report.exitReasons, noTrade: r.report.noTrade, costs: r.report.costs });
}
