import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

let testDir: string;
let sessionEvidenceDir: string;
let collectionLogDir: string;
let monitorLogDir: string;

before(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "p2315-opp-"));
  sessionEvidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), "p2315-sess-"));
  collectionLogDir = fs.mkdtempSync(path.join(os.tmpdir(), "p2315-coll-"));
  monitorLogDir = fs.mkdtempSync(path.join(os.tmpdir(), "p2315-mon-"));
  process.env.PAPER_OPPORTUNITY_DIR = testDir;
  process.env.SESSION_EVIDENCE_DIR = sessionEvidenceDir;
  process.env.COLLECTION_LOG_DIR = collectionLogDir;
  process.env.MONITOR_LOG_DIR = monitorLogDir;
});

after(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
  fs.rmSync(sessionEvidenceDir, { recursive: true, force: true });
  fs.rmSync(collectionLogDir, { recursive: true, force: true });
  fs.rmSync(monitorLogDir, { recursive: true, force: true });
  delete process.env.PAPER_OPPORTUNITY_DIR;
  delete process.env.SESSION_EVIDENCE_DIR;
  delete process.env.COLLECTION_LOG_DIR;
  delete process.env.MONITOR_LOG_DIR;
});

import { normalizeChain } from "./upstoxMarket.ts";
import {
  isOptionQuoteLttEnabled,
  isOptionQuoteCanaryEnabled,
  OPTION_QUOTE_LTT_ENABLED,
  BATCH_SIZE,
  MIN_REQUEST_SPACING_MS,
} from "./optionContractLTT.ts";
import {
  runPassiveCanarySample,
  type CanaryRunResult,
} from "./optionQuoteCanary.ts";
import { evaluateOptionsOpportunity } from "../engine/opportunityEngine.ts";
import { runLiveOpportunityCollection } from "./liveOpportunityCollector.ts";
import { tradeFreshnessOf, MIN_LTT_EPOCH_MS, FUTURE_TIMESTAMP_TOLERANCE_MS } from "../time.ts";
import { sourceMeta } from "./market.ts";
import { shouldHaltForAuth, isSupervisorReady } from "../../../scripts/runner-lib.mjs";
import type { OptionRow, Snapshot, SourceInfo, Quote } from "../types.ts";

const NOW = new Date("2026-10-06T05:00:00.000Z"); // Tuesday 10:30 IST (market OPEN)

function makeQuote(opts: Partial<Quote> = {}): Quote {
  return {
    ltp: 100,
    bid: 99.5,
    ask: 100.5,
    oi: 25000,
    chgOi: 1500,
    volume: 5000,
    iv: 15.0,
    delta: 0.45,
    gamma: 0.002,
    theta: -1.2,
    vega: 5.5,
    instrumentKey: "NSE_FO|TEST_KEY",
    lastTradeTime: null,
    ...opts,
  };
}

function makeRow(strike: number, callOpts: Partial<Quote> = {}, putOpts: Partial<Quote> = {}): OptionRow {
  return {
    strike,
    call: makeQuote({ delta: 0.45, instrumentKey: `NSE_FO|NIFTY_${strike}_CE`, ...callOpts }),
    put: makeQuote({ delta: -0.45, instrumentKey: `NSE_FO|NIFTY_${strike}_PE`, ...putOpts }),
  };
}

function makeSnapshot(
  rows: OptionRow[],
  chainSource: "LIVE" | "STALE" = "LIVE",
  isBearish = false,
  expiry = "2026-10-13",
): Snapshot {
  const spot = 22050;
  const si = (src: "LIVE" | "STALE") => ({
    source: src,
    provider: "UPSTOX" as const,
    fetchedAt: NOW.toISOString(),
    lastTradeTime: NOW.toISOString(),
  });

  const fullChain = [...rows];
  if (!fullChain.some((r) => r.strike === 22500)) {
    fullChain.push(makeRow(22500, { ltp: 18, oi: 120_000, volume: 100 }));
  }
  if (!fullChain.some((r) => r.strike === 21500)) {
    fullChain.push(makeRow(21500, { ltp: 35, oi: 15_000, volume: 100 }, { ltp: 40, oi: 120_000, volume: 100 }));
  }
  fullChain.sort((a, b) => a.strike - b.strike);

  const indicators = isBearish
    ? {
        ema9: 22200, ema21: 22400, ema50: 22600, ema200: 22800,
        vwap: 22250, rsi: 35, macdHist: -4.5, atr: 150, pdh: 22300, pdl: 21700,
        orHigh: 22200, orLow: 22100, futuresVwap: null,
      }
    : {
        ema9: 21800, ema21: 21600, ema50: 21300, ema200: 20500,
        vwap: 21900, rsi: 62, macdHist: 4.5, atr: 150, pdh: 22300, pdl: 21700,
        orHigh: 21950, orLow: 21850, futuresVwap: null,
      };

  const breadth = isBearish
    ? {
        index: "nifty" as const, status: "LIVE" as const, advances: 10, declines: 40,
        unchanged: 0, total: 50, expected: 50, coverage: 100, advanceDeclineRatio: 0.25,
        advancePercent: 20, declinePercent: 80, breadthPercent: -60, signal: -0.8,
        classification: "STRONGLY BEARISH" as const, priceBreadthState: "BEARISH_CONFIRMATION" as const,
        fetchedAt: NOW.toISOString(),
      }
    : {
        index: "nifty" as const, status: "LIVE" as const, advances: 40, declines: 10,
        unchanged: 0, total: 50, expected: 50, coverage: 100, advanceDeclineRatio: 4.0,
        advancePercent: 80, declinePercent: 20, breadthPercent: 60, signal: 0.8,
        classification: "STRONGLY BULLISH" as const, priceBreadthState: "BULLISH_CONFIRMATION" as const,
        fetchedAt: NOW.toISOString(),
      };

  return {
    index: "nifty" as const,
    name: "NIFTY 50",
    spot,
    prevClose: 21970,
    expiry,
    strikeStep: 100,
    lotSize: 75,
    fallbackReason: null,
    chain: fullChain,
    indicators,
    breadth,
    news: { score: isBearish ? -0.5 : 0.5, bullishPct: isBearish ? 10 : 75, neutralPct: 20, bearishPct: isBearish ? 70 : 5, eventRisk: null },
    sources: {
      market: si("LIVE"),
      optionChain: si(chainSource),
      technical: si("LIVE"),
      news: si("LIVE"),
      breadth: si("LIVE"),
    },
    ivPercentile: 35,
    technical: null,
  } as unknown as Snapshot;
}

describe("Phase 2.3.15 — Quote Freshness Integration & Authentication Hardening", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let tempDir: string;

  beforeEach(() => {
    originalEnv = { ...process.env };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase2315-test-"));
    process.env.COLLECTION_LOG_DIR = path.join(tempDir, "collection-logs");
    process.env.CANARY_LOG_DIR = path.join(tempDir, "canary-logs");
    process.env.PAPER_OPPORTUNITY_DIR = path.join(tempDir, "paper-opps");
    process.env.SESSION_EVIDENCE_DIR = path.join(tempDir, "session-evidence");
    process.env.MONITOR_LOG_DIR = path.join(tempDir, "monitor-logs");
    delete process.env.OPTION_QUOTE_LTT_ENABLED;
    delete process.env.OPTION_QUOTE_CANARY_ENABLED;
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ── 1. Contract-level timestamp isolation ──────────────────────────────────
  it("1. A fresh ATM contract does not make a missing-LTT strike live", () => {
    const freshLtt = new Date(NOW.getTime() - 4_000).toISOString(); // 4s old -> LIVE
    const rows: OptionRow[] = [
      makeRow(22000, { lastTradeTime: freshLtt }), // ATM CE has valid fresh LTT
      makeRow(22100, { lastTradeTime: null }),     // OTM CE has null LTT
    ];

    const snap = makeSnapshot(rows, "LIVE");
    const res = evaluateOptionsOpportunity(snap, "NIFTY", NOW);

    const atmOpp = res.topOpportunities.find((o) => o.strike === 22000 && o.optionType === "CE");
    const strike2100 = res.topOpportunities.find((o) => o.strike === 22100);

    assert.ok(atmOpp, "ATM strike should be evaluated");
    assert.notEqual(atmOpp?.grade, "REJECT", "Fresh ATM contract should receive tradable grade");

    assert.ok(strike2100, "Strike 22100 should be evaluated");
    assert.equal(strike2100?.grade, "REJECT", "Missing LTT (null) contract must fail closed");
    assert.ok(strike2100?.gradeReasons?.some((r) => r.includes("Contract quote unverified")));

    // Also test undefined LTT:
    const rowsUndef: OptionRow[] = [
      makeRow(22000, { lastTradeTime: freshLtt }),
      makeRow(22100, { lastTradeTime: undefined }),
    ];
    const snapUndef = makeSnapshot(rowsUndef, "LIVE");
    const resUndef = evaluateOptionsOpportunity(snapUndef, "NIFTY", NOW);
    const strike2100Undef = resUndef.topOpportunities.find((o) => o.strike === 22100);

    assert.ok(strike2100Undef, "Strike 22100 (undefined LTT) should be evaluated");
    assert.equal(strike2100Undef?.grade, "REJECT", "Missing LTT (undefined) must never inherit chain freshness");
    assert.ok(strike2100Undef?.gradeReasons?.some((r) => r.includes("Contract quote unverified")));
  });

  it("2. A fresh call contract does not make its corresponding put contract live", () => {
    const freshLtt = new Date(NOW.getTime() - 5_000).toISOString();
    const staleLtt = new Date(NOW.getTime() - 150_000).toISOString(); // 150s old -> STALE

    const rows: OptionRow[] = [
      makeRow(22000, { lastTradeTime: freshLtt }, { lastTradeTime: staleLtt }),
    ];

    // Bearish setup: evaluates PUT options
    const snap = makeSnapshot(rows, "LIVE", true);

    const res = evaluateOptionsOpportunity(snap, "NIFTY", NOW);
    const putOpp = res.topOpportunities.find((o) => o.strike === 22000 && o.optionType === "PE");

    assert.ok(putOpp, "Put contract should be evaluated in bearish regime");
    assert.equal(putOpp?.grade, "REJECT", "Put contract must not inherit freshness from fresh Call contract");
    assert.ok(putOpp?.gradeReasons?.some((r) => r.includes("Contract quote unverified")));
  });

  it("3. A fresh option contract does not make another expiry live", () => {
    const freshLtt = new Date(NOW.getTime() - 3_000).toISOString();
    const rowsExp1: OptionRow[] = [makeRow(22000, { lastTradeTime: freshLtt })];
    const rowsExp2: OptionRow[] = [makeRow(22000, { lastTradeTime: null })];

    const snapExp1 = makeSnapshot(rowsExp1, "LIVE", false, "2026-10-13");
    const snapExp2 = makeSnapshot(rowsExp2, "LIVE", false, "2026-10-20");

    const resExp1 = evaluateOptionsOpportunity(snapExp1, "NIFTY", NOW);
    const resExp2 = evaluateOptionsOpportunity(snapExp2, "NIFTY", NOW);

    const opp1 = resExp1.topOpportunities.find((o) => o.strike === 22000);
    const opp2 = resExp2.topOpportunities.find((o) => o.strike === 22000);

    assert.notEqual(opp1?.grade, "REJECT", "Expiry 1 fresh contract is eligible");
    assert.equal(opp2?.grade, "REJECT", "Expiry 2 unverified contract is rejected; cannot inherit across expiries");
  });

  it("4. Missing contract LTT fails closed", () => {
    const rowsNull: OptionRow[] = [makeRow(22000, { lastTradeTime: null })];
    const snapNull = makeSnapshot(rowsNull, "LIVE");
    const resNull = evaluateOptionsOpportunity(snapNull, "NIFTY", NOW);
    const oppNull = resNull.topOpportunities.find((o) => o.strike === 22000);
    assert.ok(oppNull);
    assert.equal(oppNull?.grade, "REJECT");

    const rowsUndef: OptionRow[] = [makeRow(22000, { lastTradeTime: undefined })];
    const snapUndef = makeSnapshot(rowsUndef, "LIVE");
    const resUndef = evaluateOptionsOpportunity(snapUndef, "NIFTY", NOW);
    const oppUndef = resUndef.topOpportunities.find((o) => o.strike === 22000);
    assert.ok(oppUndef);
    assert.equal(oppUndef?.grade, "REJECT");
  });

  it("5. Invalid and implausible LTT fails closed", () => {
    // Epoch 0 (1970-01-01)
    const tfEpochZero = tradeFreshnessOf(new Date(0).toISOString(), NOW);
    assert.equal(tfEpochZero.freshness, "STALE");
    assert.equal(tfEpochZero.source, "UNAVAILABLE");

    // Negative timestamp
    const tfNegative = tradeFreshnessOf(new Date(-1000).toISOString(), NOW);
    assert.equal(tfNegative.freshness, "STALE");
    assert.equal(tfNegative.source, "UNAVAILABLE");

    // Before MIN_LTT_EPOCH_MS (before 2020-01-01)
    const tfPre2020 = tradeFreshnessOf(new Date(MIN_LTT_EPOCH_MS - 1000).toISOString(), NOW);
    assert.equal(tfPre2020.freshness, "STALE");
    assert.equal(tfPre2020.source, "UNAVAILABLE");

    // Malformed non-date string
    const tfGarbage = tradeFreshnessOf("invalid-iso-string", NOW);
    assert.equal(tfGarbage.freshness, "STALE");
    assert.equal(tfGarbage.source, "UNAVAILABLE");

    // In opportunity engine:
    const snap = makeSnapshot([makeRow(22000, { lastTradeTime: "invalid-iso-string" })], "LIVE");
    const res = evaluateOptionsOpportunity(snap, "NIFTY", NOW);
    const opp = res.topOpportunities.find((o) => o.strike === 22000);
    assert.ok(opp);
    assert.equal(opp?.grade, "REJECT");
  });

  it("6. Stale contract LTT fails closed", () => {
    const staleLtt = new Date(NOW.getTime() - 150_000).toISOString(); // 2.5 min old
    const tf = tradeFreshnessOf(staleLtt, NOW);
    assert.equal(tf.freshness, "STALE");
    assert.equal(tf.source, "STALE");

    const snap = makeSnapshot([makeRow(22000, { lastTradeTime: staleLtt })], "LIVE");
    const res = evaluateOptionsOpportunity(snap, "NIFTY", NOW);
    const opp = res.topOpportunities.find((o) => o.strike === 22000);
    assert.ok(opp);
    assert.equal(opp?.grade, "REJECT");
  });

  it("7. Future timestamps beyond the allowed tolerance fail closed", () => {
    // Within 5s tolerance (e.g. 3s ahead): allowable clock skew -> LIVE
    const skewLtt = new Date(NOW.getTime() + 3_000).toISOString();
    const tfSkew = tradeFreshnessOf(skewLtt, NOW);
    assert.equal(tfSkew.freshness, "LIVE");

    // Beyond 5s tolerance (e.g. 10s ahead): implausible future timestamp -> fails closed
    const futureLtt = new Date(NOW.getTime() + FUTURE_TIMESTAMP_TOLERANCE_MS + 5_000).toISOString();
    const tfFuture = tradeFreshnessOf(futureLtt, NOW);
    assert.equal(tfFuture.freshness, "STALE");
    assert.equal(tfFuture.source, "UNAVAILABLE");

    const snap = makeSnapshot([makeRow(22000, { lastTradeTime: futureLtt })], "LIVE");
    const res = evaluateOptionsOpportunity(snap, "NIFTY", NOW);
    const opp = res.topOpportunities.find((o) => o.strike === 22000);
    assert.ok(opp);
    assert.equal(opp?.grade, "REJECT");
  });

  it("8. Quote receipt time cannot substitute for exchange trade time", () => {
    // When a quote was fetched 100ms ago (receipt time is immediate), but lastTradeTime is absent
    const info: SourceInfo = {
      source: "STALE",
      provider: "UPSTOX",
      fetchedAt: NOW.toISOString(), // ultra fresh receipt time
      lastTradeTime: null,          // NO exchange trade timestamp
    };
    const meta = sourceMeta(info, NOW);
    assert.equal(meta.source, "STALE");
    assert.equal(meta.freshness, "STALE", "Recent fetch time must never elevate non-LIVE quote to LIVE");
  });

  // ── 2. Provenance & Authentication Hardening ───────────────────────────────
  it("9. Mock fallback cannot be recorded as live", async () => {
    const mockOptionsResult = async () => ({
      spot: 22000,
      topOpportunities: [],
      rejectedContracts: [],
      dataQuality: { market: "MOCK", optionChain: "MOCK" },
    } as any);
    const mockStockResult = async () => ({
      source: "MOCK",
      freshness: "LIVE",
      topOpportunities: [],
    } as any);

    const res = await runLiveOpportunityCollection(mockOptionsResult, mockOptionsResult, mockStockResult, NOW);
    assert.equal(res.created, 0);
    assert.equal(res.source, "MOCK", "Result source must accurately report MOCK provenance, never LIVE");
  });

  it("10. Expired authentication prevents live-data collection", async () => {
    const mockOptionsResult = async () => ({
      spot: 22000,
      topOpportunities: [],
      rejectedContracts: [],
      dataQuality: { market: "AUTH_EXPIRED" },
    } as any);
    const mockStockResult = async () => ({
      source: "UNAVAILABLE",
      freshness: "UNAVAILABLE",
      topOpportunities: [],
    } as any);

    const res = await runLiveOpportunityCollection(mockOptionsResult, mockOptionsResult, mockStockResult, NOW);
    assert.equal(res.created, 0);
    assert.equal(res.source, "AUTH_EXPIRED", "Expired auth must prevent collection and record AUTH_EXPIRED");
  });

  it("11. HTTP 200 with connected: false does not make the supervisor ready", () => {
    // HTTP 200 but disconnected: NOT ready
    assert.equal(
      isSupervisorReady({ httpOk: true, connected: false, tokenStatus: "EXPIRED" }),
      false,
      "HTTP 200 with connected: false must fail closed",
    );

    // HTTP 200 but tokenStatus not VALID: NOT ready
    assert.equal(
      isSupervisorReady({ httpOk: true, connected: true, tokenStatus: "INVALID" }),
      false,
      "HTTP 200 with invalid token must fail closed",
    );

    // HTTP error: NOT ready
    assert.equal(
      isSupervisorReady({ httpOk: false, connected: false, tokenStatus: "UNREACHABLE" }),
      false,
    );

    // Genuinely ready only when httpOk: true, connected: true, tokenStatus: VALID
    assert.equal(
      isSupervisorReady({ httpOk: true, connected: true, tokenStatus: "VERIFIED_CONNECTED" }),
      true,
    );
  });

  it("12. The paper runner stops when authentication expires", () => {
    // Expired auth -> runner must halt
    assert.equal(
      shouldHaltForAuth({ connected: false, tokenStatus: "EXPIRED" }),
      true,
      "Runner must halt when auth is EXPIRED",
    );

    // Missing / disconnected auth -> runner must halt
    assert.equal(
      shouldHaltForAuth({ connected: false, tokenStatus: "MISSING" }),
      true,
      "Runner must halt when auth is MISSING",
    );

    // Malformed auth payload -> runner must halt
    assert.equal(
      shouldHaltForAuth(null),
      true,
      "Runner must halt on null auth response",
    );

    // Valid connected auth -> runner proceeds
    assert.equal(
      shouldHaltForAuth({ connected: true, tokenStatus: "VERIFIED_CONNECTED" }),
      false,
      "Runner proceeds only when auth is VALID and connected",
    );
  });

  // ── 3. Feature Flags & Passive Canary Safeguards ───────────────────────────
  it("13. Runtime feature flags default to disabled", () => {
    delete process.env.OPTION_QUOTE_LTT_ENABLED;
    assert.equal(isOptionQuoteLttEnabled(), false, "Missing env variable defaults to false");

    process.env.OPTION_QUOTE_LTT_ENABLED = "0";
    assert.equal(isOptionQuoteLttEnabled(), false, "'0' defaults to false");

    process.env.OPTION_QUOTE_LTT_ENABLED = "false";
    assert.equal(isOptionQuoteLttEnabled(), false, "'false' defaults to false");

    process.env.OPTION_QUOTE_LTT_ENABLED = "yes";
    assert.equal(isOptionQuoteLttEnabled(), false, "'yes' defaults to false");

    // Only strictly "true" enables it
    process.env.OPTION_QUOTE_LTT_ENABLED = "true";
    assert.equal(isOptionQuoteLttEnabled(), true, "Strict 'true' enables runtime flag without rebuild");

    // Static constant fallback is false
    assert.equal(OPTION_QUOTE_LTT_ENABLED, false);
  });

  it("14. Canary execution remains disabled by default", async () => {
    delete process.env.OPTION_QUOTE_CANARY_ENABLED;
    assert.equal(isOptionQuoteCanaryEnabled(), false, "Canary flag defaults to false");

    const rows: OptionRow[] = [makeRow(22000)];
    const result = await runPassiveCanarySample(rows, 22000, "nifty", "fake-token", NOW);

    assert.equal(result.status, "DISABLED");
    assert.ok(result.reason.includes("disabled by default"));
    assert.equal(result.audit, null);
  });

  it("15. Canary diagnostic code cannot write to paper or settlement storage", async () => {
    process.env.OPTION_QUOTE_CANARY_ENABLED = "true";
    assert.equal(isOptionQuoteCanaryEnabled(), true);

    const paperDir = path.join(process.cwd(), ".data", "paper-trades");
    const settlementDir = path.join(process.cwd(), ".data", "settlement");
    const paperOppDir = path.join(process.cwd(), ".data", "paper-opportunities");

    const getMtime = (dir: string) => {
      try { return fs.statSync(dir).mtimeMs; } catch { return 0; }
    };
    const paperMtimeBefore = getMtime(paperDir);
    const settlementMtimeBefore = getMtime(settlementDir);
    const paperOppMtimeBefore = getMtime(paperOppDir);

    const loggedRecords: CanaryRunResult[] = [];
    const rows: OptionRow[] = [makeRow(22000)];

    const canaryResult = await runPassiveCanarySample(
      rows,
      22000,
      "nifty",
      "fake-token",
      NOW,
      {
        checkAuth: async () => ({ status: "VERIFIED_CONNECTED" }),
        checkMarket: () => "OPEN",
        logWriter: (rec) => loggedRecords.push(rec),
        fetchAudit: async () => ({
          enabled: true,
          requestedKeys: 2,
          coveredKeys: 2,
          missingKeys: [],
          liveCount: 2,
          agingCount: 0,
          staleCount: 0,
          eligibleCount: 2,
          contracts: [],
          error: null,
        }),
      },
    );

    // Verify diagnostic output was recorded
    assert.ok(loggedRecords.length >= 1, "Diagnostic logger should be invoked");
    assert.equal(canaryResult.status, "EXECUTED");

    // Verify storage boundaries: no writes to paper or settlement storage
    assert.equal(getMtime(paperDir), paperMtimeBefore, "Canary must never touch paper-trades directory");
    assert.equal(getMtime(settlementDir), settlementMtimeBefore, "Canary must never touch settlement directory");
    assert.equal(getMtime(paperOppDir), paperOppMtimeBefore, "Canary must never touch paper-opportunities directory");

    // Verify key capping & defensive limits
    assert.ok(canaryResult.keysRequested <= BATCH_SIZE, `Keys requested must not exceed BATCH_SIZE (${BATCH_SIZE})`);
    assert.equal(MIN_REQUEST_SPACING_MS, 131, "Minimum spacing must be >= 131 ms");
  });

  // ── 4. End-to-End Production Path Integration Test ─────────────────────────
  it("16. Complete production path: normalization -> snapshot -> opportunity evaluation enforces timestamp isolation", () => {
    const freshLttMs = NOW.getTime() - 6_000; // 6s ago -> LIVE
    const staleLttMs = NOW.getTime() - 180_000; // 3 min ago -> STALE

    // Raw Upstox API payload with 3 strikes + S/R strikes
    const rawApiData = [
      {
        strike_price: 21500,
        underlying_spot_price: 22050,
        call_options: {
          instrument_key: "NSE_FO|NIFTY_21500_CE",
          market_data: { ltp: 550, bid_price: 549, ask_price: 551, oi: 15_000, volume: 500, last_trade_time: freshLttMs },
          option_greeks: { iv: 18.0, delta: 0.90 },
        },
        put_options: {
          instrument_key: "NSE_FO|NIFTY_21500_PE",
          market_data: { ltp: 15, bid_price: 14.5, ask_price: 15.5, oi: 120_000, volume: 5_000, last_trade_time: freshLttMs },
          option_greeks: { iv: 18.0, delta: -0.10 },
        },
      },
      {
        strike_price: 22000,
        underlying_spot_price: 22050,
        call_options: {
          instrument_key: "NSE_FO|NIFTY_22000_CE",
          market_data: { ltp: 110, bid_price: 109.5, ask_price: 110.5, oi: 80_000, volume: 20_000, last_trade_time: freshLttMs },
          option_greeks: { iv: 16.5, delta: 0.52 },
        },
        put_options: {
          instrument_key: "NSE_FO|NIFTY_22000_PE",
          market_data: { ltp: 95, bid_price: 94.5, ask_price: 95.5, oi: 70_000, volume: 15_000, last_trade_time: staleLttMs },
          option_greeks: { iv: 17.0, delta: -0.48 },
        },
      },
      {
        strike_price: 22100,
        underlying_spot_price: 22050,
        call_options: {
          instrument_key: "NSE_FO|NIFTY_22100_CE",
          market_data: { ltp: 55, bid_price: 54.5, ask_price: 55.5, oi: 90_000, volume: 25_000, last_trade_time: null /* MISSING LTT */ },
          option_greeks: { iv: 15.5, delta: 0.42 },
        },
        put_options: {
          instrument_key: "NSE_FO|NIFTY_22100_PE",
          market_data: { ltp: 145, bid_price: 144.0, ask_price: 146.0, oi: 60_000, volume: 18_000, last_trade_time: freshLttMs },
          option_greeks: { iv: 17.2, delta: -0.58 },
        },
      },
      {
        strike_price: 22500,
        underlying_spot_price: 22050,
        call_options: {
          instrument_key: "NSE_FO|NIFTY_22500_CE",
          market_data: { ltp: 18, bid_price: 17.5, ask_price: 18.5, oi: 120_000, volume: 2_000, last_trade_time: freshLttMs },
          option_greeks: { iv: 15.0, delta: 0.15 },
        },
        put_options: {
          instrument_key: "NSE_FO|NIFTY_22500_PE",
          market_data: { ltp: 450, bid_price: 449, ask_price: 451, oi: 10_000, volume: 500, last_trade_time: freshLttMs },
          option_greeks: { iv: 15.0, delta: -0.85 },
        },
      },
    ];

    // 1. Normalize chain
    const normChain = normalizeChain(rawApiData, "nifty", "2026-10-13");

    // Per-contract timestamp integrity checks on normalized output:
    const row22000 = normChain.rows.find((r) => r.strike === 22000)!;
    const row22100 = normChain.rows.find((r) => r.strike === 22100)!;

    assert.equal(row22000.call.lastTradeTime, new Date(freshLttMs).toISOString());
    assert.equal(row22000.put.lastTradeTime, new Date(staleLttMs).toISOString());
    assert.equal(row22100.call.lastTradeTime, null, "Missing LTT must normalize to null");
    assert.equal(row22100.put.lastTradeTime, new Date(freshLttMs).toISOString());

    // 2. Build snapshot with LIVE sources
    const snap = makeSnapshot(normChain.rows, "LIVE", false, "2026-10-13");

    // 3. Evaluate Bullish setup (evaluates Call contracts)
    const bullRes = evaluateOptionsOpportunity(snap, "NIFTY", NOW);
    const ce22000 = bullRes.topOpportunities.find((o) => o.strike === 22000 && o.optionType === "CE");
    const ce22100 = bullRes.topOpportunities.find((o) => o.strike === 22100 && o.optionType === "CE");

    assert.ok(ce22000, "22000 CE must be evaluated");
    assert.notEqual(ce22000?.grade, "REJECT", "22000 CE (fresh LTT) is tradable");

    assert.ok(ce22100, "22100 CE must be evaluated");
    assert.equal(ce22100?.grade, "REJECT", "22100 CE (missing LTT) is rejected");
    assert.ok(ce22100?.gradeReasons?.some((r) => r.includes("Contract quote unverified")));

    // 4. Evaluate Bearish setup (evaluates Put contracts)
    const bearSnap = makeSnapshot(normChain.rows, "LIVE", true, "2026-10-13");
    const bearRes = evaluateOptionsOpportunity(bearSnap, "NIFTY", NOW);
    const pe22000 = bearRes.topOpportunities.find((o) => o.strike === 22000 && o.optionType === "PE");
    const pe22100 = bearRes.topOpportunities.find((o) => o.strike === 22100 && o.optionType === "PE");

    assert.ok(pe22000, "22000 PE must be evaluated");
    assert.equal(pe22000?.grade, "REJECT", "22000 PE (stale LTT) is rejected despite fresh CE at same strike");

    assert.ok(pe22100, "22100 PE must be evaluated");
    assert.notEqual(pe22100?.grade, "REJECT", "22100 PE (fresh LTT) is tradable despite null CE at same strike");
  });
});
