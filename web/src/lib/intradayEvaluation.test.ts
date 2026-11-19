import { test } from "node:test";
import assert from "node:assert/strict";
import { netTrade, groupStats, evaluateIntraday, sessionBootstrap, type EvalTrade } from "./intradayEvaluation.ts";
import type { PaperOpportunity } from "./services/paperOpportunityStore.ts";

const P = (o: Partial<PaperOpportunity>) => ({
  id: Math.random().toString(36), provenance: "LIVE_COLLECTOR", instrumentType: "STOCK", direction: "BULLISH",
  createdAt: "2026-10-26T05:00:00.000Z", status: "EOD_EXIT", entry: 1000, stop: 990, riskPerUnit: 10, exitPrice: 1010, realizedR: 1, ...o,
}) as PaperOpportunity;

test("net R by hand: long 1000→1010, stop 990, ₹1L notional", () => {
  // qty 100; fills 1000.50 / 1009.495 → ₹899.50; charges buy ≈ ₹30.23, sell ≈ ₹52.51; risk ₹1,000
  const t = netTrade(P({}));
  assert.ok(Math.abs(t.netR - 0.8168) < 0.001, `netR ${t.netR}`);
  assert.equal(t.grossR, 1);
});

test("short: STT is charged on the opening SELL, and slippage works against the short", () => {
  const t = netTrade(P({ direction: "BEARISH", entry: 1000, stop: 1010, exitPrice: 990, realizedR: 1 }));
  assert.equal(t.side, "SHORT");
  assert.ok(t.netR < 1 && t.netR > 0.75);
});

test("same price move costs more R when the stop is tighter", () => {
  const wide = netTrade(P({ stop: 950, riskPerUnit: 50, exitPrice: 1050, realizedR: 1 }));
  const tight = netTrade(P({ stop: 995, riskPerUnit: 5, exitPrice: 1005, realizedR: 1 }));
  assert.ok(tight.costR > wide.costR * 5);
});

test("eligibility: fixtures, pre-start, unpriced and open trades are excluded and counted", () => {
  const r = evaluateIntraday([
    P({}), P({ provenance: undefined }), P({ createdAt: "2026-10-23T05:00:00.000Z" }),
    P({ status: "EOD_UNPRICED", exitPrice: null, realizedR: null }), P({ status: "OPEN" }),
  ]);
  assert.equal(r.eligible, 1);
  assert.equal(Object.values(r.excluded).reduce((a, b) => a + b, 0), 4);
});

const mk = (n: number, netR: (i: number) => number, sessions = 30): EvalTrade[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${i}`, session: `s${Math.floor(i / Math.ceil(n / sessions))}`, side: "LONG", grossR: netR(i), netR: netR(i), costR: 0 }));

test("verdicts follow the frozen gates", () => {
  assert.equal(groupStats(mk(40, (i) => (i % 2 ? 0.6 : -0.4))).verdict, "INSUFFICIENT_SAMPLE");
  assert.equal(groupStats(mk(200, (i) => (i % 2 ? 0.8 : -0.4))).verdict, "POSITIVE");
  assert.equal(groupStats(mk(200, (i) => (i % 2 ? 0.3 : -0.6))).verdict, "NEGATIVE");
  assert.equal(groupStats(mk(200, (i) => (i % 3 === 0 ? 0.9 : -0.45))).verdict, "INCONCLUSIVE"); // mean ≈ 0
  assert.equal(groupStats(mk(36, (i) => (i % 4 ? -0.6 : 0.3), 12)).verdict, "NEGATIVE", "convincing negative is reported even below 150");
});

test("session bootstrap is reproducible and needs ≥10 sessions", () => {
  const ts = mk(60, (i) => Math.sin(i));
  assert.deepEqual(sessionBootstrap(ts), sessionBootstrap(ts));
  assert.equal(sessionBootstrap(mk(90, () => 1, 9)), null);
});
