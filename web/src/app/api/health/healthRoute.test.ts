import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkTelegramConnectivity,
  verifyStrategyDiskHash,
  generateHealthReport,
  FROZEN_STRATEGY_114_SHA256,
} from "./healthChecker.ts";
import { GET } from "./route.ts";
import { recordBotHeartbeat, clearBotHeartbeat } from "../../../lib/services/botHeartbeat.ts";

describe("Production Health & Reliability Route (/api/health)", () => {
  it("1. checkTelegramConnectivity returns configured: false when token is missing", async () => {
    const res = await checkTelegramConnectivity(undefined, true);
    assert.equal(res.configured, false);
    assert.equal(res.reachable, false);
    assert.equal(res.error, "TELEGRAM_BOT_TOKEN not configured");
  });

  it("2. checkTelegramConnectivity verifies valid Telegram API response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      assert.match(String(url), /api\.telegram\.org\/bot12345\/getMe/);
      return new Response(
        JSON.stringify({
          ok: true,
          result: { username: "upstox_market_bot", first_name: "Market Scanner Bot" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await checkTelegramConnectivity("12345", true);
      assert.equal(res.configured, true);
      assert.equal(res.reachable, true);
      assert.equal(res.botUsername, "upstox_market_bot");
      assert.equal(res.botName, "Market Scanner Bot");
      assert.equal(typeof res.latencyMs, "number");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("3. checkTelegramConnectivity caches results for 60s to prevent probe hammering", async () => {
    let callCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      callCount++;
      return new Response(
        JSON.stringify({
          ok: true,
          result: { username: "cached_bot", first_name: "Cached" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      // First call hits network
      const res1 = await checkTelegramConnectivity("cache_test_token", true);
      assert.equal(res1.reachable, true);
      assert.equal(callCount, 1);

      // Second call within 60s uses cache
      const res2 = await checkTelegramConnectivity("cache_test_token", false);
      assert.equal(res2.cached, true);
      assert.equal(callCount, 1); // No new fetch issued!
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("4. GET /api/health?probe=liveness returns instant 200 without network requests", async () => {
    const req = new Request("http://localhost:3123/api/health?probe=liveness");
    const res = await GET(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "HEALTHY");
    assert.ok(typeof data.uptimeSeconds === "number");
  });

  it("5. verifyStrategyDiskHash computes SHA-256 and proves Strategy 11.4 file is intact", () => {
    const check = verifyStrategyDiskHash();
    assert.equal(check.hash, FROZEN_STRATEGY_114_SHA256);
    assert.equal(check.matchesBaseline, true);
  });

  it("6. generateHealthReport detects background BOT-RUNNER heartbeat", async () => {
    clearBotHeartbeat();
    recordBotHeartbeat({
      status: "RUNNING",
      lastTickTimestamp: new Date().toISOString(),
      activeTrackedPicksCount: 3,
    });

    const req = new Request("http://localhost:3123/api/health");
    const res = await GET(req);
    assert.ok(res.status === 200 || res.status === 503);
    const data = await res.json();

    assert.equal(data.botRunner.alive, true);
    assert.equal(data.botRunner.state?.activeTrackedPicksCount, 3);
    assert.equal(data.guardrails.strategyTampered, false);
    assert.equal(data.guardrails.strategySha256, FROZEN_STRATEGY_114_SHA256);
  });
});
