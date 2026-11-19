import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { BASE, serverUp, requireOperatorHeaders } from "./upstox-cli.mjs";
import { cycleAction, lockHeldByLiveRunner, healthRecord, openingWindowMissed, classifyStockErrors, shouldHaltForAuth } from "./runner-lib.mjs";

const INTERVAL = parseInt(process.env.PAPER_TRADE_POLL_INTERVAL_MS ?? "30000", 10);
const LOCK_FILE = path.join(process.cwd(), ".data", "paper-live.lock");
// Checked before the lock is taken, so a missing token never leaves a stale lock file behind.
const AUTH = requireOperatorHeaders();

// Lock protection
fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
if (fs.existsSync(LOCK_FILE)) {
  const existingPid = Number(fs.readFileSync(LOCK_FILE, "utf8").trim());
  if (lockHeldByLiveRunner(existingPid)) {
    console.error(`Error: paper-live is already running (PID ${existingPid}). Exiting.`);
    process.exit(1);
  }
  console.log(`Removing stale lock (PID ${existingPid} is not a running paper-live process).`);
  fs.unlinkSync(LOCK_FILE);
}

fs.writeFileSync(LOCK_FILE, String(process.pid), "utf8");

function cleanupLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch {}
}

process.on("exit", cleanupLock);
process.on("SIGINT", () => { cleanupLock(); process.exit(0); });
process.on("SIGTERM", () => { cleanupLock(); process.exit(0); });

if (!(await serverUp())) {
  cleanupLock();
  console.log(`Server not running at ${BASE}. Start with: npm run dev:upstox`);
  process.exit(1);
}

console.log(`Starting live paper-trade loop (interval: ${INTERVAL / 1000}s, PID: ${process.pid}). Ctrl+C to stop.\n`);

// Readiness evidence, append-only: .data/runner-health.jsonl (no credentials).
const HEALTH_FILE = path.join(process.cwd(), ".data", "runner-health.jsonl");
const SCHEDULED_START_IST = "09:10";
const health = (event, extra) => {
  const rec = healthRecord(event, new Date(), extra);
  fs.appendFileSync(HEALTH_FILE, JSON.stringify(rec) + "\n");
  console.log(`[READINESS] ${JSON.stringify(rec)}`);
};
const auth = await fetch(`${BASE}/api/auth/status?verify=1`).then((r) => r.json()).catch(() => ({}));

// Authentication hardening: runner MUST halt when auth is expired, invalid, or disconnected
if (shouldHaltForAuth(auth)) {
  const status = auth.tokenStatus ?? "UNREACHABLE";
  console.error(`[AUTH_STOP] Upstox authentication invalid or expired (status: ${status}, connected: ${auth.connected ?? false}). Runner halting.`);
  health("RUNNER_AUTH_STOP", {
    scheduledStartIst: SCHEDULED_START_IST,
    pid: process.pid,
    authStatus: status,
    connected: auth.connected ?? false,
    reason: "HALTED_INVALID_AUTH",
  });
  cleanupLock();
  process.exit(0);
}

health("RUNNER_START", { scheduledStartIst: SCHEDULED_START_IST, pid: process.pid, authStatus: auth.tokenStatus ?? "UNREACHABLE", connected: auth.connected ?? null });
let firstOpenLogged = false;
let waitingLogged = false;
let lastError = null;
const AUDIT_EVERY_MS = 40 * 60_000;
let lastAuditAt = 0;

async function cycle() {
  const time = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
  const collect = await fetch(`${BASE}/api/paper-opportunities/collect`, { method: "POST", headers: AUTH })
    .then((r) => r.json()).catch((e) => ({ error: e.message, market: "UNKNOWN" }));

  // Halt runner if collection reports expired or invalid authentication
  if (collect.source === "AUTH_EXPIRED" || collect.source === "AUTH_UNAVAILABLE" || collect.reason === "AUTH_EXPIRED") {
    console.error(`[${time}] [AUTH_STOP] Authentication invalid or expired (${collect.source}). Halting runner.`);
    health("RUNNER_AUTH_STOP", { pid: process.pid, authStatus: collect.source, reason: "HALTED_MID_RUN_AUTH_EXPIRY" });
    cleanupLock();
    process.exit(0);
  }

  const action = cycleAction(collect);
  if (action === "WAIT_PREOPEN") {
    if (!waitingLogged) { console.log(`[${time}] Pre-market — waiting for 09:15 open.`); waitingLogged = true; }
    return;
  }
  if (action === "EXIT_EOD") {
    console.log(`[${time}] Market CLOSED — executing final end-of-day evaluation pass...`);
    const finalMon = await fetch(`${BASE}/api/paper-opportunities/monitor`, { method: "POST", headers: AUTH })
      .then((r) => r.json()).catch(() => ({}));
    console.log(`[${time}] Final EOD pass: updated=${finalMon.updated ?? 0} eodExits=${finalMon.eodExits ?? 0} eodUnpriced=${finalMon.eodUnpriced ?? 0}`);
    console.log("Market closed. Exiting live loop.");
    cleanupLock();
    process.exit(0);
  }

  // Phase 4 options data audit (docs/options-data-audit.md): one read-only sampling round every 40 min while OPEN.
  if (action === "RUN" && Date.now() - lastAuditAt >= AUDIT_EVERY_MS) {
    lastAuditAt = Date.now();
    const log = fs.openSync(path.join(process.cwd(), "logs", "options-audit.log"), "a");
    spawn(process.execPath, [path.join(process.cwd(), "scripts", "options-data-audit.ts"), "round"], { stdio: ["ignore", log, log], detached: true }).unref();
  }
  if (action === "RUN" && !firstOpenLogged) {
    firstOpenLogged = true;
    const now = new Date();
    // Auth re-checked here: an on-time collection with an expired token collects nothing and must not look healthy.
    const authNow = await fetch(`${BASE}/api/auth/status?verify=1`).then((r) => r.json()).catch(() => ({}));
    const { individualErrors, aggregateWarnings } = classifyStockErrors(collect.errors ?? []);
    health("FIRST_OPEN_COLLECTION", {
      openingWindowMissed: openingWindowMissed(now),
      authStatus: authNow.tokenStatus ?? "UNREACHABLE",
      stockDataErrors: individualErrors,
      stockAggregateWarnings: aggregateWarnings,
      created: collect.created ?? 0,
      reason: collect.reason ?? null,
    });
  }
  if (action === "ERROR" && String(collect.error) !== lastError) health("COLLECT_ERROR", { message: String(collect.error).slice(0, 200) });
  lastError = action === "ERROR" ? String(collect.error) : null;
  const monitor = await fetch(`${BASE}/api/paper-opportunities/monitor`, { method: "POST", headers: AUTH })
    .then((r) => r.json()).catch((e) => ({ error: e.message }));

  const c = collect.error ? `ERROR: ${collect.error}` : `created=${collect.created} dup=${collect.duplicates}`;
  const m = monitor.error
    ? `ERROR: ${monitor.error}`
    : `eval=${monitor.evaluated} updated=${monitor.updated} t1=${monitor.target1Hits} stop=${monitor.stopHits} eod=${(monitor.eodExits ?? 0) + (monitor.eodUnpriced ?? 0)} fixturesSkipped=${monitor.fixturesSkipped ?? 0}`;
  console.log(`[${time}] collect: ${c} | monitor: ${m}`);
}

// Run immediately then on interval
await cycle();
const timer = setInterval(cycle, INTERVAL);

process.on("SIGINT", async () => {
  clearInterval(timer);
  console.log("\nStopped by user. Running final evaluation...");
  await fetch(`${BASE}/api/paper-opportunities/monitor`, { method: "POST", headers: AUTH }).catch(() => {});
  cleanupLock();
  process.exit(0);
});
