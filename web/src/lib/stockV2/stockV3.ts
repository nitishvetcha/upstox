// Stock V3 Candidate Engine for ₹10,000 Capital Account
// Isolated from Strategy 11.4 options math and stock-v2 baselines.
import { ema, sessionVwap, type Bar } from "./indicators.ts";
import { adverse, roundTripCharges, SCENARIOS, sizePosition, type CostScenario, type Side } from "./risk.ts";
import type { HistoricalDataset } from "./dataset.ts";
import { summarize, groupBy } from "./metrics.ts";
import type { StrategyId } from "./signal.ts";
import type { Trade } from "./simulate.ts";

export const V3_CONFIG = {
  accountCapital: 10_000,
  riskPct: 0.015, // 1.5% = ₹150 risk per trade
  minPrice: 100,
  maxPrice: 3500,
  maxTradesPerDay: 2,
  minRR: 2.0,
  targetMult: 2.2, // 2.2R target
  minStopPct: 0.004, // 0.4% min stop
  maxStopPct: 0.010, // 1.0% max stop (tight structural stop)
  rvolThreshold: 1.5,
  minRelativeStrengthPct: 0.005, // 0.5% outperformance vs universe
  swingLookback: 15, // 15-bar swing low
  window: { entryFromMin: 9 * 60 + 30, entryBeforeMin: 14 * 60, squareOffBeforeMin: 15 * 60 + 15 },
};

const MIN_MS = 60_000;

export interface V3CandidateSignal {
  symbol: string;
  date: string;
  barIdx: number;
  timestamp: string;
  side: Side;
  close: number;
  swingLow: number;
  stopDist: number;
  rvol: number;
  relativeStrength: number;
  score: number;
}

export type V3Trade = Trade;

function istMinute(iso: string): number {
  const d = new Date(Date.parse(iso) + 330 * 60_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function istDate(iso: string): string {
  return new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 10);
}

export function runStockV3Simulation(
  dataset: HistoricalDataset,
  dates: string[],
  scenario: CostScenario = SCENARIOS.BASE
): { trades: V3Trade[]; metrics: ReturnType<typeof summarize> } {
  const dateSet = new Set(dates);
  const trades: V3Trade[] = [];

  // Group bars by symbol and session
  const symbolSessions = new Map<string, Map<string, Bar[]>>();
  for (const symbol of dataset.symbols) {
    const bars = dataset.bars.get(symbol) ?? [];
    const dateMap = new Map<string, Bar[]>();
    for (const b of bars) {
      const d = istDate(b.timestamp);
      if (dateSet.has(d)) {
        dateMap.set(d, [...(dateMap.get(d) ?? []), b]);
      }
    }
    symbolSessions.set(symbol, dateMap);
  }

  // Iterate session by session across the entire universe to enforce daily portfolio cap
  for (const date of dates) {
    const dailyCandidates: V3CandidateSignal[] = [];

    // First pass: compute cross-sectional market return for this session
    let marketReturnSum = 0;
    let marketReturnCount = 0;
    for (const symbol of dataset.symbols) {
      const sess = symbolSessions.get(symbol)?.get(date);
      if (sess && sess.length > 30) {
        const ret = (sess[sess.length - 1].close - sess[0].open) / sess[0].open;
        marketReturnSum += ret;
        marketReturnCount++;
      }
    }
    const marketMeanReturn = marketReturnCount > 0 ? marketReturnSum / marketReturnCount : 0;

    // Second pass: scan each stock for structural signals
    for (const symbol of dataset.symbols) {
      const sess = symbolSessions.get(symbol)?.get(date);
      if (!sess || sess.length < 60) continue;

      const closes = sess.map((b) => b.close);
      const highs = sess.map((b) => b.high);
      const lows = sess.map((b) => b.low);
      const volumes = sess.map((b) => b.volume);
      const e9 = ema(closes, 9);
      const e21 = ema(closes, 21);
      const vwap = sessionVwap(sess);

      // Rolling 20-bar volume average for RVOL calculation
      const volAvg20 = volumes.map((_, i) => {
        const start = Math.max(0, i - 19);
        const slice = volumes.slice(start, i + 1);
        const sum = slice.reduce((a, b) => a + b, 0);
        return sum / slice.length;
      });

      for (let k = 25; k < sess.length - 1; k++) {
        const b = sess[k];
        const minute = istMinute(b.timestamp);
        if (minute < V3_CONFIG.window.entryFromMin || minute >= V3_CONFIG.window.entryBeforeMin) continue;

        // 1. Price Filter: ₹100 <= price <= ₹3,500
        if (b.close < V3_CONFIG.minPrice || b.close > V3_CONFIG.maxPrice) continue;

        const a9 = e9[k], a21 = e21[k], v = vwap[k];
        if (a9 === null || a21 === null || v === null) continue;

        // 2. Trend & Pullback Alignment (LONG)
        const isTrend = a9 > a21 && b.close > v && b.close > a9;
        if (!isTrend) continue;

        // 3. Volume Check: RVOL >= 1.5
        const rvol = volAvg20[k] > 0 ? b.volume / volAvg20[k] : 1;
        if (rvol < V3_CONFIG.rvolThreshold) continue;

        // 4. Relative Strength vs Universe Mean >= 0.5%
        const stockReturn = (b.close - sess[0].open) / sess[0].open;
        const relativeStrength = stockReturn - marketMeanReturn;
        if (relativeStrength < V3_CONFIG.minRelativeStrengthPct) continue;

        // 5. Tighter Structural Stop-Loss (15-bar swing low)
        const swingLow = Math.min(...lows.slice(Math.max(0, k - V3_CONFIG.swingLookback), k + 1));
        const rawStopDist = b.close - (swingLow * 0.999);
        const stopDist = Math.max(b.close * V3_CONFIG.minStopPct, Math.min(b.close * V3_CONFIG.maxStopPct, rawStopDist));

        dailyCandidates.push({
          symbol,
          date,
          barIdx: k,
          timestamp: b.timestamp,
          side: "LONG",
          close: b.close,
          swingLow,
          stopDist,
          rvol,
          relativeStrength,
          score: rvol * 0.4 + relativeStrength * 100 * 0.6,
        });

        // Only one signal per stock per day
        break;
      }
    }

    // Sort candidates by quality score and select up to maxTradesPerDay (2)
    dailyCandidates.sort((a, b) => b.score - a.score);
    const selected = dailyCandidates.slice(0, V3_CONFIG.maxTradesPerDay);

    // Simulate selected trades
    for (const cand of selected) {
      const sess = symbolSessions.get(cand.symbol)?.get(cand.date)!;
      const k = cand.barIdx;
      const b = sess[k];
      const entryBar = sess[k + 1];
      if (!entryBar) continue;

      const entryFill = adverse("LONG", entryBar.open, "ENTRY", scenario.slippagePct);
      const stop = entryFill - cand.stopDist;
      const target = entryFill + V3_CONFIG.targetMult * cand.stopDist;

      // Position Sizing for ₹10,000 Capital Account (1.5% Risk = ₹150)
      const size = sizePosition(entryFill, stop, "NONE", V3_CONFIG.accountCapital, V3_CONFIG.riskPct);
      if (!size.ok || size.qty <= 0) continue;

      let exitFill = 0;
      let exitReason: V3Trade["exitReason"] = "TIME";
      let exitTime = sess[sess.length - 1].timestamp;
      let lastIdx = k + 1;

      for (let j = k + 1; j < sess.length; j++) {
        const x = sess[j];
        if (istMinute(x.timestamp) >= V3_CONFIG.window.squareOffBeforeMin) break;
        lastIdx = j;

        const gapBefore = j > k + 1 && Date.parse(x.timestamp) - Date.parse(sess[j - 1].timestamp) !== MIN_MS;
        if (gapBefore) {
          exitFill = adverse("LONG", x.open, "GAP_EXIT", scenario.slippagePct);
          exitReason = "GAP_EXIT";
          exitTime = x.timestamp;
          break;
        }

        const stopHit = x.low <= stop;
        const targetHit = x.high >= target;
        if (stopHit) {
          exitFill = adverse("LONG", stop, "STOP_EXIT", scenario.slippagePct);
          exitReason = "STOP";
          exitTime = x.timestamp;
          break;
        }
        if (targetHit) {
          exitFill = target;
          exitReason = "TARGET";
          exitTime = x.timestamp;
          break;
        }
      }

      if (exitReason === "TIME") {
        exitFill = adverse("LONG", sess[lastIdx].close, "TIME_EXIT", scenario.slippagePct);
        exitTime = sess[lastIdx].timestamp;
      }

      const qty = size.qty;
      const grossPnl = (exitFill - entryFill) * qty;
      const charges = roundTripCharges("LONG", entryFill, exitFill, qty, scenario.costMultiplier).total;
      const netPnl = grossPnl - charges;

      trades.push({
        symbol: cand.symbol,
        strategy: "TREND_RECLAIM",
        scenario: scenario.name,
        date: cand.date,
        side: "LONG",
        signalTime: b.timestamp,
        entryTime: entryBar.timestamp,
        entryFill,
        stop,
        target,
        exitTime,
        exitFill,
        exitReason,
        qty,
        riskAmount: size.riskAmount,
        eventFactor: size.eventFactor,
        notional: entryFill * qty,
        grossPnl,
        charges,
        netPnl,
        grossR: grossPnl / size.riskAmount,
        netR: netPnl / size.riskAmount,
        holdMinutes: (Date.parse(exitTime) - Date.parse(entryBar.timestamp)) / MIN_MS,
        plannedRR: V3_CONFIG.targetMult,
      });
    }
  }

  return { trades, metrics: summarize(trades) };
}
