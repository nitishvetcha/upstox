// Phase 9A — offline live-evidence components: snapshot writer, validator, session evaluation, failure recorder.
// Pure logic plus file writes to a caller-supplied directory. No network. No token handling.
// Thresholds are explicit inputs. None of them is a validated production value.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type DepthLevel = { price: number; quantity: number };

export interface LegQuote {
  instrumentKey: string;
  index: string;
  expiry: string;
  strike?: number;
  optionType?: "CE" | "PE";
  lastPrice?: number | null;
  bidPrice?: number | null;
  askPrice?: number | null;
  bidQty?: number | null;
  askQty?: number | null;
  bidDepth?: DepthLevel[] | null;
  askDepth?: DepthLevel[] | null;
  lastTradeTime?: string | null;
  quoteTimeUtc?: string | null; // WebSocket per-message timestamp (currentTs). Not available from REST.
  oi?: number | null;
  volume?: number | null;
}

export interface SnapshotRecord {
  sessionDate: string; // IST date, YYYY-MM-DD
  snapshotTimeUtc: string;
  retrievedAtUtc: string;
  requestSeq: number;
  httpStatus: number;
  source: "REST" | "WEBSOCKET";
  legs: LegQuote[];
}

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

// ---- 1. Snapshot writer (write-once) ----

export function snapshotFileName(r: SnapshotRecord): string {
  return `${r.sessionDate}_${r.snapshotTimeUtc.replace(/:/g, "-")}_seq${r.requestSeq}.json`;
}

// Refuses to overwrite: flag "wx" throws EEXIST when the file already exists.
export function writeSnapshotOnce(dir: string, rec: SnapshotRecord, rawBody: string): { file: string; sha256: string } {
  fs.mkdirSync(dir, { recursive: true });
  const body = JSON.stringify({ schema: "snapshot-v1", record: rec, rawSha256: sha256(rawBody), raw: rawBody }, null, 2);
  const target = path.join(dir, snapshotFileName(rec));
  fs.writeFileSync(target, body, { flag: "wx" });
  return { file: target, sha256: sha256(body) };
}

// ---- 2. Validator ----

export interface Rules {
  maxStaleSec: number; // retained for callers; not used as a REST freshness verdict (owner decision, Phase 9B)
  maxSkewSec: number; // retrieval vs snapshot time skew
  maxQuoteAgeSec?: number; // WebSocket quote-message age; the 60-second rule from PHASE8_DATA_QUALITY_RULES
}

export type Verdict = "VALID" | "INCOMPLETE" | "REJECTED";

export interface LegCheck {
  instrumentKey: string;
  fresh: boolean | null; // null when last_trade_time is missing
  ageSec: number | null;
  populated: { bid: boolean; ask: boolean; bidQty: boolean; askQty: boolean; depth5: boolean };
  complete: boolean;
}

export function istFromUtc(utcIso: string) {
  const d = new Date(Date.parse(utcIso) + 5.5 * 3600e3);
  return { date: d.toISOString().slice(0, 10), hhmm: d.toISOString().slice(11, 16), dow: d.getUTCDay() };
}

// Session window 09:15 to 15:30 IST on weekdays. Holidays are not covered here (see calendar note in the audit).
export function inSessionIst(utcIso: string): boolean {
  const { hhmm, dow } = istFromUtc(utcIso);
  return dow >= 1 && dow <= 5 && hhmm >= "09:15" && hhmm <= "15:30";
}

// REST freshness proxy: age of last_trade_time at snapshot time. Not a quote-message age.
export function restFreshness(lastTradeTime: string | null | undefined, snapshotUtc: string, maxStaleSec: number) {
  if (!lastTradeTime) return { ageSec: null, fresh: null };
  const ageSec = (Date.parse(snapshotUtc) - Date.parse(lastTradeTime)) / 1000;
  return { ageSec, fresh: ageSec >= 0 && ageSec <= maxStaleSec };
}

const positive = (v: number | null | undefined) => typeof v === "number" && v > 0;

export function validateSnapshot(rec: SnapshotRecord, rules: Rules): { verdict: Verdict; reasons: string[]; legs: LegCheck[] } {
  const reasons: string[] = [];
  if (rec.httpStatus !== 200) return { verdict: "REJECTED", reasons: [`HTTP ${rec.httpStatus}`], legs: [] };
  if (!rec.legs.length) return { verdict: "REJECTED", reasons: ["no legs returned"], legs: [] };
  const skew = Math.abs(Date.parse(rec.retrievedAtUtc) - Date.parse(rec.snapshotTimeUtc)) / 1000;
  if (skew > rules.maxSkewSec) reasons.push(`clock skew ${skew.toFixed(1)}s above ${rules.maxSkewSec}s`);

  const legs: LegCheck[] = rec.legs.map((l) => {
    // REST: last-trade age is descriptive only. Quote freshness is UNKNOWN (fresh = null); an old last trade never rejects a leg.
    // WebSocket: fresh only if the per-message timestamp is within maxQuoteAgeSec (default 60 s).
    const lttAge = restFreshness(l.lastTradeTime, rec.snapshotTimeUtc, Infinity).ageSec;
    const quoteAge = l.quoteTimeUtc ? (Date.parse(rec.snapshotTimeUtc) - Date.parse(l.quoteTimeUtc)) / 1000 : null;
    const fresh: boolean | null = rec.source === "WEBSOCKET"
      ? (quoteAge !== null && quoteAge >= 0 && quoteAge <= (rules.maxQuoteAgeSec ?? 60))
      : null;
    const ageSec = rec.source === "WEBSOCKET" ? quoteAge : lttAge;
    const populated = {
      bid: positive(l.bidPrice),
      ask: positive(l.askPrice),
      bidQty: positive(l.bidQty),
      askQty: positive(l.askQty),
      depth5: (l.bidDepth?.length ?? 0) >= 5 && (l.askDepth?.length ?? 0) >= 5,
    };
    const complete = Object.values(populated).every(Boolean) && fresh !== false;
    if (fresh === false) reasons.push(`${l.instrumentKey}: stale or missing quote timestamp (${ageSec === null ? "none" : ageSec.toFixed(0) + "s"})`);
    if (!complete && fresh !== false) reasons.push(`${l.instrumentKey}: missing ${Object.entries(populated).filter(([, v]) => !v).map(([k]) => k).join(",")}`);
    return { instrumentKey: l.instrumentKey, fresh, ageSec, populated, complete };
  });
  const verdict: Verdict = legs.every((l) => l.complete) && skew <= rules.maxSkewSec ? "VALID" : "INCOMPLETE";
  return { verdict, reasons, legs };
}

// ---- 3. Session evaluation ----

export interface SnapshotOutcome { verdict: Verdict; pairedValid: boolean }

export interface SessionResult {
  status: "INCLUDED" | "EXCLUDED" | "HOLD";
  coverage: number;
  pairedRate: number;
  maxGapMinutes: number;
  reasons: string[];
}

// Thresholds from PHASE8_DATA_QUALITY_RULES.md: coverage >= 95%, paired >= 98%, no gap > 15 minutes.
export function evaluateSession(outcomes: SnapshotOutcome[], expectedSnapshots: number, gapsMinutes: number[], calendarKnown: boolean): SessionResult {
  const reasons: string[] = [];
  if (!calendarKnown) reasons.push("trading calendar not confirmed for this date");
  const present = outcomes.filter((o) => o.verdict !== "REJECTED").length;
  const coverage = expectedSnapshots ? present / expectedSnapshots : 0;
  const pairedRate = outcomes.length ? outcomes.filter((o) => o.pairedValid).length / outcomes.length : 0;
  const maxGapMinutes = gapsMinutes.length ? Math.max(...gapsMinutes) : 0;
  if (coverage < 0.95) reasons.push(`coverage ${(coverage * 100).toFixed(1)}% below 95%`);
  if (pairedRate < 0.98) reasons.push(`paired-leg rate ${(pairedRate * 100).toFixed(1)}% below 98%`);
  if (maxGapMinutes > 15) reasons.push(`gap ${maxGapMinutes} min above 15`);
  const status = !calendarKnown ? "HOLD" : reasons.length ? "EXCLUDED" : "INCLUDED";
  return { status, coverage, pairedRate, maxGapMinutes, reasons };
}

// ---- 4. Failure recorder (append-only JSONL, token-free) ----

export type FailureKind =
  | "API_ERROR" | "RATE_LIMIT" | "NETWORK" | "TOKEN_EXPIRY" | "MISSING_INSTRUMENT"
  | "MARKET_CLOSED" | "PARTIAL_SNAPSHOT" | "SESSION_GAP";

export interface FailureEvent { kind: FailureKind; atUtc: string; sessionDate: string; requestSeq?: number; detail: string }

// Strips anything that looks like a bearer token before writing.
export const scrub = (s: string) => s.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");

export function recordFailure(file: string, ev: FailureEvent): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const row = { ...ev, detail: scrub(ev.detail) };
  fs.appendFileSync(file, JSON.stringify(row) + "\n");
}
