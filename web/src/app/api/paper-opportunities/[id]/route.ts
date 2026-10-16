export const dynamic = "force-dynamic";

import { getPaperOpportunity } from "@/lib/services/paperOpportunityStore";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const opp = getPaperOpportunity(id);
  if (!opp) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(opp);
}
