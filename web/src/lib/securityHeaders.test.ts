// Regression: baseline security headers are applied, and no CSP is set without a tested policy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applySecurityHeaders, SECURITY_HEADERS } from "./securityHeaders.ts";

test("clickjacking protection: X-Frame-Options is DENY", () => {
  assert.equal(applySecurityHeaders(new Headers()).get("X-Frame-Options"), "DENY");
});

test("MIME sniffing is disabled", () => {
  assert.equal(applySecurityHeaders(new Headers()).get("X-Content-Type-Options"), "nosniff");
});

test("referrer policy and permissions policy are set", () => {
  const h = applySecurityHeaders(new Headers());
  assert.equal(h.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.match(h.get("Permissions-Policy") ?? "", /camera=\(\)/);
});

test("existing headers are preserved, not replaced wholesale", () => {
  const h = applySecurityHeaders(new Headers({ "Cache-Control": "no-store" }));
  assert.equal(h.get("Cache-Control"), "no-store");
});

test("no Content-Security-Policy is set by the helper (not designed or tested; recorded as a gap)", () => {
  assert.equal(SECURITY_HEADERS["Content-Security-Policy"], undefined);
});

test("report-only CSP is absent by default (no enforcement, no validation header unless requested)", () => {
  const h = applySecurityHeaders(new Headers(), {});
  assert.equal(h.get("Content-Security-Policy-Report-Only"), null);
  assert.equal(h.get("Content-Security-Policy"), null);
});

test("report-only CSP appears only when CSP_REPORT_ONLY=1, and is never the enforcing header", () => {
  const h = applySecurityHeaders(new Headers(), { CSP_REPORT_ONLY: "1" });
  assert.match(h.get("Content-Security-Policy-Report-Only") ?? "", /report-uri \/api\/csp-report/);
  assert.equal(h.get("Content-Security-Policy"), null);
});

test("strict report-only variant has no unsafe-inline or unsafe-eval for scripts", () => {
  const h = applySecurityHeaders(new Headers(), { CSP_REPORT_ONLY: "strict" });
  const csp = h.get("Content-Security-Policy-Report-Only") ?? "";
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe/);
  assert.equal(h.get("Content-Security-Policy"), null);
});

import { buildNonceCsp } from "./securityHeaders.ts";

test("nonce policy: scripts and styles use the per-request nonce; no unsafe-inline for scripts", () => {
  const csp = buildNonceCsp("abc123", false);
  assert.match(csp, /script-src 'self' 'nonce-abc123' 'strict-dynamic'/);
  assert.match(csp, /style-src 'self' 'nonce-abc123'/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
});

test("nonce policy: unsafe-eval appears ONLY in development (production does not need it, per Next docs)", () => {
  assert.doesNotMatch(buildNonceCsp("n", false), /unsafe-eval/);
  assert.match(buildNonceCsp("n", true), /script-src[^;]*'unsafe-eval'/);
});

test("nonce policy keeps the report endpoint and frame denial", () => {
  const csp = buildNonceCsp("n", false);
  assert.match(csp, /report-uri \/api\/csp-report/);
  assert.match(csp, /frame-ancestors 'none'/);
});

test("nonce policy carries the approved style-src-attr allowance (style attributes cannot take a nonce)", () => {
  const csp = buildNonceCsp("n", false);
  assert.match(csp, /style-src-attr 'unsafe-inline'/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
});
