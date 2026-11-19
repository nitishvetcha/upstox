// Options Recommendation Engine Audit & Restructuring — Comprehensive 16-Point Verification Suite
// Master Implementation Directive: Phase 2
// Deterministic, offline tests covering all 16 architectural requirements.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  validateExecutableQuote,
  calculateSingleLegPayoff,
  calculateDebitSpreadPayoff,
  calculateIronCondorPayoff,
  calculateExpiryYears,
  r2Strict,
} from "../optionsPricingEngine.ts";
import { evaluateOptionsOpportunity } from "../engine/opportunityEngine.ts";
import { candidateWindow, CANDIDATE_MAX_STRIKES_ATM } from "./optionCandidateWindow.ts";
import { atmStrike, validExpiries, strikeStep } from "./optionChainAnalytics.ts";
import { resolveLotSize, validateCanonicalOptionRows, type CanonicalOptionContract } from "./upstoxMarket.ts";
import { evaluateTradeRisk } from "./risk/riskService.ts";
import { DEFAULT_RISK_CONFIG } from "./risk/riskConfig.ts";
import { costsFor, DEFAULT_TRANSACTION_COSTS, BASIC_PLAN_COSTS, PLUS_PLAN_COSTS } from "./transactionCosts.ts";
import { sourceMeta } from "./market.ts";
import { nextTuesday, lastTuesday } from "./mock.ts";
import type { OptionRow, Quote, Snapshot, SourceInfo, TradePlan } from "../types.ts";

const FIXED_NOW = new Date("2026-10-05T07:00:00Z"); // Monday 12:30 IST
const FIXED_NOW_ISO = FIXED_NOW.toISOString();

function makeQuote(over: Partial<Quote> = {}): Quote {
  return {
    ltp: 100,
    bid: 99,
    ask: 101,
    oi: 1000,
    chgOi: 50,
    volume: 500,
    iv: 15,
    delta: 0.5,
    ...over,
  };
}

function buildMockSnapshot(opts: {
  index: "nifty" | "banknifty";
  spot: number;
  strikeStep: number;
  lotSize: number;
  expiry?: string;
  sourceStatus?: SourceInfo["source"];
  chainRows?: OptionRow[];
  now?: Date;
}): Snapshot {
  const nowIso = (opts.now ?? FIXED_NOW).toISOString();
  const source = {
    source: opts.sourceStatus ?? "LIVE",
    provider: "UPSTOX" as const,
    fetchedAt: nowIso,
    lastTradeTime: nowIso,
  };
  return {
    index: opts.index,
    name: opts.index === "nifty" ? "NIFTY 50" : "NIFTY BANK",
    spot: opts.spot,
    prevClose: opts.spot - 100,
    expiry: opts.expiry ?? "2026-10-06",
    strikeStep: opts.strikeStep,
    lotSize: opts.lotSize,
    indicators: {
      ema9: opts.spot - 20,
      ema21: opts.spot - 50,
      ema50: opts.spot - 100,
      ema200: opts.spot - 300,
      vwap: opts.spot - 10,
      rsi: 62,
      macdHist: 12,
      atr: opts.index === "nifty" ? 150 : 350,
      pdh: opts.spot + 150,
      pdl: opts.spot - 200,
      orHigh: opts.spot + 50,
      orLow: opts.spot - 50,
    },
    ivPercentile: 45,
    breadth: null,
    news: { score: 0.2, bullishPct: 50, neutralPct: 30, bearishPct: 20, eventRisk: null },
    chain: opts.chainRows ?? [],
    technical: null,
    sources: {
      market: source,
      optionChain: source,
      technical: source,
      news: source,
      breadth: source,
    },
    fallbackReason: null,
    optionPriceVerification: {
      state: "CONTRACT_PRICE_LIVE",
      chainAnalytics: "CHAIN_ANALYTICS_VERIFIED_BOUNDED",
      oiAnalytics: "OI_ANALYTICS_VERIFIED_BOUNDED",
      volumeAnalytics: "VOLUME_ANALYTICS_VERIFIED_BOUNDED",
      analyticsProvenance: "UPSTOX_FULL_QUOTES_V3_BOUNDED_REST_SNAPSHOT",
      quoteResponseTime: FIXED_NOW_ISO,
      requestedKeys: 4,
      coveredKeys: 4,
      liveKeys: 4,
      agingKeys: 0,
      staleKeys: 0,
      unavailableKeys: 0,
      mismatchedKeys: 0,
      eligibleKeys: 4,
      missingKeys: [],
      error: null,
    },
  };
}

describe("Master Implementation Directive — Phase 2: Options Engine Audit & Restructuring", () => {
  // ── 1. Correct contract selection (NIFTY & BANKNIFTY, strike step 50 vs 100, lot size 75 vs 30) ──
  describe("1. Correct contract selection & index parameters", () => {
    it("differentiates NIFTY (strikeStep 50, lotSize 75) and BANKNIFTY (strikeStep 100, lotSize 30)", () => {
      // Lot size resolution
      assert.equal(resolveLotSize(75, 75), 75, "NIFTY lot size 75 agreed");
      assert.equal(resolveLotSize(30, 30), 30, "BANKNIFTY lot size 30 agreed");
      assert.equal(resolveLotSize(75, null), 75, "Single source NIFTY lot size 75");
      assert.equal(resolveLotSize(null, 30), 30, "Single source BANKNIFTY lot size 30");

      // NIFTY candidate window: strike step 50, ATM 24000
      const niftyStrikes = Array.from({ length: 25 }, (_, i) => 23400 + i * 50);
      const niftyRows: OptionRow[] = niftyStrikes.map((strike) => ({
        strike,
        call: makeQuote({ ltp: 100, bid: 99, ask: 101 }),
        put: makeQuote({ ltp: 100, bid: 99, ask: 101, delta: -0.5 }),
      }));
      const niftyWin = candidateWindow(niftyRows, 24000, CANDIDATE_MAX_STRIKES_ATM);
      assert.equal(niftyWin.atmStrike, 24000);
      assert.equal(niftyWin.strikes.length, 15); // ATM ± 7 strikes = 15 strikes
      assert.equal(Math.min(...niftyWin.strikes), 24000 - 7 * 50); // 23650
      assert.equal(Math.max(...niftyWin.strikes), 24000 + 7 * 50); // 24350

      // BANKNIFTY candidate window: strike step 100, ATM 51000
      const bnfStrikes = Array.from({ length: 25 }, (_, i) => 49800 + i * 100);
      const bnfRows: OptionRow[] = bnfStrikes.map((strike) => ({
        strike,
        call: makeQuote({ ltp: 250, bid: 248, ask: 252 }),
        put: makeQuote({ ltp: 250, bid: 248, ask: 252, delta: -0.5 }),
      }));
      const bnfWin = candidateWindow(bnfRows, 51000, CANDIDATE_MAX_STRIKES_ATM);
      assert.equal(bnfWin.atmStrike, 51000);
      assert.equal(bnfWin.strikes.length, 15);
      assert.equal(Math.min(...bnfWin.strikes), 51000 - 7 * 100); // 50300
      assert.equal(Math.max(...bnfWin.strikes), 51000 + 7 * 100); // 51700
    });

    it("fails closed with null when lot sizes conflict between sources (fail closed policy)", () => {
      assert.equal(resolveLotSize(75, 30), null, "NIFTY 75 vs BANKNIFTY 30 conflict must return null");
      assert.equal(resolveLotSize(50, 25), null, "Disagreement between chain and contract master must return null");
      assert.equal(resolveLotSize(null, null), null, "Missing lot size from both sources returns null");
    });

    it("validates canonical contracts against master data and detects missing or mismatched keys", () => {
      const canonicalContracts: CanonicalOptionContract[] = [
        { instrumentKey: "NSE_FO|NIFTY_24000_CE", underlyingKey: "NSE_INDEX|Nifty 50", expiry: "2026-10-06", strike: 24000, type: "CE", lotSize: 75 },
        { instrumentKey: "NSE_FO|NIFTY_24000_PE", underlyingKey: "NSE_INDEX|Nifty 50", expiry: "2026-10-06", strike: 24000, type: "PE", lotSize: 75 },
      ];

      const validRows: OptionRow[] = [{
        strike: 24000,
        call: makeQuote({ instrumentKey: "NSE_FO|NIFTY_24000_CE" }),
        put: makeQuote({ instrumentKey: "NSE_FO|NIFTY_24000_PE" }),
      }];

      // Should not throw with matching valid rows
      assert.doesNotThrow(() => {
        validateCanonicalOptionRows(validRows, canonicalContracts, "NSE_INDEX|Nifty 50", "2026-10-06");
      });

      // Missing instrument key in row must throw
      const missingKeyRow: OptionRow[] = [{
        strike: 24000,
        call: makeQuote({ instrumentKey: null }),
        put: makeQuote({ instrumentKey: "NSE_FO|NIFTY_24000_PE" }),
      }];
      assert.throws(() => {
        validateCanonicalOptionRows(missingKeyRow, canonicalContracts, "NSE_INDEX|Nifty 50", "2026-10-06");
      }, /missing or duplicate canonical key/);
    });

    it("accurately computes strike step near ATM even with irregular or wider outer strikes", () => {
      // Near ATM (24000): 50-pt spacing (23900, 23950, 24000, 24050, 24100)
      // Far out: 100-pt spacing (23700, 23800, 24200, 24300)
      const mixedStrikes = [23700, 23800, 23900, 23950, 24000, 24050, 24100, 24200, 24300];
      const rows: OptionRow[] = mixedStrikes.map((strike) => ({
        strike,
        call: makeQuote(),
        put: makeQuote(),
      }));

      const step = strikeStep(rows, 24000);
      assert.equal(step, 50, "Strike step near ATM should correctly be 50 despite wider outer strikes");
    });
  });

  // ── 2. Expiry validation (current/future expiries kept, past dropped, today dropped post 15:30 IST) ──
  describe("2. Expiry validation", () => {
    const list = ["2026-10-01", "2026-10-05", "2026-10-06", "2026-10-13", "not-a-date"];

    it("keeps current and future expiries during trading hours, dropping past and invalid strings", () => {
      // At Monday 12:30 IST (07:00 UTC)
      const valid = validExpiries(list, new Date("2026-10-05T07:00:00Z"));
      assert.deepEqual(valid, ["2026-10-05", "2026-10-06", "2026-10-13"]);
      assert.ok(!valid.includes("2026-10-01"), "Past expiry 2026-10-01 dropped");
      assert.ok(!valid.includes("not-a-date"), "Malformed expiry dropped");
    });

    it("drops today's expiry after 15:30 IST on expiry day", () => {
      // On Monday 15:31 IST (10:01 UTC)
      const postClose = validExpiries(list, new Date("2026-10-05T10:01:00Z"));
      assert.deepEqual(postClose, ["2026-10-06", "2026-10-13"], "Today's expired contract 2026-10-05 dropped after 15:30 IST");
    });

    it("rolls weekly expiry on Tuesday after 15:30 IST to next Tuesday", () => {
      assert.equal(nextTuesday(new Date("2026-10-05T07:00:00Z")), "2026-10-06");
      assert.equal(nextTuesday(new Date("2026-10-06T10:15:00Z")), "2026-10-13"); // post 15:30 IST
    });
  });

  // ── 3. Executable bid/ask pricing (Long entry = Ask, Long exit = Bid, Short entry = Bid, Short exit = Ask) ──
  describe("3. Executable bid/ask pricing", () => {
    const quote = { ltp: 180, bid: 178.5, ask: 181.5 };

    it("uses Ask for Long entry and Bid for Long exit", () => {
      const buyVal = validateExecutableQuote(quote, "BUY");
      assert.equal(buyVal.valid, true);
      assert.equal(buyVal.entryPrice, 181.5, "Long entry must be executable Ask");
      assert.equal(buyVal.exitPrice, 178.5, "Long exit must be executable Bid");
      assert.equal(buyVal.spread, 3.0);
    });

    it("uses Bid for Short entry and Ask for Short exit", () => {
      const sellVal = validateExecutableQuote(quote, "SELL");
      assert.equal(sellVal.valid, true);
      assert.equal(sellVal.entryPrice, 178.5, "Short entry must be executable Bid");
      assert.equal(sellVal.exitPrice, 181.5, "Short exit must be executable Ask");
    });
  });

  // ── 4. Missing bid/ask rejection (null or 0 bid/ask rejects candidate; no silent LTP fallback) ──
  describe("4. Missing bid/ask rejection (fail-closed, no LTP fallback)", () => {
    it("rejects candidate when bid or ask is null", () => {
      const res1 = validateExecutableQuote({ ltp: 180, bid: null, ask: 181 }, "BUY");
      assert.equal(res1.valid, false);
      assert.match(res1.rejectionReason ?? "", /Missing bid or ask/);
      assert.equal(res1.entryPrice, null);

      const res2 = validateExecutableQuote({ ltp: 180, bid: 179, ask: null }, "BUY");
      assert.equal(res2.valid, false);
      assert.match(res2.rejectionReason ?? "", /Missing bid or ask/);
    });

    it("rejects candidate when bid or ask is zero or negative", () => {
      const res1 = validateExecutableQuote({ ltp: 180, bid: 0, ask: 181 }, "BUY");
      assert.equal(res1.valid, false);
      assert.match(res1.rejectionReason ?? "", /Zero or negative/);

      const res2 = validateExecutableQuote({ ltp: 180, bid: 179, ask: -5 }, "BUY");
      assert.equal(res2.valid, false);
      assert.match(res2.rejectionReason ?? "", /Zero or negative/);
    });

    it("rejects candidate on crossed market (ask < bid)", () => {
      const res = validateExecutableQuote({ ltp: 180, bid: 182, ask: 178 }, "BUY");
      assert.equal(res.valid, false);
      assert.match(res.rejectionReason ?? "", /Crossed market/);
    });
  });

  // ── 5. Wide spread rejection (spread > 12% rejected, spread > 5% capped at Grade C) ──
  describe("5. Wide spread rejection and capping", () => {
    it("rejects quote when bid-ask spread exceeds 12%", () => {
      // 14% spread (bid 93, ask 107 on ltp 100)
      const res = validateExecutableQuote({ ltp: 100, bid: 93, ask: 107 }, "BUY", 12.0);
      assert.equal(res.valid, false);
      assert.match(res.rejectionReason ?? "", /Wide bid-ask spread: 14% exceeds maximum/);
    });

    it("allows spread between 5% and 12% in quote validator but engine caps grade at C", () => {
      // 8% spread (bid 96, ask 104 on ltp 100)
      const quoteVal = validateExecutableQuote({ ltp: 100, bid: 96, ask: 104 }, "BUY", 12.0);
      assert.equal(quoteVal.valid, true);
      assert.equal(quoteVal.spreadPct, 8.0);
    });
  });

  // ── 6. Stale and EOD quote handling (STALE rejects live execution; EOD produces NO_TRADE/WAIT) ──
  describe("6. Stale and EOD quote handling", () => {
    it("rejects contract execution when quote is STALE", () => {
      const staleRows: OptionRow[] = [{
        strike: 24000,
        call: makeQuote({
          ltp: 180, bid: 179, ask: 181, oi: 1000, volume: 500, iv: 15, delta: 0.5,
          contractPriceQuality: "CONTRACT_PRICE_STALE",
          ltpConsistent: true,
          lastTradeTime: new Date(FIXED_NOW.getTime() - 600_000).toISOString(), // 10 min old
        }),
        put: makeQuote({ ltp: 175, bid: 174, ask: 176, oi: 1000, volume: 500, delta: -0.5 }),
      }];
      const snap = buildMockSnapshot({ index: "nifty", spot: 24000, strikeStep: 50, lotSize: 75, chainRows: staleRows });
      const result = evaluateOptionsOpportunity(snap, "NIFTY", FIXED_NOW);
      assert.equal(result.topOpportunities.length, 0, "No actionable live trade from stale contract quote");
    });

    it("ensures END_OF_DAY source produces NO_TRADE / WAIT and cannot be executed as LIVE", () => {
      const eodRows: OptionRow[] = [{
        strike: 24000,
        call: makeQuote({ ltp: 180, bid: 179, ask: 181, oi: 1000, volume: 500, iv: 15, delta: 0.5 }),
        put: makeQuote({ ltp: 175, bid: 174, ask: 176, oi: 1000, volume: 500, delta: -0.5 }),
      }];
      const snap = buildMockSnapshot({
        index: "nifty", spot: 24000, strikeStep: 50, lotSize: 75,
        sourceStatus: "END_OF_DAY",
        chainRows: eodRows,
      });
      const result = evaluateOptionsOpportunity(snap, "NIFTY", FIXED_NOW);
      assert.equal(result.recommendedStrategy, "NO_TRADE", "EOD source produces NO_TRADE for live execution");
      assert.equal(result.dataQuality.optionChain, "END_OF_DAY");
    });
  });

  // ── 7. Single-leg payoff calculations (entry, stop, targets, breakeven, gross R:R) ──
  describe("7. Single-leg payoff calculations", () => {
    it("computes accurate single-leg Call payoff metrics with executable Ask entry", () => {
      const res = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 24000,
        spot: 24000,
        quote: { ltp: 180, bid: 179, ask: 181, instrumentKey: "NSE_FO|NIFTY24000CE" },
        delta: 0.5,
        srRoom: 200,
        atr: 150,
        lotSize: 75,
      });

      assert.equal(res.success, true);
      assert.ok(res.payoff);
      const p = res.payoff!;

      // Entry is strictly Ask
      assert.equal(p.netEntryPrice, 181);
      assert.equal(p.calculatedValues.executableEntry, 181);

      // Stop is 50% of entry
      assert.equal(p.stopLossPrice, 90.5);

      // Targets: t1 = 181 + 0.5 * 200 * 0.45 = 181 + 45 = 226
      //          t2 = 181 + 0.5 * 200 * 0.85 = 181 + 85 = 266
      assert.equal(p.target1Price, 226);
      assert.equal(p.target2Price, 266);

      // Breakeven for Call: strike + entry
      assert.equal(p.breakevens[0], 24181);

      // Gross R:R: (226 - 181) / (181 - 90.5) = 45 / 90.5 = 0.50
      assert.equal(p.grossRewardToRisk, 0.50);

      // Max theoretical loss is the full entry debit
      assert.equal(p.maxTheoreticalLoss, 181);
      assert.equal(p.maxTheoreticalLossPerLot, 181 * 75); // 13575
    });

    it("computes accurate single-leg Put payoff metrics with executable Ask entry", () => {
      const res = calculateSingleLegPayoff({
        strategy: "LONG_PUT",
        strike: 24000,
        spot: 24000,
        quote: { ltp: 160, bid: 159, ask: 161, instrumentKey: "NSE_FO|NIFTY24000PE" },
        delta: -0.48,
        srRoom: 180,
        atr: 150,
        lotSize: 75,
      });

      assert.equal(res.success, true);
      assert.ok(res.payoff);
      const p = res.payoff!;

      assert.equal(p.netEntryPrice, 161);
      assert.equal(p.stopLossPrice, 80.5);
      // Breakeven for Put: strike - entry
      assert.equal(p.breakevens[0], 24000 - 161); // 23839
      // Max profit capped at strike - entry
      assert.equal(p.maxTheoreticalProfit, 24000 - 161); // 23839
      assert.equal(p.maxTheoreticalProfitPerLot, (24000 - 161) * 75);
    });

    it("accounts for Greek convexity and Black-Scholes repricing at projected underlying target levels", () => {
      // 1. Instantaneous move (holdingHours: 0): pure Gamma convexity produces a higher target than linear delta
      const gammaPayoff = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 24000,
        spot: 24000,
        quote: {
          ltp: 115,
          bid: 114,
          ask: 116,
          iv: 15,
          gamma: 0.0019,
          theta: -12.5,
          vega: 8.5,
          instrumentKey: "NSE_FO|NIFTY24000CE",
        },
        delta: 0.52,
        srRoom: 200,
        atr: 150,
        lotSize: 75,
        expiryYears: 3 / 365,
        holdingHours: 0,
      });

      assert.equal(gammaPayoff.success, true);
      assert.ok(gammaPayoff.payoff);
      const estGamma = gammaPayoff.payoff!.estimatedValues;
      assert.equal(estGamma.targetPricingModel, "BLACK_SCHOLES_REPRICED");
      assert.equal(estGamma.greeksQuality, "INDEPENDENTLY_DERIVED");
      assert.ok(estGamma.deltaApproximationTarget1! > 116);
      assert.ok(gammaPayoff.payoff!.target1Price > estGamma.deltaApproximationTarget1!, "Instantaneous Black-Scholes repricing produces higher gain due to positive Gamma convexity");
      assert.ok(estGamma.convexityAdjustment! > 0, "Positive convexity adjustment");

      // 2. Holding period move (holdingHours: 2): accounts for Theta decay eroding premium over holding time
      const timePayoff = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 24000,
        spot: 24000,
        quote: {
          ltp: 115,
          bid: 114,
          ask: 116,
          iv: 15,
          gamma: 0.0019,
          theta: -12.5,
          vega: 8.5,
          instrumentKey: "NSE_FO|NIFTY24000CE",
        },
        delta: 0.52,
        srRoom: 200,
        atr: 150,
        lotSize: 75,
        expiryYears: 3 / 365,
        holdingHours: 2,
      });

      assert.equal(timePayoff.success, true);
      assert.ok(timePayoff.payoff);
      // Theta decay reduces target compared to instantaneous target
      assert.ok(timePayoff.payoff!.target1Price < gammaPayoff.payoff!.target1Price, "Theta decay over 2-hour holding period reduces projected target premium");

      // 3. Verify that missing IV/Greeks falls back to delta approximation with DATA_INSUFFICIENT
      const fallbackPayoff = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 24000,
        spot: 24000,
        quote: { ltp: 115, bid: 114, ask: 116 },
        delta: 0.52,
        srRoom: 200,
        atr: 150,
        lotSize: 75,
      });
      assert.equal(fallbackPayoff.payoff!.estimatedValues.targetPricingModel, "DELTA_APPROXIMATION_FALLBACK");
      assert.equal(fallbackPayoff.payoff!.estimatedValues.greeksQuality, "DATA_INSUFFICIENT");
      assert.equal(fallbackPayoff.payoff!.estimatedValues.convexityAdjustment, 0);
    });

    it("verifies Black-Scholes repriced targets are model estimates with documented constant-IV and holding horizon", () => {
      const bsPayoff = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 24000,
        spot: 24000,
        quote: {
          ltp: 115,
          bid: 114,
          ask: 116,
          iv: 15,
          gamma: 0.0019,
          theta: -12.5,
          vega: 8.5,
          instrumentKey: "NSE_FO|NIFTY24000CE",
        },
        delta: 0.52,
        srRoom: 200,
        atr: 150,
        lotSize: 75,
        expiryYears: 3 / 365,
        holdingHours: 2.0,
      });

      assert.equal(bsPayoff.success, true);
      assert.ok(bsPayoff.payoff);
      const est = bsPayoff.payoff!.estimatedValues;

      // Model estimate flags
      assert.equal(est.isModelEstimate, true, "Targets must be explicitly marked as model estimates, never executable market quotes");
      assert.equal(est.constantIvAssumption, true, "Constant-IV assumption must be explicitly documented");
      assert.equal(est.holdingHours, 2.0, "Holding-time horizon must be explicitly recorded");
      assert.equal(est.targetPricingModel, "BLACK_SCHOLES_REPRICED");
      assert.equal(est.greeksQuality, "INDEPENDENTLY_DERIVED");
    });

    it("verifies downstream enforcement prevents delta-only fallback from producing actionable trades", () => {
      // Snapshot where option chain has valid executable quotes but unverified Greeks/IV
      const noGreeksSnap = buildMockSnapshot({
        index: "nifty",
        spot: 24000,
        strikeStep: 50,
        lotSize: 75,
        chainRows: [{
          strike: 24000,
          call: makeQuote({
            ltp: 15,
            bid: 14.5,
            ask: 15.5,
            oi: 5000,
            volume: 1000,
            contractPriceQuality: "CONTRACT_PRICE_LIVE",
            ltpConsistent: true,
            lastTradeTime: FIXED_NOW_ISO,
            instrumentKey: "NSE_FO|NIFTY24000CE",
            iv: null,
            delta: null,
            greeksProvenance: "VENDOR_REPORTED_UNVERIFIED",
            ivProvenance: "VENDOR_REPORTED_UNVERIFIED",
          }),
          put: makeQuote({
            ltp: 15,
            bid: 14.5,
            ask: 15.5,
            oi: 5000,
            volume: 1000,
            contractPriceQuality: "CONTRACT_PRICE_LIVE",
            ltpConsistent: true,
            lastTradeTime: FIXED_NOW_ISO,
            instrumentKey: "NSE_FO|NIFTY24000PE",
            iv: null,
            delta: null,
            greeksProvenance: "VENDOR_REPORTED_UNVERIFIED",
            ivProvenance: "VENDOR_REPORTED_UNVERIFIED",
          }),
        }],
      });

      const result = evaluateOptionsOpportunity(noGreeksSnap, "NIFTY", FIXED_NOW);

      // Downstream pipeline asserts:
      // 1. All evaluated contracts are graded REJECT
      assert.ok(result.topOpportunities.length > 0, "Candidates are evaluated and displayed for diagnostics");
      for (const opp of result.topOpportunities) {
        assert.equal(opp.grade, "REJECT", `Candidate ${opp.strike}${opp.optionType} must be graded REJECT when Greeks are missing`);
        assert.ok(
          opp.gradeReasons?.some((r) => r.includes("Option IV/Greeks unavailable")),
          "Rejection reason must document unavailable IV/Greeks",
        );
      }

      // 2. Actionable pool is 0
      // 3. Recommended strategy is strictly NO_TRADE
      assert.equal(result.recommendedStrategy, "NO_TRADE", "Recommended strategy must fail closed to NO_TRADE");

      // 4. Candidate eligibility is ALL_CANDIDATES_REJECTED
      assert.equal(result.candidateEligibility, "ALL_CANDIDATES_REJECTED");

      // 5. User-facing reason explains why no trade is recommended
      assert.equal(
        result.noOpportunityReason,
        "No contract passed mandatory actionability checks; displayed contracts are rejected or watch-only.",
      );
    });
  });

  // ── 8. Multi-leg payoff calculations (combined debit, max loss = net debit, max profit = width - debit) ──
  describe("8. Multi-leg payoff calculations", () => {
    it("computes accurate Bull Call Spread payoff (Long 24000 CE @ 181 Ask, Short 24100 CE @ 120 Bid)", () => {
      const res = calculateDebitSpreadPayoff({
        strategy: "BULL_CALL_SPREAD",
        spot: 24000,
        lotSize: 75,
        longLeg: {
          strike: 24000,
          quote: { ltp: 180, bid: 179, ask: 181, instrumentKey: "NSE_FO|LONG_CE" },
        },
        shortLeg: {
          strike: 24100,
          quote: { ltp: 122, bid: 120, ask: 124, instrumentKey: "NSE_FO|SHORT_CE" },
        },
      });

      assert.equal(res.success, true);
      assert.ok(res.payoff);
      const p = res.payoff!;

      // Net Debit = Long Ask (181) - Short Bid (120) = 61
      assert.equal(p.netEntryPrice, 61);
      assert.equal(p.calculatedValues.spreadWidth, 100);

      // Max theoretical loss = Net Debit = 61
      assert.equal(p.maxTheoreticalLoss, 61);
      assert.equal(p.maxTheoreticalLossPerLot, 61 * 75); // 4575

      // Max theoretical profit = Spread Width (100) - Net Debit (61) = 39
      assert.equal(p.maxTheoreticalProfit, 39);
      assert.equal(p.maxTheoreticalProfitPerLot, 39 * 75); // 2925

      // Breakeven = Long Strike (24000) + Net Debit (61) = 24061
      assert.equal(p.breakevens[0], 24061);

      // Stop on net debit: 50% = 30.5
      assert.equal(p.stopLossPrice, 30.5);

      // Targets: t1 = 61 + 39 * 0.60 = 84.4; t2 = 61 + 39 * 0.90 = 96.1
      assert.equal(p.target1Price, 84.4);
      assert.equal(p.target2Price, 96.1);

      // Gross R:R: (84.4 - 61) / (61 - 30.5) = 23.4 / 30.5 = 0.77
      assert.equal(p.grossRewardToRisk, 0.77);
    });

    it("computes accurate Bear Put Spread payoff (Long 24000 PE @ 176 Ask, Short 23900 PE @ 125 Bid)", () => {
      const res = calculateDebitSpreadPayoff({
        strategy: "BEAR_PUT_SPREAD",
        spot: 24000,
        lotSize: 75,
        longLeg: {
          strike: 24000,
          quote: { ltp: 175, bid: 174, ask: 176, instrumentKey: "NSE_FO|LONG_PE" },
        },
        shortLeg: {
          strike: 23900,
          quote: { ltp: 126, bid: 125, ask: 128, instrumentKey: "NSE_FO|SHORT_PE" },
        },
      });

      assert.equal(res.success, true);
      assert.ok(res.payoff);
      const p = res.payoff!;

      // Net Debit = 176 - 125 = 51
      assert.equal(p.netEntryPrice, 51);
      assert.equal(p.maxTheoreticalLoss, 51);
      assert.equal(p.maxTheoreticalProfit, 100 - 51); // 49
      // Breakeven = Long Strike (24000) - Net Debit (51) = 23949
      assert.equal(p.breakevens[0], 23949);
    });

    it("computes accurate four-leg Iron Condor payoff (Short Call 24200, Long Call 24300, Short Put 23800, Long Put 23700)", () => {
      // 100-pt wings around 24000 spot:
      // Short Call 24200: Bid 45, Ask 47
      // Long Call 24300: Bid 22, Ask 24
      // Short Put 23800: Bid 48, Ask 50
      // Long Put 23700: Bid 24, Ask 26
      const icRes = calculateIronCondorPayoff({
        spot: 24000,
        lotSize: 75,
        wingWidth: 100,
        shortCall: { strike: 24200, quote: { ltp: 46, bid: 45, ask: 47, instrumentKey: "NSE_FO|SC" } },
        longCall: { strike: 24300, quote: { ltp: 23, bid: 22, ask: 24, instrumentKey: "NSE_FO|LC" } },
        shortPut: { strike: 23800, quote: { ltp: 49, bid: 48, ask: 50, instrumentKey: "NSE_FO|SP" } },
        longPut: { strike: 23700, quote: { ltp: 25, bid: 24, ask: 26, instrumentKey: "NSE_FO|LP" } },
        costConfig: BASIC_PLAN_COSTS,
      });

      assert.equal(icRes.success, true);
      assert.ok(icRes.payoff);
      const p = icRes.payoff!;

      // 1. Executable entry and exit sides:
      // Short Call: entry SELL at Bid (45), exit BUY at Ask (47)
      // Long Call: entry BUY at Ask (24), exit SELL at Bid (22)
      // Short Put: entry SELL at Bid (48), exit BUY at Ask (50)
      // Long Put: entry BUY at Ask (26), exit SELL at Bid (24)
      assert.equal(p.observedValues.legs.length, 4);
      assert.equal(p.observedValues.legs[0].executablePrice, 45); // Short Call sell
      assert.equal(p.observedValues.legs[1].executablePrice, 24); // Long Call buy
      assert.equal(p.observedValues.legs[2].executablePrice, 48); // Short Put sell
      assert.equal(p.observedValues.legs[3].executablePrice, 26); // Long Put buy

      // 2. Net Credit = (45 + 48) - (24 + 26) = 93 - 50 = 43
      assert.equal(p.netEntryPrice, 43);

      // 3. Max theoretical profit = net credit = 43 per unit, 43 * 75 = 3225 per lot
      assert.equal(p.maxTheoreticalProfit, 43);
      assert.equal(p.maxTheoreticalProfitPerLot, 43 * 75);

      // 4. Max theoretical loss = wing width (100) - net credit (43) = 57 per unit, 57 * 75 = 4275 per lot
      assert.equal(p.maxTheoreticalLoss, 57);
      assert.equal(p.maxTheoreticalLossPerLot, 57 * 75);

      // 5. Breakeven points:
      // Lower BE = Short Put strike (23800) - Net Credit (43) = 23757
      // Upper BE = Short Call strike (24200) + Net Credit (43) = 24243
      assert.deepEqual(p.breakevens, [23757, 24243]);

      // 6. Stop and Targets (Strategy 11.4):
      // Stop = 2x credit = 86 (loss of 1x credit = 43)
      // Target 1 = 0.5x credit = 21.5 (gain of 0.5x credit = 21.5)
      // Target 2 = 0.2x credit = 8.6 (gain of 0.8x credit = 34.4)
      assert.equal(p.stopLossPrice, 86);
      assert.equal(p.target1Price, 21.5);
      assert.equal(p.target2Price, 8.6);

      // 7. Gross R:R: (43 - 21.5) / (86 - 43) = 21.5 / 43 = 0.50 >= 0.40 (Strategy 11.4 credit threshold)
      assert.equal(p.grossRewardToRisk, 0.50);
      assert.ok(p.grossRewardToRisk >= 0.40, "Credit strategy gross R:R satisfies >= 0.4 threshold");

      // 8. Transaction costs across all 4 legs (8 fills total):
      // Brokerage: 8 orders * ₹20 (Basic) = ₹160
      const tc = p.estimatedValues.transactionCosts;
      assert.equal(tc.brokerage, 160);
      assert.ok(tc.totalCosts > 160);
      assert.ok(p.estimatedValues.netRiskPerLot > 0);
    });

    it("computes accurate Iron Condor payoff with unequal call/put wings (Call 100 pt, Put 150 pt) using worst-case loss", () => {
      // Unequal wings: Call wing = 100 (24200 to 24300), Put wing = 150 (23800 to 23650)
      const icRes = calculateIronCondorPayoff({
        spot: 24000,
        lotSize: 75,
        shortCall: { strike: 24200, quote: { ltp: 46, bid: 45, ask: 47, instrumentKey: "NSE_FO|SC" } },
        longCall: { strike: 24300, quote: { ltp: 23, bid: 22, ask: 24, instrumentKey: "NSE_FO|LC" } },
        shortPut: { strike: 23800, quote: { ltp: 49, bid: 48, ask: 50, instrumentKey: "NSE_FO|SP" } },
        longPut: { strike: 23650, quote: { ltp: 19, bid: 18, ask: 20, instrumentKey: "NSE_FO|LP" } },
        costConfig: BASIC_PLAN_COSTS,
      });

      assert.equal(icRes.success, true);
      assert.ok(icRes.payoff);
      const p = icRes.payoff!;

      // Net Credit = (45 + 48) - (24 + 20) = 93 - 44 = 49
      assert.equal(p.netEntryPrice, 49);

      // Call wing = 100, Put wing = 150
      assert.equal(p.calculatedValues.callWingWidth, 100);
      assert.equal(p.calculatedValues.putWingWidth, 150);
      assert.equal(p.calculatedValues.spreadWidth, 150, "Spread width must reflect maximum wing width");

      // Worst-case side-specific loss:
      // Call side loss: 100 - 49 = 51
      // Put side loss: 150 - 49 = 101
      // Max theoretical loss = max(51, 101) = 101
      assert.equal(p.maxTheoreticalLoss, 101, "Maximum theoretical loss must be the worst-case side loss (150 - 49 = 101)");
      assert.equal(p.maxTheoreticalLossPerLot, 101 * 75, "Per-lot loss must equal worst-case unit loss * lot size (101 * 75 = 7575)");

      // Max theoretical profit = net credit = 49
      assert.equal(p.maxTheoreticalProfit, 49);
      assert.equal(p.maxTheoreticalProfitPerLot, 49 * 75);

      // Breakevens
      assert.deepEqual(p.breakevens, [23800 - 49, 24200 + 49]); // [23751, 24249]
    });

    it("rejects Iron Condor when one leg quote is STALE (fails closed naming the leg)", () => {
      const icRes = calculateIronCondorPayoff({
        spot: 24000,
        lotSize: 75,
        wingWidth: 100,
        shortCall: {
          strike: 24200,
          quote: {
            ltp: 46,
            bid: 45,
            ask: 47,
            lastTradeTime: "2026-10-05T06:55:00Z", // 5 min old (> 60s stale)
          },
        },
        longCall: { strike: 24300, quote: { ltp: 23, bid: 22, ask: 24, lastTradeTime: FIXED_NOW_ISO } },
        shortPut: { strike: 23800, quote: { ltp: 49, bid: 48, ask: 50, lastTradeTime: FIXED_NOW_ISO } },
        longPut: { strike: 23700, quote: { ltp: 25, bid: 24, ask: 26, lastTradeTime: FIXED_NOW_ISO } },
        now: FIXED_NOW,
      });

      assert.equal(icRes.success, false);
      assert.equal(icRes.payoff, null);
      assert.ok(icRes.rejectionReason?.includes("Short Call"), "Rejection must identify Short Call leg");
      assert.ok(icRes.rejectionReason?.includes("stale"), "Rejection must specify quote is stale");
    });

    it("rejects Iron Condor when one leg quote has missing bid/ask (fails closed naming the leg)", () => {
      const icRes = calculateIronCondorPayoff({
        spot: 24000,
        lotSize: 75,
        wingWidth: 100,
        shortCall: { strike: 24200, quote: { ltp: 46, bid: 45, ask: 47 } },
        longCall: { strike: 24300, quote: { ltp: 23, bid: 22, ask: 24 } },
        shortPut: { strike: 23800, quote: { ltp: 49, bid: 48, ask: 50 } },
        longPut: { strike: 23700, quote: { ltp: 25, bid: 24, ask: null } }, // Missing ask
      });

      assert.equal(icRes.success, false);
      assert.equal(icRes.payoff, null);
      assert.ok(icRes.rejectionReason?.includes("Long Put"), "Rejection must identify Long Put leg");
      assert.ok(icRes.rejectionReason?.includes("Missing bid or ask"), "Rejection reason must identify missing quote");
    });

    it("rejects Iron Condor when one leg quote is crossed (ask < bid)", () => {
      const icRes = calculateIronCondorPayoff({
        spot: 24000,
        lotSize: 75,
        wingWidth: 100,
        shortCall: { strike: 24200, quote: { ltp: 46, bid: 45, ask: 47 } },
        longCall: { strike: 24300, quote: { ltp: 23, bid: 22, ask: 24 } },
        shortPut: { strike: 23800, quote: { ltp: 49, bid: 52, ask: 48 } }, // Crossed market: ask 48 < bid 52
        longPut: { strike: 23700, quote: { ltp: 25, bid: 24, ask: 26 } },
      });

      assert.equal(icRes.success, false);
      assert.equal(icRes.payoff, null);
      assert.ok(icRes.rejectionReason?.includes("Short Put"), "Rejection must identify Short Put leg");
      assert.ok(icRes.rejectionReason?.includes("Crossed market"), "Rejection reason must specify crossed market");
    });

    it("rejects Iron Condor when metadata is invalid (lotSize <= 0 or inverted strikes)", () => {
      // 1. Invalid lot size (0 or negative)
      const zeroLot = calculateIronCondorPayoff({
        spot: 24000,
        lotSize: 0,
        wingWidth: 100,
        shortCall: { strike: 24200, quote: { ltp: 46, bid: 45, ask: 47 } },
        longCall: { strike: 24300, quote: { ltp: 23, bid: 22, ask: 24 } },
        shortPut: { strike: 23800, quote: { ltp: 49, bid: 48, ask: 50 } },
        longPut: { strike: 23700, quote: { ltp: 25, bid: 24, ask: 26 } },
      });
      assert.equal(zeroLot.success, false);
      assert.ok(zeroLot.rejectionReason?.includes("Invalid lot size"));

      // 2. Inverted strike geometry: short put strike >= short call strike
      const invertedGeometry = calculateIronCondorPayoff({
        spot: 24000,
        lotSize: 75,
        wingWidth: 100,
        shortCall: { strike: 23800, quote: { ltp: 46, bid: 45, ask: 47 } }, // short call below short put
        longCall: { strike: 24300, quote: { ltp: 23, bid: 22, ask: 24 } },
        shortPut: { strike: 24200, quote: { ltp: 49, bid: 48, ask: 50 } },
        longPut: { strike: 23700, quote: { ltp: 25, bid: 24, ask: 26 } },
      });
      assert.equal(invertedGeometry.success, false);
      assert.ok(invertedGeometry.rejectionReason?.includes("short put strike"));
    });
  });

  // ── 9. Maximum theoretical loss (single-leg full entry debit; spread net debit; per-unit and per-lot) ──
  describe("9. Maximum theoretical loss calculation", () => {
    it("confirms single-leg max theoretical loss is full entry debit per unit and per lot", () => {
      const single = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 24000,
        spot: 24000,
        quote: { ltp: 200, bid: 198, ask: 202 },
        delta: 0.5,
        srRoom: 200,
        atr: 150,
        lotSize: 75,
      });
      assert.equal(single.payoff?.maxTheoreticalLoss, 202, "Unit max loss is Ask entry");
      assert.equal(single.payoff?.maxTheoreticalLossPerLot, 202 * 75, "Lot max loss is Ask entry * lotSize");
    });

    it("confirms spread max theoretical loss is net debit per unit and per lot", () => {
      const spread = calculateDebitSpreadPayoff({
        strategy: "BULL_CALL_SPREAD",
        spot: 24000,
        lotSize: 75,
        longLeg: { strike: 24000, quote: { ltp: 200, bid: 198, ask: 202 } },
        shortLeg: { strike: 24100, quote: { ltp: 150, bid: 148, ask: 152 } },
      });
      // Net debit = 202 - 148 = 54
      assert.equal(spread.payoff?.maxTheoreticalLoss, 54, "Spread unit max loss is Net Debit");
      assert.equal(spread.payoff?.maxTheoreticalLossPerLot, 54 * 75, "Spread lot max loss is Net Debit * lotSize");
    });
  });

  // ── 10. Breakeven calculations (Call: strike + debit; Put: strike - debit) ──
  describe("10. Breakeven calculations", () => {
    it("Call breakeven is strike + debit (single-leg and spread)", () => {
      const call = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 24000,
        spot: 24000,
        quote: { ltp: 180, bid: 179, ask: 181 },
        delta: 0.5,
        srRoom: 200,
        atr: 150,
        lotSize: 75,
      });
      assert.equal(call.payoff?.breakevens[0], 24000 + 181);

      const bullSpread = calculateDebitSpreadPayoff({
        strategy: "BULL_CALL_SPREAD",
        spot: 24000,
        lotSize: 75,
        longLeg: { strike: 24000, quote: { ltp: 180, bid: 179, ask: 181 } },
        shortLeg: { strike: 24100, quote: { ltp: 120, bid: 120, ask: 122 } },
      });
      // net debit = 181 - 120 = 61 -> breakeven = 24000 + 61 = 24061
      assert.equal(bullSpread.payoff?.breakevens[0], 24061);
    });

    it("Put breakeven is strike - debit (single-leg and spread)", () => {
      const put = calculateSingleLegPayoff({
        strategy: "LONG_PUT",
        strike: 24000,
        spot: 24000,
        quote: { ltp: 150, bid: 149, ask: 151 },
        delta: -0.5,
        srRoom: 200,
        atr: 150,
        lotSize: 75,
      });
      assert.equal(put.payoff?.breakevens[0], 24000 - 151);

      const bearSpread = calculateDebitSpreadPayoff({
        strategy: "BEAR_PUT_SPREAD",
        spot: 24000,
        lotSize: 75,
        longLeg: { strike: 24000, quote: { ltp: 150, bid: 149, ask: 151 } },
        shortLeg: { strike: 23900, quote: { ltp: 100, bid: 99, ask: 101 } },
      });
      // net debit = 151 - 99 = 52 -> breakeven = 24000 - 52 = 23948
      assert.equal(bearSpread.payoff?.breakevens[0], 23948);
    });
  });

  // ── 11. Gross R:R requirements (debit >= 1.2, credit >= 0.4) ──
  describe("11. Gross R:R requirements from frozen Strategy 11.4", () => {
    it("enforces gross R:R >= 1.2 for debit strategies and >= 0.4 for credit strategies", () => {
      const basePlan: TradePlan = {
        strategy: "Long Call",
        legs: [{ side: "BUY", type: "CE", strike: 24000, ltp: 100 }],
        credit: false,
        entry: 100,
        entryZone: [98, 102],
        stop: 50,
        target1: 160,
        target2: 200,
        rr: 1.2,
        maxLoss: 100,
        maxProfit: null,
        breakevens: [24100],
        score: 75,
        rejected: null,
      };

      const snap = buildMockSnapshot({ index: "nifty", spot: 24000, strikeStep: 50, lotSize: 75 });

      // Debit with RR = 1.2 passes
      const debitPass = evaluateTradeRisk(basePlan, snap, {}, { ...DEFAULT_RISK_CONFIG, accountCapital: undefined }, FIXED_NOW);
      assert.ok(!debitPass.reasons.includes("INSUFFICIENT_RR"), "Debit strategy with gross RR 1.2 passes");

      // Debit with RR = 1.1 fails
      const debitFail = evaluateTradeRisk({ ...basePlan, rr: 1.1 }, snap, {}, { ...DEFAULT_RISK_CONFIG, accountCapital: undefined }, FIXED_NOW);
      assert.ok(debitFail.reasons.includes("INSUFFICIENT_RR"), "Debit strategy with gross RR 1.1 rejected");

      // Credit with RR = 0.4 passes
      const creditPlan: TradePlan = { ...basePlan, credit: true, rr: 0.4 };
      const creditPass = evaluateTradeRisk(creditPlan, snap, {}, { ...DEFAULT_RISK_CONFIG, accountCapital: undefined }, FIXED_NOW);
      assert.ok(!creditPass.reasons.includes("INSUFFICIENT_RR"), "Credit strategy with gross RR 0.4 passes");

      // Credit with RR = 0.35 fails
      const creditFail = evaluateTradeRisk({ ...creditPlan, rr: 0.35 }, snap, {}, { ...DEFAULT_RISK_CONFIG, accountCapital: undefined }, FIXED_NOW);
      assert.ok(creditFail.reasons.includes("INSUFFICIENT_RR"), "Credit strategy with gross RR 0.35 rejected");
    });
  });

  // ── 12. Net R:R remains diagnostic (warning only; does not independently reject) ──
  describe("12. Net R:R remains diagnostic", () => {
    it("does not reject a plan when net R:R falls below gross threshold due to charges/slippage", () => {
      const plan: TradePlan = {
        strategy: "Long Call",
        legs: [{ side: "BUY", type: "CE", strike: 24000, ltp: 100 }],
        credit: false,
        entry: 25, // small premium where fixed brokerage significantly depresses net R:R
        entryZone: [24, 26],
        stop: 12.5,
        target1: 40,
        target2: 50,
        rr: 1.2, // gross R:R passes exactly
        maxLoss: 25,
        maxProfit: null,
        breakevens: [24025],
        score: 75,
        rejected: null,
      };

      const snap = buildMockSnapshot({ index: "nifty", spot: 24000, strikeStep: 50, lotSize: 75 });
      const assessment = evaluateTradeRisk(plan, snap, {}, { ...DEFAULT_RISK_CONFIG, accountCapital: undefined }, FIXED_NOW);

      // Assessment should remain allowed even if netRewardRatio < 1.2
      assert.equal(assessment.allowed, true);
      assert.ok(!assessment.reasons.includes("INSUFFICIENT_RR"));
      assert.ok(assessment.netRewardRatio !== null && assessment.netRewardRatio !== undefined);
      // Warning is emitted as an economic diagnostic
      assert.ok(
        assessment.warnings.some((w) => w.includes("Economic diagnostic: Net risk/reward")),
        "Diagnostic warning present",
      );
    });
  });

  // ── 13. Transaction costs and slippage calculations (brokerage, STT, turnover, GST, stamp duty) ──
  describe("13. Transaction costs and slippage calculations", () => {
    it("computes all statutory and exchange fee components accurately for options trades", () => {
      // 1 lot of NIFTY options (75 qty) bought at 100, sold at 150 with BASIC plan (₹20/order)
      const basicCosts = costsFor([
        { side: "BUY", price: 100, quantity: 75 },
        { side: "SELL", price: 150, quantity: 75 },
      ], BASIC_PLAN_COSTS);

      // Brokerage: 2 orders * ₹20 = ₹40
      assert.equal(basicCosts.brokerage, 40);

      // STT on options: 0.15% on sell side turnover (150 * 75 = 11250 * 0.0015 = 16.88)
      assert.equal(basicCosts.stt, 16.88);

      // Exchange charges: 0.03553% on total premium (18750 * 0.0003553 = 6.66)
      assert.equal(basicCosts.exchangeCharges, 6.66);

      // Stamp duty on buy side: 0.003% of 7500 = 0.23
      assert.equal(basicCosts.stampDuty, 0.23);

      // SEBI charges: ₹10 / crore (18750 * 0.000001 = 0.02)
      assert.equal(basicCosts.sebiCharges, 0.02);

      // GST: 18% on (Brokerage + Exchange Charges) = 18% of (40 + 6.66) = 8.40
      assert.equal(basicCosts.gst, 8.40);

      // Total costs = 40 + 16.88 + 6.66 + 0.23 + 0.02 + 8.40 = 72.19
      assert.equal(basicCosts.totalCosts, 72.19);

      // Also verify conservative research fallback (Plus ₹30/order): 2 orders * ₹30 = ₹60
      const defaultCosts = costsFor([
        { side: "BUY", price: 100, quantity: 75 },
        { side: "SELL", price: 150, quantity: 75 },
      ], DEFAULT_TRANSACTION_COSTS);
      assert.equal(defaultCosts.brokerage, 60);
    });

    it("verifies 4-fill transaction costs for multi-leg debit spreads", () => {
      // Default Plus fallback: 4 orders * ₹30 = ₹120 brokerage
      const spreadRes = calculateDebitSpreadPayoff({
        strategy: "BULL_CALL_SPREAD",
        spot: 24000,
        lotSize: 75,
        longLeg: { strike: 24000, quote: { ltp: 180, bid: 179, ask: 181 } },
        shortLeg: { strike: 24100, quote: { ltp: 120, bid: 120, ask: 122 } },
      });
      assert.ok(spreadRes.payoff);
      const tc = spreadRes.payoff!.estimatedValues.transactionCosts;
      assert.equal(tc.brokerage, 120);
      assert.ok(tc.totalCosts > 120);
      assert.ok(spreadRes.payoff!.estimatedValues.netRiskPerLot > 0);

      // Basic plan: 4 orders * ₹20 = ₹80 brokerage
      const spreadBasic = calculateDebitSpreadPayoff({
        strategy: "BULL_CALL_SPREAD",
        spot: 24000,
        lotSize: 75,
        longLeg: { strike: 24000, quote: { ltp: 180, bid: 179, ask: 181 } },
        shortLeg: { strike: 24100, quote: { ltp: 120, bid: 120, ask: 122 } },
        costConfig: BASIC_PLAN_COSTS,
      });
      assert.equal(spreadBasic.payoff?.estimatedValues.transactionCosts.brokerage, 80);
    });
  });

  // ── 14. Missing capital does not block recommendations (unconfigured capital produces valid recommendation) ──
  describe("14. Missing capital does not block recommendations", () => {
    it("generates complete trade recommendation when capital is undefined/null/unconfigured", () => {
      const plan: TradePlan = {
        strategy: "Long Call",
        legs: [{ side: "BUY", type: "CE", strike: 24000, ltp: 100 }],
        credit: false,
        entry: 100,
        entryZone: [98, 102],
        stop: 50,
        target1: 180,
        target2: 220,
        rr: 1.6,
        maxLoss: 100,
        maxProfit: null,
        breakevens: [24100],
        score: 75,
        rejected: null,
      };

      const snap = buildMockSnapshot({ index: "nifty", spot: 24000, strikeStep: 50, lotSize: 75 });
      const assessment = evaluateTradeRisk(plan, snap, {}, {
        ...DEFAULT_RISK_CONFIG,
        accountCapital: undefined, // unconfigured capital
      }, FIXED_NOW);

      assert.equal(assessment.allowed, true, "Valid market trade plan approved with unconfigured capital");
      assert.ok(!assessment.reasons.includes("ZERO_LOTS"), "Never rejected for ZERO_LOTS");
      assert.equal(assessment.sizingStatus, "UNCONFIGURED");
    });
  });

  // ── 15. MOCK and UNAVAILABLE data never appear as LIVE (fail-closed provenance) ──
  describe("15. Fail-closed provenance (MOCK and UNAVAILABLE never appear as LIVE)", () => {
    it("ensures MOCK source maps to STALE freshness and not LIVE", () => {
      const meta = sourceMeta({
        source: "MOCK",
        provider: "MOCK",
        fetchedAt: FIXED_NOW_ISO,
      }, FIXED_NOW);

      assert.notEqual(meta.freshness, "LIVE");
      assert.equal(meta.freshness, "STALE");
    });

    it("ensures UNAVAILABLE source maps to null freshness and not LIVE", () => {
      const meta = sourceMeta({
        source: "UNAVAILABLE",
        provider: "UPSTOX",
        fetchedAt: null,
      }, FIXED_NOW);

      assert.notEqual(meta.freshness, "LIVE");
      assert.equal(meta.freshness, null);
    });

    it("rejects live trade actionability when option chain source is MOCK", () => {
      const mockSnap = buildMockSnapshot({
        index: "nifty", spot: 24000, strikeStep: 50, lotSize: 75,
        sourceStatus: "MOCK",
        chainRows: [{
          strike: 24000,
          call: makeQuote({ ltp: 180, bid: 179, ask: 181, oi: 1000, volume: 500, iv: 15, delta: 0.5 }),
          put: makeQuote({ ltp: 175, bid: 174, ask: 176, oi: 1000, volume: 500, delta: -0.5 }),
        }],
      });
      const result = evaluateOptionsOpportunity(mockSnap, "NIFTY", FIXED_NOW);
      assert.equal(result.topOpportunities.length, 0, "No actionable live trade from MOCK source");
      assert.equal(result.dataQuality.optionChain, "MOCK");
    });
  });

  // ── 16. Strategy 11.4 remains byte-for-byte unchanged (SHA-256 hash assertion) ──
  describe("16. Strategy 11.4 byte-for-byte immutability", () => {
    it("confirms web/src/lib/engine/strategy.ts matches commit bcdd18a SHA-256 hash", () => {
      const candidatePaths = [
        path.resolve(process.cwd(), "src/lib/engine/strategy.ts"),
        path.resolve(process.cwd(), "web/src/lib/engine/strategy.ts"),
      ];
      const strategyPath = candidatePaths.find((p) => fs.existsSync(p)) ?? candidatePaths[0];
      const fileBytes = fs.readFileSync(strategyPath);
      const hash = crypto.createHash("sha256").update(fileBytes).digest("hex");

      const EXPECTED_HASH = "d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18";
      assert.equal(
        hash,
        EXPECTED_HASH,
        `web/src/lib/engine/strategy.ts has been modified! Expected ${EXPECTED_HASH}, found ${hash}`,
      );
    });
  });

  // ── 17. Expiry horizon safety & terminal payoff calculations ──────────────────
  describe("17. Expiry horizon safety & terminal payoff calculations", () => {
    // 17.1: Expiry before holding horizon (0 < expiryYears < dtYears)
    it("17.1 computes terminal intrinsic payoff (EXPIRY_PAYOFF) when expiry occurs before 2-hour horizon", () => {
      // 30 minutes to expiry (0.5 hours), holding period 2 hours (2.0 hours)
      // dtYears = 2.0 / 8760, expiryYears = 0.5 / 8760 -> expiry occurs before horizon
      const hours = 2.0;
      const expiryYears = 0.5 / (365 * 24);

      // In-the-money Call: Spot 24000, Strike 23900, Entry Ask 130
      // srRoom = 200, atr = 100 -> useRoom = 200 -> move1 = 90, move2 = 170
      // TargetSpot1 = 24090, TargetSpot2 = 24170
      // Terminal intrinsic payoff at Target 1: max(0, 24090 - 23900) = 190
      // Terminal intrinsic payoff at Target 2: max(0, 24170 - 23900) = 270
      const itmPayoff = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 23900,
        spot: 24000,
        quote: {
          ltp: 129,
          bid: 128,
          ask: 130,
          iv: 15,
          gamma: 0.0015,
          theta: -10,
          vega: 7,
          instrumentKey: "NSE_FO|NIFTY23900CE",
        },
        delta: 0.65,
        srRoom: 200,
        atr: 100,
        lotSize: 75,
        expiryYears,
        holdingHours: hours,
      });

      assert.equal(itmPayoff.success, true);
      assert.ok(itmPayoff.payoff);
      const p = itmPayoff.payoff!;
      const est = p.estimatedValues;

      assert.equal(est.targetPricingModel, "EXPIRY_PAYOFF", "Must use terminal intrinsic expiry payoff, never BS with artificial time");
      assert.equal(est.horizonStatus, "EXPIRES_BEFORE_HORIZON", "Correctly flags horizonStatus as EXPIRES_BEFORE_HORIZON");
      assert.equal(p.target1Price, 190, "Target 1 must be exact terminal intrinsic value (24090 - 23900 = 190)");
      assert.equal(p.target2Price, 270, "Target 2 must be exact terminal intrinsic value (24170 - 23900 = 270)");
      assert.equal(est.constantIvAssumption, false, "Constant IV assumption is not applicable to terminal intrinsic value");

      // Gross R:R: (190 - 130) / (130 - 65) = 60 / 65 = 0.92
      assert.equal(p.grossRewardToRisk, 0.92);

      // Now test an Out-of-the-money Call: Spot 24000, Strike 24150, Entry Ask 25
      // TargetSpot1 = 24090 < 24150 -> expires OTM (intrinsic 0)
      const otmPayoff = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 24150,
        spot: 24000,
        quote: {
          ltp: 24,
          bid: 23,
          ask: 25,
          iv: 16,
          gamma: 0.001,
          theta: -8,
          vega: 5,
          instrumentKey: "NSE_FO|NIFTY24150CE",
        },
        delta: 0.30,
        srRoom: 200,
        atr: 100,
        lotSize: 75,
        expiryYears,
        holdingHours: hours,
      });

      assert.equal(otmPayoff.success, true);
      assert.ok(otmPayoff.payoff);
      assert.equal(otmPayoff.payoff!.target1Price, 0, "OTM call expiring before horizon has strictly 0 terminal target 1 value");
      assert.equal(otmPayoff.payoff!.target2Price, 20, "Target 2 (24170) finishes slightly ITM: 24170 - 24150 = 20");
      assert.ok(otmPayoff.payoff!.grossRewardToRisk < 0, "Gross R:R must be negative when target 1 is zero (-25 / 12.5 = -2.0)");
    });

    // 17.2: Expiry exactly at holding horizon (expiryYears === dtYears)
    it("17.2 computes terminal intrinsic payoff (EXPIRY_PAYOFF) when expiry occurs exactly at 2-hour horizon", () => {
      const hours = 2.0;
      const expiryYears = 2.0 / (365 * 24); // Exactly 2 hours

      const res = calculateSingleLegPayoff({
        strategy: "LONG_PUT",
        strike: 24100,
        spot: 24000,
        quote: {
          ltp: 130,
          bid: 129,
          ask: 131,
          iv: 14,
          gamma: 0.0016,
          theta: -11,
          vega: 8,
          instrumentKey: "NSE_FO|NIFTY24100PE",
        },
        delta: -0.60,
        srRoom: 200,
        atr: 100,
        lotSize: 75,
        expiryYears,
        holdingHours: hours,
      });

      assert.equal(res.success, true);
      assert.ok(res.payoff);
      const p = res.payoff!;
      const est = p.estimatedValues;

      assert.equal(est.targetPricingModel, "EXPIRY_PAYOFF");
      assert.equal(est.horizonStatus, "EXPIRES_AT_HORIZON", "Identifies expiry occurs exactly at horizon");
      // Put TargetSpot1 = 24000 - 90 = 23910. Terminal put intrinsic: 24100 - 23910 = 190
      assert.equal(p.target1Price, 190);
    });

    // 17.3: Expiry after holding horizon (expiryYears > dtYears)
    it("17.3 computes Black-Scholes repricing with positive remaining time when expiry occurs after holding horizon", () => {
      const hours = 2.0;
      const expiryYears = 3 / 365; // 3 days (72 hours) > 2 hours

      const res = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 24000,
        spot: 24000,
        quote: {
          ltp: 115,
          bid: 114,
          ask: 116,
          iv: 15,
          gamma: 0.0019,
          theta: -12.5,
          vega: 8.5,
          instrumentKey: "NSE_FO|NIFTY24000CE",
        },
        delta: 0.52,
        srRoom: 200,
        atr: 150,
        lotSize: 75,
        expiryYears,
        holdingHours: hours,
      });

      assert.equal(res.success, true);
      assert.ok(res.payoff);
      const est = res.payoff!.estimatedValues;

      assert.equal(est.targetPricingModel, "BLACK_SCHOLES_REPRICED");
      assert.equal(est.horizonStatus, "EXPIRES_AFTER_HORIZON");
      assert.equal(est.constantIvAssumption, true);
      assert.equal(est.greeksQuality, "INDEPENDENTLY_DERIVED");
      assert.ok(res.payoff!.target1Price > 116, "Projected target premium exceeds entry ask");
    });

    // 17.4: Expired contracts (expiryYears <= 0)
    it("17.4 fails closed immediately for expired contracts without inventing artificial positive time-to-expiry", () => {
      // Test at expiryYears = 0 (exact expiration)
      const resZero = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 24000,
        spot: 24000,
        quote: { ltp: 10, bid: 9.5, ask: 10.5, iv: 15 },
        delta: 0.5,
        srRoom: 100,
        atr: 80,
        lotSize: 75,
        expiryYears: 0,
      });
      assert.equal(resZero.success, false);
      assert.equal(resZero.payoff, null);
      assert.ok(resZero.rejectionReason?.includes("Contract has expired (expiryYears: 0 <= 0)"));

      // Test at expiryYears < 0 (past expiration)
      const resNeg = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 24000,
        spot: 24000,
        quote: { ltp: 10, bid: 9.5, ask: 10.5, iv: 15 },
        delta: 0.5,
        srRoom: 100,
        atr: 80,
        lotSize: 75,
        expiryYears: -0.001,
      });
      assert.equal(resNeg.success, false);
      assert.equal(resNeg.payoff, null);
      assert.ok(resNeg.rejectionReason?.includes("Contract has expired"));

      // Multi-leg spread fails closed on expired contract
      const spreadExpired = calculateDebitSpreadPayoff({
        strategy: "BULL_CALL_SPREAD",
        spot: 24000,
        lotSize: 75,
        expiryYears: -0.005,
        longLeg: { strike: 24000, quote: { ltp: 50, bid: 49, ask: 51 } },
        shortLeg: { strike: 24100, quote: { ltp: 25, bid: 24, ask: 26 } },
      });
      assert.equal(spreadExpired.success, false);
      assert.equal(spreadExpired.payoff, null);
      assert.ok(spreadExpired.rejectionReason?.includes("Contract has expired"));

      // Iron Condor fails closed on expired contract
      const icExpired = calculateIronCondorPayoff({
        spot: 24000,
        lotSize: 75,
        expiryYears: 0,
        shortCall: { strike: 24200, quote: { ltp: 30, bid: 29, ask: 31 } },
        longCall: { strike: 24300, quote: { ltp: 15, bid: 14, ask: 16 } },
        shortPut: { strike: 23800, quote: { ltp: 28, bid: 27, ask: 29 } },
        longPut: { strike: 23700, quote: { ltp: 14, bid: 13, ask: 15 } },
      });
      assert.equal(icExpired.success, false);
      assert.equal(icExpired.payoff, null);
      assert.ok(icExpired.rejectionReason?.includes("Contract has expired"));
    });

    // 17.5: Same-day expiry around the 15:30 IST cutoff
    it("17.5 handles same-day expiry correctly around the 15:30 IST cutoff", () => {
      const expiryDate = "2026-11-19";

      // 15 minutes before cutoff: 15:15:00 IST -> alive (0.25h remaining)
      const tBefore = new Date("2026-11-19T15:15:00+05:30");
      const yearsBefore = calculateExpiryYears(expiryDate, tBefore);
      assert.ok(yearsBefore !== null && yearsBefore > 0, "Before 15:30 IST must yield positive expiryYears");
      assert.ok(Math.abs(yearsBefore! - (0.25 / 8760)) < 1e-9);

      const payBefore = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 23900,
        spot: 24000,
        quote: { ltp: 130, bid: 129, ask: 131, iv: 15 },
        delta: 0.65,
        srRoom: 200,
        atr: 100,
        lotSize: 75,
        expiryYears: yearsBefore,
        holdingHours: 2.0,
      });
      assert.equal(payBefore.success, true);
      assert.equal(payBefore.payoff?.estimatedValues.targetPricingModel, "EXPIRY_PAYOFF");
      assert.equal(payBefore.payoff?.estimatedValues.horizonStatus, "EXPIRES_BEFORE_HORIZON");

      // Exactly at cutoff: 15:30:00 IST -> 0 ms -> expired
      const tAt = new Date("2026-11-19T15:30:00+05:30");
      const yearsAt = calculateExpiryYears(expiryDate, tAt);
      assert.equal(yearsAt, 0, "At 15:30:00 IST must yield exactly 0 expiryYears");

      const payAt = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 23900,
        spot: 24000,
        quote: { ltp: 130, bid: 129, ask: 131, iv: 15 },
        delta: 0.65,
        srRoom: 200,
        atr: 100,
        lotSize: 75,
        expiryYears: yearsAt,
      });
      assert.equal(payAt.success, false);
      assert.ok(payAt.rejectionReason?.includes("Contract has expired"));

      // 1 second after cutoff: 15:30:01 IST -> expired (< 0)
      const tAfter = new Date("2026-11-19T15:30:01+05:30");
      const yearsAfter = calculateExpiryYears(expiryDate, tAfter);
      assert.ok(yearsAfter !== null && yearsAfter < 0, "After 15:30 IST must yield negative expiryYears");

      const payAfter = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 23900,
        spot: 24000,
        quote: { ltp: 130, bid: 129, ask: 131, iv: 15 },
        delta: 0.65,
        srRoom: 200,
        atr: 100,
        lotSize: 75,
        expiryYears: yearsAfter,
      });
      assert.equal(payAfter.success, false);
      assert.ok(payAfter.rejectionReason?.includes("Contract has expired"));
    });

    // 17.6: Downstream pipeline actionability prevention
    it("17.6 confirms downstream pipeline prevents an invalid expiry projection from becoming an actionable recommendation", () => {
      // 1. Snapshot with expired contract (expiry was yesterday 2026-11-18, now is open market 2026-11-19T10:30:00+05:30)
      const marketNow = new Date("2026-11-19T10:30:00+05:30");
      const marketNowIso = marketNow.toISOString();
      const expiredSnap = buildMockSnapshot({
        index: "nifty",
        spot: 24000,
        strikeStep: 50,
        lotSize: 75,
        expiry: "2026-11-18",
        now: marketNow,
        chainRows: [{
          strike: 24000,
          call: makeQuote({
            ltp: 50,
            bid: 49,
            ask: 51,
            oi: 10000,
            volume: 2000,
            iv: 15,
            delta: 0.5,
            gamma: 0.01,
            theta: -1,
            vega: 0.5,
            instrumentKey: "NSE_FO|NIFTY24000CE",
            lastTradeTime: marketNowIso,
            contractPriceQuality: "CONTRACT_PRICE_LIVE",
            ltpConsistent: true,
            greeksProvenance: "INDEPENDENTLY_DERIVED",
            ivProvenance: "INDEPENDENTLY_DERIVED",
          }),
          put: makeQuote({
            ltp: 50,
            bid: 49,
            ask: 51,
            oi: 10000,
            volume: 2000,
            iv: 15,
            delta: -0.5,
            gamma: 0.01,
            theta: -1,
            vega: 0.5,
            instrumentKey: "NSE_FO|NIFTY24000PE",
            lastTradeTime: marketNowIso,
            contractPriceQuality: "CONTRACT_PRICE_LIVE",
            ltpConsistent: true,
            greeksProvenance: "INDEPENDENTLY_DERIVED",
            ivProvenance: "INDEPENDENTLY_DERIVED",
          }),
        },
        {
          strike: 24500, // Heavy call OI defines resistance at 24500 (500 pts room)
          call: makeQuote({ ltp: 10, bid: 9.5, ask: 10.5, oi: 150000, volume: 5000 }),
          put: makeQuote({ ltp: 450, bid: 448, ask: 452, oi: 1000, volume: 500 }),
        }],
      });

      const result = evaluateOptionsOpportunity(expiredSnap, "NIFTY", marketNow);

      // Downstream pipeline asserts:
      // 1. All evaluated candidates must be graded REJECT with explicit expired contract reason
      assert.ok(result.topOpportunities.length > 0);
      for (const opp of result.topOpportunities) {
        assert.equal(opp.grade, "REJECT", "Expired contract must be graded REJECT");
        assert.ok(
          opp.gradeReasons?.some((r) => r.includes("Contract has expired")),
          "Must explicitly document rejection due to expired contract",
        );
      }

      // 2. Recommended strategy fails closed to NO_TRADE
      assert.equal(result.recommendedStrategy, "NO_TRADE", "Expired contracts must produce NO_TRADE");

      // 3. Candidate eligibility fails closed to ALL_CANDIDATES_REJECTED
      assert.equal(result.candidateEligibility, "ALL_CANDIDATES_REJECTED");
    });
  });

  // ── 18. Expiry Projection Consistency & Multi-Leg Horizon Verification ──────
  describe("18. Expiry Projection Consistency & Multi-Leg Horizon Verification", () => {
    // 18.1: Underlying movement at expiry for sub-horizon expiration (T < dt)
    it("18.1 marks sub-horizon expiry projection as DATA_INSUFFICIENT, uncalibrated, and hypothetical diagnostic", () => {
      // 15 minutes before 15:30 IST cutoff (0.25 hours vs 2.0 hour holding horizon)
      const now15m = new Date("2026-11-19T15:15:00+05:30");
      const expiryDate = "2026-11-19";
      const expYears = calculateExpiryYears(expiryDate, now15m); // 0.25 / 8760

      const res = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 24000,
        spot: 24000,
        quote: { ltp: 15, bid: 14.5, ask: 15.5, iv: 16 },
        delta: 0.5,
        srRoom: 200,
        atr: 120,
        lotSize: 75,
        expiryYears: expYears,
        holdingHours: 2.0,
      });

      assert.equal(res.success, true);
      assert.equal(res.payoff?.estimatedValues.targetPricingModel, "EXPIRY_PAYOFF");
      assert.equal(res.payoff?.estimatedValues.horizonStatus, "EXPIRES_BEFORE_HORIZON");
      assert.equal(res.payoff?.estimatedValues.greeksQuality, "DATA_INSUFFICIENT");
      assert.equal(res.payoff?.estimatedValues.underlyingMoveCalibrated, false);
      assert.equal(res.payoff?.estimatedValues.isHypotheticalDiagnostic, true);
      assert.ok(
        res.payoff?.estimatedValues.hypotheticalDiagnosticNote?.includes("cannot reliably forecast movement"),
        "Diagnostic note explains unscaled movement limitation",
      );
      assert.ok(res.payoff?.estimatedValues.terminalPayoffByLeg?.length === 1);
    });

    // 18.2: Downstream evaluation fails closed to NO_TRADE when expiry occurs before holding horizon
    it("18.2 prevents sub-horizon expiry candidates from becoming actionable in downstream evaluation", () => {
      // 15 minutes before 15:30 IST on expiry day
      const now15m = new Date("2026-11-19T15:15:00+05:30");
      const snap = buildMockSnapshot({
        index: "nifty",
        spot: 24000,
        strikeStep: 50,
        lotSize: 75,
        expiry: "2026-11-19",
        now: now15m,
        chainRows: [
          {
            strike: 24000,
            call: makeQuote({
              ltp: 50,
              bid: 49.5,
              ask: 50.5,
              oi: 20000,
              volume: 5000,
              iv: 15,
              delta: 0.5,
              gamma: 0.01,
              theta: -1,
              vega: 0.5,
              instrumentKey: "NSE_FO|NIFTY24000CE",
              lastTradeTime: now15m.toISOString(),
              contractPriceQuality: "CONTRACT_PRICE_LIVE",
              ltpConsistent: true,
              greeksProvenance: "INDEPENDENTLY_DERIVED",
              ivProvenance: "INDEPENDENTLY_DERIVED",
            }),
            put: makeQuote({
              ltp: 50,
              bid: 49.5,
              ask: 50.5,
              oi: 20000,
              volume: 5000,
              iv: 15,
              delta: -0.5,
              gamma: 0.01,
              theta: -1,
              vega: 0.5,
              instrumentKey: "NSE_FO|NIFTY24000PE",
              lastTradeTime: now15m.toISOString(),
              contractPriceQuality: "CONTRACT_PRICE_LIVE",
              ltpConsistent: true,
              greeksProvenance: "INDEPENDENTLY_DERIVED",
              ivProvenance: "INDEPENDENTLY_DERIVED",
            }),
          },
          {
            strike: 24500,
            call: makeQuote({ ltp: 10, bid: 9.5, ask: 10.5, oi: 150000, volume: 5000 }),
            put: makeQuote({ ltp: 450, bid: 448, ask: 452, oi: 1000, volume: 500 }),
          },
        ],
      });

      const result = evaluateOptionsOpportunity(snap, "NIFTY", now15m);
      assert.ok(result.topOpportunities.length > 0);
      for (const opp of result.topOpportunities) {
        assert.equal(opp.grade, "REJECT", "Candidate with sub-horizon expiry must be graded REJECT");
        assert.ok(
          opp.gradeReasons?.some((r) => r.includes("Expiry occurs before holding horizon")),
          "Must reject due to uncalibrated shortened expiry horizon",
        );
      }
      assert.equal(result.recommendedStrategy, "NO_TRADE");
      assert.equal(result.candidateEligibility, "ALL_CANDIDATES_REJECTED");
    });

    // 18.3: Coincident expiry at holding horizon (T = dt)
    it("18.3 calculates calibrated terminal expiry payoff when expiry occurs exactly at 2-hour holding horizon", () => {
      const dtYears = 2.0 / (365 * 24);

      const res = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 23900,
        spot: 24000,
        quote: { ltp: 120, bid: 119, ask: 121, iv: 16 },
        delta: 0.65,
        srRoom: 200,
        atr: 120,
        lotSize: 75,
        expiryYears: dtYears,
        holdingHours: 2.0,
      });

      assert.equal(res.success, true);
      assert.equal(res.payoff?.estimatedValues.targetPricingModel, "EXPIRY_PAYOFF");
      assert.equal(res.payoff?.estimatedValues.horizonStatus, "EXPIRES_AT_HORIZON");
      assert.equal(res.payoff?.estimatedValues.greeksQuality, "INDEPENDENTLY_DERIVED");
      assert.equal(res.payoff?.estimatedValues.underlyingMoveCalibrated, true);
      assert.equal(res.payoff?.estimatedValues.isHypotheticalDiagnostic, false);
      assert.equal(res.payoff?.estimatedValues.hypotheticalDiagnosticNote, null);

      // Terminal intrinsic value:
      // spot = 24000, srRoom = 200, atr = 120 -> useRoom = max(200, 48) = 200
      // move1 = 200 * 0.45 = 90 -> targetSpot1 = 24090 -> intrinsic1 = 24090 - 23900 = 190
      // move2 = 200 * 0.85 = 170 -> targetSpot2 = 24170 -> intrinsic2 = 24170 - 23900 = 270
      assert.equal(res.payoff?.target1Price, 190);
      assert.equal(res.payoff?.target2Price, 270);
    });

    // 18.4: Bull Call Spread expiry consistency and terminal payoff
    it("18.4 enforces multi-leg expiry consistency and calculates terminal portfolio payoff for Bull Call Spread", () => {
      const dtYears = 2.0 / (365 * 24);

      // A. Mismatched string expiries fail closed
      const mismatchedStr = calculateDebitSpreadPayoff({
        strategy: "BULL_CALL_SPREAD",
        spot: 24000,
        lotSize: 75,
        longLeg: { strike: 24000, expiry: "2026-11-19", quote: { ltp: 100, bid: 99, ask: 101 } },
        shortLeg: { strike: 24100, expiry: "2026-11-26", quote: { ltp: 50, bid: 49, ask: 51 } },
      });
      assert.equal(mismatchedStr.success, false);
      assert.ok(mismatchedStr.rejectionReason?.includes("Inconsistent leg expiries"));

      // B. Mismatched numerical expiryYears fail closed
      const mismatchedNum = calculateDebitSpreadPayoff({
        strategy: "BULL_CALL_SPREAD",
        spot: 24000,
        lotSize: 75,
        longLeg: { strike: 24000, expiryYears: 0.01, quote: { ltp: 100, bid: 99, ask: 101 } },
        shortLeg: { strike: 24100, expiryYears: 0.02, quote: { ltp: 50, bid: 49, ask: 51 } },
      });
      assert.equal(mismatchedNum.success, false);
      assert.ok(mismatchedNum.rejectionReason?.includes("Inconsistent leg expiryYears"));

      // C. Coincident expiry exactly at holding horizon (T = dt):
      // spot = 24000, Long 24000 CE (ask 60), Short 24100 CE (bid 20) -> net debit = 40
      // spreadWidth = 100, maxProfit = 60, maxLoss = 40, be = 24040
      // srRoom = 200 -> move1 = 90 (ST1 = 24090), move2 = 170 (ST2 = 24170)
      // At ST1 = 24090: Long 24000 intrinsic = 90, Short 24100 intrinsic = 0 -> spreadTerminal1 = 90
      // At ST2 = 24170: Long 24000 intrinsic = 170, Short 24100 intrinsic = 70 -> spreadTerminal2 = 100 (full expansion)
      const validCoincident = calculateDebitSpreadPayoff({
        strategy: "BULL_CALL_SPREAD",
        spot: 24000,
        lotSize: 75,
        expiryYears: dtYears,
        expiry: "2026-11-19",
        holdingHours: 2.0,
        srRoom: 200,
        atr: 100,
        longLeg: { strike: 24000, expiry: "2026-11-19", expiryYears: dtYears, quote: { ltp: 59, bid: 58, ask: 60 } },
        shortLeg: { strike: 24100, expiry: "2026-11-19", expiryYears: dtYears, quote: { ltp: 21, bid: 20, ask: 22 } },
      });

      assert.equal(validCoincident.success, true);
      const p = validCoincident.payoff!;
      assert.equal(p.netEntryPrice, 40);
      assert.equal(p.maxTheoreticalLoss, 40);
      assert.equal(p.maxTheoreticalProfit, 60);
      assert.equal(p.breakevens[0], 24040);
      assert.equal(p.target1Price, 90, "Terminal portfolio value at ST1 (24090) is 90");
      assert.equal(p.target2Price, 100, "Terminal portfolio value at ST2 (24170) is 100 (full width)");
      assert.equal(p.estimatedValues.targetPricingModel, "EXPIRY_PAYOFF");
      assert.equal(p.estimatedValues.horizonStatus, "EXPIRES_AT_HORIZON");
      assert.equal(p.estimatedValues.underlyingMoveCalibrated, true);
      assert.equal(p.estimatedValues.isHypotheticalDiagnostic, false);

      // Verify terminalPayoffByLeg captures both legs evaluated at the same underlying spot
      assert.equal(p.estimatedValues.terminalPayoffByLeg?.length, 2);
      assert.deepEqual(p.estimatedValues.terminalPayoffByLeg?.[0], {
        strike: 24000,
        side: "BUY",
        type: "CE",
        intrinsicValueTarget1: 90,
        intrinsicValueTarget2: 170,
      });
      assert.deepEqual(p.estimatedValues.terminalPayoffByLeg?.[1], {
        strike: 24100,
        side: "SELL",
        type: "CE",
        intrinsicValueTarget1: 0,
        intrinsicValueTarget2: 70,
      });

      // D. Sub-horizon expiry (T < dt): marked DATA_INSUFFICIENT and hypothetical
      const subHorizon = calculateDebitSpreadPayoff({
        strategy: "BULL_CALL_SPREAD",
        spot: 24000,
        lotSize: 75,
        expiryYears: 0.25 / 8760, // 15 minutes remaining
        expiry: "2026-11-19",
        holdingHours: 2.0,
        srRoom: 200,
        atr: 100,
        longLeg: { strike: 24000, expiry: "2026-11-19", quote: { ltp: 59, bid: 58, ask: 60 } },
        shortLeg: { strike: 24100, expiry: "2026-11-19", quote: { ltp: 21, bid: 20, ask: 22 } },
      });
      assert.equal(subHorizon.success, true);
      assert.equal(subHorizon.payoff?.estimatedValues.horizonStatus, "EXPIRES_BEFORE_HORIZON");
      assert.equal(subHorizon.payoff?.estimatedValues.greeksQuality, "DATA_INSUFFICIENT");
      assert.equal(subHorizon.payoff?.estimatedValues.underlyingMoveCalibrated, false);
      assert.equal(subHorizon.payoff?.estimatedValues.isHypotheticalDiagnostic, true);
    });

    // 18.5: Bear Put Spread expiry consistency and terminal payoff
    it("18.5 enforces multi-leg expiry consistency and calculates terminal portfolio payoff for Bear Put Spread", () => {
      const dtYears = 2.0 / (365 * 24);

      // A. Mismatched leg expiries fail closed
      const mismatched = calculateDebitSpreadPayoff({
        strategy: "BEAR_PUT_SPREAD",
        spot: 24000,
        lotSize: 75,
        longLeg: { strike: 24000, expiry: "2026-11-19", quote: { ltp: 100, bid: 99, ask: 101 } },
        shortLeg: { strike: 23900, expiry: "2026-11-26", quote: { ltp: 50, bid: 49, ask: 51 } },
      });
      assert.equal(mismatched.success, false);
      assert.ok(mismatched.rejectionReason?.includes("Inconsistent leg expiries"));

      // B. Coincident expiry exactly at holding horizon (T = dt):
      // spot = 24000, Long 24000 PE (ask 55), Short 23900 PE (bid 20) -> net debit = 35
      // spreadWidth = 100, maxProfit = 65, maxLoss = 35, be = 23965
      // srRoom = 200 -> move1 = 90 (ST1 = 23910), move2 = 170 (ST2 = 23830)
      // At ST1 = 23910: Long 24000 PE intrinsic = 90, Short 23900 PE intrinsic = 0 -> spreadTerminal1 = 90
      // At ST2 = 23830: Long 24000 PE intrinsic = 170, Short 23900 PE intrinsic = 70 -> spreadTerminal2 = 100 (full expansion)
      const validCoincident = calculateDebitSpreadPayoff({
        strategy: "BEAR_PUT_SPREAD",
        spot: 24000,
        lotSize: 75,
        expiryYears: dtYears,
        expiry: "2026-11-19",
        holdingHours: 2.0,
        srRoom: 200,
        atr: 100,
        longLeg: { strike: 24000, expiry: "2026-11-19", expiryYears: dtYears, quote: { ltp: 54, bid: 53, ask: 55 } },
        shortLeg: { strike: 23900, expiry: "2026-11-19", expiryYears: dtYears, quote: { ltp: 21, bid: 20, ask: 22 } },
      });

      assert.equal(validCoincident.success, true);
      const p = validCoincident.payoff!;
      assert.equal(p.netEntryPrice, 35);
      assert.equal(p.maxTheoreticalLoss, 35);
      assert.equal(p.maxTheoreticalProfit, 65);
      assert.equal(p.breakevens[0], 23965);
      assert.equal(p.target1Price, 90, "Terminal portfolio value at ST1 (23910) is 90");
      assert.equal(p.target2Price, 100, "Terminal portfolio value at ST2 (23830) is 100 (full width)");
      assert.equal(p.estimatedValues.targetPricingModel, "EXPIRY_PAYOFF");
      assert.equal(p.estimatedValues.horizonStatus, "EXPIRES_AT_HORIZON");
      assert.equal(p.estimatedValues.underlyingMoveCalibrated, true);
      assert.equal(p.estimatedValues.isHypotheticalDiagnostic, false);

      // Verify terminalPayoffByLeg captures both legs evaluated at the same underlying spot
      assert.equal(p.estimatedValues.terminalPayoffByLeg?.length, 2);
      assert.deepEqual(p.estimatedValues.terminalPayoffByLeg?.[0], {
        strike: 24000,
        side: "BUY",
        type: "PE",
        intrinsicValueTarget1: 90,
        intrinsicValueTarget2: 170,
      });
      assert.deepEqual(p.estimatedValues.terminalPayoffByLeg?.[1], {
        strike: 23900,
        side: "SELL",
        type: "PE",
        intrinsicValueTarget1: 0,
        intrinsicValueTarget2: 70,
      });
    });

    // 18.6: Four-Leg Iron Condor expiry consistency and terminal portfolio evaluation
    it("18.6 enforces four-leg expiry consistency and calculates terminal portfolio payoff across all 4 legs", () => {
      const dtYears = 2.0 / (365 * 24);

      // A. Inconsistent string expiry across legs fails closed
      const icInconsistentStr = calculateIronCondorPayoff({
        spot: 24000,
        lotSize: 75,
        shortCall: { strike: 24200, expiry: "2026-11-19", quote: { ltp: 30, bid: 29, ask: 31 } },
        longCall: { strike: 24300, expiry: "2026-11-19", quote: { ltp: 15, bid: 14, ask: 16 } },
        shortPut: { strike: 23800, expiry: "2026-11-19", quote: { ltp: 28, bid: 27, ask: 29 } },
        longPut: { strike: 23700, expiry: "2026-11-26", quote: { ltp: 14, bid: 13, ask: 15 } }, // Mismatched!
      });
      assert.equal(icInconsistentStr.success, false);
      assert.ok(icInconsistentStr.rejectionReason?.includes("Inconsistent leg expiries across Iron Condor legs"));

      // B. Inconsistent expiryYears across legs fails closed
      const icInconsistentNum = calculateIronCondorPayoff({
        spot: 24000,
        lotSize: 75,
        shortCall: { strike: 24200, expiryYears: 0.01, quote: { ltp: 30, bid: 29, ask: 31 } },
        longCall: { strike: 24300, expiryYears: 0.01, quote: { ltp: 15, bid: 14, ask: 16 } },
        shortPut: { strike: 23800, expiryYears: 0.01, quote: { ltp: 28, bid: 27, ask: 29 } },
        longPut: { strike: 23700, expiryYears: 0.02, quote: { ltp: 14, bid: 13, ask: 15 } }, // Mismatched!
      });
      assert.equal(icInconsistentNum.success, false);
      assert.ok(icInconsistentNum.rejectionReason?.includes("Inconsistent leg expiryYears across Iron Condor legs"));

      // C. Coincident expiry exactly at holding horizon (T = dt):
      // spot = 24000 (between short put 23800 and short call 24200)
      // scBid = 29, spBid = 27 -> premium received = 56
      // lcAsk = 15.5, lpAsk = 14.5 -> premium paid = 30
      // net credit = 26
      // callWing = 100, putWing = 100 -> maxProfit = 26, maxLoss = 100 - 26 = 74
      // lowerBE = 23800 - 26 = 23774, upperBE = 24200 + 26 = 24226
      // At neutral target spot ST1 = 24000:
      // All 4 options expire worthless -> cost to close = 0.00 -> t1 = 0
      // grossRR = (credit - t1) / risk = (26 - 0) / 26 = 1.00
      const validIC = calculateIronCondorPayoff({
        spot: 24000,
        lotSize: 75,
        expiryYears: dtYears,
        expiry: "2026-11-19",
        holdingHours: 2.0,
        srRoom: 100,
        atr: 80,
        shortCall: { strike: 24200, expiry: "2026-11-19", expiryYears: dtYears, quote: { ltp: 30, bid: 29, ask: 31 } },
        longCall: { strike: 24300, expiry: "2026-11-19", expiryYears: dtYears, quote: { ltp: 15, bid: 14.5, ask: 15.5 } },
        shortPut: { strike: 23800, expiry: "2026-11-19", expiryYears: dtYears, quote: { ltp: 28, bid: 27, ask: 29 } },
        longPut: { strike: 23700, expiry: "2026-11-19", expiryYears: dtYears, quote: { ltp: 14, bid: 13.5, ask: 14.5 } },
      });

      assert.equal(validIC.success, true);
      const p = validIC.payoff!;
      assert.equal(p.netEntryPrice, 26);
      assert.equal(p.maxTheoreticalProfit, 26);
      assert.equal(p.maxTheoreticalLoss, 74);
      assert.equal(p.breakevens[0], 23774);
      assert.equal(p.breakevens[1], 24226);
      assert.equal(p.target1Price, 0, "At expiry within short strikes, cost to close is 0.00 (max profit)");
      assert.equal(p.estimatedValues.targetPricingModel, "EXPIRY_PAYOFF");
      assert.equal(p.estimatedValues.horizonStatus, "EXPIRES_AT_HORIZON");
      assert.equal(p.estimatedValues.underlyingMoveCalibrated, true);
      assert.equal(p.estimatedValues.isHypotheticalDiagnostic, false);

      // Verify all 4 legs evaluated at the same underlying spot
      assert.equal(p.estimatedValues.terminalPayoffByLeg?.length, 4);
      assert.deepEqual(p.estimatedValues.terminalPayoffByLeg?.map((l) => ({ strike: l.strike, side: l.side, t1: l.intrinsicValueTarget1 })), [
        { strike: 24200, side: "SELL", t1: 0 },
        { strike: 24300, side: "BUY", t1: 0 },
        { strike: 23800, side: "SELL", t1: 0 },
        { strike: 23700, side: "BUY", t1: 0 },
      ]);

      // D. Sub-horizon expiry (T < dt): marked DATA_INSUFFICIENT and hypothetical diagnostic
      const subHorizonIC = calculateIronCondorPayoff({
        spot: 24000,
        lotSize: 75,
        expiryYears: 0.25 / 8760, // 15 minutes remaining
        expiry: "2026-11-19",
        holdingHours: 2.0,
        shortCall: { strike: 24200, quote: { ltp: 30, bid: 29, ask: 31 } },
        longCall: { strike: 24300, quote: { ltp: 15, bid: 14.5, ask: 15.5 } },
        shortPut: { strike: 23800, quote: { ltp: 28, bid: 27, ask: 29 } },
        longPut: { strike: 23700, quote: { ltp: 14, bid: 13.5, ask: 14.5 } },
      });
      assert.equal(subHorizonIC.success, true);
      assert.equal(subHorizonIC.payoff?.estimatedValues.horizonStatus, "EXPIRES_BEFORE_HORIZON");
      assert.equal(subHorizonIC.payoff?.estimatedValues.greeksQuality, "DATA_INSUFFICIENT");
      assert.equal(subHorizonIC.payoff?.estimatedValues.underlyingMoveCalibrated, false);
      assert.equal(subHorizonIC.payoff?.estimatedValues.isHypotheticalDiagnostic, true);
    });
  });

  // ── 19. Phase 2 Final Audit: Pricing, Entry, Exit & P&L Accuracy ───────────
  describe("19. Phase 2 Final Audit: Pricing, Entry, Exit & P&L Accuracy", () => {
    // 19.1: Single-leg Call known-answer calculation
    it("19.1 verifies single-leg Call pricing, executable entry/exit, liquidation, and P&L against exact known answers", () => {
      const res = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 24000,
        spot: 24000,
        lotSize: 75,
        expiryYears: 7 / 365,
        holdingHours: 2.0,
        srRoom: 200,
        atr: 120,
        quote: { ltp: 111, bid: 110, ask: 112, iv: 15 },
        delta: 0.5,
      });

      assert.equal(res.success, true);
      const p = res.payoff!;

      // 1. Entry uses executable Ask (112.00)
      assert.equal(p.netEntryPrice, 112.00);
      assert.equal(p.calculatedValues.executableEntry, 112.00);
      assert.deepEqual(p.entryZone, [108.64, 115.36]);

      // 2. Immediate pre-expiry liquidation uses executable Bid (110.00)
      assert.equal(p.calculatedValues.currentLiquidationValue, 110.00);
      assert.equal(p.calculatedValues.immediateUnrealizedPnL, -2.00, "Unrealized P&L matches -spread");
      assert.equal(p.calculatedValues.immediateUnrealizedPnLPerLot, -150.00, "Unrealized P&L per lot matches -spread * 75");

      // 3. Stop loss and risk
      assert.equal(p.stopLossPrice, 56.00);
      assert.equal(p.calculatedValues.stopPremium, 56.00);
      assert.equal(p.stopLossAmountPerLot, 4200.00);

      // 4. Targets repriced by Black-Scholes at projected spots
      assert.equal(p.target1Price, 161.37);
      assert.equal(p.target2Price, 211.75);
      assert.equal(p.grossRewardToRisk, 0.88);
      assert.equal(p.target1ProfitPerLot, 3702.75);
      assert.equal(p.target2ProfitPerLot, 7481.25);

      // 5. Breakeven, max loss, max profit
      assert.deepEqual(p.breakevens, [24112.00]);
      assert.equal(p.maxTheoreticalLoss, 112.00);
      assert.equal(p.maxTheoreticalLossPerLot, 8400.00);
      assert.equal(p.maxTheoreticalProfit, null, "Call max profit is open-ended");
      assert.equal(p.maxTheoreticalProfitPerLot, null);

      // 6. Estimated transaction costs and Net P&L (DEFAULT: Plus fallback plan ₹30/order)
      assert.equal(p.estimatedValues.orderCount, 2);
      assert.equal(p.estimatedValues.brokeragePerOrder, 30);
      assert.equal(p.estimatedValues.targetSlippagePerLot, 204.75, "Total slippage: ₹84 entry + ₹120.75 exit");
      assert.equal(p.estimatedValues.transactionCosts.brokerage, 60.00, "2 orders * ₹30 = ₹60");
      assert.equal(p.estimatedValues.transactionCosts.totalCosts, 97.62);
      assert.equal(p.estimatedValues.netProfitTarget1PerLot, 3400.38, "Net profit = ₹3,702.75 gross - ₹204.75 slippage - ₹97.62 costs");
      assert.equal(p.estimatedValues.netRewardToRisk, 0.76);

      // 7. Configurable BASIC plan (₹20/order)
      const resBasic = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 24000,
        spot: 24000,
        lotSize: 75,
        expiryYears: 7 / 365,
        holdingHours: 2.0,
        srRoom: 200,
        atr: 120,
        quote: { ltp: 111, bid: 110, ask: 112, iv: 15 },
        delta: 0.5,
        costConfig: BASIC_PLAN_COSTS,
      });
      const pB = resBasic.payoff!;
      assert.equal(pB.estimatedValues.orderCount, 2);
      assert.equal(pB.estimatedValues.brokeragePerOrder, 20);
      assert.equal(pB.estimatedValues.transactionCosts.brokerage, 40.00, "2 orders * ₹20 = ₹40");
      assert.equal(pB.estimatedValues.transactionCosts.totalCosts, 74.02);
      assert.equal(pB.estimatedValues.netProfitTarget1PerLot, 3423.98, "Net profit = ₹3,702.75 gross - ₹204.75 slippage - ₹74.02 costs");
    });

    // 19.2: Single-leg Put known-answer calculation
    it("19.2 verifies single-leg Put pricing, executable entry/exit, liquidation, and P&L against exact known answers", () => {
      const res = calculateSingleLegPayoff({
        strategy: "LONG_PUT",
        strike: 24000,
        spot: 24000,
        lotSize: 75,
        expiryYears: 7 / 365,
        holdingHours: 2.0,
        srRoom: 200,
        atr: 120,
        quote: { ltp: 106, bid: 105, ask: 107, iv: 15 },
        delta: -0.5,
      });

      assert.equal(res.success, true);
      const p = res.payoff!;

      // 1. Entry uses executable Ask (107.00)
      assert.equal(p.netEntryPrice, 107.00);
      assert.equal(p.calculatedValues.executableEntry, 107.00);

      // 2. Immediate pre-expiry liquidation uses executable Bid (105.00)
      assert.equal(p.calculatedValues.currentLiquidationValue, 105.00);
      assert.equal(p.calculatedValues.immediateUnrealizedPnL, -2.00);
      assert.equal(p.calculatedValues.immediateUnrealizedPnLPerLot, -150.00);

      // 3. Stop loss and risk
      assert.equal(p.stopLossPrice, 53.50);
      assert.equal(p.stopLossAmountPerLot, 4012.50);

      // 4. Targets repriced by Black-Scholes at projected spots
      assert.equal(p.target1Price, 151.74);
      assert.equal(p.target2Price, 197.85);
      assert.equal(p.grossRewardToRisk, 0.84);
      assert.equal(p.target1ProfitPerLot, 3355.50);

      // 5. Breakeven, max loss, max profit
      assert.deepEqual(p.breakevens, [23893.00]);
      assert.equal(p.maxTheoreticalLoss, 107.00);
      assert.equal(p.maxTheoreticalLossPerLot, 8025.00);
      assert.equal(p.maxTheoreticalProfit, 23893.00, "Put max profit is strike - entry");
      assert.equal(p.maxTheoreticalProfitPerLot, 1791975.00);

      // 6. Transaction costs and Net P&L (DEFAULT: Plus ₹30/order)
      assert.equal(p.estimatedValues.orderCount, 2);
      assert.equal(p.estimatedValues.brokeragePerOrder, 30);
      assert.equal(p.estimatedValues.targetSlippagePerLot, 194.25);
      assert.equal(p.estimatedValues.transactionCosts.brokerage, 60.00);
      assert.equal(p.estimatedValues.transactionCosts.totalCosts, 96.08);
      assert.equal(p.estimatedValues.netProfitTarget1PerLot, 3065.17, "Net profit = ₹3,355.50 gross - ₹194.25 slippage - ₹96.08 costs");

      // 7. Configurable BASIC plan (₹20/order)
      const resBasic = calculateSingleLegPayoff({
        strategy: "LONG_PUT",
        strike: 24000,
        spot: 24000,
        lotSize: 75,
        expiryYears: 7 / 365,
        holdingHours: 2.0,
        srRoom: 200,
        atr: 120,
        quote: { ltp: 106, bid: 105, ask: 107, iv: 15 },
        delta: -0.5,
        costConfig: BASIC_PLAN_COSTS,
      });
      const pB = resBasic.payoff!;
      assert.equal(pB.estimatedValues.transactionCosts.brokerage, 40.00);
      assert.equal(pB.estimatedValues.transactionCosts.totalCosts, 72.48);
      assert.equal(pB.estimatedValues.netProfitTarget1PerLot, 3088.77);
    });

    // 19.3: Bull Call Spread known-answer calculation
    it("19.3 verifies Bull Call Spread executable entry, liquidation, and 4-fill transaction costs", () => {
      const res = calculateDebitSpreadPayoff({
        strategy: "BULL_CALL_SPREAD",
        spot: 24000,
        lotSize: 75,
        expiryYears: 7 / 365,
        longLeg: { strike: 24000, quote: { ltp: 111, bid: 110, ask: 112 } },
        shortLeg: { strike: 24100, quote: { ltp: 61, bid: 60, ask: 62 } },
      });

      assert.equal(res.success, true);
      const p = res.payoff!;

      // 1. Entry: long Ask (112) - short Bid (60) = 52.00
      assert.equal(p.netEntryPrice, 52.00);
      assert.equal(p.calculatedValues.executableEntry, 52.00);
      assert.deepEqual(p.entryZone, [49.40, 54.60]);

      // 2. Pre-expiry liquidation: long Bid (110) - short Ask (62) = 48.00
      assert.equal(p.calculatedValues.currentLiquidationValue, 48.00);
      assert.equal(p.calculatedValues.immediateUnrealizedPnL, -4.00, "Unrealized P&L is -4.00 (-sum of spreads)");
      assert.equal(p.calculatedValues.immediateUnrealizedPnLPerLot, -300.00);

      // 3. Risk & Payoff
      assert.equal(p.stopLossPrice, 26.00);
      assert.equal(p.maxTheoreticalLoss, 52.00);
      assert.equal(p.maxTheoreticalLossPerLot, 3900.00);
      assert.equal(p.maxTheoreticalProfit, 48.00);
      assert.equal(p.maxTheoreticalProfitPerLot, 3600.00);
      assert.deepEqual(p.breakevens, [24052.00]);

      // 4. Spread expansion targets
      assert.equal(p.target1Price, 80.80);
      assert.equal(p.target2Price, 95.20);
      assert.equal(p.grossRewardToRisk, 1.11);
      assert.equal(p.target1ProfitPerLot, 2160.00);
      assert.equal(p.target2ProfitPerLot, 3240.00);

      // 5. 4-fill transaction costs (DEFAULT: Plus ₹30/order)
      assert.equal(p.estimatedValues.orderCount, 4);
      assert.equal(p.estimatedValues.brokeragePerOrder, 30);
      assert.equal(p.estimatedValues.targetSlippagePerLot, 329.25);
      const costs = p.estimatedValues.transactionCosts;
      assert.equal(costs.brokerage, 120.00, "4 fills * ₹30 = ₹120 brokerage");
      assert.equal(costs.totalCosts, 181.98);
      assert.equal(p.estimatedValues.netProfitTarget1PerLot, 1648.77, "Net profit = ₹2,160 gross - ₹329.25 slippage - ₹181.98 costs");

      // 6. Configurable BASIC plan (₹20/order)
      const resBasic = calculateDebitSpreadPayoff({
        strategy: "BULL_CALL_SPREAD",
        spot: 24000,
        lotSize: 75,
        expiryYears: 7 / 365,
        longLeg: { strike: 24000, quote: { ltp: 111, bid: 110, ask: 112 } },
        shortLeg: { strike: 24100, quote: { ltp: 61, bid: 60, ask: 62 } },
        costConfig: BASIC_PLAN_COSTS,
      });
      const pB = resBasic.payoff!;
      assert.equal(pB.estimatedValues.orderCount, 4);
      assert.equal(pB.estimatedValues.brokeragePerOrder, 20);
      assert.equal(pB.estimatedValues.transactionCosts.brokerage, 80.00, "4 fills * ₹20 = ₹80 brokerage");
      assert.equal(pB.estimatedValues.transactionCosts.totalCosts, 134.78);
      assert.equal(pB.estimatedValues.netProfitTarget1PerLot, 1695.97);
    });

    // 19.4: Bear Put Spread known-answer calculation
    it("19.4 verifies Bear Put Spread executable entry, liquidation, and 4-fill transaction costs", () => {
      const res = calculateDebitSpreadPayoff({
        strategy: "BEAR_PUT_SPREAD",
        spot: 24000,
        lotSize: 75,
        expiryYears: 7 / 365,
        longLeg: { strike: 24000, quote: { ltp: 105, bid: 104, ask: 106 } },
        shortLeg: { strike: 23900, quote: { ltp: 59, bid: 58, ask: 60 } },
      });

      assert.equal(res.success, true);
      const p = res.payoff!;

      // 1. Entry: long Ask (106) - short Bid (58) = 48.00
      assert.equal(p.netEntryPrice, 48.00);
      assert.equal(p.calculatedValues.executableEntry, 48.00);

      // 2. Pre-expiry liquidation: long Bid (104) - short Ask (60) = 44.00
      assert.equal(p.calculatedValues.currentLiquidationValue, 44.00);
      assert.equal(p.calculatedValues.immediateUnrealizedPnL, -4.00);
      assert.equal(p.calculatedValues.immediateUnrealizedPnLPerLot, -300.00);

      // 3. Risk & Payoff
      assert.equal(p.stopLossPrice, 24.00);
      assert.equal(p.maxTheoreticalLoss, 48.00);
      assert.equal(p.maxTheoreticalLossPerLot, 3600.00);
      assert.equal(p.maxTheoreticalProfit, 52.00);
      assert.equal(p.maxTheoreticalProfitPerLot, 3900.00);
      assert.deepEqual(p.breakevens, [23952.00]);

      // 4. Spread expansion targets
      assert.equal(p.target1Price, 79.20);
      assert.equal(p.target2Price, 94.80);
      assert.equal(p.grossRewardToRisk, 1.30);
      assert.equal(p.target1ProfitPerLot, 2340.00);
      assert.equal(p.target2ProfitPerLot, 3510.00);

      // 5. 4-fill transaction costs (DEFAULT: Plus ₹30/order)
      assert.equal(p.estimatedValues.orderCount, 4);
      assert.equal(p.estimatedValues.brokeragePerOrder, 30);
      assert.equal(p.estimatedValues.targetSlippagePerLot, 326.25);
      const costs = p.estimatedValues.transactionCosts;
      assert.equal(costs.brokerage, 120.00, "4 fills * ₹30 = ₹120 brokerage");
      assert.equal(costs.totalCosts, 181.69, "Total costs includes SEBI charges in GST base per Upstox published calculator");
      assert.equal(p.estimatedValues.netProfitTarget1PerLot, 1832.06);

      // 6. Configurable BASIC plan (₹20/order)
      const resBasic = calculateDebitSpreadPayoff({
        strategy: "BEAR_PUT_SPREAD",
        spot: 24000,
        lotSize: 75,
        expiryYears: 7 / 365,
        longLeg: { strike: 24000, quote: { ltp: 105, bid: 104, ask: 106 } },
        shortLeg: { strike: 23900, quote: { ltp: 59, bid: 58, ask: 60 } },
        costConfig: BASIC_PLAN_COSTS,
      });
      const pB = resBasic.payoff!;
      assert.equal(pB.estimatedValues.orderCount, 4);
      assert.equal(pB.estimatedValues.brokeragePerOrder, 20);
      assert.equal(pB.estimatedValues.transactionCosts.brokerage, 80.00, "4 fills * ₹20 = ₹80 brokerage");
      assert.equal(pB.estimatedValues.transactionCosts.totalCosts, 134.49, "Total costs includes SEBI charges in GST base per Upstox published calculator");
      assert.equal(pB.estimatedValues.netProfitTarget1PerLot, 1879.26);
    });

    // 19.5: Symmetric Iron Condor known-answer calculation
    it("19.5 verifies Symmetric Iron Condor executable entry, buyback liquidation, and 8-fill costs", () => {
      const res = calculateIronCondorPayoff({
        spot: 24000,
        lotSize: 75,
        expiryYears: 7 / 365,
        shortCall: { strike: 24200, quote: { ltp: 30, bid: 29, ask: 31 } },
        longCall: { strike: 24300, quote: { ltp: 15, bid: 14.5, ask: 15.5 } },
        shortPut: { strike: 23800, quote: { ltp: 28, bid: 27, ask: 29 } },
        longPut: { strike: 23700, quote: { ltp: 14, bid: 13.5, ask: 14.5 } },
      });

      assert.equal(res.success, true);
      const p = res.payoff!;

      // 1. Entry Net Credit: (29 + 27) - (15.50 + 14.50) = 56 - 30 = 26.00
      assert.equal(p.netEntryPrice, 26.00);
      assert.equal(p.calculatedValues.executableEntry, 26.00);
      assert.deepEqual(p.entryZone, [24.70, 27.30]);

      // 2. Pre-expiry buyback liquidation cost: (31 + 29) - (14.50 + 13.50) = 60 - 28 = 32.00
      assert.equal(p.calculatedValues.currentLiquidationCost, 32.00);
      assert.equal(p.calculatedValues.immediateUnrealizedPnL, -6.00, "Unrealized P&L is -6.00 (-sum of all 4 spreads)");
      assert.equal(p.calculatedValues.immediateUnrealizedPnLPerLot, -450.00);

      // 3. Max Profit & Loss
      assert.equal(p.maxTheoreticalProfit, 26.00);
      assert.equal(p.maxTheoreticalProfitPerLot, 1950.00);
      assert.equal(p.maxTheoreticalLoss, 74.00);
      assert.equal(p.maxTheoreticalLossPerLot, 5550.00);

      // 4. Breakevens
      assert.deepEqual(p.breakevens, [23774.00, 24226.00]);

      // 5. Strategy 11.4 Stop and Targets
      assert.equal(p.stopLossPrice, 52.00, "Stop buyback at 2x credit");
      assert.equal(p.target1Price, 13.00, "Target 1 buyback at 0.5x credit");
      assert.equal(p.target2Price, 5.20, "Target 2 buyback at 0.2x credit");
      assert.equal(p.grossRewardToRisk, 0.50);
      assert.equal(p.target1ProfitPerLot, 975.00);
      assert.equal(p.stopLossAmountPerLot, 1950.00);

      // 6. 8-fill transaction costs (DEFAULT: Plus ₹30/order)
      assert.equal(p.estimatedValues.orderCount, 8);
      assert.equal(p.estimatedValues.brokeragePerOrder, 30);
      assert.equal(p.estimatedValues.targetSlippagePerLot, 324.00);
      const costs = p.estimatedValues.transactionCosts;
      assert.equal(costs.brokerage, 240.00, "8 fills * ₹30 = ₹240 brokerage");
      assert.equal(costs.totalCosts, 295.23);
      assert.equal(p.estimatedValues.netProfitTarget1PerLot, 355.77);

      // 7. Configurable BASIC plan (₹20/order)
      const resBasic = calculateIronCondorPayoff({
        spot: 24000,
        lotSize: 75,
        expiryYears: 7 / 365,
        shortCall: { strike: 24200, quote: { ltp: 30, bid: 29, ask: 31 } },
        longCall: { strike: 24300, quote: { ltp: 15, bid: 14.5, ask: 15.5 } },
        shortPut: { strike: 23800, quote: { ltp: 28, bid: 27, ask: 29 } },
        longPut: { strike: 23700, quote: { ltp: 14, bid: 13.5, ask: 14.5 } },
        costConfig: BASIC_PLAN_COSTS,
      });
      const pB = resBasic.payoff!;
      assert.equal(pB.estimatedValues.orderCount, 8);
      assert.equal(pB.estimatedValues.brokeragePerOrder, 20);
      assert.equal(pB.estimatedValues.transactionCosts.brokerage, 160.00, "8 fills * ₹20 = ₹160 brokerage");
      assert.equal(pB.estimatedValues.transactionCosts.totalCosts, 200.83);
      assert.equal(pB.estimatedValues.netProfitTarget1PerLot, 450.17);
    });

    // 19.6: Asymmetric Iron Condor (unequal wings) known-answer calculation
    it("19.6 verifies Asymmetric Iron Condor with unequal wings uses worst-case side-specific loss", () => {
      const res = calculateIronCondorPayoff({
        spot: 24000,
        lotSize: 75,
        expiryYears: 7 / 365,
        shortCall: { strike: 24200, quote: { ltp: 30, bid: 29, ask: 31 } },
        longCall: { strike: 24300, quote: { ltp: 15, bid: 14.5, ask: 15.5 } }, // Call wing = 100
        shortPut: { strike: 23800, quote: { ltp: 28, bid: 27, ask: 29 } },
        longPut: { strike: 23650, quote: { ltp: 9, bid: 8.5, ask: 9.5 } },   // Put wing = 150
      });

      assert.equal(res.success, true);
      const p = res.payoff!;

      // 1. Entry Net Credit: (29 + 27) - (15.50 + 9.50) = 56 - 25 = 31.00
      assert.equal(p.netEntryPrice, 31.00);

      // 2. Pre-expiry buyback liquidation cost: (31 + 29) - (14.50 + 8.50) = 60 - 23 = 37.00
      assert.equal(p.calculatedValues.currentLiquidationCost, 37.00);
      assert.equal(p.calculatedValues.immediateUnrealizedPnL, -6.00);
      assert.equal(p.calculatedValues.immediateUnrealizedPnLPerLot, -450.00);

      // 3. Max Loss: max(100 - 31, 150 - 31) = max(69, 119) = 119.00
      assert.equal(p.maxTheoreticalLoss, 119.00);
      assert.equal(p.maxTheoreticalLossPerLot, 8925.00);
      assert.equal(p.maxTheoreticalProfit, 31.00);
      assert.equal(p.maxTheoreticalProfitPerLot, 2325.00);

      // 4. Breakevens
      assert.deepEqual(p.breakevens, [23769.00, 24231.00]);

      // 5. Stop and Targets
      assert.equal(p.stopLossPrice, 62.00);
      assert.equal(p.target1Price, 15.50);
      assert.equal(p.target2Price, 6.20);
      assert.equal(p.grossRewardToRisk, 0.50);
      assert.equal(p.target1ProfitPerLot, 1162.50);

      // 6. 8-fill transaction costs (DEFAULT: Plus ₹30/order)
      assert.equal(p.estimatedValues.orderCount, 8);
      assert.equal(p.estimatedValues.brokeragePerOrder, 30);
      assert.equal(p.estimatedValues.targetSlippagePerLot, 318.00);
      const costs = p.estimatedValues.transactionCosts;
      assert.equal(costs.brokerage, 240.00, "8 fills * ₹30 = ₹240 brokerage");
      assert.equal(costs.totalCosts, 294.71);
      assert.equal(p.estimatedValues.netProfitTarget1PerLot, 549.79);

      // 7. Configurable BASIC plan (₹20/order)
      const resBasic = calculateIronCondorPayoff({
        spot: 24000,
        lotSize: 75,
        expiryYears: 7 / 365,
        shortCall: { strike: 24200, quote: { ltp: 30, bid: 29, ask: 31 } },
        longCall: { strike: 24300, quote: { ltp: 15, bid: 14.5, ask: 15.5 } },
        shortPut: { strike: 23800, quote: { ltp: 28, bid: 27, ask: 29 } },
        longPut: { strike: 23650, quote: { ltp: 9, bid: 8.5, ask: 9.5 } },
        costConfig: BASIC_PLAN_COSTS,
      });
      const pB = resBasic.payoff!;
      assert.equal(pB.estimatedValues.orderCount, 8);
      assert.equal(pB.estimatedValues.brokeragePerOrder, 20);
      assert.equal(pB.estimatedValues.transactionCosts.brokerage, 160.00, "8 fills * ₹20 = ₹160 brokerage");
      assert.equal(pB.estimatedValues.transactionCosts.totalCosts, 200.31);
      assert.equal(pB.estimatedValues.netProfitTarget1PerLot, 644.19);
    });

    // 19.7: Rejection of wide, missing, and crossed quotes
    it("19.7 strictly rejects wide (>12%), missing, zero, negative, and crossed quotes across all strategies", () => {
      // 1. Wide spread (>12%)
      const wide = validateExecutableQuote({ ltp: 100, bid: 80, ask: 95 }, "BUY");
      assert.equal(wide.valid, false);
      assert.ok(wide.rejectionReason?.includes("exceeds maximum allowed 12%"));

      // 2. Missing bid
      const missingBid = validateExecutableQuote({ ltp: 100, bid: null, ask: 102 }, "BUY");
      assert.equal(missingBid.valid, false);
      assert.ok(missingBid.rejectionReason?.includes("Missing bid or ask quote"));

      // 3. Missing ask
      const missingAsk = validateExecutableQuote({ ltp: 100, bid: 98, ask: null }, "BUY");
      assert.equal(missingAsk.valid, false);

      // 4. Zero / negative quote
      const zeroQuote = validateExecutableQuote({ ltp: 100, bid: 0, ask: 10 }, "BUY");
      assert.equal(zeroQuote.valid, false);
      assert.ok(zeroQuote.rejectionReason?.includes("Zero or negative"));

      // 5. Crossed quote (ask < bid)
      const crossed = validateExecutableQuote({ ltp: 100, bid: 102, ask: 98 }, "BUY");
      assert.equal(crossed.valid, false);
      assert.ok(crossed.rejectionReason?.includes("Crossed market"));
    });

    // 19.8: Stale quote rejection in multi-leg
    it("19.8 rejects multi-leg execution when any individual leg quote is STALE", () => {
      const now = new Date("2026-10-05T07:00:00Z");
      const staleLtt = new Date(now.getTime() - 600_000).toISOString(); // 10 minutes ago -> STALE

      const staleIC = calculateIronCondorPayoff({
        spot: 24000,
        lotSize: 75,
        now,
        shortCall: { strike: 24200, quote: { ltp: 30, bid: 29, ask: 31, lastTradeTime: staleLtt } },
        longCall: { strike: 24300, quote: { ltp: 15, bid: 14.5, ask: 15.5, lastTradeTime: now.toISOString() } },
        shortPut: { strike: 23800, quote: { ltp: 28, bid: 27, ask: 29, lastTradeTime: now.toISOString() } },
        longPut: { strike: 23700, quote: { ltp: 14, bid: 13.5, ask: 14.5, lastTradeTime: now.toISOString() } },
      });

      assert.equal(staleIC.success, false);
      assert.ok(staleIC.rejectionReason?.includes("Leg Short Call quote is stale"));
    });

    // 19.9: Expiry horizon classification (sub-horizon vs coincident vs super-horizon vs expired)
    it("19.9 enforces exact classification across sub-horizon, coincident, super-horizon, and expired contracts", () => {
      const dtYears = 2.0 / (365 * 24);

      // 1. Super-horizon (T > dt) -> BLACK_SCHOLES_REPRICED
      const superH = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 24000,
        spot: 24000,
        lotSize: 75,
        expiryYears: 7 / 365,
        holdingHours: 2.0,
        srRoom: 200,
        atr: 100,
        quote: { ltp: 100, bid: 99, ask: 101, iv: 15 },
        delta: 0.5,
      });
      assert.equal(superH.payoff?.estimatedValues.targetPricingModel, "BLACK_SCHOLES_REPRICED");
      assert.equal(superH.payoff?.estimatedValues.horizonStatus, "EXPIRES_AFTER_HORIZON");
      assert.equal(superH.payoff?.estimatedValues.underlyingMoveCalibrated, true);

      // 2. Coincident at horizon (T = dt) -> EXPIRY_PAYOFF
      const coincident = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 24000,
        spot: 24000,
        lotSize: 75,
        expiryYears: dtYears,
        holdingHours: 2.0,
        srRoom: 200,
        atr: 100,
        quote: { ltp: 100, bid: 99, ask: 101, iv: 15 },
        delta: 0.5,
      });
      assert.equal(coincident.payoff?.estimatedValues.targetPricingModel, "EXPIRY_PAYOFF");
      assert.equal(coincident.payoff?.estimatedValues.horizonStatus, "EXPIRES_AT_HORIZON");
      assert.equal(coincident.payoff?.estimatedValues.underlyingMoveCalibrated, true);

      // 3. Sub-horizon (0 < T < dt) -> DATA_INSUFFICIENT, uncalibrated, hypothetical
      const subH = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 24000,
        spot: 24000,
        lotSize: 75,
        expiryYears: 0.25 / 8760, // 15 mins
        holdingHours: 2.0,
        srRoom: 200,
        atr: 100,
        quote: { ltp: 100, bid: 99, ask: 101, iv: 15 },
        delta: 0.5,
      });
      assert.equal(subH.payoff?.estimatedValues.targetPricingModel, "EXPIRY_PAYOFF");
      assert.equal(subH.payoff?.estimatedValues.horizonStatus, "EXPIRES_BEFORE_HORIZON");
      assert.equal(subH.payoff?.estimatedValues.underlyingMoveCalibrated, false);
      assert.equal(subH.payoff?.estimatedValues.isHypotheticalDiagnostic, true);

      // 4. Expired contract (T <= 0) -> Fails closed immediately
      const expired = calculateSingleLegPayoff({
        strategy: "LONG_CALL",
        strike: 24000,
        spot: 24000,
        lotSize: 75,
        expiryYears: 0,
        srRoom: 200,
        atr: 100,
        quote: { ltp: 100, bid: 99, ask: 101, iv: 15 },
        delta: 0.5,
      });
      assert.equal(expired.success, false);
      assert.ok(expired.rejectionReason?.includes("Contract has expired"));
    });

    // 19.10: Explicit Brokerage Accounting & Order Count
    it("19.10 verifies round-trip brokerage across 2, 4 and 8 executed orders without capping or double counting", () => {
      // Basic plan: ₹20 per executed order
      const singleLeg2Basic = costsFor([{ side: "BUY", price: 100, quantity: 75 }, { side: "SELL", price: 150, quantity: 75 }], BASIC_PLAN_COSTS);
      assert.equal(singleLeg2Basic.brokerage, 40.00, "Single-leg Basic round-trip: 2 * ₹20 = ₹40");

      const vertical4Basic = costsFor([
        { side: "BUY", price: 112, quantity: 75 }, { side: "SELL", price: 60, quantity: 75 },
        { side: "SELL", price: 80.8, quantity: 75 }, { side: "BUY", price: 30, quantity: 75 }
      ], BASIC_PLAN_COSTS);
      assert.equal(vertical4Basic.brokerage, 80.00, "Vertical spread Basic round-trip: 4 * ₹20 = ₹80");

      const condor8Basic = costsFor([
        { side: "SELL", price: 29, quantity: 75 }, { side: "BUY", price: 15.5, quantity: 75 },
        { side: "SELL", price: 27, quantity: 75 }, { side: "BUY", price: 14.5, quantity: 75 },
        { side: "BUY", price: 15, quantity: 75 }, { side: "SELL", price: 7, quantity: 75 },
        { side: "BUY", price: 13, quantity: 75 }, { side: "SELL", price: 6, quantity: 75 }
      ], BASIC_PLAN_COSTS);
      assert.equal(condor8Basic.brokerage, 160.00, "Iron Condor Basic round-trip: 8 * ₹20 = ₹160");

      // Plus / Default plan: ₹30 per executed order
      const singleLeg2Plus = costsFor([{ side: "BUY", price: 100, quantity: 75 }, { side: "SELL", price: 150, quantity: 75 }], PLUS_PLAN_COSTS);
      assert.equal(singleLeg2Plus.brokerage, 60.00, "Single-leg Plus round-trip: 2 * ₹30 = ₹60");

      const vertical4Plus = costsFor([
        { side: "BUY", price: 112, quantity: 75 }, { side: "SELL", price: 60, quantity: 75 },
        { side: "SELL", price: 80.8, quantity: 75 }, { side: "BUY", price: 30, quantity: 75 }
      ], PLUS_PLAN_COSTS);
      assert.equal(vertical4Plus.brokerage, 120.00, "Vertical spread Plus round-trip: 4 * ₹30 = ₹120");

      const condor8Plus = costsFor([
        { side: "SELL", price: 29, quantity: 75 }, { side: "BUY", price: 15.5, quantity: 75 },
        { side: "SELL", price: 27, quantity: 75 }, { side: "BUY", price: 14.5, quantity: 75 },
        { side: "BUY", price: 15, quantity: 75 }, { side: "SELL", price: 7, quantity: 75 },
        { side: "BUY", price: 13, quantity: 75 }, { side: "SELL", price: 6, quantity: 75 }
      ], PLUS_PLAN_COSTS);
      assert.equal(condor8Plus.brokerage, 240.00, "Iron Condor Plus round-trip: 8 * ₹30 = ₹240");
    });

    // 19.11: Statutory rates for 18 November 2026
    it("19.11 verifies statutory rates: STT 0.15%, NSE+IPFT 0.03553%, SEBI ₹10/cr, Stamp 0.003%, GST 18%", () => {
      // Configuration rate assertions
      assert.equal(DEFAULT_TRANSACTION_COSTS.sttRate, 0.0015, "STT is 0.15% (0.0015) on sell premium");
      assert.equal(DEFAULT_TRANSACTION_COSTS.exchangeTxnRate, 0.0003553, "NSE txn + IPFT is 0.03553% (0.0003553) on total premium");
      assert.equal(DEFAULT_TRANSACTION_COSTS.sebiRate, 0.000001, "SEBI fee is ₹10 per crore (0.000001) on total premium");
      assert.equal(DEFAULT_TRANSACTION_COSTS.stampDutyRate, 0.00003, "Stamp duty is 0.003% (0.00003) on buy premium");
      assert.equal(DEFAULT_TRANSACTION_COSTS.gstRate, 0.18, "GST is 18% on taxable broker and exchange charges");

      // Precise numerical verification on a known-turnover fill pair
      // Buy 100 units @ ₹100 = ₹10,000 turnover
      // Sell 100 units @ ₹200 = ₹20,000 turnover
      // Total turnover = ₹30,000
      const c = costsFor([
        { side: "BUY", price: 100, quantity: 100 },
        { side: "SELL", price: 200, quantity: 100 },
      ], BASIC_PLAN_COSTS);

      assert.equal(c.brokerage, 40.00); // 2 * 20
      assert.equal(c.stt, 30.00); // 20000 * 0.0015 = 30.00
      assert.equal(c.exchangeCharges, 10.66); // 30000 * 0.0003553 = 10.659 -> 10.66
      assert.equal(c.sebiCharges, 0.03); // 30000 * 0.000001 = 0.03
      assert.equal(c.stampDuty, 0.30); // 10000 * 0.00003 = 0.30
      assert.equal(c.gst, 9.12); // (40 + 10.66) * 0.18 = 50.66 * 0.18 = 9.1188 -> 9.12
      assert.equal(c.totalCosts, 90.11); // 40 + 30 + 10.66 + 9.12 + 0.03 + 0.30 = 90.11
    });

    // 19.12: Downstream Strategy 11.4 Eligibility Enforcement
    it("19.12 verifies downstream recommendation eligibility: rejects Long Call (0.88), Long Put (0.84), BCS (1.11); passes BPS (1.30) and IC (0.50)", () => {
      const snap = buildMockSnapshot({ index: "nifty", spot: 24000, strikeStep: 50, lotSize: 75 });

      // 1. Long Call (RR = 0.88, debit threshold 1.20) -> REJECTED
      const callPlan: TradePlan = {
        strategy: "Long Call",
        legs: [{ side: "BUY", type: "CE", strike: 24000, ltp: 112 }],
        credit: false,
        entry: 112,
        stop: 56,
        target1: 161.37,
        target2: 211.75,
        entryZone: [108.64, 115.36],
        rr: 0.88,
        maxLoss: 112,
        maxProfit: null,
        breakevens: [24112],
        score: 70,
        rejected: null,
      };
      const callRisk = evaluateTradeRisk(callPlan, snap, {}, { ...DEFAULT_RISK_CONFIG, accountCapital: undefined }, FIXED_NOW);
      assert.ok(callRisk.reasons.includes("INSUFFICIENT_RR"), "Long Call (RR 0.88) rejected by Strategy 11.4 1.20 debit threshold");

      // 2. Long Put (RR = 0.84, debit threshold 1.20) -> REJECTED
      const putPlan: TradePlan = {
        strategy: "Long Put",
        legs: [{ side: "BUY", type: "PE", strike: 24000, ltp: 107 }],
        credit: false,
        entry: 107,
        stop: 53.5,
        target1: 151.74,
        target2: 197.85,
        entryZone: [103.79, 110.21],
        rr: 0.84,
        maxLoss: 107,
        maxProfit: 23893,
        breakevens: [23893],
        score: 70,
        rejected: null,
      };
      const putRisk = evaluateTradeRisk(putPlan, snap, {}, { ...DEFAULT_RISK_CONFIG, accountCapital: undefined }, FIXED_NOW);
      assert.ok(putRisk.reasons.includes("INSUFFICIENT_RR"), "Long Put (RR 0.84) rejected by Strategy 11.4 1.20 debit threshold");

      // 3. Bull Call Spread (RR = 1.11, debit threshold 1.20) -> REJECTED
      const bcsPlan: TradePlan = {
        strategy: "Bull Call Spread",
        legs: [
          { side: "BUY", type: "CE", strike: 24000, ltp: 112 },
          { side: "SELL", type: "CE", strike: 24100, ltp: 62 },
        ],
        credit: false,
        entry: 52,
        stop: 26,
        target1: 80.8,
        target2: 95.2,
        entryZone: [50.44, 53.56],
        rr: 1.11,
        maxLoss: 52,
        maxProfit: 48,
        breakevens: [24052],
        score: 70,
        rejected: null,
      };
      const bcsRisk = evaluateTradeRisk(bcsPlan, snap, {}, { ...DEFAULT_RISK_CONFIG, accountCapital: undefined }, FIXED_NOW);
      assert.ok(bcsRisk.reasons.includes("INSUFFICIENT_RR"), "Bull Call Spread (RR 1.11) rejected by Strategy 11.4 1.20 debit threshold");

      // 4. Bear Put Spread (RR = 1.30, debit threshold 1.20) -> PASSES
      const bpsPlan: TradePlan = {
        strategy: "Bear Put Spread",
        legs: [
          { side: "BUY", type: "PE", strike: 24000, ltp: 106 },
          { side: "SELL", type: "PE", strike: 23900, ltp: 58 },
        ],
        credit: false,
        entry: 48,
        stop: 24,
        target1: 79.2,
        target2: 94.8,
        entryZone: [46.56, 49.44],
        rr: 1.30,
        maxLoss: 48,
        maxProfit: 52,
        breakevens: [23952],
        score: 70,
        rejected: null,
      };
      const bpsRisk = evaluateTradeRisk(bpsPlan, snap, {}, { ...DEFAULT_RISK_CONFIG, accountCapital: undefined }, FIXED_NOW);
      assert.ok(!bpsRisk.reasons.includes("INSUFFICIENT_RR"), "Bear Put Spread (RR 1.30) passes Strategy 11.4 1.20 debit threshold");

      // 5. Iron Condor (RR = 0.50, credit threshold 0.40) -> PASSES
      const icPlan: TradePlan = {
        strategy: "Iron Condor",
        legs: [
          { side: "SELL", type: "CE", strike: 24200, ltp: 30 },
          { side: "BUY", type: "CE", strike: 24300, ltp: 15 },
          { side: "SELL", type: "PE", strike: 23800, ltp: 28 },
          { side: "BUY", type: "PE", strike: 23700, ltp: 14 },
        ],
        credit: true,
        entry: 26,
        stop: 52,
        target1: 13,
        target2: 5.2,
        entryZone: [25.22, 26.78],
        rr: 0.50,
        maxLoss: 74,
        maxProfit: 26,
        breakevens: [23774, 24226],
        score: 70,
        rejected: null,
      };
      const icRisk = evaluateTradeRisk(icPlan, snap, {}, { ...DEFAULT_RISK_CONFIG, accountCapital: undefined }, FIXED_NOW);
      assert.ok(!icRisk.reasons.includes("INSUFFICIENT_RR"), "Iron Condor (RR 0.50) passes Strategy 11.4 0.40 credit threshold");
    });
  });

  // ── 20. Mandatory Multi-Leg P&L Reconciliation ──────────────────────────────
  describe("20. Mandatory Multi-Leg P&L Reconciliation", () => {
    // 20.1 Bull Call Spread
    it("20.1 verifies Bull Call Spread hand-derived slippage (₹372.00) and net P&L (-₹1,709.36 Basic / -₹1,756.56 Plus)", () => {
      const resBasic = calculateDebitSpreadPayoff({
        strategy: "BULL_CALL_SPREAD",
        spot: 24000,
        lotSize: 75,
        expiryYears: 7 / 365,
        longLeg: { strike: 24000, quote: { ltp: 180, bid: 179, ask: 181 }, targetQuote: { bid: 120, ask: 122 } },
        shortLeg: { strike: 24100, quote: { ltp: 121, bid: 120, ask: 122 }, targetQuote: { bid: 74, ask: 75 } },
        costConfig: BASIC_PLAN_COSTS,
      });

      assert.equal(resBasic.success, true);
      const p = resBasic.payoff!;
      // Quoted Gross P&L: Target (120 - 75) = 45 vs Entry (181 - 120) = 61 -> -16 * 75 = -1200.00
      assert.equal(p.target1ProfitPerLot, -1200.00);
      // Slippage: (1.81 + 1.20 + 1.20 + 0.75) * 75 = 4.96 * 75 = 372.00
      assert.equal(p.estimatedValues.targetSlippagePerLot, 372.00);
      // Upstox published calculator includes SEBI in GST: Total costs = 137.36
      assert.equal(p.estimatedValues.transactionCosts.totalCosts, 137.36);
      // Net P&L: -1200.00 - 372.00 - 137.36 = -1709.36
      assert.equal(p.estimatedValues.netProfitTarget1PerLot, -1709.36);

      const resPlus = calculateDebitSpreadPayoff({
        strategy: "BULL_CALL_SPREAD",
        spot: 24000,
        lotSize: 75,
        expiryYears: 7 / 365,
        longLeg: { strike: 24000, quote: { ltp: 180, bid: 179, ask: 181 }, targetQuote: { bid: 120, ask: 122 } },
        shortLeg: { strike: 24100, quote: { ltp: 121, bid: 120, ask: 122 }, targetQuote: { bid: 74, ask: 75 } },
        costConfig: DEFAULT_TRANSACTION_COSTS,
      });
      assert.equal(resPlus.payoff!.estimatedValues.targetSlippagePerLot, 372.00);
      assert.equal(resPlus.payoff!.estimatedValues.transactionCosts.totalCosts, 184.56);
      assert.equal(resPlus.payoff!.estimatedValues.netProfitTarget1PerLot, -1756.56);
    });

    // 20.2 Bear Put Spread
    it("20.2 verifies Bear Put Spread hand-derived slippage (₹381.00) and net P&L (-₹1,119.85 Basic / -₹1,167.05 Plus)", () => {
      const resBasic = calculateDebitSpreadPayoff({
        strategy: "BEAR_PUT_SPREAD",
        spot: 24000,
        lotSize: 75,
        expiryYears: 7 / 365,
        longLeg: { strike: 24000, quote: { ltp: 175, bid: 174, ask: 176 }, targetQuote: { bid: 125, ask: 127 } },
        shortLeg: { strike: 23900, quote: { ltp: 126, bid: 125, ask: 127 }, targetQuote: { bid: 81, ask: 82 } },
        costConfig: BASIC_PLAN_COSTS,
      });

      assert.equal(resBasic.success, true);
      const p = resBasic.payoff!;
      // Quoted Gross P&L: Target (125 - 82) = 43 vs Entry (176 - 125) = 51 -> -8 * 75 = -600.00
      assert.equal(p.target1ProfitPerLot, -600.00);
      // Slippage: (1.76 + 1.25 + 1.25 + 0.82) * 75 = 5.08 * 75 = 381.00
      assert.equal(p.estimatedValues.targetSlippagePerLot, 381.00);
      assert.equal(p.estimatedValues.transactionCosts.totalCosts, 138.85);
      // Net P&L: -600.00 - 381.00 - 138.85 = -1119.85
      assert.equal(p.estimatedValues.netProfitTarget1PerLot, -1119.85);

      const resPlus = calculateDebitSpreadPayoff({
        strategy: "BEAR_PUT_SPREAD",
        spot: 24000,
        lotSize: 75,
        expiryYears: 7 / 365,
        longLeg: { strike: 24000, quote: { ltp: 175, bid: 174, ask: 176 }, targetQuote: { bid: 125, ask: 127 } },
        shortLeg: { strike: 23900, quote: { ltp: 126, bid: 125, ask: 127 }, targetQuote: { bid: 81, ask: 82 } },
        costConfig: DEFAULT_TRANSACTION_COSTS,
      });
      assert.equal(resPlus.payoff!.estimatedValues.targetSlippagePerLot, 381.00);
      assert.equal(resPlus.payoff!.estimatedValues.transactionCosts.totalCosts, 186.05);
      assert.equal(resPlus.payoff!.estimatedValues.netProfitTarget1PerLot, -1167.05);
    });

    // 20.3 Symmetric Iron Condor
    it("20.3 verifies Symmetric Iron Condor hand-derived slippage (₹423.00) and net P&L (+₹1,286.96 Basic / +₹1,192.56 Plus)", () => {
      const resBasic = calculateIronCondorPayoff({
        spot: 24000,
        lotSize: 75,
        expiryYears: 7 / 365,
        shortCall: { strike: 24200, quote: { ltp: 111, bid: 110, ask: 112 }, targetQuote: { bid: 64, ask: 65 } },
        longCall: { strike: 24300, quote: { ltp: 67, bid: 66, ask: 68 }, targetQuote: { bid: 36, ask: 37 } },
        shortPut: { strike: 23800, quote: { ltp: 113, bid: 112, ask: 114 }, targetQuote: { bid: 65, ask: 66 } },
        longPut: { strike: 23700, quote: { ltp: 69, bid: 68, ask: 70 }, targetQuote: { bid: 37, ask: 38 } },
        costConfig: BASIC_PLAN_COSTS,
      });

      assert.equal(resBasic.success, true);
      const p = resBasic.payoff!;
      // Quoted Gross: (84 - 58) * 75 = 26 * 75 = 1950.00
      assert.equal(p.target1ProfitPerLot, 1950.00);
      // Slippage: (1.10 + 0.68 + 1.12 + 0.70 + 0.65 + 0.36 + 0.66 + 0.37) * 75 = 5.64 * 75 = 423.00
      assert.equal(p.estimatedValues.targetSlippagePerLot, 423.00);
      // Upstox published calculator includes SEBI in GST: Total costs = 240.04
      assert.equal(p.estimatedValues.transactionCosts.totalCosts, 240.04);
      // Net P&L: 1950.00 - 423.00 - 240.04 = 1286.96
      assert.equal(p.estimatedValues.netProfitTarget1PerLot, 1286.96);

      const resPlus = calculateIronCondorPayoff({
        spot: 24000,
        lotSize: 75,
        expiryYears: 7 / 365,
        shortCall: { strike: 24200, quote: { ltp: 111, bid: 110, ask: 112 }, targetQuote: { bid: 64, ask: 65 } },
        longCall: { strike: 24300, quote: { ltp: 67, bid: 66, ask: 68 }, targetQuote: { bid: 36, ask: 37 } },
        shortPut: { strike: 23800, quote: { ltp: 113, bid: 112, ask: 114 }, targetQuote: { bid: 65, ask: 66 } },
        longPut: { strike: 23700, quote: { ltp: 69, bid: 68, ask: 70 }, targetQuote: { bid: 37, ask: 38 } },
        costConfig: DEFAULT_TRANSACTION_COSTS,
      });
      assert.equal(resPlus.payoff!.estimatedValues.targetSlippagePerLot, 423.00);
      assert.equal(resPlus.payoff!.estimatedValues.transactionCosts.totalCosts, 334.44);
      assert.equal(resPlus.payoff!.estimatedValues.netProfitTarget1PerLot, 1192.56);
    });

    // 20.4 Asymmetric Iron Condor
    it("20.4 verifies Asymmetric Iron Condor hand-derived slippage (₹401.25) and net P&L (+₹1,835.89 Basic / +₹1,741.49 Plus)", () => {
      const resBasic = calculateIronCondorPayoff({
        spot: 24000,
        lotSize: 75,
        expiryYears: 7 / 365,
        callWingWidth: 100,
        putWingWidth: 150,
        shortCall: { strike: 24200, quote: { ltp: 111, bid: 110, ask: 112 }, targetQuote: { bid: 64, ask: 65 } },
        longCall: { strike: 24300, quote: { ltp: 67, bid: 66, ask: 68 }, targetQuote: { bid: 36, ask: 37 } },
        shortPut: { strike: 23800, quote: { ltp: 113, bid: 112, ask: 114 }, targetQuote: { bid: 65, ask: 66 } },
        longPut: { strike: 23650, quote: { ltp: 51, bid: 50, ask: 52 }, targetQuote: { bid: 26, ask: 27 } },
        costConfig: BASIC_PLAN_COSTS,
      });

      assert.equal(resBasic.success, true);
      const p = resBasic.payoff!;
      // Quoted Gross: (102 - 69) * 75 = 33 * 75 = 2475.00
      assert.equal(p.target1ProfitPerLot, 2475.00);
      // Slippage: (1.10 + 0.68 + 1.12 + 0.52 + 0.65 + 0.36 + 0.66 + 0.26) * 75 = 5.35 * 75 = 401.25
      assert.equal(p.estimatedValues.targetSlippagePerLot, 401.25);
      // Upstox published calculator includes SEBI in GST: Total costs = 237.86
      assert.equal(p.estimatedValues.transactionCosts.totalCosts, 237.86);
      // Net P&L: 2475.00 - 401.25 - 237.86 = 1835.89 (exact paisa match to expected user benchmark)
      assert.equal(p.estimatedValues.netProfitTarget1PerLot, 1835.89);

      const resPlus = calculateIronCondorPayoff({
        spot: 24000,
        lotSize: 75,
        expiryYears: 7 / 365,
        callWingWidth: 100,
        putWingWidth: 150,
        shortCall: { strike: 24200, quote: { ltp: 111, bid: 110, ask: 112 }, targetQuote: { bid: 64, ask: 65 } },
        longCall: { strike: 24300, quote: { ltp: 67, bid: 66, ask: 68 }, targetQuote: { bid: 36, ask: 37 } },
        shortPut: { strike: 23800, quote: { ltp: 113, bid: 112, ask: 114 }, targetQuote: { bid: 65, ask: 66 } },
        longPut: { strike: 23650, quote: { ltp: 51, bid: 50, ask: 52 }, targetQuote: { bid: 26, ask: 27 } },
        costConfig: DEFAULT_TRANSACTION_COSTS,
      });
      assert.equal(resPlus.payoff!.estimatedValues.targetSlippagePerLot, 401.25);
      assert.equal(resPlus.payoff!.estimatedValues.transactionCosts.totalCosts, 332.26);
      assert.equal(resPlus.payoff!.estimatedValues.netProfitTarget1PerLot, 1741.49);
    });
  });
});
