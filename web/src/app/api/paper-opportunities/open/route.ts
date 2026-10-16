export const dynamic = "force-dynamic";

import { listPaperOpportunities } from "@/lib/services/paperOpportunityStore";

export async function GET() {
  const open = listPaperOpportunities().filter((o) => o.status === "OPEN");
  return Response.json({ total: open.length, records: open });
}
