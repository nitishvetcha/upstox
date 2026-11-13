// Structured logging: lines are valid JSON, carry the event, and never contain credentials.
import test from "node:test";
import assert from "node:assert/strict";
import { formatLogLine, redactValue } from "./structuredLog.ts";

test("a log line is valid JSON with level, event and time", () => {
  const line = formatLogLine("info", "paper_open_rejected", { code: "PROVENANCE" }, new Date("2026-11-13T05:00:00.000Z"));
  const o = JSON.parse(line);
  assert.equal(o.level, "info");
  assert.equal(o.event, "paper_open_rejected");
  assert.equal(o.code, "PROVENANCE");
  assert.equal(o.at, "2026-11-13T05:00:00.000Z");
});

test("credential-named keys are redacted at any depth", () => {
  const r = redactValue({ accessToken: "abc", nested: { operatorPin: "123456", password: "x", apiKey: "k", ok: 1 } }) as Record<string, any>;
  assert.equal(r.accessToken, "[REDACTED]");
  assert.equal(r.nested.operatorPin, "[REDACTED]");
  assert.equal(r.nested.password, "[REDACTED]");
  assert.equal(r.nested.apiKey, "[REDACTED]");
  assert.equal(r.nested.ok, 1);
});

test("bearer tokens inside free text are redacted", () => {
  const line = formatLogLine("warn", "upstream_error", { detail: "request had Authorization: Bearer eyJhbGciOi.payload-part.sig" });
  assert.doesNotMatch(line, /eyJhbGciOi/);
  assert.match(line, /Bearer \[REDACTED\]/);
});

test("no PIN or token value appears in any formatted line", () => {
  const line = formatLogLine("error", "ledger_persist_failed", { path: "/x/y.json", pin: "998877", token: "TOKEN-VALUE-XYZ" });
  assert.doesNotMatch(line, /998877|TOKEN-VALUE-XYZ/);
});
