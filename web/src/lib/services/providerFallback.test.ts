// Deterministic provider-failure scenario. No network: the Upstox call is injected to fail locally.
// Checks: the fallback is logged (redacted), the snapshot is labelled MOCK, and MOCK can never pass as LIVE.
import test from "node:test";
import assert from "node:assert/strict";
import { withFallback, buildSnapshot, type FallbackDeps } from "./market.ts";
import { UpstoxError } from "./errors.ts";
import { serverProvenance } from "./paperOpportunityProvenance.ts";

const TOKEN = "fallback-test-token-must-never-log-0123456789";
const NOW = new Date("2026-10-05T07:00:00Z");

function failingDeps(): FallbackDeps {
  return {
    mode: "upstox",
    getToken: async () => TOKEN,
    getCredential: async () => ({ token: TOKEN, source: "OAUTH" as const }),
    onAuthExpired: async () => {},
    now: () => NOW,
  } as FallbackDeps;
}

function captureLogs<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
  const logs: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
  return fn().then(
    (result) => { console.warn = original; return { result, logs }; },
    (e) => { console.warn = original; throw e; },
  );
}

test("upstox failure falls back to MOCK, logs the reason, and the log never holds the token", async () => {
  const { result, logs } = await captureLogs(() =>
    withFallback(async (p) => {
      if (p.name !== "MOCK") throw new UpstoxError("UPSTOX_API_ERROR", "simulated upstream 503", 503);
      return { marker: "mock-data" };
    }, failingDeps()),
  );
  assert.equal(result.fallbackReason, "UPSTOX_API_ERROR");
  assert.deepEqual(result.data, { marker: "mock-data" });
  const line = logs.find((l) => l.includes("upstox_fallback"));
  assert.ok(line, "fallback is logged");
  assert.match(line!, /"reason":"UPSTOX_API_ERROR"/);
  assert.ok(!logs.join("\n").includes(TOKEN), "token never logged");
});

test("a snapshot built after the fallback is labelled MOCK and is refused as LIVE evidence", async () => {
  // The Upstox call fails locally; the snapshot is then built from the mock provider. No network is used.
  const { result } = await captureLogs(() =>
    withFallback(async (p) => {
      if (p.name !== "MOCK") throw new UpstoxError("UPSTOX_API_ERROR", "simulated upstream 503", 503);
      return buildSnapshot(p, "nifty", NOW);
    }, failingDeps()),
  );
  const snap = result.data;
  assert.equal(snap.sources.market.source, "MOCK", "fallback market data is labelled MOCK");
  const prov = serverProvenance({ ...snap.sources, breadth: { status: snap.breadth?.status ?? null, source: snap.sources.breadth } } as never);
  assert.equal(prov.ok, false, "MOCK data must never pass the LIVE gate");
  assert.equal(prov.labels.market, "MOCK");
});
