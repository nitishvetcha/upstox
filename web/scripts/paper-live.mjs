import * as fs from "node:fs";
import * as path from "node:path";
import { BASE, serverUp } from "./upstox-cli.mjs";

const INTERVAL = parseInt(process.env.PAPER_TRADE_POLL_INTERVAL_MS ?? "30000", 10);
const LOCK_FILE = path.join(process.cwd(), ".data", "paper-live.lock");

// Lock protection
fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
if (fs.existsSync(LOCK_FILE)) {
  const existingPid = fs.readFileSync(LOCK_FILE, "utf8").trim();
  try {
    process.kill(Number(existingPid), 0); // Check if process still alive
    console.error(`Error: paper-live is already running (PID ${existingPid}). Exiting.`);
    process.exit(1);
  } catch {
    // Process is dead, stale lock file
    fs.unlinkSync(LOCK_FILE);
  }
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

async function cycle() {
  const time = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
  const collect = await fetch(`${BASE}/api/paper-opportunities/collect`, { method: "POST" })
    .then((r) => r.json()).catch((e) => ({ error: e.message, market: "UNKNOWN" }));

  if (collect.market === "CLOSED" || collect.reason === "MARKET_CLOSED") {
    console.log(`[${time}] Market CLOSED — executing final end-of-day evaluation pass...`);
    const finalMon = await fetch(`${BASE}/api/paper-opportunities/monitor`, { method: "POST" })
      .then((r) => r.json()).catch(() => ({}));
    console.log(`[${time}] Final EOD pass: updated=${finalMon.updated ?? 0} eodExits=${finalMon.eodExits ?? 0} eodUnpriced=${finalMon.eodUnpriced ?? 0}`);
    console.log("Market closed. Exiting live loop.");
    cleanupLock();
    process.exit(0);
  }

  const monitor = await fetch(`${BASE}/api/paper-opportunities/monitor`, { method: "POST" })
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
  await fetch(`${BASE}/api/paper-opportunities/monitor`, { method: "POST" }).catch(() => {});
  cleanupLock();
  process.exit(0);
});
