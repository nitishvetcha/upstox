export const dynamic = "force-dynamic";

import { listPaperOpportunities, buildInstrumentSummaries } from "../../../../lib/services/paperOpportunityStore.ts";
import { requireOperator } from "../../../../lib/operatorSession.ts";

export function GET(req: Request) {
  const denied = requireOperator(req);
  if (denied) return denied;

  const summaries = buildInstrumentSummaries(listPaperOpportunities());
  return Response.json({ summaries });
}
