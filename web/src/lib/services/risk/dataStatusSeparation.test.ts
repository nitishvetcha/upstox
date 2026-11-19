// Data-Status Separation Test Suite
// Verifies strict segregation of LIVE, PARTIAL, END_OF_DAY, STALE, MOCK, and UNAVAILABLE
// across market analysis, stock opportunity engine, risk engine, and provenance reporting.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../../engine/strategy.ts";
import { evaluateTradeRisk } from "./riskService.ts";
import { scanStocks, type ScanDeps } from "../../engine/stockOpportunityEngine.ts";
import { fixtureDaily, fixtureQuotes, FIXTURE_NOW } from "../../testFixtures/stockScan.ts";
import { dataLabel } from "../../dataStatus.ts";
import { breadthBadge, sourceProviderLabel, summarizeSources } from "../../provenanceDisplay.ts";
import { freshnessDisplayLabel } from "../../freshnessLabel.ts";
import { mockSnapshot } from "../mock.ts";
import { tradeFreshnessOf, latestTradingSessionDate, istToday } from "../../time.ts";
import type { Snapshot, TradePlan } from "../../types.ts";
import type { StockMarketData } from "../stockService.ts";

const NOW = new Date("2026-10-05T07:00:00Z"); // Monday 12:30 IST

function liveSnapshot(over: (s: Snapshot) => void = () => {}): Snapshot {
  const s = structuredClone(mockSnapshot("nifty", NOW));
  for (const k of Object.keys(s.sources) as (keyof Snapshot["sources"])[]) {
    s.sources[k] = { ...s.sources[k], source: "LIVE", provider: "UPSTOX", fetchedAt: NOW.toISOString() };
  }
  if (s.breadth) s.breadth = { ...s.breadth, status: "LIVE", reason: null };
  s.lotSize = 75;
  s.fallbackReason = null;
  over(s);
  return s;
}

function makePlan(over: Partial<TradePlan> = {}): TradePlan {
  return {
    strategy: "Long Call",
    legs: [],
    credit: false,
    entry: 100,
    entryZone: [98, 102],
    stop: 80,
    target1: 150,
    target2: 200,
    rr: 2.5,
    maxLoss: 100,
    maxProfit: null,
    breakevens: [24950],
    score: 80,
    rejected: null,
    ...over,
  } as TradePlan;
}

// ---------------------------------------------------------------------------
// 1. Valid EOD data can produce an EOD watchlist result
// ---------------------------------------------------------------------------
test("1. Valid EOD data can produce an EOD watchlist result", async () => {
  const origProvider = process.env.MARKET_DATA_PROVIDER;
  process.env.MARKET_DATA_PROVIDER = "upstox";

  try {
    // Setup previous session EOD date
    const sessionDate = latestTradingSessionDate(FIXTURE_NOW);

    // Injected quotes simulating completed session EOD quotes
    const eodDeps: ScanDeps = {
      quotes: async (inst, now) =>
        fixtureQuotes(inst, now).map((q) => ({
          ...q,
          freshness: "END_OF_DAY" as const,
          source: "UPSTOX" as const,
          sessionDate,
        })),
      daily: async (keys, now) => fixtureDaily(keys, now),
    };

    // EOD scan for swing / next-session watchlist
    const result = await scanStocks("swing", FIXTURE_NOW, eodDeps);

    assert.ok(result.topOpportunities.length > 0, "Valid EOD quotes must produce swing watchlist candidate opportunities");
    assert.equal(result.stocksAvailable, 50, "All 50 constituent stocks must be available from EOD quotes");
    assert.equal(result.topOpportunities[0].freshness, "END_OF_DAY", "Opportunity retains distinct END_OF_DAY freshness label");
    // Proves that EOD data is NOT dropped as UNAVAILABLE or STALE for watchlist purposes
    assert.notEqual(result.noOpportunityReason, "Upstox not connected — no stock data available");
  } finally {
    process.env.MARKET_DATA_PROVIDER = origProvider;
  }
});

// ---------------------------------------------------------------------------
// 2. EOD data cannot produce a LIVE intraday trade signal
// ---------------------------------------------------------------------------
test("2. EOD data cannot produce a LIVE intraday trade signal", async () => {
  const origProvider = process.env.MARKET_DATA_PROVIDER;
  process.env.MARKET_DATA_PROVIDER = "upstox";

  try {
    // 2a. Strategy 11.4 options recommendation engine:
    const eodSnap = liveSnapshot((s) => {
      s.sources.market = { ...s.sources.market, source: "END_OF_DAY" };
    });
    const analysis = analyze(eodSnap, NOW);

    assert.notEqual(analysis.status, "TRADE", "Strategy 11.4 must NEVER produce TRADE on END_OF_DAY data");
    assert.equal(analysis.plan, null, "Trade plan must be null: live trade execution blocked");
    assert.ok(
      analysis.blockers.some((b) => b.includes("END_OF_DAY") || b.includes("Market closed")),
      "Blockers must explicitly document market closed / END_OF_DAY",
    );

    // 2b. Risk assessment fail-closed for live execution with END_OF_DAY_DATA:
    const risk = evaluateTradeRisk(makePlan(), eodSnap, undefined, undefined, NOW);
    assert.equal(risk.allowed, false, "Live trade plan execution must not be allowed on EOD data");
    assert.equal(risk.status, "REJECTED");
    assert.ok(risk.reasons.includes("END_OF_DAY_DATA"), "Must reject with distinct END_OF_DAY_DATA reason");
    assert.ok(!risk.reasons.includes("STALE_PRICE"), "END_OF_DAY must not produce STALE_PRICE rejection");
    assert.ok(
      risk.humanReasons.some((h) => h.includes("end-of-day") || h.includes("END_OF_DAY")),
      "Rejection reason clearly specifies END_OF_DAY / after-market close",
    );

    // 2c. Stock intraday opportunity engine:
    const sessionDate = latestTradingSessionDate(FIXTURE_NOW);
    const intradayEodDeps: ScanDeps = {
      quotes: async (inst, now) =>
        fixtureQuotes(inst, now).map((q) => ({
          ...q,
          freshness: "END_OF_DAY" as const,
          source: "UPSTOX" as const,
          sessionDate,
        })),
      daily: async (keys, now) => fixtureDaily(keys, now),
    };

    const intradayResult = await scanStocks("intraday", FIXTURE_NOW, intradayEodDeps);
    // All opportunities generated from EOD quotes must be forced to REJECT grade (liveSourcesCount = 0)
    for (const opp of intradayResult.topOpportunities) {
      assert.equal(opp.grade, "REJECT", "Intraday opportunity from EOD data must be graded REJECT, never tradable (A+/A/B/C)");
      assert.ok((opp.gradeReasons ?? []).some((r) => r.includes("not live")), "Grade reasons must specify quote is not live");
    }
  } finally {
    process.env.MARKET_DATA_PROVIDER = origProvider;
  }
});

// ---------------------------------------------------------------------------
// 3. Truly stale data is rejected where freshness is required
// ---------------------------------------------------------------------------
test("3. Truly stale data is rejected where freshness is required", async () => {
  const origProvider = process.env.MARKET_DATA_PROVIDER;
  process.env.MARKET_DATA_PROVIDER = "upstox";

  try {
    // 3a. tradeFreshnessOf classifies age > 120s during market hours as STALE
    const staleLtt = new Date(NOW.getTime() - 300_000).toISOString(); // 5 minutes old during open market
    const freshness = tradeFreshnessOf(staleLtt, NOW);
    assert.equal(freshness.freshness, "STALE", "Data aged > 120s during market session must be STALE");
    assert.equal(freshness.source, "STALE");

    // 3b. Strategy 11.4 rejects STALE market data with NO TRADE
    const staleSnap = liveSnapshot((s) => {
      s.sources.market = { ...s.sources.market, source: "STALE", fetchedAt: new Date(NOW.getTime() - 300_000).toISOString() };
    });
    const analysis = analyze(staleSnap, NOW);
    assert.equal(analysis.status, "NO TRADE", "Strategy 11.4 must produce NO TRADE on STALE market data");
    assert.equal(analysis.plan, null, "Trade plan must be null");
    assert.ok(
      analysis.stale.some((msg) => /market.*stale/i.test(msg)),
      "Stale messages array must report market as stale",
    );

    // 3c. Risk engine rejects STALE data with STALE_PRICE
    const risk = evaluateTradeRisk(makePlan(), staleSnap, undefined, undefined, NOW);
    assert.equal(risk.allowed, false);
    assert.equal(risk.status, "REJECTED");
    assert.ok(risk.reasons.includes("STALE_PRICE"));
    assert.ok(!risk.reasons.includes("END_OF_DAY_DATA"), "STALE quote must not produce END_OF_DAY_DATA");

    // 3d. Stock intraday scanner rejects truly STALE quotes
    const staleDeps: ScanDeps = {
      quotes: async (inst, now) =>
        fixtureQuotes(inst, now).map((q) => ({
          ...q,
          freshness: "STALE" as const,
        })),
      daily: async (keys, now) => fixtureDaily(keys, now),
    };
    const stockResult = await scanStocks("intraday", FIXTURE_NOW, staleDeps);
    assert.equal(stockResult.topOpportunities.length, 0, "No intraday opportunities can be produced from STALE quotes");
    assert.equal(stockResult.stocksRejected, 50, "All 50 stale stock quotes must be rejected");
  } finally {
    process.env.MARKET_DATA_PROVIDER = origProvider;
  }
});

// ---------------------------------------------------------------------------
// 4. MOCK and UNAVAILABLE data cannot be presented as LIVE
// ---------------------------------------------------------------------------
test("4. MOCK and UNAVAILABLE data cannot be presented as LIVE", () => {
  // 4a. dataLabel: MOCK snapshot yields MOCK DATA, never LIVE DATA
  const mockSnap = structuredClone(mockSnapshot("nifty", NOW));
  assert.equal(dataLabel([mockSnap]), "MOCK DATA", "Mock snapshot must be labeled MOCK DATA");

  // 4b. dataLabel: Fallback reason yields MOCK FALLBACK
  const fallbackSnap = liveSnapshot((s) => {
    s.fallbackReason = "UPSTOX_AUTH_EXPIRED";
  });
  assert.equal(dataLabel([fallbackSnap]), "MOCK FALLBACK", "Fallback snapshot must be labeled MOCK FALLBACK");

  // 4c. dataLabel: PARTIAL when breadth is not fully LIVE
  const partialSnap = liveSnapshot((s) => {
    if (s.breadth) s.breadth.status = "PARTIAL";
  });
  assert.equal(dataLabel([partialSnap]), "PARTIAL LIVE DATA", "Partial breadth must downgrade global label to PARTIAL LIVE DATA");

  // 4d. breadthBadge never shows LIVE for MOCK or UNAVAILABLE
  const mockBadge = breadthBadge({ source: "MOCK" }, "LIVE");
  assert.equal(mockBadge.text, "MOCK", "MOCK breadth must show MOCK badge even if internal status says LIVE");
  assert.equal(mockBadge.tone, "warn");

  const unavailBadge = breadthBadge({ source: "UNAVAILABLE" }, "LIVE");
  assert.equal(unavailBadge.text, "UNAVAILABLE", "UNAVAILABLE breadth must show UNAVAILABLE badge");
  assert.equal(unavailBadge.tone, "warn");

  // 4e. sourceProviderLabel strictly identifies providers
  assert.equal(sourceProviderLabel(["MOCK"]), "MOCK");
  assert.equal(sourceProviderLabel(["UPSTOX", "MOCK"]), "MIXED");
  assert.equal(sourceProviderLabel([]), "UNKNOWN");
  assert.equal(sourceProviderLabel([null, undefined]), "UNKNOWN");
  // Only all-UPSTOX produces UPSTOX
  assert.equal(sourceProviderLabel(["UPSTOX", "UPSTOX"]), "UPSTOX");

  // 4f. freshnessDisplayLabel distinguishes END_OF_DAY from STALE
  assert.equal(freshnessDisplayLabel("END_OF_DAY"), "END OF DAY");
  assert.equal(freshnessDisplayLabel("STALE"), "STALE");
  assert.equal(freshnessDisplayLabel("LIVE"), "LIVE");
});
