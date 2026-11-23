// Phase 4+ — Autonomous Telegram Market Scheduler & Tracked Options Bot Runner.
// Runs continuously during market sessions:
// 1. Keeps Mac awake during market hours using caffeinate.
// 2. Polls Telegram updates every 2 seconds for button clicks ([📌 Save & Track Option], [❌ Untrack]) and commands (/picks, /clear, /status).
// 3. Executes market scans at 09:35, 09:45, and every 30m thereafter up to 15:15 IST.
// 4. Monitors active tracked options and sends real-time risk updates (Hold / Trail Stop / Cut).
// 5. Automatically triggers intraday close & settlement review at 15:15 IST.

import { spawn } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { telegramBotListener } from "../src/lib/services/telegramBotListener.ts";
import { marketScheduleRunner } from "../src/lib/services/marketScheduleRunner.ts";
import { getNotificationConfig, sendTelegramMessage } from "../src/lib/services/notificationService.ts";
import { listTrackedPicks } from "../src/lib/services/trackedPicksStore.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, "..");
process.chdir(webDir);

// Auto-load .env.local if not already in process.env
const envLocalPath = path.join(webDir, ".env.local");
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  }
}

function getIstTimeStr(d = new Date()): string {
  return d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) + " IST";
}

async function verifyBotConnection(): Promise<boolean> {
  const cfg = getNotificationConfig();
  if (!cfg.telegramBotToken) {
    console.error("[BOT-RUNNER] ERROR: TELEGRAM_BOT_TOKEN is not configured.");
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.telegramBotToken}/getMe`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(`[BOT-RUNNER] Telegram API /getMe returned HTTP ${res.status}`);
      return false;
    }
    const data = await res.json() as { ok: boolean; result?: { username: string; first_name: string } };
    if (data.ok && data.result) {
      console.log(`[BOT-RUNNER] Connected to Telegram Bot: @${data.result.username} (${data.result.first_name})`);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`[BOT-RUNNER] Connection check failed: ${(err as Error).message}`);
    return false;
  }
}

async function main() {
  console.log("==================================================================");
  console.log("  UPSTOX OPTIONS ANALYZER — TELEGRAM MARKET BOT & RISK RUNNER");
  console.log("==================================================================");
  console.log(`[BOT-RUNNER] Process PID: ${process.pid}`);
  console.log(`[BOT-RUNNER] Local Time: ${new Date().toISOString()} | IST Time: ${getIstTimeStr()}`);

  // 1. macOS caffeinate to prevent sleep during market hours
  if (process.platform === "darwin") {
    try {
      spawn("/usr/bin/caffeinate", ["-i", "-w", String(process.pid)], {
        stdio: "ignore",
        detached: true,
      }).unref();
      console.log(`[BOT-RUNNER] macOS caffeinate active (PID ${process.pid}) — system sleep prevented.`);
    } catch (e) {
      console.warn(`[BOT-RUNNER] Could not spawn caffeinate: ${(e as Error).message}`);
    }
  }

  // 2. Verify bot credentials
  const ready = await verifyBotConnection();
  if (!ready) {
    console.error("[BOT-RUNNER] Failed to connect to Telegram. Please check TELEGRAM_BOT_TOKEN in .env.local.");
    process.exit(1);
  }

  const cfg = getNotificationConfig();
  console.log(`[BOT-RUNNER] Notifications Enabled: ${cfg.enabled}`);
  console.log(`[BOT-RUNNER] Target Chat IDs: ${cfg.telegramChatId || "(none)"}`);
  console.log(`[BOT-RUNNER] Minimum Alert Grade: ${cfg.minGrade}`);
  console.log("[BOT-RUNNER] Schedule: 09:35 IST, 09:45 IST, and every 30m until 15:15 IST (Mon–Fri).");
  console.log("[BOT-RUNNER] Starting autonomous poll & schedule loop...\n");

  let isStopping = false;
  const stop = () => {
    if (isStopping) return;
    isStopping = true;
    console.log("\n[BOT-RUNNER] Stopping Telegram Market Bot runner...");
    process.exit(0);
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  // 3. Telegram polling loop (every 2 seconds)
  let pollRunning = false;
  const pollInterval = setInterval(async () => {
    if (pollRunning || isStopping) return;
    pollRunning = true;
    try {
      await telegramBotListener.pollOnce();
    } catch (err) {
      console.error(`[BOT-RUNNER] Telegram poll error: ${(err as Error).message}`);
    } finally {
      pollRunning = false;
    }
  }, 2000);

  // 4. Market schedule & risk monitoring tick (every 20 seconds)
  let tickRunning = false;
  let lastHeartbeatMinute = -1;

  const tickInterval = setInterval(async () => {
    if (tickRunning || isStopping) return;
    tickRunning = true;
    try {
      const now = new Date();
      const res = await marketScheduleRunner.tick(now);
      if (res.ranScan) {
        console.log(`[BOT-RUNNER] [${getIstTimeStr(now)}] Triggered scheduled scan: ${res.label}`);
      }

      // Heartbeat log every 15 minutes
      const istMinutes = (now.getUTCMinutes() + 30) % 60;
      if (istMinutes % 15 === 0 && istMinutes !== lastHeartbeatMinute) {
        lastHeartbeatMinute = istMinutes;
        const activeCount = listTrackedPicks(true).length;
        console.log(`[BOT-RUNNER] [${getIstTimeStr(now)}] Heartbeat active · Active Tracked Picks: ${activeCount}`);
      }
    } catch (err) {
      console.error(`[BOT-RUNNER] Schedule tick error: ${(err as Error).message}`);
    } finally {
      tickRunning = false;
    }
  }, 20000);

  // Run initial tick immediately
  await marketScheduleRunner.tick(new Date()).catch(() => {});
}

main().catch((err) => {
  console.error(`[BOT-RUNNER] Fatal error: ${(err as Error).stack || err}`);
  process.exit(1);
});
