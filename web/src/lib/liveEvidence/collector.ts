// Phase 9B Stage 2 — offline collector integration. Dependency-injected: no network, no real clock.
// The fetch function is supplied by the caller. Tests pass mocks only.
// Behaviour: one attempt per scheduled slot, no retries, stops on 401 (TOKEN_EXPIRY) and 429 (RATE_LIMIT).
import fs from "node:fs";
import path from "node:path";
import {
  writeSnapshotOnce, validateSnapshot, evaluateSession, recordFailure, sha256, scrub,
  type LegQuote, type SnapshotRecord, type SessionResult, type Verdict,
} from "./evidence.ts";

export interface PairSpec { index: string; expiry: string; strike: number; ce: string; pe: string }

export interface FetchResult { status: number; body: unknown; raw: string; retrievedAtUtc: string }
export type FetchFn = (instrumentKeys: string[]) => Promise<FetchResult>;

export interface SessionOptions {
  sessionDate: string; // IST date
  slots: string[]; // scheduled snapshot times, UTC ISO
  pairs: PairSpec[];
  dir: string; // evidence directory for this session
  fetch: FetchFn;
  calendarKnown: boolean;
  nowUtc: string; // collector start time: any unresolved slot earlier than this is recorded MISSING, never fetched
  rules: { maxStaleSec: number; maxSkewSec: number };
  accessToken?: string; // only used to verify it never appears in stored output
}

export interface SlotRow {
  slot: string;
  seq: number;
  status: "STORED" | "MISSING" | "REJECTED" | "FAILED" | "DUPLICATE" | "NOT_ATTEMPTED";
  verdict?: Verdict;
  httpStatus?: number | null;
  file?: string;
  sha256?: string;
  reason?: string;
}

export interface SessionSummary {
  rows: SlotRow[];
  stopped: null | "TOKEN_EXPIRY" | "RATE_LIMIT";
  evaluation: SessionResult;
}

export interface WebSocketStoreOptions {
  dir: string;
  record: SnapshotRecord;
  rawMessageBase64: string;
  rules: { maxStaleSec: number; maxSkewSec: number; maxQuoteAgeSec?: number };
}

// WebSocket counterpart to the REST storage path below. It deliberately accepts
// an already-decoded SnapshotRecord so transport and protobuf concerns remain
// injected/testable, while validation and write-once evidence behavior are shared.
export function storeWebSocketSnapshot(opts: WebSocketStoreOptions): SlotRow {
  if (opts.record.source !== "WEBSOCKET") throw new Error("expected a WEBSOCKET snapshot");
  const verdict = validateSnapshot(opts.record, opts.rules);
  const manifest = path.join(opts.dir, "manifest.jsonl");
  const failures = path.join(opts.dir, "failures.jsonl");
  let row: SlotRow;
  try {
    const written = writeSnapshotOnce(path.join(opts.dir, "snapshots"), opts.record, opts.rawMessageBase64);
    row = {
      slot: opts.record.snapshotTimeUtc,
      seq: opts.record.requestSeq,
      status: verdict.verdict === "REJECTED" ? "REJECTED" : "STORED",
      verdict: verdict.verdict,
      httpStatus: 200,
      file: written.file,
      sha256: written.sha256,
      reason: verdict.reasons.join("; ") || undefined,
    };
  } catch (error) {
    if (!/EEXIST/.test((error as Error).message)) throw error;
    row = {
      slot: opts.record.snapshotTimeUtc,
      seq: opts.record.requestSeq,
      status: "DUPLICATE",
      verdict: verdict.verdict,
      httpStatus: 200,
      reason: "write-once: file exists; not overwritten",
    };
    recordFailure(failures, {
      kind: "PARTIAL_SNAPSHOT",
      atUtc: opts.record.retrievedAtUtc,
      sessionDate: opts.record.sessionDate,
      requestSeq: opts.record.requestSeq,
      detail: "duplicate WebSocket snapshot refused",
    });
  }
  fs.mkdirSync(opts.dir, { recursive: true });
  fs.appendFileSync(manifest, JSON.stringify(row) + "\n");
  return row;
}

type DepthLevel = { price: number; quantity: number };
type QuoteEntry = {
  instrument_token?: unknown; last_price?: unknown; last_trade_time?: unknown; oi?: unknown; volume?: unknown;
  depth?: { buy?: unknown; sell?: unknown };
};

// Maps a Upstox V3 REST quote body to LegQuote records. Shape follows the mapping used in phase8-connectivity-test.ts.
export function parseQuotes(body: unknown, pairs: PairSpec[]): LegQuote[] {
  const data = ((body as { data?: Record<string, unknown> })?.data ?? {}) as Record<string, unknown>;
  const entries = Object.values(data) as Record<string, unknown>[];
  const legs: LegQuote[] = [];
  for (const p of pairs) {
    for (const [type, key] of [["CE", p.ce], ["PE", p.pe]] as const) {
      const e = entries.find((x) => x?.instrument_token === key) as QuoteEntry | undefined;
      const buy: DepthLevel[] = Array.isArray(e?.depth?.buy) ? (e?.depth?.buy as DepthLevel[]) : [];
      const sell: DepthLevel[] = Array.isArray(e?.depth?.sell) ? (e?.depth?.sell as DepthLevel[]) : [];
      legs.push({
        instrumentKey: key, index: p.index, expiry: p.expiry, strike: p.strike, optionType: type,
        bidPrice: buy[0]?.price ?? null, askPrice: sell[0]?.price ?? null,
        bidQty: buy[0]?.quantity ?? null, askQty: sell[0]?.quantity ?? null,
        bidDepth: buy.length ? buy : null, askDepth: sell.length ? sell : null,
        lastTradeTime: typeof e?.last_trade_time === "string" ? e.last_trade_time : null,
        lastPrice: typeof e?.last_price === "number" ? e.last_price : null,
        oi: typeof e?.oi === "number" ? e.oi : null,
        volume: typeof e?.volume === "number" ? e.volume : null,
      });
    }
  }
  return legs;
}

// Reads the manifest and returns slot times already resolved, so restart does not repeat them.
export function readManifest(file: string): SlotRow[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as SlotRow);
}

const RESOLVED = new Set(["STORED", "MISSING", "REJECTED", "DUPLICATE"]);

export async function collectSession(opts: SessionOptions): Promise<SessionSummary> {
  fs.mkdirSync(opts.dir, { recursive: true });
  const manifest = path.join(opts.dir, "manifest.jsonl");
  const failures = path.join(opts.dir, "failures.jsonl");
  const done = new Set(readManifest(manifest).filter((r) => RESOLVED.has(r.status)).map((r) => r.slot));
  const rows: SlotRow[] = [];
  let stopped: SessionSummary["stopped"] = null;
  const keys = opts.pairs.flatMap((p) => [p.ce, p.pe]);

  for (let i = 0; i < opts.slots.length; i++) {
    const slot = opts.slots[i];
    const seq = i + 1;
    if (done.has(slot)) continue; // restart: already resolved in an earlier run
    if (Date.parse(slot) < Date.parse(opts.nowUtc)) {
      // Missed while the collector was down: recorded, never backfilled.
      const row: SlotRow = { slot, seq, status: "MISSING", reason: "missed before restart; not backfilled" };
      rows.push(row); fs.appendFileSync(manifest, JSON.stringify(row) + "\n");
      recordFailure(failures, { kind: "SESSION_GAP", atUtc: slot, sessionDate: opts.sessionDate, requestSeq: seq, detail: "slot missed before restart" });
      continue;
    }
    if (stopped) {
      const row: SlotRow = { slot, seq, status: "NOT_ATTEMPTED", reason: `session stopped: ${stopped}` };
      rows.push(row); fs.appendFileSync(manifest, JSON.stringify(row) + "\n");
      continue;
    }

    let res: FetchResult;
    try {
      res = await opts.fetch(keys); // exactly one attempt per slot
    } catch (e) {
      const row: SlotRow = { slot, seq, status: "FAILED", httpStatus: null, reason: `network: ${(e as Error).name}` };
      rows.push(row); fs.appendFileSync(manifest, JSON.stringify(row) + "\n");
      recordFailure(failures, { kind: "NETWORK", atUtc: slot, sessionDate: opts.sessionDate, requestSeq: seq, detail: (e as Error).name });
      continue;
    }

    if (opts.accessToken && res.raw.includes(opts.accessToken)) {
      throw new Error("credential found in response body: refusing to store");
    }

    if (res.status === 401) {
      stopped = "TOKEN_EXPIRY";
      const row: SlotRow = { slot, seq, status: "FAILED", httpStatus: 401, reason: "token expired" };
      rows.push(row); fs.appendFileSync(manifest, JSON.stringify(row) + "\n");
      recordFailure(failures, { kind: "TOKEN_EXPIRY", atUtc: res.retrievedAtUtc, sessionDate: opts.sessionDate, requestSeq: seq, detail: "HTTP 401" });
      continue;
    }
    if (res.status === 429) {
      stopped = "RATE_LIMIT";
      const row: SlotRow = { slot, seq, status: "FAILED", httpStatus: 429, reason: "rate limited" };
      rows.push(row); fs.appendFileSync(manifest, JSON.stringify(row) + "\n");
      recordFailure(failures, { kind: "RATE_LIMIT", atUtc: res.retrievedAtUtc, sessionDate: opts.sessionDate, requestSeq: seq, detail: "HTTP 429" });
      continue;
    }
    if (res.status !== 200) {
      const row: SlotRow = { slot, seq, status: "FAILED", httpStatus: res.status, reason: `HTTP ${res.status}` };
      rows.push(row); fs.appendFileSync(manifest, JSON.stringify(row) + "\n");
      recordFailure(failures, { kind: "API_ERROR", atUtc: res.retrievedAtUtc, sessionDate: opts.sessionDate, requestSeq: seq, detail: scrub(`HTTP ${res.status}`) });
      continue;
    }

    const rec: SnapshotRecord = {
      sessionDate: opts.sessionDate, snapshotTimeUtc: slot, retrievedAtUtc: res.retrievedAtUtc,
      requestSeq: seq, httpStatus: res.status, source: "REST", legs: parseQuotes(res.body, opts.pairs),
    };
    const v = validateSnapshot(rec, opts.rules);
    const snapDir = path.join(opts.dir, "snapshots");
    let row: SlotRow;
    try {
      const w = writeSnapshotOnce(snapDir, rec, res.raw);
      row = { slot, seq, status: v.verdict === "REJECTED" ? "REJECTED" : "STORED", verdict: v.verdict, httpStatus: 200, file: w.file, sha256: w.sha256, reason: v.reasons.join("; ") || undefined };
    } catch (e) {
      if (/EEXIST/.test((e as Error).message)) {
        row = { slot, seq, status: "DUPLICATE", verdict: v.verdict, httpStatus: 200, reason: "write-once: file exists; not overwritten" };
        recordFailure(failures, { kind: "PARTIAL_SNAPSHOT", atUtc: slot, sessionDate: opts.sessionDate, requestSeq: seq, detail: "duplicate snapshot refused" });
      } else throw e;
    }
    rows.push(row!); fs.appendFileSync(manifest, JSON.stringify(row!) + "\n");
  }

  const final = readManifest(manifest);
  const outcomes = final.map((r) => {
    const v = r.verdict ?? "REJECTED";
    return { verdict: v as Verdict, pairedValid: r.verdict === "VALID" };
  });
  const gaps: number[] = [];
  let run = 0;
  for (const r of final) {
    if (r.status === "STORED" || r.status === "DUPLICATE") { if (run) gaps.push(run * 5); run = 0; }
    else run++;
  }
  if (run) gaps.push(run * 5);
  const evaluation = evaluateSession(outcomes, opts.slots.length, gaps, opts.calendarKnown);
  fs.writeFileSync(path.join(opts.dir, "session-summary.json"), JSON.stringify({ sessionDate: opts.sessionDate, stopped, evaluation, expectedSnapshots: opts.slots.length, manifestSha256: sha256(fs.readFileSync(manifest, "utf8")) }, null, 2), { flag: "w" });
  return { rows: final, stopped, evaluation };
}

// Scheduled slots for an IST session: 09:15 to 15:30 every 5 minutes, converted to UTC ISO.
export function sessionSlots(istDate: string): string[] {
  const out: string[] = [];
  for (let m = 9 * 60 + 15; m <= 15 * 60 + 30; m += 5) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    const utc = new Date(Date.parse(`${istDate}T${hh}:${mm}:00+05:30`)).toISOString();
    out.push(utc);
  }
  return out;
}
