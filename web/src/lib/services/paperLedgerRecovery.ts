import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { PaperTrade, PaperTradeEvent } from "../paperTypes.ts";

export interface QuarantineIncident {
  incidentId: string;
  timestamp: string;
  reason: string;
  corruptedFiles: string[];
  fileHashes: Record<string, string>;
  recoveryState: "LOCKED_ADMIN_ONLY" | "RECOVERY_SUSPECT";
  reconciliationRequired: boolean;
}

export interface PaperLedgerCheckpointMeta {
  schemaVersion: "1.0.0";
  snapshotVersion: number;
  timestamp: string;
  tradesCount: number;
  appliedEventIds: string[];
  tradesChecksum: string;
  checkpointChecksum: string;
}

export interface SentinelData {
  schemaVersion: "1.0.0";
  ledgerId: string;
  initializedAtUtc: string;
  checksum: string;
}

const SENTINEL_FILENAME = ".ledger-ever-initialized";
const CHECKPOINT_FILENAME = "checkpoint.json";

/**
 * Computes canonical SHA-256 digest of any JSON-serializable object.
 */
export function computeSha256(data: unknown): string {
  const jsonStr = typeof data === "string" ? data : JSON.stringify(data);
  return crypto.createHash("sha256").update(jsonStr, "utf8").digest("hex");
}

/**
 * Computes SHA-256 of an event excluding its checksum field.
 */
export function computeEventChecksum(event: PaperTradeEvent): string {
  const clone = { ...event };
  delete clone.checksum;
  return computeSha256(clone);
}

/**
 * Returns sentinel file path.
 */
export function getSentinelPath(dir: string): string {
  return path.join(dir, SENTINEL_FILENAME);
}

/**
 * Validates or initializes the sentinel file.
 * Returns null if sentinel is valid, or an error string if invalid / data loss detected.
 */
export function evaluateSentinel(dir: string, filesPresent: boolean): { ok: boolean; error: string | null; isFirstInit: boolean } {
  const sentinelPath = getSentinelPath(dir);
  const exists = fs.existsSync(sentinelPath);

  if (!exists && !filesPresent) {
    // Virgin startup. Clean first initialization.
    return { ok: true, error: null, isFirstInit: true };
  }

  if (!exists && filesPresent) {
    // Legacy upgrade state: files exist from earlier versions without sentinel.
    // Create sentinel once state is proven valid.
    return { ok: true, error: null, isFirstInit: false };
  }

  if (exists && !filesPresent) {
    // Sentinel exists but all trades/event files are missing!
    // Historical data loss disaster! Fail closed.
    return {
      ok: false,
      error: "DATA_LOSS_DISASTER: Sentinel .ledger-ever-initialized exists but trades.json and events.jsonl are missing; refusing to recreate empty ledger; manual reconciliation required",
      isFirstInit: false,
    };
  }

  // Sentinel exists and files exist. Validate sentinel content.
  try {
    const raw = fs.readFileSync(sentinelPath, "utf8");
    const parsed = JSON.parse(raw) as SentinelData;
    if (parsed.schemaVersion !== "1.0.0" || !parsed.ledgerId || !parsed.initializedAtUtc) {
      return {
        ok: false,
        error: "CORRUPT_SENTINEL: .ledger-ever-initialized is malformed; state LOCKED_ADMIN_ONLY",
        isFirstInit: false,
      };
    }
    const expectedHash = computeSha256({
      schemaVersion: parsed.schemaVersion,
      ledgerId: parsed.ledgerId,
      initializedAtUtc: parsed.initializedAtUtc,
    });
    if (parsed.checksum !== expectedHash) {
      return {
        ok: false,
        error: "CORRUPT_SENTINEL_CHECKSUM: .ledger-ever-initialized checksum mismatch; state LOCKED_ADMIN_ONLY",
        isFirstInit: false,
      };
    }
    return { ok: true, error: null, isFirstInit: false };
  } catch {
    return {
      ok: false,
      error: "CORRUPT_SENTINEL_UNREADABLE: .ledger-ever-initialized cannot be parsed; state LOCKED_ADMIN_ONLY",
      isFirstInit: false,
    };
  }
}

/**
 * Creates the sentinel file durably.
 */
export function writeSentinel(dir: string, ledgerId = "upstox-paper-ledger"): void {
  fs.mkdirSync(dir, { recursive: true });
  const sentinelPath = getSentinelPath(dir);
  if (fs.existsSync(sentinelPath)) return;

  const now = new Date().toISOString();
  const base = {
    schemaVersion: "1.0.0" as const,
    ledgerId,
    initializedAtUtc: now,
  };
  const sentinelData: SentinelData = {
    ...base,
    checksum: computeSha256(base),
  };

  const tmpPath = `${sentinelPath}.tmp-${process.pid}-${Date.now()}`;
  const fd = fs.openSync(tmpPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR, 0o600);
  fs.writeFileSync(fd, JSON.stringify(sentinelData, null, 2) + "\n", "utf8");
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  fs.renameSync(tmpPath, sentinelPath);
}

/**
 * Quarantines corrupt or ambiguous ledger files into .corrupt/<incidentId>_<timestamp>/
 * Never guesses or silently discards uncertain financial state.
 */
export function quarantineCorruptLedger(
  dir: string,
  reason: string,
  filenames: string[]
): QuarantineIncident {
  const incidentId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const stampSafe = timestamp.replace(/[:.]/g, "-");
  const corruptDir = path.join(dir, ".corrupt", `${stampSafe}_${incidentId.slice(0, 8)}`);
  fs.mkdirSync(corruptDir, { recursive: true });

  const fileHashes: Record<string, string> = {};
  const quarantinedFiles: string[] = [];

  for (const filename of filenames) {
    const srcPath = path.join(dir, filename);
    if (fs.existsSync(srcPath)) {
      const destPath = path.join(corruptDir, `${filename}.corrupt`);
      const content = fs.readFileSync(srcPath);
      fileHashes[filename] = crypto.createHash("sha256").update(content).digest("hex");
      fs.copyFileSync(srcPath, destPath);
      quarantinedFiles.push(filename);
    }
  }

  const incident: QuarantineIncident = {
    incidentId,
    timestamp,
    reason,
    corruptedFiles: quarantinedFiles,
    fileHashes,
    recoveryState: "LOCKED_ADMIN_ONLY",
    reconciliationRequired: true,
  };

  fs.writeFileSync(
    path.join(corruptDir, "incident.json"),
    JSON.stringify(incident, null, 2) + "\n",
    "utf8"
  );

  return incident;
}

/**
 * Applies a single event to the trades state idempotently.
 * If the event was already applied (evaluated by eventId or identical sequence), it returns skipped: true.
 */
export function applyLedgerEvent(
  trades: PaperTrade[],
  event: PaperTradeEvent,
  appliedEventIds: Set<string>
): { trades: PaperTrade[]; applied: boolean; skipped: boolean } {
  const eventId = event.eventId;
  if (eventId && appliedEventIds.has(eventId)) {
    return { trades, applied: false, skipped: true };
  }

  const updatedTrades = [...trades];
  const idx = updatedTrades.findIndex((t) => t.id === event.tradeId);
  let applied = false;

  switch (event.event) {
    case "PAPER_TRADE_OPENED": {
      if (idx >= 0) {
        // Trade already recorded in snapshot, ensure OPEN
        const trade = { ...updatedTrades[idx]! };
        trade.status = "OPEN";
        updatedTrades[idx] = trade;
        applied = true;
      } else if (event.details?.trade) {
        // Reconstruct from event details if trade payload was preserved
        updatedTrades.push(event.details.trade as PaperTrade);
        applied = true;
      }
      break;
    }

    case "PAPER_TRADE_EXITED":
    case "PAPER_TRADE_EXPIRED": {
      if (idx >= 0) {
        const trade = { ...updatedTrades[idx]! };
        trade.status = event.event === "PAPER_TRADE_EXPIRED" ? "EXPIRED" : "CLOSED";
        trade.exitTimestamp = event.timestamp;
        if (event.price != null) trade.exitPrice = event.price;
        if (typeof event.details?.realizedPnL === "number") {
          trade.realizedPnL = event.details.realizedPnL;
        }
        updatedTrades[idx] = trade;
        applied = true;
      }
      break;
    }

    case "PAPER_TRADE_SETTLEMENT_PENDING": {
      if (idx >= 0) {
        const trade = { ...updatedTrades[idx]! };
        trade.status = "SETTLEMENT_PENDING";
        updatedTrades[idx] = trade;
        applied = true;
      }
      break;
    }

    case "PAPER_TRADE_SETTLED_VERIFIED": {
      if (idx >= 0) {
        const trade = { ...updatedTrades[idx]! };
        trade.status = "SETTLED_VERIFIED";
        trade.exitTimestamp = event.timestamp;
        if (event.price != null) trade.exitPrice = event.price;
        if (typeof event.details?.realizedPnL === "number") {
          trade.realizedPnL = event.details.realizedPnL;
        }
        if (event.details?.settlement) {
          trade.settlement = event.details.settlement as PaperTrade["settlement"];
        }
        updatedTrades[idx] = trade;
        applied = true;
      }
      break;
    }

    case "PAPER_TRADE_SETTLEMENT_UNVERIFIED": {
      if (idx >= 0) {
        const trade = { ...updatedTrades[idx]! };
        trade.status = "SETTLEMENT_UNVERIFIED";
        updatedTrades[idx] = trade;
        applied = true;
      }
      break;
    }

    default:
      // Other monitoring/target-check events do not mutate trade status
      applied = false;
      break;
  }

  if (eventId) {
    appliedEventIds.add(eventId);
  }

  return { trades: updatedTrades, applied, skipped: false };
}

/**
 * Validates contiguous sequence numbering across an array of events.
 * If any gap or out-of-order sequence is detected, returns valid: false.
 */
export function validateEventSequenceContiguity(
  events: PaperTradeEvent[]
): { valid: boolean; gapAt?: number; error?: string } {
  let prevSeq: number | null = null;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    if (typeof ev.sequenceNumber !== "number") {
      // Legacy unnumbered event, acceptable if entire prefix is legacy
      continue;
    }

    if (prevSeq === null) {
      // First numbered event
      prevSeq = ev.sequenceNumber;
      continue;
    }

    if (ev.sequenceNumber !== prevSeq + 1) {
      return {
        valid: false,
        gapAt: i,
        error: `Sequence gap detected: expected sequenceNumber ${prevSeq + 1}, found ${ev.sequenceNumber} at index ${i}`,
      };
    }

    prevSeq = ev.sequenceNumber;
  }

  return { valid: true };
}

/**
 * Enriches events with durable identity (eventId, sequenceNumber, ledgerVersion, checksum).
 */
export function enrichDurableEvents(
  events: PaperTradeEvent[],
  startSequence = 1,
  ledgerVersion = 1
): PaperTradeEvent[] {
  let currentSeq = startSequence;
  return events.map((ev) => {
    const eventId = ev.eventId ?? crypto.randomUUID();
    const sequenceNumber = ev.sequenceNumber ?? currentSeq++;
    const version = ev.ledgerVersion ?? ledgerVersion;
    const enriched: PaperTradeEvent = {
      ...ev,
      eventId,
      sequenceNumber,
      ledgerVersion: version,
    };
    enriched.checksum = computeEventChecksum(enriched);
    return enriched;
  });
}

/**
 * Reads checkpoint metadata if present.
 */
export function readCheckpointMeta(dir: string): PaperLedgerCheckpointMeta | null {
  const file = path.join(dir, CHECKPOINT_FILENAME);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw) as PaperLedgerCheckpointMeta;
  } catch {
    return null;
  }
}

/**
 * Writes checkpoint metadata atomically.
 */
export function writeCheckpointMeta(
  dir: string,
  meta: PaperLedgerCheckpointMeta
): void {
  const file = path.join(dir, CHECKPOINT_FILENAME);
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  const fd = fs.openSync(tmp, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR, 0o600);
  fs.writeFileSync(fd, JSON.stringify(meta, null, 2) + "\n", "utf8");
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  fs.renameSync(tmp, file);
}
