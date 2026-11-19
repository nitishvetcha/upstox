import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectIntradaySetup,
  getValidPreviousDayLevels,
  pickBestOpportunity,
  getPreviousCompletedSessionDate,
  extractPreviousDayLevelsFromDaily,
  fetchPreviousDayLevels,
  enrichQuotesWithPreviousDayLevels,
  scanStocks,
  normalizeSessionDate,
  loadInstrumentDailyCandles,
  dailyCandles,
  type OpportunityCandidate,
  type PreviousDayLevels,
  type ScanDeps,
} from "../engine/stockOpportunityEngine.ts";
import { normalizeStockQuote, type StockInstrument, type StockMarketData } from "./stockService.ts";
import {
  scheduleHistoricalCall,
  resetHistoricalCallThrottle,
  MIN_HISTORICAL_SPACING_MS,
} from "./upstoxMarket.ts";
import type { OpportunityGrade } from "../engine/opportunityEngine.ts";
import type { Candle } from "../types.ts";
import type { HistoryFetcher } from "../marketHistory.ts";

function createMockStockQuote(overrides: Partial<StockMarketData> = {}): StockMarketData {
  return {
    symbol: "RELIANCE",
    exchange: "NSE",
    instrumentKey: "NSE_EQ|INE002A01018",
    timestamp: "2026-11-18T10:00:00.000Z",
    marketStatus: "OPEN",
    freshness: "LIVE",
    source: "UPSTOX",
    ltp: 2500,
    open: 2490,
    high: 2510,
    low: 2480,
    previousClose: 2480,
    previousDayHigh: 2505,
    previousDayLow: 2470,
    pdh: 2505,
    pdl: 2470,
    change: 20,
    changePercent: 0.81,
    volume: 500000,
    unavailableReason: null,
    ...overrides,
  };
}

describe("Phase 3A Fix 1: PDH / PDL Breakout and Breakdown Classification", () => {
  it("P3A-01: +0.8% above previous close but below PDH is NOT a breakout", () => {
    // previousClose = 1000, ltp = 1008 (+0.8%), pdh = 1015 (above LTP)
    const quote = createMockStockQuote({
      ltp: 1008,
      previousClose: 1000,
      open: 1002,
      high: 1010,
      low: 998,
      previousDayHigh: 1015,
      previousDayLow: 990,
      pdh: 1015,
      pdl: 990,
      change: 8,
      changePercent: 0.8,
    });

    const setup = detectIntradaySetup(quote, 0.2);
    assert.notEqual(setup.setup, "BREAKOUT", "LTP below PDH must not be classified as BREAKOUT");
    assert.equal(setup.setup, "WEAK_LONG", "Sub-1.0% non-breakout should be WEAK_LONG");
    assert.equal(setup.direction, "BULLISH");
  });

  it("P3A-02: Actual crossing of PDH is classified as BREAKOUT", () => {
    // previousClose = 1000, ltp = 1016 (+1.6%), pdh = 1015 (below LTP)
    const quote = createMockStockQuote({
      ltp: 1016,
      previousClose: 1000,
      open: 1005,
      high: 1018,
      low: 1000,
      previousDayHigh: 1015,
      previousDayLow: 990,
      pdh: 1015,
      pdl: 990,
      change: 16,
      changePercent: 1.6,
    });

    const setup = detectIntradaySetup(quote, 0.5);
    assert.equal(setup.setup, "BREAKOUT", "LTP crossing above PDH must be classified as BREAKOUT");
    assert.equal(setup.direction, "BULLISH");
    assert.ok(
      setup.reasons.some((r) => r.includes("Trading above yesterday's high")),
      "Reasons must include trading above yesterday's high"
    );
  });

  it("P3A-03: -0.8% below previous close but above PDL is NOT a breakdown", () => {
    // previousClose = 1000, ltp = 992 (-0.8%), pdl = 985 (below LTP)
    const quote = createMockStockQuote({
      ltp: 992,
      previousClose: 1000,
      open: 998,
      high: 1002,
      low: 990,
      previousDayHigh: 1010,
      previousDayLow: 985,
      pdh: 1010,
      pdl: 985,
      change: -8,
      changePercent: -0.8,
    });

    const setup = detectIntradaySetup(quote, -0.2);
    assert.notEqual(setup.setup, "BREAKDOWN", "LTP above PDL must not be classified as BREAKDOWN");
    assert.equal(setup.setup, "WEAK_SHORT", "Sub-1.0% non-breakdown should be WEAK_SHORT");
    assert.equal(setup.direction, "BEARISH");
  });

  it("P3A-04: Actual crossing below PDL is classified as BREAKDOWN", () => {
    // previousClose = 1000, ltp = 980 (-2.0%), pdl = 985 (above LTP)
    const quote = createMockStockQuote({
      ltp: 980,
      previousClose: 1000,
      open: 995,
      high: 1000,
      low: 978,
      previousDayHigh: 1010,
      previousDayLow: 985,
      pdh: 1010,
      pdl: 985,
      change: -20,
      changePercent: -2.0,
    });

    const setup = detectIntradaySetup(quote, -0.5);
    assert.equal(setup.setup, "BREAKDOWN", "LTP crossing below PDL must be classified as BREAKDOWN");
    assert.equal(setup.direction, "BEARISH");
    assert.ok(
      setup.reasons.some((r) => r.includes("Trading below yesterday's low")),
      "Reasons must include trading below yesterday's low"
    );
  });

  it("P3A-05: Missing, incomplete, or corrupted PDH/PDL fails safe without false breakout", () => {
    // 1. Missing PDH/PDL with +0.8% move
    const quoteNoLevels = createMockStockQuote({
      ltp: 1008,
      previousClose: 1000,
      previousDayHigh: undefined,
      previousDayLow: undefined,
      pdh: undefined,
      pdl: undefined,
      change: 8,
      changePercent: 0.8,
    });
    const setupNoLevels = detectIntradaySetup(quoteNoLevels, 0);
    assert.notEqual(setupNoLevels.setup, "BREAKOUT", "Missing PDH must not trigger BREAKOUT");
    assert.equal(setupNoLevels.setup, "WEAK_LONG");

    // 2. Corrupted / Inverted levels (pdh < pdl)
    const quoteInverted = createMockStockQuote({
      ltp: 1008,
      previousClose: 1000,
      previousDayHigh: 950,
      previousDayLow: 1050,
      pdh: 950,
      pdl: 1050,
      change: 8,
      changePercent: 0.8,
    });
    const levels = getValidPreviousDayLevels(quoteInverted);
    assert.equal(levels.pdh, null, "Inverted PDH must fail safe to null");
    assert.equal(levels.pdl, null, "Inverted PDL must fail safe to null");

    const setupInverted = detectIntradaySetup(quoteInverted, 0);
    assert.notEqual(setupInverted.setup, "BREAKOUT", "Inverted levels must not trigger BREAKOUT");

    // 3. Negative / non-positive levels
    const quoteNonPositive = createMockStockQuote({
      previousDayHigh: 0,
      previousDayLow: -10,
      pdh: 0,
      pdl: -10,
    });
    const levelsNonPositive = getValidPreviousDayLevels(quoteNonPositive);
    assert.equal(levelsNonPositive.pdh, null);
    assert.equal(levelsNonPositive.pdl, null);
  });

  it("P3A-06: Existing momentum and continuation setups remain functional under setup precedence", () => {
    // 1. HOD_CONTINUATION: pos > 0.8, absPct >= 2, but LTP below PDH
    const hodQuote = createMockStockQuote({
      ltp: 1022,
      previousClose: 1000,
      open: 1005,
      high: 1025,
      low: 1000, // rangePosition = (1022 - 1000) / (1025 - 1000) = 22/25 = 0.88 > 0.80
      previousDayHigh: 1030, // PDH is higher than LTP (no breakout)
      previousDayLow: 990,
      pdh: 1030,
      pdl: 990,
      change: 22,
      changePercent: 2.2, // absPct >= 2.0
    });
    const hodSetup = detectIntradaySetup(hodQuote, 0.5);
    assert.equal(hodSetup.setup, "HOD_CONTINUATION", "Near HOD with +2.2% move must be HOD_CONTINUATION");

    // 2. MOMENTUM_LONG: absPct >= 1.0, pos < 0.8, LTP below PDH
    const momQuote = createMockStockQuote({
      ltp: 1015,
      previousClose: 1000,
      open: 1005,
      high: 1030,
      low: 1000, // rangePosition = (1015 - 1000) / (1030 - 1000) = 15/30 = 0.50
      previousDayHigh: 1025, // PDH is higher than LTP (no breakout)
      previousDayLow: 990,
      pdh: 1025,
      pdl: 990,
      change: 15,
      changePercent: 1.5, // absPct >= 1.0
    });
    const momSetup = detectIntradaySetup(momQuote, 0.5);
    assert.equal(momSetup.setup, "MOMENTUM_LONG", "Positive >=1.0% mid-range must be MOMENTUM_LONG");

    // 3. LOD_CONTINUATION: pos < 0.2, absPct >= 2, LTP above PDL
    const lodQuote = createMockStockQuote({
      ltp: 978,
      previousClose: 1000,
      open: 995,
      high: 1000,
      low: 975, // rangePosition = (978 - 975) / (1000 - 975) = 3/25 = 0.12 < 0.20
      previousDayHigh: 1010,
      previousDayLow: 970, // PDL is lower than LTP (no breakdown)
      pdh: 1010,
      pdl: 970,
      change: -22,
      changePercent: -2.2, // absPct >= 2.0
    });
    const lodSetup = detectIntradaySetup(lodQuote, -0.5);
    assert.equal(lodSetup.setup, "LOD_CONTINUATION", "Near LOD with -2.2% drop must be LOD_CONTINUATION");

    // 4. MOMENTUM_SHORT: absPct >= 1.0, pos > 0.2, LTP above PDL
    const momShortQuote = createMockStockQuote({
      ltp: 985,
      previousClose: 1000,
      open: 995,
      high: 1000,
      low: 970, // rangePosition = (985 - 970) / (1000 - 970) = 15/30 = 0.50
      previousDayHigh: 1010,
      previousDayLow: 975, // PDL is lower than LTP (no breakdown)
      pdh: 1010,
      pdl: 975,
      change: -15,
      changePercent: -1.5, // absPct >= 1.0
    });
    const momShortSetup = detectIntradaySetup(momShortQuote, -0.5);
    assert.equal(momShortSetup.setup, "MOMENTUM_SHORT", "Negative <=-1.0% mid-range must be MOMENTUM_SHORT");
  });

  it("P3A-07: normalizeStockQuote parses pdh and pdl from raw data", () => {
    const raw = {
      "NSE_EQ|INE002A01018": {
        instrument_token: "NSE_EQ|INE002A01018",
        last_price: 2550,
        net_change: 50,
        ohlc: {
          open: 2520,
          high: 2560,
          low: 2510,
          close: 2500,
        },
        previous_day_high: 2540,
        previous_day_low: 2480,
      },
    };
    const inst: StockInstrument = {
      symbol: "RELIANCE",
      name: "Reliance",
      instrumentKey: "NSE_EQ|INE002A01018",
      exchange: "NSE",
      kind: "EQUITY",
    };
    const normalized = normalizeStockQuote(raw, inst, new Date(), "UPSTOX");
    assert.equal(normalized.previousDayHigh, 2540);
    assert.equal(normalized.previousDayLow, 2480);
    assert.equal(normalized.pdh, 2540);
    assert.equal(normalized.pdl, 2480);
  });
});

describe("Phase 3A Fix 2: Reject Invalid Candidates in Top-Opportunity Aggregator", () => {
  interface TestItem {
    grade: OpportunityGrade;
    opportunityScore: number;
    symbol?: string;
  }

  it("P3A-08: EOD-rejected stock candidate cannot become bestOpportunity", () => {
    // When stock is REJECT (e.g. from EOD scan with 0 live sources) and options is null
    const candidates: OpportunityCandidate<TestItem>[] = [
      { engine: "OPTIONS", score: 0, item: null },
      {
        engine: "STOCK_INTRADAY",
        score: 82,
        item: { grade: "REJECT", opportunityScore: 82, symbol: "TCS" },
      },
    ];

    const best = pickBestOpportunity(candidates);
    assert.equal(best, null, "REJECT-graded stock candidate must not become bestOpportunity");
  });

  it("P3A-09: Valid options candidate wins when stock candidates are rejected", () => {
    // Stock has higher raw score (88) but is REJECT. Options has lower score (65) but is Grade B.
    const candidates: OpportunityCandidate<TestItem>[] = [
      {
        engine: "OPTIONS",
        score: 65,
        item: { grade: "B", opportunityScore: 65 },
      },
      {
        engine: "STOCK_INTRADAY",
        score: 88,
        item: { grade: "REJECT", opportunityScore: 88, symbol: "INFY" },
      },
    ];

    const best = pickBestOpportunity(candidates);
    assert.ok(best !== null);
    assert.ok(best.item !== null);
    assert.equal(best.engine, "OPTIONS");
    assert.equal(best.score, 65);
    assert.equal(best.item.grade, "B");
  });

  it("P3A-10: Valid stock candidate (A+, A, B, C) can win when eligible", () => {
    // 1. Grade C stock candidate wins when options candidate is REJECT
    const candidatesWithGradeC: OpportunityCandidate<TestItem>[] = [
      {
        engine: "OPTIONS",
        score: 75,
        item: { grade: "REJECT", opportunityScore: 75 },
      },
      {
        engine: "STOCK_INTRADAY",
        score: 62,
        item: { grade: "C", opportunityScore: 62, symbol: "HDFCBANK" },
      },
    ];
    const bestC = pickBestOpportunity(candidatesWithGradeC);
    assert.ok(bestC !== null);
    assert.ok(bestC.item !== null);
    assert.equal(bestC.engine, "STOCK_INTRADAY");
    assert.equal(bestC.item.grade, "C");
    assert.equal(bestC.score, 62);

    // 2. Grade A stock candidate wins when outscoring valid options candidate
    const candidatesWithGradeA: OpportunityCandidate<TestItem>[] = [
      {
        engine: "OPTIONS",
        score: 70,
        item: { grade: "B", opportunityScore: 70 },
      },
      {
        engine: "STOCK_INTRADAY",
        score: 85,
        item: { grade: "A", opportunityScore: 85, symbol: "ICICIBANK" },
      },
    ];
    const bestA = pickBestOpportunity(candidatesWithGradeA);
    assert.ok(bestA !== null);
    assert.ok(bestA.item !== null);
    assert.equal(bestA.engine, "STOCK_INTRADAY");
    assert.equal(bestA.item.grade, "A");
    assert.equal(bestA.score, 85);
  });

  it("P3A-11: When all candidates are rejected or null, bestOpportunity is null", () => {
    // Both options and stock are REJECT
    const allRejected: OpportunityCandidate<TestItem>[] = [
      {
        engine: "OPTIONS",
        score: 55,
        item: { grade: "REJECT", opportunityScore: 55 },
      },
      {
        engine: "STOCK_INTRADAY",
        score: 72,
        item: { grade: "REJECT", opportunityScore: 72, symbol: "WIPRO" },
      },
    ];
    const bestFromRejected = pickBestOpportunity(allRejected);
    assert.equal(bestFromRejected, null);

    // All null
    const allNull: OpportunityCandidate<TestItem>[] = [
      { engine: "OPTIONS", score: 0, item: null },
      { engine: "STOCK_INTRADAY", score: 0, item: null },
    ];
    const bestFromNull = pickBestOpportunity(allNull);
    assert.equal(bestFromNull, null);
  });

  it("P3A-12: Eligible candidate ranking is preserved across valid grades (A+, A, B, C)", () => {
    // Valid options (score 82, grade A) beats valid stock (score 78, grade A+)
    const candidates1: OpportunityCandidate<TestItem>[] = [
      {
        engine: "OPTIONS",
        score: 82,
        item: { grade: "A", opportunityScore: 82 },
      },
      {
        engine: "STOCK_INTRADAY",
        score: 78,
        item: { grade: "A+", opportunityScore: 78, symbol: "SBIN" },
      },
    ];
    const best1 = pickBestOpportunity(candidates1);
    assert.ok(best1 !== null);
    assert.equal(best1.engine, "OPTIONS");
    assert.equal(best1.score, 82);

    // Valid stock (score 80, grade C) beats valid options (score 74, grade B)
    const candidates2: OpportunityCandidate<TestItem>[] = [
      {
        engine: "OPTIONS",
        score: 74,
        item: { grade: "B", opportunityScore: 74 },
      },
      {
        engine: "STOCK_INTRADAY",
        score: 80,
        item: { grade: "C", opportunityScore: 80, symbol: "LT" },
      },
    ];
    const best2 = pickBestOpportunity(candidates2);
    assert.ok(best2 !== null);
    assert.ok(best2.item !== null);
    assert.equal(best2.engine, "STOCK_INTRADAY");
    assert.equal(best2.score, 80);
    assert.equal(best2.item.grade, "C");
  });
});

describe("Phase 3A.1: Reliable Previous Completed Trading-Session PDH/PDL Enrichment", () => {
  it("P3A-13: getPreviousCompletedSessionDate correctly handles weekdays, weekends, and exchange holidays", () => {
    // 1. Regular weekday: Wednesday 2026-11-18 -> Tuesday 2026-11-17
    assert.equal(getPreviousCompletedSessionDate("2026-11-18"), "2026-11-17");

    // 2. Monday: Monday 2026-11-16 -> Friday 2026-11-13 (skips Sunday 15, Saturday 14)
    assert.equal(getPreviousCompletedSessionDate("2026-11-16"), "2026-11-13");

    // 3. Weekend dates: Sunday 2026-11-15 and Saturday 2026-11-14 -> Friday 2026-11-13
    assert.equal(getPreviousCompletedSessionDate("2026-11-15"), "2026-11-13");
    assert.equal(getPreviousCompletedSessionDate("2026-11-14"), "2026-11-13");

    // 4. Exchange Holiday: Good Friday 2026-04-03 is a market holiday.
    // Monday 2026-04-06 -> Thursday 2026-04-02 (skips Sun 05, Sat 04, Good Friday 03)
    assert.equal(getPreviousCompletedSessionDate("2026-04-06"), "2026-04-02");

    // 5. Exchange Holiday: Republic Day Monday 2026-01-26 is a holiday.
    // Tuesday 2026-01-27 -> Friday 2026-01-23
    assert.equal(getPreviousCompletedSessionDate("2026-01-27"), "2026-01-23");

    // 6. Special session: Budget Day Sunday 2026-02-01 is a registered special trading session.
    // Monday 2026-02-02 -> Sunday 2026-02-01
    assert.equal(getPreviousCompletedSessionDate("2026-02-02"), "2026-02-01");

    // 7. Date object input also works identically
    assert.equal(getPreviousCompletedSessionDate(new Date("2026-11-18T10:00:00+05:30")), "2026-11-17");
  });

  it("P3A-14: extractPreviousDayLevelsFromDaily extracts completed session levels and strictly excludes developing candle", () => {
    const candles: Candle[] = [
      {
        timestamp: "2026-11-16T09:15:00+05:30",
        open: 2500,
        high: 2530,
        low: 2490,
        close: 2515,
        volume: 1_200_000,
      },
      {
        timestamp: "2026-11-17T09:15:00+05:30",
        open: 2520,
        high: 2565,
        low: 2510,
        close: 2550,
        volume: 1_500_000,
      },
      {
        // Today's developing candle — MUST be strictly excluded
        timestamp: "2026-11-18T09:15:00+05:30",
        open: 2555,
        high: 2620,
        low: 2550,
        close: 2600,
        volume: 900_000,
      },
    ];

    // Reference date is today (2026-11-18); expected session date is yesterday (2026-11-17)
    const result = extractPreviousDayLevelsFromDaily(candles, "2026-11-17", "2026-11-18");
    assert.ok(result !== null);
    assert.equal(result.pdh, 2565);
    assert.equal(result.pdl, 2510);
    assert.equal(result.sessionDate, "2026-11-17");

    // Confirm today's developing candle (2620, 2550) was NOT used
    assert.notEqual(result.pdh, 2620, "Must never use today's developing high as PDH");
    assert.notEqual(result.pdl, 2550, "Must never use today's developing low as PDL");
  });

  it("P3A-15: extractPreviousDayLevelsFromDaily fails safe on inverted, non-positive, or missing data", () => {
    // 1. Inverted levels (high < low) fail safe
    const inverted: Candle[] = [
      {
        timestamp: "2026-11-17T09:15:00+05:30",
        open: 2500,
        high: 2480, // high < low
        low: 2520,
        close: 2500,
        volume: 100_000,
      },
    ];
    assert.equal(extractPreviousDayLevelsFromDaily(inverted, "2026-11-17", "2026-11-18"), null);

    // 2. Non-positive levels fail safe
    const zeroPrice: Candle[] = [
      {
        timestamp: "2026-11-17T09:15:00+05:30",
        open: 0,
        high: 0,
        low: 0,
        close: 0,
        volume: 100_000,
      },
    ];
    assert.equal(extractPreviousDayLevelsFromDaily(zeroPrice, "2026-11-17", "2026-11-18"), null);

    // 3. Date mismatch (missing candle for expected session) fails safe
    const staleCandles: Candle[] = [
      {
        timestamp: "2026-11-14T09:15:00+05:30",
        open: 2500,
        high: 2550,
        low: 2480,
        close: 2520,
        volume: 100_000,
      },
    ];
    assert.equal(extractPreviousDayLevelsFromDaily(staleCandles, "2026-11-17", "2026-11-18"), null);

    // 4. Empty or null candles fail safe
    assert.equal(extractPreviousDayLevelsFromDaily([], "2026-11-17", "2026-11-18"), null);
  });

  it("P3A-16: fetchPreviousDayLevels caches results and avoids repeated historical requests", async () => {
    let callCount = 0;
    const mockFetcher: HistoryFetcher = async () => {
      callCount++;
      return {
        candles: [
          ["2026-11-17T00:00:00+05:30", 2500, 2580, 2490, 2570, 1000000, 0],
        ],
      };
    };

    const instKey = "NSE_EQ|INE002A01018_TEST_CACHE";
    const evalDate = new Date("2026-11-18T10:00:00+05:30");

    // First call: should invoke the mock fetcher
    const first = await fetchPreviousDayLevels(instKey, evalDate, { historyFetcher: mockFetcher });
    assert.ok(first !== null);
    assert.equal(first.pdh, 2580);
    assert.equal(first.pdl, 2490);
    assert.equal(first.sessionDate, "2026-11-17");
    const countAfterFirst = callCount;
    assert.ok(countAfterFirst > 0);

    // Second call: should hit the in-memory cache and NOT call the fetcher again
    const second = await fetchPreviousDayLevels(instKey, evalDate, { historyFetcher: mockFetcher });
    assert.ok(second !== null);
    assert.equal(second.pdh, 2580);
    assert.equal(second.pdl, 2490);
    assert.equal(callCount, countAfterFirst, "Repeated call must hit cache without invoking fetcher");
  });

  it("P3A-17: enrichQuotesWithPreviousDayLevels preserves existing quotes and enriches missing quotes", async () => {
    const qWithLevels = createMockStockQuote({
      symbol: "RELIANCE",
      instrumentKey: "NSE_EQ|INE002A01018",
      previousDayHigh: 2540,
      previousDayLow: 2480,
      pdh: 2540,
      pdl: 2480,
    });

    const qMissingLevels = createMockStockQuote({
      symbol: "TCS",
      instrumentKey: "NSE_EQ|INE467B01029",
      previousDayHigh: undefined,
      previousDayLow: undefined,
      pdh: undefined,
      pdl: undefined,
      ltp: 3500,
    });

    const qNoData = createMockStockQuote({
      symbol: "INFY",
      instrumentKey: "NSE_EQ|INE009A01021",
      previousDayHigh: undefined,
      previousDayLow: undefined,
      pdh: undefined,
      pdl: undefined,
      ltp: 1800,
    });

    const evalDate = new Date("2026-11-18T10:00:00+05:30");
    const mockDaily = async () => {
      const map = new Map<string, Candle[]>();
      map.set("NSE_EQ|INE467B01029", [
        {
          timestamp: "2026-11-17T09:15:00+05:30",
          open: 3450,
          high: 3520,
          low: 3440,
          close: 3480,
          volume: 500_000,
        },
      ]);
      return map;
    };

    const quotes = [qWithLevels, qMissingLevels, qNoData];
    await enrichQuotesWithPreviousDayLevels(quotes, evalDate, mockDaily);

    // qWithLevels should retain original levels without being touched
    assert.equal(qWithLevels.pdh, 2540);
    assert.equal(qWithLevels.pdl, 2480);

    // qMissingLevels should now have enriched levels from yesterday's daily candle
    assert.equal(qMissingLevels.pdh, 3520);
    assert.equal(qMissingLevels.pdl, 3440);
    assert.equal(qMissingLevels.previousDayHigh, 3520);
    assert.equal(qMissingLevels.previousDayLow, 3440);

    // qNoData should remain undefined without fabricating prices or throwing
    assert.equal(qNoData.pdh, undefined);
    assert.equal(qNoData.pdl, undefined);
    assert.equal(qNoData.ltp, 1800);
  });

  it("P3A-18: Intraday scan with enriched daily candles correctly classifies BREAKOUT and BREAKDOWN", async () => {
    const now = new Date("2026-11-18T10:30:00+05:30");
    const todayYmd = "2026-11-18";
    const yesterdayYmd = "2026-11-17";

    // Set up mock quotes without PDH/PDL:
    // 1. RELIANCE: LTP 2550 (will cross PDH 2540 -> BREAKOUT)
    // 2. TCS: LTP 3400 (will break below PDL 3440 -> BREAKDOWN)
    // 3. INFY: LTP 1820 (within PDH 1850 and PDL 1800 -> not breakout/breakdown)
    const mockQuotes: StockMarketData[] = [
      createMockStockQuote({
        symbol: "RELIANCE",
        instrumentKey: "NSE_EQ|INE002A01018",
        ltp: 2550,
        open: 2510,
        high: 2555,
        low: 2505,
        previousClose: 2500,
        change: 50,
        changePercent: 2.0,
        previousDayHigh: undefined,
        previousDayLow: undefined,
        pdh: undefined,
        pdl: undefined,
        freshness: "LIVE",
        sessionDate: todayYmd,
        exchangeTimestamp: `${todayYmd}T05:00:00.000Z`,
        timestamp: `${todayYmd}T05:00:00.000Z`,
      }),
      createMockStockQuote({
        symbol: "TCS",
        instrumentKey: "NSE_EQ|INE467B01029",
        ltp: 3400,
        open: 3460,
        high: 3470,
        low: 3390,
        previousClose: 3470,
        change: -70,
        changePercent: -2.0,
        previousDayHigh: undefined,
        previousDayLow: undefined,
        pdh: undefined,
        pdl: undefined,
        freshness: "LIVE",
        sessionDate: todayYmd,
        exchangeTimestamp: `${todayYmd}T05:00:00.000Z`,
        timestamp: `${todayYmd}T05:00:00.000Z`,
      }),
      createMockStockQuote({
        symbol: "INFY",
        instrumentKey: "NSE_EQ|INE009A01021",
        ltp: 1820,
        open: 1810,
        high: 1830,
        low: 1805,
        previousClose: 1800,
        change: 20,
        changePercent: 1.11,
        previousDayHigh: undefined,
        previousDayLow: undefined,
        pdh: undefined,
        pdl: undefined,
        freshness: "LIVE",
        sessionDate: todayYmd,
        exchangeTimestamp: `${todayYmd}T05:00:00.000Z`,
        timestamp: `${todayYmd}T05:00:00.000Z`,
      }),
    ];

    const mockDaily = async () => {
      const map = new Map<string, Candle[]>();
      map.set("NSE_EQ|INE002A01018", [
        {
          timestamp: `${yesterdayYmd}T09:15:00+05:30`,
          open: 2490,
          high: 2540, // PDH = 2540 (LTP 2550 > PDH)
          low: 2470,
          close: 2500,
          volume: 1_000_000,
        },
      ]);
      map.set("NSE_EQ|INE467B01029", [
        {
          timestamp: `${yesterdayYmd}T09:15:00+05:30`,
          open: 3480,
          high: 3500,
          low: 3440, // PDL = 3440 (LTP 3400 < PDL)
          close: 3470,
          volume: 800_000,
        },
      ]);
      map.set("NSE_EQ|INE009A01021", [
        {
          timestamp: `${yesterdayYmd}T09:15:00+05:30`,
          open: 1790,
          high: 1850, // PDH = 1850 (LTP 1820 <= PDH)
          low: 1780, // PDL = 1780 (LTP 1820 >= PDL)
          close: 1800,
          volume: 600_000,
        },
      ]);
      return map;
    };

    const deps: ScanDeps = {
      quotes: async () => mockQuotes,
      daily: mockDaily,
    };

    const prevEnv = process.env.MARKET_DATA_PROVIDER;
    process.env.MARKET_DATA_PROVIDER = "upstox";
    try {
      const result = await scanStocks("intraday", now, deps);
      assert.equal(result.source, "UPSTOX");
      assert.ok(result.topOpportunities.length > 0);

      // RELIANCE should be classified as BREAKOUT
      const relOpp = result.topOpportunities.find((o) => o.symbol === "RELIANCE");
      if (relOpp) {
        assert.equal(relOpp.setup, "BREAKOUT");
        assert.ok(relOpp.reasons.some((r) => r.includes("Trading above yesterday's high (2540)")));
      }

      // TCS setup should be classified as BREAKDOWN
      const tcsOpp = result.topOpportunities.find((o) => o.symbol === "TCS");
      if (tcsOpp) {
        assert.equal(tcsOpp.setup, "BREAKDOWN");
        assert.ok(tcsOpp.reasons.some((r) => r.includes("Trading below yesterday's low (3440)")));
      }

      // INFY is within range, so must NOT be BREAKOUT or BREAKDOWN
      const infyOpp = result.topOpportunities.find((o) => o.symbol === "INFY");
      if (infyOpp) {
        assert.notEqual(infyOpp.setup, "BREAKOUT");
        assert.notEqual(infyOpp.setup, "BREAKDOWN");
      }
    } finally {
      process.env.MARKET_DATA_PROVIDER = prevEnv;
    }
  });

  describe("Phase 3A.3: Historical PDH/PDL Reliability Remediation", () => {
    it("P3A-19: Equal-length stock subsets have isolated cache entries and cannot contaminate each other", async () => {
      const evalDate = new Date("2026-11-18T10:00:00+05:30");
      const subsetA = ["NSE_EQ|SUBSET_A_1", "NSE_EQ|SUBSET_A_2"];
      const subsetB = ["NSE_EQ|SUBSET_B_1", "NSE_EQ|SUBSET_B_2"];

      const mockFetcherA: HistoryFetcher = async (key) => ({
        candles: [
          ["2026-11-17T00:00:00+05:30", 100, key.includes("1") ? 110 : 120, 95, 105, 10000, 0],
        ],
      });

      const mockFetcherB: HistoryFetcher = async (key) => ({
        candles: [
          ["2026-11-17T00:00:00+05:30", 200, key.includes("1") ? 210 : 220, 195, 205, 20000, 0],
        ],
      });

      // 1. Fetch subset A (length 2)
      const mapA = await dailyCandles(subsetA, "tok", evalDate, mockFetcherA);
      assert.equal(mapA.size, 2);
      assert.ok(mapA.has("NSE_EQ|SUBSET_A_1"));
      assert.ok(mapA.has("NSE_EQ|SUBSET_A_2"));
      assert.equal(mapA.get("NSE_EQ|SUBSET_A_1")![0].high, 110);
      assert.equal(mapA.get("NSE_EQ|SUBSET_A_2")![0].high, 120);

      // 2. Fetch subset B (also length 2, but completely different keys)
      const mapB = await dailyCandles(subsetB, "tok", evalDate, mockFetcherB);
      assert.equal(mapB.size, 2);
      assert.ok(mapB.has("NSE_EQ|SUBSET_B_1"));
      assert.ok(mapB.has("NSE_EQ|SUBSET_B_2"));
      assert.equal(mapB.get("NSE_EQ|SUBSET_B_1")![0].high, 210);
      assert.equal(mapB.get("NSE_EQ|SUBSET_B_2")![0].high, 220);

      // Verify complete isolation: mapB must not contain any keys from subset A
      assert.equal(mapB.has("NSE_EQ|SUBSET_A_1"), false);
      assert.equal(mapB.has("NSE_EQ|SUBSET_A_2"), false);
    });

    it("P3A-20: Intraday and swing scans share cached daily candles for the same instrument and session", async () => {
      const evalDate = new Date("2026-11-18T10:00:00+05:30");
      const sharedKey = "NSE_EQ|SHARED_TEST_STOCK";
      const swingOnlyKey = "NSE_INDEX|Nifty 50";
      let fetchCount = 0;

      const mockFetcher: HistoryFetcher = async (key) => {
        fetchCount++;
        return {
          candles: [
            ["2026-11-17T00:00:00+05:30", 500, key === sharedKey ? 520 : 25000, 490, 510, 50000, 0],
          ],
        };
      };

      // 1. Intraday scan requests sharedKey
      const intradayMap = await dailyCandles([sharedKey], "tok", evalDate, mockFetcher);
      assert.equal(fetchCount, 1, "First fetch should invoke the fetcher once");
      assert.equal(intradayMap.get(sharedKey)![0].high, 520);

      // 2. Swing scan requests sharedKey + swingOnlyKey
      const swingMap = await dailyCandles([sharedKey, swingOnlyKey], "tok", evalDate, mockFetcher);
      assert.equal(fetchCount, 2, "Swing scan must reuse cached sharedKey and only fetch swingOnlyKey");
      assert.equal(swingMap.get(sharedKey)![0].high, 520);
      assert.equal(swingMap.get(swingOnlyKey)![0].high, 25000);
    });

    it("P3A-21: Concurrent historical requests reserve slots and respect minimum 130ms spacing", async () => {
      resetHistoricalCallThrottle();
      const timestamps: number[] = [];

      await Promise.all([
        scheduleHistoricalCall(async () => { timestamps.push(Date.now()); return 1; }),
        scheduleHistoricalCall(async () => { timestamps.push(Date.now()); return 2; }),
        scheduleHistoricalCall(async () => { timestamps.push(Date.now()); return 3; }),
      ]);

      assert.equal(timestamps.length, 3);
      const diff1 = timestamps[1] - timestamps[0];
      const diff2 = timestamps[2] - timestamps[1];

      // Allow 20ms timer tolerance for CPU scheduling
      assert.ok(diff1 >= MIN_HISTORICAL_SPACING_MS - 20, `expected >= ${MIN_HISTORICAL_SPACING_MS - 20}ms spacing, got ${diff1}ms`);
      assert.ok(diff2 >= MIN_HISTORICAL_SPACING_MS - 20, `expected >= ${MIN_HISTORICAL_SPACING_MS - 20}ms spacing, got ${diff2}ms`);
    });

    it("P3A-22: A failed or rejected historical request does not block or deadlock subsequent requests", async () => {
      resetHistoricalCallThrottle();

      // First request fails
      await assert.rejects(
        async () => scheduleHistoricalCall(async () => { throw new Error("UPSTOX_500_ERROR"); }),
        { message: "UPSTOX_500_ERROR" }
      );

      // Subsequent request must succeed without deadlocking
      const res = await scheduleHistoricalCall(async () => "healthy_response");
      assert.equal(res, "healthy_response");
    });

    it("P3A-23: normalizeSessionDate handles YYYY-MM-DD, +05:30 offset, and UTC Z timestamps accurately", () => {
      // 1. Standard YYYY-MM-DD date string
      assert.equal(normalizeSessionDate("2026-11-18"), "2026-11-18");

      // 2. ISO timestamp with +05:30 offset
      assert.equal(normalizeSessionDate("2026-11-18T09:15:00+05:30"), "2026-11-18");

      // 3. ISO timestamp with UTC Z (03:45 UTC = 09:15 IST)
      assert.equal(normalizeSessionDate("2026-11-18T03:45:00.000Z"), "2026-11-18");

      // 4. ISO timestamp crossing UTC midnight boundary (18:30 UTC on 17 Nov = 00:00 IST on 18 Nov)
      assert.equal(normalizeSessionDate("2026-11-17T18:30:00.000Z"), "2026-11-18");

      // 5. Date object in IST
      assert.equal(normalizeSessionDate(new Date("2026-11-18T03:45:00.000Z")), "2026-11-18");

      // 6. Safe rejection of invalid, empty, or garbage strings
      assert.equal(normalizeSessionDate(""), null);
      assert.equal(normalizeSessionDate("   "), null);
      assert.equal(normalizeSessionDate("not-a-date"), null);
      assert.equal(normalizeSessionDate("2026-99-99"), null);
      assert.equal(normalizeSessionDate(new Date("invalid-date")), null);
    });

    it("P3A-24: getPreviousCompletedSessionDate preserves exact behavior on YYYY-MM-DD, ISO, and Date inputs", () => {
      // Standard YYYY-MM-DD
      assert.equal(getPreviousCompletedSessionDate("2026-11-18"), "2026-11-17");
      assert.equal(getPreviousCompletedSessionDate("2026-11-16"), "2026-11-13");

      // Date object
      assert.equal(getPreviousCompletedSessionDate(new Date("2026-11-18T10:00:00+05:30")), "2026-11-17");

      // ISO timestamp with +05:30
      assert.equal(getPreviousCompletedSessionDate("2026-11-18T09:15:00+05:30"), "2026-11-17");

      // ISO timestamp with UTC Z
      assert.equal(getPreviousCompletedSessionDate("2026-11-18T03:45:00.000Z"), "2026-11-17");

      // Malformed input fails safe without throwing RangeError
      const safeFallback = getPreviousCompletedSessionDate("invalid-timestamp-string");
      assert.ok(typeof safeFallback === "string" && /^\d{4}-\d{2}-\d{2}$/.test(safeFallback));
    });

    it("P3A-25: Missing historical candle fails closed to null without fabricating PDH/PDL", () => {
      const candlesWithMissingTargetDay: Candle[] = [
        {
          timestamp: "2026-11-10T09:15:00+05:30",
          open: 2400,
          high: 2450,
          low: 2380,
          close: 2420,
          volume: 500_000,
        },
      ];

      // Expected session is 2026-11-17, but candles only have 2026-11-10
      const result = extractPreviousDayLevelsFromDaily(candlesWithMissingTargetDay, "2026-11-17", "2026-11-18");
      assert.equal(result, null, "Must fail closed to null when target session candle is missing");

      // A quote without PDH/PDL must fail closed
      const quote = createMockStockQuote({
        previousDayHigh: undefined,
        previousDayLow: undefined,
        pdh: undefined,
        pdl: undefined,
        ltp: 2600,
      });
      const levels = getValidPreviousDayLevels(quote);
      assert.equal(levels.pdh, null);
      assert.equal(levels.pdl, null);

      const setup = detectIntradaySetup(quote, 0.5);
      assert.notEqual(setup.setup, "BREAKOUT");
      assert.notEqual(setup.setup, "BREAKDOWN");
    });

    it("P3A-26: Developing candle on or after referenceDate is strictly excluded", () => {
      const candles: Candle[] = [
        {
          timestamp: "2026-11-17T09:15:00+05:30",
          open: 2500,
          high: 2540,
          low: 2490,
          close: 2530,
          volume: 1_000_000,
        },
        {
          // Developing candle for 2026-11-18
          timestamp: "2026-11-18T09:15:00+05:30",
          open: 2540,
          high: 3000, // Extraneous high that must never be chosen as PDH
          low: 2400,  // Extraneous low that must never be chosen as PDL
          close: 2950,
          volume: 800_000,
        },
      ];

      const result = extractPreviousDayLevelsFromDaily(candles, "2026-11-17", "2026-11-18");
      assert.ok(result !== null);
      assert.equal(result.pdh, 2540, "PDH must match yesterday's completed session");
      assert.equal(result.pdl, 2490, "PDL must match yesterday's completed session");
      assert.notEqual(result.pdh, 3000, "Today's developing high must never be used as PDH");
      assert.notEqual(result.pdl, 2400, "Today's developing low must never be used as PDL");
    });
  });
});
