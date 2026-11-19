// Offline tests for the fixed-window limiter and trusted client identity. No network, no routes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FixedWindowLimiter, clientKey } from "./rateLimit.ts";

test("allows up to the limit within one window, then refuses", () => {
  const l = new FixedWindowLimiter({ limit: 3, windowMs: 60_000 });
  assert.equal(l.check("a", 0).allowed, true);
  assert.equal(l.check("a", 1).allowed, true);
  assert.equal(l.check("a", 2).allowed, true);
  const refused = l.check("a", 3);
  assert.equal(refused.allowed, false);
  assert.equal(refused.remaining, 0);
});

test("refusal reports the exact time until the window resets (retry-after)", () => {
  const l = new FixedWindowLimiter({ limit: 1, windowMs: 60_000 });
  l.check("a", 0);
  assert.equal(l.check("a", 15_000).retryAfterMs, 45_000);
});

test("a new window restores the allowance", () => {
  const l = new FixedWindowLimiter({ limit: 1, windowMs: 60_000 });
  l.check("a", 0);
  assert.equal(l.check("a", 30_000).allowed, false);
  assert.equal(l.check("a", 60_000).allowed, true);
});

test("keys are independent: one client's exhaustion does not block another", () => {
  const l = new FixedWindowLimiter({ limit: 1, windowMs: 60_000 });
  l.check("a", 0);
  assert.equal(l.check("a", 1).allowed, false);
  assert.equal(l.check("b", 1).allowed, true);
});

test("memory is bounded under key flooding (oldest key evicted at capacity)", () => {
  const l = new FixedWindowLimiter({ limit: 1, windowMs: 60_000 }, 5);
  for (let i = 0; i < 50; i++) l.check(`k${i}`, i);
  assert.ok(l.size() <= 5, `size ${l.size()}`);
});

// Trusted client identity
test("without a trusted proxy, X-Forwarded-For is ignored (a client cannot forge its key)", () => {
  assert.equal(clientKey({ socketAddress: "10.0.0.5", forwardedFor: "203.0.113.9", trustedProxy: false }), "10.0.0.5");
});

test("with a trusted proxy, the left-most forwarded address is the client", () => {
  assert.equal(clientKey({ socketAddress: "10.0.0.1", forwardedFor: "203.0.113.9, 10.0.0.1", trustedProxy: true }), "203.0.113.9");
});

test("with a trusted proxy but no forwarded header, the socket address is used", () => {
  assert.equal(clientKey({ socketAddress: "10.0.0.1", forwardedFor: null, trustedProxy: true }), "10.0.0.1");
});

test("no socket address and no forwarded header gives an 'unknown' key (shared bucket, not an unlimited one)", () => {
  assert.equal(clientKey({ socketAddress: null, forwardedFor: null, trustedProxy: false }), "unknown");
});
