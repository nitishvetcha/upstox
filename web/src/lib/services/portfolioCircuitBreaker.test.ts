import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { circuitBreaker } from "./portfolioCircuitBreaker.ts";

describe("portfolioCircuitBreaker", () => {
  beforeEach(() => {
    circuitBreaker.resetAll();
  });

  it("initializes with NORMAL status and allows trades", () => {
    const state = circuitBreaker.getState();
    assert.equal(state.status, "NORMAL");
    assert.equal(state.isTradeAllowed, true);
    assert.equal(state.realizedDailyLoss, 0);
    assert.equal(state.consecutiveLosses, 0);
    assert.equal(state.activeReasons.length, 0);

    const check = circuitBreaker.canOpenTrade();
    assert.equal(check.allowed, true);
  });

  it("records a single loss without tripping heat stop", () => {
    circuitBreaker.recordTradeExit({
      tradeId: "trade_1",
      realizedPnl: -500,
    });

    const state = circuitBreaker.getState();
    assert.equal(state.status, "NORMAL");
    assert.equal(state.isTradeAllowed, true);
    assert.equal(state.realizedDailyLoss, 500);
    assert.equal(state.consecutiveLosses, 1);
  });

  it("trips 60-minute HEAT_STOP after 2 consecutive losses", () => {
    const t0 = new Date("2026-11-23T10:00:00.000Z");
    circuitBreaker.recordTradeExit({ tradeId: "t1", realizedPnl: -400 }, t0);
    circuitBreaker.recordTradeExit({ tradeId: "t2", realizedPnl: -450 }, t0);

    const state = circuitBreaker.getState(t0);
    assert.equal(state.status, "HEAT_STOP");
    assert.equal(state.isTradeAllowed, false);
    assert.equal(state.consecutiveLosses, 2);
    assert.equal(state.realizedDailyLoss, 850);
    assert.ok(state.cooldownRemainingSec > 0);
    assert.ok(state.activeReasons[0].includes("HEAT STOP ACTIVE"));

    const gate = circuitBreaker.canOpenTrade(0, t0);
    assert.equal(gate.allowed, false);
    assert.equal(gate.code, "HEAT_STOP");

    // After 61 minutes, heat stop expires
    const t61 = new Date(t0.getTime() + 61 * 60 * 1000);
    const expiredState = circuitBreaker.getState(t61);
    assert.equal(expiredState.status, "NORMAL");
    assert.equal(expiredState.isTradeAllowed, true);
  });

  it("win resets consecutive loss counter", () => {
    circuitBreaker.recordTradeExit({ tradeId: "t1", realizedPnl: -500 });
    assert.equal(circuitBreaker.getState().consecutiveLosses, 1);

    // Winning trade
    circuitBreaker.recordTradeExit({ tradeId: "t2", realizedPnl: +800 });
    const state = circuitBreaker.getState();
    assert.equal(state.consecutiveLosses, 0);
    assert.equal(state.status, "NORMAL");
  });

  it("trips DAILY_HALT when cumulative daily loss reaches or exceeds limit", () => {
    // Default account capital 100,000, maxDailyLossPercent 2.0% -> ₹2,000 limit
    circuitBreaker.recordTradeExit({ tradeId: "t1", realizedPnl: -1200 });
    circuitBreaker.recordTradeExit({ tradeId: "t2", realizedPnl: -900 }); // Total 2100

    const state = circuitBreaker.getState();
    assert.equal(state.status, "DAILY_HALT");
    assert.equal(state.isTradeAllowed, false);
    assert.equal(state.realizedDailyLoss, 2100);
    assert.ok(state.activeReasons[0].includes("MAX DAILY DRAWDOWN BREACHED"));

    const gate = circuitBreaker.canOpenTrade();
    assert.equal(gate.allowed, false);
    assert.equal(gate.code, "DAILY_HALT");
  });

  it("enforces max concurrent positions cap", () => {
    // Config default max positions = 2 or 3
    const state = circuitBreaker.getState(new Date(), 3);
    assert.equal(state.status, "POSITION_CAP");
    assert.equal(state.isTradeAllowed, false);
    assert.ok(state.activeReasons[0].includes("CONCURRENT POSITIONS CAP"));

    const gate = circuitBreaker.canOpenTrade(3);
    assert.equal(gate.allowed, false);
    assert.equal(gate.code, "POSITION_CAP");
  });

  it("allows operator to clear heat stop manually", () => {
    circuitBreaker.recordTradeExit({ tradeId: "t1", realizedPnl: -400 });
    circuitBreaker.recordTradeExit({ tradeId: "t2", realizedPnl: -400 });
    assert.equal(circuitBreaker.getState().status, "HEAT_STOP");

    circuitBreaker.resetHeatStop();
    const state = circuitBreaker.getState();
    assert.equal(state.status, "NORMAL");
    assert.equal(state.isTradeAllowed, true);
  });
});
