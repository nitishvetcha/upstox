// Issue 2 / engineering audit — trade risk: sizing arithmetic checked by hand, each rejection reason, and non-finite inputs.
// Offline and deterministic: fixed clock, explicit config, mock snapshot with live sources.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateTradeRisk } from "./riskService.ts";
import { DEFAULT_RISK_CONFIG, validateRiskConfig, type RiskConfig } from "./riskConfig.ts";
import { mockSnapshot } from "../mock.ts";
import type { Snapshot, TradePlan } from "../../types.ts";

const NOW = new Date("2026-10-05T07:00:00Z");
const CFG: Partial<RiskConfig> = { accountCapital: 100_000 }; // 1% = ₹1,000 per trade; open-risk 3% = ₹3,000; daily 2% = ₹2,000
const LOT = 75;

function snapshot(over: (s: Snapshot) => void = () => {}): Snapshot {
  const s = structuredClone(mockSnapshot("nifty", NOW));
  for (const k of Object.keys(s.sources) as (keyof Snapshot["sources"])[]) s.sources[k] = { ...s.sources[k], source: "LIVE", provider: "UPSTOX", fetchedAt: NOW.toISOString() };
  s.lotSize = LOT;
  s.fallbackReason = null;
  over(s);
  return s;
}
function plan(over: Partial<TradePlan> = {}): TradePlan {
  return {
    strategy: "Long Call", legs: [], credit: false, entry: 10, entryZone: [9.9, 10.1], stop: 8, target1: 15, target2: 20,
    rr: 2.5, maxLoss: 10, maxProfit: null, breakevens: [], score: 70, rejected: null, ...over,
  } as TradePlan;
}
const risk = (p: TradePlan, s = snapshot(), inputs?: Parameters<typeof evaluateTradeRisk>[2]) => evaluateTradeRisk(p, s, inputs, CFG, NOW);

test("RK-1. sizing on net worst-case risk: 2.02 legacy per unit, 176.96 net per lot, 70.80 fixed charges, 5 lots", () => {
  const r = risk(plan());
  assert.equal(r.riskPerUnit, 2.02, "legacy display value: stop distance 2 × (1 + 1% slippage)");
  assert.equal(r.riskPerLot, 151.5, "legacy display value kept for backtests");
  // Net: worst fills 10.10 entry and 7.76 stop (2% gap) → 2.34 × 75 = 175.50, plus 1.46 of percentage charges (0.15% STT, 0.03553% NSE).
  assert.ok(Math.abs((r.netRiskPerLot ?? 0) - 176.96) < 0.05, `net per lot ${r.netRiskPerLot}`);
  assert.equal(r.fixedCostsInr, 70.8, "₹30 × 2 orders + 18% GST (Plus research fallback)");
  assert.equal(r.entryFill, 10.1);
  assert.equal(r.worstStopFill, 7.76);
  assert.equal(r.lots, 5, "min(floor((1000 − 70.8)/176.96)=5, capital 26, maxLots 5)");
  assert.equal(r.quantity, 375);
  assert.ok(Math.abs(r.totalRisk - 956) <= 1, `total risk ${r.totalRisk}`);
  assert.equal(r.allowed, true);
  assert.deepEqual(r.reasons, []);
});

test("RK-2. a position that rounds to zero lots within capital does not reject the valid recommendation", () => {
  const r = risk(plan({ entry: 100, stop: 60, target1: 180, maxLoss: 100, rr: 2 }));
  assert.equal(r.lots, 0);
  assert.equal(r.allowed, true, "valid market trade plan is approved independently of account capital");
  assert.ok(!r.reasons.includes("ZERO_LOTS"), "ZERO_LOTS does not block recommendation eligibility");
  assert.ok(r.portfolioReasons?.includes("ZERO_LOTS"));
});

test("RK-3. NaN entry, stop, target and reward-to-risk are each rejected (NaN passes ordinary comparisons)", () => {
  const entry = risk(plan({ entry: Number.NaN }));
  assert.ok(entry.reasons.includes("INVALID_ENTRY"));
  assert.equal(entry.allowed, false);
  assert.equal(entry.totalRisk, 0);
  const stop = risk(plan({ stop: Number.NaN }));
  assert.ok(stop.reasons.includes("INVALID_STOP"));
  assert.equal(stop.allowed, false);
  const target = risk(plan({ target1: Number.NaN }));
  assert.ok(target.reasons.includes("INVALID_TARGET"));
  assert.equal(target.allowed, false);
  const rr = risk(plan({ rr: Number.NaN }));
  assert.ok(rr.reasons.includes("INSUFFICIENT_RR"), "NaN reward-to-risk must not pass the minimum");
  assert.equal(rr.allowed, false);
});

test("RK-4. reward-to-risk below the minimum (1.2) is rejected", () => {
  const r = risk(plan({ rr: 1.0 }));
  assert.ok(r.reasons.includes("INSUFFICIENT_RR"));
  assert.equal(r.allowed, false);
});

test("RK-5. stop on the wrong side of entry (no positive risk) is rejected", () => {
  const r = risk(plan({ entry: 10, stop: 12 }));
  assert.ok(r.reasons.includes("INVALID_STOP"));
  assert.equal(r.allowed, false);
});

test("RK-6. unknown lot size is rejected, never assumed to be 1", () => {
  const r = risk(plan(), snapshot((s) => { s.lotSize = null; }));
  assert.ok(r.reasons.includes("UNKNOWN_LOT_SIZE"));
  assert.equal(r.allowed, false);
});

test("RK-7. daily loss at the 2% limit does not reject market recommendation", () => {
  const r = risk(plan(), snapshot(), { realizedDailyLoss: 2000 });
  assert.equal(r.allowed, true, "market recommendation remains eligible");
  assert.equal(r.status, "APPROVED");
  assert.ok(!r.reasons.includes("DAILY_LOSS_LIMIT"));
  assert.ok(r.portfolioReasons?.includes("DAILY_LOSS_LIMIT"));
  assert.equal(r.portfolioAllowed, false);
});

test("RK-8. combined open risk above 3% of capital does not reject market recommendation", () => {
  const r = risk(plan(), snapshot(), { existingOpenRisk: 2900 });
  assert.equal(r.allowed, true, "market recommendation remains eligible");
  assert.equal(r.status, "APPROVED");
  assert.ok(!r.reasons.includes("OPEN_RISK_LIMIT"));
  assert.ok(r.portfolioReasons?.includes("OPEN_RISK_LIMIT"));
  assert.equal(r.portfolioAllowed, false);
});

test("RK-9. the concurrent-position limit (3) does not reject market recommendation", () => {
  const r = risk(plan(), snapshot(), { currentOpenPositions: 3 });
  assert.equal(r.allowed, true, "market recommendation remains eligible");
  assert.equal(r.status, "APPROVED");
  assert.ok(!r.reasons.includes("MAX_CONCURRENT_POSITIONS"));
  assert.ok(r.portfolioReasons?.includes("MAX_CONCURRENT_POSITIONS"));
  assert.equal(r.portfolioAllowed, false);
});

test("RK-10. EXTREME event risk blocks new trades", () => {
  const r = risk(plan(), snapshot((s) => { s.news.detail = { ...s.news.detail!, eventRisk: { level: "EXTREME", status: "DETECTED", reason: "x", events: [] } } as typeof s.news.detail; }));
  assert.ok(r.reasons.includes("EXTREME_EVENT_RISK"));
});

test("RK-11. end-of-day market data is never a live execution (END_OF_DAY_DATA)", () => {
  const r = risk(plan(), snapshot((s) => { s.sources.market = { ...s.sources.market, source: "END_OF_DAY" }; }));
  assert.ok(r.reasons.includes("END_OF_DAY_DATA"));
  assert.ok(!r.reasons.includes("STALE_PRICE"), "END_OF_DAY must not produce STALE_PRICE");
  assert.equal(r.allowed, false);
});

test("RK-12. a leg with bid-ask wider than 5% of LTP is rejected (WIDE_BID_ASK)", () => {
  const s = snapshot((snap) => {
    const row = snap.chain[0];
    row.call = { ...row.call, ltp: 100, bid: 90, ask: 100 };
  });
  const r = risk(plan({ legs: [{ side: "BUY", type: "CE", strike: snap0Strike(s), ltp: 100 }] }), s);
  assert.ok(r.reasons.includes("WIDE_BID_ASK"));
});
function snap0Strike(s: Snapshot) { return s.chain[0].strike; }

test("RK-13. credit plan: sell at 5, buy back at 2 (target), stop at 6; net worst risk per lot is the stop distance plus gap and charges", () => {
  const r = risk(plan({ credit: true, entry: 5, stop: 6, target1: 2, maxLoss: 1, rr: 3 }));
  assert.equal(r.entryFill, 4.95, "sold at 5 less 1% adverse slippage");
  assert.equal(r.worstStopFill, 6.18, "bought back at 6 plus 1% exit slippage and 2% gap");
  assert.equal(r.lots, 5, "risk allows 10 lots; the lot cap of 5 binds");
  assert.equal(r.allowed, true);
  assert.ok((r.netRewardRatio ?? 0) > 2, `net reward ratio ${r.netRewardRatio}`);
});

test("RK-14. missing open-risk and loss ledgers produce warnings, not rejections", () => {
  const r = risk(plan());
  assert.ok(r.warnings.some((w) => /portfolio positions/.test(w)));
  assert.ok(r.warnings.some((w) => /trade ledger/.test(w)));
  assert.equal(r.allowed, true);
});

test("RK-15. invalid risk configuration throws rather than sizing with a bad value", () => {
  const ok = DEFAULT_RISK_CONFIG;
  assert.throws(() => validateRiskConfig({ ...ok, accountCapital: Number.NaN }));
  assert.throws(() => validateRiskConfig({ ...ok, riskPerTradePercent: 0 }));
  assert.throws(() => validateRiskConfig({ ...ok, stopGapPercent: -1 }), /stopGapPercent/);
  assert.throws(() => validateRiskConfig({ ...ok, costs: { ...ok.costs, sttRate: Number.NaN } }), /sttRate/);
});
