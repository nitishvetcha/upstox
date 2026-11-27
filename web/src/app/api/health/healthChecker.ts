// Phase 4+ — Resilient Production System Health Checker
// Features:
// 1. Inter-Process Heartbeat Verification: verifies if BOT-RUNNER child process is genuinely alive.
// 2. Dynamic Strategy Integrity Verification: hashes src/lib/engine/strategy.ts on disk to detect tampering.
// 3. 60-Second Dependency Caching: prevents probe hammering against Telegram API /getMe.
// 4. Liveness Probe Isolation: supports immediate probe=liveness check with zero external I/O.

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { getNotificationConfig } from "../../../lib/services/notificationService.ts";
import { listTrackedPicks } from "../../../lib/services/trackedPicksStore.ts";
import { isScheduledScanTime, SCHEDULE_SLOTS } from "../../../lib/services/marketScheduleRunner.ts";
import { readBotHeartbeat, type BotHeartbeatState } from "../../../lib/services/botHeartbeat.ts";
import { upstoxCacheSize } from "../../../lib/services/cache.ts";
import { istToday, isTradingDay, marketStatus } from "../../../lib/time.ts";

export const FROZEN_STRATEGY_114_SHA256 = "d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18";

export interface TelegramHealthResult {
  configured: boolean;
  reachable: boolean;
  cached?: boolean;
  botUsername?: string;
  botName?: string;
  latencyMs?: number;
  lastCheckedAt: string;
  error?: string;
}

export interface BotRunnerHealthResult {
  alive: boolean;
  ageSeconds: number;
  state: BotHeartbeatState | null;
  reason?: string;
}

export interface SystemHealthReport {
  status: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  timestamp: string;
  istTime: string;
  botRunner: BotRunnerHealthResult;
  telegram: TelegramHealthResult;
  marketSchedule: {
    isMarketDay: boolean;
    isMarketHours: boolean;
    isScheduledSlot: boolean;
    currentSlot: string | null;
    slots: string[];
    activeTrackedPicksCount: number;
  };
  guardrails: {
    mode: "RESEARCH_ONLY";
    unattendedTradingAllowed: boolean;
    strategySha256: string;
    strategyTampered: boolean;
    tradingVerdict: "NO-GO";
  };
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    externalMb: number;
    arrayBuffersMb: number;
    upstoxCacheEntries: number;
  };
}

// 60-second in-memory dependency cache for Telegram API check
let cachedTelegramResult: TelegramHealthResult | null = null;
let lastTelegramCheckTime = 0;
const TELEGRAM_CACHE_TTL_MS = 60 * 1000;

export async function checkTelegramConnectivity(
  botToken?: string,
  forceRefresh = false,
): Promise<TelegramHealthResult> {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedTelegramResult &&
    now - lastTelegramCheckTime < TELEGRAM_CACHE_TTL_MS
  ) {
    return { ...cachedTelegramResult, cached: true };
  }

  if (!botToken) {
    const res: TelegramHealthResult = {
      configured: false,
      reachable: false,
      lastCheckedAt: new Date().toISOString(),
      error: "TELEGRAM_BOT_TOKEN not configured",
    };
    cachedTelegramResult = res;
    lastTelegramCheckTime = now;
    return res;
  }

  const start = Date.now();
  try {
    const apiRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
      signal: AbortSignal.timeout(3500),
    });
    const latencyMs = Date.now() - start;

    if (!apiRes.ok) {
      const res: TelegramHealthResult = {
        configured: true,
        reachable: false,
        latencyMs,
        lastCheckedAt: new Date().toISOString(),
        error: `Telegram API returned HTTP ${apiRes.status} (${apiRes.statusText})`,
      };
      cachedTelegramResult = res;
      lastTelegramCheckTime = now;
      return res;
    }

    const data = (await apiRes.json()) as {
      ok: boolean;
      result?: { username: string; first_name: string };
      description?: string;
    };

    if (data.ok && data.result) {
      const res: TelegramHealthResult = {
        configured: true,
        reachable: true,
        botUsername: data.result.username,
        botName: data.result.first_name,
        latencyMs,
        lastCheckedAt: new Date().toISOString(),
      };
      cachedTelegramResult = res;
      lastTelegramCheckTime = now;
      return res;
    }

    const res: TelegramHealthResult = {
      configured: true,
      reachable: false,
      latencyMs,
      lastCheckedAt: new Date().toISOString(),
      error: data.description || "Telegram API returned ok: false",
    };
    cachedTelegramResult = res;
    lastTelegramCheckTime = now;
    return res;
  } catch (err) {
    const res: TelegramHealthResult = {
      configured: true,
      reachable: false,
      latencyMs: Date.now() - start,
      lastCheckedAt: new Date().toISOString(),
      error: (err as Error).message,
    };
    cachedTelegramResult = res;
    lastTelegramCheckTime = now;
    return res;
  }
}

/**
 * Computes the runtime SHA-256 hash of the strategy engine source file on disk.
 */
export function verifyStrategyDiskHash(): { hash: string; matchesBaseline: boolean } {
  try {
    const strategyFile = path.resolve(process.cwd(), "src/lib/engine/strategy.ts");
    if (!fs.existsSync(strategyFile)) {
      // Fallback if running from web root or project root
      const altFile = path.resolve(process.cwd(), "web/src/lib/engine/strategy.ts");
      if (fs.existsSync(altFile)) {
        const content = fs.readFileSync(altFile);
        const hash = crypto.createHash("sha256").update(content).digest("hex");
        return { hash, matchesBaseline: hash === FROZEN_STRATEGY_114_SHA256 };
      }
      return { hash: "FILE_NOT_FOUND", matchesBaseline: false };
    }
    const content = fs.readFileSync(strategyFile);
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    return { hash, matchesBaseline: hash === FROZEN_STRATEGY_114_SHA256 };
  } catch {
    return { hash: "HASH_COMPUTATION_ERROR", matchesBaseline: false };
  }
}

export async function generateHealthReport(
  now = new Date(),
  forceRefresh = false,
): Promise<{ report: SystemHealthReport; statusCode: number }> {
  const cfg = getNotificationConfig();

  // 1. Verify Telegram API reachability (cached 60s)
  const telegramHealth = await checkTelegramConnectivity(cfg.telegramBotToken, forceRefresh);

  // 2. Verify background BOT-RUNNER liveness via IPC heartbeat
  const botHeartbeat = readBotHeartbeat(120);
  const botRunnerHealth: BotRunnerHealthResult = {
    alive: botHeartbeat.alive,
    ageSeconds: botHeartbeat.ageSeconds,
    state: botHeartbeat.state,
    reason: botHeartbeat.reason,
  };

  // 3. Verify Strategy 11.4 disk integrity hash
  const strategyCheck = verifyStrategyDiskHash();

  // 4. Check market schedule
  const scheduleCheck = isScheduledScanTime(now);
  const activePicks = listTrackedPicks(true);

  // Determine market day and session open status in IST
  const todayYmd = istToday(now);
  const isMarketDay = isTradingDay(todayYmd);
  const isMarketHours = marketStatus(now) === "OPEN";

  // 5. Determine Overall Status
  let overallStatus: "HEALTHY" | "DEGRADED" | "UNHEALTHY" = "HEALTHY";

  if (!strategyCheck.matchesBaseline) {
    // Strategy code altered on disk! Critical security/audit failure.
    overallStatus = "UNHEALTHY";
  } else if (cfg.enabled && !telegramHealth.reachable) {
    // Notifications required but Telegram API unreachable — keep 200 DEGRADED so Render does not kill the web container
    overallStatus = "DEGRADED";
  } else if (isMarketHours && cfg.enabled && !botRunnerHealth.alive) {
    // Market open but background runner heartbeat is lagging on constrained CPU — report DEGRADED (200) instead of triggering 503 restarts
    overallStatus = "DEGRADED";
  } else if (!cfg.enabled || !isMarketHours || !botRunnerHealth.alive) {
    // Outside market hours or bot running locally in dev mode: degraded/off-hours
    overallStatus = "DEGRADED";
  }

  const report: SystemHealthReport = {
    status: overallStatus,
    timestamp: now.toISOString(),
    istTime:
      now.toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour12: false,
      }) + " IST",
    botRunner: botRunnerHealth,
    telegram: telegramHealth,
    marketSchedule: {
      isMarketDay,
      isMarketHours,
      isScheduledSlot: scheduleCheck.isScheduled,
      currentSlot: scheduleCheck.label ?? null,
      slots: SCHEDULE_SLOTS.map((s) => s.label),
      activeTrackedPicksCount: activePicks.length,
    },
    guardrails: {
      mode: "RESEARCH_ONLY",
      unattendedTradingAllowed: false,
      strategySha256: strategyCheck.hash,
      strategyTampered: !strategyCheck.matchesBaseline,
      tradingVerdict: "NO-GO",
    },
    memory: (() => {
      const m = process.memoryUsage();
      const mb = (b: number) => Math.round((b / 1024 / 1024) * 10) / 10;
      return {
        rssMb: mb(m.rss),
        heapUsedMb: mb(m.heapUsed),
        heapTotalMb: mb(m.heapTotal),
        externalMb: mb(m.external),
        arrayBuffersMb: mb(m.arrayBuffers),
        upstoxCacheEntries: upstoxCacheSize(),
      };
    })(),
  };

  const statusCode = overallStatus === "UNHEALTHY" ? 503 : 200;
  return { report, statusCode };
}
