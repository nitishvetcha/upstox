// Regression tests for write-route input validation. Handlers are invoked in-process; no network, no protected data.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { validatePick } from "./savedPicks.ts";
import { POST as riskAssessRaw } from "../app/api/risk/assess/route.ts";
process.env.OPERATOR_TOKEN = "test-operator-token-0123456789abcdef";
function authed(r: Request): Request { const h = new Headers(r.headers); h.set("authorization", "Bearer " + process.env.OPERATOR_TOKEN); return new Request(r, { headers: h }); }
const riskAssess = (r: Request) => riskAssessRaw(authed(r));

const saved: Record<string, string | undefined> = {};
const KEYS = ["MARKET_DATA_PROVIDER", "UPSTOX_TOKEN_FILE", "UPSTOX_ANALYTICS_TOKEN"];
beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  process.env.MARKET_DATA_PROVIDER = "mock";
  process.env.UPSTOX_TOKEN_FILE = "/nonexistent/no-token.json";
  delete process.env.UPSTOX_ANALYTICS_TOKEN;
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

const base = { instrumentType: "STOCK", direction: "LONG", entry: 100, stopLoss: 95, source: "RESEARCH" } as const;

test("saved pick: non-string instrument is a validation error, not an exception", () => {
  const errs = validatePick({ ...base, instrument: 42 } as never);
  assert.ok(errs.includes("instrument required"), `got ${JSON.stringify(errs)}`);
});

test("saved pick: null instrument is a validation error", () => {
  const errs = validatePick({ ...base, instrument: null } as never);
  assert.ok(errs.includes("instrument required"));
});

test("saved pick: a valid instrument passes the instrument check", () => {
  const errs = validatePick({ ...base, instrument: "RELIANCE" } as never);
  assert.ok(!errs.includes("instrument required"));
});

test("risk assess: malformed JSON returns 400, not 500", async () => {
  const res = await riskAssess(new Request("http://localhost/api/risk/assess", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" }));
  assert.equal(res.status, 400);
});

test("risk assess: empty body returns 400, not 500", async () => {
  const res = await riskAssess(new Request("http://localhost/api/risk/assess", { method: "POST", headers: { "content-type": "application/json" }, body: "" }));
  assert.equal(res.status, 400);
});

test("risk assess: unknown index is reported as 404 with no computation", async () => {
  const res = await riskAssess(new Request("http://localhost/api/risk/assess", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ index: 42, plan: { strategy: "x", entry: 1 } }) }));
  assert.equal(res.status, 404);
});
