// Issue 2 / B1 — the diagnostic names the category of each unavailable factor, instead of always
// reporting INSUFFICIENT_TECHNICAL_DATA. Offline: deterministic mock snapshots through the real frozen engine.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "./engine/strategy.ts";
import { mockSnapshotTradeInputs as mockSnapshot } from "./testFixtures/mockSnapshotTradeInputs.ts";
import type { Snapshot } from "./types.ts";
import { classifyEngineBlocker, classifyEngineBlockers, diagnose, type RecommendationDiagnostic } from "./recommendationDiagnostic.ts";

const MIDDAY = new Date("2026-10-05T07:00:00Z"); // Mon 12:30 IST
const RISK = { accountCapital: 500_000 };

function live(mut?: (s: Snapshot) => void): Snapshot {
  const s = structuredClone(mockSnapshot("nifty", MIDDAY));
  for (const k of Object.keys(s.sources) as (keyof Snapshot["sources"])[]) s.sources[k] = { ...s.sources[k], source: "LIVE", provider: "UPSTOX" };
  s.fallbackReason = null;
  for (const r of s.chain) {
    r.call.instrumentKey = `NSE_FO|T${r.strike}CE`;
    r.put.instrumentKey = `NSE_FO|T${r.strike}PE`;
  }
  mut?.(s);
  return s;
}
const stale = (s: Snapshot, k: keyof Snapshot["sources"]) => { s.sources[k] = { ...s.sources[k], source: "STALE" }; };
const diag = (s: Snapshot, noCandidates = false): RecommendationDiagnostic => {
  const a = analyze(s, MIDDAY, RISK, undefined);
  return diagnose(noCandidates ? { ...a, candidates: [], plan: null } : a, MIDDAY);
};
const codes = (d: RecommendationDiagnostic) => d.blockers.map((b) => b.code);
const comparable = (d: RecommendationDiagnostic) => d.blockers.filter((b) => b.message.startsWith("Not enough comparable data"));

describe("B1 — classifyEngineBlockers splits the combined blocker by category", () => {
  it("technical-only text → INSUFFICIENT_TECHNICAL_DATA", () => {
    assert.deepEqual(classifyEngineBlockers("Not enough comparable data to trade: Market trend, Price action, Technical indicators unavailable").map((p) => p.code), ["INSUFFICIENT_TECHNICAL_DATA"]);
  });

  it("option-chain-only text → INSUFFICIENT_OPTION_CHAIN, not technical", () => {
    const text = "Not enough comparable data to trade: Option chain / OI, Volatility / IV unavailable";
    assert.equal(classifyEngineBlocker(text), "INSUFFICIENT_OPTION_CHAIN");
    assert.deepEqual(classifyEngineBlockers(text), [{ code: "INSUFFICIENT_OPTION_CHAIN", message: text }]);
  });

  it("mixed technical and option-chain text → two categories, each message names only its own factors", () => {
    const parts = classifyEngineBlockers("Not enough comparable data to trade: Market trend, Option chain / OI unavailable");
    assert.deepEqual(parts, [
      { code: "INSUFFICIENT_TECHNICAL_DATA", message: "Not enough comparable data to trade: Market trend unavailable" },
      { code: "INSUFFICIENT_OPTION_CHAIN", message: "Not enough comparable data to trade: Option chain / OI unavailable" },
    ]);
  });

  it("news-only and breadth-only text → INSUFFICIENT_FRESHNESS", () => {
    assert.equal(classifyEngineBlocker("Not enough comparable data to trade: News sentiment unavailable"), "INSUFFICIENT_FRESHNESS");
    assert.equal(classifyEngineBlocker("Not enough comparable data to trade: Breadth / confirmation unavailable"), "INSUFFICIENT_FRESHNESS");
  });

  it("'Full confirmation requires live news data' → INSUFFICIENT_FRESHNESS (was INSUFFICIENT_TECHNICAL_DATA)", () => {
    assert.equal(classifyEngineBlocker("Full confirmation requires live news data"), "INSUFFICIENT_FRESHNESS");
  });

  it("all seven factor labels together → one part per category, no factor dropped", () => {
    const text = "Not enough comparable data to trade: Market trend, Option chain / OI, Price action, Technical indicators, Volatility / IV, News sentiment, Breadth / confirmation unavailable";
    const parts = classifyEngineBlockers(text);
    assert.deepEqual(parts.map((p) => p.code), ["INSUFFICIENT_TECHNICAL_DATA", "INSUFFICIENT_OPTION_CHAIN", "INSUFFICIENT_FRESHNESS"]);
    const named = parts.flatMap((p) => p.message.replace("Not enough comparable data to trade: ", "").replace(" unavailable", "").split(", "));
    assert.deepEqual(named.sort(), ["Breadth / confirmation", "Market trend", "News sentiment", "Option chain / OI", "Price action", "Technical indicators", "Volatility / IV"]);
  });

  it("an unknown factor label → UNCLASSIFIED, never dropped and never technical", () => {
    const text = "Not enough comparable data to trade: Brand new factor unavailable";
    assert.equal(classifyEngineBlocker(text), "UNCLASSIFIED");
    assert.deepEqual(classifyEngineBlockers(text), [{ code: "UNCLASSIFIED", message: text }]);
  });

  it("every factor label the engine can produce maps to a real category (drift guard)", () => {
    const a = analyze(live(), MIDDAY, RISK, undefined);
    for (const f of a.factors) {
      const code = classifyEngineBlocker(`Not enough comparable data to trade: ${f.label} unavailable`);
      assert.notEqual(code, "UNCLASSIFIED", `factor "${f.label}" has no category`);
    }
  });

  it("non-comparable engine texts are unchanged", () => {
    const cases: [string, string][] = [
      ["Market data is stale", "STALE_MARKET_DATA"],
      ["Technical data is stale", "INSUFFICIENT_FRESHNESS"],
      ["Event risk: RBI", "EVENT_RISK"],
      ["Long Call: Risk/reward 1:0.9 below minimum 1:1.2", "RISK_REWARD_TOO_LOW"],
    ];
    for (const [text, code] of cases) {
      assert.equal(classifyEngineBlocker(text), code);
      assert.deepEqual(classifyEngineBlockers(text), [{ code, message: text }]);
    }
  });
});

describe("B1 — diagnostic reason per unavailable-factor scenario (real engine)", () => {
  it("no unavailable factors → TRADE, no blockers", () => {
    const d = diag(live());
    assert.equal(d.finalDecision, "TRADE");
    assert.deepEqual(d.blockers, []);
  });

  it("technical-only unavailable → INSUFFICIENT_TECHNICAL_DATA, and no option-chain code", () => {
    const d = diag(live((s) => stale(s, "technical")));
    assert.ok(codes(d).includes("INSUFFICIENT_TECHNICAL_DATA"));
    assert.ok(!codes(d).includes("INSUFFICIENT_OPTION_CHAIN"));
    assert.ok(comparable(d).every((b) => b.code === "INSUFFICIENT_TECHNICAL_DATA"));
  });

  it("option-chain-only unavailable → INSUFFICIENT_OPTION_CHAIN, not technical; stage 3 blocked, stage 4 passes", () => {
    const d = diag(live((s) => stale(s, "optionChain")));
    assert.ok(codes(d).includes("INSUFFICIENT_OPTION_CHAIN"));
    assert.ok(!codes(d).includes("INSUFFICIENT_TECHNICAL_DATA"));
    const msg = comparable(d).map((b) => b.message).join(" | ");
    assert.ok(msg.includes("Option chain / OI") && msg.includes("Volatility / IV"));
    assert.ok(!/Market trend|Price action|Technical indicators/.test(msg));
    assert.equal(d.checks.find((c) => c.stage === 3)!.status, "BLOCKED");
    assert.equal(d.checks.find((c) => c.stage === 4)!.status, "PASS");
  });

  it("mixed technical and option-chain unavailable → both categories, each with its own factors", () => {
    const d = diag(live((s) => { stale(s, "technical"); stale(s, "optionChain"); }));
    assert.ok(codes(d).includes("INSUFFICIENT_TECHNICAL_DATA"));
    assert.ok(codes(d).includes("INSUFFICIENT_OPTION_CHAIN"));
    const tech = comparable(d).find((b) => b.code === "INSUFFICIENT_TECHNICAL_DATA")!.message;
    const chain = comparable(d).find((b) => b.code === "INSUFFICIENT_OPTION_CHAIN")!.message;
    assert.ok(!/Option chain|Volatility/.test(tech));
    assert.ok(!/Market trend|Price action|Technical indicators/.test(chain));
  });

  it("news-only unavailable → INSUFFICIENT_FRESHNESS; no technical or option-chain code", () => {
    const d = diag(live((s) => stale(s, "news")));
    assert.ok(codes(d).includes("INSUFFICIENT_FRESHNESS"));
    assert.ok(!codes(d).includes("INSUFFICIENT_TECHNICAL_DATA"));
    assert.ok(!codes(d).includes("INSUFFICIENT_OPTION_CHAIN"));
  });

  it("breadth-only unavailable → INSUFFICIENT_FRESHNESS; no technical code", () => {
    const d = diag(live((s) => stale(s, "breadth")));
    assert.ok(codes(d).includes("INSUFFICIENT_FRESHNESS"));
    assert.ok(!codes(d).includes("INSUFFICIENT_TECHNICAL_DATA"));
  });

  it("all four categories unavailable → each category reported, and NO_VALID_STRATEGY still present", () => {
    const d = diag(live((s) => { stale(s, "technical"); stale(s, "optionChain"); stale(s, "news"); stale(s, "breadth"); }));
    assert.ok(codes(d).includes("INSUFFICIENT_TECHNICAL_DATA"));
    assert.ok(codes(d).includes("INSUFFICIENT_OPTION_CHAIN"));
    assert.ok(codes(d).includes("INSUFFICIENT_FRESHNESS"));
    assert.ok(codes(d).includes("NO_VALID_STRATEGY"));
  });

  it("existing stale diagnostic is unchanged: stale spot → STALE_MARKET_DATA, still not TRADE", () => {
    const a = analyze(live(), new Date(MIDDAY.getTime() + 30 * 60_000), RISK, undefined);
    const d = diagnose(a, new Date(MIDDAY.getTime() + 30 * 60_000));
    assert.notEqual(d.finalDecision, "TRADE");
    assert.ok(codes(d).includes("STALE_MARKET_DATA"));
  });

  it("existing no-valid-strategy diagnostic is unchanged: NO_VALID_STRATEGY, not TRADE", () => {
    const d = diag(live(), true);
    assert.notEqual(d.finalDecision, "TRADE");
    assert.ok(codes(d).includes("NO_VALID_STRATEGY"));
  });

  it("engine decisions and candidate counts are unchanged by the classification (baseline values)", () => {
    const expected: [string, (s: Snapshot) => void, number][] = [
      ["technical-only", (s) => stale(s, "technical"), 0],
      ["chain-only", (s) => stale(s, "optionChain"), 0],
      ["news-only", (s) => stale(s, "news"), 0],
      ["breadth-only", (s) => stale(s, "breadth"), 0],
    ];
    for (const [, mut, candidates] of expected) {
      const d = diag(live(mut));
      assert.equal(d.finalDecision, "NO_TRADE");
      assert.equal(d.candidates.length, candidates);
    }
    assert.equal(diag(live()).candidates.length, 2);
  });
});
