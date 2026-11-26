// Render production entrypoint: runs Next.js server AND Telegram Market Bot runner concurrently.
// Features:
// 1. Stream chunk line-buffering (guarantees warnings split across chunks are never misclassified).
// 2. Selective harmless warning filtration (Node SQLite experimental warning routed to stdout as notice).
// 3. Unmasked genuine stderr preservation (genuine errors remain on process.stderr for Render alerts).
// 4. Child process crash supervision & bounded auto-restart with exponential backoff for BOT-RUNNER.
// 5. Sliding-window restart budget: resets retry count after 15 minutes of uninterrupted stability.
// 6. Fatal exit propagation: Next.js crash or exhausted bot retries exit container with code 1.
// 7. Global unhandledRejection / uncaughtException handlers with exit code 1 propagation.

import { spawn } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, "..");
process.chdir(webDir);

const port = process.env.PORT || "10000";
const host = "0.0.0.0";

console.log("==================================================================");
console.log(`  STARTING RENDER PRODUCTION SUPERVISOR (PORT ${port})`);
console.log("==================================================================");

let shuttingDown = false;
const children = new Map(); // label -> childProcess

// Specific list of known benign Node.js runtime diagnostic warnings
const BENIGN_WARNING_PATTERNS = [
  "ExperimentalWarning: SQLite is an experimental feature",
  "Use `node --trace-warnings ...` to show where the warning was created",
  "(node:", // Node experimental warning prefix
];

function isBenignWarning(text) {
  return BENIGN_WARNING_PATTERNS.some((pat) => text.includes(pat));
}

/**
 * Creates a stream chunk line buffer accumulator.
 * Buffers partial lines across chunk boundaries so log analysis is strictly line-atomic.
 */
function createLineBuffer(onLine) {
  let remainder = "";
  return (chunk) => {
    const text = remainder + chunk.toString();
    const lines = text.split("\n");
    remainder = lines.pop() ?? ""; // last element is either incomplete line or empty string
    for (const line of lines) {
      if (line.trim().length > 0) {
        onLine(line);
      }
    }
  };
}

function handleChildLine(line, label, isStderr) {
  if (!isStderr) {
    const prefix = line.startsWith(`[${label}]`) ? "" : `[${label}] `;
    process.stdout.write(`${prefix}${line}\n`);
  } else {
    if (isBenignWarning(line)) {
      // Demote known benign Node.js warning to stdout notice
      process.stdout.write(`[${label}:notice] ${line}\n`);
    } else {
      // Genuine error / exception: PRESERVE ON STDERR so Render flags and alerts fire!
      process.stderr.write(`[${label}:error] ${line}\n`);
    }
  }
}

// 1. Start Next.js web application
function startNextServer() {
  console.log(`[RENDER] Spawning Next.js server on ${host}:${port}...`);
  const nextBin = path.join(webDir, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "start", "-H", host, "-p", port], {
    cwd: webDir,
    env: { ...process.env, PORT: port, HOST: host },
    stdio: ["ignore", "pipe", "pipe"],
  });

  children.set("NEXT-WEB", child);
  const outBuffer = createLineBuffer((line) => handleChildLine(line, "NEXT-WEB", false));
  const errBuffer = createLineBuffer((line) => handleChildLine(line, "NEXT-WEB", true));

  child.stdout?.on("data", outBuffer);
  child.stderr?.on("data", errBuffer);

  child.on("exit", (code, signal) => {
    const exitMsg = `[NEXT-WEB] Process exited with code ${code ?? signal}`;
    if (!shuttingDown) {
      process.stderr.write(`[SUPERVISOR:FATAL] ${exitMsg}. Web server terminated unexpectedly! Exiting container.\n`);
      process.exit(code ?? 1);
    } else {
      console.log(exitMsg);
    }
  });
}

// 2. Start Telegram Market Bot & Schedule Runner with crash supervision
let botRestartCount = 0;
const MAX_BOT_RESTARTS = 3;
const STABLE_UPTIME_RESET_MS = 15 * 60 * 1000; // 15 minutes of stability resets retry budget
let botLastStartTime = 0;
let botRestartTimer = null;

function startBotRunner() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn("[RENDER] WARNING: TELEGRAM_BOT_TOKEN not configured; skipping bot runner.");
    return;
  }

  botLastStartTime = Date.now();
  console.log(`[RENDER] Spawning Telegram Market Bot & Schedule Runner (attempt ${botRestartCount + 1}/${MAX_BOT_RESTARTS + 1})...`);
  const child = spawn(process.execPath, ["--no-warnings", "--import", "tsx", "scripts/run-telegram-market-bot.ts"], {
    cwd: webDir,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  children.set("BOT-RUNNER", child);
  const outBuffer = createLineBuffer((line) => handleChildLine(line, "BOT-RUNNER", false));
  const errBuffer = createLineBuffer((line) => handleChildLine(line, "BOT-RUNNER", true));

  child.stdout?.on("data", outBuffer);
  child.stderr?.on("data", errBuffer);

  child.on("exit", (code, signal) => {
    const exitMsg = `[BOT-RUNNER] Process exited with code ${code ?? signal}`;
    if (shuttingDown) {
      console.log(exitMsg);
      return;
    }

    process.stderr.write(`[SUPERVISOR:ERROR] ${exitMsg}\n`);

    // Check if the bot was running stably for >= 15 minutes before crashing
    const uptime = Date.now() - botLastStartTime;
    if (uptime >= STABLE_UPTIME_RESET_MS) {
      console.log(`[SUPERVISOR] BOT-RUNNER ran stably for ${Math.round(uptime / 60000)}m. Resetting restart counter.`);
      botRestartCount = 0;
    }

    if (botRestartCount < MAX_BOT_RESTARTS) {
      botRestartCount++;
      const backoffMs = botRestartCount * 2500; // 2.5s, 5.0s, 7.5s
      console.log(`[SUPERVISOR] Scheduling BOT-RUNNER restart in ${backoffMs}ms (retry ${botRestartCount}/${MAX_BOT_RESTARTS})...`);
      botRestartTimer = setTimeout(() => {
        if (!shuttingDown) startBotRunner();
      }, backoffMs);
    } else {
      process.stderr.write(
        `[SUPERVISOR:FATAL] BOT-RUNNER exceeded maximum restarts (${MAX_BOT_RESTARTS}). Exiting container so Render triggers alert and fresh boot.\n`
      );
      process.exit(1);
    }
  });
}

// 3. Autonomous In-Process Paper Cycle Loop
let paperCycleTimer = null;

function startPaperCycleRunner() {
  const schedulerToken = process.env.SCHEDULER_TOKEN;
  if (!schedulerToken) {
    console.log("[RENDER] NOTICE: SCHEDULER_TOKEN not set; skipping autonomous paper cycle runner.");
    return;
  }

  console.log("[RENDER] Spawning Autonomous Paper Cycle Loop (every 2m during market hours)...");

  const runCycle = async () => {
    if (shuttingDown) return;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/automation/paper-cycle`, {
        method: "POST",
        headers: { "x-scheduler-token": schedulerToken },
        signal: AbortSignal.timeout(90000),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const c = data.collect ?? {};
        const m = data.monitor ?? {};
        console.log(`[PAPER-CYCLE:OK] market=${c.market ?? "OPEN"} created=${c.created ?? 0} dup=${c.duplicates ?? 0} eval=${m.evaluated ?? 0} updated=${m.updated ?? 0} checkpointed=${data.checkpointed ?? false}`);
      } else {
        console.warn(`[PAPER-CYCLE:WARN] HTTP ${res.status}: ${data.error ?? "cycle error"}`);
      }
    } catch (e) {
      if (!shuttingDown) {
        console.warn(`[PAPER-CYCLE:ERROR] ${e.message}`);
      }
    }
  };

  // Wait 12 seconds after Next.js starts listening before first execution
  setTimeout(() => {
    if (!shuttingDown) {
      void runCycle();
      paperCycleTimer = setInterval(() => {
        void runCycle();
      }, 120_000); // every 2 minutes
    }
  }, 12_000);
}

// Graceful termination
const shutdown = (sig, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  if (paperCycleTimer) clearInterval(paperCycleTimer);
  if (botRestartTimer) clearTimeout(botRestartTimer);
  console.log(`\n[RENDER] Received ${sig}, terminating child processes cleanly (exitCode ${exitCode})...`);
  for (const [label, child] of children.entries()) {
    try {
      console.log(`[RENDER] Terminating ${label} (PID ${child.pid})...`);
      child.kill(sig);
    } catch {}
  }
  setTimeout(() => process.exit(exitCode), 4000);
};

process.on("SIGINT", () => shutdown("SIGINT", 0));
process.on("SIGTERM", () => shutdown("SIGTERM", 0));

// Global error handlers
process.on("uncaughtException", (err) => {
  process.stderr.write(`[SUPERVISOR:FATAL] Uncaught Exception: ${err?.stack || err}\n`);
  shutdown("SIGTERM", 1);
});

process.on("unhandledRejection", (reason) => {
  process.stderr.write(`[SUPERVISOR:FATAL] Unhandled Rejection: ${reason?.stack || reason}\n`);
  shutdown("SIGTERM", 1);
});

// Launch processes
startNextServer();
startPaperCycleRunner();
startBotRunner();
