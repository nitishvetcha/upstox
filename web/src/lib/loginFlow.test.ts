// Login gate and redirect-back decisions (pure function, synthetic inputs, no network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pageGateRedirect } from "./pageGate.ts";
import { createSession, revokeSession } from "./operatorSession.ts";

test("G1 unauthenticated page request redirects to /login with the original path", () => {
  assert.equal(pageGateRedirect("/saved-picks", "", undefined), "/login?next=%2Fsaved-picks");
});

test("G2 the original query string is preserved through the redirect", () => {
  const t = pageGateRedirect("/opportunities", "?underlying=nifty&tab=chain", undefined)!;
  const next = new URLSearchParams(t.split("?")[1]).get("next");
  assert.equal(next, "/opportunities?underlying=nifty&tab=chain");
});

test("G3 a forged or random session cookie redirects", () => {
  assert.notEqual(pageGateRedirect("/saved-picks", "", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), null);
});

test("G4 a valid server-side session passes", () => {
  const id = createSession();
  try { assert.equal(pageGateRedirect("/saved-picks", "", id), null); }
  finally { revokeSession(id); }
});

test("G5 a revoked session no longer passes", () => {
  const id = createSession();
  revokeSession(id);
  assert.notEqual(pageGateRedirect("/saved-picks", "", id), null);
});

test("G6 /login is always reachable without a session", () => {
  assert.equal(pageGateRedirect("/login", "?next=%2Fsaved-picks", undefined), null);
});

test("G7 API routes are not redirected by the page gate", () => {
  assert.equal(pageGateRedirect("/api/saved-picks", "", undefined), null);
});

test("G8 a protocol-relative path cannot produce an external redirect target", () => {
  const t = pageGateRedirect("//evil.example/x", "", undefined)!;
  const next = new URLSearchParams(t.split("?")[1]).get("next");
  assert.equal(next, "/");
});
