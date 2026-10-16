// Phase 30.1 — Close the data-freshness gap (missing last_trade_time)
// Deterministic fixtures. Never represents real market data.

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";

import { tradeFreshnessOf, marketStatus } from "./time.ts";
import { normalizeStockQuote } from "./services/stockService.ts";
import { normalizeQuote } from "./services/upstoxMarket.ts";
import { gradeOpportunity } from "./engine/opportunityEngine.ts";
import type { StockInstrument } from "./services/stockService.ts";

// ── Shared fixtures ───────────────────────────────────────────────────────────

// 10:30 IST = 05:00 UTC — regular session OPEN
const OPEN_NOW = new Date("2026-10-13T05:00:00.000Z");
// 18:00 IST = 12:30 UTC — CLOSED
const CLOSED_NOW = new Date("2026-10-13T12:30:00.000Z");

const INST: StockInstrument = { symbol: "RELIANCE", name: "Reliance Industries", exchange: "NSE", instrumentKey: "NSE_EQ|INE002A01018", kind: "EQUITY" };

function makeRaw(ltp: number, ltt: number | null, changePercent = 1.5) {
  const change = ltp * changePercent / 100;
  return {
    "NSE_EQ:RELIANCE": {
      instrument_token: "NSE_EQ|INE002A01018",
      last_price: ltp,
      net_change: change,
      last_trade_time: ltt,
      ohlc: { open: ltp * 0.99, high: ltp * 1.01, low: ltp * 0.98 },
      volume: 1_000_000,
    },
  };
}

// ── MQ30: Missing LTT in stock quotes ────────────────────────────────────────

describe("MQ30 — normalizeStockQuote: missing LTT during OPEN session", () => {
  it("MQ30-01 OPEN + valid recent LTT → LIVE", () => {
    const ltt = OPEN_NOW.getTime() - 5_000; // 5 s old
    const q = normalizeStockQuote(makeRaw(2800, ltt), INST, OPEN_NOW);
    assert.equal(q.freshness, "LIVE");
    assert.equal(q.marketStatus, "OPEN");
  });

  it("MQ30-02 OPEN + missing LTT (null) → STALE (not LIVE)", () => {
    const q = normalizeStockQuote(makeRaw(2800, null), INST, OPEN_NOW);
    assert.equal(q.freshness, "STALE");
    assert.equal(q.marketStatus, "OPEN");
  });

  it("MQ30-03 OPEN + LTT = 0 (invalid) → STALE", () => {
    const q = normalizeStockQuote(makeRaw(2800, 0), INST, OPEN_NOW);
    assert.equal(q.freshness, "STALE");
  });

  it("MQ30-04 OPEN + stale LTT (> 120 s) → STALE", () => {
    const ltt = OPEN_NOW.getTime() - 200_000; // 200 s old
    const q = normalizeStockQuote(makeRaw(2800, ltt), INST, OPEN_NOW);
    assert.equal(q.freshness, "STALE");
  });

  it("MQ30-05 CLOSED + today's LTT → END_OF_DAY", () => {
    const ltt = new Date("2026-10-13T08:30:00.000Z").getTime(); // 14:00 IST
    const q = normalizeStockQuote(makeRaw(2800, ltt), INST, CLOSED_NOW);
    assert.equal(q.freshness, "END_OF_DAY");
  });

  it("MQ30-06 CLOSED + null LTT → END_OF_DAY (market closed regardless)", () => {
    const q = normalizeStockQuote(makeRaw(2800, null), INST, CLOSED_NOW);
    assert.equal(q.freshness, "END_OF_DAY");
  });
});

// ── MQ30B: Missing LTT in index quotes (upstoxMarket normalizeQuote) ─────────

describe("MQ30B — normalizeQuote: LTT presence", () => {
  function makeIndexRaw(ltt: number | null) {
    return {
      "NSE_INDEX:Nifty 50": {
        instrument_token: "NSE_INDEX|13",
        last_price: 24500,
        net_change: 50,
        last_trade_time: ltt,
      },
    };
  }

  it("MQ30B-01 normalizeQuote with valid LTT → lastTradeTime is ISO string", () => {
    const ltt = OPEN_NOW.getTime() - 5_000;
    const q = normalizeQuote(makeIndexRaw(ltt), "nifty");
    assert.ok(q.lastTradeTime !== null, "lastTradeTime must be set");
    assert.ok(typeof q.lastTradeTime === "string");
  });

  it("MQ30B-02 normalizeQuote with null LTT → lastTradeTime is null", () => {
    const q = normalizeQuote(makeIndexRaw(null), "nifty");
    assert.equal(q.lastTradeTime, null);
  });

  it("MQ30B-03 normalizeQuote with LTT=0 → lastTradeTime is null", () => {
    const q = normalizeQuote(makeIndexRaw(0), "nifty");
    assert.equal(q.lastTradeTime, null);
  });
});

// ── LS30: liveQuoteSource fallback (upstoxMarket.ts) ─────────────────────────
// Verified via tradeFreshnessOf which liveQuoteSource delegates to.

describe("LS30 — liveQuoteSource: no-LTT fallback is conservative", () => {
  it("LS30-01 tradeFreshnessOf null LTT → UNAVAILABLE (not LIVE)", () => {
    const r = tradeFreshnessOf(null, OPEN_NOW);
    assert.equal(r.source, "UNAVAILABLE");
    assert.notEqual(r.source, "LIVE");
  });

  it("LS30-02 source code: no-LTT during OPEN → STALE not LIVE", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/services/upstoxMarket.ts"), "utf8");
    // The conservative fallback must not use "LIVE" for the no-LTT/OPEN case
    // Find the liveQuoteSource block and confirm STALE is used
    assert.ok(src.includes('"STALE"') && src.includes('marketStatus(current)'), "upstoxMarket must use STALE fallback when LTT absent");
    // Confirm the old "LIVE" fallback (for no-LTT OPEN case) is gone
    const lqsBlock = src.slice(src.indexOf("liveQuoteSource"), src.indexOf("liveQuoteSource") + 300);
    assert.ok(!lqsBlock.includes(': "LIVE"'), "liveQuoteSource must not fall back to LIVE when LTT absent");
  });

  it("LS30-03 source code: stock normalizer uses STALE for null ageMs during OPEN", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/services/stockService.ts"), "utf8");
    assert.ok(src.includes('ageMs === null ? "STALE"'), "stockService must classify null ageMs as STALE during OPEN");
  });
});

// ── GS30: Grade is REJECT for missing-LTT stocks ─────────────────────────────

describe("GS30 — Stock grade with missing LTT", () => {
  it("GS30-01 OPEN + missing LTT → freshness STALE → grade REJECT (liveSources=0)", () => {
    const q = normalizeStockQuote(makeRaw(2800, null), INST, OPEN_NOW);
    assert.equal(q.freshness, "STALE");
    // stockOpportunityEngine: gradeOpportunity(..., q.freshness === "LIVE" ? 3 : 0) → 0
    assert.equal(gradeOpportunity(80, 2.5, 70, 0), "REJECT");
  });

  it("GS30-02 OPEN + valid LTT → freshness LIVE → grade eligible", () => {
    const ltt = OPEN_NOW.getTime() - 5_000;
    const q = normalizeStockQuote(makeRaw(2800, ltt), INST, OPEN_NOW);
    assert.equal(q.freshness, "LIVE");
    const liveSources = q.freshness === "LIVE" ? 3 : 0;
    assert.equal(gradeOpportunity(80, 2.5, 70, liveSources), "A+");
  });
});

// ── PC30: Paper collector rejects missing-LTT stocks ─────────────────────────

describe("PC30 — Paper collector cannot accept STALE/missing-LTT candidates", () => {
  it("PC30-01 collector per-stock check blocks freshness !== LIVE", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/services/liveOpportunityCollector.ts"), "utf8");
    assert.ok(src.includes('s.freshness !== "LIVE"'), "collector must gate per-stock freshness before paper store write");
  });

  it("PC30-02 collector result-level freshness check blocks STALE result", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/services/liveOpportunityCollector.ts"), "utf8");
    assert.ok(src.includes('stockFreshnessOk'), "collector must check result-level freshness");
  });
});

// ── EP30: Options engine: missing LTT → dataQuality not LIVE → REJECT ────────

describe("EP30 — Options engine: no-LTT source is STALE → REJECT grade", () => {
  it("EP30-01 liveSources=0 when dataQuality has no LIVE → REJECT", () => {
    // When liveQuoteSource returns STALE (no LTT), dataQuality value is "STALE" not "LIVE"
    // → liveCount = 0 → gradeOpportunity(score, rr, conf, 0) = REJECT
    assert.equal(gradeOpportunity(85, 3.0, 80, 0), "REJECT");
  });

  it("EP30-02 liveSources < 3 → REJECT regardless of score", () => {
    for (const n of [0, 1, 2]) {
      assert.equal(gradeOpportunity(90, 5.0, 90, n), "REJECT", `liveSources=${n} must be REJECT`);
    }
  });

  it("EP30-03 liveSources >= 3 → eligible for non-REJECT", () => {
    assert.notEqual(gradeOpportunity(80, 2.5, 70, 3), "REJECT");
  });
});

// ── SV30: Strategy and engine versions unchanged ──────────────────────────────

describe("SV30 — Strategy freeze and engine version integrity", () => {
  it("SV30-01 strategy.ts has no placeOrder", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/engine/strategy.ts"), "utf8");
    assert.ok(!src.includes("placeOrder"), "strategy must be read-only");
  });

  it("SV30-02 STOCK_OPPORTUNITY_VERSION is 20.1", async () => {
    const m = await import("./engine/stockOpportunityEngine.ts");
    assert.equal(m.STOCK_OPPORTUNITY_VERSION, "20.1");
  });

  it("SV30-03 OPPORTUNITY_ENGINE_VERSION is 20.1", async () => {
    const m = await import("./engine/opportunityEngine.ts");
    assert.equal(m.OPPORTUNITY_ENGINE_VERSION, "20.1");
  });
});
