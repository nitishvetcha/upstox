export const dynamic = "force-dynamic";

import { buildAuditReport } from "@/lib/historicalOptionDataAudit";

/** GET /api/backtest/data-quality — returns the historical option data audit report. */
export async function GET() {
  const report = buildAuditReport();
  return Response.json(report);
}
