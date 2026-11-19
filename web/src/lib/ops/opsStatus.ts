// Operational status from real evidence on disk (lock file, collection/monitor logs, runner health events).
// The UI being reachable is never treated as evidence that the runner or collector works. Read-only.
import fs from "node:fs";
import path from "node:path";
import { dataRoot } from "../dataRoot.ts";
import { execFileSync } from "node:child_process";
import { readJsonl } from "./jsonl.ts";
import { listCollectionRuns } from "../services/liveOpportunityCollector.ts";
import { listMonitorRuns } from "../services/paperTradeMonitorRunner.ts";

export type RunnerState = "RUNNING" | "STALLED" | "NOT_RUNNING" | "IDLE_MARKET_CLOSED" | "UNKNOWN";

export interface HealthEvent {
  event: string;
  sessionDate?: string;
  atIst?: string;
  at?: string;
  authStatus?: string;
  openingWindowMissed?: boolean;
  message?: string;
  stockDataErrors?: number;
  stockAggregateWarnings?: number;
}

// Pure decision, testable: running only if the lock's process is a live paper-live AND it collected recently.
export function deriveRunnerState(o: { lockPidAlive: boolean; market: string; lastCollectionAt: string | null; now: Date }): { state: RunnerState; reason: string } {
  const ageS = o.lastCollectionAt ? (o.now.getTime() - new Date(o.lastCollectionAt).getTime()) / 1000 : null;
  if (o.market !== "OPEN") {
    return o.lockPidAlive ? { state: "RUNNING", reason: "Runner process alive; market not open (waiting or end-of-day pass)" }
      : { state: "IDLE_MARKET_CLOSED", reason: "Market not open; the runner starts at 09:10 IST on weekdays" };
  }
  if (!o.lockPidAlive) return { state: "NOT_RUNNING", reason: "Market is open but no paper-live process holds the lock" };
  if (ageS === null) return { state: "STALLED", reason: "Runner alive but no collection recorded yet" };
  if (ageS > 180) return { state: "STALLED", reason: `Runner alive but last collection was ${Math.round(ageS / 60)} min ago` };
  return { state: "RUNNING", reason: `Last collection ${Math.round(ageS)} s ago` };
}

function pidIsPaperLive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); } catch { return false; }
  try { return /paper-live\.mjs/.test(execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" })); } catch { return false; }
}

export function runnerStatus(market: string, now = new Date(), root = dataRoot()) {
  let lockPid: number | null = null;
  try { lockPid = Number(fs.readFileSync(path.join(root, "paper-live.lock"), "utf8").trim()); } catch { /* no lock */ }
  const lockPidAlive = lockPid !== null && pidIsPaperLive(lockPid);
  // Existing stores, sorted by timestamp. Only genuine runner records count (test runs leaked here before a fix).
  const lastCollection = listCollectionRuns().find((r) => /^\d+_api$/.test(r.id) && r.sourceStatus === "LIVE") ?? null;
  const lastMonitor = listMonitorRuns().find((r) => /^\d+_[a-z0-9]+$/.test(r.id)) ?? null; // real ids: <epoch ms>_<suffix>
  const lastCollectionAt = lastCollection?.timestamp ?? null;
  const health = readJsonl<HealthEvent>(path.join(root, "runner-health.jsonl"));
  return {
    ...deriveRunnerState({ lockPidAlive, market, lastCollectionAt, now }),
    lockPid, lockPidAlive,
    lastCollectionAt, lastCollectionErrors: lastCollection?.errors ?? [],
    lastCollectionCreated: lastCollection?.createdCount ?? null,
    lastMonitorAt: lastMonitor?.timestamp ?? null,
    healthEvents: health.records.slice(-12).reverse(), healthMalformed: health.malformed,
  };
}

// Bounded, redacted log tail. Tokens, bearer headers and JWT-like strings never reach the browser.
export function redact(line: string): string {
  return line
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1[redacted]")
    .replace(/("?(access_?token|accessToken|token|code|api_?key|secret)"?\s*[:=]\s*"?)[^",\s}]+/gi, "$1[redacted]")
    .replace(/eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, "[redacted-jwt]");
}

export function logTail(file: string, maxLines = 60, maxBytes = 64_000): { lines: string[]; missing: boolean } {
  try {
    const st = fs.statSync(file);
    const fd = fs.openSync(file, "r");
    const len = Math.min(st.size, maxBytes);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, st.size - len);
    fs.closeSync(fd);
    const lines = buf.toString("utf8").split("\n").filter((l) => l.trim() && (!l.includes(`"evt":"upstox_request"`) || /"ok":false/.test(l))); // keep failed API calls, drop routine ones
    return { lines: lines.slice(-maxLines).map((l) => redact(l).slice(0, 400)), missing: false };
  } catch { return { lines: [], missing: true }; }
}

// ── Severity-aware attention list (pure) ──────────────────────────────────────
export type Severity = "critical" | "warning" | "info";
export interface Attention { severity: Severity; text: string }
export interface AttentionInputs {
  market: string;
  authStatus: string;
  runner: { state: RunnerState; reason: string; lastCollectionErrors: string[] };
  sources: { index: string; source: string; subsystem: string }[]; // every subsystem of every index
  audit: { malformedLines: number; indices: { index: string; verdict: string; sessionsWithEnoughRounds: number; roundsSucceeded: number; roundsErrored: number; roundsSkipped: number }[] };
  healthMalformed: number;
  lastFirstOpen?: { sessionDate?: string; atIst?: string; openingWindowMissed?: boolean; authStatus?: string } | null;
  minSessions: number;
}

// Runner health and data quality are reported separately: a running collector can still collect stale data.
export function buildAttention(x: AttentionInputs): Attention[] {
  const out: Attention[] = [];
  if (x.audit.malformedLines || x.healthMalformed) out.push({ severity: "critical", text: `Integrity: ${x.audit.malformedLines + x.healthMalformed} malformed record line(s) in audit/runner logs were ignored.` });
  if (x.authStatus !== "VERIFIED_CONNECTED") {
    const label = x.authStatus === "CONFIGURED_UNVERIFIED" ? "credential configured, not verified" : x.authStatus.toLowerCase().replace(/_/g, " ");
    out.push({ severity: "warning", text: `Upstox login ${label} — ${x.market === "OPEN" ? "live collection cannot work until it is verified or you reconnect." : "verify or reconnect before 09:15 IST."}` });
  }
  if (x.runner.state === "NOT_RUNNING" || x.runner.state === "STALLED") out.push({ severity: "warning", text: `Runner ${x.runner.state.replace("_", " ").toLowerCase()}: ${x.runner.reason}.` });
  const realErrors = x.runner.lastCollectionErrors.filter((e) => !/non-LIVE data quality/.test(e));
  if (realErrors.length) out.push({ severity: "warning", text: `Last collection errors: ${realErrors.slice(0, 2).join("; ")}` });
  const notLive = x.sources.filter((s) => s.source !== "LIVE");
  if (notLive.length) {
    const byIdx = new Map<string, string[]>();
    for (const s of notLive) byIdx.set(s.index, [...(byIdx.get(s.index) ?? []), `${s.subsystem} ${s.source}`]);
    out.push({ severity: "warning", text: `Partial data — not live: ${[...byIdx].map(([i, l]) => `${i} (${l.join(", ")})`).join("; ")}. Signals using these inputs are research-only.` });
  }
  if (x.lastFirstOpen?.openingWindowMissed) out.push({ severity: "warning", text: `Session ${x.lastFirstOpen.sessionDate}: 09:15 opening window missed (first collection ${x.lastFirstOpen.atIst}).` });
  const failed = x.audit.indices.reduce((n, i) => n + i.roundsErrored + i.roundsSkipped, 0);
  if (failed) out.push({ severity: "warning", text: `${failed} options-audit round(s) errored or were skipped.` });
  const pending = x.audit.indices.filter((i) => i.verdict === "INSUFFICIENT");
  if (pending.length) out.push({ severity: "info", text: `Options audit collecting evidence for ${pending.length} index(es): ${pending.map((i) => `${i.index} ${i.sessionsWithEnoughRounds}/${x.minSessions} sessions, ${i.roundsSucceeded} rounds`).join("; ")}. Pending is not a failure.` });
  const notTrusted = x.audit.indices.filter((i) => i.verdict === "DATA_NOT_TRUSTED" || i.verdict === "PRICES_TRUSTED_IV_UNVERIFIED");
  if (notTrusted.length) out.push({ severity: "warning", text: `Options data not trusted: ${notTrusted.map((i) => `${i.index} (${i.verdict})`).join(", ")}. Options stay blocked.` });
  const order: Severity[] = ["critical", "warning", "info"];
  return out.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
}
