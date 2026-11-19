// Portfolio backtest of the positional engine on daily candles. Pure: no I/O, no paper-trade records.
// No look-ahead: the signal for day t sees candles[0..t] only; the entry fills at day t+1's open.
import type { Candle } from "../types.ts";
import { evaluatePositional, MIN_BARS } from "./positionalTrend.ts";

export interface Costs {
  brokeragePerOrder: number; // ₹
  sttPct: number;            // delivery STT, each side
  exchangePct: number;       // exchange transaction charge, each side
  sebiPct: number;
  stampBuyPct: number;
  gstPct: number;            // on brokerage + exchange + SEBI
  dpPerSell: number;         // ₹ depository charge per sell
  slippagePct: number;       // each side, against us
}

// ponytail: approximate Indian delivery charges (2025-26); check your broker's current schedule.
export const DEFAULT_COSTS: Costs = {
  brokeragePerOrder: 20, sttPct: 0.1, exchangePct: 0.00297, sebiPct: 0.0001, stampBuyPct: 0.015,
  gstPct: 18, dpPerSell: 18.5, slippagePct: 0.05,
};

export interface BacktestConfig {
  capital: number;
  maxPositions: number;
  maxHoldSessions: number; // thesis expires → exit at close
  costs: Costs;
}

export const DEFAULT_CONFIG: BacktestConfig = { capital: 1_000_000, maxPositions: 5, maxHoldSessions: 20, costs: DEFAULT_COSTS };

export interface BtTrade {
  symbol: string;
  setup: string;
  signalDate: string;
  entryDate: string;
  entry: number;
  stop: number;
  target: number;
  qty: number;
  exitDate: string;
  exit: number;
  exitReason: "STOP" | "STOP_GAP" | "TARGET" | "TARGET_GAP" | "TIME" | "END";
  grossR: number;
  netPnl: number;
  netR: number;
  marketUp: boolean | null; // NIFTY above its 50-day average on the signal day
}

export interface BacktestResult {
  from: string;
  to: string;
  trades: BtTrade[];
  equity: { date: string; strategy: number; benchmark: number }[];
  stats: Stats;
  benchmark: { netReturnPct: number; maxDrawdownPct: number };
  byYear: { year: string; strategyPct: number; benchmarkPct: number; trades: number }[];
  byMarket: { label: string; trades: number; winRate: number | null; expectancyR: number | null }[];
}

export interface Stats {
  netReturnPct: number;
  cagrPct: number | null;
  maxDrawdownPct: number;
  tradeCount: number;
  winRate: number | null;
  expectancyR: number | null;  // mean net R
  profitFactor: number | null; // gross net-₹ profit / gross net-₹ loss; null when no losses
  totalCosts: number;
  exposurePct: number;         // share of days with ≥1 open position
}

const day = (c: Candle) => c.timestamp.slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function orderCost(value: number, side: "BUY" | "SELL", c: Costs): number {
  const brokerage = c.brokeragePerOrder;
  const exch = (value * c.exchangePct) / 100;
  const sebi = (value * c.sebiPct) / 100;
  const gst = ((brokerage + exch + sebi) * c.gstPct) / 100;
  const stt = (value * c.sttPct) / 100;
  const stamp = side === "BUY" ? (value * c.stampBuyPct) / 100 : 0;
  const dp = side === "SELL" ? c.dpPerSell : 0;
  return brokerage + exch + sebi + gst + stt + stamp + dp;
}

export function maxDd(xs: number[]): number {
  let peak = -Infinity, dd = 0;
  for (const x of xs) { peak = Math.max(peak, x); dd = Math.max(dd, (peak - x) / peak); }
  return r2(dd * 100);
}

interface Open { t: Omit<BtTrade, "exitDate" | "exit" | "exitReason" | "grossR" | "netPnl" | "netR">; held: number; buyCost: number; rawEntry: number }

export function runPositionalBacktest(
  data: Record<string, Candle[]>,
  benchmark: Candle[],
  cfg: BacktestConfig = DEFAULT_CONFIG,
): BacktestResult {
  const dates = benchmark.map(day);
  const idx: Record<string, Map<string, number>> = {};
  for (const [s, cs] of Object.entries(data)) idx[s] = new Map(cs.map((c, i) => [day(c), i]));
  const benchClose = benchmark.map((c) => c.close);

  const start = MIN_BARS;
  let cash = cfg.capital;
  const open = new Map<string, Open>();
  const pending: { symbol: string; sig: Extract<ReturnType<typeof evaluatePositional>, { ok: true }>; signalDate: string; marketUp: boolean | null }[] = [];
  const trades: BtTrade[] = [];
  const equity: BacktestResult["equity"] = [];
  let totalCosts = 0, exposedDays = 0;
  const slip = cfg.costs.slippagePct / 100;

  const close = (o: Open, date: string, rawPx: number, reason: BtTrade["exitReason"]) => {
    const px = rawPx * (1 - slip);
    const sellCost = orderCost(px * o.t.qty, "SELL", cfg.costs);
    totalCosts += sellCost;
    cash += px * o.t.qty - sellCost;
    // Unrounded prices so that capital + Σ netPnl equals final cash exactly; rounding is for display only.
    const risk = (o.rawEntry - o.t.stop) * o.t.qty;
    const netPnl = (px - o.rawEntry) * o.t.qty - o.buyCost - sellCost;
    trades.push({ ...o.t, exitDate: date, exit: r2(px), exitReason: reason, grossR: r2((px - o.rawEntry) / (o.rawEntry - o.t.stop)), netPnl, netR: r2(netPnl / risk) });
    open.delete(o.t.symbol);
  };

  for (let d = start; d < dates.length; d++) {
    const date = dates[d];

    // 1. Fill yesterday's signals at today's open (next-session execution).
    for (const p of pending.splice(0)) {
      if (open.size >= cfg.maxPositions || open.has(p.symbol)) continue;
      const i = idx[p.symbol]?.get(date);
      if (i === undefined) continue;
      const entry = data[p.symbol][i].open * (1 + slip);
      if (entry <= p.sig.stop) continue; // gapped below the stop before we could enter: no trade
      // Size from marked-to-market equity (yesterday's closes), so sizing compounds like the equity curve.
      const equityNow = equity.at(-1)?.strategy ?? cfg.capital;
      const qty = Math.floor(Math.min(equityNow / cfg.maxPositions, cash) / entry);
      if (qty < 1) continue;
      const buyCost = orderCost(entry * qty, "BUY", cfg.costs);
      if (entry * qty + buyCost > cash) continue;
      cash -= entry * qty + buyCost;
      totalCosts += buyCost;
      open.set(p.symbol, { t: { symbol: p.symbol, setup: p.sig.setup, signalDate: p.signalDate, entryDate: date, entry: r2(entry), stop: p.sig.stop, target: p.sig.target1, qty, marketUp: p.marketUp }, held: 0, buyCost, rawEntry: entry });
    }

    // 2. Manage open positions on today's bar. Gaps fill at the open; stop wins if both levels are touched.
    for (const o of [...open.values()]) {
      const c = data[o.t.symbol][idx[o.t.symbol].get(date) ?? -1];
      if (!c) continue;
      o.held++;
      if (c.open <= o.t.stop) close(o, date, c.open, "STOP_GAP");
      else if (c.low <= o.t.stop) close(o, date, o.t.stop, "STOP");
      else if (c.open >= o.t.target) close(o, date, c.open, "TARGET_GAP");
      else if (c.high >= o.t.target) close(o, date, o.t.target, "TARGET");
      else if (o.held >= cfg.maxHoldSessions) close(o, date, c.close, "TIME");
    }

    // 3. Signals from today's close, using only data up to today.
    if (d + 1 < dates.length) {
      const now = new Date(`${date}T12:00:00Z`);
      const bench = benchmark.slice(0, d + 1);
      const sma50 = d >= 49 ? benchClose.slice(d - 49, d + 1).reduce((a, b) => a + b, 0) / 50 : null;
      const marketUp = sma50 === null ? null : benchClose[d] > sma50;
      const sigs = [];
      for (const s of Object.keys(data)) {
        if (open.has(s)) continue;
        const i = idx[s].get(date);
        if (i === undefined || i + 1 < MIN_BARS) continue;
        const sig = evaluatePositional(data[s].slice(0, i + 1), bench, now, false);
        if (sig.ok) sigs.push({ symbol: s, sig, signalDate: date, marketUp });
      }
      sigs.sort((a, b) => b.sig.score - a.sig.score);
      pending.push(...sigs.slice(0, cfg.maxPositions));
    }

    // 4. Mark to market at the close.
    let mtm = cash;
    for (const o of open.values()) {
      const i = idx[o.t.symbol].get(date);
      mtm += o.t.qty * (i === undefined ? o.rawEntry : data[o.t.symbol][i].close);
    }
    if (open.size) exposedDays++;
    equity.push({ date, strategy: r2(mtm), benchmark: r2((cfg.capital * benchClose[d]) / benchClose[start]) });
  }

  const lastDate = dates[dates.length - 1];
  for (const o of [...open.values()]) {
    const i = idx[o.t.symbol].get(lastDate);
    close(o, lastDate, i === undefined ? o.rawEntry : data[o.t.symbol][i].close, "END");
  }
  if (equity.length) equity[equity.length - 1].strategy = cash;

  return {
    from: dates[start],
    to: lastDate,
    trades,
    equity,
    stats: stats(trades, equity, cfg.capital, totalCosts, exposedDays),
    benchmark: { netReturnPct: r2(((equity.at(-1)?.benchmark ?? cfg.capital) / cfg.capital - 1) * 100), maxDrawdownPct: maxDd(equity.map((e) => e.benchmark)) },
    byYear: byYear(equity, trades),
    byMarket: [true, false].map((up) => {
      const ts = trades.filter((t) => t.marketUp === up);
      return {
        label: up ? "NIFTY above 50-day avg" : "NIFTY below 50-day avg",
        trades: ts.length,
        winRate: ts.length ? r2(ts.filter((t) => t.netPnl > 0).length / ts.length) : null,
        expectancyR: ts.length ? r2(ts.reduce((a, t) => a + t.netR, 0) / ts.length) : null,
      };
    }),
  };
}

function stats(trades: BtTrade[], equity: BacktestResult["equity"], capital: number, totalCosts: number, exposedDays: number): Stats {
  const final = equity.at(-1)?.strategy ?? capital;
  const years = equity.length / 248;
  const wins = trades.filter((t) => t.netPnl > 0);
  const gp = wins.reduce((a, t) => a + t.netPnl, 0);
  const gl = trades.filter((t) => t.netPnl < 0).reduce((a, t) => a - t.netPnl, 0);
  return {
    netReturnPct: r2((final / capital - 1) * 100),
    cagrPct: years >= 1 ? r2(((final / capital) ** (1 / years) - 1) * 100) : null,
    maxDrawdownPct: maxDd(equity.map((e) => e.strategy)),
    tradeCount: trades.length,
    winRate: trades.length ? r2(wins.length / trades.length) : null,
    expectancyR: trades.length ? r2(trades.reduce((a, t) => a + t.netR, 0) / trades.length) : null,
    profitFactor: gl > 0 ? r2(gp / gl) : null,
    totalCosts: r2(totalCosts),
    exposurePct: equity.length ? r2((exposedDays / equity.length) * 100) : 0,
  };
}

function byYear(equity: BacktestResult["equity"], trades: BtTrade[]) {
  const out: BacktestResult["byYear"] = [];
  let prev = equity[0];
  for (let i = 0; i < equity.length; i++) {
    const y = equity[i].date.slice(0, 4);
    const last = i === equity.length - 1 || equity[i + 1].date.slice(0, 4) !== y;
    if (!last) continue;
    out.push({
      year: y,
      strategyPct: r2((equity[i].strategy / prev.strategy - 1) * 100),
      benchmarkPct: r2((equity[i].benchmark / prev.benchmark - 1) * 100),
      trades: trades.filter((t) => t.entryDate.startsWith(y)).length,
    });
    prev = equity[i];
  }
  return out;
}
