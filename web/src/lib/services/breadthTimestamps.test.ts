// Network-gate setup: these tests stub fetch to exercise the live (upstox) code path. Without this the gate refuses.
process.env.MARKET_DATA_PROVIDER = "upstox";
// Issue 2 / B4 — a constituent quote with no usable trade timestamp must never be treated as fresh.
// Offline and deterministic: fixed clock, fixture quotes, and a fetch stub for the live getBreadth path.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ConstituentQuote } from "../types.ts";
import { calculateBreadth, unavailableBreadth } from "./breadthService.ts";
import { clearUpstoxCache, upstoxProvider } from "./upstoxMarket.ts";
import { INDEX_CONSTITUENTS } from "./breadthConfig.ts";
import { analyze } from "../engine/strategy.ts";
import { mockSnapshot } from "./mock.ts";

const NOW = new Date("2026-10-05T07:00:00Z"); // Mon 12:30 IST, market open
const N = INDEX_CONSTITUENTS.nifty.length; // 50
const FRESH = new Date(NOW.getTime() - 30_000).toISOString();
const STALE = new Date(NOW.getTime() - 600_000).toISOString();
const FUTURE = new Date(NOW.getTime() + 60_000).toISOString();
type Kind = "F" | "S" | "X" | "M" | "B"; // fresh, stale, future, missing, unparseable
const stampOf = (k: Kind): string | null => (k === "F" ? FRESH : k === "S" ? STALE : k === "X" ? FUTURE : k === "M" ? null : "not-a-date");
const rep = (k: Kind, n: number): Kind[] => Array<Kind>(n).fill(k);

// Fixed price pattern: positions 0–29 advance, 30–39 decline, 40–49 unchanged (30 / 10 / 10).
const chg = (i: number) => (i < 30 ? 0.8 : i < 40 ? -0.6 : 0.02);
function quotes(kinds: Kind[]): ConstituentQuote[] {
  return kinds.map((k, i) => ({
    symbol: `S${i}`,
    lastPrice: 1000 * (1 + chg(i) / 100),
    previousClose: 1000,
    change: 1000 * (chg(i) / 100),
    changePercent: chg(i),
    timestamp: stampOf(k),
  }));
}
const allKinds = (k: Kind): Kind[] => rep(k, N);

// 1. All constituents fresh and valid → LIVE (existing behaviour preserved).
test("B4-1. all constituents fresh and timestamped → LIVE, full verified coverage", () => {
  const b = calculateBreadth("nifty", quotes(allKinds("F")), 0.4, NOW);
  assert.equal(b.status, "LIVE");
  assert.equal(b.source?.source, "LIVE");
  assert.equal(b.total, N);
  assert.equal(b.coverage, 100);
});

// 2. One constituent with no timestamp → not LIVE. Its price still counts; its freshness is unknown.
test("B4-2. one missing timestamp → STALE, not LIVE; reason names the undated count", () => {
  const b = calculateBreadth("nifty", quotes([...rep("F", N - 1), "M"]), 0.4, NOW);
  assert.equal(b.status, "STALE");
  assert.equal(b.source?.source, "UNAVAILABLE");
  assert.match(b.reason ?? "", /1 of 50 constituent quote\(s\) have no usable trade timestamp/);
  assert.equal(b.total, N, "the undated quote is still a priced quote");
});

// 3. Several undated constituents → not LIVE.
test("B4-3. several missing timestamps → STALE, not LIVE", () => {
  const b = calculateBreadth("nifty", quotes([...rep("F", N - 5), ...rep("M", 5)]), 0.4, NOW);
  assert.equal(b.status, "STALE");
  assert.match(b.reason ?? "", /5 of 50/);
});

// 4. Every constituent undated → STALE, distinct from the empty-input UNAVAILABLE case.
test("B4-4. every timestamp missing → STALE (data present, freshness unknown), source UNAVAILABLE", () => {
  const b = calculateBreadth("nifty", quotes(allKinds("M")), 0.4, NOW);
  assert.equal(b.status, "STALE");
  assert.equal(b.source?.source, "UNAVAILABLE");
  assert.equal(b.total, N);
  assert.equal(b.advances, 30);
  assert.equal(b.declines, 10);
});

// 5. Genuinely stale timestamps → STALE (existing behaviour, preserved).
test("B5. all timestamps genuinely stale (10 min) → STALE (preserved)", () => {
  const b = calculateBreadth("nifty", quotes(allKinds("S")), 0.4, NOW);
  assert.equal(b.status, "STALE");
  assert.equal(b.source?.source, "UNAVAILABLE");
});

// 5b. Approved (Option A, B4 finalisation): one fresh quote among 49 stale ones must not make the set LIVE.
// The old latest-quote rule read LIVE here; every constituent is now judged on its own timestamp.
test("B5b. one fresh quote among 49 stale ones → STALE (Option A; was LIVE by latest-quote rule)", () => {
  const b = calculateBreadth("nifty", quotes([...rep("F", 1), ...rep("S", N - 1)]), 0.4, NOW);
  assert.equal(b.status, "STALE");
});

// 6. Mixed fresh / stale / missing → not LIVE, and the undated count is reported.
test("B4-6. mixed fresh/stale/missing (30/10/10) → STALE, undated count reported", () => {
  const b = calculateBreadth("nifty", quotes([...rep("F", 30), ...rep("S", 10), ...rep("M", 10)]), 0.4, NOW);
  assert.equal(b.status, "STALE");
  assert.match(b.reason ?? "", /10 of 50/);
});

// 7. Future timestamp follows the existing rule: STALE, never LIVE.
test("B4-7. future timestamp (+60 s) → STALE, never LIVE (existing rule)", () => {
  assert.equal(calculateBreadth("nifty", quotes([...rep("F", N - 1), "X"]), 0.4, NOW).status, "STALE");
  assert.equal(calculateBreadth("nifty", quotes(allKinds("X")), 0.4, NOW).status, "STALE");
});

// 8. Empty constituent input → UNAVAILABLE (absent data), not STALE and not LIVE.
test("B4-8. empty constituent input → UNAVAILABLE, reported as absent data", () => {
  const b = calculateBreadth("nifty", [], 0.4, NOW);
  assert.equal(b.status, "UNAVAILABLE");
  assert.equal(b.total, 0);
  assert.equal(b.reason, "No valid constituent quotes received");
});

// Unparseable timestamps are undated too, whatever their position in the sort order.
test("B4-extra. unparseable timestamp sorting before valid ones → still undated → STALE", () => {
  const kinds: Kind[] = [...rep("F", N - 1), "B"];
  const qs = quotes(kinds).map((q) => (q.timestamp === "not-a-date" ? { ...q, timestamp: "0-bad" } : q));
  assert.equal(calculateBreadth("nifty", qs, 0.4, NOW).status, "STALE");
});

// 10. Coverage and advance/decline values are computed on all priced quotes, unaffected by missing timestamps.
test("B4-10. advance/decline, breadth and coverage are unchanged by missing timestamps", () => {
  const withMissing = calculateBreadth("nifty", quotes([...rep("F", 30), ...rep("S", 10), ...rep("M", 10)]), 0.4, NOW);
  const allFresh = calculateBreadth("nifty", quotes(allKinds("F")), 0.4, NOW);
  for (const b of [withMissing, allFresh]) {
    assert.equal(b.advances, 30);
    assert.equal(b.declines, 10);
    assert.equal(b.unchanged, 10);
    assert.equal(b.total, 50);
    assert.equal(b.coverage, 100);
    assert.equal(b.advanceDeclineRatio, 3);
    assert.equal(b.breadthPercent, 40);
  }
});

// 11. Breadth factor availability is not enabled by undated constituents.
function snapshotWithBreadth(b: ReturnType<typeof calculateBreadth>) {
  const s = mockSnapshot("nifty", NOW);
  for (const k of Object.keys(s.sources) as (keyof typeof s.sources)[]) s.sources[k] = { ...s.sources[k], source: "LIVE", provider: "UPSTOX" };
  s.fallbackReason = null;
  s.breadth = b;
  s.sources.breadth = b.source ?? { source: "UNAVAILABLE", provider: null, fetchedAt: null };
  return s;
}
test("B4-11. breadth factor is available with fresh timestamps and unavailable with undated constituents", () => {
  const fresh = analyze(snapshotWithBreadth(calculateBreadth("nifty", quotes(allKinds("F")), 0.4, NOW)), NOW);
  assert.equal(fresh.factors.find((f) => f.key === "breadth")!.available, true);

  const undated = analyze(snapshotWithBreadth(calculateBreadth("nifty", quotes([...rep("F", N - 1), "M"]), 0.4, NOW)), NOW);
  assert.equal(undated.factors.find((f) => f.key === "breadth")!.available, false);
});

// 12. Existing valid breadth behaviour: the unavailable-breadth helper and END_OF_DAY tests are in breadth.test.ts.
test("B4-12. unavailableBreadth still reports UNAVAILABLE with a reason", () => {
  const b = unavailableBreadth("nifty", "Upstox network error");
  assert.equal(b.status, "UNAVAILABLE");
  assert.equal(b.reason, "Upstox network error");
});

// 9. The live path: a constituent without last_trade_time must not be stamped with the current time.
const CHG = (i: number) => chg(i);
function liveStub(missing: (i: number) => boolean) {
  const keys = INDEX_CONSTITUENTS.nifty.map((c) => c.instrumentKey);
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const requested = (url.searchParams.get("instrument_key") ?? "").split(",");
    const data = Object.fromEntries(
      requested.map((key) => {
        if (key.startsWith("NSE_INDEX")) {
          return [key, { instrument_token: key, last_price: 25000, net_change: 100, ohlc: { close: 25000 } }];
        }
        const i = keys.indexOf(key);
        const row: Record<string, unknown> = {
          instrument_token: key,
          last_price: 1000 * (1 + CHG(i) / 100),
          net_change: 1000 * (CHG(i) / 100),
          ohlc: { close: 1000 },
        };
        if (!missing(i)) row.last_trade_time = String(NOW.getTime() - 30_000);
        return [key, row];
      }),
    );
    return Response.json({ status: "success", data });
  }) as typeof fetch;
}
async function withLiveStub(missing: (i: number) => boolean) {
  clearUpstoxCache();
  const realFetch = globalThis.fetch;
  const realInfo = console.info;
  console.info = () => {};
  globalThis.fetch = liveStub(missing);
  try {
    return await upstoxProvider("t", () => NOW).getBreadth("nifty");
  } finally {
    globalThis.fetch = realFetch;
    console.info = realInfo;
    clearUpstoxCache();
  }
}

test("B4-9a. live path, no constituent carries last_trade_time → not LIVE, no quote stamped with the current time", async () => {
  const b = await withLiveStub(() => true);
  assert.notEqual(b.status, "LIVE");
  assert.equal(b.status, "STALE");
  assert.equal(b.total, N);
  for (const q of [...(b.topAdvancers ?? []), ...(b.topDecliners ?? [])]) {
    assert.equal(q.timestamp, null, `quote ${q.symbol} must not be stamped with now()`);
  }
});

test("B4-9b. live path, every 10th constituent lacks last_trade_time → STALE, counts unchanged", async () => {
  const b = await withLiveStub((i) => i % 10 === 0);
  assert.equal(b.status, "STALE");
  assert.match(b.reason ?? "", /5 of 50/);
  assert.equal(b.total, N);
  assert.equal(b.advances, 30);
  assert.equal(b.declines, 10);
});

test("B4-9c. live path, all constituents carry last_trade_time → LIVE (existing behaviour preserved)", async () => {
  const b = await withLiveStub(() => false);
  assert.equal(b.status, "LIVE");
  assert.equal(b.coverage, 100);
});
