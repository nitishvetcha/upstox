// Phase 1 — Immutable Signal Audit Log.
// Provides cryptographic provenance and tamper-evident audit trail for all evaluated signals
// and trade opportunities. Every evaluation is chained with SHA-256 checksums, recording
// the exact input market snapshot hash, Greeks, strike parameters, trade plan, and statutory costs.

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { Snapshot, UnderlyingId, TradePlan } from "../types.ts";
import {
  getExchangeProfile,
  costsForAsset,
  type ExchangeId,
  type StatutoryTaxType,
  type TradeCosts,
} from "./transactionCosts.ts";

export interface SignalAuditRecord {
  id: string; // "sig_<epoch>_<hex>"
  sequenceNumber: number;
  timestamp: string; // ISO
  underlying: UnderlyingId;
  exchange: ExchangeId;
  action: "SIGNAL_GENERATED" | "OPPORTUNITY_EVALUATED" | "RISK_FILTERED";
  spotPrice: number;
  snapshotHash: string; // SHA-256 digital fingerprint of input snapshot
  strategy: string;
  bias: string;
  regime: string;
  grade?: string;
  score: number;
  tradePlan: {
    strategy: string;
    legs: Array<{ side: "BUY" | "SELL"; type: "CE" | "PE"; strike: number; ltp: number }>;
    entry: number;
    stop: number;
    target1: number;
    target2: number;
    rr: number;
  } | null;
  estimatedCosts: TradeCosts & { exchange: ExchangeId; taxType: StatutoryTaxType };
  engineVersion: string;
  inputSnapshotSummary: {
    atmStrike: number;
    atmIv: number | null;
    pcrOi: number | null;
    lotSize: number | null;
    source: string;
    indicatorsAvailable: boolean;
  };
  blockers?: string[];
  previousChecksum: string; // Chained cryptographic hash
  checksum: string; // SHA-256 of the record content
}

export type SignalAuditInput = Omit<
  SignalAuditRecord,
  "id" | "sequenceNumber" | "previousChecksum" | "checksum" | "estimatedCosts" | "exchange"
> & {
  estimatedCosts?: TradeCosts & { exchange: ExchangeId; taxType: StatutoryTaxType };
  exchange?: ExchangeId;
};

export const signalAuditDir = () =>
  process.env.SIGNAL_AUDIT_DIR ?? path.join(process.cwd(), ".data", "signal-audit");
export const signalAuditLogFile = () => path.join(signalAuditDir(), "signals.jsonl");
export const signalAuditRecentFile = () => path.join(signalAuditDir(), "signals-recent.json");

/**
 * Computes a deterministic SHA-256 hash of the market snapshot inputs
 * to guarantee exact reproducibility of signal evaluation.
 */
export function hashSnapshotInputs(snapshot: Snapshot): string {
  const parts = [
    String(snapshot.index),
    String(snapshot.spot),
    String(snapshot.expiry),
    String(snapshot.strikeStep),
    String(snapshot.lotSize ?? "null"),
    String(snapshot.chain.length),
    String(snapshot.indicators?.rsi ?? "null"),
    String(snapshot.indicators?.ema9 ?? "null"),
    String(snapshot.indicators?.atr ?? "null"),
    String(snapshot.sources?.market?.source ?? "UNKNOWN"),
    String(snapshot.sources?.market?.fetchedAt ?? "null"),
  ];
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

function computeChecksum(recordWithoutChecksum: Record<string, unknown>): string {
  const canonical = JSON.stringify(recordWithoutChecksum, Object.keys(recordWithoutChecksum).sort());
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/**
 * Reads the latest sequence number and checksum from the immutable JSONL stream.
 */
function getLastRecordMeta(filePath: string): { sequenceNumber: number; checksum: string } {
  if (!fs.existsSync(filePath)) {
    return { sequenceNumber: 0, checksum: "GENESIS" };
  }
  const content = fs.readFileSync(filePath, "utf8").trim();
  if (!content) {
    return { sequenceNumber: 0, checksum: "GENESIS" };
  }
  const lines = content.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as SignalAuditRecord;
      if (typeof parsed.sequenceNumber === "number" && typeof parsed.checksum === "string") {
        return { sequenceNumber: parsed.sequenceNumber, checksum: parsed.checksum };
      }
    } catch {
      // Continue searching backwards if corruption exists
    }
  }
  return { sequenceNumber: 0, checksum: "GENESIS" };
}

/**
 * Persists an immutable signal audit record with cryptographic hash chaining.
 */
export function recordSignalAudit(input: SignalAuditInput): SignalAuditRecord {
  const dir = signalAuditDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const logFile = signalAuditLogFile();
  const lastMeta = getLastRecordMeta(logFile);
  const sequenceNumber = lastMeta.sequenceNumber + 1;
  const previousChecksum = lastMeta.checksum;

  const id = `sig_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const exchange = input.exchange ?? getExchangeProfile(input.underlying).exchangeId;

  // Derive estimated costs if not provided
  let estimatedCosts = input.estimatedCosts;
  if (!estimatedCosts) {
    const lotSize = input.inputSnapshotSummary.lotSize ?? 1;
    const entryPrice = input.tradePlan?.entry ?? 100;
    const fills = [
      { side: "BUY" as const, price: entryPrice, quantity: lotSize },
      { side: "SELL" as const, price: input.tradePlan?.target1 ?? entryPrice * 1.1, quantity: lotSize },
    ];
    estimatedCosts = costsForAsset(fills, input.underlying);
  }

  const payload: Omit<SignalAuditRecord, "checksum"> = {
    id,
    sequenceNumber,
    timestamp: input.timestamp || new Date().toISOString(),
    underlying: input.underlying,
    exchange,
    action: input.action,
    spotPrice: input.spotPrice,
    snapshotHash: input.snapshotHash,
    strategy: input.strategy,
    bias: input.bias,
    regime: input.regime,
    grade: input.grade,
    score: input.score,
    tradePlan: input.tradePlan,
    estimatedCosts,
    engineVersion: input.engineVersion,
    inputSnapshotSummary: input.inputSnapshotSummary,
    blockers: input.blockers,
    previousChecksum,
  };

  const checksum = computeChecksum(payload as unknown as Record<string, unknown>);
  const record: SignalAuditRecord = { ...payload, checksum };

  // Append to immutable stream
  fs.appendFileSync(logFile, JSON.stringify(record) + "\n", "utf8");

  // Maintain recent records index
  try {
    const recentFile = signalAuditRecentFile();
    let recent: SignalAuditRecord[] = [];
    if (fs.existsSync(recentFile)) {
      try {
        recent = JSON.parse(fs.readFileSync(recentFile, "utf8"));
      } catch {
        recent = [];
      }
    }
    recent.unshift(record);
    if (recent.length > 200) recent = recent.slice(0, 200);
    fs.writeFileSync(recentFile, JSON.stringify(recent, null, 2), "utf8");
  } catch {
    // Non-blocking for index update
  }

  return record;
}

/**
 * Retrieves audit records with optional filtering.
 */
export function getSignalAuditRecords(filter?: {
  underlying?: UnderlyingId;
  limit?: number;
  action?: string;
}): SignalAuditRecord[] {
  const logFile = signalAuditLogFile();
  if (!fs.existsSync(logFile)) return [];

  const lines = fs.readFileSync(logFile, "utf8").trim().split("\n");
  const records: SignalAuditRecord[] = [];

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const rec = JSON.parse(line) as SignalAuditRecord;
      if (filter?.underlying && rec.underlying !== filter.underlying) continue;
      if (filter?.action && rec.action !== filter.action) continue;
      records.push(rec);
      if (filter?.limit && records.length >= filter.limit) break;
    } catch {
      // Skip invalid lines
    }
  }

  return records;
}

/**
 * Verifies end-to-end cryptographic integrity of the audit log.
 * Validates sequence contiguity and verifies SHA-256 checksum chains.
 */
export function verifySignalAuditIntegrity(): {
  totalRecords: number;
  valid: boolean;
  error?: string;
} {
  const logFile = signalAuditLogFile();
  if (!fs.existsSync(logFile)) {
    return { totalRecords: 0, valid: true };
  }

  const lines = fs.readFileSync(logFile, "utf8").trim().split("\n");
  let prevChecksum = "GENESIS";
  let expectedSeq = 1;
  let count = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    let rec: SignalAuditRecord;
    try {
      rec = JSON.parse(line) as SignalAuditRecord;
    } catch {
      return { totalRecords: count, valid: false, error: `Malformed JSON at line ${i + 1}` };
    }

    if (rec.sequenceNumber !== expectedSeq) {
      return {
        totalRecords: count,
        valid: false,
        error: `Sequence mismatch at record ${rec.id}: expected ${expectedSeq}, got ${rec.sequenceNumber}`,
      };
    }

    if (rec.previousChecksum !== prevChecksum) {
      return {
        totalRecords: count,
        valid: false,
        error: `Cryptographic chain broken at record ${rec.id}: previousChecksum mismatch`,
      };
    }

    const { checksum, ...rest } = rec;
    const computed = computeChecksum(rest as Record<string, unknown>);
    if (computed !== checksum) {
      return {
        totalRecords: count,
        valid: false,
        error: `Tamper detected at record ${rec.id}: checksum hash mismatch`,
      };
    }

    prevChecksum = checksum;
    expectedSeq++;
    count++;
  }

  return { totalRecords: count, valid: true };
}

/**
 * Helper for tests to clean the test audit directory.
 */
export function clearSignalAuditForTesting(): void {
  const dir = signalAuditDir();
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
