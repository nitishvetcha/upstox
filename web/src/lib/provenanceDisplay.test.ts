// F7 G1-G5 regression: provenance display rules. Pure functions, fixtures only.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { breadthBadge, providerText, sourceProviderLabel, summarizeSources } from "./provenanceDisplay.ts";

describe("G1: breadth never shows LIVE when its source is not LIVE", () => {
  test("G1-1 MOCK breadth source shows MOCK (warn), even when the status says LIVE", () => {
    assert.deepEqual(breadthBadge({ source: "MOCK", provider: "MOCK" }, "LIVE"), { text: "MOCK", tone: "warn" });
  });
  test("G1-2 UNAVAILABLE breadth source shows UNAVAILABLE, even when the status says LIVE", () => {
    assert.deepEqual(breadthBadge({ source: "UNAVAILABLE", provider: null }, "LIVE"), { text: "UNAVAILABLE", tone: "warn" });
  });
  test("G1-3 STALE breadth source is not shown as LIVE", () => {
    assert.notEqual(breadthBadge({ source: "STALE", provider: "UPSTOX" }, "LIVE").text, "LIVE");
  });
  test("G1-4 a LIVE breadth source keeps its status label and neutral tone (unchanged)", () => {
    assert.deepEqual(breadthBadge({ source: "LIVE", provider: "UPSTOX" }, "LIVE"), { text: "LIVE", tone: "neutral" });
    assert.deepEqual(breadthBadge({ source: "LIVE", provider: "UPSTOX" }, "PARTIAL"), { text: "PARTIAL", tone: "neutral" });
  });
  test("G1-5 a LIVE source with no status shows UNAVAILABLE, never LIVE", () => {
    assert.equal(breadthBadge({ source: "LIVE", provider: "UPSTOX" }, null).text, "UNAVAILABLE");
  });
});

describe("G4: no default to UPSTOX or LIVE when metadata is missing", () => {
  test("G4-1 a missing breadth source is UNKNOWN, not LIVE", () => {
    assert.deepEqual(breadthBadge(null, "LIVE"), { text: "UNKNOWN", tone: "warn" });
    assert.deepEqual(breadthBadge(undefined, undefined), { text: "UNKNOWN", tone: "warn" });
  });
  test("G4-2 a missing provider is UNKNOWN, not UPSTOX", () => {
    assert.equal(providerText(null), "UNKNOWN");
    assert.equal(providerText({ source: "LIVE", provider: null }), "UNKNOWN");
    assert.equal(providerText({ source: "LIVE", provider: "UPSTOX" }), "UPSTOX");
  });
});

describe("G3: mixed providers show MIXED", () => {
  test("G3-1 all UPSTOX shows UPSTOX", () => {
    assert.equal(sourceProviderLabel(["UPSTOX", "UPSTOX", "UPSTOX"]), "UPSTOX");
  });
  test("G3-2 all MOCK shows MOCK", () => {
    assert.equal(sourceProviderLabel(["MOCK", "MOCK"]), "MOCK");
  });
  test("G3-3 UPSTOX and MOCK together show MIXED, not UPSTOX", () => {
    assert.equal(sourceProviderLabel(["UPSTOX", "UPSTOX", "MOCK"]), "MIXED");
  });
  test("G3-4 unknown or missing providers are ignored; none known is UNKNOWN", () => {
    assert.equal(sourceProviderLabel([null, undefined, "UPSTOX"]), "UPSTOX");
    assert.equal(sourceProviderLabel([null, undefined]), "UNKNOWN");
    assert.equal(sourceProviderLabel([]), "UNKNOWN");
  });
});

describe("G5: one data-source label for a set of results", () => {
  test("G5-1 all LIVE shows LIVE", () => {
    assert.equal(summarizeSources(["LIVE", "LIVE"]), "LIVE");
  });
  test("G5-2 MOCK with LIVE shows MIXED", () => {
    assert.equal(summarizeSources(["MOCK", "LIVE"]), "MIXED");
  });
  test("G5-3 all MOCK shows MOCK", () => {
    assert.equal(summarizeSources(["MOCK", "MOCK"]), "MOCK");
  });
  test("G5-4 nothing known shows UNAVAILABLE", () => {
    assert.equal(summarizeSources([]), "UNAVAILABLE");
    assert.equal(summarizeSources([null, undefined, ""]), "UNAVAILABLE");
  });
});
