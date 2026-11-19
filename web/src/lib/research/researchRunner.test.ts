// News gate setup: these tests stub fetch to exercise the authorised news path. Both flags are needed; mock-mode tests stay blocked.
process.env.NEWS_EXTERNAL_ENABLED = "true";
// Network-gate setup: these tests stub fetch to exercise the live (upstox) code path. Without this the gate refuses.
process.env.MARKET_DATA_PROVIDER = "upstox";
// End-to-end checks of scripts/options-audit-research.ts `round` failure paths. Runs the real script in a temp cwd
// (never touches .data/) with a test-only preload that fixes the clock and makes every Upstox request fail.
// No market data is produced: only error responses are simulated.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const script = path.join(process.cwd(), "scripts", "options-audit-research.ts");
const OPEN_AT = "2026-10-28T10:00:00+05:30"; // Wednesday, NSE trading day

const PRELOAD = `
import fs from "node:fs";
const RealDate = Date, offset = RealDate.parse(process.env.FAKE_NOW) - RealDate.now();
globalThis.Date = class extends RealDate {
  constructor(...a) { a.length ? super(...a) : super(RealDate.now() + offset); }
  static now() { return RealDate.now() + offset; }
};
globalThis.fetch = async (url) => {
  fs.appendFileSync(process.env.FETCH_LOG, String(url) + "\\n");
  const status = Number(process.env.FAKE_STATUS);
  return new Response(JSON.stringify({ status: "error", errors: [{ message: "simulated " + status }] }), { status });
};`;

function run(opts: { now?: string; status?: number; token?: boolean; lock?: boolean }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "research-runner-"));
  const preload = path.join(tmp, "preload.mjs");
  fs.writeFileSync(preload, PRELOAD);
  const now = opts.now ?? OPEN_AT;
  const tokenFile = path.join(tmp, "token.json");
  if (opts.token !== false) {
    fs.writeFileSync(tokenFile, JSON.stringify({ accessToken: "test", userId: null, userName: null, issuedAt: now, expiresAt: "2099-01-01T00:00:00Z" }));
  }
  if (opts.lock) {
    const dir = path.join(tmp, ".data", "options-audit-research");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, ".round.lock"), "");
    const t = new Date(now);
    fs.utimesSync(path.join(dir, ".round.lock"), t, t);
  }
  const fetchLog = path.join(tmp, "fetch.log");
  fs.writeFileSync(fetchLog, "");
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--import", pathToFileURL(preload).href, script, "round"], {
    cwd: tmp,
    encoding: "utf8",
    // The collector guard requires explicit authorisation. The preload stubs fetch, so these flags only let the
    // real failure-path logic run; no request reaches the network.
    env: { ...process.env, MARKET_DATA_PROVIDER: "upstox", UPSTOX_COLLECTION_ENABLED: "true", FAKE_NOW: now, FAKE_STATUS: String(opts.status ?? 401), FETCH_LOG: fetchLog, UPSTOX_TOKEN_FILE: tokenFile },
  });
  const roundsFile = path.join(tmp, ".data", "options-audit-research", "rounds-research.jsonl");
  const records = fs.existsSync(roundsFile) ? fs.readFileSync(roundsFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const fetches = fs.readFileSync(fetchLog, "utf8").trim().split("\n").filter(Boolean);
  const touchedProduction = fs.existsSync(path.join(tmp, ".data", "options-audit"));
  const lockLeft = fs.existsSync(path.join(tmp, ".data", "options-audit-research", ".round.lock"));
  fs.rmSync(tmp, { recursive: true, force: true });
  return { code: r.status, stderr: r.stderr, records, fetches, touchedProduction, lockLeft };
}

describe("research runner failure paths (end-to-end, temp cwd)", () => {
  it("closed market: exit 0, no request, no record", () => {
    const r = run({ now: "2026-10-28T17:00:00+05:30" });
    assert.equal(r.code, 0);
    assert.equal(r.fetches.length, 0);
    assert.equal(r.records.length, 0);
  });

  it("no valid token: every index recorded as NO_VALID_TOKEN, exit 1, no request", () => {
    const r = run({ token: false });
    assert.equal(r.code, 1);
    assert.equal(r.fetches.length, 0);
    assert.equal(r.records.length, 6);
    assert.ok(r.records.every((x) => x.errorReason === "NO_VALID_TOKEN" && x.marketState === "OPEN" && !x.samples));
    assert.equal(r.lockLeft, false);
  });

  it("401 on the status probe: stops after one request, all 6 indices recorded as not attempted, exit 1", () => {
    const r = run({ status: 401 });
    assert.equal(r.code, 1);
    assert.equal(r.fetches.length, 1);
    assert.match(r.fetches[0], /\/v2\/market\/status\/NFO/);
    assert.equal(r.records.length, 6);
    assert.ok(r.records.every((x) => x.errorReason === "UPSTOX_AUTH_EXPIRED" && x.httpStatus === 401 && /not attempted/.test(x.error)));
    assert.match(r.stderr, /BLOCKER: token rejected/);
  });

  it("429 everywhere: no retries, one failure record per index with reason and status, exit 1", () => {
    const r = run({ status: 429 });
    assert.equal(r.code, 1);
    assert.equal(r.fetches.length, 2 + 6); // 2 status probes + 1 contract request per index
    assert.equal(r.records.length, 6);
    assert.ok(r.records.every((x) => x.errorReason === "UPSTOX_RATE_LIMITED" && x.httpStatus === 429 && x.exchangeStatus.startsWith("UNREADABLE")));
    assert.deepEqual(r.records.map((x) => x.exchange), ["NFO", "NFO", "NFO", "NFO", "BFO", "BFO"]);
  });

  it("concurrent run (fresh lock held): exit 1, no request, no record, other run's lock left alone", () => {
    const r = run({ lock: true });
    assert.equal(r.code, 1);
    assert.equal(r.fetches.length, 0);
    assert.equal(r.records.length, 0);
    assert.equal(r.lockLeft, true);
  });

  it("never creates or reads production audit storage", () => {
    for (const r of [run({ status: 429 }), run({ token: false })]) assert.equal(r.touchedProduction, false);
  });
});
