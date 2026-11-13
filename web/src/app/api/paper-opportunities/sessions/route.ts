export const dynamic = "force-dynamic";

// GET /api/paper-opportunities/sessions
// Returns multi-session evidence report and recorded market sessions.
import { requireOperator } from "../../../../lib/operatorSession.ts";
import { listSessionRecords, buildMultiSessionSummary } from "@/lib/services/sessionEvidenceStore";

export async function GET(req: Request) {
  const refused = requireOperator(req);
  if (refused) return refused;
  const sessions = listSessionRecords();
  const summary = buildMultiSessionSummary(sessions);
  return Response.json({
    summary,
    sessions,
  });
}
