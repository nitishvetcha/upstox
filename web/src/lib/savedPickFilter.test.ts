import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL, distinct, filterPicks, sortNewestFirst, type FilterablePick } from "./savedPickFilter.ts";

const P: FilterablePick[] = [
  { id: "1", savedAt: "2026-11-01T10:00:00Z", instrument: "RELIANCE", instrumentType: "STOCK", direction: "LONG", source: "RESEARCH", statusLabel: "NOT VALIDATED", validation: "NOT_VALIDATED", note: "breakout" },
  { id: "2", savedAt: "2026-11-03T10:00:00Z", instrument: "NIFTY 25000 CE", instrumentType: "INDEX_OPTION", direction: "LONG", source: "MOCK", statusLabel: "MOCK DATA: NOT VALIDATED", validation: "NOT_VALIDATED" },
  { id: "3", savedAt: "2026-11-02T10:00:00Z", instrument: "TCS", instrumentType: "STOCK", direction: "SHORT", source: "LIVE", statusLabel: "RESEARCH ONLY", validation: "RESEARCH_ONLY", note: "range" },
];
const none: Parameters<typeof filterPicks>[1] = { query: "", instrumentType: ALL, source: ALL, validation: ALL };

test("no filter returns every pick unchanged", () => {
  assert.deepEqual(filterPicks(P, none).map((p) => p.id), ["1", "2", "3"]);
});

test("text search matches instrument and note, case-insensitively", () => {
  assert.deepEqual(filterPicks(P, { ...none, query: "reliance" }).map((p) => p.id), ["1"]);
  assert.deepEqual(filterPicks(P, { ...none, query: "RANGE" }).map((p) => p.id), ["3"]);
  assert.deepEqual(filterPicks(P, { ...none, query: "  nifty  " }).map((p) => p.id), ["2"]);
});

test("type, source and validation filters combine (AND)", () => {
  assert.deepEqual(filterPicks(P, { ...none, instrumentType: "STOCK" }).map((p) => p.id), ["1", "3"]);
  assert.deepEqual(filterPicks(P, { ...none, instrumentType: "STOCK", source: "LIVE" }).map((p) => p.id), ["3"]);
  assert.deepEqual(filterPicks(P, { ...none, validation: "VALIDATED" }).map((p) => p.id), []);
});

test("a filter never alters a pick's status label or source (it only hides rows)", () => {
  const out = filterPicks(P, { ...none, source: "MOCK" });
  assert.equal(out[0].statusLabel, "MOCK DATA: NOT VALIDATED");
  assert.equal(out[0].source, "MOCK");
});

test("newest first, stable for equal times", () => {
  assert.deepEqual(sortNewestFirst(P).map((p) => p.id), ["2", "3", "1"]);
  const same = [{ ...P[0], id: "a", savedAt: "x" }, { ...P[0], id: "b", savedAt: "x" }];
  assert.deepEqual(sortNewestFirst(same).map((p) => p.id), ["a", "b"]);
});

test("distinct values for the filter menus are sorted and unique", () => {
  assert.deepEqual(distinct(P, "instrumentType"), ["INDEX_OPTION", "STOCK"]);
  assert.deepEqual(distinct(P, "source"), ["LIVE", "MOCK", "RESEARCH"]);
});
