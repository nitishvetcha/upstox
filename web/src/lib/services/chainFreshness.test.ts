// Chain freshness: snapshot is always unverified; contract quotes are judged individually. Offline fixtures only.
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { chainFreshness, chainFreshnessLabel } from "./chainFreshness.ts";

// 10:30 IST on a trading day: market OPEN.
const OPEN_NOW = new Date("2026-10-13T05:00:00.000Z");
const ago = (s: number) => new Date(OPEN_NOW.getTime() - s * 1000).toISOString();
const row = (callLtt: string | null | undefined, putLtt: string | null | undefined) => ({
  strike: 22700,
  call: { lastTradeTime: callLtt },
  put: { lastTradeTime: putLtt },
});

describe("chain snapshot is never verified by receipt time", () => {
  it("fresh contract quotes still leave the snapshot UNVERIFIED", () => {
    const f = chainFreshness([row(ago(5), ago(8))], OPEN_NOW);
    assert.equal(f.snapshot, "CHAIN_SNAPSHOT_UNVERIFIED");
    assert.equal(f.quotes, "CONTRACT_QUOTES_FRESH");
  });

  it("no trade times at all cannot become fresh from the response time", () => {
    const f = chainFreshness([row(null, undefined), row(null, null)], OPEN_NOW);
    assert.equal(f.snapshot, "CHAIN_SNAPSHOT_UNVERIFIED");
    assert.equal(f.quotes, "CONTRACT_QUOTES_UNKNOWN");
    assert.equal(f.fresh, 0);
    assert.equal(f.unknown, 4);
  });
});

describe("individual contract quote freshness", () => {
  it("all fresh -> CONTRACT_QUOTES_FRESH", () => {
    const f = chainFreshness([row(ago(5), ago(10)), row(ago(20), ago(1))], OPEN_NOW);
    assert.equal(f.quotes, "CONTRACT_QUOTES_FRESH");
    assert.deepEqual([f.total, f.fresh, f.stale, f.unknown], [4, 4, 0, 0]);
  });

  it("all stale -> CONTRACT_QUOTES_STALE", () => {
    const f = chainFreshness([row(ago(600), ago(900))], OPEN_NOW);
    assert.equal(f.quotes, "CONTRACT_QUOTES_STALE");
    assert.equal(f.fresh, 0);
    assert.equal(f.stale, 2);
  });

  it("one fresh and one stale contract is MIXED, never FRESH for the whole chain", () => {
    const f = chainFreshness([row(ago(5), ago(600))], OPEN_NOW);
    assert.equal(f.quotes, "CONTRACT_QUOTES_MIXED");
    assert.equal(f.fresh, 1);
    assert.equal(f.stale, 1);
  });

  it("one fresh contract with the rest missing is MIXED, not FRESH", () => {
    const f = chainFreshness([row(ago(5), null), row(null, null)], OPEN_NOW);
    assert.equal(f.quotes, "CONTRACT_QUOTES_MIXED");
    assert.equal(f.unknown, 3);
  });

  it("future-dated trade times are unknown, never fresh", () => {
    const future = new Date(OPEN_NOW.getTime() + 60_000).toISOString();
    const f = chainFreshness([row(future, future)], OPEN_NOW);
    assert.equal(f.fresh, 0);
    assert.equal(f.unknown, 2);
    assert.notEqual(f.quotes, "CONTRACT_QUOTES_FRESH");
  });

  it("missing timestamps are unknown", () => {
    const f = chainFreshness([row(undefined, null)], OPEN_NOW);
    assert.equal(f.unknown, 2);
    assert.equal(f.quotes, "CONTRACT_QUOTES_UNKNOWN");
  });

  it("end-of-day quotes are counted separately and never fresh while the market is open", () => {
    const yesterday = "2026-10-12T09:30:00.000Z";
    const f = chainFreshness([row(yesterday, yesterday)], OPEN_NOW);
    assert.equal(f.fresh, 0);
    assert.equal(f.endOfDay + f.stale, 2);
  });

  it("an empty chain is UNKNOWN, not FRESH", () => {
    const f = chainFreshness([], OPEN_NOW);
    assert.equal(f.quotes, "CONTRACT_QUOTES_UNKNOWN");
    assert.equal(f.total, 0);
  });
});

describe("dashboard label", () => {
  it("says snapshot unverified and reports contract counts", () => {
    const label = chainFreshnessLabel(chainFreshness([row(ago(5), ago(600))], OPEN_NOW));
    assert.match(label, /snapshot unverified/);
    assert.match(label, /1\/2 contract quotes fresh \(mixed\)/);
  });

  it("does not claim the whole chain is stale when quote times are unavailable", () => {
    const label = chainFreshnessLabel(chainFreshness([row(null, null)], OPEN_NOW));
    assert.match(label, /contract quote times unavailable/);
    assert.doesNotMatch(label, /stale/);
  });
});
