// Tests for Module 10: Reconnection State Machine & Failure Detection (WBS 4.6)
import test from "node:test";
import assert from "node:assert/strict";
import { ReconnectionStateMachine } from "./reconnectionStateMachine.ts";

test("Reconnection State Machine: transitions across 6 explicit health states", () => {
  const sm = new ReconnectionStateMachine({ connectionId: "ws-pool-01" });
  assert.equal(sm.getHealthState(), "STATE_TRANSPORT_UNHEALTHY");
  assert.equal(sm.getConnectionState(), "DISCONNECTED");

  // 1. Connect
  const { status } = sm.onConnected();
  assert.equal(status.state, "SUBSCRIBED");
  assert.equal(sm.getHealthState(), "STATE_TRANSPORT_HEALTHY_DATA_FLOWING");

  // 2. Individual contract inactivity (does NOT trigger reconnect)
  const indHealth = sm.onIndividualContractInactive("NSE_FO|DEEP_OTM_123");
  assert.equal(indHealth, "STATE_INDIVIDUAL_CONTRACT_INACTIVE");
  assert.equal(sm.getHealthState(), "STATE_TRANSPORT_HEALTHY_DATA_FLOWING"); // overall feed still healthy

  // 3. Market closed outside trading hours
  sm.setMarketOpen(false);
  assert.equal(sm.getHealthState(), "STATE_MARKET_CLOSED_OR_HALTED");

  // 4. Market re-opened
  sm.setMarketOpen(true);
  sm.onMessageReceived();
  assert.equal(sm.getHealthState(), "STATE_TRANSPORT_HEALTHY_DATA_FLOWING");

  // 5. Disconnect
  const dis = sm.onDisconnected("TCP_RESET");
  assert.equal(dis.state, "DISCONNECTED");
  assert.equal(sm.getHealthState(), "STATE_TRANSPORT_UNHEALTHY");
});

test("Reconnection State Machine: distinguishes transport health from feed-wide data stall", () => {
  const sm = new ReconnectionStateMachine({
    connectionId: "ws-pool-01",
    feedSilenceWatchdogMs: 15000,
    stallReconnectThresholdMs: 45000,
  });

  const t0 = BigInt("1000000000000"); // arbitrary mono timestamp
  sm.onConnected(t0);
  sm.onMessageReceived(undefined, t0);

  // At t0 + 10s: data flow is normal (< 15s)
  const eval1 = sm.evaluateWatchdog(t0 + BigInt("10000000000"));
  assert.equal(eval1.action, "NONE");
  assert.equal(eval1.healthState, "STATE_TRANSPORT_HEALTHY_DATA_FLOWING");

  // At t0 + 16s: feed silence exceeds 15s -> triggers SEND_PING
  const eval2 = sm.evaluateWatchdog(t0 + BigInt("16000000000"));
  assert.equal(eval2.action, "SEND_PING");

  // Pong arrives: proves transport is physically alive, but market data is stalled
  sm.onPongReceived(t0 + BigInt("16100000000"));
  assert.equal(sm.getHealthState(), "STATE_TRANSPORT_HEALTHY_DATA_STALLED");

  // At t0 + 46s: silence persists past 45s threshold -> triggers TRIGGER_DIAGNOSTIC_RECONNECT
  const eval3 = sm.evaluateWatchdog(t0 + BigInt("46000000000"));
  assert.equal(eval3.action, "TRIGGER_DIAGNOSTIC_RECONNECT");
  assert.match(eval3.reason!, /Feed-wide silence exceeded/);
});

test("Reconnection State Machine: protocol ping timeout marks transport unhealthy", () => {
  const sm = new ReconnectionStateMachine({
    connectionId: "ws-pool-01",
    feedSilenceWatchdogMs: 15000,
    stallReconnectThresholdMs: 45000,
  });

  const t0 = BigInt("2000000000000");
  sm.onConnected(t0);
  sm.onMessageReceived(undefined, t0);

  // Silence at 16s triggers ping
  sm.evaluateWatchdog(t0 + BigInt("16000000000"));

  // 6 seconds later without pong (ping timeout > 5s)
  const evalTimeout = sm.evaluateWatchdog(t0 + BigInt("22000000000"));
  assert.equal(evalTimeout.action, "TRIGGER_DIAGNOSTIC_RECONNECT");
  assert.equal(evalTimeout.healthState, "STATE_TRANSPORT_UNHEALTHY");
  assert.match(evalTimeout.reason!, /Protocol ping timed out/);
});

test("Reconnection State Machine: exponential backoff timing and max attempts", () => {
  const sm = new ReconnectionStateMachine({
    connectionId: "ws-pool-01",
    baseBackoffMs: 1000,
    maxBackoffMs: 8000,
    maxReconnectAttempts: 3,
  });

  // Disconnect 1
  sm.onDisconnected("Err1");
  const delay1 = sm.calculateBackoffDelayMs();
  assert.ok(delay1 >= 1000 && delay1 <= 1200);

  // Disconnect 2
  sm.onDisconnected("Err2");
  const delay2 = sm.calculateBackoffDelayMs();
  assert.ok(delay2 >= 2000 && delay2 <= 2400);

  // Disconnect 3
  sm.onDisconnected("Err3");
  const delay3 = sm.calculateBackoffDelayMs();
  assert.ok(delay3 >= 4000 && delay3 <= 4800);
  assert.equal(sm.isMaxReconnectExceeded(), false);

  // Disconnect 4 -> max exceeded
  sm.onDisconnected("Err4");
  assert.equal(sm.isMaxReconnectExceeded(), true);
});

test("Reconnection State Machine: records exact gap interval on reconnect", () => {
  const sm = new ReconnectionStateMachine({ connectionId: "ws-pool-01" });
  sm.onConnected();

  // Disconnect occurs
  sm.onDisconnected("NETWORK_DROP");

  // Small delay then reconnect
  const { gap } = sm.onConnected();
  assert.ok(gap);
  assert.equal(gap.cause, "DISCONNECTION");
  assert.ok(gap.gapDurationMs >= 0);
  assert.equal(gap.restSnapshotReferenceTaken, false);
});
