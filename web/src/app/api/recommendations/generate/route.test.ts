// Regression: /api/recommendations/generate must accept every registered index (not just NIFTY/BANKNIFTY),
// default to NIFTY when no input is given, and reject unknown or unsupported underlyings before any market call.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";

// Isolate the journal and force the offline mock provider before importing the route.
const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), "generate-route-test-"));
process.env.RECOMMENDATION_STORE_DIR = storeDir;
process.env.MARKET_DATA_PROVIDER = "mock";
delete process.env.UPSTOX_ANALYTICS_TOKEN;

process.env.OPERATOR_TOKEN = "test-operator-token-0123456789abcdef";
function authed(r: Request): Request { const h = new Headers(r.headers); h.set("authorization", "Bearer " + process.env.OPERATOR_TOKEN); return new Request(r, { headers: h }); }
const { POST: __POST } = await import("./route.ts");
const POST = (r: Request) => __POST(authed(r));
const { INDICES, INSTRUMENTS } = await import("../../../../lib/services/instrumentRegistry.ts");

function post(body: unknown): Request {
  return new Request("http://localhost/api/recommendations/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("registry exposes exactly the six supported indices", () => {
  assert.deepEqual([...INDICES].sort(), ["bankex", "banknifty", "finnifty", "midcpnifty", "nifty", "sensex"].sort());
});

for (const index of ["nifty", "banknifty", "finnifty", "midcpnifty", "sensex", "bankex"]) {
  test(`accepts underlying "${index}" via body.underlying`, async () => {
    const res = await POST(post({ underlying: index }));
    const json = (await res.json()) as Record<string, unknown>;
    assert.notEqual(res.status, 400, `expected no 400 for ${index}, got ${JSON.stringify(json)}`);
    assert.equal(json.error, undefined, `unexpected error for ${index}: ${String(json.error)}`);
    assert.equal(json.underlying, INSTRUMENTS[index as keyof typeof INSTRUMENTS].symbol, "response must label the requested index");
  });
}

test("accepts the legacy body.index field and is case-insensitive", async () => {
  const res = await POST(post({ index: "BANKEX" }));
  const json = (await res.json()) as Record<string, unknown>;
  assert.notEqual(res.status, 400);
  assert.equal(json.underlying, "BANKEX");
});

test("defaults to NIFTY when no underlying is supplied", async () => {
  const res = await POST(post({}));
  const json = (await res.json()) as Record<string, unknown>;
  assert.notEqual(res.status, 400);
  assert.equal(json.underlying, "NIFTY");
});

test("accepts commodity underlyings (CRUDEOIL and NATURALGAS)", async () => {
  for (const comm of ["crudeoil", "naturalgas"]) {
    const res = await POST(post({ underlying: comm }));
    const json = (await res.json()) as Record<string, unknown>;
    assert.notEqual(res.status, 400, `expected no 400 for ${comm}, got ${JSON.stringify(json)}`);
    assert.equal(json.underlying, comm.toUpperCase());
  }
});

test("finnifty, midcpnifty, sensex and bankex are never mislabelled as BANKNIFTY", async () => {
  for (const index of ["finnifty", "midcpnifty", "sensex", "bankex"]) {
    const json = (await (await POST(post({ underlying: index }))).json()) as Record<string, unknown>;
    assert.notEqual(json.underlying, "BANKNIFTY", `${index} was labelled BANKNIFTY`);
  }
});

test("rejects an unsupported underlying with 400 and lists the valid ones", async () => {
  const res = await POST(post({ underlying: "reliance" }));
  const json = (await res.json()) as { error: string };
  assert.equal(res.status, 400);
  assert.match(json.error, /unknown underlying "reliance"/);
  for (const idx of INDICES) assert.match(json.error, new RegExp(idx));
});

test("does not silently coerce an unknown index to NIFTY", async () => {
  const res = await POST(post({ index: "sensex-typo" }));
  assert.equal(res.status, 400);
});

test("rejects a non-string underlying without crashing", async () => {
  const res = await POST(post({ underlying: 42 }));
  assert.equal(res.status, 400);
});

test("malformed JSON falls back to the NIFTY default rather than failing open", async () => {
  // The route parses with .catch(() => ({})), so an unreadable body is treated as no input.
  const res = await POST(post("{not json"));
  const json = (await res.json()) as Record<string, unknown>;
  assert.notEqual(res.status, 400);
  assert.equal(json.underlying, "NIFTY");
});
