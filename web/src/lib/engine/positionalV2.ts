// Positional v2: weekly trend-following with a NIFTY 200-day market filter and a 3×ATR trailing stop.
// Implements docs/positional-v2-hypothesis.md (frozen 2026-10-23) exactly. Rule changes need a new version.
// Pure: no I/O, no paper-trade records. Separate from positional-v1-retired and from live collection.
import type { Candle } from "../types.ts";
import { atr as wilderAtr } from "../services/technicalAnalysis.ts";
import { sinceLastCorporateAction } from "./positionalTrend.ts";
import { orderCost, maxDd, DEFAULT_COSTS, type Costs } from "./positionalBacktest.ts";

export const POSITIONAL_V2_VERSION = "positional-v2";

export interface V2Config {
  capital: number;
  maxPositions: number;
  atrMult: number;
  costs: Costs;
  tradeFrom: string; // first date trades may be signalled (earlier candles are warm-up only)
  tradeTo: string;   // last date; candles after it are ignored
}

export interface V2Trade {
  symbol: string;
  signalDate: string;
  entryDate: string;
  entry: number;
  qty: number;
  initialStop: number;
  exitDate: string;
  exit: number;
  exitReason: "TRAIL_STOP" | "CORP_ACTION" | "END";
  netPnl: number;
}

export interface V2Result {
  version: string;
  from: string;
  to: string;
  trades: V2Trade[];
  equity: { date: string; strategy: number; benchmark: number }[];
  stats: {
    netReturnPct: number;
    benchmarkReturnPct: number;
    maxDrawdownPct: number;
    benchmarkMaxDrawdownPct: number;
    profitFactor: number | null;
    tradeCount: number;
    winRate: number | null;
    totalCosts: number;
    avgHoldSessions: number | null;
  };
}

const day = (c: Candle) => c.timestamp.slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const sma = (xs: number[], n: number) => (xs.length < n ? null : xs.slice(-n).reduce((a, b) => a + b, 0) / n);
const weekKey = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // back to Monday
  return d.toISOString().slice(0, 10);
};

// Eligibility on a signal date, from candles up to and including that date only.
export function v2Signal(upTo: Candle[]): { ret126: number; atr: number } | null {
  const c = sinceLastCorporateAction(upTo).candles;
  if (c.length < 200) return null;
  const closes = c.map((x) => x.close);
  const close = closes[closes.length - 1];
  const s50 = sma(closes, 50)!, s200 = sma(closes, 200)!;
  if (!(close > s200 && s50 > s200)) return null;
  if (close < Math.max(...closes.slice(-100))) return null; // must be the highest close of the last 100 sessions
  const atr = wilderAtr(c, 20);
  if (atr === null) return null;
  return { ret126: close / closes[closes.length - 127] - 1, atr };
}

interface Pos { symbol: string; signalDate: string; entryDate: string; rawEntry: number; qty: number; buyCost: number; stop: number; initialStop: number; highestClose: number; exitPending: boolean; sessions: number }

export function runPositionalV2(data: Record<string, Candle[]>, benchmarkAll: Candle[], cfg: V2Config): V2Result {
  const costs = cfg.costs ?? DEFAULT_COSTS;
  const slip = costs.slippagePct / 100;
  const bench = benchmarkAll.filter((c) => day(c) <= cfg.tradeTo);
  const dates = bench.map(day);
  const bClose = bench.map((c) => c.close);
  const idx: Record<string, Map<string, number>> = {};
  for (const [s, cs] of Object.entries(data)) idx[s] = new Map(cs.filter((c) => day(c) <= cfg.tradeTo).map((c, i) => [day(c), i]));
  const bar = (s: string, date: string) => { const i = idx[s]?.get(date); return i === undefined ? null : data[s][i]; };

  const first = dates.findIndex((d) => d >= cfg.tradeFrom);
  if (first < 0) throw new Error("no trading dates in period");
  let cash = cfg.capital;
  const held = new Map<string, Pos>();
  let pendingEntries: { symbol: string; atr: number; signalDate: string }[] = [];
  const trades: V2Trade[] = [];
  const equity: V2Result["equity"] = [];
  let totalCosts = 0;
  const holdSessions: number[] = [];

  const exitAt = (p: Pos, date: string, rawPx: number, reason: V2Trade["exitReason"]) => {
    const px = rawPx * (1 - slip);
    const sellCost = orderCost(px * p.qty, "SELL", costs);
    totalCosts += sellCost;
    cash += px * p.qty - sellCost;
    trades.push({ symbol: p.symbol, signalDate: p.signalDate, entryDate: p.entryDate, entry: r2(p.rawEntry), qty: p.qty, initialStop: r2(p.initialStop), exitDate: date, exit: r2(px), exitReason: reason, netPnl: (px - p.rawEntry) * p.qty - p.buyCost - sellCost });
    holdSessions.push(p.sessions);
    held.delete(p.symbol);
  };

  for (let d = first; d < dates.length; d++) {
    const date = dates[d];
    const prevEquity = equity.at(-1)?.strategy ?? cfg.capital;

    // Open: corporate actions, then pending stop exits, then pending entries.
    for (const p of [...held.values()]) {
      const c = bar(p.symbol, date);
      const prev = idx[p.symbol].get(date) !== undefined ? data[p.symbol][idx[p.symbol].get(date)! - 1] : null;
      if (c && prev && Math.abs(c.open / prev.close - 1) > 0.25) exitAt(p, date, prev.close, "CORP_ACTION");
      else if (c && p.exitPending) exitAt(p, date, c.open, "TRAIL_STOP");
    }
    for (const e of pendingEntries) {
      if (held.size >= cfg.maxPositions) break;
      const c = bar(e.symbol, date);
      if (!c) continue;
      const fill = c.open * (1 + slip);
      const qty = Math.floor(Math.min(prevEquity / cfg.maxPositions, cash) / fill);
      if (qty < 1) continue;
      const buyCost = orderCost(fill * qty, "BUY", costs);
      if (fill * qty + buyCost > cash) continue;
      cash -= fill * qty + buyCost;
      totalCosts += buyCost;
      const stop = fill - cfg.atrMult * e.atr;
      held.set(e.symbol, { symbol: e.symbol, signalDate: e.signalDate, entryDate: date, rawEntry: fill, qty, buyCost, stop, initialStop: stop, highestClose: -Infinity, exitPending: false, sessions: 0 });
    }
    pendingEntries = [];

    // Close: trail stops on completed closes; a close below the stop exits at the next open.
    for (const p of held.values()) {
      const i = idx[p.symbol].get(date);
      if (i === undefined) continue;
      const c = data[p.symbol][i];
      p.sessions++;
      p.highestClose = Math.max(p.highestClose, c.close);
      const a = wilderAtr(sinceLastCorporateAction(data[p.symbol].slice(0, i + 1)).candles, 20);
      if (a !== null) p.stop = Math.max(p.stop, p.highestClose - cfg.atrMult * a);
      if (c.close < p.stop) p.exitPending = true;
    }

    // Weekly signal on the week's last trading day (never on the period's last day: no session to fill).
    const isSignalDay = d + 1 < dates.length && weekKey(dates[d + 1]) !== weekKey(date);
    if (isSignalDay) {
      const s200 = d >= 199 ? bClose.slice(d - 199, d + 1).reduce((a, b) => a + b, 0) / 200 : null;
      const vacancies = cfg.maxPositions - [...held.values()].filter((p) => !p.exitPending).length;
      if (s200 !== null && bClose[d] > s200 && vacancies > 0) {
        const ranked: { symbol: string; atr: number; ret126: number }[] = [];
        for (const s of Object.keys(data)) {
          if (held.has(s)) continue;
          const i = idx[s].get(date);
          if (i === undefined) continue;
          const sig = v2Signal(data[s].slice(0, i + 1));
          if (sig) ranked.push({ symbol: s, ...sig });
        }
        ranked.sort((a, b) => b.ret126 - a.ret126);
        pendingEntries = ranked.slice(0, vacancies).map((r) => ({ symbol: r.symbol, atr: r.atr, signalDate: date }));
      }
    }

    let mtm = cash;
    for (const p of held.values()) mtm += p.qty * (bar(p.symbol, date)?.close ?? p.rawEntry);
    equity.push({ date, strategy: mtm, benchmark: (cfg.capital * bClose[d]) / bClose[first] });
  }

  const last = dates[dates.length - 1];
  for (const p of [...held.values()]) exitAt(p, last, bar(p.symbol, last)?.close ?? p.rawEntry, "END");
  equity[equity.length - 1].strategy = cash;

  const gp = trades.filter((t) => t.netPnl > 0).reduce((a, t) => a + t.netPnl, 0);
  const gl = trades.filter((t) => t.netPnl < 0).reduce((a, t) => a - t.netPnl, 0);
  return {
    version: POSITIONAL_V2_VERSION,
    from: dates[first],
    to: last,
    trades,
    equity,
    stats: {
      netReturnPct: r2((cash / cfg.capital - 1) * 100),
      benchmarkReturnPct: r2((equity.at(-1)!.benchmark / cfg.capital - 1) * 100),
      maxDrawdownPct: maxDd(equity.map((e) => e.strategy)),
      benchmarkMaxDrawdownPct: maxDd(equity.map((e) => e.benchmark)),
      profitFactor: gl > 0 ? r2(gp / gl) : null,
      tradeCount: trades.length,
      winRate: trades.length ? r2(trades.filter((t) => t.netPnl > 0).length / trades.length) : null,
      totalCosts: r2(totalCosts),
      avgHoldSessions: holdSessions.length ? r2(holdSessions.reduce((a, b) => a + b, 0) / holdSessions.length) : null,
    },
  };
}
