import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getAuthoritativeRecommendation } from "./authoritativeOpportunity.ts";

describe("authoritativeOpportunity Service", () => {
  it("resolves the authoritative recommendation without throwing", async () => {
    const result = await getAuthoritativeRecommendation(new Date("2026-03-30T10:00:00.000Z"));
    assert.ok(result, "Result must be defined");
    assert.ok(["RECOMMENDATION", "NO_TRADE"].includes(result.status), "Status must be valid");

    if (result.status === "RECOMMENDATION") {
      assert.ok(result.candidate, "Candidate must be present");
      assert.ok(
        ["A+", "A", "B"].includes(result.candidate.grade),
        `Grade must be actionable, got ${result.candidate.grade}`
      );
      if (result.candidate.netRewardToRisk !== null) {
        assert.ok(
          result.candidate.netRewardToRisk >= 1.5,
          `Actionable Net R:R must be >= 1.5x, got ${result.candidate.netRewardToRisk}`
        );
      }
    } else {
      assert.ok(typeof result.reason === "string", "NO_TRADE must provide a reason");
      assert.ok(result.reason.length > 0, "Reason must not be empty");
    }
  });
});
