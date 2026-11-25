export const dynamic = "force-dynamic";

// Controlled entrypoint for GitHub Actions. It can only collect/monitor
// paper evidence; it has no order-placement capability.
import { timingSafeEqual, createHash } from "node:crypto";
import { recordAutomationRun, supabasePersistenceIssue } from "@/lib/services/supabasePersistence";
import {
  checkpointPaperValidationState,
  restorePaperValidationState,
} from "@/lib/services/paperValidationPersistence";
import { POST as collectPaperOpportunities } from "@/app/api/paper-opportunities/collect/route";
import { POST as monitorPaperOpportunities } from "@/app/api/paper-opportunities/monitor/route";

function equal(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

export async function POST(request: Request) {
  const token = process.env.SCHEDULER_TOKEN;
  const supplied = request.headers.get("x-scheduler-token") ?? "";
  if (!token || !supplied || !equal(token, supplied)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const operator = process.env.OPERATOR_TOKEN;
  if (!operator || operator.length < 32) return Response.json({ error: "scheduler is not configured with an operator token" }, { status: 503 });

  const id = `scheduled_${Date.now()}`;
  const headers = { authorization: `Bearer ${operator}` };
  let stage = "restore";
  try {
    const recovery = await restorePaperValidationState();
    stage = "collect_request";
    // Invoke the existing protected handlers directly. A Render free instance may
    // have one web worker, so HTTP calls back into this same service can deadlock.
    const collectResponse = await collectPaperOpportunities(new Request("http://internal/api/paper-opportunities/collect", { method: "POST", headers }));
    stage = "collect_response";
    const collect = await collectResponse.json();
    stage = "monitor_request";
    const monitorResponse = await monitorPaperOpportunities(new Request("http://internal/api/paper-opportunities/monitor", { method: "POST", headers }));
    stage = "monitor_response";
    const monitor = await monitorResponse.json();
    const status = collectResponse.ok && monitorResponse.ok ? "SUCCESS" : "PARTIAL";
    stage = "checkpoint";
    const checkpointed = await checkpointPaperValidationState();
    // Evidence collection is not operationally useful on Render's ephemeral
    // filesystem unless the cloud checkpoint succeeds. Fail closed so GitHub
    // cannot report a misleading green run while Supabase is unavailable.
    if (!checkpointed) {
      const persistenceIssue = supabasePersistenceIssue();
      await recordAutomationRun(id, "PAPER_CYCLE", "ERROR", { error: "supabase_checkpoint_unavailable", persistenceIssue, collect, monitor, recovery });
      return Response.json({ id, error: "supabase checkpoint unavailable", persistenceIssue, stage }, { status: 503 });
    }
    await recordAutomationRun(id, "PAPER_CYCLE", status, { collect, monitor, recovery, checkpointed });
    return Response.json({ id, status, collect, monitor, recovery, checkpointed });
  } catch {
    console.error(JSON.stringify({ event: "paper_cycle_failed", id, stage }));
    await recordAutomationRun(id, "PAPER_CYCLE", "ERROR", { error: "internal paper cycle request failed", stage });
    return Response.json({ id, error: "paper cycle failed", stage }, { status: 502 });
  }
}
