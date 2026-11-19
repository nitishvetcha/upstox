// Tests for Module 4: Subscription Manager & Configurable Sharding (WBS 4.3)
import test from "node:test";
import assert from "node:assert/strict";
import { SubscriptionManager } from "./subscriptionManager.ts";
import type { UniverseContractDescriptor } from "./collectorTypes.ts";

function makeMockDescriptors(count: number): UniverseContractDescriptor[] {
  return Array.from({ length: count }, (_, i) => ({
    instrumentKey: `NSE_FO|KEY_${i}`,
    exchangeToken: String(40000 + i),
    tradingSymbol: `SYM_${i}`,
    underlying: "NIFTY" as const,
    expiryDate: "2026-11-26",
    strikePrice: 24500 + i * 50,
    optionType: (i % 2 === 0 ? "CE" : "PE") as "CE" | "PE",
    lotSize: 25,
    tier: "CORE_ATM" as const,
  }));
}

test("Subscription Manager: chunks contracts across connections based on maxKeysPerSocket", () => {
  const mgr = new SubscriptionManager({ maxKeysPerSocket: 100, maxConnections: 3 });
  const contracts = makeMockDescriptors(250);

  const plan = mgr.planSubscriptions(contracts, true);

  assert.equal(plan.quotaStatus, "OK");
  assert.equal(plan.totalKeysCount, 250);
  assert.equal(plan.allocatedConnectionsCount, 3);
  assert.equal(plan.shards.length, 3);

  assert.equal(plan.shards[0].instrumentKeys.length, 100);
  assert.equal(plan.shards[0].connectionId, "ws-pool-01");
  assert.equal(plan.shards[0].chunkIndex, 0);
  assert.equal(plan.shards[0].totalChunks, 3);

  assert.equal(plan.shards[1].instrumentKeys.length, 100);
  assert.equal(plan.shards[1].connectionId, "ws-pool-02");
  assert.equal(plan.shards[1].chunkIndex, 1);

  assert.equal(plan.shards[2].instrumentKeys.length, 50);
  assert.equal(plan.shards[2].connectionId, "ws-pool-03");
  assert.equal(plan.shards[2].chunkIndex, 2);
});

test("Subscription Manager: detects quota exceeded when total keys exceed capacity", () => {
  const mgr = new SubscriptionManager({ maxKeysPerSocket: 50, maxConnections: 2 });
  const contracts = makeMockDescriptors(150); // 150 > 2 * 50 = 100

  const plan = mgr.planSubscriptions(contracts, true);
  assert.equal(plan.quotaStatus, "INSUFFICIENT_SUBSCRIPTION_QUOTA");
});

test("Subscription Manager: falls back to single socket when multi-connection is disallowed", () => {
  const mgr = new SubscriptionManager({ maxKeysPerSocket: 100, maxConnections: 3 });
  const contracts = makeMockDescriptors(80);

  const plan = mgr.planSubscriptions(contracts, false);
  assert.equal(plan.allocatedConnectionsCount, 1);
  assert.equal(plan.fallbackSingleSocketUsed, true);
});

test("Subscription Manager: creates valid JSON subscription frame with mode full", () => {
  const mgr = new SubscriptionManager();
  const contracts = makeMockDescriptors(10);
  const plan = mgr.planSubscriptions(contracts);

  const frameBytes = mgr.createSubscriptionFrame(plan.shards[0]);
  const text = new TextDecoder().decode(frameBytes);
  const parsed = JSON.parse(text);

  assert.equal(parsed.method, "sub");
  assert.equal(parsed.data.mode, "full");
  assert.equal(parsed.data.instrumentKeys.length, 10);
  assert.ok(typeof parsed.guid === "string" && parsed.guid.length > 0);
});

test("Subscription Manager: handles partial acknowledgment gracefully", () => {
  const mgr = new SubscriptionManager();
  const requested = ["KEY_1", "KEY_2", "KEY_BAD"];
  const acked = ["KEY_1", "KEY_2"];
  const rejected = [{ instrumentKey: "KEY_BAD", reason: "UDAPI100050: Invalid instrument token" }];

  const status = mgr.processAcknowledgment("ws-pool-01", "req-1", requested, acked, rejected);

  assert.equal(status.status, "PARTIAL_REJECTION");
  assert.equal(status.keysAcknowledgedCount, 2);
  assert.equal(status.rejectedKeys.length, 1);

  assert.equal(mgr.isKeyActive("KEY_1"), true);
  assert.equal(mgr.isKeyActive("KEY_2"), true);
  assert.equal(mgr.isKeyActive("KEY_BAD"), false);
  assert.equal(mgr.getRejectedKeys().get("KEY_BAD"), "UDAPI100050: Invalid instrument token");
});

test("Subscription Manager: handles total rejection", () => {
  const mgr = new SubscriptionManager();
  const requested = ["KEY_BAD1", "KEY_BAD2"];
  const acked: string[] = [];
  const rejected = [
    { instrumentKey: "KEY_BAD1", reason: "UNENTITLED" },
    { instrumentKey: "KEY_BAD2", reason: "UNENTITLED" },
  ];

  const status = mgr.processAcknowledgment("ws-pool-01", "req-2", requested, acked, rejected);
  assert.equal(status.status, "TOTAL_REJECTION");
  assert.equal(status.keysAcknowledgedCount, 0);
});
