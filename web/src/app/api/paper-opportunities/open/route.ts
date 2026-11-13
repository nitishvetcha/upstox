export const dynamic = "force-dynamic";

import { requireOperator } from "../../../../lib/operatorSession.ts";
import { listPaperOpportunities } from "@/lib/services/paperOpportunityStore";

export async function GET(req: Request) {
  const refused = requireOperator(req);
  if (refused) return refused;
  const open = listPaperOpportunities().filter((o) => o.status === "OPEN");
  return Response.json({ total: open.length, records: open });
}
