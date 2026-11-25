import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectBestRecommendation, type RecommendationCandidate } from "./bestRecommendation.ts";

const candidate = (grade: RecommendationCandidate["grade"], score: number, engine: RecommendationCandidate["engine"] = "OPTIONS"): RecommendationCandidate => ({
  engine, grade, score, netRewardToRisk: 1.8, item: { id: `${grade}-${score}` },
});

describe("authoritative best recommendation", () => {
  it("returns NO_TRADE when only C and REJECT candidates exist", () => {
    const result = selectBestRecommendation([candidate("C", 99), candidate("REJECT", 100)]);
    assert.equal(result.status, "NO_TRADE");
    assert.equal(result.watchOnlyCount, 2);
  });

  it("prioritizes validated grade before incomparable raw engine scores", () => {
    const result = selectBestRecommendation([
      candidate("B", 95, "STOCK_INTRADAY"),
      candidate("A", 66, "OPTIONS"),
    ]);
    assert.equal(result.status, "RECOMMENDATION");
    if (result.status === "RECOMMENDATION") assert.equal(result.candidate.grade, "A");
  });

  it("uses score then net R:R as deterministic tie breakers", () => {
    const a = candidate("B", 70, "STOCK_INTRADAY");
    const b = { ...candidate("B", 70, "OPTIONS"), netRewardToRisk: 2.2 };
    const result = selectBestRecommendation([a, b]);
    assert.equal(result.status, "RECOMMENDATION");
    if (result.status === "RECOMMENDATION") assert.equal(result.candidate.engine, "OPTIONS");
  });

  it("downgrades candidates with Net R:R below 1.5x to watch-only", () => {
    const candidateBorderline = { ...candidate("A", 85, "OPTIONS"), netRewardToRisk: 1.45 };
    const candidatePassing = { ...candidate("B", 65, "STOCK_INTRADAY"), netRewardToRisk: 1.6 };
    const result = selectBestRecommendation([candidateBorderline, candidatePassing]);
    assert.equal(result.status, "RECOMMENDATION");
    if (result.status === "RECOMMENDATION") {
      assert.equal(result.candidate.engine, "STOCK_INTRADAY");
      assert.equal(result.candidate.grade, "B");
    }
    assert.equal(result.watchOnlyCount, 1);
  });

  it("returns NO_TRADE when all candidates have Net R:R < 1.5x even with high grades", () => {
    const candidateA = { ...candidate("A+", 95, "OPTIONS"), netRewardToRisk: 1.35 };
    const candidateB = { ...candidate("A", 80, "OPTIONS"), netRewardToRisk: 1.05 };
    const result = selectBestRecommendation([candidateA, candidateB]);
    assert.equal(result.status, "NO_TRADE");
    assert.equal(result.watchOnlyCount, 2);
    assert.match(result.reason, /post-tax Net R:R >= 1.5x/);
  });
});
