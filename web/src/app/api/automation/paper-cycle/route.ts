export const dynamic = "force-dynamic";

// Controlled entrypoint for GitHub Actions. It can only collect/monitor
// paper evidence; it has no order-placement capability.
import { timingSafeEqual, createHash } from "node:crypto";
import { recordAutomationRun } from "@/lib/services/supabasePersistence";

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
  const origin = new URL(request.url).origin;
  const headers = { authorization: `Bearer ${operator}` };
  try {
    const collectResponse = await fetch(`${origin}/api/paper-opportunities/collect`, { method: "POST", headers });
    const collect = await collectResponse.json();
    const monitorResponse = await fetch(`${origin}/api/paper-opportunities/monitor`, { method: "POST", headers });
    const monitor = await monitorResponse.json();
    const status = collectResponse.ok && monitorResponse.ok ? "SUCCESS" : "PARTIAL";
    await recordAutomationRun(id, "PAPER_CYCLE", status, { collect, monitor });
    return Response.json({ id, status, collect, monitor });
  } catch {
    await recordAutomationRun(id, "PAPER_CYCLE", "ERROR", { error: "internal paper cycle request failed" });
    return Response.json({ id, error: "paper cycle failed" }, { status: 502 });
  }
}
