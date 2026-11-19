import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { evaluateOptionsOpportunity } from "../engine/opportunityEngine.ts";
import type { OptionRow, Snapshot } from "../types.ts";
import { verifyEvaluationOptionPrices } from "./optionPriceVerification.ts";
import { validateCanonicalOptionRows, type CanonicalOptionContract } from "./upstoxMarket.ts";

const NOW = new Date("2026-11-04T05:30:00.000Z");
const EXPIRY = "2026-11-10";

function rows(): OptionRow[] {
  return [{
    strike: 24000,
    call: { ltp: 180, bid: 179, ask: 181, oi: 1000, chgOi: 10, volume: 100, iv: 15, delta: 0.5, instrumentKey: "NSE_FO|CALL" },
    put: { ltp: 175, bid: 174, ask: 176, oi: 1200, chgOi: 20, volume: 120, iv: 16, delta: -0.5, instrumentKey: "NSE_FO|PUT" },
  }];
}

function v3Quote(key: string, price: number, oi: number, previousOi: number, volume: number) {
  return {
    instrument_token: key,
    last_price: price,
    last_trade_time: NOW.getTime() - 4_000,
    timestamp: NOW.toISOString(),
    oi,
    previous_oi: previousOi,
    volume,
    depth: {
      buy: [{ price: price - 1, quantity: 100 }],
      sell: [{ price: price + 1, quantity: 100 }],
    },
  };
}

function snapshot(chain: OptionRow[], verification?: Snapshot["optionPriceVerification"]): Snapshot {
  const source = { source: "LIVE" as const, provider: "UPSTOX" as const, fetchedAt: NOW.toISOString(), lastTradeTime: NOW.toISOString() };
  return {
    index: "nifty", name: "NIFTY 50", spot: 24000, prevClose: 23800, expiry: EXPIRY, strikeStep: 50, lotSize: 75,
    indicators: { ema9: 23950, ema21: 23900, ema50: 23800, ema200: 23500, vwap: 23920, rsi: 60, macdHist: 5, atr: 150, pdh: 24100, pdl: 23700, orHigh: 23950, orLow: 23850 },
    ivPercentile: 40, breadth: null, news: { score: 0, bullishPct: 34, neutralPct: 33, bearishPct: 33, eventRisk: null }, chain, technical: null,
    sources: { market: source, optionChain: { ...source, source: "STALE" }, technical: source, news: source, breadth: source }, fallbackReason: null,
    optionPriceVerification: verification,
  };
}

describe("Options completion — Full Quotes V3 canonical reconstruction", () => {
  it("uses one canonical V3 snapshot to derive OI change, depth, IV and Greeks with explicit provenance", async () => {
    const result = await verifyEvaluationOptionPrices(rows(), 24000, "nifty", NOW, async (keys) => {
      assert.deepEqual(keys, ["NSE_FO|CALL", "NSE_FO|PUT"]);
      return {
        call: v3Quote("NSE_FO|CALL", 180, 1500, 1300, 500),
        put: v3Quote("NSE_FO|PUT", 175, 1600, 1700, 600),
      };
    }, 7, EXPIRY);

    assert.equal(result.summary.chainAnalytics, "CHAIN_ANALYTICS_VERIFIED_BOUNDED");
    assert.equal(result.summary.oiAnalytics, "OI_ANALYTICS_VERIFIED_BOUNDED");
    assert.equal(result.summary.volumeAnalytics, "VOLUME_ANALYTICS_VERIFIED_BOUNDED");
    assert.equal(result.summary.analyticsProvenance, "UPSTOX_FULL_QUOTES_V3_BOUNDED_REST_SNAPSHOT");
    const call = result.rows[0].call;
    assert.equal(call.oi, 1500);
    assert.equal(call.previousOi, 1300);
    assert.equal(call.chgOi, 200);
    assert.equal(call.volume, 500);
    assert.equal(call.bid, 179);
    assert.equal(call.ask, 181);
    assert.equal(call.ivProvenance, "INDEPENDENTLY_DERIVED");
    assert.equal(call.greeksProvenance, "INDEPENDENTLY_DERIVED");
    assert.ok(call.iv !== null && call.iv > 0);
    assert.ok(call.delta !== null && call.delta > 0 && call.delta < 1);
    assert.equal(call.ltp, 180, "chain LTP remains immutable after independent agreement check");
  });

  it("keeps complete OI/volume analytics when deep contracts are stale or have no LTT", async () => {
    const deep = rows();
    deep.push({
      strike: 25000,
      call: { ...deep[0].call, ltp: 5, instrumentKey: "NSE_FO|DEEP_CALL" },
      put: { ...deep[0].put, ltp: 1005, instrumentKey: "NSE_FO|DEEP_PUT" },
    });
    const result = await verifyEvaluationOptionPrices(deep, 24000, "nifty", NOW, async () => ({
      call: v3Quote("NSE_FO|CALL", 180, 1500, 1300, 500),
      put: v3Quote("NSE_FO|PUT", 175, 1600, 1700, 600),
      deepCall: { ...v3Quote("NSE_FO|DEEP_CALL", 5, 200, 190, 20), last_trade_time: NOW.getTime() - 600_000 },
      deepPut: { ...v3Quote("NSE_FO|DEEP_PUT", 1005, 300, 280, 30), last_trade_time: undefined },
    }), 7, EXPIRY);
    assert.equal(result.summary.chainAnalytics, "CHAIN_ANALYTICS_VERIFIED_BOUNDED");
    assert.equal(result.rows[1].call.contractPriceQuality, "CONTRACT_PRICE_STALE");
    assert.equal(result.rows[1].put.contractPriceQuality, "CONTRACT_PRICE_UNAVAILABLE");
    assert.equal(result.rows[1].put.chgOi, 20);
    assert.equal(result.rows[1].put.analyticsProvenance, "UPSTOX_FULL_QUOTES_V3_BOUNDED_REST_SNAPSHOT");
  });

  it("rejects a stale candidate while retaining bounded analytics", async () => {
    const verified = await verifyEvaluationOptionPrices(rows(), 24000, "nifty", NOW, async () => ({
      call: { ...v3Quote("NSE_FO|CALL", 180, 1500, 1300, 500), last_trade_time: NOW.getTime() - 600_000 },
      put: v3Quote("NSE_FO|PUT", 175, 1600, 1700, 600),
    }), 7, EXPIRY);
    const result = evaluateOptionsOpportunity(snapshot(verified.rows, verified.summary), "NIFTY", NOW);
    assert.equal(result.chainAnalyticsQuality, "CHAIN_ANALYTICS_VERIFIED_BOUNDED");
    assert.ok(result.rejectedContracts.some((item) => item.reason.includes("Stale exchange")));
    assert.equal(result.recommendedStrategy, "NO_TRADE");
  });

  it("fresh contract quotes cannot make a STALE option-chain source actionable", async () => {
    const verified = await verifyEvaluationOptionPrices(rows(), 24000, "nifty", NOW, async () => ({
      call: v3Quote("NSE_FO|CALL", 180, 1500, 1300, 500),
      put: v3Quote("NSE_FO|PUT", 175, 1600, 1700, 600),
    }), 7, EXPIRY);
    const result = evaluateOptionsOpportunity(snapshot(verified.rows, verified.summary), "NIFTY", NOW);
    assert.equal(result.dataQuality.optionChain, "STALE");
    assert.equal(result.candidateEligibility, "ALL_CANDIDATES_REJECTED");
    assert.ok(result.topOpportunities.every((candidate) => candidate.grade === "REJECT"));
    assert.ok(result.topOpportunities.every((candidate) =>
      candidate.gradeReasons?.some((reason) => reason.includes("fresh contract quotes cannot promote stale chain analytics")),
    ));
  });

  it("rejects a price-mismatched candidate without poisoning analytics", async () => {
    const verified = await verifyEvaluationOptionPrices(rows(), 24000, "nifty", NOW, async () => ({
      call: v3Quote("NSE_FO|CALL", 130, 1500, 1300, 500),
      put: v3Quote("NSE_FO|PUT", 175, 1600, 1700, 600),
    }), 7, EXPIRY);
    const result = evaluateOptionsOpportunity(snapshot(verified.rows, verified.summary), "NIFTY", NOW);
    assert.equal(result.chainAnalyticsQuality, "CHAIN_ANALYTICS_VERIFIED_BOUNDED");
    assert.ok(result.rejectedContracts.some((item) => item.reason.includes("LTP mismatch")));
  });

  it("reports OI and volume aggregate availability independently", async () => {
    const missingOi = await verifyEvaluationOptionPrices(rows(), 24000, "nifty", NOW, async () => ({
      call: { ...v3Quote("NSE_FO|CALL", 180, 1500, 1300, 500), previous_oi: undefined },
      put: v3Quote("NSE_FO|PUT", 175, 1600, 1700, 600),
    }), 7, EXPIRY);
    assert.equal(missingOi.summary.oiAnalytics, "OI_ANALYTICS_UNAVAILABLE");
    assert.equal(missingOi.summary.volumeAnalytics, "VOLUME_ANALYTICS_VERIFIED_BOUNDED");
    const oiResult = evaluateOptionsOpportunity(snapshot(missingOi.rows, missingOi.summary), "NIFTY", NOW);
    assert.equal(oiResult.pcrOi, null);
    assert.notEqual(oiResult.pcrVolume, null);

    const missingVolume = await verifyEvaluationOptionPrices(rows(), 24000, "nifty", NOW, async () => ({
      call: { ...v3Quote("NSE_FO|CALL", 180, 1500, 1300, 500), volume: undefined },
      put: v3Quote("NSE_FO|PUT", 175, 1600, 1700, 600),
    }), 7, EXPIRY);
    assert.equal(missingVolume.summary.oiAnalytics, "OI_ANALYTICS_VERIFIED_BOUNDED");
    assert.equal(missingVolume.summary.volumeAnalytics, "VOLUME_ANALYTICS_UNAVAILABLE");
    const volumeResult = evaluateOptionsOpportunity(snapshot(missingVolume.rows, missingVolume.summary), "NIFTY", NOW);
    assert.notEqual(volumeResult.pcrOi, null);
    assert.equal(volumeResult.pcrVolume, null);
  });

  it("rejects an invalid bid/ask candidate while analytics remain independent", async () => {
    const verified = await verifyEvaluationOptionPrices(rows(), 24000, "nifty", NOW, async () => ({
      call: { ...v3Quote("NSE_FO|CALL", 180, 1500, 1300, 500), depth: { buy: [{ price: 182 }], sell: [{ price: 178 }] } },
      put: v3Quote("NSE_FO|PUT", 175, 1600, 1700, 600),
    }), 7, EXPIRY);
    const result = evaluateOptionsOpportunity(snapshot(verified.rows, verified.summary), "NIFTY", NOW);
    assert.equal(result.chainAnalyticsQuality, "CHAIN_ANALYTICS_VERIFIED_BOUNDED");
    assert.ok(result.rejectedContracts.some((item) => item.reason === "Invalid or missing bid/ask spread"));
  });

  it("does not verify analytics when any mandatory V3 field or contract is missing", async () => {
    const result = await verifyEvaluationOptionPrices(rows(), 24000, "nifty", NOW, async () => ({
      call: v3Quote("NSE_FO|CALL", 180, 1500, 1300, 500),
      put: {
        ...v3Quote("NSE_FO|PUT", 175, 1600, 1700, 600),
        previous_oi: undefined,
      },
    }), 7, EXPIRY);
    assert.equal(result.summary.chainAnalytics, "CHAIN_ANALYTICS_UNVERIFIED");
    assert.equal(result.rows[0].put.analyticsProvenance, "UNAVAILABLE");
  });

  it("rejects canonical identity mismatches and duplicates", () => {
    const contracts: CanonicalOptionContract[] = [
      { instrumentKey: "NSE_FO|CALL", underlyingKey: "NSE_INDEX|Nifty 50", expiry: EXPIRY, strike: 24000, type: "CE", lotSize: 75 },
      { instrumentKey: "NSE_FO|PUT", underlyingKey: "NSE_INDEX|Nifty 50", expiry: EXPIRY, strike: 24000, type: "PE", lotSize: 75 },
    ];
    assert.doesNotThrow(() => validateCanonicalOptionRows(rows(), contracts, "NSE_INDEX|Nifty 50", EXPIRY));
    assert.throws(() => validateCanonicalOptionRows(rows(), contracts.map((c) => c.type === "CE" ? { ...c, strike: 24100 } : c), "NSE_INDEX|Nifty 50", EXPIRY), /canonical contract mismatch/);
    const duplicate = rows();
    duplicate[0].put.instrumentKey = duplicate[0].call.instrumentKey;
    assert.throws(() => validateCanonicalOptionRows(duplicate, contracts, "NSE_INDEX|Nifty 50", EXPIRY), /duplicate canonical key/);
    assert.throws(() => validateCanonicalOptionRows(rows(), [...contracts, { ...contracts[0], instrumentKey: "NSE_FO|UNEXPECTED", strike: 24100 }], "NSE_INDEX|Nifty 50", EXPIRY), /incomplete canonical contract coverage/);
  });

  it("returns NO_TRADE when every displayed contract is rejected", () => {
    const base = rows();
    const result = evaluateOptionsOpportunity(snapshot(base), "NIFTY", NOW);
    assert.equal(result.recommendedStrategy, "NO_TRADE");
    assert.ok(result.topOpportunities.every((contract) => contract.grade === "REJECT"));
  });

  it("renders separate analytics, contract-price, candidate and provenance statuses", () => {
    const page = readFileSync(new URL("../../app/(dashboard)/opportunities/page.tsx", import.meta.url), "utf8");
    for (const label of ["Full-chain analytics", "Individual contract prices", "Candidate eligibility", "IV ", "Greeks provenance", "candidate-rejection-reasons"]) {
      assert.ok(page.includes(label), `missing dashboard separation label: ${label}`);
    }
  });
});
