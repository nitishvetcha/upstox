export const dynamic = "force-dynamic";

// GET /api/paper-opportunities/sessions
// Returns multi-session evidence report and recorded market sessions.
import { listSessionRecords, buildMultiSessionSummary } from "@/lib/services/sessionEvidenceStore";

export async function GET() {
  const sessions = listSessionRecords();
  const summary = buildMultiSessionSummary(sessions);
  return Response.json({
    summary,
    sessions,
  });
}
