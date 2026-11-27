export const dynamic = "force-dynamic";

import { warmWorkspaceCaches } from "@/lib/services/warmup";
import { requireOperator } from "@/lib/operatorSession";
import { isSchedulerRequest } from "@/lib/schedulerAuth";

function warm(req: Request): Response {
  const denied = isSchedulerRequest(req) ? null : requireOperator(req);
  if (denied) return denied;
  void warmWorkspaceCaches();
  return Response.json({ ok: true, warming: true, timestamp: new Date().toISOString() });
}

export async function GET(req: Request) {
  return warm(req);
}

export async function POST(req: Request) {
  return warm(req);
}
