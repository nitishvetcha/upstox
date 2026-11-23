// Scanner fixture tests: every I/O dependency is injected (deps), so these run as Upstox-mode engine tests with NO token
// available. The token path is pointed at a file that does not exist and the analytics token is cleared, so no request can leave.
process.env.MARKET_DATA_PROVIDER = "upstox";
process.env.UPSTOX_TOKEN_FILE = "/nonexistent/upstox-token-for-scanner-fixture-tests.json";
delete process.env.UPSTOX_ANALYTICS_TOKEN;
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { verifyEvaluationOptionPrices } from "./optionPriceVerification.ts";
import { scanStocks, stockProviderFailureCategory } from "../engine/stockOpportunityEngine.ts";
import { UpstoxError } from "./errors.ts";
import type { OptionRow } from "../types.ts";

const NOW = new Date("2026-11-04T05:30:00.000Z");

function rows(): OptionRow[] {
  return [{
    strike: 24000,
    call: { ltp: 100, bid: 99, ask: 101, oi: 1000, chgOi: 10, volume: 100, iv: 15, delta: 0.5, instrumentKey: "NSE_FO|CALL" },
    put: { ltp: 110, bid: 109, ask: 111, oi: 1200, chgOi: 20, volume: 120, iv: 16, delta: -0.5, instrumentKey: "NSE_FO|PUT" },
  }];
}

describe("Phase 1.1 market-data reliability", () => {
  it("joins option quotes only by canonical instrument_token and keeps chain analytics unverified", async () => {
    const result = await verifyEvaluationOptionPrices(rows(), 24000, "nifty", NOW, async (keys) => {
      assert.deepEqual(keys, ["NSE_FO|CALL", "NSE_FO|PUT"]);
      return {
        "symbol-shaped-response-key": {
          instrument_token: "NSE_FO|CALL",
          last_price: 100.5,
          last_trade_time: NOW.getTime() - 5_000,
        },
        "NSE_FO:PUT-SYMBOL": {
          instrument_token: "NSE_FO|PUT",
          last_price: 110.5,
          last_trade_time: NOW.getTime() - 4_000,
        },
      };
    });

    assert.equal(result.summary.state, "CONTRACT_PRICE_LIVE");
    assert.equal(result.summary.chainAnalytics, "CHAIN_ANALYTICS_UNVERIFIED");
    assert.equal(result.summary.coveredKeys, 2);
    assert.deepEqual({
      live: result.summary.liveKeys,
      aging: result.summary.agingKeys,
      stale: result.summary.staleKeys,
      unavailable: result.summary.unavailableKeys,
      mismatched: result.summary.mismatchedKeys,
    }, { live: 2, aging: 0, stale: 0, unavailable: 0, mismatched: 0 });
    assert.equal(result.rows[0].call.contractPriceQuality, "CONTRACT_PRICE_LIVE");
    assert.equal(result.rows[0].put.contractPriceQuality, "CONTRACT_PRICE_LIVE");
    assert.equal(result.rows[0].call.ltp, 100, "independent quote must not replace chain LTP");
    assert.equal(result.rows[0].call.independentQuoteLtp, 100.5);
  });

  it("fails closed on partial coverage, non-positive LTP, stale timestamps, and LTP mismatch", async () => {
    const partial = await verifyEvaluationOptionPrices(rows(), 24000, "nifty", NOW, async () => ({
      wrongResponseKey: {
        instrument_token: "NSE_FO|CALL",
        last_price: 130,
        last_trade_time: NOW.getTime() - 5_000,
      },
    }));
    assert.equal(partial.summary.coveredKeys, 1);
    assert.deepEqual({
      live: partial.summary.liveKeys,
      aging: partial.summary.agingKeys,
      stale: partial.summary.staleKeys,
      unavailable: partial.summary.unavailableKeys,
      mismatched: partial.summary.mismatchedKeys,
    }, { live: 0, aging: 0, stale: 0, unavailable: 1, mismatched: 1 });
    assert.deepEqual(partial.summary.missingKeys, ["NSE_FO|PUT"]);
    assert.equal(partial.rows[0].call.contractPriceQuality, "CONTRACT_PRICE_MISMATCH");
    assert.equal(partial.rows[0].put.contractPriceQuality, "CONTRACT_PRICE_UNAVAILABLE");

    const invalid = await verifyEvaluationOptionPrices(rows(), 24000, "nifty", NOW, async () => ({
      call: { instrument_token: "NSE_FO|CALL", last_price: 0, last_trade_time: NOW.getTime() - 5_000 },
      put: { instrument_token: "NSE_FO|PUT", last_price: 110, last_trade_time: NOW.getTime() - 121_000 },
    }));
    assert.equal(invalid.rows[0].call.contractPriceQuality, "CONTRACT_PRICE_UNAVAILABLE");
    assert.equal(invalid.rows[0].put.contractPriceQuality, "CONTRACT_PRICE_STALE");
    assert.notEqual(invalid.summary.state, "CONTRACT_PRICE_LIVE");
  });

  it("reports aggregate AGING separately from STALE while keeping it non-eligible", async () => {
    const aging = await verifyEvaluationOptionPrices(rows(), 24000, "nifty", NOW, async () => ({
      call: { instrument_token: "NSE_FO|CALL", last_price: 100, last_trade_time: NOW.getTime() - 31_000 },
      put: { instrument_token: "NSE_FO|PUT", last_price: 110, last_trade_time: NOW.getTime() - 31_000 },
    }));
    assert.equal(aging.summary.state, "CONTRACT_PRICE_AGING");
    assert.equal(aging.summary.agingKeys, 2);
    assert.equal(aging.summary.eligibleKeys, 0);
  });

  it("maps provider failures without carrying token or header data", () => {
    assert.equal(stockProviderFailureCategory(new UpstoxError("UPSTOX_AUTH_EXPIRED", "secret", 401)), "AUTHENTICATION");
    assert.equal(stockProviderFailureCategory(new UpstoxError("UPSTOX_FORBIDDEN", "secret", 403)), "AUTHORIZATION");
    assert.equal(stockProviderFailureCategory(new UpstoxError("UPSTOX_RATE_LIMITED", "secret", 429)), "RATE_LIMIT");
    assert.equal(stockProviderFailureCategory(new UpstoxError("UPSTOX_TIMEOUT", "secret")), "TIMEOUT");
    assert.equal(stockProviderFailureCategory(new UpstoxError("UPSTOX_NETWORK", "secret")), "NETWORK");
    assert.equal(stockProviderFailureCategory(new UpstoxError("UPSTOX_BAD_RESPONSE", "secret", 200)), "MALFORMED_RESPONSE");
  });

  it("reports partial stock coverage as a structured diagnostic", async () => {
    const result = await scanStocks("intraday", NOW, {
      quotes: async (instruments, now) => instruments.map((inst, index) => {
        // instruments[0] is the NIFTY index instrument (filtered from diagnostics after quote fetch).
        // Mark the last instrument UNAVAILABLE so the stock diagnostics see one missing.
        const isLast = index === instruments.length - 1;
        return {
          symbol: inst.symbol,
          exchange: "NSE" as const,
          instrumentKey: inst.instrumentKey,
          timestamp: now.toISOString(),
          ltp: isLast ? null : 100 + index,
          marketStatus: "OPEN" as const,
          freshness: isLast ? "UNAVAILABLE" as const : "LIVE" as const,
          source: isLast ? null : "UPSTOX" as const,
          unavailableReason: isLast ? "PARTIAL_COVERAGE: provider omitted requested instrument" : null,
          open: 100,
          high: 110,
          low: 99,
          previousClose: 100,
          change: index,
          changePercent: index,
          volume: 1000,
        };
      }),
    });
    // instruments = ALL_LIQUID_CONSTITUENTS (189 stocks); nifty index is excluded from diagnostics
    assert.deepEqual(result.diagnostics, {
      requested: 189,
      covered: 188,
      category: "PARTIAL_COVERAGE",
      providerCode: null,
      httpStatus: null,
    });
  });
});
