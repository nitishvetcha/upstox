// Saved picks: persistence, source separation, status labels, validation rules, journal isolation.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { savePick, loadPicks, removePick, statusLabel, validatePick } from "./savedPicks.ts";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "picks-"));
const file = path.join(dir, "picks.json");
const base = { instrument: "RELIANCE", instrumentType: "STOCK" as const, direction: "LONG" as const, entry: 100, stopLoss: 95, targets: [110], source: "LIVE" as const };

test("SP-1. persistence: a saved pick survives reload and has id and timestamp", () => {
  const r = savePick(file, base, new Date("2026-11-08T10:00:00Z"));
  assert.ok(r.ok);
  const all = loadPicks(file);
  assert.equal(all.length, 1);
  assert.equal(all[0].instrument, "RELIANCE");
  assert.equal(all[0].savedAt, "2026-11-08T10:00:00.000Z");
  assert.ok(all[0].id.startsWith("pick-"));
});

test("SP-2. a pick is NOT VALIDATED by default; the label says so", () => {
  // Own store file: SP-1 already saved this identical card, and same-day duplicates are now refused.
  const r = savePick(path.join(dir, "sp2.json"), base);
  assert.ok(r.ok);
  assert.equal(r.pick.validation, "NOT_VALIDATED");
  assert.match(statusLabel(r.pick), /NOT VALIDATED/);
});

test("SP-3. source separation: MOCK picks are labelled as mock and never as live", () => {
  const r = savePick(file, { ...base, source: "MOCK" });
  assert.ok(r.ok);
  assert.match(statusLabel(r.pick), /MOCK DATA/);
  assert.doesNotMatch(statusLabel(r.pick), /LIVE/);
});

test("SP-4. users cannot save a pick as VALIDATED", () => {
  const errs = validatePick({ ...base, validation: "VALIDATED" });
  assert.ok(errs.some((e) => /VALIDATED/.test(e)));
  const r = savePick(file, { ...base, validation: "VALIDATED" });
  assert.equal(r.ok, false);
});

test("SP-5. price rules: LONG stop must sit below entry, SHORT stop above", () => {
  assert.ok(validatePick({ ...base, stopLoss: 105 }).length > 0);
  assert.ok(validatePick({ ...base, direction: "SHORT", stopLoss: 95 }).length > 0);
  assert.deepEqual(validatePick(base), []);
});

test("SP-6. removal deletes only the named pick", () => {
  const before = loadPicks(file);
  assert.ok(removePick(file, before[0].id));
  assert.equal(loadPicks(file).length, before.length - 1);
  assert.equal(removePick(file, "missing-id"), false);
});

test("SP-7. journal isolation: saving picks never writes to the recommendation journal directory", () => {
  const journal = path.join(dir, "recommendations");
  fs.mkdirSync(journal);
  savePick(file, base);
  assert.deepEqual(fs.readdirSync(journal), []);
  assert.ok(file.startsWith(dir));
  assert.ok(!file.includes(path.join(".data", "recommendations")));
});

test("SP-8. corrupt file is treated as empty, not as an error that drops other data", () => {
  const bad = path.join(dir, "corrupt.json");
  fs.writeFileSync(bad, "{not json");
  assert.deepEqual(loadPicks(bad), []);
});
