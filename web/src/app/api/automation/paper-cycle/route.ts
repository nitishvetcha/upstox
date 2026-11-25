export const dynamic = "force-dynamic";

// Controlled entrypoint for GitHub Actions. It can only collect/monitor
// paper evidence; it has no order-placement capability.
import { timingSafeEqual, createHash } from "node:crypto";
import { recordAutomationRun } from "@/lib/services/supabasePersistence";
import {
  checkpointPaperValidationState,
  restorePaperValidationState,
} from "@/lib/services/paperValidationPersistence";

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
  // This route runs inside the same Render web process as collect/monitor. Calling
  // the public onrender.com hostname from that process can fail on free instances;
  // use the bound local listener instead of creating a public network loop.
  const origin = `http://127.0.0.1:${process.env.PORT ?? "10000"}`;
  const headers = { authorization: `Bearer ${operator}` };
  let stage = "restore";
  try {
    const recovery = await restorePaperValidationState();
    stage = "collect_request";
    const collectResponse = await fetch(`${origin}/api/paper-opportunities/collect`, { method: "POST", headers });
    stage = "collect_response";
    const collect = await collectResponse.json();
    stage = "monitor_request";
    const monitorResponse = await fetch(`${origin}/api/paper-opportunities/monitor`, { method: "POST", headers });
    stage = "monitor_response";
    const monitor = await monitorResponse.json();
    const status = collectResponse.ok && monitorResponse.ok ? "SUCCESS" : "PARTIAL";
    stage = "checkpoint";
    const checkpointed = await checkpointPaperValidationState();
    await recordAutomationRun(id, "PAPER_CYCLE", status, { collect, monitor, recovery, checkpointed });
    return Response.json({ id, status, collect, monitor, recovery, checkpointed });
  } catch {
    console.error(JSON.stringify({ event: "paper_cycle_failed", id, stage }));
    await recordAutomationRun(id, "PAPER_CYCLE", "ERROR", { error: "internal paper cycle request failed", stage });
    return Response.json({ id, error: "paper cycle failed", stage }, { status: 502 });
  }
}
