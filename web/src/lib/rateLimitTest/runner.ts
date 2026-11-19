// Rate-limit and endpoint-limit test runner. Specification: docs/phase0/RATE_LIMIT_TEST_EXECUTION_SPEC.md
// Offline logic only. The sender is injected. Nothing here opens a connection.
// Hard cap 35 requests. Zero retries. One request at a time. Stops immediately on any stop condition.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const HARD_CAP = 35;
export const PACING_MS = 1000;
export const BLOCK_C_PACING_MS = 5000; // Block C is paced one request every five seconds (safety review)
export const RATE_REMAINING_FLOOR = 10; // conservative: stop before any limit is reached

const KEY_A = "NSE_FO|40039|09-11-2026";
const KEY_B = "NSE_FO|49415|27-10-2026";
const KEY_C = "BSE_FO|1134391|05-11-2026";
const NIFTY_UNDERLYING = "NSE_INDEX|Nifty 50";

export type Block = "A" | "B" | "C" | "D" | "E" | "F";
export interface PlannedRequest { seq: number; block: Block; path: string; kind: "candles" | "list"; from?: string; to?: string; interval?: string; label: string; pacingMs?: number }

const day = (date: string, n: number) => new Date(Date.parse(date + "T00:00:00Z") - n * 86_400_000).toISOString().slice(0, 10);
const enc = (s: string) => encodeURIComponent(s);
const candles = (key: string, interval: string, to: string, lengthDays: number, block: Block, label: string, seq: number): PlannedRequest => {
  const from = day(to, lengthDays);
  return { seq, block, kind: "candles", from, to, interval, label, path: `/v2/expired-instruments/historical-candle/${enc(key)}/${interval}/${to}/${from}` };
};

// The fixed 35-entry request list, in the order given in the specification. No loops over live data.
export function plannedRequests(): PlannedRequest[] {
  const reqs: PlannedRequest[] = [];
  let seq = 0;
  const push = (r: PlannedRequest) => reqs.push({ ...r, seq: ++seq, pacingMs: r.block === "C" ? BLOCK_C_PACING_MS : PACING_MS });
  // A. Bar cap, 30-minute, key A, ending 2026-11-09, six window lengths
  for (const n of [14, 30, 60, 90, 180, 365]) push(candles(KEY_A, "30minute", "2026-11-09", n, "A", `bar-cap ${n}d`, 0));
  // B. Interval support, key A, 14-day window
  for (const iv of ["1minute", "5minute", "15minute", "day"]) push(candles(KEY_A, iv, "2026-11-09", 14, "B", `interval ${iv}`, 0));
  // C. Rate-limit behaviour, key A, 30-minute, 14-day window, 20 times (paced at 1 s)
  for (let i = 0; i < 20; i++) push(candles(KEY_A, "30minute", "2026-11-09", 14, "C", `repeat ${i + 1} of 20`, 0));
  // D. Other indices, 30-minute, 14-day window
  push(candles(KEY_B, "30minute", "2026-10-27", 14, "D", "BANKNIFTY ATM CE", 0));
  push(candles(KEY_C, "30minute", "2026-11-05", 14, "D", "SENSEX ATM CE", 0));
  // E. Metadata headers
  push({ seq: 0, block: "E", kind: "list", label: "expiries NIFTY", path: `/v2/expired-instruments/expiries?instrument_key=${enc(NIFTY_UNDERLYING)}` });
  push({ seq: 0, block: "E", kind: "list", label: "contracts NIFTY 2026-11-09", path: `/v2/expired-instruments/option/contract?instrument_key=${enc(NIFTY_UNDERLYING)}&expiry_date=2026-11-09` });
  // F. Underlying daily spot check, 7-day window ending 2026-11-09
  push({ seq: 0, block: "F", kind: "candles", from: day("2026-11-09", 7), to: "2026-11-09", interval: "day", label: "underlying daily", path: `/v3/historical-candle/${enc(NIFTY_UNDERLYING)}/days/1/2026-11-09/${day("2026-11-09", 7)}` });
  return reqs;
}

export interface SendResult { status: number; headers: Record<string, string>; body: string }
export type Sender = (path: string, headers: Record<string, string>) => Promise<SendResult>;

export interface RunOptions {
  requests: PlannedRequest[];
  send: Sender;
  token: string;
  sleep: (ms: number) => Promise<void>;
  now: () => string;
  outDir: string;
  tokenUsable: boolean; // computed by the caller from the stored token's expiry (offline)
}

export interface RecordRow {
  seq: number; block: Block; label: string; path: string; startedAt: string; durationMs: number;
  status: number | null; headers: Record<string, string>; bodySha256: string | null; bodyBytes: number | null;
  candles?: { count: number; firstTimestamp: string | null; lastTimestamp: string | null; reachesRequestedStart: boolean | null };
  outcome: "ok" | "stop";
  stopReason?: string;
}

export interface RunSummary { requestsSent: number; stopped: boolean; stopReason: string | null; rows: RecordRow[] }

const SECRET_HEADER = /^(authorization|set-cookie|proxy-authorization)$/i;

// Removes credential-bearing headers and any value containing the token.
export function redactHeaders(h: Record<string, string>, token: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (SECRET_HEADER.test(k)) continue;
    if (token && v.includes(token)) continue;
    out[k.toLowerCase()] = v;
  }
  return out;
}

// Remaining-quota header, if present. Any header whose name mentions both a limit and remaining.
export function remainingQuota(h: Record<string, string>): number | null {
  for (const [k, v] of Object.entries(h)) {
    if (/remaining/i.test(k) && /(rate|limit|quota)/i.test(k)) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

// Candle facts measured from timestamps only. No assumption about how many bars a session should have.
export function candleFacts(body: unknown, from: string | undefined): RecordRow["candles"] {
  const arr = (body as { data?: { candles?: unknown[] } })?.data?.candles;
  const list = Array.isArray(arr) ? arr : [];
  const ts = list.map((c) => (Array.isArray(c) ? String(c[0]) : "")).filter((t) => t && Number.isFinite(Date.parse(t)));
  // No assumption about response order: earliest and latest are found by timestamp.
  const sorted = [...ts].sort((a, b) => Date.parse(a) - Date.parse(b));
  const first = sorted.length ? sorted[0] : null;
  const last = sorted.length ? sorted[sorted.length - 1] : null;
  const reaches = from && first ? first.slice(0, 10) <= from : null;
  return { count: list.length, firstTimestamp: first, lastTimestamp: last, reachesRequestedStart: reaches };
}

// Shape check: a successful response must carry status "success" and the expected data container.
export function shapeProblem(req: PlannedRequest, body: unknown): string | null {
  const b = body as { status?: unknown; data?: unknown; errors?: unknown[] } | null;
  if (!b || typeof b !== "object") return "body is not JSON";
  if (b.errors && Array.isArray(b.errors) && b.errors.length) return `error in body: ${String((b.errors[0] as { errorCode?: string })?.errorCode ?? "unknown")}`;
  if (b.status !== "success") return "status is not success";
  if (req.kind === "candles") {
    const d = b.data as { candles?: unknown } | undefined;
    if (!d || !Array.isArray(d.candles)) return "data.candles missing";
  } else if (!("data" in b)) return "data missing";
  return null;
}

export async function runRateLimitTest(opts: RunOptions): Promise<RunSummary> {
  if (opts.requests.length !== HARD_CAP) throw new Error(`plan must contain exactly ${HARD_CAP} requests; found ${opts.requests.length}`);
  if (!opts.tokenUsable) throw new Error("token missing, invalidated or expired: no request made");
  if (fs.existsSync(opts.outDir)) throw new Error("output directory exists: refusing to reuse it");
  fs.mkdirSync(opts.outDir, { recursive: true });

  const rows: RecordRow[] = [];
  let sent = 0;
  let stopReason: string | null = null;

  for (let i = 0; i < opts.requests.length; i++) {
    const req = opts.requests[i];
    if (sent >= HARD_CAP) { stopReason = "hard cap reached"; break; }
    if (i > 0) await opts.sleep(req.pacingMs ?? PACING_MS);
    const startedAt = opts.now();
    const t0 = Date.now();
    sent++;
    let res: SendResult | null = null;
    let networkError: string | null = null;
    try {
      res = await opts.send(req.path, { Authorization: `Bearer ${opts.token}`, Accept: "application/json" });
    } catch (e) {
      networkError = (e as Error).name || "network";
    }
    const durationMs = Date.now() - t0;
    const row: RecordRow = {
      seq: req.seq, block: req.block, label: req.label, path: req.path, startedAt, durationMs,
      status: res ? res.status : null, headers: res ? redactHeaders(res.headers, opts.token) : {},
      bodySha256: null, bodyBytes: null, outcome: "ok",
    };

    let reason: string | null = null;
    if (networkError) reason = `network failure: ${networkError}`;
    else if (res) {
      row.bodySha256 = crypto.createHash("sha256").update(res.body).digest("hex");
      row.bodyBytes = Buffer.byteLength(res.body);
      // Credential guard: a response containing the token is never persisted, and the run stops.
      if (opts.token && res.body.includes(opts.token)) {
        reason = "token value found in response body; body not persisted; stopping";
        row.bodySha256 = null;
        row.bodyBytes = null;
      }
      if (res.status === 401) reason = "HTTP 401: owner must re-authenticate";
      else if (res.status === 429) reason = `HTTP 429: rate limited (retry-after: ${res.headers["retry-after"] ?? "not given"})`;
      else if (res.status >= 500) reason = `HTTP ${res.status}`;
      else if (res.status !== 200) reason = `unexpected HTTP ${res.status}`;
      else {
        let body: unknown = null;
        try { body = JSON.parse(res.body); } catch { body = null; }
        const problem = shapeProblem(req, body);
        if (problem) reason = `unexpected response: ${problem}`;
        else if (req.kind === "candles") row.candles = candleFacts(body, req.from);
        const rem = remainingQuota(res.headers);
        if (!reason && rem !== null && rem <= RATE_REMAINING_FLOOR) reason = `quota nearly exhausted (remaining ${rem}); stopping before any limit`;
      }
    }

    if (reason) { row.outcome = "stop"; row.stopReason = reason; }
    rows.push(row);
    fs.writeFileSync(path.join(opts.outDir, `${String(req.seq).padStart(2, "0")}.json`), JSON.stringify(row, null, 2));
    if (res && row.bodySha256 && !(opts.token && res.body.includes(opts.token))) fs.writeFileSync(path.join(opts.outDir, `${String(req.seq).padStart(2, "0")}.body`), res.body);
    if (reason) { stopReason = reason; break; }
  }

  const summary: RunSummary = { requestsSent: sent, stopped: stopReason !== null, stopReason, rows };
  fs.writeFileSync(path.join(opts.outDir, "summary.json"), JSON.stringify({ ...summary, completedAt: opts.now() }, null, 2));
  return summary;
}
