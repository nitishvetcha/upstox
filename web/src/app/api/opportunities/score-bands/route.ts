export const dynamic = "force-dynamic";

import { listPaperOpportunities, isFixture, scoreBandAccuracy } from "@/lib/services/paperOpportunityStore";

export async function GET() {
  const all = listPaperOpportunities().filter((o) => !isFixture(o));
  return Response.json(scoreBandAccuracy(all));
}
