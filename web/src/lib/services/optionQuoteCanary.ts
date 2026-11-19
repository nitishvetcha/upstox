// Phase 2.3.15 — Passive Option Quote Freshness Canary Architecture
//
// STRICTLY PASSIVE / DIAGNOSTIC ONLY:
// - Disabled by default (OPTION_QUOTE_CANARY_ENABLED !== "true").
// - Completely isolated from opportunity collection and paper trading.
// - Zero calls to savePaperOpportunity or PaperTradingEngine.
// - Zero broker order placement.
// - Zero writes to .data/paper-trades/, .data/settlement/, or .data/paper-opportunities/.
// - Diagnostic logs written ONLY to dedicated destination: logs/quote-canary-<date>.jsonl.
// - Max 20 contract keys per request, >= 131 ms spacing, concurrency locked.

import * as fs from "node:fs";
import * as path from "node:path";
import type { IndexId, OptionRow } from "../types.ts";
import { marketStatus } from "../time.ts";
import { verifyCurrentCredential } from "./upstoxAuth.ts";
import {
  isOptionQuoteCanaryEnabled,
  extractEvaluationKeys,
  buildChainLTTAudit,
  BATCH_SIZE,
  MIN_REQUEST_SPACING_MS,
  type ChainLTTAudit,
} from "./optionContractLTT.ts";

export interface CanaryRunResult {
  status: "EXECUTED" | "DISABLED" | "REJECTED_AUTH" | "REJECTED_MARKET" | "LOCKED" | "ERROR";
  reason: string;
  timestamp: string;
  audit: ChainLTTAudit | null;
  keysRequested: number;
  durationMs: number;
}

// Concurrency lock: prevent parallel or overlapping canary runs
let canaryRunning = false;
let lastCanaryRequestTime = 0;

export function isCanaryRunning(): boolean {
  return canaryRunning;
}

export function canaryLogDir(): string {
  return process.env.CANARY_LOG_DIR ?? path.join(process.cwd(), "logs");
}

export function writeCanaryDiagnostic(result: CanaryRunResult): void {
  const dir = canaryLogDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    const ymd = result.timestamp.slice(0, 10);
    const logPath = path.join(dir, `quote-canary-${ymd}.jsonl`);
    fs.appendFileSync(logPath, JSON.stringify(result) + "\n", "utf8");
  } catch (err) {
    console.error("[CANARY] Failed to write diagnostic log:", (err as Error).message);
  }
}

/**
 * Execute a passive diagnostic quote freshness sampling pass.
 * Fails closed and aborts immediately if:
 * 1. OPTION_QUOTE_CANARY_ENABLED is not explicitly "true".
 * 2. Another canary pass is currently active.
 * 3. Market is not OPEN.
 * 4. Upstox token is not VALID.
 *
 * This function NEVER writes to paper stores, places broker orders, or touches settlement records.
 */
export async function runPassiveCanarySample(
  rows: OptionRow[],
  spot: number,
  index: IndexId,
  token: string,
  now = new Date(),
  deps: {
    checkAuth?: () => Promise<{ status: string }>;
    checkMarket?: () => string;
    logWriter?: (res: CanaryRunResult) => void;
    fetchAudit?: (filteredRows: OptionRow[], spot: number, index: IndexId, token: string, now: Date) => Promise<ChainLTTAudit>;
  } = {},
): Promise<CanaryRunResult> {
  const start = Date.now();
  const timestamp = now.toISOString();

  // 1. Feature flag guard
  if (!isOptionQuoteCanaryEnabled()) {
    const res: CanaryRunResult = {
      status: "DISABLED",
      reason: "OPTION_QUOTE_CANARY_ENABLED is false. Canary is disabled by default.",
      timestamp,
      audit: null,
      keysRequested: 0,
      durationMs: Date.now() - start,
    };
    return res;
  }

  // 2. Concurrency lock
  if (canaryRunning) {
    const res: CanaryRunResult = {
      status: "LOCKED",
      reason: "Another canary run is currently in progress. Concurrent execution blocked.",
      timestamp,
      audit: null,
      keysRequested: 0,
      durationMs: Date.now() - start,
    };
    return res;
  }

  // 3. Market status check
  const mStatus = deps.checkMarket ? deps.checkMarket() : marketStatus(now);
  if (mStatus !== "OPEN") {
    const res: CanaryRunResult = {
      status: "REJECTED_MARKET",
      reason: `Market status is ${mStatus}. Canary sampling only permitted during OPEN market.`,
      timestamp,
      audit: null,
      keysRequested: 0,
      durationMs: Date.now() - start,
    };
    return res;
  }

  // 4. Authentication status check
  // The canary needs a verified connection: a configured-but-unverified credential is verified here, not assumed.
  const auth = deps.checkAuth ? await deps.checkAuth() : await verifyCurrentCredential(now);
  if (auth.status !== "VERIFIED_CONNECTED") {
    const res: CanaryRunResult = {
      status: "REJECTED_AUTH",
      reason: `Upstox authentication status is ${auth.status}. A verified connection is required for canary.`,
      timestamp,
      audit: null,
      keysRequested: 0,
      durationMs: Date.now() - start,
    };
    return res;
  }

  // Acquire lock
  canaryRunning = true;
  try {
    // 5. Rate limit spacing guard (≥ 131 ms since last call)
    const elapsed = Date.now() - lastCanaryRequestTime;
    if (elapsed < MIN_REQUEST_SPACING_MS) {
      await new Promise((r) => setTimeout(r, MIN_REQUEST_SPACING_MS - elapsed));
    }
    lastCanaryRequestTime = Date.now();

    // 6. Contract key extraction with defensive limit (max BATCH_SIZE = 20 keys)
    const allKeys = extractEvaluationKeys(rows, spot);
    const cappedKeys = allKeys.slice(0, BATCH_SIZE);

    // Filter rows to only the capped universe
    const cappedKeySet = new Set(cappedKeys);
    const filteredRows = rows.filter((r) =>
      (r.call.instrumentKey && cappedKeySet.has(r.call.instrumentKey)) ||
      (r.put.instrumentKey && cappedKeySet.has(r.put.instrumentKey)),
    );

    const auditFetcher = deps.fetchAudit ?? buildChainLTTAudit;
    const audit = await auditFetcher(filteredRows, spot, index, token, now);

    const res: CanaryRunResult = {
      status: "EXECUTED",
      reason: "Passive canary audit completed successfully.",
      timestamp,
      audit,
      keysRequested: cappedKeys.length,
      durationMs: Date.now() - start,
    };

    const writer = deps.logWriter ?? writeCanaryDiagnostic;
    writer(res);
    return res;
  } catch (err) {
    const res: CanaryRunResult = {
      status: "ERROR",
      reason: (err as Error).message ?? "Unknown canary execution error",
      timestamp,
      audit: null,
      keysRequested: 0,
      durationMs: Date.now() - start,
    };
    const writer = deps.logWriter ?? writeCanaryDiagnostic;
    writer(res);
    return res;
  } finally {
    canaryRunning = false;
  }
}
