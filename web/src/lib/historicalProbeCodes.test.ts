// Network-gate setup: these tests stub fetch to exercise the live (upstox) code path. Without this the gate refuses.
process.env.MARKET_DATA_PROVIDER = "upstox";
// Historical option probe: a refusal is reported with the provider's own code. The Plus-plan claim is made only for
// UDAPI1149. Offline: the analytics token is a test value and fetch is stubbed, so no request leaves the process.
import { test } from "node:test";
import assert from "node:assert/strict";
import { UpstoxHistoricalOptionsAdapter } from "./adapters/upstoxHistoricalOptionsAdapter.ts";

async function withProbe(body: unknown, status: number, fn: () => Promise<void>) {
  const savedToken = process.env.UPSTOX_ANALYTICS_TOKEN;
  const savedFetch = globalThis.fetch;
  process.env.UPSTOX_ANALYTICS_TOKEN = "probe-test-value";
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof fetch;
  try { await fn(); } finally {
    globalThis.fetch = savedFetch;
    if (savedToken === undefined) delete process.env.UPSTOX_ANALYTICS_TOKEN; else process.env.UPSTOX_ANALYTICS_TOKEN = savedToken;
  }
}

test("HP-1. an unrecognised provider code is reported as itself, with ERROR capability and no Plus-plan claim", async () => {
  await withProbe({ status: "error", errors: [{ errorCode: "UDAPI100011", message: "refused" }] }, 403, async () => {
    const r = await new UpstoxHistoricalOptionsAdapter().getAvailability();
    assert.equal(r.accessStatus, "PROVIDER_BLOCKED");
    assert.equal(r.blockerCode, "UDAPI100011");
    assert.equal(r.capabilities.optionOHLC, "ERROR");
    assert.ok(!r.notes.some((n) => /requires an Upstox Plus subscription|To unlock/.test(n)), "the Plus plan is not inferred from another code");
  });
});

test("HP-2. a refusal with no provider code is reported by its HTTP status, never as UDAPI1149", async () => {
  await withProbe({}, 500, async () => {
    const r = await new UpstoxHistoricalOptionsAdapter().getAvailability();
    assert.equal(r.blockerCode, "HTTP_500", "the request layer reports an HTTP-status code when no provider code is present");
    assert.equal(r.capabilities.optionOHLC, "ERROR");
    assert.ok(!r.notes.some((n) => /requires an Upstox Plus subscription|To unlock/.test(n)), "no affirmative Plus-plan claim");
  });
});

test("HP-3. the known Plus-plan code still gives PLAN_REQUIRED and the Plus-plan notes", async () => {
  await withProbe({ status: "error", errors: [{ errorCode: "UDAPI1149", message: "plan" }] }, 403, async () => {
    const r = await new UpstoxHistoricalOptionsAdapter().getAvailability();
    assert.equal(r.blockerCode, "UDAPI1149");
    assert.equal(r.capabilities.optionOHLC, "PLAN_REQUIRED");
    assert.ok(r.notes.some((n) => /Plus subscription/.test(n)));
  });
});
