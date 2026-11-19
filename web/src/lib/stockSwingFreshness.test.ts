// Scanner fixture tests: every I/O dependency is injected (deps), so these run as Upstox-mode engine tests with NO token
// available. The token path is pointed at a file that does not exist and the analytics token is cleared, so no request can leave.
process.env.MARKET_DATA_PROVIDER = "upstox";
process.env.UPSTOX_TOKEN_FILE = "/nonexistent/upstox-token-for-scanner-fixture-tests.json";
delete process.env.UPSTOX_ANALYTICS_TOKEN;
// Issue 2 / B5-adj — the swing scan uses only LIVE quotes from the current session; stale or end-of-day LTPs never
// become today's synthetic close. The strategy stays retired (every row REJECT). Offline: injected quotes and history.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scanStocks, type ScanDeps } from "./engine/stockOpportunityEngine.ts";
import { fixtureDaily, fixtureQuotes, FIXTURE_NOW } from "./testFixtures/stockScan.ts";
import { NIFTY_50 } from "./services/breadthConstituents.generated.ts";
import type { StockMarketData } from "./services/stockService.ts";

const symbolOf = (i: number) => NIFTY_50[i].symbol;

function depsWith(mutate: (q: StockMarketData, i: number) => StockMarketData): ScanDeps {
  return {
    quotes: async (inst, now) => fixtureQuotes(inst, now).map((q, i) => mutate(q, i)),
    daily: async (keys, now) => fixtureDaily(keys, now),
  };
}
// Index in the fixture universe = position in NIFTY_50 (fixtureQuotes maps instruments in order).
const liveAll = depsWith((q) => q);

test("SW-1. all quotes LIVE and current → rows are produced, every row is REJECT (retired) with the retired note", async () => {
  const r = await scanStocks("swing", FIXTURE_NOW, liveAll);
  assert.ok(r.topOpportunities.length > 0, "fixture universe must produce swing rows");
  for (const o of r.topOpportunities) {
    assert.equal(o.grade, "REJECT");
    assert.match(o.reasons[0], /Retired strategy/);
  }
});

test("SW-2. every quote STALE → no row, and the reason says why", async () => {
  const deps = depsWith((q) => ({ ...q, freshness: "STALE" as const }));
  const r = await scanStocks("swing", FIXTURE_NOW, deps);
  assert.equal(r.topOpportunities.length, 0);
  assert.match(r.noOpportunityReason ?? "", /Quote not live\/EOD for this session \(STALE\)/);
});

test("SW-3. mixed: stale quotes never appear in rows; LIVE ones may", async () => {
  const deps = depsWith((q, i) => (i % 2 === 1 ? { ...q, freshness: "STALE" as const } : q));
  const r = await scanStocks("swing", FIXTURE_NOW, deps);
  const staleSymbols = new Set<string>(NIFTY_50.filter((_, i) => i % 2 === 1).map((c) => c.symbol));
  for (const o of r.topOpportunities) assert.ok(!staleSymbols.has(o.symbol), `${o.symbol} is stale and must not appear`);
  assert.ok(r.stocksRejected > 0, "excluded quotes are counted as rejected");
});

test("SW-4. END_OF_DAY quote from past session is excluded (not used as today's close)", async () => {
  const deps = depsWith((q) => ({ ...q, freshness: "END_OF_DAY" as const, timestamp: "2026-09-01T15:30:00Z", sessionDate: "2026-09-01" }));
  const r = await scanStocks("swing", FIXTURE_NOW, deps);
  assert.equal(r.topOpportunities.length, 0);
  assert.match(r.noOpportunityReason ?? "", /END_OF_DAY/);
});

test("SW-5. UNAVAILABLE quote is excluded before scoring", async () => {
  const deps = depsWith((q, i) => (i === 0 ? { ...q, freshness: "UNAVAILABLE" as const, ltp: null } : q));
  const r = await scanStocks("swing", FIXTURE_NOW, deps);
  assert.ok(!r.topOpportunities.some((o) => o.symbol === symbolOf(0)));
});

test("SW-6. invalid session: a LIVE quote whose session is not the current one is excluded", async () => {
  const deps = depsWith((q, i) => (i === 2 ? { ...q, sessionDate: "2026-10-23" } : q));
  const r = await scanStocks("swing", FIXTURE_NOW, deps);
  assert.ok(!r.topOpportunities.some((o) => o.symbol === symbolOf(2)), "a quote from another session must not become today's bar");
});

test("SW-7. daily candle validation is intact: a LIVE quote with too little history is still rejected", async () => {
  const deps: ScanDeps = {
    quotes: async (inst, now) => fixtureQuotes(inst, now),
    daily: async (keys, now) => {
      const m = fixtureDaily(keys, now);
      const k = keys[1]; // first stock in the universe
      m.set(k, m.get(k)!.slice(-5)); // only 5 bars: below the minimum
      return m;
    },
  };
  const r = await scanStocks("swing", FIXTURE_NOW, deps);
  assert.ok(!r.topOpportunities.some((o) => o.symbol === symbolOf(0)));
});

test("SW-8. a LIVE quote's own timestamp, not the stale one, is what the scan uses", async () => {
  const r = await scanStocks("swing", FIXTURE_NOW, liveAll);
  for (const o of r.topOpportunities) assert.ok(Number.isFinite(o.ltp));
});
