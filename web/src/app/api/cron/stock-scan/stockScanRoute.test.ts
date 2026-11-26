import { test } from "node:test";
import assert from "node:assert/strict";
import { handleStockScan } from "./stockScanHandler.ts";
import type { StockOpportunityResult } from "../../../../lib/engine/stockOpportunityEngine.ts";
import type { LiveCollectionRun } from "../../../../lib/services/liveOpportunityCollector.ts";

test("POST /api/cron/stock-scan rejects missing or invalid scheduler token with 401", async () => {
  const reqNoAuth = new Request("http://localhost/api/cron/stock-scan", { method: "POST" });
  const resNoAuth = await handleStockScan(reqNoAuth, { token: "secret_123" });
  assert.equal(resNoAuth.status, 401);
  const dataNoAuth = await resNoAuth.json();
  assert.equal(dataNoAuth.error, "unauthorized");

  const reqBadAuth = new Request("http://localhost/api/cron/stock-scan", {
    method: "POST",
    headers: { "x-scheduler-token": "wrong_token" },
  });
  const resBadAuth = await handleStockScan(reqBadAuth, { token: "secret_123" });
  assert.equal(resBadAuth.status, 401);
});

test("POST /api/cron/stock-scan skips cleanly when NSE market is not OPEN", async () => {
  const req = new Request("http://localhost/api/cron/stock-scan", {
    method: "POST",
    headers: { "x-scheduler-token": "valid_token" },
  });

  const res = await handleStockScan(req, {
    token: "valid_token",
    marketStatusFn: () => "CLOSED",
    now: new Date("2026-11-26T18:00:00Z"),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.skipped, true);
  assert.equal(data.reason, "NSE_MARKET_CLOSED");
});

test("POST /api/cron/stock-scan runs scan and saves collection run when NSE market is OPEN", async () => {
  let savedRun: LiveCollectionRun | null = null;
  let scanCalled = false;

  const mockScanResult: StockOpportunityResult = {
    timestamp: "2026-11-26T04:30:00.000Z",
    engineVersion: "20.2",
    kind: "intraday",
    source: "UPSTOX",
    freshness: "LIVE",
    universe: "NIFTY_50",
    stocksScanned: 50,
    stocksAvailable: 48,
    stocksRejected: 45,
    niftyChange: 0.45,
    topOpportunities: [
      {
        rank: 1,
        symbol: "RELIANCE",
        name: "Reliance Industries",
        instrumentKey: "NSE_EQ|INE002A01018",
        ltp: 2950,
        open: 2930,
        high: 2960,
        low: 2925,
        previousClose: 2920,
        change: 30,
        changePercent: 1.03,
        volume: 1200000,
        freshness: "LIVE",
        opportunityScore: 75,
        setup: "BREAKOUT",
        direction: "BULLISH",
        entry: 2950,
        entryLow: 2950,
        entryHigh: 2958.85,
        stop: 2915,
        target1: 2990,
        target2: 3020,
        rr: 1.14,
        relativeStrength: 0.58,
        rangePosition: 0.71,
        reasons: ["Above PDH"],
        invalidation: "Price breaks below 2925",
        grade: "C",
      },
    ],
    noOpportunityReason: null,
  };

  const req = new Request("http://localhost/api/cron/stock-scan", {
    method: "POST",
    headers: { "x-scheduler-token": "valid_token" },
  });

  const res = await handleStockScan(req, {
    token: "valid_token",
    marketStatusFn: () => "OPEN",
    scanFn: async () => {
      scanCalled = true;
      return mockScanResult;
    },
    saveCollectionFn: (run) => {
      savedRun = run;
    },
    now: new Date("2026-11-26T05:00:00.000Z"),
  });

  assert.equal(res.status, 200);
  assert.equal(scanCalled, true);
  assert.ok(savedRun);
  assert.equal((savedRun as LiveCollectionRun).sourceStatus, "LIVE");
  assert.equal((savedRun as LiveCollectionRun).stockCount, 48);
  assert.equal((savedRun as LiveCollectionRun).generatedCount, 1);
  assert.match((savedRun as LiveCollectionRun).id, /^\d+_api$/);

  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.stocksScanned, 50);
  assert.equal(data.stocksAvailable, 48);
  assert.equal(data.topOpportunitiesCount, 1);
});
