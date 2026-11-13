// Authentication refusals are logged without any credential.
import test from "node:test";
import assert from "node:assert/strict";
import { requireOperator } from "../operatorSession.ts";

test("a refused request logs method and path, never the bearer token", () => {
  const seen: string[] = [];
  const original = console.warn;
  console.warn = (...a: unknown[]) => { seen.push(a.map(String).join(" ")); };
  try {
    const secret = "SUPER-SECRET-BEARER-VALUE-0123456789abcdefghijkl";
    const res = requireOperator(new Request("http://localhost/api/paper-trading/enter?x=1", { method: "POST", headers: { Authorization: `Bearer ${secret}` } }), {} as NodeJS.ProcessEnv);
    assert.equal(res?.status, 401);
    assert.ok(seen.some((l) => /auth_refused/.test(l) && /\/api\/paper-trading\/enter/.test(l)), "refusal is logged with its path");
    assert.ok(seen.every((l) => !l.includes(secret)), "no token in any log line");
  } finally {
    console.warn = original;
  }
});
