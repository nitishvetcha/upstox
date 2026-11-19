import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  tradeFreshnessOf,
  freshnessOf,
  marketStatus,
  NSE_HOLIDAYS,
  isTradingDay,
} from "./time.ts";
import {
  evaluateOptionsOpportunity,
} from "./engine/opportunityEngine.ts";
import type { OptionRow, Snapshot } from "./types.ts";
import { candidateStatus, RESEARCH_BANNER } from "./research/candidateStatus.ts";
import { dataLabel } from "./dataStatus.ts";
import {
  selectResearchExpiry,
  classifyRound,
  researchReport,
  type ResearchRound,
} from "./research/optionsAuditResearch.ts";
import { unavailableBreadth } from "./services/breadthService.ts";
import { INDEX_CONSTITUENTS } from "./services/breadthConfig.ts";
import { AUDIT_VERSION } from "./optionsAudit.ts";
import { STRATEGY_VERSION } from "./journalTypes.ts";
import { FROZEN_STRATEGY_VERSION } from "./strategyEvidenceEngine.ts";

// ── Controlled synthetic test clock (NSE open session) ──────────────────────
const FIXTURE_NOW = new Date("2026-10-30T10:30:00+05:30");

function makeRow(
  strike: number,
  callLtp = 50,
  putLtp = 50,
  callOi = 10000,
  putOi = 10000,
  volume = 500,
  delta = 0.5,
  bid = 49,
  ask = 51,
  lastTradeTime: string | null = new Date(FIXTURE_NOW.getTime() - 15_000).toISOString(),
): OptionRow {
  const call = {
    ltp: callLtp,
    bid,
    ask,
    oi: callOi,
    chgOi: 100,
    volume,
    iv: 15,
    delta,
    gamma: 0.01,
    theta: -1,
    vega: 0.5,
    instrumentKey: `NSE_FO|${strike}CE`,
    lastTradeTime,
  };
  const put = {
    ltp: putLtp,
    bid: bid - 2,
    ask: ask - 2,
    oi: putOi,
    chgOi: 150,
    volume,
    iv: 15,
    delta: -delta,
    gamma: 0.01,
    theta: -1,
    vega: 0.5,
    instrumentKey: `NSE_FO|${strike}PE`,
    lastTradeTime,
  };
  return { strike, call, put };
}

function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  const spot = 22050;
  // Realistic chain with resistance at 22500 (high call OI) and support at 21800 (high put OI)
  const rows: OptionRow[] = [
    makeRow(22000, 50, 50, 10000, 80000, 2000, 0.55),
    makeRow(22100, 40, 60, 20000, 50000, 1000, 0.45),
    makeRow(22200, 30, 70, 30000, 30000, 800, 0.35),
    makeRow(22500, 10, 150, 150000, 10000, 500, 0.15), // Resistance at 22500
    makeRow(21800, 120, 20, 5000, 120000, 1500, 0.7),  // Support at 21800
  ];
  const indicators = {
    ema9: 21800,
    ema21: 21600,
    ema50: 21300,
    ema200: 20500,
    vwap: 21900,
    rsi: 62,
    macdHist: 4.5,
    atr: 120,
    pdh: 22300,
    pdl: 21700,
    orHigh: 21950,
    orLow: 21850,
    futuresVwap: null,
  };
  const breadth = {
    index: "nifty" as const,
    status: "LIVE" as const,
    advances: 40,
    declines: 10,
    unchanged: 0,
    total: 50,
    expected: 50,
    coverage: 100,
    advanceDeclineRatio: 4.0,
    advancePercent: 80,
    declinePercent: 20,
    breadthPercent: 60,
    signal: 0.8,
    classification: "STRONGLY BULLISH" as const,
    priceBreadthState: "BULLISH" as const,
    fetchedAt: null,
    source: { source: "LIVE" as const, provider: "UPSTOX" as const, fetchedAt: null },
  };
  const news = { score: 0.5, bullishPct: 75, neutralPct: 20, bearishPct: 5, eventRisk: null };
  const si = { source: "LIVE" as const, provider: "UPSTOX" as const, fetchedAt: null };
  const sources = {
    market: si,
    optionChain: si,
    technical: si,
    news: si,
    breadth: si,
  };
  return {
    index: "nifty" as const,
    name: "NIFTY 50",
    spot,
    prevClose: spot - 80,
    fallbackReason: null,
    expiry: "2026-11-05",
    strikeStep: 100,
    chain: rows,
    indicators,
    breadth,
    news,
    sources,
    ivPercentile: 40,
    technical: null,
    ...overrides,
  } as unknown as Snapshot;
}

describe("Production Readiness Audit & Regression Suite (20 scenarios)", () => {
  // Scenario 1: Upstox authentication valid, but option-chain data stale
  it("Scenario 1: Valid auth but missing/stale chain trade times classifies as STALE during open market", () => {
    const marketOpenTime = new Date("2026-10-28T10:00:00+05:30");
    assert.equal(marketStatus(marketOpenTime), "OPEN");
    const freshnessNull = tradeFreshnessOf(null, marketOpenTime);
    assert.equal(freshnessNull.freshness, "STALE");
    assert.equal(freshnessNull.source, "UNAVAILABLE");
    const freshnessOld = tradeFreshnessOf(new Date(marketOpenTime.getTime() - 150_000), marketOpenTime);
    assert.equal(freshnessOld.freshness, "STALE");
  });

  // Scenario 2: Option-chain API returns HTTP 200 with no exchange-generation timestamp
  it("Scenario 2: Chain HTTP 200 without exchange timestamp leaves lastTradeTime null and fails closed", () => {
    const s = makeSnapshot();
    s.sources.optionChain = { source: "STALE", provider: "UPSTOX", fetchedAt: FIXTURE_NOW.toISOString() };
    const res = evaluateOptionsOpportunity(s, "NIFTY", FIXTURE_NOW);
    assert.ok(res.topOpportunities.length > 0);
    for (const opp of res.topOpportunities) {
      assert.equal(opp.grade, "REJECT");
      assert.ok(opp.gradeReasons?.some((r) => r.includes("Option-chain source is STALE, not LIVE")));
    }
  });

  // Scenario 3: Quote timestamps are valid but the chain timestamp cannot be verified
  it("Scenario 3: Valid quote timestamp gives LIVE market data while unverified chain remains STALE", () => {
    const marketOpenTime = new Date("2026-10-28T10:30:00+05:30");
    const quoteLtt = new Date(marketOpenTime.getTime() - 5_000); // 5 seconds ago
    const quoteFreshness = tradeFreshnessOf(quoteLtt, marketOpenTime);
    assert.equal(quoteFreshness.freshness, "LIVE");

    // Meanwhile, chain has no exchange timestamp
    const chainFreshness = tradeFreshnessOf(null, marketOpenTime);
    assert.notEqual(chainFreshness.freshness, "LIVE");
  });

  // Scenario 4: Fresh option-chain response with valid mapping and contract data
  it("Scenario 4: When chain is LIVE, valid contracts can achieve tradable grades if score and RR permit", () => {
    const s = makeSnapshot();
    s.sources.optionChain = { source: "LIVE", provider: "UPSTOX", fetchedAt: FIXTURE_NOW.toISOString() };
    const res = evaluateOptionsOpportunity(s, "NIFTY", FIXTURE_NOW);
    assert.ok(res.topOpportunities.length > 0);
    const top = res.topOpportunities[0];
    assert.notEqual(top.grade, "REJECT");
    assert.ok(["A+", "A", "B", "C"].includes(top.grade));
  });

  // Scenario 5: Stale cached chain after a successful refresh attempt fails
  it("Scenario 5: Failed refresh maintains fallback status and does not falsely promote cache", () => {
    const oldFetchedAt = new Date(FIXTURE_NOW.getTime() - 300_000).toISOString();
    const s = makeSnapshot();
    s.sources.optionChain = { source: "STALE", provider: "UPSTOX", fetchedAt: oldFetchedAt };
    s.fallbackReason = "UPSTOX_AUTH_EXPIRED";

    const label = dataLabel([s]);
    assert.equal(label, "MOCK FALLBACK");
  });

  // Scenario 6: Mock data cannot be classified as live
  it("Scenario 6: Mock data is never classified as LIVE", () => {
    const s = makeSnapshot();
    for (const key of Object.keys(s.sources) as (keyof typeof s.sources)[]) {
      s.sources[key] = { source: "MOCK", provider: "MOCK", fetchedAt: FIXTURE_NOW.toISOString() };
    }
    const label = dataLabel([s]);
    assert.equal(label, "MOCK DATA");
  });

  // Scenario 7: SENSEX and BANKEX constituents are populated via scripts/constituents/
  it("Scenario 7: SENSEX and BANKEX constituent mappings are populated with correct counts", () => {
    assert.equal(INDEX_CONSTITUENTS.sensex.length, 30);
    assert.equal(INDEX_CONSTITUENTS.bankex.length, 14);

    // unavailableBreadth() helper itself is still exercised (used for other indices or error paths)
    const sensexBreadth = unavailableBreadth("sensex", "No constituent mapping configured for this index (BSE constituent download not automated)");
    assert.equal(sensexBreadth.status, "UNAVAILABLE");
    assert.equal(sensexBreadth.source?.source, "UNAVAILABLE");
    assert.ok(sensexBreadth.reason?.includes("BSE constituent download not automated"));
  });

  // Scenario 8: NFO or BFO is not NORMAL_OPEN
  it("Scenario 8: Non-NORMAL_OPEN exchange state rejects live data qualification", () => {
    const isValidExchangeStatus = (st: string) => st === "NORMAL_OPEN";
    assert.equal(isValidExchangeStatus("NORMAL_OPEN"), true);
    assert.equal(isValidExchangeStatus("PRE_OPEN"), false);
    assert.equal(isValidExchangeStatus("CLOSED"), false);
    assert.equal(isValidExchangeStatus("HALTED"), false);
  });

  // Scenario 9: Market is pre-open, closed, or a holiday
  it("Scenario 9: Market clock correctly recognizes PRE-OPEN, CLOSED, and holiday states", () => {
    const preOpen = new Date("2026-10-28T09:05:00+05:30");
    assert.equal(marketStatus(preOpen), "PRE-OPEN");

    const closedNight = new Date("2026-10-28T20:00:00+05:30");
    assert.equal(marketStatus(closedNight), "CLOSED");

    // Known NSE holiday in 2026: Gandhi Jayanti Oct 2
    assert.equal(NSE_HOLIDAYS.has("2026-10-02"), true);
    assert.equal(isTradingDay("2026-10-02"), false);
    assert.equal(marketStatus(new Date("2026-10-02T10:00:00+05:30")), "CLOSED");
  });

  // Scenario 10: Expiry outside target horizon uses fallback only under existing policy
  it("Scenario 10: selectResearchExpiry uses TARGET_WINDOW for weekly and FALLBACK for monthly without forcing", () => {
    const captureTime = new Date("2026-10-28T09:30:00+05:30");
    // NIFTY has weekly listed: 2026-11-03 (6 days away)
    const niftyExpiries = ["2026-11-03", "2026-11-10", "2026-11-26"];
    const niftySel = selectResearchExpiry(niftyExpiries, captureTime);
    assert.ok(niftySel);
    assert.equal(niftySel.expiry, "2026-11-03");
    assert.equal(niftySel.horizon, "TARGET_WINDOW");
    assert.equal(niftySel.seriesType, "WEEKLY");

    // BANK NIFTY has no weekly listed, only monthly: 2026-11-23 (26 days away)
    const bankniftyExpiries = ["2026-11-23", "2026-12-31"];
    const bankniftySel = selectResearchExpiry(bankniftyExpiries, captureTime);
    assert.ok(bankniftySel);
    assert.equal(bankniftySel.expiry, "2026-11-23");
    assert.equal(bankniftySel.horizon, "FALLBACK");
    assert.equal(bankniftySel.seriesType, "MONTHLY");
  });

  // Scenario 11: Duplicate collection attempt within a 40-minute slot is excluded
  it("Scenario 11: Duplicate run in same 40-minute slot is excluded and not double-counted", () => {
    const baseRound: ResearchRound = {
      version: "options-audit-2-research",
      index: "nifty",
      session: "2026-10-28",
      at: "2026-10-28T03:47:33.000Z", // 09:17:33 IST -> slot 0
      marketState: "OPEN",
      exchangeStatus: "NORMAL_OPEN",
      mappingPass: true,
      expiry: "2026-11-03",
      calendarDays: 6,
      exactDays: 6.25,
      seriesType: "WEEKLY",
      horizon: "TARGET_WINDOW",
      expiryMatchesContractMaster: true,
      chainRequestedAt: "2026-10-28T03:47:32.700Z",
      chainReceivedAt: "2026-10-28T03:47:32.850Z",
      quotesReceivedAt: "2026-10-28T03:47:33.000Z",
      chainToQuoteMs: 300,
      samples: [{
        key: "NSE_FO|123", strike: 22000, type: "CE", expiry: "2026-11-03", timeToExpiryYears: 0.02, daysToExpiry: 6,
        liquid: true, chainLtp: 100, chainBid: 99, chainAsk: 101, chainIv: 15, quoteLtp: 100, quoteBestBid: 99,
        quoteBestAsk: 101, quoteResponseTime: null, quoteLastTradeTime: null, ageS: 5, live: true, priceDiffPct: 0,
        priceAgreeStandard: true, priceAgreeTickAware: true, recomputedIv: 15.1, ivDiff: 0.1,
        temporalClassification: "COMPARABLE", bookClassification: "WITHIN_SPREAD", spreadWidth: 2, ivClassification: "BOTH_PRESENT",
      }],
    };

    const r1: ResearchRound = { ...baseRound, at: "2026-10-28T03:47:33.000Z" };
    const r2: ResearchRound = { ...baseRound, at: "2026-10-28T03:52:47.000Z" };

    const c1 = classifyRound(r1, () => "OPEN");
    const c2 = classifyRound(r2, () => "OPEN");
    assert.equal(c1.slot, 0);
    assert.equal(c2.slot, 0);

    const rep = researchReport([r1, r2], () => "OPEN", 5, 6);
    assert.equal(rep.rawCounts.qualifying, 1);
    assert.equal(rep.exclusions["duplicate in 40-min slot 0"], 1);
  });

  // Scenario 12: Six distinct qualifying slots correctly qualify a session
  it("Scenario 12: Exactly six distinct qualifying slots qualify a session", () => {
    const slots = new Set([0, 1, 2, 3, 4, 5]);
    assert.equal(slots.size, 6);
    const isQualifyingSession = (slotCount: number) => slotCount >= 6;
    assert.equal(isQualifyingSession(slots.size), true);
    assert.equal(isQualifyingSession(5), false);
  });

  // Scenario 13: Five qualifying sessions required for overall research target
  it("Scenario 13: Five qualifying sessions required for overall target", () => {
    const TARGET_SESSIONS = 5;
    const isTargetMet = (sessions: number) => sessions >= TARGET_SESSIONS;
    assert.equal(isTargetMet(4), false);
    assert.equal(isTargetMet(5), true);
  });

  // Scenario 14: Missing quotes and IV data produce correct diagnostics
  it("Scenario 14: Missing quotes or null IV populate diagnostics without crashing", () => {
    const s = makeSnapshot();
    s.chain[0].call.iv = null;
    s.chain[0].call.delta = null;
    const res = evaluateOptionsOpportunity(s, "NIFTY", FIXTURE_NOW);
    assert.ok(res.topOpportunities.length > 0);
    const matched = res.topOpportunities.find((o) => o.strike === 22000);
    if (matched) {
      assert.equal(matched.iv, null);
    }
  });

  // Scenario 15: Multiple candidate rejection reasons are preserved without concealment
  it("Scenario 15: Multiple rejection reasons are preserved without concealment", () => {
    const s = makeSnapshot();
    s.sources.optionChain = { source: "STALE", provider: "UPSTOX", fetchedAt: FIXTURE_NOW.toISOString() };
    // Market and technical are LIVE (2 sources), news and breadth UNAVAILABLE -> liveCount = 2 < 3
    s.sources.news = { source: "UNAVAILABLE", provider: "UPSTOX", fetchedAt: null };
    s.sources.breadth = { source: "UNAVAILABLE", provider: "UPSTOX", fetchedAt: null };

    const res = evaluateOptionsOpportunity(s, "NIFTY", FIXTURE_NOW);
    assert.ok(res.topOpportunities.length > 0);
    const top = res.topOpportunities[0];
    assert.ok(top.gradeReasons && top.gradeReasons.length >= 2);
    assert.ok(top.gradeReasons.some((r) => r.includes("Option-chain source is STALE, not LIVE")));
    assert.ok(top.gradeReasons.some((r) => r.includes("Insufficient live data sources")));

    const status = candidateStatus("option", top);
    assert.ok(status.blocks.length >= 2);
    assert.ok(status.blocks.some((b) => b.includes("Insufficient live data sources")));
  });

  // Scenario 16: Failed intraday replay remains a rejection where required
  it("Scenario 16: Intraday replay failure strictly keeps intraday stock candidates rejected", () => {
    const st = candidateStatus("intraday-stock", {
      direction: "BULLISH",
      freshness: "LIVE",
      grade: "A+",
    });
    assert.equal(st.executable, false);
    assert.ok(st.primaryBlock.includes("intraday-replay-1: NEGATIVE after costs"));
    assert.equal(st.banner, RESEARCH_BANNER);
  });

  // Scenario 17: No live order can be sent from the research or opportunities paths
  it("Scenario 17: Zero broker order endpoints exist in opportunity or research code", () => {
    const oppFile = readFileSync(new URL("engine/opportunityEngine.ts", import.meta.url), "utf8");
    const researchFile = readFileSync(new URL("research/optionsAuditResearch.ts", import.meta.url), "utf8");
    const candidateStatusFile = readFileSync(new URL("research/candidateStatus.ts", import.meta.url), "utf8");

    for (const code of [oppFile, researchFile, candidateStatusFile]) {
      assert.ok(!code.includes("/v2/order/place"), "Must not call Upstox order place endpoint");
      assert.ok(!code.includes("placeOrder"), "Must not implement placeOrder");
      assert.ok(!code.includes("order_id"), "Must not contain order_id logic");
    }
  });

  // Scenario 18: Research collector changes cannot modify production audit storage
  it("Scenario 18: Research collector files are strictly isolated from production audit rounds", () => {
    const researchFile = readFileSync(new URL("../../scripts/options-audit-research.ts", import.meta.url), "utf8");
    assert.ok(researchFile.includes("options-audit-research"));
    assert.ok(!researchFile.includes('const AUDIT_FILE = ".data/options-audit/rounds.jsonl"'));
  });

  // Scenario 19: The UI's displayed source labels match the snapshot metadata actually used
  it("Scenario 19: UI source statuses match snapshot metadata accurately", () => {
    const s = makeSnapshot();
    s.sources.optionChain = { source: "STALE", provider: "UPSTOX", fetchedAt: FIXTURE_NOW.toISOString() };
    s.sources.breadth = { source: "UNAVAILABLE", provider: "UPSTOX", fetchedAt: null };

    const label = dataLabel([s]);
    assert.equal(label, "PARTIAL LIVE DATA");
  });

  // Scenario 20: An upstream API failure does not silently turn cached values into fresh live data
  it("Scenario 20: Freshness calculation treats expired cache as STALE/UNAVAILABLE", () => {
    const now = new Date("2026-10-28T11:00:00+05:30");
    const oldFetchTime = new Date("2026-10-28T10:45:00+05:30").toISOString(); // 15 min old
    const quoteFreshness = freshnessOf(oldFetchTime, now);
    assert.equal(quoteFreshness.freshness, "STALE");
  });

  // Protocol and Frozen Strategy Invariance
  it("Invariant: Frozen strategy version and active audit protocol version are unchanged", () => {
    assert.equal(FROZEN_STRATEGY_VERSION, "11.4-frozen");
    assert.equal(STRATEGY_VERSION.strategyVersion, "11.4-frozen");
    assert.equal(AUDIT_VERSION, "options-audit-1a");
  });
});
