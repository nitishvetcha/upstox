// Saved picks: persistence, source separation, status labels, validation rules, journal isolation.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  savePick,
  loadPicks,
  removePick,
  statusLabel,
  validatePick,
  isIntradayPick,
  isSessionCompleted,
  isOptionExpired,
  isPickCompleted,
  removeCompletedPicks,
} from "./savedPicks.ts";

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

test("SP-9. isIntradayPick correctly identifies intraday stocks vs long-term investments", () => {
  // Stock from intraday momentum screener
  assert.equal(isIntradayPick({ instrumentType: "STOCK", note: "Saved from stock opportunity card" }), true);
  // Stock marked as long-term accumulation
  assert.equal(isIntradayPick({ instrumentType: "STOCK", note: "Long-term accumulation setup (BUY). Fundamental Score: 85/100." }), false);
  // Multi-month holding
  assert.equal(isIntradayPick({ instrumentType: "STOCK", note: "Multi-months+ holding" }), false);
  // Standard option without intraday tag is positional/expiry based
  assert.equal(isIntradayPick({ instrumentType: "INDEX_OPTION", note: "Saved from options opportunity card" }), false);
  // Option explicitly tagged intraday
  assert.equal(isIntradayPick({ instrumentType: "INDEX_OPTION", note: "Intraday scalp 3:15 PM" }), true);
});

test("SP-10. isSessionCompleted detects completed trading days and 15:30 IST close", () => {
  // Saved on 19 Nov 2026. Evaluated on 20 Nov 2026 -> Past calendar day -> Completed
  const savedNov19 = "2026-11-19T05:00:00.000Z"; // 10:30 AM IST
  const nowNov20 = new Date("2026-11-20T06:00:00.000Z"); // 11:30 AM IST
  assert.equal(isSessionCompleted(savedNov19, nowNov20), true);

  // Saved on 20 Nov 2026 at 10:00 IST. Evaluated on 20 Nov 2026 at 14:00 IST -> During session -> Active
  const savedNov20Morning = "2026-11-20T04:30:00.000Z"; // 10:00 AM IST
  const nowNov20Afternoon = new Date("2026-11-20T08:30:00.000Z"); // 14:00 PM IST
  assert.equal(isSessionCompleted(savedNov20Morning, nowNov20Afternoon), false);

  // Saved on 20 Nov 2026 at 10:00 IST. Evaluated on 20 Nov 2026 at 16:00 IST (past 15:30 IST) -> Completed
  const nowNov20Evening = new Date("2026-11-20T10:30:00.000Z"); // 16:00 PM IST
  assert.equal(isSessionCompleted(savedNov20Morning, nowNov20Evening), true);

  // Saved after hours at 18:00 IST on 20 Nov for next session. Evaluated at 19:00 IST on 20 Nov -> Not completed yet
  const savedNov20AfterHours = "2026-11-20T12:30:00.000Z"; // 18:00 PM IST
  const nowNov20Night = new Date("2026-11-20T13:30:00.000Z"); // 19:00 PM IST
  assert.equal(isSessionCompleted(savedNov20AfterHours, nowNov20Night), false);
});

test("SP-11. isOptionExpired and isPickCompleted detect expired options", () => {
  // NIFTY option expiring 2026-11-19, evaluated on 2026-11-20 -> Expired
  assert.equal(isOptionExpired("NIFTY 2026-11-19 25450 CE", new Date("2026-11-20T05:00:00.000Z")), true);

  // NIFTY option expiring 2026-11-23, evaluated on 2026-11-20 -> Active (Not expired)
  assert.equal(isOptionExpired("NIFTY 2026-11-23 25450 CE", new Date("2026-11-20T05:00:00.000Z")), false);
});

test("SP-12. removeCompletedPicks purges completed intraday and expired trades while preserving active", () => {
  const testFile = path.join(dir, "purge-test.json");
  const p1 = {
    id: "p-expired-stock",
    savedAt: "2026-11-19T05:00:00.000Z", // Past day
    instrument: "EICHERMOT",
    instrumentType: "STOCK" as const,
    direction: "LONG" as const,
    entry: 7904,
    source: "LIVE" as const,
    validation: "NOT_VALIDATED" as const,
    note: "Saved from stock opportunity card",
  };
  const p2 = {
    id: "p-active-option",
    savedAt: "2026-11-20T04:00:00.000Z",
    instrument: "NIFTY 2026-11-23 25600 CE",
    instrumentType: "INDEX_OPTION" as const,
    direction: "LONG" as const,
    entry: 63.55,
    source: "RESEARCH" as const,
    validation: "NOT_VALIDATED" as const,
  };
  fs.writeFileSync(testFile, JSON.stringify([p1, p2], null, 2));

  const now = new Date("2026-11-20T05:00:00.000Z");
  const res = removeCompletedPicks(testFile, now);

  assert.equal(res.removed.length, 1);
  assert.equal(res.removed[0].id, "p-expired-stock");
  assert.equal(res.remaining.length, 1);
  assert.equal(res.remaining[0].id, "p-active-option");

  // Verify file on disk is updated
  const onDisk = loadPicks(testFile);
  assert.equal(onDisk.length, 1);
  assert.equal(onDisk[0].id, "p-active-option");
});
