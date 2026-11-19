// Network-gate setup: these tests stub fetch to exercise the live (upstox) code path. Without this the gate refuses.
process.env.MARKET_DATA_PROVIDER = "upstox";
// Phase 11 (2026-10-28): regressions for defects found by inspecting the running app.
// Data-trust labels must follow source metadata, never local receipt time; rejections must name their real cause.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { sourceMeta, marketSummary } from "./services/market.ts";
import { mockSnapshot } from "./services/mock.ts";
import { normalizeChain, upstoxProvider } from "./services/upstoxMarket.ts";
import { evaluateOptionsOpportunity } from "./engine/opportunityEngine.ts";
import { candidateStatus } from "./research/candidateStatus.ts";
import { dataLabel } from "./dataStatus.ts";
import { INDEX_CONSTITUENTS } from "./services/breadthConfig.ts";
import { FROZEN_STRATEGY_VERSION } from "./strategyEvidenceEngine.ts";
import type { Snapshot, SourceInfo } from "./types.ts";

const NOW = new Date("2026-10-28T06:55:00Z"); // 12:25 IST, market open
const si = (source: string, ageS = 1): SourceInfo => ({ source, provider: "UPSTOX", fetchedAt: new Date(NOW.getTime() - ageS * 1000).toISOString() } as SourceInfo);

describe("source freshness never upgrades a non-LIVE source", () => {
  it("chain received 1 s ago but STALE (no exchange timestamp) is not reported as LIVE freshness", () => {
    const m = sourceMeta(si("STALE"), NOW);
    assert.equal(m.source, "STALE");
    assert.equal(m.freshnessSeconds, 1); // fetch age still reported
    assert.equal(m.freshness, "STALE");
  });
  it("MOCK and END_OF_DAY sources are never LIVE/AGING either (F2: END_OF_DAY is shown as END_OF_DAY, not STALE)", () => {
    assert.equal(sourceMeta(si("MOCK"), NOW).freshness, "STALE");
    assert.equal(sourceMeta(si("END_OF_DAY"), NOW).freshness, "END_OF_DAY");
    for (const s of ["MOCK", "END_OF_DAY"]) assert.notEqual(sourceMeta(si(s), NOW).freshness, "LIVE");
    for (const s of ["MOCK", "END_OF_DAY"]) assert.notEqual(sourceMeta(si(s), NOW).freshness, "AGING");
  });
  it("LIVE source keeps the fetch-age bands; UNAVAILABLE without fetchedAt stays null", () => {
    assert.equal(sourceMeta(si("LIVE", 5), NOW).freshness, "LIVE");
    assert.equal(sourceMeta(si("LIVE", 60), NOW).freshness, "AGING");
    assert.equal(sourceMeta({ source: "UNAVAILABLE", provider: null, fetchedAt: null } as SourceInfo, NOW).freshness, null);
  });
  it("snapshot summary: optionChain subsystem label matches the snapshot the engine consumes", () => {
    const s = { ...mockSnapshot("nifty", NOW), sources: { market: si("LIVE"), optionChain: si("STALE"), technical: si("LIVE"), news: si("LIVE"), breadth: si("LIVE") } } as Snapshot;
    const sum = marketSummary(s, NOW);
    assert.equal(sum.subsystems.optionChain.source, s.sources.optionChain.source);
    assert.equal(sum.subsystems.optionChain.freshness, "STALE");
    assert.equal(sum.source, "STALE");
  });
});

describe("Upstox option chain carries no timestamp", () => {
  // Field set observed in a real HTTP 200 /v2/option/chain response on 2026-10-28 (values illustrative).
  const raw = [{
    expiry: "2026-11-03", strike_price: 22650, underlying_key: "NSE_INDEX|Nifty 50", underlying_spot_price: 22653.3,
    call_options: { instrument_key: "NSE_FO|1", market_data: { ltp: 120, volume: 1000, oi: 5000, close_price: 110, bid_price: 119.5, bid_qty: 75, ask_price: 120.5, ask_qty: 75, prev_oi: 4000 }, option_greeks: { vega: 1, theta: -1, gamma: 0.001, delta: 0.5, iv: 15, pop: 50 } },
    put_options: { instrument_key: "NSE_FO|2", market_data: { ltp: 110, volume: 1000, oi: 5000, close_price: 100, bid_price: 109.5, bid_qty: 75, ask_price: 110.5, ask_qty: 75, prev_oi: 4000 }, option_greeks: { vega: 1, theta: -1, gamma: 0.001, delta: -0.5, iv: 15, pop: 50 } },
  }];
  it("normalizeChain yields lastTradeTime null — receipt time is never substituted", () => {
    assert.equal(normalizeChain(raw, "nifty", "2026-11-03").lastTradeTime, null);
  });
});

describe("option candidates on an unverified chain", () => {
  const snap = { ...mockSnapshot("nifty", NOW), sources: { market: si("LIVE"), optionChain: si("STALE"), technical: si("LIVE"), news: si("LIVE"), breadth: si("UNAVAILABLE") } } as Snapshot;
  const r = evaluateOptionsOpportunity(snap, "NIFTY", NOW);

  it("every evaluated contract is REJECT and the first reason names the stale chain, not an audit phase", () => {
    assert.ok(r.topOpportunities.length > 0, "fixture must produce at least one evaluated contract");
    for (const c of r.topOpportunities) {
      assert.equal(c.grade, "REJECT");
      assert.match(c.gradeReasons?.[0] ?? "", /Option-chain source is STALE, not LIVE/);
      assert.ok(!(c.gradeReasons ?? []).some((g) => /options-audit-1a has not trusted/.test(g)));
    }
    assert.ok(r.contractsEvaluated + r.contractsRejected > 0 || r.noOpportunityReason, "engine must explain an empty result");
  });
  it("multiple rejection reasons are preserved through candidateStatus", () => {
    const st = candidateStatus("option", { optionType: "CE", grade: "REJECT", gradeReasons: ["A: chain unverified", "B: R:R 0.8 below 1"] });
    assert.deepEqual(st.blocks.slice(0, 2), ["A: chain unverified", "B: R:R 0.8 below 1"]);
    assert.equal(st.executable, false);
  });
  it("a REJECT without engine reasons still states the provider-limitation cause", () => {
    assert.match(candidateStatus("option", { grade: "REJECT" }).primaryBlock, /provider limitation/);
  });
  it("negative historical replay remains a separate, explicit block for intraday stocks", () => {
    const st = candidateStatus("intraday-stock", { direction: "BULLISH", freshness: "STALE", gradeReasons: ["R:R 0.9 below 1"] });
    assert.match(st.blocks[0], /intraday-replay-1: NEGATIVE/);
    assert.ok(st.blocks.includes("Quote STALE, not live"));
    assert.ok(st.blocks.includes("R:R 0.9 below 1"));
  });
});

describe("BSE breadth with populated constituent mapping", () => {
  it("SENSEX/BANKEX lists are populated and getBreadth attempts network calls (empty-constituent short-circuit no longer fires)", async () => {
    assert.equal(INDEX_CONSTITUENTS.sensex.length, 30);
    assert.equal(INDEX_CONSTITUENTS.bankex.length, 14);
    const real = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => { calls++; throw new Error("no network in test"); }) as typeof fetch;
    try {
      const p = upstoxProvider("test-token", () => NOW);
      for (const idx of ["sensex", "bankex"] as const) {
        const b = await p.getBreadth(idx);
        // With constituents populated, getBreadth attempts fetch → throws → catch returns unavailableBreadth
        assert.equal(b.status, "UNAVAILABLE");
        assert.match(String((b as { reason?: string }).reason ?? JSON.stringify(b)), /no network in test/i);
      }
      assert.ok(calls > 0, "populated constituent lists trigger network calls");
    } finally { globalThis.fetch = real; }
  });
});

describe("global label and safety invariants", () => {
  it("mock fallback is never labelled LIVE", () => {
    const s = { ...mockSnapshot("nifty", NOW), fallbackReason: "UPSTOX_NETWORK" } as Snapshot;
    assert.equal(dataLabel([s]), "MOCK FALLBACK");
  });
  it("frozen strategy unchanged and no broker order endpoint anywhere in src/ or scripts/", () => {
    assert.equal(FROZEN_STRATEGY_VERSION, "11.4-frozen");
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx|mjs|js)$/.test(e.name) && !/\.test\./.test(e.name) && /\/v[23]\/order|placeOrder|place_order/.test(fs.readFileSync(p, "utf8"))) hits.push(p);
      }
    };
    walk(path.join(process.cwd(), "src"));
    walk(path.join(process.cwd(), "scripts"));
    assert.deepEqual(hits, []);
  });
});
