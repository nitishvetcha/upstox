import { requireOperator } from "../../../../lib/operatorSession.ts";
export const dynamic = "force-dynamic";

import { getPaperOpportunity } from "@/lib/services/paperOpportunityStore";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const refused = requireOperator(_req);
  if (refused) return refused;
  const { id } = await params;
  const opp = getPaperOpportunity(id);
  if (!opp) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(opp);
}
