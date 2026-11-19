// F5 regression: a stored research row never displays as a current RECOMMENDATION. Fixtures only.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { storedResearchRowBadge } from "./storedResearchBadge.ts";

describe("stored research row badge (F5)", () => {
  test("SR-1 a stored RECOMMENDATION is labelled as stored research and not live", () => {
    const b = storedResearchRowBadge("RECOMMENDATION");
    assert.match(b.text, /STORED RESEARCH/);
    assert.match(b.text, /NOT LIVE/);
  });

  test("SR-2 a stored RECOMMENDATION never displays as the bare RECOMMENDATION label", () => {
    assert.notEqual(storedResearchRowBadge("RECOMMENDATION").text, "RECOMMENDATION");
  });

  test("SR-3 a stored RECOMMENDATION is not shown in the bull (green, live-looking) tone", () => {
    assert.notEqual(storedResearchRowBadge("RECOMMENDATION").tone, "bull");
    assert.equal(storedResearchRowBadge("RECOMMENDATION").tone, "warn");
  });

  test("SR-4 a stored NO TRADE keeps its label and tone unchanged", () => {
    assert.deepEqual(storedResearchRowBadge("NO TRADE"), { text: "NO TRADE", tone: "bear" });
  });

  test("SR-5 the helper is pure: it returns a fresh value and does not touch its input", () => {
    const status = "RECOMMENDATION";
    const a = storedResearchRowBadge(status);
    const b = storedResearchRowBadge(status);
    assert.deepEqual(a, b);
    assert.equal(status, "RECOMMENDATION");
  });

  test("SR-6 unknown statuses fall back to the NO TRADE label (no status is ever shown as a recommendation)", () => {
    for (const s of ["WAIT", "TRADE", "", "recommendation"]) {
      assert.equal(storedResearchRowBadge(s).text, "NO TRADE");
    }
  });
});
