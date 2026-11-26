import { timingSafeEqual, createHash } from "node:crypto";
import { runLiveSwingScan, type SwingScanResult } from "../../../../lib/stockV2/swingLiveScanner.ts";
import { sendSwingPickAlert } from "../../../../lib/services/notificationService.ts";

function equal(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest()
  );
}

export interface SwingScanCronDeps {
  scanFn?: (now?: Date) => Promise<SwingScanResult>;
  notifyFn?: typeof sendSwingPickAlert;
  now?: Date;
  token?: string;
}

export async function handleSwingScan(
  request: Request,
  deps: SwingScanCronDeps = {}
): Promise<Response> {
  const token = deps.token ?? process.env.SCHEDULER_TOKEN;
  const supplied = request.headers.get("x-scheduler-token") ?? "";
  if (!token || !supplied || !equal(token, supplied)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = deps.now ?? new Date();
  const start = Date.now();

  try {
    const scanner = deps.scanFn ?? runLiveSwingScan;
    const result = await scanner(now);

    let alertSent = false;
    if (result.status === "PICK" && result.pick) {
      const notify = deps.notifyFn ?? sendSwingPickAlert;
      const alertRes = await notify(result.pick).catch(() => ({ ok: false }));
      alertSent = Boolean(alertRes?.ok);
    }

    return Response.json({
      ok: true,
      ...result,
      alertSent,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[CRON:SWING_SCAN_ERROR] ${message}`);
    return Response.json({ error: message }, { status: 500 });
  }
}
