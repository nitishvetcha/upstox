// Run: npm test   (deterministic fixtures; expected values computed by hand in comments)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  annualizedReturn, calmar, coreMetrics, dailyReturns, drawdownAnalytics, exitReasonStats, groupStats, holdingAnalysis,
  monthlyStats, rDistribution, sharpe, sortino,
} from "./performance/metrics.ts";
import { buildPerformanceReport, PERFORMANCE_LABEL } from "./performance/report.ts";
import { journal, legsCsv, tradesCsv, TRADE_COLUMNS, LEG_COLUMNS } from "./performance/journal.ts";
import { BacktestEngine, rejectionCode } from "../backtestEngine.ts";
import { calculateTradePnL } from "../paperEngine.ts";
import type { BacktestResult, BacktestTrade, EquityCurvePoint } from "../backtestTypes.ts";
import type { Candle } from "../types.ts";

console.info = () => {};
const CAP = 100_000;

// --- hand fixtures ---
let n = 0;
function trade(p: Partial<BacktestTrade> & { pnl: number; risk?: number }): BacktestTrade {
  n++;
  const risk = p.risk ?? 1000;
  return {
    tradeId: `t${n}`, index: "nifty", strategy: "Long Call", signalTimestamp: "2026-09-02T04:00:00.000Z", entryTimestamp: "2026-09-02T04:00:00.000Z",
    exitTimestamp: "2026-09-02T05:00:00.000Z", expiry: "2026-09-08", credit: false,
    legs: [{ side: "BUY", type: "CE", strike: 23000, entryPrice: 100, exitPrice: 100 + p.pnl / 65, entryMid: 99, exitMid: 101 + p.pnl / 65, quantity: 65 }],
    entryPrice: 100, exitPrice: 100 + p.pnl / 65, quantity: 65, lots: 1, lotSize: 65, stopLoss: 90, target1: 115, target2: 130,
    riskAmount: risk, riskReward: 1.5, realizedPnL: p.pnl, pnlPercent: 0, rMultiple: Math.round((p.pnl / risk) * 100) / 100, slippageCost: 130,
    exitReason: p.pnl > 0 ? "TARGET" : "STOP_LOSS", signalScore: 70, confidence: 70, regime: "BULLISH", ...p,
  } as BacktestTrade;
}
const eq = (vals: [string, number][]): EquityCurvePoint[] => {
  let peak = CAP;
  return vals.map(([ts, e]) => {
    peak = Math.max(peak, e);
    return { timestamp: ts, equity: e, cash: e, realizedPnL: e - CAP, unrealizedPnL: 0, drawdown: peak - e, drawdownPercent: Math.round(((peak - e) / peak) * 10000) / 100, openRisk: 0, openPositions: 0 };
  });
};
const four = [trade({ pnl: 3000 }), trade({ pnl: -1000 }), trade({ pnl: 2000, risk: 500 }), trade({ pnl: -2000 })];

test("1. net P&L = Σ realized P&L", () => assert.equal(coreMetrics(four, CAP).netPnL, 2000));
test("2. return % = net / initial capital", () => assert.equal(coreMetrics(four, CAP).totalReturnPercent, 2));
test("3. win rate = wins / trades (breakeven counted separately)", () => {
  const c = coreMetrics([...four, trade({ pnl: 0 })], CAP);
  assert.equal(c.winRate.value, 40);
  assert.equal(c.breakevenTrades, 1);
});
test("4. profit factor = gross profit / gross loss (5000 / 3000)", () => assert.equal(coreMetrics(four, CAP).profitFactor.value, 1.67));
test("5. expectancy = net / trades (2000 / 4)", () => assert.equal(coreMetrics(four, CAP).expectancy.value, 500));
test("6. average R and median R (R = 3, -1, 4, -2)", () => {
  const c = coreMetrics(four, CAP);
  assert.equal(c.averageR.value, 1);
  assert.equal(c.medianR.value, 1); // median of -2,-1,3,4 = (-1+3)/2
});

const ddCurve = eq([["2026-09-01T10:00:00Z", 100000], ["2026-09-02T10:00:00Z", 105000], ["2026-09-03T10:00:00Z", 101800], ["2026-09-04T10:00:00Z", 103000], ["2026-09-07T10:00:00Z", 106000]]);
test("7. maximum drawdown from the equity curve (105,000 → 101,800 = 3,200)", () => {
  const d = drawdownAnalytics(ddCurve, CAP);
  assert.equal(d.maxDrawdown, 3200);
  assert.equal(d.maxDrawdownPeriod!.peakEquity, 105000);
  assert.equal(d.maxDrawdownPeriod!.troughEquity, 101800);
});
test("8. drawdown % and recovery (3.05%, recovered after 3 trading days, 1 period)", () => {
  const d = drawdownAnalytics(ddCurve, CAP);
  assert.equal(d.maxDrawdownPercent, 3.05);
  assert.equal(d.maxDrawdownPeriod!.recoveredAt, "2026-09-07T10:00:00Z");
  assert.equal(d.maxDrawdownPeriod!.durationTradingDays, 3); // Sep 3, 4, 7
  assert.equal(d.periods, 1);
  assert.equal(d.currentDrawdown, 0);
});

const R = [0.01, -0.005, 0.02, 0, 0.01];
test("9. Sharpe = mean / sample sd of periodic returns, ×√252 (0.007 / 0.0097468 = 0.7182)", () => {
  const s = sharpe(R);
  assert.equal(s.period.value, 0.7182);
  assert.equal(s.annualized.value, Math.round(0.007 / Math.sqrt(0.00038 / 4) * Math.sqrt(252) * 100) / 100);
});
test("10. Sortino = mean / downside deviation (0.007 / √(0.000025/5) = 3.1305)", () => {
  assert.equal(sortino(R).period.value, 3.1305);
});
test("11. Calmar = annualized return / |max DD %| (10% / 5% = 2)", () => {
  const a = annualizedReturn(100000, 110000, 252);
  assert.equal(a.value, 10);
  assert.equal(calmar(a, 5).value, 2);
});

test("12. multi-leg trades keep their legs; leg P&L sums to the trade P&L", () => {
  const condor = trade({
    pnl: 0, strategy: "Iron Condor", credit: true, quantity: 65,
    legs: [
      { side: "SELL", type: "CE", strike: 23300, entryPrice: 40, exitPrice: 20, entryMid: 40.4, exitMid: 19.8, quantity: 65 },
      { side: "BUY", type: "CE", strike: 23500, entryPrice: 15, exitPrice: 6, entryMid: 14.85, exitMid: 6.06, quantity: 65 },
      { side: "SELL", type: "PE", strike: 22700, entryPrice: 38, exitPrice: 25, entryMid: 38.4, exitMid: 24.75, quantity: 65 },
      { side: "BUY", type: "PE", strike: 22500, entryPrice: 14, exitPrice: 9, entryMid: 13.86, exitMid: 9.09, quantity: 65 },
    ],
  });
  // (40-20) - (15-6) + (38-25) - (14-9) = 20 - 9 + 13 - 5 = 19 per unit → ₹1,235
  condor.realizedPnL = 1235;
  const j = journal({ runId: "r" } as BacktestResult, [condor])[0];
  assert.equal(j.legs.length, 4);
  assert.equal(j.legs.reduce((a, l) => a + l.pnl!, 0), 1235);
  assert.equal(j.direction, "NEUTRAL (SHORT VOLATILITY)");
  assert.equal(j.legs[0].instrument, "NIFTY 23300 CE 2026-09-08");
});
test("13. holding duration from actual timestamps, bucketed", () => {
  const h = holdingAnalysis([
    trade({ pnl: 1, entryTimestamp: "2026-09-02T04:00:00Z", exitTimestamp: "2026-09-02T04:10:00Z" }),
    trade({ pnl: 1, entryTimestamp: "2026-09-02T04:00:00Z", exitTimestamp: "2026-09-02T04:45:00Z" }),
    trade({ pnl: 1, entryTimestamp: "2026-09-02T04:00:00Z", exitTimestamp: "2026-09-02T09:00:00Z" }),
  ]);
  assert.deepEqual([h.minimum, h.median, h.maximum], [10, 45, 300]);
  assert.deepEqual(h.buckets.map((b) => b.count), [1, 0, 1, 0, 0, 1]);
});
test("14. exit reason frequencies", () => {
  const e = exitReasonStats([...four, trade({ pnl: 5, exitReason: "EXPIRY" }), trade({ pnl: 5, exitReason: "END_OF_BACKTEST" })]);
  assert.deepEqual([e.target, e.stopLoss, e.expiry, e.forced], [2, 2, 1, 1]);
  assert.equal(e.stopLossPercent, 33.33);
});
test("15. strategy grouping lists only strategies present", () => {
  const g = groupStats([...four, trade({ pnl: 800, strategy: "Bear Put Spread" })], (t) => t.strategy, CAP);
  assert.deepEqual(g.map((x) => x.key).sort(), ["Bear Put Spread", "Long Call"]);
  assert.equal(g.find((x) => x.key === "Long Call")!.netPnL, 2000);
});
test("16. regime grouping: trade share and P&L contribution", () => {
  const g = groupStats([trade({ pnl: 3000, regime: "BULLISH" }), trade({ pnl: -1000, regime: "RANGE" })], (t) => t.regime, CAP);
  const bull = g.find((x) => x.key === "BULLISH")!;
  assert.equal(bull.tradeSharePercent, 50);
  assert.equal(bull.pnlContributionPercent, 150); // 3000 / |2000|
});
test("17. monthly grouping by IST exit month, partial months flagged", () => {
  const m = monthlyStats(
    [trade({ pnl: 100, exitTimestamp: "2026-09-30T18:45:00Z" }), trade({ pnl: -50, exitTimestamp: "2026-09-15T05:00:00Z" })],
    CAP, "2026-09-10", "2026-10-05",
  );
  assert.deepEqual(m.map((x) => [x.month, x.tradeCount, x.partial]), [["2026-09", 1, true], ["2026-10", 1, true]]); // 00:15 IST Oct 1
});

// --- engine fixture: deterministic intraday sessions ---
function sessions(days: number, start = 23000): Candle[] {
  const out: Candle[] = [];
  let p = start;
  for (let k = 0; out.length < days * 25; k++) {
    const day = new Date(Date.parse("2026-09-01T00:00:00Z") + k * 86_400_000);
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
    const ymd = day.toISOString().slice(0, 10);
    for (let i = 0; i < 25; i++) {
      const nn = out.length;
      p += Math.sin(nn / 7) * 18 + Math.cos(nn / 3) * 9 + 2.5;
      out.push({ timestamp: new Date(Date.parse(`${ymd}T09:15:00+05:30`) + i * 900_000).toISOString(), open: p - 5, high: p + 12, low: p - 12, close: Math.round(p * 100) / 100, volume: null });
    }
  }
  return out;
}
const CFG = { index: "nifty" as const, timeframe: "15m" as const, startDate: "2026-09-01", endDate: "2026-10-31", startingCapital: CAP };
const candles = sessions(40); // daily ATR needs 15 completed days before the first tradable bar
const run = new BacktestEngine().run(CFG, candles, [], { candleSource: "MOCK" });
const report = buildPerformanceReport(run);

test("18. risk utilization vs the 1% per-trade budget", () => {
  assert.equal(report.risk.limits.riskPerTradePercent, 1);
  assert.ok(report.risk.maxRiskUtilizationPercent! <= 100.01, "risk engine never sizes above the budget");
  assert.ok(report.risk.averageRiskUtilizationPercent! > 0);
});
test("19. daily loss utilization against the 2% limit", () => {
  assert.equal(report.risk.limits.maxDailyLossPercent, 2);
  assert.ok(Math.abs(report.risk.dailyLossUtilizationPercent - (report.risk.maxDailyRealizedLoss / 2000) * 100) < 0.02);
});
test("20. concurrent positions never exceed the configured 3", () => {
  assert.equal(report.risk.limits.maxConcurrentPositions, 3);
  assert.ok(report.risk.maxConcurrentPositionsObserved <= 3);
  assert.ok(run.equityCurve.every((p) => p.openPositions <= 3));
});
test("21. synthetic option data stays labelled synthetic (never historical)", () => {
  assert.equal(report.dataQuality.optionPrices, "SYNTHETIC");
  assert.equal(report.dataQuality.oi, "SYNTHETIC");
  assert.equal(report.dataQuality.iv, "SYNTHETIC BENCHMARK");
  assert.equal(report.dataQuality.greeks, "MODEL DERIVED");
  assert.equal(report.dataQuality.transactionCosts, "NOT MODELED");
});
test("22. mock news remains PARTIAL / MOCK; mock candles are MOCK, not historical", () => {
  assert.equal(report.dataQuality.news, "PARTIAL / MOCK");
  assert.equal(report.dataQuality.spotCandles, "MOCK");
  assert.equal(new BacktestEngine().run(CFG, candles, [], { candleSource: "END_OF_DAY" }).dataQuality.spot, "HISTORICAL MEASURED");
});
test("23. performance output is labelled simulated and never LIVE", () => {
  assert.equal(report.label, PERFORMANCE_LABEL);
  assert.ok(!JSON.stringify(report.dataQuality).includes('"LIVE"'));
  assert.match(report.interpretation, /simulation results, not verified historical options-market performance/);
  assert.ok(!/guaranteed|proven|live validated/i.test(report.interpretation));
});
test("24. determinism: same config + candles → identical result and report", () => {
  const again = new BacktestEngine().run(CFG, candles, [], { candleSource: "MOCK" });
  assert.equal(JSON.stringify(again), JSON.stringify(run));
  assert.equal(JSON.stringify(buildPerformanceReport(again)), JSON.stringify(report));
  assert.match(run.runId, /^bt_[0-9a-f]{8}$/);
});

test("25. zero trades: no fake ratios", () => {
  const c = coreMetrics([], CAP);
  assert.equal(c.netPnL, 0);
  assert.equal(c.winRate.value, null);
  assert.equal(c.profitFactor.value, null);
  assert.equal(c.expectancy.value, null);
  const r = buildPerformanceReport(run, { strategy: "Iron Condor" });
  assert.equal(r.core.totalTrades, 0);
  assert.match(r.interpretation, /No simulated trades/);
});
test("26. one trade", () => {
  const c = coreMetrics([trade({ pnl: 1500 })], CAP);
  assert.deepEqual([c.totalTrades, c.winRate.value, c.expectancy.value, c.medianR.value], [1, 100, 1500, 1.5]);
});
test("27. all winners: profit factor undefined (not infinite / 99.99), average loss unavailable", () => {
  const c = coreMetrics([trade({ pnl: 100 }), trade({ pnl: 200 })], CAP);
  assert.equal(c.profitFactor.value, null);
  assert.match(c.profitFactor.reason!, /no losing trades/);
  assert.equal(c.averageLoss.value, null);
});
test("28. all losers: profit factor 0, average win unavailable", () => {
  const c = coreMetrics([trade({ pnl: -100 }), trade({ pnl: -300 })], CAP);
  assert.equal(c.profitFactor.value, 0);
  assert.equal(c.averageWin.value, null);
  assert.equal(c.largestLoser.value, -300);
});
test("29. zero-variance returns: Sharpe NOT AVAILABLE (not 0)", () => {
  const s = sharpe([0.001, 0.001, 0.001, 0.001, 0.001]);
  assert.equal(s.annualized.value, null);
  assert.match(s.annualized.reason!, /zero variance/);
});
test("30. insufficient observations: Sharpe/Sortino NOT AVAILABLE with reason", () => {
  assert.match(sharpe([0.01, 0.02]).period.reason!, /insufficient return observations \(2 < 5\)/);
  assert.equal(sortino([0.01]).annualized.value, null);
  assert.equal(annualizedReturn(100000, 101000, 6).value, null);
});
test("31. zero downside deviation: Sortino NOT AVAILABLE", () => {
  assert.match(sortino([0.01, 0.02, 0, 0.005, 0.01]).period.reason!, /zero downside deviation/);
});
test("32. zero maximum drawdown: drawdown 0, Calmar NOT AVAILABLE", () => {
  const up = eq([["2026-09-01T10:00:00Z", 100000], ["2026-09-02T10:00:00Z", 101000], ["2026-09-03T10:00:00Z", 102000]]);
  const d = drawdownAnalytics(up, CAP);
  assert.equal(d.maxDrawdown, 0);
  assert.equal(d.periods, 0);
  assert.match(calmar({ value: 12, reason: null }, d.maxDrawdownPercent).reason!, /zero maximum drawdown/);
});
test("33. missing exit timestamp: excluded from holding stats, journal exit null", () => {
  const open = trade({ pnl: 0, exitTimestamp: "" });
  const h = holdingAnalysis([open, trade({ pnl: 1 })]);
  assert.equal(h.missingExitTimestamp, 1);
  assert.equal(h.measured, 1);
  assert.equal(journal({ runId: "r" } as BacktestResult, [open])[0].exit, null);
});
test("34. empty strategy category: no fake zero rows", () => {
  const r = buildPerformanceReport(run, { strategy: "ATM Straddle" });
  assert.deepEqual(r.strategies, []);
  assert.deepEqual(r.regimes, []);
  assert.equal(r.monthly.length, 0);
});
test("35. partial multi-leg data: legs flagged incomplete, no invented leg P&L", () => {
  const t = trade({ pnl: 0 });
  t.legs = [{ ...t.legs[0] }, { side: "SELL", type: "CE", strike: 23200, entryPrice: 40, exitPrice: Number.NaN, entryMid: 40, exitMid: Number.NaN, quantity: 65 }]; // exit price missing
  const j = journal({ runId: "r" } as BacktestResult, [t])[0];
  assert.equal(j.legsComplete, false);
  assert.ok(j.legs.every((l) => l.pnl === null && l.exitPrice === null));
});

// --- engine correctness & consistency (Phase 7 repair regressions) ---
test("35b. a leg that expires worthless (exit 0) is complete data, with its full loss", () => {
  const t = trade({ pnl: -6500, exitReason: "EXPIRY" });
  t.legs = [{ ...t.legs[0], entryPrice: 100, exitPrice: 0, exitMid: 0 }];
  const j = journal({ runId: "r" } as BacktestResult, [t])[0];
  assert.equal(j.legsComplete, true);
  assert.equal(j.legs[0].pnl, -6500);
});

test("36. exits are judged on premium: TARGET trades profit, STOP_LOSS trades lose", () => {
  const debit = run.trades.filter((t) => !t.credit);
  assert.ok(debit.some((t) => t.exitReason === "TARGET") && debit.some((t) => t.exitReason === "STOP_LOSS"));
  for (const t of debit) {
    if (t.exitReason === "TARGET") assert.ok(t.realizedPnL > 0, `${t.tradeId} target with P&L ${t.realizedPnL}`);
    if (t.exitReason === "STOP_LOSS") assert.ok(t.realizedPnL < 0, `${t.tradeId} stop with P&L ${t.realizedPnL}`);
  }
});
test("37. P&L uses the paper-trading definition (calculateTradePnL) and equals Σ leg P&L", () => {
  for (const t of run.trades.slice(0, 20)) {
    const paper = calculateTradePnL(t.legs.map((l) => ({ side: l.side, type: l.type, strike: l.strike, entryLtp: l.entryMid, entryFillPrice: l.entryPrice, entryFillSource: "LTP_FALLBACK", currentPrice: null, exitPrice: l.exitPrice })), t.quantity, true).pnl;
    assert.equal(t.realizedPnL, paper);
    const j = journal(run, [t])[0];
    assert.ok(Math.abs(j.legs.reduce((a, l) => a + l.pnl!, 0) - t.realizedPnL) < 0.02);
    assert.equal(t.rMultiple, Math.round((t.realizedPnL / t.riskAmount) * 100) / 100);
  }
});
test("38. equity identity: equity = cash + unrealized; final equity = initial + net P&L; no premium/index mixing", () => {
  for (const p of run.equityCurve) assert.ok(Math.abs(p.equity - (p.cash + p.unrealizedPnL)) < 0.02);
  assert.equal(run.equityCurve.at(-1)!.equity, report.core.finalCapital);
  const lo = Math.min(...run.equityCurve.map((p) => p.equity));
  const hi = Math.max(...run.equityCurve.map((p) => p.equity));
  assert.ok(lo > 0 && hi < CAP * 2, `equity stays plausible (${lo}..${hi})`);
});
test("39. filtered metrics are recomputed from the selected trades, not from aggregates", () => {
  const regime = run.trades[0].regime;
  const r = buildPerformanceReport(run, { regime });
  const sel = run.trades.filter((t) => t.regime === regime);
  assert.equal(r.core.netPnL, Math.round(sel.reduce((a, t) => a + t.realizedPnL, 0) * 100) / 100);
  assert.equal(r.equityBasis, "REALIZED_ONLY");
  assert.equal(r.equity.at(-1)!.equity, r.core.finalCapital);
  assert.equal(r.core.totalTrades, sel.length);
});
test("40. CSV export: documented columns, escaping, one legs row per leg", () => {
  const t = tradesCsv(run).trim().split("\n");
  assert.equal(t[0], TRADE_COLUMNS.join(","));
  assert.equal(t.length, run.trades.length + 1);
  const l = legsCsv(run).trim().split("\n");
  assert.equal(l[0], LEG_COLUMNS.join(","));
  assert.equal(l.length, run.trades.reduce((a, x) => a + x.legs.length, 0) + 1);
  const weird = trade({ pnl: 1, regime: 'RANGE, "odd"' });
  assert.ok(tradesCsv({ runId: "r", trades: [weird] } as unknown as BacktestResult).includes('"RANGE, ""odd"""'));
});
test("41. rejection reasons are stable codes (no numbers baked into keys)", () => {
  assert.equal(rejectionCode("Best strategy score 61 is below the 65 threshold"), "LOW_STRATEGY_SCORE");
  assert.equal(rejectionCode("Opening 15 minutes: waiting for market confirmation"), "OPENING_WINDOW_WAIT");
  assert.equal(rejectionCode("Bull Call Spread: Risk/reward 1:1.1 below minimum 1:1.2"), "POOR_RISK_REWARD");
  assert.equal(rejectionCode("Long Call: Position size rounds to 0 lots within max trade risk limit (₹1,000)"), "POSITION_SIZE_ZERO");
  assert.ok(Object.keys(run.noTradeAnalytics.rejectionReasons).every((k) => /^[A-Z_]+$/.test(k)));
});
test("42. analytics never modify the completed backtest (no feedback into the engine)", () => {
  const before = JSON.stringify(run);
  buildPerformanceReport(run, { strategy: "Long Call", from: "2026-09-10" });
  journal(run);
  tradesCsv(run);
  assert.equal(JSON.stringify(run), before);
});
test("43. R distribution and daily returns reconcile with the trades and equity", () => {
  assert.equal(rDistribution(run.trades).reduce((a, b) => a + b.count, 0), run.trades.length);
  const d = dailyReturns(run.equityCurve, CAP);
  assert.equal(Math.round(d.reduce((e, x) => e * (1 + x.ret), CAP) * 100) / 100, run.equityCurve.at(-1)!.equity);
});

test("44. the run's capital reaches signal-level sizing (not the ₹1,00,000 default)", () => {
  const small = new BacktestEngine().run({ ...CFG, startingCapital: 20_000 }, candles, [], { candleSource: "MOCK" });
  const big = new BacktestEngine().run({ ...CFG, startingCapital: 1_000_000 }, candles, [], { candleSource: "MOCK" });
  const zero = (r: BacktestResult) => r.noTradeAnalytics.rejectionReasons.POSITION_SIZE_ZERO ?? 0;
  assert.ok(zero(small) > zero(big), `smaller capital → more unaffordable signals (${zero(small)} vs ${zero(big)})`);
  assert.ok(big.trades.every((t) => t.riskAmount <= 1_000_000 * 0.01 + 0.01));
});
