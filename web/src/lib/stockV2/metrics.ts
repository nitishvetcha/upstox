// Stock V2 performance metrics. Pure functions over completed trades. Unit-test success is not evidence of profitability.
import type { Trade } from "./simulate.ts";

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function summarize(trades: Trade[]) {
  const sorted = [...trades].sort((a, b) => a.entryTime.localeCompare(b.entryTime));
  const wins = sorted.filter((t) => t.netPnl > 0);
  const losses = sorted.filter((t) => t.netPnl <= 0);
  const grossWin = wins.reduce((a, t) => a + t.netPnl, 0);
  const grossLoss = -losses.reduce((a, t) => a + t.netPnl, 0);

  let equity = 0, peak = 0, maxDd = 0;
  let equityR = 0, peakR = 0, maxDdR = 0;
  for (const t of sorted) {
    equity += t.netPnl;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
    equityR += t.netR;
    peakR = Math.max(peakR, equityR);
    maxDdR = Math.max(maxDdR, peakR - equityR);
  }

  let run = 0, maxRun = 0;
  for (const t of sorted) {
    run = t.netPnl <= 0 ? run + 1 : 0;
    maxRun = Math.max(maxRun, run);
  }

  const byExit = (r: Trade["exitReason"]) => sorted.filter((t) => t.exitReason === r).length;
  return {
    trades: sorted.length,
    longs: sorted.filter((t) => t.side === "LONG").length,
    shorts: sorted.filter((t) => t.side === "SHORT").length,
    wins: wins.length,
    losses: losses.length,
    winRate: sorted.length ? wins.length / sorted.length : null,
    grossPnl: sorted.reduce((a, t) => a + t.grossPnl, 0),
    charges: sorted.reduce((a, t) => a + t.charges, 0),
    netPnl: sorted.reduce((a, t) => a + t.netPnl, 0),
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    expectancyR: mean(sorted.map((t) => t.netR)),
    expectancyRs: mean(sorted.map((t) => t.netPnl)),
    avgHoldMinutes: mean(sorted.map((t) => t.holdMinutes)),
    avgPlannedRR: mean(sorted.map((t) => t.plannedRR)),
    avgNotional: mean(sorted.map((t) => t.notional)),
    gapExits: byExit("GAP_EXIT"),
    avgWinR: mean(wins.map((t) => t.netR)),
    avgLossR: mean(losses.map((t) => t.netR)),
    maxDrawdownPnl: maxDd,
    maxDrawdownR: maxDdR,
    maxConsecutiveLosses: maxRun,
    exits: { STOP: byExit("STOP"), TARGET: byExit("TARGET"), TIME: byExit("TIME"), GAP_EXIT: byExit("GAP_EXIT") },
  };
}

export function groupBy<K extends string>(trades: Trade[], key: (t: Trade) => K) {
  const m = new Map<K, Trade[]>();
  for (const t of trades) m.set(key(t), [...(m.get(key(t)) ?? []), t]);
  return Object.fromEntries([...m].map(([k, ts]) => [k, summarize(ts)])) as Record<K, ReturnType<typeof summarize>>;
}
