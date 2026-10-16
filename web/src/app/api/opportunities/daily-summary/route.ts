export const dynamic = "force-dynamic";

import { listPaperOpportunities, buildDailySummary } from "@/lib/services/paperOpportunityStore";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const all = listPaperOpportunities();
  const summary = buildDailySummary(all, date);
  return Response.json(summary);
}
