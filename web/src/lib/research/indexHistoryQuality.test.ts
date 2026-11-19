// Consistency checks for index-history presentation. No file access.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { INDEX_HISTORY_QUALITY, indexHistoryQuality } from "./indexHistoryQuality.ts";

describe("index history presentation", () => {
  test("IH-1 all six indices are present, once each", () => {
    const names = INDEX_HISTORY_QUALITY.map((q) => q.index).sort();
    assert.deepEqual(names, ["BANKEX", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTY", "SENSEX"]);
  });

  test("IH-2 the conservative usable start is never earlier than the raw start", () => {
    for (const q of INDEX_HISTORY_QUALITY) assert.ok(q.usableFrom >= q.rawFirstSession, `${q.index}: usable ${q.usableFrom} before raw ${q.rawFirstSession}`);
  });

  test("IH-3 indices with flat placeholder years carry a placeholder warning and a later usable start", () => {
    for (const name of ["BANKNIFTY", "FINNIFTY", "BANKEX"]) {
      const q = indexHistoryQuality(name)!;
      assert.ok(q.flatPlaceholderYears.length > 0, `${name} must name its placeholder years`);
      assert.ok(q.usableFrom > q.rawFirstSession, `${name} usable start must be later than raw start`);
      assert.ok(q.warnings.some((w) => /placeholder/i.test(w)), `${name} needs a placeholder warning`);
    }
  });

  test("IH-4 indices with duplicate 2015 sessions carry a duplicate warning and list the dates", () => {
    for (const name of ["BANKNIFTY", "FINNIFTY", "BANKEX"]) {
      const q = indexHistoryQuality(name)!;
      assert.ok(q.duplicateSessions.length > 0);
      assert.ok(q.warnings.some((w) => /duplicate/i.test(w)));
    }
  });

  test("IH-5 NIFTY, which has no flat or duplicate problems, carries no placeholder or duplicate warning", () => {
    const q = indexHistoryQuality("NIFTY")!;
    assert.equal(q.flatPlaceholderYears, "");
    assert.deepEqual(q.duplicateSessions, []);
    assert.deepEqual(q.warnings, []);
  });

  test("IH-6 the BSE indices state that the BSE calendar is not stored", () => {
    for (const name of ["SENSEX", "BANKEX"]) {
      assert.ok(indexHistoryQuality(name)!.warnings.some((w) => /BSE session calendar/.test(w)));
    }
  });

  test("IH-7 lookup is case-insensitive and unknown indices return undefined", () => {
    assert.equal(indexHistoryQuality("bankex")?.index, "BANKEX");
    assert.equal(indexHistoryQuality("UNKNOWN"), undefined);
  });
});
