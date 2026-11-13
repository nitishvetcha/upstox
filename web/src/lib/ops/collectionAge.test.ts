// OpsPanel collection-age rule: under 24 h shows hours and is not stale; 24 h or more is STALE; no run is unknown.
import test from "node:test";
import assert from "node:assert/strict";
import { collectionAgeDisplay } from "./collectionAge.ts";

const NOW = Date.parse("2026-11-13T12:00:00.000Z");

test("under 24 hours: shows hours, not stale", () => {
  const r = collectionAgeDisplay("2026-11-13T06:00:00.000Z", NOW); // 6 h
  assert.deepEqual(r, { text: "6 h ago", stale: false, known: true });
});

test("exactly 24 hours and over: labelled STALE with the existing wording", () => {
  const r = collectionAgeDisplay("2026-11-12T12:00:00.000Z", NOW); // 24 h
  assert.equal(r.stale, true);
  assert.equal(r.text, "1 days ago — STALE (stored run, not current prices)");
});

test("several days old: rounds to days and stays STALE", () => {
  const r = collectionAgeDisplay("2026-11-09T12:00:00.000Z", NOW); // 4 days
  assert.equal(r.text, "4 days ago — STALE (stored run, not current prices)");
  assert.equal(r.stale, true);
});

test("no collection run recorded: unknown, not stale", () => {
  assert.deepEqual(collectionAgeDisplay(null, NOW), { text: "no collection run recorded", stale: false, known: false });
  assert.equal(collectionAgeDisplay("not a date", NOW).known, false);
});

test("the result depends only on its inputs (no clock read): same inputs, same output", () => {
  const a = collectionAgeDisplay("2026-11-13T06:00:00.000Z", NOW);
  const b = collectionAgeDisplay("2026-11-13T06:00:00.000Z", NOW);
  assert.deepEqual(a, b);
});
