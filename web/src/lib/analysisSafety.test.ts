// R3 regression: the raw analysis result (what /api/analysis/[index] returns) and the dashboard view built from it
// must never present a STALE-market TRADE as executable. Fixtures only. No broker access, no network.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mockSnapshot } from "./services/mock.ts";
import { analyze } from "./engine/strategy.ts";
import { toDashboardView } from "./dashboard.ts";
import { DEFAULT_RISK_CONFIG } from "./services/risk/riskConfig.ts";
import type { Analysis, Snapshot } from "./types.ts";

const NOW = new Date("2026-10-05T07:00:00Z");
const ISO = NOW.toISOString();
const KEYS = ["market", "optionChain", "technical", "news", "breadth"] as const;

function labelled(over: (s: Snapshot) => void = () => {}): Snapshot {
  const s = structuredClone(mockSnapshot("nifty", NOW));
  for (const k of KEYS) s.sources[k] = { ...s.sources[k], source: "LIVE", provider: "UPSTOX", fetchedAt: ISO };
  s.fallbackReason = null;
  s.lotSize = 75;
  over(s);
  return s;
}
const raw = (s: Snapshot): Analysis => analyze(s, NOW, { ...DEFAULT_RISK_CONFIG, accountCapital: 500_000 }, undefined);
const view = (a: Analysis) => toDashboardView(a, { ...DEFAULT_RISK_CONFIG, accountCapital: 500_000 }, ISO, NOW);
const staleMarketFreshFetch = (s: Snapshot) => { s.sources.market = { ...s.sources.market, source: "STALE", fetchedAt: ISO }; };

describe("R3: raw analysis endpoint data (STALE market)", () => {
  test("R3-1 a STALE market quote with a recent fetchedAt yields no executable plan in the raw analysis", () => {
    const a = raw(labelled(staleMarketFreshFetch));
    assert.equal(a.plan, null, "no plan selected");
    assert.notEqual(a.status, "TRADE");
    for (const c of a.candidates) assert.equal(c.risk?.allowed, false, `candidate ${c.strategy} must be risk-rejected`);
  });

  test("R3-2 a fresh option chain does not override a STALE market quote in the raw analysis", () => {
    const a = raw(labelled((s) => { staleMarketFreshFetch(s); s.sources.optionChain = { ...s.sources.optionChain, source: "LIVE", fetchedAt: ISO }; }));
    assert.equal(a.plan, null);
    assert.notEqual(a.status, "TRADE");
  });
});

describe("R3: dashboard view (what the page displays)", () => {
  test("R3-3 the dashboard shows the STALE source and does not mark a STALE-market recommendation executable", () => {
    const v = view(raw(labelled(staleMarketFreshFetch)));
    assert.equal(v.market.source, "STALE");
    assert.equal(v.recommendation.executable, false);
    assert.notEqual(v.recommendation.status, "TRADE");
  });

  test("R3-4 a fresh chain over a STALE market is still not executable in the dashboard", () => {
    const v = view(raw(labelled((s) => { staleMarketFreshFetch(s); s.sources.optionChain = { ...s.sources.optionChain, source: "LIVE", fetchedAt: ISO }; })));
    assert.equal(v.recommendation.executable, false);
  });

  test("R3-5 LIVE behaviour is unchanged: the source shows LIVE and executable matches the engine's TRADE-with-plan rule", () => {
    const a = raw(labelled());
    const v = view(a);
    assert.equal(v.market.source, "LIVE");
    assert.equal(v.recommendation.executable, a.status === "TRADE" && a.plan !== null);
  });

  test("R3-6 MOCK market is shown as MOCK and is never executable", () => {
    const v = view(raw(mockSnapshot("nifty", NOW)));
    assert.equal(v.market.source, "MOCK");
    assert.equal(v.recommendation.executable, false);
  });

  test("R3-7 END_OF_DAY market is shown as END_OF_DAY and is never executable", () => {
    const v = view(raw(labelled((s) => { s.sources.market = { ...s.sources.market, source: "END_OF_DAY" }; })));
    assert.equal(v.market.source, "END_OF_DAY");
    assert.equal(v.recommendation.executable, false);
  });

  test("R3-8 UNAVAILABLE market is shown as UNAVAILABLE and is never executable", () => {
    const v = view(raw(labelled((s) => { s.sources.market = { ...s.sources.market, source: "UNAVAILABLE", fetchedAt: null }; })));
    assert.equal(v.market.source, "UNAVAILABLE");
    assert.equal(v.recommendation.executable, false);
  });
});
