// Offline tests for CSP report parsing (privacy and bounds) and the local-only guard. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCspReport, isLocalHost, MAX_REPORT_BYTES } from "./cspReport.ts";
import { POST as receive } from "../app/api/csp-report/route.ts";

const report = (over: Record<string, unknown> = {}) => JSON.stringify({ "csp-report": { "effective-directive": "script-src-elem", "blocked-uri": "inline", "document-uri": "http://localhost:3150/saved-picks?token=SECRET123&x=1", ...over } });

test("script violation is categorised SCRIPT with blocked scheme 'inline'", () => {
  const r = parseCspReport(report());
  assert.ok(r.ok);
  assert.equal(r.ok && r.summary.category, "SCRIPT");
  assert.equal(r.ok && r.summary.blockedScheme, "inline");
});

test("the document query string (which may carry secrets) is never kept", () => {
  const r = parseCspReport(report());
  assert.ok(r.ok);
  assert.equal(r.ok && r.summary.documentPath, "/saved-picks");
  assert.ok(!JSON.stringify(r).includes("SECRET123"));
});

test("sample text is never stored, even when the report contains one", () => {
  const r = parseCspReport(report({ "script-sample": "const token='SECRET123'" }));
  assert.ok(r.ok);
  assert.equal(r.ok && r.summary.sample, "");
  assert.ok(!JSON.stringify(r).includes("SECRET123"));
});

test("blocked host keeps the hostname only, not the path or query", () => {
  const r = parseCspReport(report({ "effective-directive": "connect-src", "blocked-uri": "https://api.example.com/v1/data?key=SECRET123" }));
  assert.ok(r.ok);
  assert.equal(r.ok && r.summary.blockedHost, "api.example.com");
  assert.equal(r.ok && r.summary.category, "CONNECT");
  assert.ok(!JSON.stringify(r).includes("SECRET123"));
});

test("unknown directive families fall into OTHER, not a guessed category", () => {
  const r = parseCspReport(report({ "effective-directive": "worker-src" }));
  assert.ok(r.ok);
  assert.equal(r.ok && r.summary.category, "OTHER");
});

test("oversize report (over 8 KB) is rejected before parsing", () => {
  const big = report({ padding: "x".repeat(MAX_REPORT_BYTES) });
  assert.deepEqual(parseCspReport(big), { ok: false, reason: "TOO_LARGE" });
});

test("invalid JSON and missing csp-report are rejected", () => {
  assert.deepEqual(parseCspReport("{not json"), { ok: false, reason: "INVALID_JSON" });
  assert.deepEqual(parseCspReport("{}"), { ok: false, reason: "MISSING_CSP_REPORT" });
});

test("missing or overlong directive is rejected", () => {
  assert.equal(parseCspReport(JSON.stringify({ "csp-report": {} })).ok, false);
  assert.equal(parseCspReport(report({ "effective-directive": "a".repeat(65) })).ok, false);
});

test("loopback hosts are local; public hosts are not", () => {
  assert.equal(isLocalHost("localhost:3150"), true);
  assert.equal(isLocalHost("127.0.0.1:3150"), true);
  assert.equal(isLocalHost("[::1]:3150"), true);
  assert.equal(isLocalHost("example.com"), false);
  assert.equal(isLocalHost("192.168.1.22:3150"), false);
  assert.equal(isLocalHost(null), false);
});

test("the receiver refuses a non-local Host with 403 and stores nothing", async () => {
  const res = await receive(new Request("http://example.com/api/csp-report", { method: "POST", headers: { host: "example.com", "content-type": "application/csp-report" }, body: report() }));
  assert.equal(res.status, 403);
});

test("the receiver refuses an oversize declared body with 413", async () => {
  const res = await receive(new Request("http://localhost/api/csp-report", { method: "POST", headers: { host: "localhost", "content-length": String(MAX_REPORT_BYTES + 1) }, body: "x" }));
  assert.equal(res.status, 413);
});

test("a valid local report is accepted with 204", async () => {
  const res = await receive(new Request("http://localhost/api/csp-report", { method: "POST", headers: { host: "localhost", "content-type": "application/csp-report" }, body: report() }));
  assert.equal(res.status, 204);
});
