import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { changePin, checkPin, isValidPinFormat, LOCK_MS, MAX_FAILURES, setupPin } from "./operatorPin.ts";

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), "pin-test-"));
const PIN = "852963";
const T0 = Date.parse("2026-11-11T10:00:00Z");

test("PIN format: exactly six digits", () => {
  assert.equal(isValidPinFormat("852963"), true);
  for (const bad of ["12345", "1234567", "12345a", " 852963", "", undefined, 852963]) assert.equal(isValidPinFormat(bad), false, String(bad));
});

test("setup, then the right PIN signs in and the wrong one does not", () => {
  const f = path.join(dir(), "pin.json");
  assert.deepEqual(setupPin(PIN, f), { ok: true });
  assert.deepEqual(checkPin(PIN, T0, f), { ok: true });
  const w = checkPin("000000", T0, f);
  assert.equal(w.ok, false);
  assert.equal(w.ok === false && w.reason, "WRONG_PIN");
});

test("the PIN is never stored in plain text", () => {
  const f = path.join(dir(), "pin.json");
  setupPin(PIN, f);
  assert.equal(fs.readFileSync(f, "utf8").includes(PIN), false);
});

test("setup refuses to overwrite an existing PIN", () => {
  const f = path.join(dir(), "pin.json");
  setupPin(PIN, f);
  assert.equal(setupPin("111111", f).ok, false);
  assert.deepEqual(checkPin(PIN, T0, f), { ok: true });
});

test("no PIN set up: sign-in reports NOT_SET_UP", () => {
  assert.deepEqual(checkPin(PIN, T0, path.join(dir(), "missing.json")), { ok: false, reason: "NOT_SET_UP" });
});

test("five wrong attempts lock sign-in for 15 minutes, even with the right PIN during the lock", () => {
  const f = path.join(dir(), "pin.json");
  setupPin(PIN, f);
  let last: ReturnType<typeof checkPin> | null = null;
  for (let i = 0; i < MAX_FAILURES; i++) last = checkPin("000000", T0, f);
  assert.equal(last && last.ok === false && last.reason, "LOCKED");
  const during = checkPin(PIN, T0 + 60_000, f);
  assert.equal(during.ok, false);
  if (!during.ok && during.reason === "LOCKED") assert.ok(during.retryAfterSec > 0);
  else assert.fail("expected a lock");
});

test("after the lock expires the right PIN works again", () => {
  const f = path.join(dir(), "pin.json");
  setupPin(PIN, f);
  for (let i = 0; i < MAX_FAILURES; i++) checkPin("000000", T0, f);
  assert.deepEqual(checkPin(PIN, T0 + LOCK_MS + 1000, f), { ok: true });
});

test("four wrong attempts then the right PIN succeeds and resets the counter", () => {
  const f = path.join(dir(), "pin.json");
  setupPin(PIN, f);
  for (let i = 0; i < MAX_FAILURES - 1; i++) checkPin("000000", T0, f);
  assert.deepEqual(checkPin(PIN, T0, f), { ok: true });
  const after = checkPin("000000", T0, f);
  if (!after.ok && after.reason === "WRONG_PIN") assert.equal(after.attemptsLeft, MAX_FAILURES - 1);
  else assert.fail("expected a wrong-PIN result");
});

test("changing the PIN needs the current PIN; the new one replaces the old", () => {
  const f = path.join(dir(), "pin.json");
  setupPin(PIN, f);
  assert.equal(changePin("000000", "111111", T0, f).ok, false);
  assert.deepEqual(changePin(PIN, "111111", T0, f), { ok: true });
  assert.equal(checkPin(PIN, T0, f).ok, false);
  assert.deepEqual(checkPin("111111", T0, f), { ok: true });
});

test("changing to an invalid PIN is refused and the old PIN still works", () => {
  const f = path.join(dir(), "pin.json");
  setupPin(PIN, f);
  assert.deepEqual(changePin(PIN, "12345", T0, f), { ok: false, reason: "INVALID_FORMAT" });
  assert.deepEqual(checkPin(PIN, T0, f), { ok: true });
});

test("a wrong current PIN during change also counts toward the lock", () => {
  const f = path.join(dir(), "pin.json");
  setupPin(PIN, f);
  for (let i = 0; i < MAX_FAILURES; i++) changePin("000000", "111111", T0, f);
  const r = changePin(PIN, "111111", T0, f);
  assert.equal(r.ok === false && r.reason, "LOCKED");
});
