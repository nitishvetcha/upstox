export const dynamic = "force-dynamic";

import { warmWorkspaceCaches } from "@/lib/services/warmup";

export async function GET() {
  void warmWorkspaceCaches();
  return Response.json({ ok: true, warming: true, timestamp: new Date().toISOString() });
}

export async function POST() {
  void warmWorkspaceCaches();
  return Response.json({ ok: true, warming: true, timestamp: new Date().toISOString() });
}
