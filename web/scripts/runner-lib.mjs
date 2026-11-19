// Pure helpers for scripts/paper-live.mjs, kept separate so they can be unit-tested.
import { execFileSync } from "node:child_process";

// What the runner does with one /collect response.
// Only a genuinely CLOSED market ends the session; PRE_MARKET means wait for 09:15
// (the collector reports reason "MARKET_CLOSED" for any non-OPEN status, so the reason alone is not enough).
export function cycleAction(collect) {
  if (collect?.error) return "ERROR";
  if (collect?.market === "CLOSED") return "EXIT_EOD";
  if (collect?.market === "PRE_MARKET") return "WAIT_PREOPEN";
  return "RUN";
}

// True only if `pid` is alive AND is a paper-live process. After a reboot or power cut an old PID can belong to
// an unrelated process; a bare liveness check would then block the runner for the whole day.
export function lockHeldByLiveRunner(pid, commandOf = psCommand) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); } catch { return false; }
  return /paper-live\.mjs/.test(commandOf(pid) ?? "");
}

function psCommand(pid) {
  try { return execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" }).trim(); } catch { return null; }
}

export const istDate = (d) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
export const istHm = (d) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(11, 16);

// One append-only line per event in .data/runner-health.jsonl. Contains no credentials.
export function healthRecord(event, at, extra = {}) {
  return { event, sessionDate: istDate(at), atIst: istHm(at), at: at.toISOString(), ...extra };
}

// The 09:15 opening window counts as missed when the first OPEN-market collection happens after 09:15.
export const openingWindowMissed = (firstOpenCollection) => istHm(firstOpenCollection) > "09:15";

// Classify stock-related errors from collection into individual stock failures vs aggregate warnings.
export function classifyStockErrors(errors = []) {
  const stockErrors = errors.filter((e) => /^Stock\s+[A-Za-z0-9_-]+:/.test(String(e)));
  const stockWarnings = errors.filter((e) => /^Stocks:/.test(String(e)));
  return {
    individualErrors: stockErrors.length,
    aggregateWarnings: stockWarnings.length,
    totalStockIssues: stockErrors.length + stockWarnings.length,
    individualErrorDetails: stockErrors,
    aggregateWarningDetails: stockWarnings,
  };
}

// Authentication guard for runner: halts polling if authentication is invalid, expired, or disconnected.
export function shouldHaltForAuth(auth) {
  if (!auth || typeof auth !== "object") return true;
  if (auth.connected !== true) return true;
  if (auth.tokenStatus !== "VERIFIED_CONNECTED") return true;
  return false;
}

// Supervisor readiness check from /api/auth/status response payload.
// HTTP 200 alone does not establish supervisor readiness; auth must be connected and valid.
export function isSupervisorReady(serverStatus) {
  if (!serverStatus || typeof serverStatus !== "object") return false;
  if (!serverStatus.httpOk) return false;
  if (serverStatus.connected !== true) return false;
  if (serverStatus.tokenStatus !== "VERIFIED_CONNECTED") return false;
  return true;
}

