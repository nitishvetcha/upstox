import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dataAge } from "./dataAgeUtils.ts";

describe("dataAge", () => {
  const base = "2026-11-23T05:00:00.000Z";

  it("returns 'just now' when under 1 minute", () => {
    const now = new Date(Date.parse(base) + 30_000);
    assert.equal(dataAge(now, base), "just now");
  });

  it("returns '1m old' at exactly 1 minute", () => {
    const now = new Date(Date.parse(base) + 60_000);
    assert.equal(dataAge(now, base), "1m old");
  });

  it("returns correct minutes", () => {
    const now = new Date(Date.parse(base) + 15 * 60_000);
    assert.equal(dataAge(now, base), "15m old");
  });

  it("clamps negative diff to 'just now'", () => {
    const now = new Date(Date.parse(base) - 5_000);
    assert.equal(dataAge(now, base), "just now");
  });
});
