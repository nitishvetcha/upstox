// Phase 4+ — Inter-Process Bot Heartbeat & Telemetry Store.
// Bridges the background BOT-RUNNER child process and the NEXT-WEB HTTP server.
// Uses atomic file writes (tmp + rename) to prevent torn reads.

import * as fs from "node:fs";
import * as path from "node:path";

export interface BotHeartbeatState {
  pid: number;
  bootedAt: string;
  lastHeartbeat: string;
  lastTickTimestamp: string;
  lastSlotExecuted: string | null;
  activeTrackedPicksCount: number;
  lastAlertDeliveredAt: string | null;
  status: "RUNNING" | "STOPPING" | "ERROR";
  consecutiveErrors: number;
  lastErrorMessage: string | null;
}

const heartbeatDir = () => process.env.HEARTBEAT_DIR || path.join(process.cwd(), ".data");
const heartbeatFile = () => path.join(heartbeatDir(), "bot-heartbeat.json");

let currentState: BotHeartbeatState | null = null;

/**
 * Called by BOT-RUNNER process on every tick to record vitality.
 */
export function recordBotHeartbeat(update: Partial<BotHeartbeatState>): BotHeartbeatState {
  const now = new Date().toISOString();
  if (!currentState) {
    currentState = {
      pid: process.pid,
      bootedAt: now,
      lastHeartbeat: now,
      lastTickTimestamp: now,
      lastSlotExecuted: null,
      activeTrackedPicksCount: 0,
      lastAlertDeliveredAt: null,
      status: "RUNNING",
      consecutiveErrors: 0,
      lastErrorMessage: null,
    };
  }

  currentState = {
    ...currentState,
    ...update,
    lastHeartbeat: now,
  };

  try {
    const dir = heartbeatDir();
    fs.mkdirSync(dir, { recursive: true });
    const targetFile = heartbeatFile();
    const tempFile = path.join(dir, `bot-heartbeat-${process.pid}-${Date.now()}.tmp`);

    fs.writeFileSync(tempFile, JSON.stringify(currentState, null, 2), "utf8");
    fs.renameSync(tempFile, targetFile);
  } catch (err) {
    // Non-fatal, but logged
    console.error(`[HEARTBEAT] Failed to write heartbeat file: ${(err as Error).message}`);
  }

  return currentState;
}

/**
 * Called by NEXT-WEB (/api/health) to inspect whether BOT-RUNNER is genuinely active.
 */
export function readBotHeartbeat(maxAgeSeconds = 60): {
  alive: boolean;
  state: BotHeartbeatState | null;
  ageSeconds: number;
  reason?: string;
} {
  try {
    const file = heartbeatFile();
    if (!fs.existsSync(file)) {
      return { alive: false, state: null, ageSeconds: -1, reason: "Heartbeat file not found (runner has not booted)" };
    }

    const raw = fs.readFileSync(file, "utf8");
    const state = JSON.parse(raw) as BotHeartbeatState;
    if (!state.lastHeartbeat) {
      return { alive: false, state: null, ageSeconds: -1, reason: "Invalid heartbeat structure" };
    }

    const lastTime = new Date(state.lastHeartbeat).getTime();
    const now = Date.now();
    const ageSeconds = Math.max(0, Math.round((now - lastTime) / 1000));

    if (state.status !== "RUNNING") {
      return { alive: false, state, ageSeconds, reason: `Runner status is ${state.status}` };
    }

    if (ageSeconds > maxAgeSeconds) {
      return {
        alive: false,
        state,
        ageSeconds,
        reason: `Runner heartbeat is stale (${ageSeconds}s old > ${maxAgeSeconds}s threshold)`,
      };
    }

    return { alive: true, state, ageSeconds };
  } catch (err) {
    return { alive: false, state: null, ageSeconds: -1, reason: `Failed to read heartbeat: ${(err as Error).message}` };
  }
}

/** Testing helper */
export function clearBotHeartbeat(): void {
  try {
    const file = heartbeatFile();
    if (fs.existsSync(file)) fs.unlinkSync(file);
    currentState = null;
  } catch {}
}
