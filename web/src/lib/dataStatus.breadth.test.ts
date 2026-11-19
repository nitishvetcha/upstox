// Issue 2 / B4 follow-up (Task B) — the global data label must never count a STALE, END_OF_DAY or UNAVAILABLE
// breadth set as usable. Offline and deterministic: fixed clock, fixture quotes, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dataLabel } from "./dataStatus.ts";
import { calculateBreadth, unavailableBreadth } from "./services/breadthService.ts";
import { mockSnapshot } from "./services/mock.ts";
import type { ConstituentQuote, MarketBreadth, Snapshot } from "./types.ts";

const NOW = new Date("2026-10-05T07:00:00Z"); // Mon 12:30 IST, market open
const CLOSED = new Date("2026-10-05T11:21:00Z"); // Mon 16:51 IST, market closed
const FRESH = new Date(NOW.getTime() - 30_000).toISOString();
const STALE = new Date(NOW.getTime() - 600_000).toISOString();
const SAME_SESSION = "2026-10-05T09:59:00Z"; // 15:29 IST: today's session, before the close

function quotes(n: number, timestamp: string): ConstituentQuote[] {
  return Array.from({ length: n }, (_, i) => ({
    symbol: `S${i}`, lastPrice: 1008, previousClose: 1000, change: 8, changePercent: 0.8, timestamp,
  }));
}

// Every subsystem LIVE, news current: the only thing left to decide the label is breadth.
function withBreadth(b: MarketBreadth, sourceOverride?: MarketBreadth["source"]): Snapshot {
  const s = mockSnapshot("nifty", NOW);
  for (const k of Object.keys(s.sources) as (keyof Snapshot["sources"])[]) s.sources[k] = { ...s.sources[k], source: "LIVE", provider: "UPSTOX" };
  s.fallbackReason = null;
  s.news = { ...s.news, status: "LIVE" };
  s.breadth = b;
  s.sources.breadth = sourceOverride ?? b.source ?? { source: "UNAVAILABLE", provider: null, fetchedAt: null };
  return s;
}

// Production shape: the breadth source is whatever calculateBreadth reports for the status.
const production = (b: MarketBreadth) => withBreadth(b, b.source);

test("DS-1. baseline: all subsystems LIVE with LIVE breadth → LIVE DATA", () => {
  assert.equal(dataLabel([production(calculateBreadth("nifty", quotes(50, FRESH), 0.4, NOW))]), "LIVE DATA");
});

test("DS-2. PARTIAL breadth (coverage 84%) → PARTIAL LIVE DATA (presentation change; the engine still accepts PARTIAL)", () => {
  const b = calculateBreadth("nifty", quotes(42, FRESH), 0.4, NOW);
  assert.equal(b.status, "PARTIAL");
  assert.equal(dataLabel([production(b)]), "PARTIAL LIVE DATA");
});

test("DS-10. one fresh and 49 stale constituents → PARTIAL LIVE DATA (end to end through the label)", () => {
  const stamps = [FRESH, ...Array(49).fill(STALE)];
  const b = calculateBreadth("nifty", stamps.map((timestamp, i) => ({ symbol: `S${i}`, lastPrice: 1008, previousClose: 1000, change: 8, changePercent: 0.8, timestamp })), 0.4, NOW);
  assert.equal(b.status, "STALE");
  assert.equal(dataLabel([production(b)]), "PARTIAL LIVE DATA");
});

test("DS-11. every constituent undated (live path, no usable timestamps) → PARTIAL LIVE DATA, never LIVE DATA", () => {
  const b = calculateBreadth("nifty", quotes(50, null as unknown as string), 0.4, NOW);
  assert.equal(b.status, "STALE");
  assert.equal(dataLabel([production(b)]), "PARTIAL LIVE DATA");
});

test("DS-3. END_OF_DAY breadth → PARTIAL LIVE DATA (not live)", () => {
  const b = calculateBreadth("nifty", quotes(50, SAME_SESSION), 0.4, CLOSED);
  assert.equal(b.status, "END_OF_DAY");
  assert.equal(dataLabel([production(b)]), "PARTIAL LIVE DATA");
});

test("DS-4. STALE breadth (production shape, source UNAVAILABLE) → PARTIAL LIVE DATA", () => {
  const b = calculateBreadth("nifty", quotes(50, STALE), 0.4, NOW);
  assert.equal(b.status, "STALE");
  assert.equal(dataLabel([production(b)]), "PARTIAL LIVE DATA");
});

test("DS-5. UNAVAILABLE breadth → PARTIAL LIVE DATA", () => {
  const b = unavailableBreadth("nifty", "No constituent quotes");
  assert.equal(dataLabel([production(b)]), "PARTIAL LIVE DATA");
});

test("DS-6. no breadth at all (null) → PARTIAL LIVE DATA", () => {
  const s = withBreadth(unavailableBreadth("nifty", "x"));
  s.breadth = null;
  assert.equal(dataLabel([s]), "PARTIAL LIVE DATA");
});

// Defensive cases: the summary must not depend on the source label being consistent with the status.
test("DS-7. STALE breadth whose source label reads LIVE → PARTIAL LIVE DATA (STALE is never OK)", () => {
  const b = calculateBreadth("nifty", quotes(50, STALE), 0.4, NOW);
  assert.equal(dataLabel([withBreadth(b, { source: "LIVE", provider: "UPSTOX", fetchedAt: NOW.toISOString() })]), "PARTIAL LIVE DATA");
});

test("DS-8. END_OF_DAY breadth whose source label reads LIVE → PARTIAL LIVE DATA (not live)", () => {
  const b = calculateBreadth("nifty", quotes(50, SAME_SESSION), 0.4, CLOSED);
  assert.equal(dataLabel([withBreadth(b, { source: "LIVE", provider: "UPSTOX", fetchedAt: CLOSED.toISOString() })]), "PARTIAL LIVE DATA");
});

test("DS-9. a mix of snapshots: one STALE breadth makes the global label not LIVE", () => {
  const live = production(calculateBreadth("nifty", quotes(50, FRESH), 0.4, NOW));
  const stale = production(calculateBreadth("banknifty", quotes(14, STALE), 0.4, NOW));
  assert.equal(dataLabel([live, stale]), "PARTIAL LIVE DATA");
});
