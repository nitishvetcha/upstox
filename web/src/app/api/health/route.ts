// Phase 4+ — Production System Health Check & Operational Reliability Endpoint.
// Supports:
// 1. Liveness Probe (?probe=liveness): instant zero-I/O check for container orchestrators.
// 2. Full Readiness & Dependency Probe: cached verification of runner heartbeat, Telegram, and disk SHA-256.

import { generateHealthReport } from "./healthChecker.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const probe = url.searchParams.get("probe");
  const forceRefresh = url.searchParams.get("refresh") === "true";

  // Fast liveness probe for container orchestrator (zero I/O, instant 200)
  if (probe === "liveness") {
    return Response.json({
      status: "HEALTHY",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  }

  const { report, statusCode } = await generateHealthReport(new Date(), forceRefresh);
  return Response.json(report, { status: statusCode });
}
