// Network-gate setup: these tests stub fetch to exercise the live (upstox) code path. Without this the gate refuses.
process.env.MARKET_DATA_PROVIDER = "upstox";
// Phase 2.2 — Isolated Contract Freshness Unit Tests
// Strictly synthetic fixtures. No live Upstox requests. No production source changes.
// Validates Phase 2.1.1 contract freshness reconciliation design across all 10 required domains.

import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";

import {
  OPTION_QUOTE_LTT_ENABLED,
  buildChainLTTAudit,
  extractEvaluationKeys,
  parseLTT,
} from "./optionContractLTT.ts";
import {
  tradeFreshnessOf,
  MIN_LTT_EPOCH_MS,
  FUTURE_TIMESTAMP_TOLERANCE_MS,
} from "../time.ts";
import { FILTERS } from "../engine/opportunityEngine.ts";
import { analyze } from "../engine/strategy.ts";
import { PaperTradingEngine } from "../paperEngine.ts";
import { normalizeChain } from "./upstoxMarket.ts";
import type { OptionRow, Snapshot, Indicators, MarketBreadth, News } from "../types.ts";

// ── Shared Constants & Fixtures ───────────────────────────────────────────────

// 10:30 IST = 05:00 UTC (Market OPEN)
const OPEN_NOW = new Date("2026-10-13T05:00:00.000Z");

const SPOT = 22700;
const ATM = 22700;

function makeRow(
  strike: number,
  ceKey: string | null,
  peKey: string | null,
  opts: {
    ltp?: number;
    bid?: number;
    ask?: number;
    iv?: number | null;
    delta?: number | null;
  } = {},
): OptionRow {
  const ltp = opts.ltp ?? 100;
  const bid = opts.bid ?? (ltp - 0.5);
  const ask = opts.ask ?? (ltp + 0.5);
  const iv = opts.iv !== undefined ? opts.iv : 15;
  const delta = opts.delta !== undefined ? opts.delta : 0.5;

  return {
    strike,
    call: {
      ltp,
      bid,
      ask,
      oi: 20000,
      chgOi: 500,
      volume: 5000,
      iv,
      delta,
      gamma: 0.001,
      theta: -5,
      vega: 8,
      instrumentKey: ceKey,
    },
    put: {
      ltp,
      bid,
      ask,
      oi: 22000,
      chgOi: 600,
      volume: 6000,
      iv,
      delta: delta !== null ? -delta : null,
      gamma: 0.001,
      theta: -5,
      vega: 8,
      instrumentKey: peKey,
    },
  };
}

function makeChainRows(count = 7): OptionRow[] {
  const rows: OptionRow[] = [];
  for (let i = -count; i <= count; i++) {
    const strike = ATM + i * 50;
    rows.push(makeRow(strike, `NSE_FO|CE_${strike}`, `NSE_FO|PE_${strike}`));
  }
  return rows;
}

function makeIndicators(): Indicators {
  return {
    ema9: 22720,
    ema21: 22680,
    ema50: 22600,
    ema200: 22400,
    rsi: 58,
    macdHist: 5.5,
    atr: 150,
    orHigh: 22750,
    orLow: 22650,
    vwap: 22690,
    pdh: 22800,
    pdl: 22600,
  };
}

function makeBreadth(): MarketBreadth {
  return {
    index: "nifty",
    advances: 35,
    declines: 15,
    unchanged: 0,
    total: 50,
    expected: 50,
    coverage: 100,
    advanceDeclineRatio: 2.33,
    advancePercent: 70,
    declinePercent: 30,
    breadthPercent: 40,
    signal: 0.4,
    classification: "BULLISH",
    priceBreadthState: "BULLISH_CONFIRMATION",
    status: "LIVE",
    fetchedAt: OPEN_NOW.toISOString(),
    reason: null,
    topAdvancers: [],
    topDecliners: [],
  };
}

function makeNews(): News {
  return {
    score: 0.65,
    bullishPct: 65,
    neutralPct: 20,
    bearishPct: 15,
    eventRisk: null,
    status: "LIVE",
    confidence: 0.8,
  };
}

function makeSnapshot(rows: OptionRow[], chainSource: "LIVE" | "STALE" = "STALE"): Snapshot {
  return {
    index: "nifty",
    name: "NIFTY 50",
    spot: SPOT,
    prevClose: 22600,
    expiry: "2026-10-13",
    strikeStep: 50,
    lotSize: 75,
    indicators: makeIndicators(),
    ivPercentile: 45,
    breadth: makeBreadth(),
    news: makeNews(),
    chain: rows,
    technical: null,
    sources: {
      market: { source: "LIVE", provider: "UPSTOX", fetchedAt: OPEN_NOW.toISOString() },
      optionChain: { source: chainSource, provider: "UPSTOX", fetchedAt: OPEN_NOW.toISOString() },
      technical: { source: "LIVE", provider: "UPSTOX", fetchedAt: OPEN_NOW.toISOString() },
      news: { source: "LIVE", provider: null, fetchedAt: OPEN_NOW.toISOString() },
      breadth: { source: "LIVE", provider: "UPSTOX", fetchedAt: OPEN_NOW.toISOString() },
    },
    fallbackReason: null,
  };
}

// Helper to mock global fetch with Upstox quote envelope
function stubFetch(quoteData: Record<string, Record<string, unknown>>) {
  globalThis.fetch = (async () =>
    Response.json({ status: "success", data: quoteData })
  ) as typeof fetch;
}

const realFetch = globalThis.fetch;
const realWarn = console.warn;
const realInfo = console.info;

beforeEach(() => {
  console.warn = () => {};
  console.info = () => {};
});

afterEach(() => {
  globalThis.fetch = realFetch;
  console.warn = realWarn;
  console.info = realInfo;
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 2.2 — Contract Freshness Reconciliation Unit Tests", () => {
  // ── 1. Chain-level freshness separation ────────────────────────────────────
  describe("1. Chain-level freshness separation", () => {
    it("T01: raw option chain remains STALE when only one candidate contract has a fresh quote", () => {
      // Simulate raw Upstox option-chain response (which omits last_trade_time from all rows)
      const rawApiRows = [
        {
          strike_price: 22700,
          underlying_spot_price: 22700,
          call_options: {
            instrument_key: "NSE_FO|53794",
            market_data: { ltp: 180, bid_price: 179.5, ask_price: 180.5, oi: 10000, volume: 5000 },
          },
          put_options: {
            instrument_key: "NSE_FO|53795",
            market_data: { ltp: 120, bid_price: 119.5, ask_price: 120.5, oi: 12000, volume: 6000 },
          },
        },
        {
          strike_price: 22750,
          underlying_spot_price: 22700,
          call_options: {
            instrument_key: "NSE_FO|53796",
            market_data: { ltp: 150, bid_price: 149.5, ask_price: 150.5, oi: 8000, volume: 4000 },
          },
          put_options: {
            instrument_key: "NSE_FO|53797",
            market_data: { ltp: 140, bid_price: 139.5, ask_price: 140.5, oi: 9000, volume: 4500 },
          },
        },
      ];

      const norm = normalizeChain(rawApiRows, "nifty", "2026-10-13");
      // Raw chain must have null lastTradeTime because no row carries an LTT
      assert.equal(norm.lastTradeTime, null);

      // Now suppose candidate 22700 CE receives an independent verified fresh quote
      const candidateKey = "NSE_FO|53794";
      const candidateLtt = new Date(OPEN_NOW.getTime() - 4_000).toISOString(); // 4s ago -> LIVE

      // Candidate contract gets verified LTT
      norm.rows[0].call.lastTradeTime = candidateLtt;
      // Other strikes remain unverified
      norm.rows[0].put.lastTradeTime = null;
      norm.rows[1].call.lastTradeTime = null;
      norm.rows[1].put.lastTradeTime = null;

      // Rule: Do NOT synthesize chain.lastTradeTime = Math.max(...candidateLtts)
      // The chain itself has no exchange timestamp, so norm.lastTradeTime remains null
      assert.equal(norm.lastTradeTime, null, "Raw chain lastTradeTime must not be synthesized from candidate strike");
      assert.equal(norm.rows[0].call.lastTradeTime, candidateLtt, "Candidate strike carries its own verified LTT");
      assert.equal(norm.rows[1].call.lastTradeTime, null, "Unverified strike remains null LTT");
    });
  });

  // ── 2. Spread threshold reconciliation ─────────────────────────────────────
  describe("2. Spread threshold reconciliation (5% strategy vs 12% discovery)", () => {
    it("T02: a candidate with a 6.2% bid-ask spread passes the 12% discovery filter but is rejected by frozen Strategy 11.4's 5% rule", () => {
      // Strike with LTP=100, bid=96.9, ask=103.1 -> spread = (103.1 - 96.9) / 100 = 6.2%
      const spreadPct = ((103.1 - 96.9) / 100) * 100;
      assert.ok(Math.abs(spreadPct - 6.2) < 0.001);

      // 1. Opportunity Engine filter check: maxSpreadPct is 12%
      assert.equal(FILTERS.maxSpreadPct, 12, "Opportunity engine discovery limit must be 12%");
      assert.ok(spreadPct <= FILTERS.maxSpreadPct, "6.2% spread must pass the 12% discovery filter");

      // 2. Strategy 11.4 execution check: MAX_BID_ASK_PCT is 5%
      const rows = [
        makeRow(22700, "NSE_FO|22700CE", "NSE_FO|22700PE", { ltp: 100, bid: 96.9, ask: 103.1, delta: 0.5 }),
      ];
      const snap = makeSnapshot(rows, "LIVE");
      const analysis = analyze(snap, OPEN_NOW);

      // Strategy 11.4 must reject the plan because 6.2% > 5%
      const plan = analysis.candidates.find((c) => c.legs.some((l) => l.strike === 22700));
      assert.ok(plan, "Plan must be evaluated");
      assert.ok(plan.rejected !== null, "Plan must be rejected by Strategy 11.4");
      assert.match(
        plan.rejected!,
        /Bid-ask spread too wide.*6\.2%/,
        "Must specify bid-ask spread too wide (6.2%)",
      );
      assert.equal(analysis.plan, null, "Strategy 11.4 must refuse recommendation when spread > 5%");
      assert.equal(analysis.status, "NO TRADE", "Status must be NO TRADE when best candidate is rejected");
    });
  });

  // ── 3. Delta requirement preservation in Strategy 11.4 ─────────────────────
  describe("3. Delta requirement preservation in Strategy 11.4", () => {
    it("T03: a contract with a null delta must not bypass Strategy 11.4's existing delta requirement", () => {
      // Create chain where ATM call has delta = null
      const rows = [
        makeRow(22700, "NSE_FO|22700CE", "NSE_FO|22700PE", { ltp: 100, delta: null }),
      ];
      const snap = makeSnapshot(rows, "LIVE");
      const analysis = analyze(snap, OPEN_NOW);

      // Strategy 11.4 longOption requires if (!q.ltp || q.delta === null) return null;
      // It must not fabricate or substitute a fixed 0.35 delta
      const longCallPlan = analysis.candidates.find((c) => c.strategy === "Long Call");
      assert.equal(longCallPlan, undefined, "Long Call must not be constructed when delta is null");
    });
  });

  // ── 4. Exact instrument_token matching ─────────────────────────────────────
  describe("4. Exact instrument_token matching (Upstox schema)", () => {
    it("T04: quote responses must be matched using the exact instrument_token, not response object symbol key", async () => {
      const rows = [makeRow(ATM, "NSE_FO|53794", null)];
      // Upstox response schema: object key uses symbol with colon, internal token uses pipe
      const quoteData: Record<string, Record<string, unknown>> = {
        "NSE_FO:NIFTY26N0322800CE": {
          instrument_token: "NSE_FO|53794", // Exact token
          last_price: 183.75,
          last_trade_time: OPEN_NOW.getTime() - 2_000,
        },
      };
      stubFetch(quoteData);

      const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "token", OPEN_NOW);
      assert.equal(audit.missingKeys.length, 0, "Key must not be marked missing");
      const matched = audit.contracts.find((c) => c.instrumentKey === "NSE_FO|53794");
      assert.ok(matched, "Contract must be matched");
      assert.equal(matched!.quoteLtp, 183.75);
      assert.equal(matched!.tradeFreshness, "LIVE");

      // Verify that wrong token fails match even if symbol matches
      const mismatchData: Record<string, Record<string, unknown>> = {
        "NSE_FO:NIFTY26N0322800CE": {
          instrument_token: "NSE_FO|WRONG_TOKEN",
          last_price: 183.75,
          last_trade_time: OPEN_NOW.getTime() - 2_000,
        },
      };
      stubFetch(mismatchData);
      const auditMismatch = await buildChainLTTAudit(rows, SPOT, "nifty", "token", OPEN_NOW);
      assert.ok(auditMismatch.missingKeys.includes("NSE_FO|53794"), "Mismatched token must be treated as missing");
    });
  });

  // ── 5. LTP consistency tolerance (2% threshold) ────────────────────────────
  describe("5. LTP consistency tolerance (provisional 2% threshold)", () => {
    it("T05: 1.5% discrepancy passes and 2.5% discrepancy fails", async () => {
      const chainLtp = 100;
      const rows = [
        makeRow(ATM, "NSE_FO|PASS_1_5", null, { ltp: chainLtp }),
        makeRow(ATM + 50, "NSE_FO|FAIL_2_5", null, { ltp: chainLtp }),
      ];

      const quoteData: Record<string, Record<string, unknown>> = {
        "SYM:PASS": {
          instrument_token: "NSE_FO|PASS_1_5",
          last_price: 101.5, // 1.5% discrepancy -> PASS
          last_trade_time: OPEN_NOW.getTime() - 3_000,
        },
        "SYM:FAIL": {
          instrument_token: "NSE_FO|FAIL_2_5",
          last_price: 102.5, // 2.5% discrepancy -> FAIL
          last_trade_time: OPEN_NOW.getTime() - 3_000,
        },
      };
      stubFetch(quoteData);

      const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "token", OPEN_NOW);

      const passContract = audit.contracts.find((c) => c.instrumentKey === "NSE_FO|PASS_1_5");
      assert.ok(passContract);
      assert.equal(passContract!.ltpConsistent, true);
      assert.equal(passContract!.eligible, true);

      const failContract = audit.contracts.find((c) => c.instrumentKey === "NSE_FO|FAIL_2_5");
      assert.ok(failContract);
      assert.equal(failContract!.ltpConsistent, false);
      assert.equal(failContract!.eligible, false);
      assert.match(failContract!.ineligibleReason!, /LTP discrepancy 2\.50 \(2\.5%\) exceeds 2 %/);
    });
  });

  // ── 6. Timestamp separation and provenance ─────────────────────────────────
  describe("6. Timestamp separation and provenance", () => {
    it("T06: exchange trade time is separate from receipt time; fails closed on missing/malformed/stale/future; ivFreshnessEvidence is NONE", async () => {
      const rows = [
        makeRow(ATM - 100, "NSE_FO|VALID", null),
        makeRow(ATM - 50, "NSE_FO|MISSING", null),
        makeRow(ATM, "NSE_FO|MALFORMED", null),
        makeRow(ATM + 50, "NSE_FO|STALE", null),
        makeRow(ATM + 100, "NSE_FO|FUTURE", null),
      ];

      const tradeTimeMs = OPEN_NOW.getTime() - 5_000;
      const quoteData: Record<string, Record<string, unknown>> = {
        "SYM:VALID": {
          instrument_token: "NSE_FO|VALID",
          last_price: 100,
          last_trade_time: tradeTimeMs,
        },
        "SYM:MISSING": {
          instrument_token: "NSE_FO|MISSING",
          last_price: 100,
          last_trade_time: null,
        },
        "SYM:MALFORMED": {
          instrument_token: "NSE_FO|MALFORMED",
          last_price: 100,
          last_trade_time: "invalid_epoch",
        },
        "SYM:STALE": {
          instrument_token: "NSE_FO|STALE",
          last_price: 100,
          last_trade_time: OPEN_NOW.getTime() - 150_000, // 150s old -> STALE
        },
        "SYM:FUTURE": {
          instrument_token: "NSE_FO|FUTURE",
          last_price: 100,
          last_trade_time: OPEN_NOW.getTime() + 10_000, // +10s in future -> fails future guard
        },
      };
      stubFetch(quoteData);

      const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "token", OPEN_NOW);

      // 1. Valid contract
      const valid = audit.contracts.find((c) => c.instrumentKey === "NSE_FO|VALID")!;
      assert.equal(valid.tradeFreshness, "LIVE");
      assert.equal(valid.eligible, true);
      assert.equal(valid.ivFreshnessEvidence, "NONE", "IV freshness evidence must be strictly NONE");
      // Distinct timestamps
      assert.notEqual(valid.exchangeTradeTime, valid.quoteResponseTime);
      assert.equal(new Date(valid.exchangeTradeTime!).getTime(), tradeTimeMs);
      assert.equal(new Date(valid.quoteResponseTime).getTime(), OPEN_NOW.getTime());

      // 2. Missing timestamp -> UNAVAILABLE / ineligible
      const missing = audit.contracts.find((c) => c.instrumentKey === "NSE_FO|MISSING")!;
      assert.equal(missing.tradeFreshness, "UNAVAILABLE");
      assert.equal(missing.eligible, false);

      // 3. Malformed timestamp -> UNAVAILABLE / ineligible
      const malformed = audit.contracts.find((c) => c.instrumentKey === "NSE_FO|MALFORMED")!;
      assert.equal(malformed.tradeFreshness, "UNAVAILABLE");
      assert.equal(malformed.eligible, false);

      // 4. Stale timestamp (>120s) -> STALE / ineligible
      const stale = audit.contracts.find((c) => c.instrumentKey === "NSE_FO|STALE")!;
      assert.equal(stale.tradeFreshness, "STALE");
      assert.equal(stale.eligible, false);

      // 5. Future timestamp (>5s) -> UNAVAILABLE / ineligible (fails future tolerance guard)
      const future = audit.contracts.find((c) => c.instrumentKey === "NSE_FO|FUTURE")!;
      assert.equal(future.tradeFreshness, "UNAVAILABLE");
      assert.equal(future.eligible, false);
    });
  });

  // ── 7. Open position fail-closed on stale quote ─────────────────────────────
  describe("7. Open position fail-closed on stale quote", () => {
    it("T07: a position with stale or missing quotes remains open, does not receive a fabricated exit, and emits STALE_QUOTES", () => {
      const initialSnap = makeSnapshot([
        makeRow(22700, "NSE_FO|POS_01", null, {
          ltp: 100,
          bid: 99,
          ask: 101,
        }),
      ], "LIVE");
      initialSnap.chain[0].call.lastTradeTime = new Date(OPEN_NOW.getTime() - 2_000).toISOString();

      const analysis: any = {
        snapshot: initialSnap,
        status: "TRADE",
        factors: [],
        plan: {
          strategy: "Long Call",
          legs: [{ side: "BUY", type: "CE", strike: 22700, ltp: 100 }],
          credit: false,
          entry: 100,
          entryZone: [97, 103],
          stop: 60,
          target1: 170,
          target2: 200,
          rr: 1.75,
          maxLoss: 100,
          maxProfit: null,
          breakevens: [22800],
          score: 80,
          rejected: null,
        },
      };

      const engine = new PaperTradingEngine({ accountCapital: 500_000 });
      const createRes = engine.processRecommendation(analysis, OPEN_NOW);
      assert.equal(createRes.created, true, `Expected trade creation, got: ${createRes.reason}`);
      const openTrade = createRes.trade!;
      assert.equal(openTrade.status, "OPEN");
      const initialPrice = openTrade.currentPrice;

      // Now simulate a snapshot update where the quote turns STALE (150s old)
      // and LTP drops to 50 (which would trigger stop-loss 60 if trusted!)
      const staleTime = new Date(OPEN_NOW.getTime() + 150_000);
      const staleSnapshot = makeSnapshot(
        [
          makeRow(22700, "NSE_FO|POS_01", null, {
            ltp: 50, // would trigger stop loss if trusted!
            bid: 49.5,
            ask: 50.5,
          }),
        ],
        "LIVE",
      );
      // Give the row an expired LTT
      staleSnapshot.chain[0].call.lastTradeTime = new Date(staleTime.getTime() - 150_000).toISOString();

      engine.evaluateOpenTrades(staleSnapshot, staleTime);

      // Trade must NOT be stopped out; must remain OPEN
      assert.equal(openTrade.status, "OPEN", "Position must remain OPEN on stale quote");
      assert.equal(openTrade.currentPrice, initialPrice, "Price must not update from untrusted quote");
      assert.equal(openTrade.monitoring?.status, "STALE_QUOTES");
      assert.equal(openTrade.legs[0].exitPrice, null, "No exit price should be fabricated");

      // Verify that audit event PAPER_QUOTE_UNAVAILABLE was recorded
      const events = engine.getEvents(openTrade.id);
      const quoteEvent = events.find((e) => e.event === "PAPER_QUOTE_UNAVAILABLE");
      assert.ok(quoteEvent, "Must record PAPER_QUOTE_UNAVAILABLE event in audit log");
      assert.equal(quoteEvent!.tradeId, openTrade.id);
    });
  });

  // ── 8. Request deduplication and response filtering ────────────────────────
  describe("8. Request deduplication and response filtering", () => {
    it("T08: duplicate requested keys are deduplicated, unrequested tokens ignored", async () => {
      // Input chain with duplicate keys on different strikes (edge case)
      const rows = [
        makeRow(22700, "NSE_FO|KEY_A", "NSE_FO|KEY_B"),
        makeRow(22750, "NSE_FO|KEY_A", "NSE_FO|KEY_C"), // Duplicate KEY_A
      ];

      const keys = extractEvaluationKeys(rows, SPOT);
      // Verify deduplication in extraction
      assert.equal(keys.filter((k) => k === "NSE_FO|KEY_A").length, 1, "Requested keys must be deduplicated");

      // Response contains requested keys PLUS an unrequested token
      const quoteData: Record<string, Record<string, unknown>> = {
        "SYM:A": { instrument_token: "NSE_FO|KEY_A", last_price: 100, last_trade_time: OPEN_NOW.getTime() - 2_000 },
        "SYM:B": { instrument_token: "NSE_FO|KEY_B", last_price: 100, last_trade_time: OPEN_NOW.getTime() - 2_000 },
        "SYM:C": { instrument_token: "NSE_FO|KEY_C", last_price: 100, last_trade_time: OPEN_NOW.getTime() - 2_000 },
        "SYM:UNREQUESTED": { instrument_token: "NSE_FO|KEY_SPURIOUS", last_price: 999, last_trade_time: OPEN_NOW.getTime() - 2_000 },
      };
      stubFetch(quoteData);

      const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "token", OPEN_NOW);
      assert.equal(audit.requestedKeys, 3);
      assert.equal(audit.coveredKeys, 3);
      // Spurious token must not appear in audit contracts
      const unrequested = audit.contracts.find((c) => c.instrumentKey === "NSE_FO|KEY_SPURIOUS");
      assert.equal(unrequested, undefined, "Unrequested returned tokens must be ignored");
    });
  });

  // ── 9. Batch splitting (>20 keys) ───────────────────────────────────────────
  describe("9. Batch splitting (>20 keys preserved without omission)", () => {
    it("T09: splitting more than 20 requested keys into batches preserves all keys without omission", async () => {
      // 15 strikes × 2 sides = 30 keys (exceeds BATCH_SIZE = 20)
      const rows = makeChainRows(7);
      const keys = extractEvaluationKeys(rows, SPOT);
      assert.equal(keys.length, 30, "Must have exactly 30 candidate keys");

      const capturedBatchUrls: string[] = [];
      globalThis.fetch = (async (url: string | URL) => {
        capturedBatchUrls.push(String(url));
        // Return dummy quotes for the requested keys
        const parsedUrl = new URL(String(url));
        const requestedInBatch = parsedUrl.searchParams.get("instrument_key")?.split(",") ?? [];
        const out: Record<string, Record<string, unknown>> = {};
        for (const k of requestedInBatch) {
          out[`SYM_${k}`] = {
            instrument_token: k,
            last_price: 100,
            last_trade_time: OPEN_NOW.getTime() - 2_000,
          };
        }
        return Response.json({ status: "success", data: out });
      }) as typeof fetch;

      const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "token", OPEN_NOW);

      // Verify splitting into 2 batch requests (20 + 10)
      assert.equal(capturedBatchUrls.length, 2, "Must make exactly 2 batch requests for 30 keys");
      assert.equal(audit.requestedKeys, 30);
      assert.equal(audit.coveredKeys, 30);
      assert.equal(audit.missingKeys.length, 0);
      assert.equal(audit.contracts.length, 30);

      // Verify every single requested key was covered
      for (const k of keys) {
        const found = audit.contracts.find((c) => c.instrumentKey === k);
        assert.ok(found, `Key ${k} must be present in audit contracts`);
      }
    });
  });

  // ── 10. Timestamp boundary verification ─────────────────────────────────────
  describe("10. Timestamp boundary verification (5s future tolerance & age windows)", () => {
    it("T10: preserves exact timestamp boundary behavior without changes", () => {
      const now = OPEN_NOW;
      const nowMs = now.getTime();

      // 1. Exactly 5s in future -> LIVE (tolerance boundary)
      const f5s = tradeFreshnessOf(new Date(nowMs + 5_000), now);
      assert.equal(f5s.freshness, "LIVE");
      assert.equal(f5s.freshnessSeconds, 0);

      // 2. Exactly 4s in future -> LIVE
      const f4s = tradeFreshnessOf(new Date(nowMs + 4_000), now);
      assert.equal(f4s.freshness, "LIVE");
      assert.equal(f4s.freshnessSeconds, 0);

      // 3. Exactly 6s in future -> STALE / UNAVAILABLE (exceeds 5s guard)
      const f6s = tradeFreshnessOf(new Date(nowMs + 6_000), now);
      assert.equal(f6s.freshness, "STALE");
      assert.equal(f6s.source, "UNAVAILABLE");
      assert.equal(f6s.freshnessSeconds, null);

      // 4. Exactly 29s in past -> LIVE (age 29s)
      const p29s = tradeFreshnessOf(new Date(nowMs - 29_000), now);
      assert.equal(p29s.freshness, "LIVE");
      assert.equal(p29s.freshnessSeconds, 29);

      // 5. Exactly 30s in past -> AGING (age 30s boundary)
      const p30s = tradeFreshnessOf(new Date(nowMs - 30_000), now);
      assert.equal(p30s.freshness, "AGING");
      assert.equal(p30s.freshnessSeconds, 30);

      // 6. Exactly 120s in past -> AGING (age 120s boundary)
      const p120s = tradeFreshnessOf(new Date(nowMs - 120_000), now);
      assert.equal(p120s.freshness, "AGING");
      assert.equal(p120s.freshnessSeconds, 120);

      // 7. Exactly 121s in past -> STALE (exceeds 120s)
      const p121s = tradeFreshnessOf(new Date(nowMs - 121_000), now);
      assert.equal(p121s.freshness, "STALE");
      assert.equal(p121s.freshnessSeconds, 121);

      // 8. Constants check
      assert.equal(MIN_LTT_EPOCH_MS, 1_577_836_800_000);
      assert.equal(FUTURE_TIMESTAMP_TOLERANCE_MS, 5_000);
      assert.equal(OPTION_QUOTE_LTT_ENABLED, false);
    });
  });
});
