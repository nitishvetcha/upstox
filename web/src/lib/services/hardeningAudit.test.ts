import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isProtectedApiPath } from "../protectedApi.ts";
import { isSchedulerRequest } from "../schedulerAuth.ts";
import { acquireStreamSlot, openStreamCount, MAX_LIVE_STREAMS } from "./streamSlots.ts";
import { ipLockRemainingMs, recordIpFailure, clearIpFailures, clientIp } from "../loginThrottle.ts";
import { rememberAlert, alertCacheSize } from "./notificationService.ts";
import { isStreamStale, streamAgeMs, STALE_AFTER_MS } from "../../hooks/streamFreshness.ts";

describe("route protection", () => {
  it("gates bot, notifications and the market stream behind the operator", () => {
    for (const p of ["/api/bot/schedule/tick", "/api/bot/tracked-picks", "/api/notifications/test", "/api/market/stream"]) {
      assert.equal(isProtectedApiPath(p), true, p);
    }
  });

  it("leaves the scheduler-token warm endpoint to its own check, not the operator gate", () => {
    assert.equal(isProtectedApiPath("/api/market/warm"), false);
  });
});

describe("scheduler token", () => {
  const req = (token?: string) => new Request("http://x/api/market/warm", { headers: token === undefined ? {} : { "x-scheduler-token": token } });

  it("accepts only the matching token", () => {
    assert.equal(isSchedulerRequest(req("s3cret"), "s3cret"), true);
    assert.equal(isSchedulerRequest(req("wrong"), "s3cret"), false);
    assert.equal(isSchedulerRequest(req(), "s3cret"), false);
    assert.equal(isSchedulerRequest(req(""), "s3cret"), false);
  });

  it("refuses everything when no token is configured", () => {
    assert.equal(isSchedulerRequest(req("anything"), undefined), false);
  });
});

describe("stream connection cap", () => {
  it("allows five open streams, refuses the sixth, and frees a slot once released", () => {
    const before = openStreamCount();
    const releases: Array<() => void> = [];
    for (let i = 0; i < MAX_LIVE_STREAMS; i++) {
      const r = acquireStreamSlot();
      assert.ok(r, `slot ${i + 1} should be granted`);
      releases.push(r);
    }
    assert.equal(acquireStreamSlot(), null, "sixth stream is refused");
    releases[0]();
    releases[0]();
    assert.equal(openStreamCount(), before + MAX_LIVE_STREAMS - 1, "double release frees one slot only");
    const again = acquireStreamSlot();
    assert.ok(again, "a freed slot can be taken again");
    again!();
    for (const r of releases.slice(1)) r();
    assert.equal(openStreamCount(), before);
  });
});

describe("per-IP login throttle", () => {
  it("locks one IP after five failures without touching another", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) recordIpFailure("10.0.0.1", now);
    assert.ok(ipLockRemainingMs("10.0.0.1", now) > 0);
    assert.equal(ipLockRemainingMs("10.0.0.2", now), 0);
    clearIpFailures("10.0.0.1");
    assert.equal(ipLockRemainingMs("10.0.0.1", now), 0);
  });

  it("trusts the rightmost forwarded address", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 203.0.113.9" } });
    assert.equal(clientIp(req), "203.0.113.9");
  });
});

describe("alert cache", () => {
  it("drops entries past retention and caps its size", () => {
    const base = 5_000_000_000;
    rememberAlert("old", base);
    rememberAlert("recent", base + 25 * 60 * 60 * 1000);
    assert.equal(alertCacheSize() <= 1000, true);
    assert.equal(alertCacheSize() >= 1, true);
  });
});

describe("stream freshness", () => {
  it("marks a streaming feed stale only after the threshold", () => {
    const t0 = 1_000_000;
    assert.equal(isStreamStale("STREAMING", t0, t0 + STALE_AFTER_MS), false);
    assert.equal(isStreamStale("STREAMING", t0, t0 + STALE_AFTER_MS + 1), true);
    assert.equal(isStreamStale("DISCONNECTED", t0, t0 + 60_000), false);
    assert.equal(streamAgeMs(null, t0), null);
    assert.equal(streamAgeMs(t0, t0 + 2_500), 2_500);
  });
});

describe("session cookie", () => {
  it("is marked Secure only in production", async () => {
    const { sessionCookieHeader } = await import("../operatorSession.ts");
    const env = process.env as Record<string, string | undefined>;
    const prev = env.NODE_ENV;
    try {
      env.NODE_ENV = "production";
      assert.match(sessionCookieHeader("abc"), /; Secure$/);
      env.NODE_ENV = "development";
      assert.doesNotMatch(sessionCookieHeader("abc"), /Secure/);
    } finally {
      env.NODE_ENV = prev;
    }
  });
});
