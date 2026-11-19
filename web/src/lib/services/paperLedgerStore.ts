// Durable storage for the options paper-trading ledger (PaperTradingEngine).
// Stored under .data/paper-trades/ (override: PAPER_TRADES_DIR): isolated from .data/paper-opportunities/,
// .data/options-audit/ and .data/options-audit-research/. Never reads or writes those.
//
//   trades.json       full snapshot, written atomically (temp file + rename); previous good copy kept as trades.json.bak
//   events.jsonl      append-only audit trail; only new events are appended, existing lines are never rewritten
//
// Recovery rule: an unreadable ledger is NEVER replaced by an empty one. The engine is started in a blocked
// state that refuses new trades, and the unreadable file is left in place for inspection.
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { PaperTrade, PaperTradeEvent } from "../paperTypes.ts";
import {
  withPaperLedgerLock,
  cleanOrphanTempFiles,
} from "./paperLedgerLock.ts";
import {
  evaluateSentinel,
  quarantineCorruptLedger,
  validateEventSequenceContiguity,
  computeEventChecksum,
} from "./paperLedgerRecovery.ts";

export const paperLedgerDir = () => process.env.PAPER_TRADES_DIR ?? path.join(process.cwd(), ".data", "paper-trades");

// Number of valid (parseable) event lines already in events.jsonl, derived from the file on every save so it
// can never go stale if the directory is replaced, restored from backup or modified while the process runs.
function persistedEventLines(eventsFile: string): number {
  if (!fs.existsSync(eventsFile)) return 0;
  let n = 0;
  for (const line of fs.readFileSync(eventsFile, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { JSON.parse(line); n++; } catch { /* corrupt line: not counted, matches loadPaperLedger */ }
  }
  return n;
}

function stripDurableFields(e: PaperTradeEvent): Record<string, unknown> {
  const { eventId, sequenceNumber, ledgerVersion, checksum, ...rest } = e;
  return rest;
}

function sameEvent(a: PaperTradeEvent, b: PaperTradeEvent): boolean {
  if (JSON.stringify(a) === JSON.stringify(b)) return true;
  return JSON.stringify(stripDurableFields(a)) === JSON.stringify(stripDurableFields(b));
}

function validateEventSequence(trades: PaperTrade[], events: PaperTradeEvent[]): string | null {
  const byId = new Map(trades.map((t) => [t.id, t]));
  const opened = new Map<string, number>();
  const exited = new Map<string, number>();
  const settlementPending = new Map<string, number>();
  const settledVerified = new Map<string, number>();
  const settlementUnverified = new Map<string, number>();

  for (const event of events) {
    if (!byId.has(event.tradeId)) return `event references trade ${event.tradeId} absent from trades.json`;
    if (event.event === "PAPER_TRADE_OPENED") opened.set(event.tradeId, (opened.get(event.tradeId) ?? 0) + 1);
    if (event.event === "PAPER_TRADE_EXITED" || event.event === "PAPER_TRADE_EXPIRED") exited.set(event.tradeId, (exited.get(event.tradeId) ?? 0) + 1);
    if (event.event === "PAPER_TRADE_SETTLEMENT_PENDING") settlementPending.set(event.tradeId, (settlementPending.get(event.tradeId) ?? 0) + 1);
    if (event.event === "PAPER_TRADE_SETTLED_VERIFIED") settledVerified.set(event.tradeId, (settledVerified.get(event.tradeId) ?? 0) + 1);
    if (event.event === "PAPER_TRADE_SETTLEMENT_UNVERIFIED") settlementUnverified.set(event.tradeId, (settlementUnverified.get(event.tradeId) ?? 0) + 1);
  }

  for (const trade of trades) {
    if (opened.get(trade.id) !== 1) return `trade ${trade.id} does not have exactly one open event`;
    const exits = exited.get(trade.id) ?? 0;
    const pendingEvents = settlementPending.get(trade.id) ?? 0;
    const verifiedEvents = settledVerified.get(trade.id) ?? 0;
    const unverifiedEvents = settlementUnverified.get(trade.id) ?? 0;

    if (trade.status === "SETTLEMENT_PENDING") {
      if (pendingEvents !== 1) return `settlement pending trade ${trade.id} must have exactly one settlement pending event, got ${pendingEvents}`;
      if (verifiedEvents !== 0) return `settlement pending trade ${trade.id} has settled verified event`;
      if (exits !== 0) return `settlement pending trade ${trade.id} has an exit event`;
      if (trade.exitTimestamp != null || trade.exitPrice != null || trade.realizedPnL != null) {
        return `settlement pending trade ${trade.id} cannot carry exit timestamp, exit price, or realized P&L`;
      }
      continue;
    }

    if (trade.status === "SETTLEMENT_UNVERIFIED") {
      if (pendingEvents < 1) return `settlement unverified trade ${trade.id} missing settlement pending event`;
      if (unverifiedEvents < 1) return `settlement unverified trade ${trade.id} missing settlement unverified event`;
      if (verifiedEvents !== 0) return `settlement unverified trade ${trade.id} has settled verified event`;
      if (exits !== 0) return `settlement unverified trade ${trade.id} has an exit event`;
      if (trade.exitTimestamp != null || trade.exitPrice != null || trade.realizedPnL != null) {
        return `settlement unverified trade ${trade.id} cannot carry exit timestamp, exit price, or realized P&L`;
      }
      continue;
    }

    if (trade.status === "SETTLED_VERIFIED") {
      if (pendingEvents !== 1) return `settled verified trade ${trade.id} must have exactly one settlement pending event, got ${pendingEvents}`;
      if (verifiedEvents !== 1) return `settled verified trade ${trade.id} must have exactly one settled verified event, got ${verifiedEvents}`;
      if (exits !== 0) return `settled verified trade ${trade.id} has an exit event`;
      if (trade.exitTimestamp == null || trade.exitPrice == null || trade.realizedPnL == null) {
        return `settled verified trade ${trade.id} missing exit timestamp, exit price, or realized P&L`;
      }
      if (!trade.settlement) {
        return `settled verified trade ${trade.id} missing settlement provenance metadata`;
      }
      continue;
    }

    const legacyTerminal = trade.status === "CLOSED" || trade.status === "TARGET_HIT" || trade.status === "STOPPED_OUT" || trade.status === "EXPIRED";
    if (legacyTerminal && exits !== 1) return `terminal trade ${trade.id} does not have exactly one exit event`;
    if (!legacyTerminal && exits !== 0) return `open trade ${trade.id} has an exit event`;
    if (legacyTerminal && verifiedEvents !== 0) return `terminal trade ${trade.id} has conflicting settled verified event`;
    if (!legacyTerminal && (pendingEvents !== 0 || verifiedEvents !== 0 || unverifiedEvents !== 0)) {
      return `open trade ${trade.id} has unexpected settlement events`;
    }
  }
  return null;
}

function readPersistedEvents(eventsFile: string): { events: PaperTradeEvent[]; corruptLines: number } {
  const events: PaperTradeEvent[] = [];
  let corruptLines = 0;
  if (!fs.existsSync(eventsFile)) return { events, corruptLines };
  for (const line of fs.readFileSync(eventsFile, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line) as PaperTradeEvent); } catch { corruptLines++; }
  }
  return { events, corruptLines };
}

export interface LoadedLedger {
  trades: PaperTrade[];
  events: PaperTradeEvent[];
  corruptEventLines: number;
  recoveredFromBackup: boolean;
  // Set when the ledger exists but cannot be read. New trades must be refused.
  error: string | null;
}

function readJsonArray<T>(file: string): T[] | "MISSING" | "CORRUPT" {
  if (!fs.existsSync(file)) return "MISSING";
  try {
    const v = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(v) ? (v as T[]) : "CORRUPT";
  } catch {
    return "CORRUPT";
  }
}

export function loadPaperLedger(dir = paperLedgerDir()): LoadedLedger {
  const tradesFile = path.join(dir, "trades.json");
  const eventsFile = path.join(dir, "events.jsonl");

  let trades: PaperTrade[] = [];
  let recoveredFromBackup = false;
  let error: string | null = null;

  // 1. Evaluate Sentinel state machine (if present)
  const filesPresent = fs.existsSync(tradesFile) || fs.existsSync(eventsFile) || fs.existsSync(tradesFile + ".bak");
  const sentinelStatus = evaluateSentinel(dir, filesPresent);
  if (!sentinelStatus.ok) {
    return {
      trades: [],
      events: [],
      corruptEventLines: 0,
      recoveredFromBackup: false,
      error: sentinelStatus.error,
    };
  }

  // 2. Safely clean dead orphan temp files left by previous crashed processes
  cleanOrphanTempFiles(dir);

  // 3. Read trades snapshot
  const main = readJsonArray<PaperTrade>(tradesFile);
  if (main === "MISSING") {
    // Fresh ledger. If events exist without a snapshot the state cannot be trusted.
    if (fs.existsSync(eventsFile) && fs.statSync(eventsFile).size > 0 && !fs.existsSync(tradesFile + ".bak")) {
      error = "events.jsonl exists but trades.json is missing; refusing to start from an empty ledger";
    }
  } else if (main === "CORRUPT") {
    const bak = readJsonArray<PaperTrade>(tradesFile + ".bak");
    if (Array.isArray(bak)) {
      trades = bak;
      recoveredFromBackup = true;
    } else {
      error = "trades.json is unreadable and no valid trades.json.bak exists; file left untouched for inspection";
      quarantineCorruptLedger(dir, error, ["trades.json"]);
    }
  } else {
    trades = main;
  }

  // 4. Read persisted event log
  const { events, corruptLines: corruptEventLines } = readPersistedEvents(eventsFile);
  if (!error && corruptEventLines > 0) {
    error = `events.jsonl contains ${corruptEventLines} unreadable line(s); file left untouched for investigation`;
    quarantineCorruptLedger(dir, error, ["events.jsonl"]);
  }

  // 5. Validate consistency between trade snapshot and event sequence
  if (!error) error = validateEventSequence(trades, events);

  // 6. Validate sequence contiguity (detect sequence gaps in numbered events)
  if (!error) {
    const contiguity = validateEventSequenceContiguity(events);
    if (!contiguity.valid) {
      error = contiguity.error!;
      quarantineCorruptLedger(dir, error, ["events.jsonl"]);
    }
  }

  return { trades, events, corruptEventLines, recoveredFromBackup, error };
}

export function savePaperLedger(trades: PaperTrade[], events: PaperTradeEvent[], dir = paperLedgerDir()): void {
  withPaperLedgerLock(dir, () => {
    const consistencyError = validateEventSequence(trades, events);
    if (consistencyError) throw new Error(`ledger snapshot and event sequence disagree: ${consistencyError}`);
    fs.mkdirSync(dir, { recursive: true });
    const tradesFile = path.join(dir, "trades.json");
    const eventsFile = path.join(dir, "events.jsonl");

    // Append-only audit trail first: a crash after this leaves extra events, never missing ones.
    const { events: persisted, corruptLines } = readPersistedEvents(eventsFile);
    if (corruptLines > 0) throw new Error(`events.jsonl contains ${corruptLines} unreadable line(s); refusing to write`);
    if (persisted.length > events.length || persisted.some((event, i) => !sameEvent(event, events[i]!))) {
      throw new Error("events.jsonl does not match the expected ledger event sequence; refusing to write");
    }

    // Harmonize in-memory events with persisted durable identities
    for (let i = 0; i < persisted.length; i++) {
      const p = persisted[i]!;
      const e = events[i]!;
      if (p.eventId && !e.eventId) e.eventId = p.eventId;
      if (typeof p.sequenceNumber === "number" && typeof e.sequenceNumber !== "number") e.sequenceNumber = p.sequenceNumber;
      if (typeof p.ledgerVersion === "number" && typeof e.ledgerVersion !== "number") e.ledgerVersion = p.ledgerVersion;
      if (p.checksum && !e.checksum) e.checksum = p.checksum;
    }

    const done = persisted.length;
    if (events.length > done) {
      // Determine starting sequence number for new events
      const lastSeq = persisted.length > 0 && typeof persisted[persisted.length - 1]!.sequenceNumber === "number"
        ? persisted[persisted.length - 1]!.sequenceNumber!
        : persisted.length;
      let nextSeq = lastSeq + 1;

      // Assign durable event sourcing metadata
      for (let i = done; i < events.length; i++) {
        const ev = events[i]!;
        if (!ev.eventId) ev.eventId = crypto.randomUUID();
        if (typeof ev.sequenceNumber !== "number") ev.sequenceNumber = nextSeq++;
        if (typeof ev.ledgerVersion !== "number") ev.ledgerVersion = 1;
        if (!ev.checksum) ev.checksum = computeEventChecksum(ev);
      }

      const appendPayload = events.slice(done).map((e) => JSON.stringify(e)).join("\n") + "\n";
      fs.appendFileSync(eventsFile, appendPayload);
    }

    // Keep the previous good snapshot, then replace atomically.
    if (fs.existsSync(tradesFile) && Array.isArray(readJsonArray(tradesFile))) {
      fs.copyFileSync(tradesFile, tradesFile + ".bak");
    }
    const tmp = `${tradesFile}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(trades, null, 2));
    fs.renameSync(tmp, tradesFile);
  });
}
