// Intraday one-hour research engine (pure). Protocol: docs/INTRADAY_PROTOCOL_I1_TREND_CONTINUATION.md.
// Causal features, next-bar execution, same-session exits only, stop-first intrabar ordering, session-level exclusion.

export interface HBar { t: string; date: string; time: string; o: number; h: number; l: number; c: number; v: number }

export const GRID = ["09:15", "10:15", "11:15", "12:15", "13:15", "14:15", "15:15"];
export const LAST_BAR = "15:15";
export const ENTRY_SIGNAL_TIMES = new Set(["10:15", "11:15", "12:15", "13:15"]);
export const RISK_BUDGET = 10_000;
export const NOTIONAL_CAP = 1_000_000;
export const JUMP = 0.35;

export interface Scenario { slippagePerSide: number; brokeragePerOrder: number }
export const SCENARIOS: Record<"BASE" | "CONSERVATIVE", Scenario> = {
  BASE: { slippagePerSide: 0.0005, brokeragePerOrder: 0 },
  CONSERVATIVE: { slippagePerSide: 0.001, brokeragePerOrder: 20 },
};

// Statutory-rate assumptions for intraday equity. To verify against the current NSE/SEBI schedules.
export const RATES = { sttSell: 0.00025, exchange: 0.0000297, sebi: 0.000001, stampBuy: 0.00003, gst: 0.18 };

export function intradayCosts(buy: number, sell: number, brokeragePerOrder: number) {
  const brokerage = brokeragePerOrder * 2;
  const stt = RATES.sttSell * sell;
  const exchange = RATES.exchange * (buy + sell);
  const sebi = RATES.sebi * (buy + sell);
  const stamp = RATES.stampBuy * buy;
  const gst = RATES.gst * (brokerage + exchange + sebi);
  return { brokerage, stt, exchange, sebi, stamp, gst, total: brokerage + stt + exchange + sebi + stamp + gst };
}

// Standard-grid bars only. Returns the bars and the number of off-grid stamps dropped.
export function standardGrid(bars: HBar[]): { bars: HBar[]; offGridDropped: number } {
  const keep = bars.filter((b) => GRID.includes(b.time));
  return { bars: keep, offGridDropped: bars.length - keep.length };
}

// Causal EMA seeded with the SMA of the first n values; null before the seed.
export function ema(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < n) return out;
  const k = 2 / (n + 1);
  let prev = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  out[n - 1] = prev;
  for (let i = n; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// Wilder ATR(14) on hourly true range; bar i uses bars ≤ i.
export function atr14(bars: HBar[], n = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length <= n) return out;
  const tr = bars.map((b, i) => (i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c))));
  let prev = tr.slice(1, n + 1).reduce((a, b) => a + b, 0) / n;
  out[n] = prev;
  for (let i = n + 1; i < bars.length; i++) {
    prev = (prev * (n - 1) + tr[i]) / n;
    out[i] = prev;
  }
  return out;
}

export interface ITrade {
  symbol: string; signalAt: string; entryAt: string; exitAt: string; entry: number; stop: number; target: number; exit: number;
  exitReason: "STOP" | "GAP_STOP" | "TARGET" | "SESSION_END"; qty: number; grossPnl: number; costs: number; netPnl: number; netR: number; session: string;
}

export interface SimResult { trades: ITrade[]; excludedFlagged: number; noEntry: number }

// Signal: uptrend (EMA20 > EMA50) and a close above the previous bar's high, on an entry-eligible time.
export function signalAt(bars: HBar[], e20: (number | null)[], e50: (number | null)[], i: number): boolean {
  if (i < 1) return false;
  const a = e20[i], b = e50[i];
  if (a === null || b === null) return false;
  return a > b && bars[i].c > bars[i - 1].h && ENTRY_SIGNAL_TIMES.has(bars[i].time);
}

// `flags` (optional) gives each hypothesis's own signal, aligned with the standard-grid bars. Without it the I-1 signal is used.
export function simulateSymbol(
  symbol: string, rawBars: HBar[], scenario: Scenario, from: string, to: string, flaggedSessions: Set<string>, flags?: boolean[],
): SimResult {
  const { bars } = standardGrid(rawBars);
  const closes = bars.map((b) => b.c);
  const e20 = ema(closes, 20), e50 = ema(closes, 50), atr = atr14(bars);
  const isSignal = (i: number) => (flags ? flags[i] === true : signalAt(bars, e20, e50, i));
  const trades: ITrade[] = [];
  let excludedFlagged = 0, noEntry = 0;
  let busyUntil = -1;
  for (let i = 0; i < bars.length - 1; i++) {
    const b = bars[i];
    if (b.date < from || b.date > to) continue;
    if (i <= busyUntil) continue;
    if (flaggedSessions.has(b.date)) { if (isSignal(i)) excludedFlagged++; continue; }
    if (!isSignal(i)) continue;
    const a = atr[i];
    const entryIdx = i + 1;
    if (a === null || bars[entryIdx].date !== b.date) { noEntry++; continue; } // entry must stay in the session
    if (bars[entryIdx].time === LAST_BAR) { noEntry++; continue; }
    const entry = bars[entryIdx].o * (1 + scenario.slippagePerSide);
    const stop = entry - 1.5 * a;
    const target = entry + 2.5 * a;
    const risk = entry - stop;
    const qty = Math.min(Math.floor(RISK_BUDGET / risk), Math.floor(NOTIONAL_CAP / entry));
    if (!(risk > 0) || qty < 1) { noEntry++; continue; }
    let exitIdx = -1, exit = 0, reason: ITrade["exitReason"] = "SESSION_END";
    for (let j = entryIdx; j < bars.length && bars[j].date === b.date; j++) {
      const x = bars[j];
      if (x.o <= stop) { exitIdx = j; exit = x.o * (1 - scenario.slippagePerSide); reason = "GAP_STOP"; break; }
      if (x.l <= stop) { exitIdx = j; exit = stop * (1 - scenario.slippagePerSide); reason = "STOP"; break; }
      if (x.h >= target) { exitIdx = j; exit = target * (1 - scenario.slippagePerSide); reason = "TARGET"; break; }
      if (x.time === LAST_BAR) { exitIdx = j; exit = x.c * (1 - scenario.slippagePerSide); reason = "SESSION_END"; break; }
    }
    if (exitIdx === -1) {
      // The session ended without its 15:15 bar: exit at the last bar of the session, never overnight.
      let last = entryIdx;
      while (last + 1 < bars.length && bars[last + 1].date === b.date) last++;
      exitIdx = last; exit = bars[last].c * (1 - scenario.slippagePerSide);
    }
    const buy = entry * qty, sell = exit * qty;
    const costs = intradayCosts(buy, sell, scenario.brokeragePerOrder).total;
    const gross = (exit - entry) * qty;
    const net = gross - costs;
    trades.push({
      symbol, signalAt: `${b.date} ${b.time}`, entryAt: `${bars[entryIdx].date} ${bars[entryIdx].time}`, exitAt: `${bars[exitIdx].date} ${bars[exitIdx].time}`,
      entry, stop, target, exit, exitReason: reason, qty, grossPnl: gross, costs, netPnl: net, netR: net / (risk * qty), session: b.date,
    });
    busyUntil = exitIdx;
  }
  return { trades, excludedFlagged, noEntry };
}

export function summarise(trades: ITrade[]) {
  const n = trades.length;
  const wins = trades.filter((t) => t.netPnl > 0), losses = trades.filter((t) => t.netPnl <= 0);
  const sumWin = wins.reduce((a, t) => a + t.netPnl, 0), sumLoss = -losses.reduce((a, t) => a + t.netPnl, 0);
  let eqR = 0, peakR = 0, maxDdR = 0;
  for (const t of [...trades].sort((a, b) => a.exitAt.localeCompare(b.exitAt))) {
    eqR += t.netR; peakR = Math.max(peakR, eqR); maxDdR = Math.max(maxDdR, peakR - eqR);
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    trades: n,
    winRate: n ? wins.length / n : null,
    expectancyR: mean(trades.map((t) => t.netR)),
    netPnl: trades.reduce((a, t) => a + t.netPnl, 0),
    profitFactor: sumLoss > 0 ? sumWin / sumLoss : null,
    avgWinR: mean(wins.map((t) => t.netR)),
    avgLossR: mean(losses.map((t) => t.netR)),
    maxDrawdownR: maxDdR,
    exitMix: { STOP: trades.filter((t) => t.exitReason === "STOP").length, GAP_STOP: trades.filter((t) => t.exitReason === "GAP_STOP").length, TARGET: trades.filter((t) => t.exitReason === "TARGET").length, SESSION_END: trades.filter((t) => t.exitReason === "SESSION_END").length },
  };
}
