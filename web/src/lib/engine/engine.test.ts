// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, recommendationOfTheDay, straddle } from "./strategy.ts";
import { chainMetrics } from "./analysis.ts";
import { mockSnapshot } from "../services/mock.ts";
import type { Snapshot } from "../types.ts";

const MIDDAY = new Date("2026-10-05T07:00:00Z"); // Mon 12:30 IST
const q = (ltp: number, oi: number) => ({ ltp, bid: ltp, ask: ltp, oi, chgOi: 0, volume: oi, iv: 12, delta: 0.5 });

test("straddle entry and exits come from the TOTAL premium", () => {
  const s = mockSnapshot("nifty", MIDDAY);
  const atm = chainMetrics(s).atmStrike;
  const row = s.chain.find((r) => r.strike === atm)!;
  const p = straddle(s, atm)!;
  const total = row.call.ltp + row.put.ltp;
  assert.ok(Math.abs(p.entry - total) < 0.01);
  assert.ok(Math.abs(p.stop - total * 0.8) < 0.01);
  assert.ok(p.target1 > p.entry && p.target2 > p.target1, "targets must sit above entry");
});

test("debit spread risk math", () => {
  const a = analyze(mockSnapshot("nifty", MIDDAY), MIDDAY);
  const sp = a.candidates.find((c) => c.strategy === "Bull Call Spread")!;
  const [long, short] = sp.legs;
  const width = short.strike - long.strike;
  assert.equal(sp.maxLoss, sp.entry);
  assert.ok(Math.abs(sp.maxProfit! - (width - sp.entry)) < 0.01);
  assert.ok(Math.abs(sp.breakevens[0] - (long.strike + sp.entry)) < 0.01);
});

const TEST_RISK = { accountCapital: 500_000 };

test("mock market: NIFTY trades, BANK NIFTY waits, NIFTY is recommendation of the day", () => {
  const n = analyze(mockSnapshot("nifty", MIDDAY), MIDDAY, TEST_RISK);
  const b = analyze(mockSnapshot("banknifty", MIDDAY), MIDDAY, TEST_RISK);
  assert.equal(n.status, "TRADE");
  assert.ok(n.plan && n.plan.rr >= 1.2);
  assert.equal(b.status, "WAIT");
  assert.equal(b.plan, null);
  assert.equal(recommendationOfTheDay([b, n]).snapshot.index, "nifty");
});

test("stale data never produces a trade", () => {
  const s = mockSnapshot("nifty", MIDDAY);
  const later = new Date(MIDDAY.getTime() + 30 * 60_000);
  const a = analyze(s, later, TEST_RISK);
  assert.equal(a.status, "NO TRADE");
  assert.ok(a.blockers.includes("Market data is stale"));
});

test("no aggressive trade in the opening 15 minutes", () => {
  const open = new Date("2026-10-05T03:50:00Z"); // 09:20 IST
  assert.equal(analyze(mockSnapshot("nifty", open), open, TEST_RISK).status, "WAIT");
});

test("event risk without supporting history waits", () => {
  const s: Snapshot = mockSnapshot("nifty", MIDDAY);
  s.news = { ...s.news, eventRisk: "RBI policy decision today" };
  const a = analyze(s, MIDDAY);
  assert.equal(a.regime, "EVENT RISK");
  assert.equal(a.status, "WAIT");
  assert.equal(a.plan, null);
});

test("max pain, PCR, support and resistance on a hand-built chain", () => {
  const s = mockSnapshot("nifty", MIDDAY);
  s.spot = 100;
  s.chain = [
    { strike: 90, call: q(11, 10), put: q(1, 500) },
    { strike: 100, call: q(4, 100), put: q(4, 100) },
    { strike: 110, call: q(1, 400), put: q(11, 10) },
  ];
  const m = chainMetrics(s);
  assert.equal(m.support, 90);
  assert.equal(m.resistance, 110);
  assert.equal(m.maxPain, 100);
  assert.ok(Math.abs(m.pcrOi! - 610 / 510) < 1e-9);
});

test("END_OF_DAY market quotes produce WAIT / NO TRADE and block trade execution", () => {
  const afterHours = new Date("2026-10-05T16:51:00+05:30");
  const s = mockSnapshot("nifty", MIDDAY);
  s.sources.market = { source: "END_OF_DAY", provider: "UPSTOX", fetchedAt: afterHours.toISOString() };
  if (s.breadth) s.breadth.status = "END_OF_DAY";

  const a = analyze(s, afterHours, TEST_RISK);
  assert.ok(a.status === "WAIT" || a.status === "NO TRADE", `status must be WAIT or NO TRADE, got ${a.status}`);
  assert.equal(a.plan, null, "plan must be null for execution on END_OF_DAY quotes");
  assert.ok(a.blockers.some((b) => b.includes("END_OF_DAY") || b.includes("Market closed")), "blockers must indicate END_OF_DAY market close");
});
