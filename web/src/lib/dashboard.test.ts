// Run: npm test   (frontend contract: adapter, section loading, backtest views — no browser needed)
import { test } from "node:test";
import assert from "node:assert/strict";
import { toDashboardView } from "./dashboard.ts";
import { loadSection } from "./sectionLoad.ts";
import { analyze } from "./engine/strategy.ts";
import { mockSnapshot } from "./services/mock.ts";
import { getRiskConfig } from "./services/risk/riskConfig.ts";
import { compareRuns } from "./services/backtestScenarios.ts";
import { journal } from "./services/performance/journal.ts";
import { buildPerformanceReport, historicalWarnings } from "./services/performance/report.ts";
import { BacktestEngine } from "./backtestEngine.ts";
import type { Analysis, DataSource, Snapshot } from "./types.ts";
import type { Candle } from "./types.ts";

console.info = () => {};
const T = new Date("2026-10-06T11:00:00+05:30");
const GEN = T.toISOString();
const L = getRiskConfig();
const base = analyze(mockSnapshot("nifty", T), T);
const bank = analyze(mockSnapshot("banknifty", T), T);
const plan = base.candidates[0] ?? bank.candidates[0];
const withSources = (a: Analysis, src: DataSource): Analysis => ({
  ...a,
  snapshot: { ...a.snapshot, sources: Object.fromEntries(Object.entries(a.snapshot.sources).map(([k, v]) => [k, { ...v, source: src }])) as Snapshot["sources"] },
});
const trade: Analysis = { ...withSources(base, "LIVE"), status: "TRADE", plan, blockers: [] };
const wait: Analysis = { ...base, status: "WAIT", plan: null, blockers: ["Event risk: RBI monetary policy detected in 18 articles (today)"] };
const noTrade: Analysis = { ...base, status: "NO TRADE", plan: null, blockers: ["Combined open risk exceeds portfolio open risk limit"] };

test("FE1. TRADE renders: strategy, entry/stop/targets from the backend plan, executable on LIVE data", () => {
  assert.ok(plan, "fixture has a candidate plan");
  const r = toDashboardView(trade, L, GEN).recommendation;
  assert.equal(r.status, "TRADE");
  assert.equal(r.strategy, plan.strategy);
  assert.equal(r.entry, plan.entry);
  assert.equal(r.stopLoss, plan.stop);
  assert.equal(r.target1, plan.target1);
  assert.equal(r.target2, plan.target2);
  assert.equal(r.riskReward, plan.rr);
  assert.equal(r.confidence, plan.score);
  assert.equal(r.executable, true);
  assert.equal(r.noPlanMessage, null);
});
test("FE2. WAIT renders with backend reasons verbatim and no plan fields", () => {
  const r = toDashboardView(wait, L, GEN).recommendation;
  assert.equal(r.status, "WAIT");
  assert.deepEqual(r.reasons, wait.blockers);
  assert.equal(r.noPlanMessage, "No executable trade plan is available.");
  assert.equal(r.executable, false);
});
test("FE3. NO TRADE renders with its reasons", () => {
  const r = toDashboardView(noTrade, L, GEN).recommendation;
  assert.equal(r.status, "NO TRADE");
  assert.deepEqual(r.reasons, ["Combined open risk exceeds portfolio open risk limit"]);
});
test("FE4. null plan renders safely: every plan field null (shown as —), never 0", () => {
  const r = toDashboardView(wait, L, GEN).recommendation;
  for (const k of ["strategy", "entry", "stopLoss", "target1", "target2", "riskReward", "maxLoss", "maxProfit"] as const) assert.equal(r[k], null, k);
  assert.deepEqual(r.breakevens, []);
  assert.equal(r.confidence, base.total, "confidence falls back to the backend total score, not 0");
});
test("FE5. confidence is the backend score, never relabeled or recomputed", () => {
  const v = toDashboardView(wait, L, GEN);
  assert.equal(v.analysis.score, base.total);
  assert.deepEqual(v.factors.map((f) => f.score), base.factors.map((f) => f.score));
  assert.equal(v.factors.reduce((t, f) => t + f.max, 0), 100);
});
for (const src of ["LIVE", "END_OF_DAY", "STALE", "UNAVAILABLE"] as const) {
  test(`FE6. ${src} data: dashboard still renders, freshness shown as ${src}`, () => {
    const v = toDashboardView({ ...withSources(base, src), status: src === "LIVE" ? "TRADE" : "WAIT", plan }, L, GEN);
    assert.equal(v.market.freshness, src);
    assert.equal(v.dataQuality.market, src);
    assert.ok(v.market.spot !== null);
    assert.equal(v.recommendation.strategy, plan.strategy, "analysis + plan still visible");
    assert.equal(v.recommendation.executable, src === "LIVE", "execution only on LIVE TRADE");
  });
}
test("FE7. market status uses explicit IST time, independent of the server timezone", () => {
  assert.equal(toDashboardView(base, L, new Date("2026-10-06T11:00:00+05:30").toISOString()).market.status, "OPEN");
  assert.equal(toDashboardView(base, L, new Date("2026-10-06T16:00:00+05:30").toISOString()).market.status, "CLOSED");
  assert.equal(toDashboardView(base, L, new Date("2026-10-02T11:00:00+05:30").toISOString()).market.status, "CLOSED", "holiday");
});
test("FE8. OI unavailable (historical-style zero OI) → PCR / max pain / support / resistance null, not fabricated", () => {
  const s = base.snapshot;
  const zero = analyze({ ...s, chain: s.chain.map((r) => ({ ...r, call: { ...r.call, oi: 0, chgOi: null }, put: { ...r.put, oi: 0, chgOi: null } })) }, T);
  const v = toDashboardView(zero, L, GEN);
  assert.equal(v.options.oiAvailable, false);
  for (const k of ["pcr", "maxPain", "callOi", "putOi", "callOiChange", "putOiChange"] as const) assert.equal(v.options[k], null, k);
  assert.equal(v.levels.support, null);
  assert.equal(v.levels.resistance, null);
});
test("FE9. missing technicals are null (N/A), never 0", () => {
  const v = toDashboardView({ ...base, snapshot: { ...base.snapshot, indicators: null, technical: null } }, L, GEN);
  for (const k of ["rsi", "vwap", "atrDaily", "ema9", "ema200", "macdHist", "orHigh"] as const) assert.equal(v.technicals[k], null, k);
});
test("FE10. NIFTY and BANK NIFTY produce index-specific views (no stale cross-index values)", () => {
  const n = toDashboardView(base, L, GEN), b = toDashboardView(bank, L, GEN);
  assert.equal(n.index, "nifty");
  assert.equal(b.index, "banknifty");
  assert.notEqual(n.market.spot, b.market.spot);
  assert.notEqual(n.market.expiry === b.market.expiry && n.levels.support === b.levels.support, true);
});
test("FE11. risk panel: approval comes from the backend assessment; labeled when it is a non-recommended candidate", () => {
  const t = toDashboardView(trade, L, GEN).risk;
  assert.equal(t.approval, plan.risk?.allowed ? "RISK APPROVED" : "RISK BLOCKED");
  assert.match(t.basis, /Recommended plan/);
  const w = toDashboardView({ ...wait, candidates: [] }, L, GEN).risk;
  assert.equal(w.approval, "NOT EVALUATED");
  assert.equal(w.lots, null);
  assert.equal(w.limits.riskPerTradePercent, L.riskPerTradePercent);
});
test("FE12. timestamps: last market data and analysis generation time are carried through", () => {
  const v = toDashboardView(base, L, GEN);
  assert.equal(v.timestamps.analysisGeneratedAt, GEN);
  assert.ok(v.timestamps.lastMarketData);
});

// --- section loading (API 200 / partial / 500 / timeout / empty) ---
test("FE13. section load: success returns data", async () => assert.deepEqual(await loadSection(async () => ({ spot: 1 })), { ok: true, data: { spot: 1 } }));
test("FE14. section load: thrown 500-style error degrades only that section", async () => {
  const r = await loadSection(async () => { throw new Error("HTTP 500 option chain"); });
  assert.deepEqual(r, { ok: false, error: "HTTP 500 option chain" });
});
test("FE15. section load: timeout yields an explicit error, never a hanging page", async () => {
  const r = await loadSection(() => new Promise(() => {}), 20);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /timed out/);
});
test("FE16. section load: empty response is reported as empty", async () => assert.deepEqual(await loadSection(async () => null), { ok: false, error: "empty response" }));
test("FE17. partial response: missing sub-values stay null in the view", () => {
  const partial = { ...base, snapshot: { ...base.snapshot, prevClose: null, ivPercentile: null } };
  const v = toDashboardView(partial, L, GEN);
  assert.equal(v.market.change, null);
  assert.equal(v.market.changePercent, null);
  assert.equal(v.options.ivPercentile, null);
});

// --- backtest frontend data ---
function sessions(days: number): Candle[] {
  const out: Candle[] = [];
  let p = 23000;
  for (let k = 0; out.length < days * 25; k++) {
    const day = new Date(Date.parse("2026-09-01T00:00:00Z") + k * 86_400_000);
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
    const ymd = day.toISOString().slice(0, 10);
    for (let i = 0; i < 25; i++) {
      const n = out.length;
      p += Math.sin(n / 7) * 18 + Math.cos(n / 3) * 9 + 2.5;
      out.push({ timestamp: new Date(Date.parse(`${ymd}T09:15:00+05:30`) + i * 900_000).toISOString(), open: p - 5, high: p + 12, low: p - 12, close: p, volume: null });
    }
  }
  return out;
}
const cs = sessions(40);
const run = new BacktestEngine().run({ index: "nifty", timeframe: "15m", startDate: "2026-09-01", endDate: "2026-10-31", startingCapital: 1_000_000 }, cs, [], { candleSource: "MOCK" });
test("FE18. run list: one comparison row per run with metrics and data quality", () => {
  const c = compareRuns([{ label: "A", result: run }]);
  const r = c.rows[0];
  assert.equal(r.label, "A");
  for (const k of ["trades", "winRate", "netPnL", "returnPercent", "profitFactor", "expectancy", "averageR", "maxDrawdownPercent", "sharpe", "sortino", "validation", "dataQuality"]) assert.ok(k in r, k);
});
test("FE19. run detail: equity curve points carry equity, drawdown, realized and unrealized P&L", () => {
  const p = buildPerformanceReport(run);
  assert.ok(p.equity.length > 0);
  for (const k of ["timestamp", "equity", "drawdown", "realizedPnL", "unrealizedPnL"]) assert.ok(k in p.equity[0], k);
});
test("FE20. trades: journal rows expose entry/exit time, direction, gross, slippage, costs, net, R, exit reason", () => {
  const rows = journal(run);
  assert.ok(rows.length > 0);
  for (const k of ["timestamp", "exitTimestamp", "strategy", "direction", "entry", "exit", "quantity", "grossPnL", "costs", "netPnL", "rMultiple", "exitReason"]) assert.ok(k in rows[0], k);
  assert.equal(rows[0].costs.status, "NOT MODELED (slippage only)", "legacy run: costs labeled, not invented");
});
test("FE21. data-quality warnings: model-derived options always warned; synthetic OI/breadth warned", () => {
  const w = historicalWarnings(run);
  assert.ok(w.includes("HISTORICAL SIMULATION — NOT LIVE MARKET DATA"));
  assert.ok(w.some((x) => /model-derived/.test(x)));
  assert.ok(w.some((x) => /OI is synthetic/.test(x)));
});
test("FE22. data quality labels pass through: MODEL_DERIVED / NOT_AVAILABLE / HISTORICAL_MEASURED", () => {
  const sc = { ...run.scorecard!, spot: { source: "x", quality: "HISTORICAL_MEASURED" as const }, oi: { source: "none", quality: "NOT_AVAILABLE" as const } };
  const r = compareRuns([{ label: "X", result: { ...run, scorecard: sc } }]).rows[0];
  assert.equal(r.dataQuality!.options, "MODEL_DERIVED");
  assert.equal(r.dataQuality!.oi, "NOT_AVAILABLE");
  assert.equal(r.dataQuality!.spot, "HISTORICAL_MEASURED");
});
