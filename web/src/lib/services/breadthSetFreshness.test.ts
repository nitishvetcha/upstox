// Issue 2 / B4 finalisation — the breadth set is LIVE only when every constituent is fresh within the existing
// 150 s window (Option A, approved). Partial coverage is still PARTIAL and still accepted by the engine.
// Offline and deterministic: fixed clock, fixture quotes, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateBreadth, unavailableBreadth } from "./breadthService.ts";
import { mockSnapshot } from "./mock.ts";
import { analyze } from "../engine/strategy.ts";
import type { ConstituentQuote, MarketBreadth, Snapshot } from "../types.ts";

const NOW = new Date("2026-10-05T07:00:00Z"); // Mon 12:30 IST, market open
const CLOSED = new Date("2026-10-05T11:21:00Z"); // Mon 16:51 IST, market closed
const FRESH = new Date(NOW.getTime() - 30_000).toISOString();
const AGING = new Date(NOW.getTime() - 60_000).toISOString(); // 60 s: inside the 150 s window
const STALE = new Date(NOW.getTime() - 600_000).toISOString();
const FUTURE = new Date(NOW.getTime() + 60_000).toISOString();
const SAME_SESSION = "2026-10-05T09:59:00Z"; // 15:29 IST, today's session

// Constituent i moves 0.8% / -0.6% / 0.02% for the first 30 / next 10 / rest, so counts are fixed for any split.
const chg = (i: number) => (i < 30 ? 0.8 : i < 40 ? -0.6 : 0.02);
function set(stamps: (string | null)[]): ConstituentQuote[] {
  return stamps.map((timestamp, i) => ({
    symbol: `S${i}`, lastPrice: 1000 * (1 + chg(i) / 100), previousClose: 1000, change: 1000 * (chg(i) / 100),
    changePercent: chg(i), timestamp,
  }));
}
const rep = (v: string | null, n: number) => Array<string | null>(n).fill(v);
// N fresh + (50 − N) stale, for a 50-constituent set.
const fresh50 = (n: number) => [...rep(FRESH, n), ...rep(STALE, 50 - n)];
const statusOf = (stamps: (string | null)[], now = NOW) => calculateBreadth("nifty", set(stamps), 0.4, now);

// ── Option A: fresh-share matrix (50 constituents) ──────────────────────────────────────────────────────────────
test("A-1. 50 / 50 fresh → LIVE", () => {
  assert.equal(statusOf(fresh50(50)).status, "LIVE");
});

test("A-2. 49 / 50 fresh → STALE (one stale constituent is enough)", () => {
  assert.equal(statusOf(fresh50(49)).status, "STALE");
});

test("A-3. 40 / 50 fresh → STALE (80% fresh is not enough under Option A)", () => {
  assert.equal(statusOf(fresh50(40)).status, "STALE");
});

test("A-4. 25 / 50 fresh → STALE", () => {
  assert.equal(statusOf(fresh50(25)).status, "STALE");
});

test("A-5. 1 / 50 fresh → STALE (one fresh quote must not carry the set)", () => {
  assert.equal(statusOf(fresh50(1)).status, "STALE");
});

test("A-5b. 10 / 50 fresh (stale majority) → STALE", () => {
  assert.equal(statusOf(fresh50(10)).status, "STALE");
});

test("A-6. 0 / 50 fresh → STALE (every quote stale)", () => {
  assert.equal(statusOf(fresh50(0)).status, "STALE");
});

test("A-7. the same matrix reports STALE with the stale count in the reason", () => {
  const b = statusOf(fresh50(1));
  assert.match(b.reason ?? "", /49 of 50 constituent quote\(s\) are stale or future-dated \(outside the 150 s window\)/);
});

test("A-8. AGING quotes (60 s old, inside the 150 s window) still count as fresh → LIVE", () => {
  assert.equal(statusOf([...rep(FRESH, 25), ...rep(AGING, 25)]).status, "LIVE");
});

// ── Non-fresh timestamp kinds: each one prevents LIVE ─────────────────────────────────────────────────────────
test("A-9. one missing timestamp → STALE, reason names the undated count", () => {
  const b = statusOf([...rep(FRESH, 49), null]);
  assert.equal(b.status, "STALE");
  assert.match(b.reason ?? "", /1 of 50 constituent quote\(s\) have no usable trade timestamp/);
});

test("A-10. one unparseable timestamp → STALE, whatever its sort position", () => {
  assert.equal(statusOf([...rep(FRESH, 49), "0-bad"]).status, "STALE");
  assert.equal(statusOf([...rep(FRESH, 49), "not-a-date"]).status, "STALE");
});

test("A-11. one future-dated timestamp (+60 s) → STALE, never LIVE", () => {
  const b = statusOf([...rep(FRESH, 49), FUTURE]);
  assert.equal(b.status, "STALE");
  assert.match(b.reason ?? "", /stale or future-dated/);
});

test("A-12. one genuinely stale timestamp (10 min) among 49 fresh → STALE", () => {
  assert.equal(statusOf([...rep(FRESH, 49), STALE]).status, "STALE");
});

test("A-13. missing, invalid, stale and future together → STALE, both reasons reported", () => {
  const b = statusOf([...rep(FRESH, 40), ...rep(STALE, 4), ...rep(null, 3), ...rep("bad", 1), ...rep(FUTURE, 2)]);
  assert.equal(b.status, "STALE");
  assert.match(b.reason ?? "", /6 of 50 constituent quote\(s\) are stale or future-dated/);
  assert.match(b.reason ?? "", /4 of 50 constituent quote\(s\) have no usable trade timestamp/);
});

// ── Closed market and empty input ─────────────────────────────────────────────────────────────────────────────
test("A-14. all same-session quotes, market closed → END_OF_DAY (unchanged)", () => {
  const b = calculateBreadth("nifty", set(rep(SAME_SESSION, 50)), 0.4, CLOSED);
  assert.equal(b.status, "END_OF_DAY");
});

test("A-15. closed market with one previous-session quote → STALE (any non-fresh quote wins over END_OF_DAY)", () => {
  const PRIOR_SESSION = "2026-10-02T04:30:00Z"; // 10:00 IST on 2 Oct, an earlier session
  const b = calculateBreadth("nifty", set([...rep(SAME_SESSION, 49), PRIOR_SESSION]), 0.4, CLOSED);
  assert.equal(b.status, "STALE");
});

test("A-16. empty input → UNAVAILABLE, not STALE", () => {
  const b = calculateBreadth("nifty", [], 0.4, NOW);
  assert.equal(b.status, "UNAVAILABLE");
  assert.equal(b.reason, "No valid constituent quotes received");
});

test("A-17. unavailableBreadth is still UNAVAILABLE", () => {
  assert.equal(unavailableBreadth("nifty", "x").status, "UNAVAILABLE");
});

// ── PARTIAL: existing coverage rule preserved; engine still accepts it ────────────────────────────────────────
test("P-1. all fresh with 84% coverage → PARTIAL (existing behaviour)", () => {
  const b = calculateBreadth("nifty", set(rep(FRESH, 42)), 0.4, NOW);
  assert.equal(b.status, "PARTIAL");
  assert.equal(b.coverage, 84);
});

test("P-2. PARTIAL coverage with a stale quote → STALE (freshness wins over coverage)", () => {
  const b = calculateBreadth("nifty", set([...rep(FRESH, 41), STALE]), 0.4, NOW);
  assert.equal(b.status, "STALE");
});

function snapshotWithBreadth(b: MarketBreadth): Snapshot {
  const s = mockSnapshot("nifty", NOW);
  for (const k of Object.keys(s.sources) as (keyof Snapshot["sources"])[]) s.sources[k] = { ...s.sources[k], source: "LIVE", provider: "UPSTOX" };
  s.fallbackReason = null;
  s.breadth = b;
  s.sources.breadth = b.source ?? { source: "UNAVAILABLE", provider: null, fetchedAt: null };
  return s;
}
const breadthFactor = (b: MarketBreadth) => analyze(snapshotWithBreadth(b), NOW).factors.find((f) => f.key === "breadth")!;

test("P-3. the engine accepts PARTIAL breadth: the breadth factor is available", () => {
  const b = calculateBreadth("nifty", set(rep(FRESH, 42)), 0.4, NOW);
  assert.equal(b.status, "PARTIAL");
  assert.equal(breadthFactor(b).available, true);
});

test("P-4. the engine accepts LIVE breadth: the breadth factor is available", () => {
  assert.equal(breadthFactor(statusOf(fresh50(50))).available, true);
});

test("P-5. the engine rejects STALE breadth: the breadth factor is unavailable", () => {
  assert.equal(breadthFactor(statusOf(fresh50(49))).available, false);
});

test("P-6. advances, declines, unchanged and ratio are unchanged by the freshness rule", () => {
  const stale = statusOf(fresh50(1));
  const fresh = statusOf(fresh50(50));
  for (const b of [stale, fresh]) {
    assert.equal(b.advances, 30);
    assert.equal(b.declines, 10);
    assert.equal(b.unchanged, 10);
    assert.equal(b.advanceDeclineRatio, 3);
    assert.equal(b.breadthPercent, 40);
  }
});
