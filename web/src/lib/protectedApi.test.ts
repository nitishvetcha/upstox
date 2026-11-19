import { test } from "node:test";
import assert from "node:assert/strict";
import { isProtectedApiPath } from "./protectedApi.ts";

test("backtest and paper-trading routes are protected", () => {
  for (const p of ["/api/backtest/run", "/api/backtest/runs", "/api/backtest/runs/abc", "/api/backtest/walk-forward/x/trades",
    "/api/paper-trading/portfolio", "/api/paper-trading/trades/1", "/api/paper-opportunities", "/api/paper-opportunities/collect",
    "/api/recommendations/42/paper-trade"]) {
    assert.equal(isProtectedApiPath(p), true, p);
  }
});

test("login, logout, status, health and ordinary routes stay open", () => {
  for (const p of ["/api/auth/login", "/api/auth/logout", "/api/auth/status", "/api/auth/health", "/api/breadth/nifty",
    "/api/option-chain/nifty", "/api/saved-picks", "/login", "/"]) {
    assert.equal(isProtectedApiPath(p), false, p);
  }
});

test("lookalike prefixes are not protected", () => {
  assert.equal(isProtectedApiPath("/api/backtestx"), false);
  assert.equal(isProtectedApiPath("/api/paper-tradingfoo"), false);
});
