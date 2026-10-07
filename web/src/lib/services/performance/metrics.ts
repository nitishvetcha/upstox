// Performance & risk analytics over COMPLETED backtest results (pure, deterministic; no clock, no randomness,
// no live data). Consumes trades + equity points only; never feeds back into trade generation.
// Undefined metrics are returned as { value: null, reason } — never as 0.
import type { BacktestTrade, EquityCurvePoint } from "../../backtestTypes.ts";

export interface Metric {
  value: number | null;
  reason: string | null;
}
const ok = (v: number, d = 2): Metric => ({ value: Math.round(v * 10 ** d) / 10 ** d, reason: null });
const na = (reason: string): Metric => ({ value: null, reason });
const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const PERIODS_PER_YEAR = 252;
export const MIN_RETURN_OBSERVATIONS = 5; // Sharpe/Sortino need at least this many periodic returns
export const MIN_DAYS_FOR_ANNUALIZATION = 20; // annualized return / Calmar need at least this many trading days

const IST_MS = 330 * 60_000;
export const istDay = (iso: string) => new Date(Date.parse(iso) + IST_MS).toISOString().slice(0, 10);
export const istMonth = (iso: string) => istDay(iso).slice(0, 7);
export const holdingMinutes = (t: BacktestTrade) =>
  t.exitTimestamp ? Math.max(0, (Date.parse(t.exitTimestamp) - Date.parse(t.entryTimestamp)) / 60_000) : null;

// --- core ---
export function coreMetrics(trades: BacktestTrade[], initialCapital: number) {
  const pnl = trades.map((t) => t.realizedPnL);
  const wins = trades.filter((t) => t.realizedPnL > 0);
  const losses = trades.filter((t) => t.realizedPnL < 0);
  const grossProfit = r2(sum(wins.map((t) => t.realizedPnL)));
  const grossLoss = r2(Math.abs(sum(losses.map((t) => t.realizedPnL))));
  const netPnL = r2(sum(pnl));
  const n = trades.length;
  const rs = trades.map((t) => t.rMultiple);
  return {
    initialCapital,
    finalCapital: r2(initialCapital + netPnL),
    netPnL,
    grossProfit,
    grossLoss,
    totalReturnPercent: r2((netPnL / initialCapital) * 100),
    totalTrades: n,
    winningTrades: wins.length,
    losingTrades: losses.length,
    breakevenTrades: n - wins.length - losses.length,
    winRate: n ? ok((wins.length / n) * 100, 1) : na("no trades"),
    averageWin: wins.length ? ok(grossProfit / wins.length) : na("no winning trades"),
    averageLoss: losses.length ? ok(-grossLoss / losses.length) : na("no losing trades"),
    largestWinner: wins.length ? ok(Math.max(...wins.map((t) => t.realizedPnL))) : na("no winning trades"),
    largestLoser: losses.length ? ok(Math.min(...losses.map((t) => t.realizedPnL))) : na("no losing trades"),
    expectancy: n ? ok(netPnL / n) : na("no trades"),
    profitFactor: grossLoss > 0 ? ok(grossProfit / grossLoss) : grossProfit > 0 ? na("no losing trades (undefined, not infinite)") : na("no trades with P&L"),
    averageR: n ? ok(sum(rs) / n) : na("no trades"),
    medianR: n ? ok(median(rs)!) : na("no trades"),
  };
}

// --- equity from realized trade exits (used for trade-filtered views; documented as realized-only) ---
export function realizedEquity(trades: BacktestTrade[], initialCapital: number, start: string): EquityCurvePoint[] {
  const pts: EquityCurvePoint[] = [];
  let realized = 0;
  let peak = initialCapital;
  const push = (ts: string) => {
    const equity = r2(initialCapital + realized);
    peak = Math.max(peak, equity);
    pts.push({ timestamp: ts, equity, cash: equity, realizedPnL: r2(realized), unrealizedPnL: 0, drawdown: r2(peak - equity), drawdownPercent: r2(((peak - equity) / peak) * 100), openRisk: 0, openPositions: 0 });
  };
  push(start);
  for (const t of [...trades].filter((t) => t.exitTimestamp).sort((a, b) => a.exitTimestamp.localeCompare(b.exitTimestamp))) {
    realized += t.realizedPnL;
    push(t.exitTimestamp);
  }
  return pts;
}

// --- drawdowns from the actual equity curve ---
export interface DrawdownPeriod {
  peakAt: string;
  peakEquity: number;
  troughAt: string;
  troughEquity: number;
  drawdown: number;
  drawdownPercent: number;
  recoveredAt: string | null;
  durationTradingDays: number | null; // peak → recovery (IST trading days), null if not recovered
}

export function drawdownAnalytics(equity: EquityCurvePoint[], initialCapital: number) {
  const periods: DrawdownPeriod[] = [];
  let peak = initialCapital;
  let peakAt = equity[0]?.timestamp ?? "";
  let cur: DrawdownPeriod | null = null;
  const days = (a: string, b: string) => new Set(equity.filter((p) => p.timestamp > a && p.timestamp <= b).map((p) => istDay(p.timestamp))).size;
  for (const p of equity) {
    if (p.equity >= peak) {
      if (cur) {
        cur.recoveredAt = p.timestamp;
        cur.durationTradingDays = days(cur.peakAt, p.timestamp);
        periods.push(cur);
        cur = null;
      }
      peak = p.equity;
      peakAt = p.timestamp;
      continue;
    }
    if (!cur) cur = { peakAt, peakEquity: peak, troughAt: p.timestamp, troughEquity: p.equity, drawdown: 0, drawdownPercent: 0, recoveredAt: null, durationTradingDays: null };
    if (p.equity <= cur.troughEquity) {
      cur.troughAt = p.timestamp;
      cur.troughEquity = p.equity;
    }
    cur.drawdown = r2(cur.peakEquity - cur.troughEquity);
    cur.drawdownPercent = r2((cur.drawdown / cur.peakEquity) * 100);
  }
  if (cur) periods.push(cur);
  const max = periods.reduce<DrawdownPeriod | null>((m, d) => (!m || d.drawdownPercent > m.drawdownPercent ? d : m), null);
  const last = equity[equity.length - 1];
  const longest = periods.reduce<DrawdownPeriod | null>((m, d) => {
    const dur = (x: DrawdownPeriod) => Date.parse(x.recoveredAt ?? last?.timestamp ?? x.troughAt) - Date.parse(x.peakAt);
    return !m || dur(d) > dur(m) ? d : m;
  }, null);
  return {
    maxDrawdown: max?.drawdown ?? 0,
    maxDrawdownPercent: max?.drawdownPercent ?? 0,
    maxDrawdownPeriod: max,
    currentDrawdown: last ? r2(Math.max(0, peak - last.equity)) : 0,
    currentDrawdownPercent: last && peak > 0 ? r2((Math.max(0, peak - last.equity) / peak) * 100) : 0,
    longestDrawdown: longest,
    periods: periods.length,
  };
}

// --- periodic returns: last equity of each IST trading day (first day vs initial capital) ---
export function dailyReturns(equity: EquityCurvePoint[], initialCapital: number): { day: string; equity: number; ret: number }[] {
  const byDay = new Map<string, number>();
  for (const p of equity) byDay.set(istDay(p.timestamp), p.equity);
  const out: { day: string; equity: number; ret: number }[] = [];
  let prev = initialCapital;
  for (const [day, eq] of [...byDay.entries()].sort()) {
    out.push({ day, equity: eq, ret: prev > 0 ? eq / prev - 1 : 0 });
    prev = eq;
  }
  return out;
}

const stdev = (xs: number[]) => {
  const m = sum(xs) / xs.length;
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1));
};

export function sharpe(returns: number[], riskFreePerPeriod = 0, periodsPerYear = PERIODS_PER_YEAR) {
  if (returns.length < MIN_RETURN_OBSERVATIONS) return { period: na(`insufficient return observations (${returns.length} < ${MIN_RETURN_OBSERVATIONS})`), annualized: na("insufficient return observations") };
  const ex = returns.map((r) => r - riskFreePerPeriod);
  const sd = stdev(ex);
  if (!(sd > 0)) return { period: na("zero variance of returns"), annualized: na("zero variance of returns") };
  const s = sum(ex) / ex.length / sd;
  return { period: ok(s, 4), annualized: ok(s * Math.sqrt(periodsPerYear), 2) };
}

export function sortino(returns: number[], targetPerPeriod = 0, periodsPerYear = PERIODS_PER_YEAR) {
  if (returns.length < MIN_RETURN_OBSERVATIONS) return { period: na(`insufficient return observations (${returns.length} < ${MIN_RETURN_OBSERVATIONS})`), annualized: na("insufficient return observations") };
  const dd = Math.sqrt(sum(returns.map((r) => Math.min(0, r - targetPerPeriod) ** 2)) / returns.length);
  if (!(dd > 0)) return { period: na("zero downside deviation"), annualized: na("zero downside deviation") };
  const s = (sum(returns) / returns.length - targetPerPeriod) / dd;
  return { period: ok(s, 4), annualized: ok(s * Math.sqrt(periodsPerYear), 2) };
}

export function annualizedReturn(initialCapital: number, finalCapital: number, tradingDays: number, periodsPerYear = PERIODS_PER_YEAR): Metric {
  if (tradingDays < MIN_DAYS_FOR_ANNUALIZATION) return na(`only ${tradingDays} trading days (< ${MIN_DAYS_FOR_ANNUALIZATION})`);
  if (!(finalCapital > 0)) return na("final capital ≤ 0");
  return ok(((finalCapital / initialCapital) ** (periodsPerYear / tradingDays) - 1) * 100, 2);
}

export function calmar(annualized: Metric, maxDrawdownPercent: number): Metric {
  if (annualized.value === null) return na(`annualized return unavailable: ${annualized.reason}`);
  if (!(maxDrawdownPercent > 0)) return na("zero maximum drawdown");
  return ok(annualized.value / Math.abs(maxDrawdownPercent), 2);
}

// --- grouped analytics (strategy / regime / month / weekday) ---
export function groupStats(trades: BacktestTrade[], keyOf: (t: BacktestTrade) => string, initialCapital: number) {
  const totalNet = sum(trades.map((t) => t.realizedPnL));
  const groups = new Map<string, BacktestTrade[]>();
  for (const t of trades) groups.set(keyOf(t), [...(groups.get(keyOf(t)) ?? []), t]);
  return [...groups.entries()].map(([key, ts]) => {
    const c = coreMetrics(ts, initialCapital);
    // Realized-only drawdown of this group's own P&L sequence (by exit time).
    const eq = realizedEquity(ts, initialCapital, ts[0].entryTimestamp);
    const holds = ts.map(holdingMinutes).filter((m): m is number => m !== null);
    return {
      key,
      tradeCount: ts.length,
      wins: c.winningTrades,
      losses: c.losingTrades,
      winRate: c.winRate,
      grossProfit: c.grossProfit,
      grossLoss: c.grossLoss,
      netPnL: c.netPnL,
      returnPercent: c.totalReturnPercent,
      profitFactor: c.profitFactor,
      expectancy: c.expectancy,
      averageR: c.averageR,
      maxDrawdown: drawdownAnalytics(eq, initialCapital).maxDrawdown,
      averageHoldingMinutes: holds.length ? r2(sum(holds) / holds.length) : null,
      tradeSharePercent: trades.length ? r2((ts.length / trades.length) * 100) : 0,
      pnlContributionPercent: totalNet !== 0 ? r2((c.netPnL / Math.abs(totalNet)) * 100) : null,
    };
  });
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const weekdayOf = (t: BacktestTrade) => WEEKDAYS[new Date(Date.parse(t.entryTimestamp) + IST_MS).getUTCDay()];

// Months by exit (realized) month; first/last month flagged partial when the run starts/ends mid-month.
export function monthlyStats(trades: BacktestTrade[], initialCapital: number, startDate: string, endDate: string) {
  return groupStats(trades, (t) => istMonth(t.exitTimestamp || t.entryTimestamp), initialCapital)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((m) => {
      const lastDay = new Date(Date.UTC(Number(m.key.slice(0, 4)), Number(m.key.slice(5, 7)), 0)).getUTCDate();
      const partial = startDate > `${m.key}-01` || endDate < `${m.key}-${String(lastDay).padStart(2, "0")}`;
      return { ...m, month: m.key, partial };
    });
}

// --- holding time & R distribution ---
export const HOLDING_BUCKETS: [string, number, number][] = [
  ["< 15m", 0, 15], ["15–30m", 15, 30], ["30–60m", 30, 60], ["1–2h", 60, 120], ["2–4h", 120, 240], ["4h+", 240, Infinity],
];
export function holdingAnalysis(trades: BacktestTrade[]) {
  const mins = trades.map(holdingMinutes).filter((m): m is number => m !== null);
  return {
    measured: mins.length,
    missingExitTimestamp: trades.length - mins.length,
    average: mins.length ? r2(sum(mins) / mins.length) : null,
    median: mins.length ? r2(median(mins)!) : null,
    minimum: mins.length ? Math.min(...mins) : null,
    maximum: mins.length ? Math.max(...mins) : null,
    buckets: HOLDING_BUCKETS.map(([label, lo, hi]) => ({ label, count: mins.filter((m) => m >= lo && m < hi).length })),
  };
}

export const R_BUCKETS: [string, number, number][] = [
  ["R < -2", -Infinity, -2], ["-2 to -1", -2, -1], ["-1 to 0", -1, 0], ["0 to 1", 0, 1], ["1 to 2", 1, 2], ["2 to 3", 2, 3], ["3+", 3, Infinity],
];
export function rDistribution(trades: BacktestTrade[]) {
  return R_BUCKETS.map(([label, lo, hi]) => {
    const ts = trades.filter((t) => t.rMultiple >= lo && t.rMultiple < hi);
    return { label, count: ts.length, netPnL: r2(sum(ts.map((t) => t.realizedPnL))) };
  });
}

export function exitReasonStats(trades: BacktestTrade[]) {
  const n = trades.length;
  const count = (r: BacktestTrade["exitReason"]) => trades.filter((t) => t.exitReason === r).length;
  const pct = (c: number) => (n ? r2((c / n) * 100) : 0);
  const stop = count("STOP_LOSS"), target = count("TARGET"), expiry = count("EXPIRY"), forced = count("END_OF_BACKTEST");
  return { stopLoss: stop, target, expiry, forced, stopLossPercent: pct(stop), targetPercent: pct(target), expiryPercent: pct(expiry), forcedPercent: pct(forced) };
}
