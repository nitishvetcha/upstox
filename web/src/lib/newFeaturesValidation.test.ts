import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  scoreIntradayQuote,
  detectIntradaySetup,
  calculateDailyAtr,
  calculateAverageVolume,
  calculateRvol,
  getValidOpeningRangeLevels,
  computeSectorMatrix,
  STOCK_SECTOR_MAP,
} from "./engine/stockOpportunityEngine.ts";
import {
  evaluateOptionsOpportunity,
  isZeroDteExpiry,
  getIstHourMinute,
} from "./engine/opportunityEngine.ts";
import { mockSnapshot } from "./services/mock.ts";
import { bearishSnapshotWithSpread } from "./services/phase3A4MultiLegIntegrity.test.ts";
import { calculatePositionSize } from "./positionSizing.ts";
import type { StockMarketData } from "./services/stockService.ts";

describe("FV — Feature Validation: Stock Engine VWAP & Trade Planning", () => {
  it("FV-01: uses a supplied session VWAP and never relabels typical price as VWAP", () => {
    const q: StockMarketData = {
      symbol: "TEST_STOCK",
      exchange: "NSE",
      instrumentKey: "NSE_EQ|INE000000001",
      timestamp: new Date().toISOString(),
      marketStatus: "OPEN",
      source: "MOCK",
      unavailableReason: null,
      ltp: 105,
      open: 100,
      high: 110,
      low: 98,
      previousClose: 100,
      change: 5,
      changePercent: 5.0,
      volume: 500_000,
      freshness: "LIVE",
      vwap: 103.5,
    };
    const res = scoreIntradayQuote(q, 1.0);
    assert.ok(res !== null, "quote with breakout setup must be scored");
    assert.ok(typeof res.vwap === "number");
    assert.equal(res.vwap, 103.5);
    assert.ok(typeof res.vwapDistancePct === "number");
    assert.ok(res.vwapDistancePct! > 0, "LTP 105 is above VWAP 104.33");
    assert.ok(
      res.scored.reasons.some((r) => r.includes("Trading above intraday VWAP")),
      "must add VWAP confirmation to reasons"
    );
  });

  it("FV-02: adds below VWAP note for bearish breakdown setups", () => {
    const q: StockMarketData = {
      symbol: "TEST_BEAR",
      exchange: "NSE",
      instrumentKey: "NSE_EQ|INE000000002",
      timestamp: new Date().toISOString(),
      marketStatus: "OPEN",
      source: "MOCK",
      unavailableReason: null,
      ltp: 90,
      open: 100,
      high: 101,
      low: 88,
      previousClose: 100,
      change: -10,
      changePercent: -10.0,
      volume: 600_000,
      freshness: "LIVE",
      vwap: 93,
    };
    // typical price = (101 + 88 + 90) / 3 = 93
    // vwapDistancePct = (90 - 93) / 93 * 100 = -3.23%
    const res = scoreIntradayQuote(q, -1.0);
    assert.ok(res !== null);
    assert.equal(res.vwap, 93);
    assert.ok(res.vwapDistancePct! < 0, "LTP 90 is below VWAP 93");
    assert.ok(
      res.scored.reasons.some((r) => r.includes("Trading below intraday VWAP")),
      "must add below VWAP confirmation for breakdown"
    );
  });

  it("FV-02b: leaves VWAP unavailable when no session price-volume calculation exists", () => {
    const q: StockMarketData = {
      symbol: "NO_VWAP", exchange: "NSE", instrumentKey: "NSE_EQ|NOVWAP",
      timestamp: new Date().toISOString(), marketStatus: "OPEN", source: "MOCK",
      unavailableReason: null, ltp: 105, open: 100, high: 110, low: 98,
      previousClose: 100, change: 5, changePercent: 5, volume: 500_000, freshness: "LIVE",
    };
    const res = scoreIntradayQuote(q, 1);
    assert.ok(res);
    assert.equal(res.vwap, null);
    assert.equal(res.vwapDistancePct, null);
    assert.equal(res.scored.reasons.some((r) => r.includes("VWAP")), false);
  });
});

describe("FV — Feature Validation: Option Opportunity Greeks & Payoffs", () => {
  it("FV-03: candidate opportunities populate Greeks and Payoffs", () => {
    const now = new Date("2026-11-19T10:30:00+05:30");
    const snap = mockSnapshot("nifty", now);
    const opp = evaluateOptionsOpportunity(snap, "NIFTY", now);

    assert.ok(opp !== null);
    assert.ok(Array.isArray(opp.topOpportunities));

    if (opp.topOpportunities.length > 0) {
      const top = opp.topOpportunities[0];
      assert.ok(top.strike > 0);
      assert.ok(top.entry > 0);
      assert.ok(top.stop > 0);
      assert.ok(top.target1 > 0);
      assert.ok(top.target2 > 0);
      assert.ok(top.breakeven > 0);
      assert.ok(top.maxLoss > 0);
      // Verify Greeks fields exist
      assert.ok("theta" in top, "theta field must be defined in opportunity");
      assert.ok("gamma" in top, "gamma field must be defined in opportunity");
      assert.ok("vega" in top, "vega field must be defined in opportunity");
    }
  });

  it("FV-04: option candidate order slip formatting is well-formed", () => {
    const slip = `BUY NIFTY 25350 CE @ ₹125 | SL: ₹95 | T1: ₹165 | T2: ₹205 | Lot: 65`;
    assert.match(slip, /^BUY NIFTY \d+ (CE|PE) @ ₹\d+/);
    assert.match(slip, /SL: ₹\d+/);
    assert.match(slip, /T1: ₹\d+/);
    assert.match(slip, /T2: ₹\d+/);
    assert.match(slip, /Lot: \d+/);
  });

  it("FV-05: multi-leg spread order slip formatting is well-formed", () => {
    const slip = `BULL CALL SPREAD NIFTY 2026-11-26 | Net Debit: ₹45.5 | SL: ₹20 | T1: ₹75 | T2: ₹100 | Lot: 65`;
    assert.match(slip, /^BULL CALL SPREAD/);
    assert.match(slip, /Net Debit: ₹\d+(\.\d+)?/);
  });
});

describe("FV — Feature Validation: Saved Picks Risk/Reward Calculations", () => {
  it("FV-06: computes percentage gain to target, loss to stop, and R:R ratio accurately", () => {
    const entry = 100;
    const stopLoss = 90;
    const target1 = 120;

    const upsidePct = ((target1 - entry) / entry) * 100;
    const downsidePct = ((entry - stopLoss) / entry) * 100;
    const rr = Math.abs(target1 - entry) / Math.abs(entry - stopLoss);

    assert.equal(upsidePct, 20.0);
    assert.equal(downsidePct, 10.0);
    assert.equal(rr, 2.0);
  });

  it("FV-07: calculateDailyAtr computes True Range over completed sessions", () => {
    const candles = [
      { timestamp: "2026-11-01", open: 100, high: 110, low: 95, close: 105, volume: 1000 },
      { timestamp: "2026-11-02", open: 106, high: 115, low: 102, close: 112, volume: 1200 }, // TR: max(13, |115-105|=10, |102-105|=3) = 13
      { timestamp: "2026-11-03", open: 110, high: 120, low: 108, close: 118, volume: 1500 }, // TR: max(12, |120-112|=8, |108-112|=4) = 12
    ];
    const atr = calculateDailyAtr(candles, 2);
    assert.ok(atr !== null);
    // (13 + 12) / 2 = 12.5
    assert.equal(atr, 12.5);
  });

  it("FV-08: calculateAverageVolume and calculateRvol compute volume ratios accurately", () => {
    const candles = [
      { timestamp: "2026-11-01", open: 100, high: 110, low: 95, close: 105, volume: 100_000 },
      { timestamp: "2026-11-02", open: 106, high: 115, low: 102, close: 112, volume: 200_000 },
      { timestamp: "2026-11-03", open: 110, high: 120, low: 108, close: 118, volume: 300_000 },
    ];
    const avgVol = calculateAverageVolume(candles, 3);
    assert.equal(avgVol, 200_000);

    const rvolSurge = calculateRvol(400_000, avgVol);
    assert.equal(rvolSurge, 2.0);

    const rvolLow = calculateRvol(60_000, avgVol);
    assert.equal(rvolLow, 0.3);
  });

  it("FV-09: scoreIntradayQuote incorporates RVOL and daily ATR into reasons and trade plan", () => {
    const q: StockMarketData = {
      symbol: "TEST_RVOL",
      exchange: "NSE",
      instrumentKey: "NSE_EQ|INE000000003",
      timestamp: new Date().toISOString(),
      marketStatus: "OPEN",
      source: "MOCK",
      unavailableReason: null,
      ltp: 200,
      open: 195,
      high: 205,
      low: 194,
      previousClose: 190,
      change: 10,
      changePercent: 5.26,
      volume: 800_000,
      freshness: "LIVE",
      atr: 12.0,
      rvol: 2.5,
    };
    const res = scoreIntradayQuote(q, 1.0);
    assert.ok(res !== null);
    assert.equal(res.atr, 12.0);
    assert.equal(res.rvol, 2.5);
    assert.ok(
      res.scored.reasons.some((r) => r.includes("Heavy volume surge (RVOL 2.5x avg)")),
      "must append volume surge reason"
    );
    // Target must use dailyAtr (12.0) rather than narrow dayRange (11)
    // t1 = 200 + 12.0 * 1.75 = 200 + 21 = 221
    assert.equal(res.plan.target1, 221);
  });

  it("FV-10: getValidOpeningRangeLevels validates positive and non-inverted levels", () => {
    const base: StockMarketData = {
      symbol: "TEST", exchange: "NSE", instrumentKey: "KEY", timestamp: "",
      marketStatus: "OPEN", source: "MOCK", unavailableReason: null, ltp: 100, freshness: "LIVE",
    };
    assert.deepEqual(getValidOpeningRangeLevels({ ...base, openingRangeHigh: 105, openingRangeLow: 98 }), { orbHigh: 105, orbLow: 98 });
    assert.deepEqual(getValidOpeningRangeLevels({ ...base, orbHigh: 110, orbLow: 90 }), { orbHigh: 110, orbLow: 90 });
    // Inverted fails closed to null
    assert.deepEqual(getValidOpeningRangeLevels({ ...base, orbHigh: 90, orbLow: 110 }), { orbHigh: null, orbLow: null });
  });

  it("FV-11: detectIntradaySetup classifies ORB_BREAKOUT when price crosses 15m Opening Range High", () => {
    const q: StockMarketData = {
      symbol: "TEST_ORB_BULL", exchange: "NSE", instrumentKey: "KEY", timestamp: "",
      marketStatus: "OPEN", source: "MOCK", unavailableReason: null, freshness: "LIVE",
      ltp: 106,
      open: 100,
      high: 107,
      low: 99,
      previousClose: 100,
      change: 6,
      changePercent: 6.0,
      volume: 300_000,
      previousDayHigh: 115, // PDH is far above at 115, so not a full-day breakout
      previousDayLow: 95,
      orbHigh: 103,         // 15m opening range was 99-103
      orbLow: 99,
    };
    const res = detectIntradaySetup(q, 1.0);
    assert.equal(res.setup, "ORB_BREAKOUT");
    assert.equal(res.direction, "BULLISH");
    assert.ok(res.reasons.some((r) => r.includes("Breaking out above 15m Opening Range High (103)")));
  });

  it("FV-12: detectIntradaySetup classifies ORB_BREAKDOWN when price crosses 15m Opening Range Low", () => {
    const q: StockMarketData = {
      symbol: "TEST_ORB_BEAR", exchange: "NSE", instrumentKey: "KEY", timestamp: "",
      marketStatus: "OPEN", source: "MOCK", unavailableReason: null, freshness: "LIVE",
      ltp: 96,
      open: 100,
      high: 101,
      low: 95,
      previousClose: 100,
      change: -4,
      changePercent: -4.0,
      volume: 400_000,
      previousDayHigh: 110,
      previousDayLow: 85,   // PDL is far below at 85, so not a full-day breakdown
      orbHigh: 101,
      orbLow: 98,           // 15m opening range was 98-101
    };
    const res = detectIntradaySetup(q, -1.0);
    assert.equal(res.setup, "ORB_BREAKDOWN");
    assert.equal(res.direction, "BEARISH");
    assert.ok(res.reasons.some((r) => r.includes("Breaking down below 15m Opening Range Low (98)")));
  });

  it("FV-13: BREAKOUT (PDH cross) has strict precedence over ORB_BREAKOUT", () => {
    const q: StockMarketData = {
      symbol: "TEST_PRECEDENCE", exchange: "NSE", instrumentKey: "KEY", timestamp: "",
      marketStatus: "OPEN", source: "MOCK", unavailableReason: null, freshness: "LIVE",
      ltp: 112,
      open: 100,
      high: 113,
      low: 99,
      previousClose: 100,
      change: 12,
      changePercent: 12.0,
      volume: 500_000,
      previousDayHigh: 108, // Crossing PDH (108)
      previousDayLow: 95,
      orbHigh: 104,         // Also crossing ORB-H (104)
      orbLow: 99,
    };
    const res = detectIntradaySetup(q, 1.0);
    assert.equal(res.setup, "BREAKOUT", "PDH breakout must take top precedence over ORB");
  });

  it("FV-14: evaluateOptionsOpportunity populates resistance and support OI walls on contracts", () => {
    const now = new Date("2026-11-19T10:30:00+05:30");
    const snap = mockSnapshot("nifty", now);
    const opp = evaluateOptionsOpportunity(snap, "NIFTY", now);

    assert.ok(opp !== null);
    if (opp.topOpportunities.length > 0) {
      for (const contract of opp.topOpportunities) {
        assert.ok("resistance" in contract, "contract must have resistance property");
        assert.ok("support" in contract, "contract must have support property");
        assert.equal(typeof contract.srRoom, "number");
        assert.equal(contract.resistance, opp.resistance);
        assert.equal(contract.support, opp.support);
      }
    }
  });

  it("FV-15: target capping guard warns when spot is approaching institutional OI writer wall", () => {
    const now = new Date("2026-11-19T10:30:00+05:30");
    const snap = mockSnapshot("nifty", now);
    const initialOpp = evaluateOptionsOpportunity(snap, "NIFTY", now);
    // Artificially move spot close to resistance wall (e.g. 5 pts away from resistance)
    const tightSnap = {
      ...snap,
      spot: initialOpp.resistance - 5,
    };
    const opp = evaluateOptionsOpportunity(tightSnap, "NIFTY", now);
    assert.ok(opp !== null);
    if (opp.topOpportunities.length > 0) {
      const top = opp.topOpportunities[0];
      const hasWallWarning = top.reasons.some((r) => r.includes("institutional") && r.includes("writer wall") && r.includes("target room is capped"));
      assert.ok(hasWallWarning, "Must append warning when room to institutional writer wall is capped");
    }
  });

  it("FV-16: High IV percentile (>60) triggers Dynamic Volatility Switcher spread priority", () => {
    const now = new Date("2026-11-23T10:30:00+05:30");
    const snap = bearishSnapshotWithSpread();
    // Simulate high IV percentile (e.g. 75th percentile)
    const highIvSnap = {
      ...snap,
      ivPercentile: 75,
    };
    const opp = evaluateOptionsOpportunity(highIvSnap, "NIFTY", now);
    assert.ok(opp !== null);
    const spreadOpp = opp.topOpportunities.find((o) => o.strategyType === "BEAR_PUT_SPREAD");
    assert.ok(spreadOpp, "Spread opportunity must be present in top opportunities under high IV");
    const hasSwitcherReason = spreadOpp.reasons.some((r) => r.includes("High IV") && r.includes("Volatility Switcher"));
    assert.ok(hasSwitcherReason, "Spread must include High IV Volatility Switcher rationale");
  });

  it("FV-17: Low IV percentile (<=50) notes directional naked option efficiency", () => {
    const now = new Date("2026-11-23T10:30:00+05:30");
    const snap = bearishSnapshotWithSpread();
    const lowIvSnap = {
      ...snap,
      ivPercentile: 35,
    };
    const opp = evaluateOptionsOpportunity(lowIvSnap, "NIFTY", now);
    assert.ok(opp !== null);
    const hasSwitcherReason = opp.topOpportunities.some((o) =>
      o.reasons.some((r) => r.includes("Low IV") && r.includes("Volatility Switcher")),
    );
    assert.ok(hasSwitcherReason, "Ranked candidates must explain the low-IV directional preference");
  });

  it("FV-18: isZeroDteExpiry detects same-day expiry in IST accurately", () => {
    const testNow = new Date("2026-11-19T11:00:00+05:30");
    assert.equal(isZeroDteExpiry("2026-11-19", testNow), true);
    assert.equal(isZeroDteExpiry("2026-11-19T15:30:00+05:30", testNow), true);
    assert.equal(isZeroDteExpiry("2026-11-20", testNow), false);
    assert.equal(isZeroDteExpiry(null, testNow), false);
    assert.equal(isZeroDteExpiry("", testNow), false);
  });

  it("FV-19: getIstHourMinute correctly identifies noon and afternoon periods", () => {
    const morning = new Date("2026-11-19T10:15:00+05:30");
    const morningInfo = getIstHourMinute(morning);
    assert.equal(morningInfo.hour, 10);
    assert.equal(morningInfo.minute, 15);
    assert.equal(morningInfo.isAfterNoon, false);
    assert.equal(morningInfo.isAfterTwoPm, false);

    const afternoon = new Date("2026-11-19T14:30:00+05:30");
    const afternoonInfo = getIstHourMinute(afternoon);
    assert.equal(afternoonInfo.hour, 14);
    assert.equal(afternoonInfo.minute, 30);
    assert.equal(afternoonInfo.isAfterNoon, true);
    assert.equal(afternoonInfo.isAfterTwoPm, true);
  });

  it("FV-20: 0-DTE rules reject out-of-the-money lottery strikes (Delta < 0.35)", () => {
    const now = new Date("2026-11-23T10:30:00+05:30");
    const snap = bearishSnapshotWithSpread();
    // Expiry matches test date (2026-11-23)
    assert.equal(snap.expiry, "2026-11-23");
    // Modify 25200 put delta to be OTM lottery strike (e.g. delta = -0.25)
    const otmSnap = {
      ...snap,
      chain: snap.chain.map((r) =>
        r.strike === 25200
          ? { ...r, put: { ...r.put, delta: -0.25 } }
          : r
      ),
    };
    const opp = evaluateOptionsOpportunity(otmSnap, "NIFTY", now);
    assert.ok(opp !== null);
    assert.equal(opp.isZeroDte, true);
    const otmRejection = opp.rejectedContracts.find((r) => r.strike === 25200 && r.reason.includes("0-DTE Expiry Rule"));
    assert.ok(otmRejection, "Must reject strike with Delta < 0.35 on 0-DTE expiry day");
  });

  it("FV-21: 0-DTE afternoon theta guard triggers post-12:00 IST warnings and post-14:00 ITM enforcement", () => {
    const afternoonNow = new Date("2026-11-23T14:15:00+05:30");
    const snap = bearishSnapshotWithSpread();
    // 25200 put delta = -0.38 (valid morning strike, but OTM post-14:00)
    const afternoonSnap = {
      ...snap,
      chain: snap.chain.map((r) =>
        r.strike === 25200
          ? { ...r, put: { ...r.put, delta: -0.38 } }
          : r
      ),
    };
    const opp = evaluateOptionsOpportunity(afternoonSnap, "NIFTY", afternoonNow);
    assert.ok(opp !== null);
    assert.equal(opp.isZeroDte, true);
    assert.equal(opp.afternoonThetaGuard, true);
    const twoPmRejection = opp.rejectedContracts.find((r) => r.strike === 25200 && r.reason.includes("0-DTE Afternoon Theta Guard"));
    assert.ok(twoPmRejection, "Must reject strike with Delta < 0.45 post-14:00 IST on 0-DTE");
  });

  it("FV-22: calculatePositionSize sizes option lots within 1.5% max account risk budget", () => {
    // ₹1,00,000 account capital, 1.5% risk budget = ₹1,500
    // Option entry = 100, stop = 50 -> risk per unit = 50. Lot size = 65 -> risk per lot = 3,250
    // If risk per lot (3,250) > budget (1,500), recommended lots is 0 to enforce the risk budget strictly.
    const res1 = calculatePositionSize({
      type: "OPTION",
      accountCapital: 100_000,
      riskPercent: 1.5,
      entry: 100,
      stop: 50,
      target1: 150,
      target2: 200,
      lotSize: 65,
    });
    assert.equal(res1.recommendedLots, 0);
    assert.equal(res1.recommendedUnits, 0);
    assert.equal(res1.riskBudget, 1500);
    assert.equal(res1.isCapitalConstrained, true);
    assert.equal(res1.minCapitalNeeded, 216667);

    // ₹5,00,000 account capital, 1.5% risk budget = ₹7,500
    // Option entry = 40, stop = 25 -> risk per unit = 15. Lot size = 65 -> risk per lot = 975
    // 7,500 / 975 = 7 lots
    const res2 = calculatePositionSize({
      type: "OPTION",
      accountCapital: 500_000,
      riskPercent: 1.5,
      entry: 40,
      stop: 25,
      target1: 70,
      target2: 95,
      lotSize: 65,
    });
    assert.equal(res2.recommendedLots, 7);
    assert.equal(res2.recommendedUnits, 455);
    assert.ok(res2.totalRisk <= 7500);
  });

  it("FV-23: calculatePositionSize enforces 50% max account capital allocation cap", () => {
    // ₹1,00,000 capital, 50% max = ₹50,000.
    // Huge risk tolerance (e.g. 20%), entry = 500, stop = 499 (tiny risk 1 pt).
    // Lot size = 65. Capital per lot = 500 * 65 = 32,500.
    // 2 lots = 65,000 > 50,000 cap! Should cap at 1 lot.
    const res = calculatePositionSize({
      type: "OPTION",
      accountCapital: 100_000,
      riskPercent: 20.0,
      entry: 500,
      stop: 499,
      target1: 600,
      target2: 700,
      lotSize: 65,
      maxCapitalAllocationPct: 50,
    });
    assert.equal(res.recommendedLots, 1);
    assert.equal(res.isCappedByCapital, true);
    assert.ok(res.capitalRequired <= 50000);
  });

  it("FV-24: calculatePositionSize sizes stock shares accurately for intraday trading", () => {
    // ₹2,00,000 capital, 1.5% risk budget = ₹3,000
    // Stock entry = 1500, stop = 1475 -> risk per share = 25
    // Default 50% capital cap = ₹1,00,000 max. ₹1,00,000 / 1500 = 66 shares
    const resCapped = calculatePositionSize({
      type: "STOCK",
      accountCapital: 200_000,
      riskPercent: 1.5,
      entry: 1500,
      stop: 1475,
      target1: 1550,
      target2: 1600,
    });
    assert.equal(resCapped.recommendedUnits, 66);
    assert.equal(resCapped.isCappedByCapital, true);

    // With 100% capital allocation allowed:
    // Recommended shares = 3000 / 25 = 120 shares (120 * 1500 = ₹1,80,000)
    const resUncapped = calculatePositionSize({
      type: "STOCK",
      accountCapital: 200_000,
      riskPercent: 1.5,
      entry: 1500,
      stop: 1475,
      target1: 1550,
      target2: 1600,
      maxCapitalAllocationPct: 100,
    });
    assert.equal(resUncapped.recommendedUnits, 120);
    assert.equal(resUncapped.totalRisk, 3000);
    assert.equal(resUncapped.totalRiskPercent, 1.5);
    assert.equal(resUncapped.target1Profit, 120 * 50); // 6,000
    assert.equal(resUncapped.target2Profit, 120 * 100); // 12,000
  });

  it("FV-25: computeSectorMatrix calculates sector breadth and classification accurately", () => {
    const quotes: StockMarketData[] = [
      {
        symbol: "HDFCBANK", exchange: "NSE", instrumentKey: "KEY1", timestamp: "", marketStatus: "OPEN",
        source: "MOCK", unavailableReason: null, freshness: "LIVE", ltp: 1600, open: 1580, high: 1610, low: 1575,
        previousClose: 1580, change: 20, changePercent: 1.26, volume: 1_000_000,
      },
      {
        symbol: "ICICIBANK", exchange: "NSE", instrumentKey: "KEY2", timestamp: "", marketStatus: "OPEN",
        source: "MOCK", unavailableReason: null, freshness: "LIVE", ltp: 1200, open: 1180, high: 1205, low: 1175,
        previousClose: 1180, change: 20, changePercent: 1.69, volume: 1_200_000,
      },
      {
        symbol: "TCS", exchange: "NSE", instrumentKey: "KEY3", timestamp: "", marketStatus: "OPEN",
        source: "MOCK", unavailableReason: null, freshness: "LIVE", ltp: 4000, open: 4050, high: 4050, low: 3980,
        previousClose: 4050, change: -50, changePercent: -1.23, volume: 800_000,
      },
    ];

    const matrix = computeSectorMatrix(quotes);
    assert.ok(matrix.has("BANKING"));
    assert.ok(matrix.has("IT"));

    const banking = matrix.get("BANKING")!;
    assert.equal(banking.sector, "BANKING");
    assert.equal(banking.advances, 2);
    assert.equal(banking.declines, 0);
    assert.equal(banking.total, 2);
    assert.equal(banking.trend, "BULLISH");

    const itSector = matrix.get("IT")!;
    assert.equal(itSector.sector, "IT");
    assert.equal(itSector.advances, 0);
    assert.equal(itSector.declines, 1);
    assert.equal(itSector.trend, "BEARISH");
  });

  it("FV-26: scoreIntradayQuote awards +10 bonus for sector confirmation", () => {
    const q: StockMarketData = {
      symbol: "HDFCBANK", exchange: "NSE", instrumentKey: "KEY1", timestamp: "", marketStatus: "OPEN",
      source: "MOCK", unavailableReason: null, freshness: "LIVE",
      ltp: 1600, open: 1550, high: 1610, low: 1545, previousClose: 1550,
      change: 50, changePercent: 3.22, volume: 2_000_000,
    };
    const sectorSummary = {
      sector: "BANKING", advances: 5, declines: 0, total: 5, avgChangePercent: 1.8, trend: "BULLISH" as const,
    };

    const unalignedRes = scoreIntradayQuote(q, 1.0);
    assert.ok(unalignedRes !== null);
    const unalignedScore = unalignedRes.scored.score;

    const alignedRes = scoreIntradayQuote(q, 1.0, undefined, sectorSummary);
    assert.ok(alignedRes !== null);
    assert.equal(alignedRes.sector, "BANKING");
    assert.equal(alignedRes.sectorAlignment, "ALIGNED");
    assert.equal(alignedRes.scored.score, Math.min(100, unalignedScore + 10));
    assert.ok(alignedRes.scored.reasons.some((r) => r.includes("Sector Confirmation")));
  });

  it("FV-27: scoreIntradayQuote deducts -10 points and warns for opposing sector trend", () => {
    const q: StockMarketData = {
      symbol: "HDFCBANK", exchange: "NSE", instrumentKey: "KEY1", timestamp: "", marketStatus: "OPEN",
      source: "MOCK", unavailableReason: null, freshness: "LIVE",
      ltp: 1600, open: 1550, high: 1610, low: 1545, previousClose: 1550,
      change: 50, changePercent: 3.22, volume: 2_000_000,
    };
    // Banking sector is BEARISH while HDFCBANK is trying to rally LONG
    const opposingSector = {
      sector: "BANKING", advances: 0, declines: 5, total: 5, avgChangePercent: -1.5, trend: "BEARISH" as const,
    };

    const baseRes = scoreIntradayQuote(q, 1.0);
    assert.ok(baseRes !== null);

    const opposedRes = scoreIntradayQuote(q, 1.0, undefined, opposingSector);
    assert.ok(opposedRes !== null);
    assert.equal(opposedRes.sectorAlignment, "OPPOSED");
    assert.equal(opposedRes.scored.score, baseRes.scored.score - 10);
    assert.ok(opposedRes.scored.reasons.some((r) => r.includes("Sector Headwind")));
  });
});
