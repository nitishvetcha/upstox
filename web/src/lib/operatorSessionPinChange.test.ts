import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pin-session-"));
process.env.OPERATOR_SESSION_FILE = path.join(dir, "sessions.json");
process.env.OPERATOR_PIN_FILE = path.join(dir, "pin.json");
const pin = await import("./operatorPin.ts");
const sess = await import("./operatorSession.ts");

test("a PIN change ends every existing session; the new PIN works and the old PIN fails", () => {
  assert.equal(pin.setupPin("111111").ok, true);
  const s1 = sess.createSession();
  const s2 = sess.createSession();
  assert.equal(sess.isValidSession(s1), true, "session 1 valid before the change");
  assert.equal(sess.isValidSession(s2), true, "session 2 valid before the change");

  assert.equal(pin.changePin("111111", "222222").ok, true, "PIN changed");

  assert.equal(sess.isValidSession(s1), false, "session 1 ended by the PIN change");
  assert.equal(sess.isValidSession(s2), false, "session 2 ended by the PIN change");
  assert.equal(pin.checkPin("111111").ok, false, "old PIN no longer signs in");
  assert.equal(pin.checkPin("222222").ok, true, "new PIN signs in");

  const s3 = sess.createSession();
  assert.equal(sess.isValidSession(s3), true, "a session created after the change is valid");
});

test("a session file that cannot be read fails closed (no session accepted)", () => {
  const id = sess.createSession();
  const good = process.env.OPERATOR_SESSION_FILE;
  process.env.OPERATOR_SESSION_FILE = dir; // a directory cannot be parsed as the session file
  try {
    assert.equal(sess.isValidSession(id), false);
  } finally {
    process.env.OPERATOR_SESSION_FILE = good;
  }
});
