// Daily equity research engine (pure). Protocol: docs/DAILY_EQUITY_PROTOCOL.md. No I/O in this file.
// Causal indicators (day t uses bars ≤ t), next-open execution, conservative intrabar ordering, jump exclusion.

export interface DBar { t: string; date: string; o: number; h: number; l: number; c: number; v: number }

export interface Costs { slippagePerSide: number; brokeragePerOrder: number }
export const SCENARIOS: Record<"BASE" | "CONSERVATIVE", Costs> = {
  BASE: { slippagePerSide: 0.001, brokeragePerOrder: 0 },
  CONSERVATIVE: { slippagePerSide: 0.0025, brokeragePerOrder: 20 },
};

// Statutory-rate assumptions for Indian equity delivery. To be verified against the current NSE/SEBI schedules.
export const RATES = { stt: 0.001, exchange: 0.0000297, sebi: 0.000001, stamp: 0.00015, gst: 0.18 };

export const RISK_BUDGET = 10_000; // 1% of ₹10,00,000
export const JUMP = 0.35; // open versus previous close: a candidate corporate action or bad print

export function costBreakdown(buyTurnover: number, sellTurnover: number, brokeragePerOrder: number) {
  const brokerage = brokeragePerOrder * 2;
  const exchange = RATES.exchange * (buyTurnover + sellTurnover);
  const sebi = RATES.sebi * (buyTurnover + sellTurnover);
  const stt = RATES.stt * (buyTurnover + sellTurnover);
  const stamp = RATES.stamp * buyTurnover;
  const gst = RATES.gst * (brokerage + exchange + sebi);
  return { brokerage, exchange, sebi, stt, stamp, gst, total: brokerage + exchange + sebi + stt + stamp + gst };
}

// ── causal indicators ─────────────────────────────────────────────────────────

export function sma(closes: number[], n: number, i: number): number | null {
  if (i < n - 1) return null;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) s += closes[k];
  return s / n;
}

// Wilder ATR(14) over true range; index i uses bars ≤ i.
export function atrSeries(bars: DBar[], n = 14): (number | null)[] {
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

// RSI(2) with simple averages of the last two daily changes; index i uses closes ≤ i.
export function rsi2(closes: number[], i: number): number | null {
  if (i < 2) return null;
  let gain = 0, loss = 0;
  for (let k = i - 1; k <= i; k++) {
    const d = closes[k] - closes[k - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  if (gain + loss === 0) return 50;
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

// Highest high over the n bars BEFORE day i (excludes day i itself).
export function priorHigh(bars: DBar[], n: number, i: number): number | null {
  if (i < n) return null;
  let m = -Infinity;
  for (let k = i - n; k < i; k++) m = Math.max(m, bars[k].h);
  return m;
}

// ── candidate strategies ──────────────────────────────────────────────────────

export interface Candidate {
  id: string;
  signal: (bars: DBar[], closes: number[], atr: (number | null)[], i: number) => boolean;
  stopAtr: number;
  targetAtr: number;
  timeStop: number;
}

export const CANDIDATES: Candidate[] = [
  {
    id: "TREND_BREAKOUT_20",
    signal: (bars, closes, _atr, i) => {
      const s200 = sma(closes, 200, i), ph = priorHigh(bars, 20, i);
      return s200 !== null && ph !== null && closes[i] > s200 && closes[i] > ph;
    },
    stopAtr: 2, targetAtr: 3, timeStop: 20,
  },
  {
    id: "PULLBACK_RSI2",
    signal: (_bars, closes, _atr, i) => {
      const s200 = sma(closes, 200, i), r = rsi2(closes, i);
      return s200 !== null && r !== null && closes[i] > s200 && r < 10;
    },
    stopAtr: 2, targetAtr: 2, timeStop: 5,
  },
  {
    id: "DONCHIAN_55",
    signal: (bars, closes, _atr, i) => {
      const s50 = sma(closes, 50, i), ph = priorHigh(bars, 55, i);
      return s50 !== null && ph !== null && closes[i] > s50 && closes[i] > ph;
    },
    stopAtr: 2, targetAtr: 4, timeStop: 40,
  },
];

// ── simulation ────────────────────────────────────────────────────────────────

export interface Trade {
  symbol: string; candidate: string; signalDate: string; entryDate: string; exitDate: string;
  entry: number; stop: number; target: number; exit: number; exitReason: "STOP" | "GAP_STOP" | "TARGET" | "TIME";
  qty: number; grossPnl: number; costs: number; netPnl: number; netR: number; holdDays: number;
}

// The protocol's jump rule: a flagged day is any bar whose open is more than JUMP away from the previous close.
export function flaggedDays(bars: DBar[]): Set<number> {
  const out = new Set<number>();
  for (let i = 1; i < bars.length; i++) if (Math.abs(bars[i].o / bars[i - 1].c - 1) > JUMP) out.add(i);
  return out;
}

// Simulates one candidate on one symbol, restricted to signal dates in [from, to]. A trade must complete on or before
// `to`; otherwise it is dropped as truncated (it would read data outside the set). A trade whose holding period touches a
// flagged day is excluded and counted, never adjusted.
export function simulateSymbol(
  symbol: string, bars: DBar[], cand: Candidate, scenario: Costs, from: string, to: string,
): { trades: Trade[]; excludedJump: number; truncated: number } {
  const closes = bars.map((b) => b.c);
  const atr = atrSeries(bars);
  const flagged = flaggedDays(bars);
  const trades: Trade[] = [];
  let excludedJump = 0, truncated = 0;
  let busyUntil = -1; // one position per symbol
  for (let i = 0; i < bars.length - 1; i++) {
    const sd = bars[i].date;
    if (sd < from || sd > to) continue;
    if (i <= busyUntil) continue;
    const a = atr[i];
    if (a === null || !cand.signal(bars, closes, atr, i)) continue;
    const entryIdx = i + 1;
    if (bars[entryIdx].date > to) { truncated++; continue; }
    const rawEntry = bars[entryIdx].o;
    const entry = rawEntry * (1 + scenario.slippagePerSide);
    const stop = entry - cand.stopAtr * a;
    const target = entry + cand.targetAtr * a;
    const risk = entry - stop;
    const qty = Math.floor(RISK_BUDGET / risk);
    if (!(risk > 0) || qty < 1) continue;
    const timeIdx = entryIdx + cand.timeStop;
    let exitIdx = -1, exit = 0, reason: Trade["exitReason"] = "TIME";
    for (let j = i + 2; j <= Math.min(timeIdx, bars.length - 1); j++) {
      const b = bars[j];
      if (b.o <= stop) { exitIdx = j; exit = b.o * (1 - scenario.slippagePerSide); reason = "GAP_STOP"; break; }
      if (b.l <= stop) { exitIdx = j; exit = stop * (1 - scenario.slippagePerSide); reason = "STOP"; break; }
      if (b.h >= target) { exitIdx = j; exit = target * (1 - scenario.slippagePerSide); reason = "TARGET"; break; }
    }
    if (exitIdx === -1) {
      exitIdx = Math.min(timeIdx, bars.length - 1);
      exit = bars[exitIdx].c * (1 - scenario.slippagePerSide);
      reason = "TIME";
      if (exitIdx < timeIdx) { truncated++; continue; } // series ends before the time stop
    }
    if (bars[exitIdx].date > to) { truncated++; continue; }
    let jump = false;
    for (let j = entryIdx; j <= exitIdx; j++) if (flagged.has(j)) { jump = true; break; }
    if (jump) { excludedJump++; busyUntil = exitIdx; continue; }
    const buyT = entry * qty, sellT = exit * qty;
    const costs = costBreakdown(buyT, sellT, scenario.brokeragePerOrder).total;
    const gross = (exit - entry) * qty;
    const net = gross - costs;
    trades.push({
      symbol, candidate: cand.id, signalDate: sd, entryDate: bars[entryIdx].date, exitDate: bars[exitIdx].date,
      entry, stop, target, exit, exitReason: reason, qty, grossPnl: gross, costs, netPnl: net,
      netR: net / (risk * qty), holdDays: exitIdx - entryIdx,
    });
    busyUntil = exitIdx;
  }
  return { trades, excludedJump, truncated };
}

export function summarise(trades: Trade[]) {
  const n = trades.length;
  const wins = trades.filter((t) => t.netPnl > 0), losses = trades.filter((t) => t.netPnl <= 0);
  const sumWin = wins.reduce((a, t) => a + t.netPnl, 0), sumLoss = -losses.reduce((a, t) => a + t.netPnl, 0);
  let eq = 0, peak = 0, maxDdR = 0, eqR = 0, peakR = 0;
  for (const t of [...trades].sort((a, b) => a.exitDate.localeCompare(b.exitDate))) {
    eq += t.netPnl; peak = Math.max(peak, eq);
    eqR += t.netR; peakR = Math.max(peakR, eqR); maxDdR = Math.max(maxDdR, peakR - eqR);
  }
  let run = 0, maxRun = 0;
  for (const t of trades) { run = t.netPnl <= 0 ? run + 1 : 0; maxRun = Math.max(maxRun, run); }
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
    maxConsecutiveLosses: maxRun,
    exitMix: { STOP: trades.filter((t) => t.exitReason === "STOP").length, GAP_STOP: trades.filter((t) => t.exitReason === "GAP_STOP").length, TARGET: trades.filter((t) => t.exitReason === "TARGET").length, TIME: trades.filter((t) => t.exitReason === "TIME").length },
  };
}
