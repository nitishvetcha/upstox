// Render production entrypoint: runs Next.js server AND Telegram Market Bot runner concurrently.
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
console.log(`  STARTING RENDER PRODUCTION DEPLOYMENT (PORT ${port})`);
console.log("==================================================================");

let shuttingDown = false;
const children = [];

function registerProcess(child, label) {
  children.push(child);
  child.stdout?.on("data", (chunk) => {
    process.stdout.write(`[${label}] ${chunk}`);
  });
  child.stderr?.on("data", (chunk) => {
    process.stderr.write(`[${label}] ${chunk}`);
  });
  child.on("exit", (code, signal) => {
    console.log(`[${label}] Process exited with code ${code ?? signal}`);
    if (!shuttingDown && label === "NEXT-WEB") {
      // If Next.js web crashes, exit so Render knows to restart the service
      process.exit(code ?? 1);
    }
  });
}

// 1. Start Next.js web application
console.log(`[RENDER] Spawning Next.js server on ${host}:${port}...`);
const nextBin = path.join(webDir, "node_modules", "next", "dist", "bin", "next");
const nextChild = spawn(process.execPath, [nextBin, "start", "-H", host, "-p", port], {
  cwd: webDir,
  env: { ...process.env, PORT: port, HOST: host },
  stdio: ["ignore", "pipe", "pipe"],
});
registerProcess(nextChild, "NEXT-WEB");

// 2. Start Telegram Market Bot & Schedule Runner
if (process.env.TELEGRAM_BOT_TOKEN) {
  console.log("[RENDER] Spawning Telegram Market Bot & Schedule Runner...");
  const botChild = spawn(process.execPath, ["--no-warnings", "--import", "tsx", "scripts/run-telegram-market-bot.ts"], {
    cwd: webDir,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  registerProcess(botChild, "BOT-RUNNER");
} else {
  console.warn("[RENDER] WARNING: TELEGRAM_BOT_TOKEN not configured; skipping bot runner.");
}

// Graceful termination
const shutdown = (sig) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[RENDER] Received ${sig}, shutting down child processes...`);
  for (const c of children) {
    try {
      c.kill(sig);
    } catch {}
  }
  setTimeout(() => process.exit(0), 4000);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
