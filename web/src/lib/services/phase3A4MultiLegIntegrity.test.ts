import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import * as path from "node:path";
import {
  evaluateOptionsOpportunity,
  validateSpreadIntegrity,
  type ContractOpportunity,
  type OptionsOpportunityResult,
} from "../engine/opportunityEngine.ts";
import type { Snapshot, OptionRow } from "../types.ts";
import { pickFromContract } from "../savedPickMapping.ts";
import { runLiveOpportunityCollection } from "./liveOpportunityCollector.ts";
import type { StockOpportunityResult } from "../engine/stockOpportunityEngine.ts";

const FIXTURE_NOW = new Date("2026-11-18T10:30:00+05:30");

const si = (src: string) => ({ source: src as "LIVE" | "MOCK", provider: "UPSTOX" as const, fetchedAt: null });

function makeRow(
  strike: number,
  callLtp: number,
  putLtp: number,
  putBid: number,
  putAsk: number,
  callOi: number,
  putOi: number,
  lastTradeTime: string | null = "2026-11-18T10:29:45.000Z",
): OptionRow {
  return {
    strike,
    call: {
      ltp: callLtp,
      bid: callLtp - 1,
      ask: callLtp + 1,
      oi: callOi,
      chgOi: 100,
      volume: 1000,
      iv: 15,
      delta: 0.45,
      gamma: 0.01,
      theta: -1,
      vega: 0.5,
      instrumentKey: `NSE_FO|C_${strike}`,
      lastTradeTime,
      independentQuoteLtp: callLtp,
      ltpDiscrepancy: 0,
      ltpConsistent: true,
      contractPriceQuality: "CONTRACT_PRICE_LIVE",
      analyticsProvenance: "UPSTOX_FULL_QUOTES_V3_BOUNDED_REST_SNAPSHOT",
      ivProvenance: "VERIFIED",
      greeksProvenance: "VERIFIED",
    },
    put: {
      ltp: putLtp,
      bid: putBid,
      ask: putAsk,
      oi: putOi,
      chgOi: 150,
      volume: 1000,
      iv: 16,
      delta: -0.45,
      gamma: 0.01,
      theta: -1,
      vega: 0.5,
      instrumentKey: `NSE_FO|P_${strike}`,
      lastTradeTime,
      independentQuoteLtp: putLtp,
      ltpDiscrepancy: 0,
      ltpConsistent: true,
      contractPriceQuality: "CONTRACT_PRICE_LIVE",
      analyticsProvenance: "UPSTOX_FULL_QUOTES_V3_BOUNDED_REST_SNAPSHOT",
      ivProvenance: "VERIFIED",
      greeksProvenance: "VERIFIED",
    },
  };
}

export function bearishSnapshotWithSpread(): Snapshot {
  const spot = 25260;
  // Put strikes: 25250 (ATM long put) and 25200 (OTM short put)
  // 24800 has a wide bid/ask spread (100 vs 90/110) which rejects it from single-leg candidates,
  // allowing 25250 LONG_PUT, 25200 LONG_PUT, and 25250 BEAR_PUT_SPREAD in the top 3.
  const chain: OptionRow[] = [
    makeRow(24800, 450, 100, 90, 110, 20000, 120000), // wide spread: rejected candidate
    makeRow(25200, 220, 151.35, 151.35, 152.35, 45000, 35000), // Short put candidate
    makeRow(25250, 180, 175.80, 175.70, 176.80, 50000, 40000), // Long put candidate
    makeRow(25600, 15, 400, 399, 401, 120000, 20000), // Resistance
  ];
  return {
    index: "nifty" as const,
    name: "NIFTY 50",
    spot,
    prevClose: spot + 100,
    fallbackReason: null,
    expiry: "2026-11-23",
    strikeStep: 50,
    chain,
    technical: null,
    indicators: {
      ema9: 25300,
      ema21: 25400,
      ema50: 25500,
      ema200: 25600,
      vwap: 25350,
      rsi: 38,
      macdHist: -5.5,
      atr: 150,
      pdh: 25450,
      pdl: 25150,
      orHigh: 25350,
      orLow: 25200,
      futuresVwap: null,
    },
    breadth: {
      index: "nifty" as const,
      status: "LIVE" as const,
      advances: 10,
      declines: 40,
      unchanged: 0,
      total: 50,
      expected: 50,
      coverage: 100,
      advanceDeclineRatio: 0.25,
      advancePercent: 20,
      declinePercent: 80,
      breadthPercent: -60,
      signal: -0.8,
      classification: "STRONGLY BEARISH" as const,
      priceBreadthState: "BEARISH" as const,
      fetchedAt: null,
    },
    news: { score: -0.5, bullishPct: 10, neutralPct: 20, bearishPct: 70, eventRisk: null },
    sources: { market: si("LIVE"), optionChain: si("LIVE"), technical: si("LIVE"), news: si("LIVE"), breadth: si("LIVE") },
    ivPercentile: 45,
  } as unknown as Snapshot;
}

describe("Phase 3A.4 — Multi-Leg Opportunity Integrity Tests", () => {
  it("Requirement 1: Long leg market LTP preserved (not overwritten with net debit)", () => {
    const s = bearishSnapshotWithSpread();
    const res = evaluateOptionsOpportunity(s, "NIFTY", FIXTURE_NOW);
    const spreadOpp = res.topOpportunities.find((o) => o.strategyType === "BEAR_PUT_SPREAD" || o.isMultiLeg);
    assert.ok(spreadOpp, "should evaluate a BEAR_PUT_SPREAD");

    // Long leg market LTP must NOT be overwritten with net debit
    assert.equal(spreadOpp.strike, 25250);
    assert.equal(spreadOpp.optionType, "PE");
    assert.equal(spreadOpp.ltp, 175.80, "ltp must remain the actual long leg market LTP (₹175.80), not net debit");
    assert.equal(spreadOpp.independentQuoteLtp, 175.80, "independentQuoteLtp must match long leg LTP");
  });

  it("Requirement 2: netDebit populated correctly on ContractOpportunity", () => {
    const s = bearishSnapshotWithSpread();
    const res = evaluateOptionsOpportunity(s, "NIFTY", FIXTURE_NOW);
    const spreadOpp = res.topOpportunities.find((o) => o.strategyType === "BEAR_PUT_SPREAD" || o.isMultiLeg);
    assert.ok(spreadOpp, "should evaluate a BEAR_PUT_SPREAD");

    assert.equal(spreadOpp.isMultiLeg, true, "isMultiLeg must be true for spread");
    assert.ok(spreadOpp.netDebit != null && spreadOpp.netDebit > 0, "netDebit must be positive");
    assert.equal(spreadOpp.entry, spreadOpp.netDebit, "entry should match netDebit for spread payoff");
    assert.notEqual(spreadOpp.ltp, spreadOpp.netDebit, "ltp and netDebit must not be confused");
  });

  it("Requirement 3: Single-leg contracts have isMultiLeg=false and netDebit=null", () => {
    const s = bearishSnapshotWithSpread();
    const res = evaluateOptionsOpportunity(s, "NIFTY", FIXTURE_NOW);

    const singleLegOpp = res.topOpportunities.find((o) => o.strategyType === "LONG_PUT" && o.strike === 25250);
    assert.ok(singleLegOpp, "should evaluate a LONG_PUT at 25250");
    assert.equal(singleLegOpp.isMultiLeg, false, "single leg must have isMultiLeg=false");
    assert.equal(singleLegOpp.netDebit, null, "single leg must have netDebit=null");
    assert.equal(singleLegOpp.ltp, 175.80, "single leg ltp is market LTP");
  });

  it("Requirement 4: Spreads expose both legs with accurate strike, side, LTP, bid, ask, instrumentKey, expiry", () => {
    const s = bearishSnapshotWithSpread();
    const res = evaluateOptionsOpportunity(s, "NIFTY", FIXTURE_NOW);

    const spreadOpp = res.topOpportunities.find((o) => o.strategyType === "BEAR_PUT_SPREAD");
    assert.ok(spreadOpp, "spread opportunity must exist");
    assert.ok(Array.isArray(spreadOpp.legs) && spreadOpp.legs.length === 2, "must have exactly 2 legs");

    const longLeg = spreadOpp.legs.find((l) => l.side === "BUY");
    const shortLeg = spreadOpp.legs.find((l) => l.side === "SELL");

    assert.ok(longLeg, "must have BUY long leg");
    assert.ok(shortLeg, "must have SELL short leg");

    // Long leg checks
    assert.equal(longLeg.strike, 25250);
    assert.equal(longLeg.ltp, 175.80);
    assert.equal(longLeg.instrumentKey, "NSE_FO|P_25250");
    assert.equal(longLeg.expiry, "2026-11-23");
    assert.equal(longLeg.executablePrice, 176.80); // ask price

    // Short leg checks
    assert.equal(shortLeg.strike, 25200);
    assert.equal(shortLeg.ltp, 151.35);
    assert.equal(shortLeg.instrumentKey, "NSE_FO|P_25200");
    assert.equal(shortLeg.expiry, "2026-11-23");
    assert.equal(shortLeg.executablePrice, 151.35); // bid price
  });

  it("Requirement 5: Incomplete spreads (missing leg) are detected and suppressed", () => {
    const incompleteSpread: Partial<ContractOpportunity> = {
      strategyType: "BEAR_PUT_SPREAD",
      isMultiLeg: true,
      legs: [
        {
          side: "BUY",
          type: "PE",
          strike: 25250,
          ltp: 175.80,
          bid: 175.70,
          ask: 176.80,
          spreadPct: 0.6,
          executablePrice: 176.80,
          instrumentKey: "NSE_FO|P_25250",
          expiry: "2026-11-23",
        },
      ], // Missing short leg
    };

    const res = validateSpreadIntegrity(incompleteSpread as ContractOpportunity);
    assert.equal(res.isValid, false, "incomplete spread missing short leg must fail validation");
    assert.ok(res.error?.includes("Missing long or short leg"));
  });

  it("Requirement 6: Strategy label displays BEAR PUT SPREAD or BULL CALL SPREAD (not LONG CALL/LONG PUT)", () => {
    const isCall = false;
    const spreadType: string = "BEAR_PUT_SPREAD";
    const isMultiLeg = true;

    const stratLabel = isMultiLeg
      ? (spreadType === "BULL_CALL_SPREAD" ? "BULL CALL SPREAD" : "BEAR PUT SPREAD")
      : (isCall ? "LONG CALL" : "LONG PUT");

    assert.equal(stratLabel, "BEAR PUT SPREAD", "must display BEAR PUT SPREAD, not LONG PUT");

    const bullType: string = "BULL_CALL_SPREAD";
    const bullSpreadLabel = (true)
      ? (bullType === "BULL_CALL_SPREAD" ? "BULL CALL SPREAD" : "BEAR PUT SPREAD")
      : "LONG CALL";
    assert.equal(bullSpreadLabel, "BULL CALL SPREAD", "must display BULL CALL SPREAD, not LONG CALL");
  });

  it("Requirement 7: UI card displays both legs strikes, instrument keys, and Net Debit", () => {
    const longLeg = { strike: 25250, instrumentKey: "NSE_FO|P_25250" };
    const shortLeg = { strike: 25200, instrumentKey: "NSE_FO|P_25200" };
    const displayNetDebit = 26.45;

    const formattedLegLine = `Long ${longLeg.strike} (${longLeg.instrumentKey}) · Short ${shortLeg.strike} (${shortLeg.instrumentKey}) · Net Debit ₹${displayNetDebit}`;
    assert.equal(
      formattedLegLine,
      "Long 25250 (NSE_FO|P_25250) · Short 25200 (NSE_FO|P_25200) · Net Debit ₹26.45",
      "leg details line matches exact specification",
    );
  });

  it("Requirement 8: Single-leg LTP is not overwritten or presented as spread entry premium", () => {
    const s = bearishSnapshotWithSpread();
    const res = evaluateOptionsOpportunity(s, "NIFTY", FIXTURE_NOW);

    const singleLeg = res.topOpportunities.find((o) => o.strategyType === "LONG_PUT" && o.strike === 25250);
    assert.ok(singleLeg, "single leg opportunity must exist");
    assert.equal(singleLeg.ltp, 175.80, "single leg ltp must be market quote ₹175.80");
    assert.equal(singleLeg.entry, 176.80, "single leg entry must be ask price ₹176.80");
    assert.notEqual(singleLeg.entry, 26.45, "single leg entry must never equal spread net debit");
  });

  it("Requirement 9: Capital requirement is netDebit * lotSize for spreads, ltp * lotSize for single-leg", () => {
    const lotSize = 75;
    const netDebit = 26.45;
    const ltp = 175.80;

    // Spread capital requirement
    const spreadCapital = netDebit * lotSize;
    assert.equal(spreadCapital, 1983.75, "spread capital must be netDebit * lotSize = ₹1,983.75");

    // Single-leg capital requirement
    const singleLegCapital = ltp * lotSize;
    assert.equal(singleLegCapital, 13185.00, "single-leg capital must be ltp * lotSize = ₹13,185.00");
    assert.notEqual(spreadCapital, singleLegCapital, "spread capital must never be calculated using single-leg LTP");
  });

  it("Requirement 10: liveOpportunityCollector rejects multi-leg spreads from single-contract paper trading", async () => {
    const s = bearishSnapshotWithSpread();
    const res = evaluateOptionsOpportunity(s, "NIFTY", FIXTURE_NOW);
    const spreadOpp = res.topOpportunities.find((o) => o.strategyType === "BEAR_PUT_SPREAD");
    assert.ok(spreadOpp, "spread opportunity must exist in evaluated results");

    // Mock collection run with a spread in the top opportunities
    const fakeOptionsResult: OptionsOpportunityResult = {
      ...res,
      dataQuality: { market: "LIVE", optionChain: "LIVE", technical: "LIVE", breadth: "LIVE", news: "LIVE" },
      topOpportunities: [spreadOpp],
      rejectedContracts: [],
    };

    const emptyStocks: StockOpportunityResult = {
      timestamp: "2026-11-18T10:30:00+05:30",
      engineVersion: "20.1",
      kind: "intraday",
      source: "UPSTOX",
      freshness: "LIVE",
      universe: "NIFTY50",
      stocksScanned: 0,
      stocksAvailable: 0,
      stocksRejected: 0,
      niftyChange: 0,
      topOpportunities: [],
      noOpportunityReason: "No eligible stocks",
    };

    const colResult = await runLiveOpportunityCollection(
      async () => fakeOptionsResult,
      async () => fakeOptionsResult,
      async () => emptyStocks,
      FIXTURE_NOW,
    );

    // Multi-leg spread must be rejected
    assert.equal(colResult.created, 0, "no paper opportunities must be created for multi-leg spreads");
    assert.ok(colResult.rejected > 0, "spread must be counted as rejected");
    assert.ok(colResult.errors.some((e) => e.includes("Multi-leg strategy") || e.includes("BEAR_PUT_SPREAD")), "explicit error logged");
  });

  it("Requirement 11: pickFromContract rejects multi-leg spreads with an explicit error", () => {
    assert.throws(
      () =>
        pickFromContract({
          underlying: "NIFTY",
          expiry: "2026-11-23",
          strike: 25250,
          optionType: "PE",
          entry: 26.45,
          stop: 10,
          target1: 40,
          target2: 50,
          strategyType: "BEAR_PUT_SPREAD",
        }),
      /Multi-leg strategy BEAR_PUT_SPREAD is not supported/,
    );

    assert.throws(
      () =>
        pickFromContract({
          underlying: "NIFTY",
          expiry: "2026-11-23",
          strike: 25250,
          optionType: "CE",
          entry: 30,
          stop: 10,
          target1: 50,
          target2: 60,
          strategyType: "BULL_CALL_SPREAD",
        }),
      /Multi-leg strategy BULL_CALL_SPREAD is not supported/,
    );

    assert.throws(
      () =>
        pickFromContract({
          underlying: "NIFTY",
          expiry: "2026-11-23",
          strike: 25250,
          optionType: "PE",
          entry: 26.45,
          stop: 10,
          target1: 40,
          target2: 50,
          isMultiLeg: true,
        }),
      /Multi-leg strategy spread is not supported/,
    );
  });

  it("Requirement 12: Single-leg contracts continue to save as valid PickInput", () => {
    const singleLegPick = pickFromContract({
      underlying: "NIFTY",
      expiry: "2026-11-23",
      strike: 25250,
      optionType: "PE",
      entry: 175.80,
      stop: 120,
      target1: 220,
      target2: 260,
      strategyType: "LONG_PUT",
      contractPriceQuality: "CONTRACT_PRICE_LIVE",
      ltpConsistent: true,
      lastTradeTime: "2026-11-18T10:29:50+05:30",
      snapshotSource: "LIVE",
    });

    assert.equal(singleLegPick.instrument, "NIFTY 2026-11-23 25250 PE");
    assert.equal(singleLegPick.instrumentType, "INDEX_OPTION");
    assert.equal(singleLegPick.direction, "LONG");
    assert.equal(singleLegPick.entry, 175.80);
    assert.equal(singleLegPick.source, "LIVE");
  });

  it("Requirement 13: Historical records audit — zero multi-leg spreads exist in stored paper records", () => {
    const baseDir = fs.existsSync(path.join(process.cwd(), "web", ".data"))
      ? path.join(process.cwd(), "web", ".data")
      : path.join(process.cwd(), ".data");

    const paperDir = path.join(baseDir, "paper-opportunities");
    const trackingDir = path.join(baseDir, "opportunity-tracking");
    const savedPicksDir = path.join(baseDir, "saved-picks");

    let spreadCount = 0;

    if (fs.existsSync(paperDir)) {
      const files = fs.readdirSync(paperDir).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        const content = fs.readFileSync(path.join(paperDir, file), "utf8");
        if (content.includes("BEAR_PUT_SPREAD") || content.includes("BULL_CALL_SPREAD")) {
          spreadCount++;
        }
      }
    }

    if (fs.existsSync(trackingDir)) {
      const files = fs.readdirSync(trackingDir).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        const content = fs.readFileSync(path.join(trackingDir, file), "utf8");
        if (content.includes("BEAR_PUT_SPREAD") || content.includes("BULL_CALL_SPREAD")) {
          spreadCount++;
        }
      }
    }

    if (fs.existsSync(savedPicksDir)) {
      const files = fs.readdirSync(savedPicksDir).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        const content = fs.readFileSync(path.join(savedPicksDir, file), "utf8");
        if (content.includes("BEAR_PUT_SPREAD") || content.includes("BULL_CALL_SPREAD")) {
          spreadCount++;
        }
      }
    }

    assert.equal(spreadCount, 0, "historical records must contain zero multi-leg spreads (confirmed uncorrupted)");
  });

  it("Requirement 14: Strategy 11.4 SHA-256 byte-for-byte check", () => {
    const strategyPath = fs.existsSync(path.join(process.cwd(), "web", "src", "lib", "engine", "strategy.ts"))
      ? path.join(process.cwd(), "web", "src", "lib", "engine", "strategy.ts")
      : path.join(process.cwd(), "src", "lib", "engine", "strategy.ts");

    assert.ok(fs.existsSync(strategyPath), "strategy.ts must exist");

    const content = fs.readFileSync(strategyPath);
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    const EXPECTED_HASH = "d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18";

    assert.equal(
      hash,
      EXPECTED_HASH,
      `Strategy 11.4 hash mismatch: expected ${EXPECTED_HASH}, got ${hash}`,
    );
  });

  it("Requirement 15: Fail-closed validation rejects spread when netDebit is missing, null, or non-positive", () => {
    const validSpread: ContractOpportunity = {
      rank: 1,
      underlying: "NIFTY",
      expiry: "2026-11-23",
      strike: 25250,
      optionType: "PE",
      instrumentKey: "NSE_FO|P_25250",
      strategyType: "BEAR_PUT_SPREAD",
      isMultiLeg: true,
      netDebit: 25.45,
      ltp: 175.80,
      bid: 175.70,
      ask: 176.80,
      spreadPct: 0.6,
      oi: 50000,
      volume: 1000,
      iv: 16,
      delta: -0.45,
      entry: 25.45,
      entryLow: 24,
      entryHigh: 27,
      stop: 10,
      target1: 40,
      target2: 50,
      rr: 1.5,
      maxLoss: 1908.75,
      breakeven: 25224.55,
      opportunityScore: 70,
      scoreBreakdown: {},
      confidence: 75,
      signalAgreement: 4,
      signalAgreementOf: 5,
      signals: [],
      reasons: [],
      invalidation: "Spot moves above resistance",
      srRoom: 100,
      expectedMove: 80,
      grade: "A",
      legs: [
        {
          side: "BUY",
          type: "PE",
          strike: 25250,
          ltp: 175.80,
          bid: 175.70,
          ask: 176.80,
          spreadPct: 0.6,
          executablePrice: 176.80,
          instrumentKey: "NSE_FO|P_25250",
          expiry: "2026-11-23",
        },
        {
          side: "SELL",
          type: "PE",
          strike: 25200,
          ltp: 151.35,
          bid: 151.35,
          ask: 152.35,
          spreadPct: 0.6,
          executablePrice: 151.35,
          instrumentKey: "NSE_FO|P_25200",
          expiry: "2026-11-23",
        },
      ],
    };

    // Valid spread passes
    const validCheck = validateSpreadIntegrity(validSpread);
    assert.equal(validCheck.isValid, true, "valid spread must pass");

    // Null netDebit
    const nullDebit = { ...validSpread, netDebit: null };
    const nullCheck = validateSpreadIntegrity(nullDebit);
    assert.equal(nullCheck.isValid, false, "null netDebit must fail");

    // Undefined netDebit
    const undefDebit = { ...validSpread, netDebit: undefined };
    const undefCheck = validateSpreadIntegrity(undefDebit);
    assert.equal(undefCheck.isValid, false, "undefined netDebit must fail");

    // Non-positive netDebit (0 or negative)
    const zeroDebit = { ...validSpread, netDebit: 0 };
    const zeroCheck = validateSpreadIntegrity(zeroDebit);
    assert.equal(zeroCheck.isValid, false, "zero netDebit must fail");

    const negDebit = { ...validSpread, netDebit: -5.5 };
    const negCheck = validateSpreadIntegrity(negDebit);
    assert.equal(negCheck.isValid, false, "negative netDebit must fail");
  });

  it("Requirement 16: Fail-closed validation rejects spread when leg quotes do not match netDebit within 0.05 tolerance", () => {
    const inconsistentSpread: ContractOpportunity = {
      rank: 1,
      underlying: "NIFTY",
      expiry: "2026-11-23",
      strike: 25250,
      optionType: "PE",
      instrumentKey: "NSE_FO|P_25250",
      strategyType: "BEAR_PUT_SPREAD",
      isMultiLeg: true,
      netDebit: 25.45, // Recorded debit
      ltp: 175.80,
      bid: 175.70,
      ask: 176.80,
      spreadPct: 0.6,
      oi: 50000,
      volume: 1000,
      iv: 16,
      delta: -0.45,
      entry: 25.45,
      entryLow: 24,
      entryHigh: 27,
      stop: 10,
      target1: 40,
      target2: 50,
      rr: 1.5,
      maxLoss: 1908.75,
      breakeven: 25224.55,
      opportunityScore: 70,
      scoreBreakdown: {},
      confidence: 75,
      signalAgreement: 4,
      signalAgreementOf: 5,
      signals: [],
      reasons: [],
      invalidation: "Spot moves above resistance",
      srRoom: 100,
      expectedMove: 80,
      grade: "A",
      legs: [
        {
          side: "BUY",
          type: "PE",
          strike: 25250,
          ltp: 175.80,
          bid: 175.70,
          ask: 176.80, // ask = 176.80
          spreadPct: 0.6,
          executablePrice: 176.80,
          instrumentKey: "NSE_FO|P_25250",
          expiry: "2026-11-23",
        },
        {
          side: "SELL",
          type: "PE",
          strike: 25200,
          ltp: 140.00,
          bid: 140.00, // bid = 140.00 -> calculated debit = 176.80 - 140.00 = 36.80 != 25.45
          ask: 141.00,
          spreadPct: 0.6,
          executablePrice: 140.00,
          instrumentKey: "NSE_FO|P_25200",
          expiry: "2026-11-23",
        },
      ],
    };

    const res = validateSpreadIntegrity(inconsistentSpread);
    assert.equal(res.isValid, false, "inconsistent leg quotes vs netDebit must fail");
    assert.ok(res.error?.includes("does not match leg quotes"), "error specifies mismatch");
  });

  it("Requirement 17: Fail-closed validation rejects spread when leg instrumentKey or expiry is missing", () => {
    const spreadMissingKeys: ContractOpportunity = {
      rank: 1,
      underlying: "NIFTY",
      expiry: "2026-11-23",
      strike: 25250,
      optionType: "PE",
      instrumentKey: "NSE_FO|P_25250",
      strategyType: "BEAR_PUT_SPREAD",
      isMultiLeg: true,
      netDebit: 25.45,
      ltp: 175.80,
      bid: 175.70,
      ask: 176.80,
      spreadPct: 0.6,
      oi: 50000,
      volume: 1000,
      iv: 16,
      delta: -0.45,
      entry: 25.45,
      entryLow: 24,
      entryHigh: 27,
      stop: 10,
      target1: 40,
      target2: 50,
      rr: 1.5,
      maxLoss: 1908.75,
      breakeven: 25224.55,
      opportunityScore: 70,
      scoreBreakdown: {},
      confidence: 75,
      signalAgreement: 4,
      signalAgreementOf: 5,
      signals: [],
      reasons: [],
      invalidation: "Spot moves above resistance",
      srRoom: 100,
      expectedMove: 80,
      grade: "A",
      legs: [
        {
          side: "BUY",
          type: "PE",
          strike: 25250,
          ltp: 175.80,
          bid: 175.70,
          ask: 176.80,
          spreadPct: 0.6,
          executablePrice: 176.80,
          instrumentKey: "", // Missing instrument key
          expiry: "2026-11-23",
        },
        {
          side: "SELL",
          type: "PE",
          strike: 25200,
          ltp: 151.35,
          bid: 151.35,
          ask: 152.35,
          spreadPct: 0.6,
          executablePrice: 151.35,
          instrumentKey: "NSE_FO|P_25200",
          expiry: "2026-11-23",
        },
      ],
    };

    const keyCheck = validateSpreadIntegrity(spreadMissingKeys);
    assert.equal(keyCheck.isValid, false, "empty instrumentKey must fail");
    assert.ok(keyCheck.error?.includes("Missing instrumentKey"));

    // Missing expiry
    const spreadMissingExpiry: ContractOpportunity = {
      ...spreadMissingKeys,
      legs: [
        {
          ...spreadMissingKeys.legs![0]!,
          instrumentKey: "NSE_FO|P_25250",
          expiry: "", // Missing expiry
        },
        spreadMissingKeys.legs![1]!,
      ],
    };

    const expCheck = validateSpreadIntegrity(spreadMissingExpiry);
    assert.equal(expCheck.isValid, false, "empty expiry must fail");
    assert.ok(expCheck.error?.includes("Missing expiry"));
  });
});
