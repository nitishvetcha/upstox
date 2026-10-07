import { json, loadReport } from "@/lib/services/performance/api";

// GET /api/performance/[runId]?strategy=&regime=&from=&to=&riskFreeRate=  → full report
export async function GET(req: Request, ctx: RouteContext<"/api/performance/[runId]">) {
  const r = await loadReport(req, ctx.params);
  return "error" in r ? r.error : json(r.report);
}
