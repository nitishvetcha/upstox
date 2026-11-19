// Regression tests for the security fixes (Phases A and B). Test-only: no application code is changed here.
// Runs under tsx (the route modules use the "@/" alias). No network, no Upstox, no running server.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "security-regression-"));
process.env.OPERATOR_SESSION_FILE = path.join(dir, "sessions.json");
process.env.OPERATOR_PIN_FILE = path.join(dir, "pin.json");

const pin = await import("../operatorPin.ts");
const sess = await import("../operatorSession.ts");
const riskRoute = await import("../../app/api/risk/config/route.ts");
const cspRoute = await import("../../app/api/csp-report/route.ts");
const { DEFAULT_RISK_CONFIG } = await import("../services/risk/riskConfig.ts");

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const readText = (rel: string) => fs.readFileSync(path.join(webRoot, rel), "utf8");

pin.setupPin("123456");
const sessionId = sess.createSession();
const HOST = { host: "localhost:3123" };
const AUTH = { ...HOST, cookie: `op_session=${sessionId}` };
const url = (p: string) => `http://localhost:3123${p}`;

// ── 1. Risk configuration route ──────────────────────────────────────────────

test("risk config: unauthenticated GET returns 401 and no configuration", async () => {
  const res = await riskRoute.GET(new Request(url("/api/risk/config"), { headers: HOST }));
  assert.equal(res.status, 401);
  const body = (await res.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body), ["error"], "no configuration fields in the refusal");
});

test("risk config: authenticated GET returns 200 with only the intended fields", async () => {
  const res = await riskRoute.GET(new Request(url("/api/risk/config"), { headers: AUTH }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { config: Record<string, unknown>; label: string; note: string } & Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ["config", "label", "note"], "exactly the three intended top-level fields");
  assert.deepEqual(Object.keys(body.config).sort(), Object.keys(DEFAULT_RISK_CONFIG).sort(), "config holds only the risk configuration");
  for (const key of Object.keys(body.config)) {
    assert.doesNotMatch(key, /token|secret|password|pin|key/i, `no credential-like field: ${key}`);
  }
});

// ── 2. CSP report route ──────────────────────────────────────────────────────

const VALID_REPORT = JSON.stringify({
  "csp-report": {
    "effective-directive": "script-src-elem",
    "blocked-uri": "https://tracker.example/x.js",
    "document-uri": "http://localhost:3123/login?token=do-not-store",
  },
});

test("csp report: unauthenticated GET returns 401", async () => {
  const res = await cspRoute.GET(new Request(url("/api/csp-report"), { headers: HOST }));
  assert.equal(res.status, 401);
});

test("csp report: authenticated GET returns 200", async () => {
  const res = await cspRoute.GET(new Request(url("/api/csp-report"), { headers: AUTH }));
  assert.equal(res.status, 200);
});

test("csp report: unauthenticated POST is still accepted (browser reporting is not blocked by auth)", async () => {
  const res = await cspRoute.POST(new Request(url("/api/csp-report"), {
    method: "POST", headers: { ...HOST, "content-type": "application/csp-report" }, body: VALID_REPORT,
  }));
  assert.equal(res.status, 204, "a valid report with no session is accepted");
});

test("csp report: the stored counts never hold the query string or other report content", async () => {
  const res = await cspRoute.GET(new Request(url("/api/csp-report"), { headers: AUTH }));
  const text = await res.text();
  assert.match(text, /script-src-elem\|https\|tracker\.example/, "aggregate key is recorded");
  assert.doesNotMatch(text, /do-not-store|token=/, "query string is never stored");
});

test("csp report: malformed JSON is rejected with 400, not an auth error", async () => {
  const res = await cspRoute.POST(new Request(url("/api/csp-report"), {
    method: "POST", headers: { ...HOST, "content-type": "application/csp-report" }, body: "{not json",
  }));
  assert.equal(res.status, 400);
});

test("csp report: a report without the csp-report object is rejected with 400", async () => {
  const res = await cspRoute.POST(new Request(url("/api/csp-report"), {
    method: "POST", headers: { ...HOST, "content-type": "application/csp-report" }, body: JSON.stringify({ other: 1 }),
  }));
  assert.equal(res.status, 400);
});

test("csp report: an oversized body is rejected with 413", async () => {
  const big = JSON.stringify({ "csp-report": { "effective-directive": "script-src", pad: "x".repeat(9 * 1024) } });
  const res = await cspRoute.POST(new Request(url("/api/csp-report"), {
    method: "POST", headers: { ...HOST, "content-type": "application/csp-report" }, body: big,
  }));
  assert.equal(res.status, 413);
});

test("csp report: a non-local Host header is refused with 403 on POST and GET", async () => {
  const post = await cspRoute.POST(new Request("http://evil.example/api/csp-report", {
    method: "POST", headers: { host: "evil.example", "content-type": "application/csp-report" }, body: VALID_REPORT,
  }));
  assert.equal(post.status, 403);
  const get = await cspRoute.GET(new Request("http://evil.example/api/csp-report", { headers: { ...AUTH, host: "evil.example" } }));
  assert.equal(get.status, 403);
});

// ── 3. Development server binding (source checks; the server is never started) ─

test("dev server: package.json dev command binds to 127.0.0.1 and keeps port 3123", () => {
  const pkg = JSON.parse(readText("package.json")) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts.dev, "next dev -H 127.0.0.1 -p 3123");
});

test("dev server: dev-upstox.mjs spawns the same loopback binding and port", () => {
  const src = readText("scripts/dev-upstox.mjs");
  assert.match(src, /spawn\("npx", \["next", "dev", "-H", "127\.0\.0\.1", "-p", PORT\]/);
});

test("production start is unchanged (separate authorization needed to change it)", () => {
  const pkg = JSON.parse(readText("package.json")) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts.start, "next start");
});

// ── 4. CLI base URL (source check, so no server is needed) ───────────────────

test("CLI base URL uses 127.0.0.1, not localhost", () => {
  const src = readText("scripts/upstox-cli.mjs");
  assert.match(src, /export const BASE = `http:\/\/127\.0\.0\.1:\$\{PORT\}`;/);
  assert.doesNotMatch(src, /export const BASE = `http:\/\/localhost/);
});
