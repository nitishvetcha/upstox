// Daily Delivery Swing Trading Engine (Swing V1) for ₹10,000 Capital Account
// Isolated candidate: Strategy 11.4 options math and stock-v2 baselines are 100% untouched.

import { roundTripDeliveryCharges, type DeliveryOrderCharges } from "./risk.ts";

export interface DailyBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type SwingAllocationMode = "MODE_A_5K" | "MODE_B_10K";

export interface SwingConfig {
  accountCapital: number;
  allocationMode: SwingAllocationMode;
  maxPositions: number;
  allocationPerTrade: number;
  minPrice: number;
  maxPrice: number;
  minStopPct: number;
  maxStopPct: number;
  targetMultiplier: number;
  breakevenThresholdR: number;
  maxHoldingDays: number;
  trail20EmaAfter15R?: boolean;
  zeroBrokerage?: boolean;
  volumeMultiplier: number;
  lookbackHighDays: number;
  trailingLowDays: number;
  slippagePct: number;
}

export const SWING_CONFIG_DEFAULTS: Record<SwingAllocationMode, SwingConfig> = {
  MODE_A_5K: {
    accountCapital: 10_000,
    allocationMode: "MODE_A_5K",
    maxPositions: 2,
    allocationPerTrade: 5_000,
    minPrice: 100,
    maxPrice: 3_500,
    minStopPct: 0.030, // 3.0% min SL
    maxStopPct: 0.045, // 4.5% max SL
    targetMultiplier: 2.5, // 2.5x SL distance (7.5% - 11.25% target)
    breakevenThresholdR: 1.5, // Move stop to breakeven at +1.5R
    maxHoldingDays: 15,
    volumeMultiplier: 1.3,
    lookbackHighDays: 10,
    trailingLowDays: 10,
    slippagePct: 0.0005, // 0.05% BASE
  },
  MODE_B_10K: {
    accountCapital: 10_000,
    allocationMode: "MODE_B_10K",
    maxPositions: 1,
    allocationPerTrade: 10_000,
    minPrice: 100,
    maxPrice: 3_500,
    minStopPct: 0.030,
    maxStopPct: 0.045,
    targetMultiplier: 2.5,
    breakevenThresholdR: 1.5,
    maxHoldingDays: 15,
    volumeMultiplier: 1.3,
    lookbackHighDays: 10,
    trailingLowDays: 10,
    slippagePct: 0.0005, // 0.05% BASE
  },
};

export interface SwingSignal {
  symbol: string;
  date: string;
  barIdx: number;
  entryDate: string;
  close: number;
  setupType: "BREAKOUT" | "PULLBACK";
  volumeRatio: number;
  rsVsNifty: number;
  swingLow: number;
  stopDist: number;
  score: number;
}

export interface SwingTrade {
  symbol: string;
  allocationMode: SwingAllocationMode;
  scenario: string;
  signalDate: string;
  entryDate: string;
  entryFill: number;
  initialStop: number;
  finalStop: number;
  target: number;
  exitDate: string;
  exitFill: number;
  exitReason: "STOP" | "TARGET" | "BREAKEVEN" | "TIME" | "TRAIL_EMA";
  holdingDays: number;
  qty: number;
  allocatedAmount: number;
  notional: number;
  plannedRisk: number;
  grossPnl: number;
  charges: DeliveryOrderCharges;
  netPnl: number;
  grossR: number;
  netR: number;
  breakevenTriggered: boolean;
  setupType: "BREAKOUT" | "PULLBACK";
}

export interface SwingMetrics {
  trades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  avgHoldingDays: number;
  profitFactor: number;
  expectancyR: number;
  feeDragPct: number;
  grossPnl: number;
  totalCharges: number;
  dpChargesTotal: number;
  brokerageTotal: number;
  netPnl: number;
  maxDrawdownPnl: number;
  maxDrawdownR: number;
  exits: {
    STOP: number;
    TARGET: number;
    BREAKEVEN: number;
    TIME: number;
    TRAIL_EMA: number;
  };
}

// ── Causal Indicator Helpers ──────────────────────────────────────────────────

export function emaSeries(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period) return out;
  const k = 2 / (period + 1);
  let prev = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < closes.length; i++) {
    prev = closes[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function smaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let sum = values.slice(0, period).reduce((a, b) => a + b, 0);
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    out[i] = sum / period;
  }
  return out;
}

export function highestHigh(highs: number[], lookback: number, i: number): number | null {
  if (i < lookback) return null;
  let m = -Infinity;
  for (let k = i - lookback; k < i; k++) {
    if (highs[k] > m) m = highs[k];
  }
  return m;
}

export function return10d(closes: number[], i: number): number | null {
  if (i < 10 || closes[i - 10] <= 0) return null;
  return (closes[i] - closes[i - 10]) / closes[i - 10];
}

// ── Simulation Engine ─────────────────────────────────────────────────────────

export function simulateSwingV1(
  stockData: Map<string, DailyBar[]>,
  niftyBars: DailyBar[],
  calendarDates: string[],
  config: SwingConfig
): { trades: SwingTrade[]; metrics: SwingMetrics } {
  const niftyByDate = new Map<string, DailyBar>();
  niftyBars.forEach((b) => niftyByDate.set(b.date, b));

  const niftyCloses = niftyBars.map((b) => b.close);
  const niftyRet10Map = new Map<string, number>();
  for (let i = 10; i < niftyBars.length; i++) {
    const ret = return10d(niftyCloses, i);
    if (ret !== null) niftyRet10Map.set(niftyBars[i].date, ret);
  }

  // Pre-calculate indicators for each stock
  interface StockPrepared {
    bars: DailyBar[];
    byDate: Map<string, number>;
    e20: (number | null)[];
    e50: (number | null)[];
    volSma20: (number | null)[];
  }
  const prepared = new Map<string, StockPrepared>();

  for (const [symbol, bars] of stockData) {
    if (bars.length < 50) continue;
    const closes = bars.map((b) => b.close);
    const volumes = bars.map((b) => b.volume);
    const byDate = new Map<string, number>();
    bars.forEach((b, idx) => byDate.set(b.date, idx));

    prepared.set(symbol, {
      bars,
      byDate,
      e20: emaSeries(closes, 20),
      e50: emaSeries(closes, 50),
      volSma20: smaSeries(volumes, 20),
    });
  }

  const completedTrades: SwingTrade[] = [];
  interface OpenPosition {
    symbol: string;
    trade: SwingTrade;
    currentStop: number;
    breakevenTriggered: boolean;
    holdingDays: number;
  }
  const openPositions: OpenPosition[] = [];

  // Iterate chronologically through each calendar date
  for (let dateIdx = 0; dateIdx < calendarDates.length; dateIdx++) {
    const currentDate = calendarDates[dateIdx];
    const prevDate = dateIdx > 0 ? calendarDates[dateIdx - 1] : null;

    // 1. Process holding / exit checks for existing open positions on currentDate
    for (let pIdx = openPositions.length - 1; pIdx >= 0; pIdx--) {
      const pos = openPositions[pIdx];
      const stock = prepared.get(pos.symbol);
      if (!stock) continue;
      const bIdx = stock.byDate.get(currentDate);
      if (bIdx === undefined) continue;

      const bar = stock.bars[bIdx];
      pos.holdingDays++;

      const entryFill = pos.trade.entryFill;
      const stopDist = entryFill - pos.trade.initialStop;
      const target = pos.trade.target;

      // Trailing stop: check if price hit +1.5R, triggering breakeven stop
      if (!pos.breakevenTriggered && bar.high >= entryFill + config.breakevenThresholdR * stopDist) {
        pos.breakevenTriggered = true;
        pos.currentStop = Math.max(pos.currentStop, entryFill);
      }

      let exitFill = 0;
      let exitReason: SwingTrade["exitReason"] | null = null;

      // Conservative intrabar ordering: stop before target
      const stopHit = bar.low <= pos.currentStop;
      const targetHit = Number.isFinite(target) && bar.high >= target;

      if (stopHit) {
        exitReason = pos.breakevenTriggered && pos.currentStop >= entryFill ? "BREAKEVEN" : "STOP";
        // Handle overnight gap down through stop
        const slippageMultiplier = 1 - config.slippagePct;
        const baselineExit = Math.min(bar.open, pos.currentStop);
        exitFill = baselineExit * slippageMultiplier;
      } else if (targetHit) {
        exitReason = "TARGET";
        // Fill at target (or gap open above target)
        exitFill = Math.max(bar.open, target);
      } else if (
        config.trail20EmaAfter15R &&
        pos.breakevenTriggered &&
        stock.e20[bIdx] !== null &&
        bar.close < stock.e20[bIdx]!
      ) {
        // Variant 1: trail on daily close below 20 EMA once above +1.5R
        exitReason = "TRAIL_EMA";
        exitFill = bar.close * (1 - config.slippagePct);
      } else if (pos.holdingDays >= config.maxHoldingDays || dateIdx === calendarDates.length - 1) {
        // Max holding period reached (time exit at close)
        exitReason = "TIME";
        exitFill = bar.close * (1 - config.slippagePct);
      }

      if (exitReason !== null) {
        const qty = pos.trade.qty;
        const grossPnl = (exitFill - entryFill) * qty;
        const charges = roundTripDeliveryCharges("LONG", entryFill, exitFill, qty, config.zeroBrokerage === true);
        const netPnl = grossPnl - charges.total;

        pos.trade.exitDate = currentDate;
        pos.trade.exitFill = exitFill;
        pos.trade.exitReason = exitReason;
        pos.trade.holdingDays = pos.holdingDays;
        pos.trade.finalStop = pos.currentStop;
        pos.trade.grossPnl = grossPnl;
        pos.trade.charges = charges;
        pos.trade.netPnl = netPnl;
        pos.trade.grossR = grossPnl / pos.trade.plannedRisk;
        pos.trade.netR = netPnl / pos.trade.plannedRisk;
        pos.trade.breakevenTriggered = pos.breakevenTriggered;

        completedTrades.push(pos.trade);
        openPositions.splice(pIdx, 1);
      }
    }

    // 2. Scan for entry signals generated on prevDate (to execute at open of currentDate)
    if (!prevDate) continue;
    if (openPositions.length >= config.maxPositions) continue;

    const availableSlots = config.maxPositions - openPositions.length;
    const niftyRet10 = niftyRet10Map.get(prevDate);
    if (niftyRet10 === undefined) continue;

    const candidateSignals: SwingSignal[] = [];

    for (const [symbol, stock] of prepared) {
      // Don't take a second position in an already open stock
      if (openPositions.some((p) => p.symbol === symbol)) continue;

      const pIdx = stock.byDate.get(prevDate);
      const cIdx = stock.byDate.get(currentDate);
      if (pIdx === undefined || cIdx === undefined) continue;
      if (pIdx < 50) continue;

      const bar = stock.bars[pIdx];
      const nextBar = stock.bars[cIdx];

      // A. Price Filter: ₹100 <= price <= ₹3,500
      if (bar.close < config.minPrice || bar.close > config.maxPrice) continue;

      // B. Trend Filter: Price > 20 EMA and 20 EMA > 50 EMA
      const e20 = stock.e20[pIdx];
      const e50 = stock.e50[pIdx];
      if (e20 === null || e50 === null) continue;
      if (bar.close <= e20 || e20 <= e50) continue;

      // C. Volume Filter: Daily volume >= 1.3x 20-day average volume
      const volSma = stock.volSma20[pIdx];
      if (volSma === null || volSma <= 0) continue;
      const volumeRatio = bar.volume / volSma;
      if (volumeRatio < config.volumeMultiplier) continue;

      // D. Relative Strength vs NIFTY 50 over trailing 10 days
      const closes = stock.bars.map((b) => b.close);
      const stockRet10 = return10d(closes, pIdx);
      if (stockRet10 === null || stockRet10 <= niftyRet10) continue;
      const rsVsNifty = stockRet10 - niftyRet10;

      // E. Setup Criteria: Breakout above 10-day high OR pullback bounce off 20 EMA
      const highs = stock.bars.map((b) => b.high);
      const h10 = highestHigh(highs, config.lookbackHighDays, pIdx);
      const isBreakout = h10 !== null && bar.close > h10;
      const isPullback = bar.low <= e20 && bar.close > e20;

      if (!isBreakout && !isPullback) continue;
      const setupType = isBreakout ? "BREAKOUT" : "PULLBACK";

      // F. Structural Stop-Loss Calculation (trailing 10-day low)
      const lows = stock.bars.map((b) => b.low);
      const trailingStart = Math.max(0, pIdx - config.trailingLowDays);
      const swingLow = Math.min(...lows.slice(trailingStart, pIdx + 1));

      // Tentative stop distance based on signal bar close
      const rawStopDist = bar.close - swingLow;
      const stopDist = Math.max(
        bar.close * config.minStopPct,
        Math.min(bar.close * config.maxStopPct, rawStopDist)
      );

      candidateSignals.push({
        symbol,
        date: prevDate,
        barIdx: pIdx,
        entryDate: currentDate,
        close: bar.close,
        setupType,
        volumeRatio,
        rsVsNifty,
        swingLow,
        stopDist,
        // Composite conviction score: higher relative strength + volume conviction
        score: rsVsNifty * 100 * 0.6 + volumeRatio * 0.4,
      });
    }

    // Rank candidate signals by score and take up to availableSlots
    candidateSignals.sort((a, b) => b.score - a.score);
    const selectedSignals = candidateSignals.slice(0, availableSlots);

    for (const sig of selectedSignals) {
      const stock = prepared.get(sig.symbol)!;
      const cIdx = stock.byDate.get(currentDate)!;
      const entryBar = stock.bars[cIdx];

      // Execute entry at open with slippage
      const entryFill = entryBar.open * (1 + config.slippagePct);

      // Re-anchor stop-loss to entry fill
      const stopDist = Math.max(
        entryFill * config.minStopPct,
        Math.min(entryFill * config.maxStopPct, entryFill - sig.swingLow)
      );
      const initialStop = entryFill - stopDist;
      const target =
        config.targetMultiplier === Infinity || config.trail20EmaAfter15R
          ? Infinity
          : entryFill + config.targetMultiplier * stopDist;

      // Position sizing based on allocation mode
      const qty = Math.floor(config.allocationPerTrade / entryFill);
      if (qty <= 0) continue;

      const plannedRisk = stopDist * qty;
      const notional = entryFill * qty;

      const trade: SwingTrade = {
        symbol: sig.symbol,
        allocationMode: config.allocationMode,
        scenario: config.slippagePct > 0.001 ? "CONSERVATIVE" : "BASE",
        signalDate: sig.date,
        entryDate: currentDate,
        entryFill,
        initialStop,
        finalStop: initialStop,
        target,
        exitDate: "",
        exitFill: 0,
        exitReason: "STOP",
        holdingDays: 0,
        qty,
        allocatedAmount: config.allocationPerTrade,
        notional,
        plannedRisk,
        grossPnl: 0,
        charges: { brokerage: 0, exchange: 0, sebi: 0, stt: 0, stamp: 0, dpCharge: 0, gst: 0, total: 0 },
        netPnl: 0,
        grossR: 0,
        netR: 0,
        breakevenTriggered: false,
        setupType: sig.setupType,
      };

      openPositions.push({
        symbol: sig.symbol,
        trade,
        currentStop: initialStop,
        breakevenTriggered: false,
        holdingDays: 0,
      });
    }
  }

  // Calculate summary metrics
  return {
    trades: completedTrades,
    metrics: summarizeSwingTrades(completedTrades),
  };
}

export function summarizeSwingTrades(trades: SwingTrade[]): SwingMetrics {
  const n = trades.length;
  if (n === 0) {
    return {
      trades: 0,
      wins: 0,
      losses: 0,
      breakevens: 0,
      winRate: 0,
      avgHoldingDays: 0,
      profitFactor: 0,
      expectancyR: 0,
      feeDragPct: 0,
      grossPnl: 0,
      totalCharges: 0,
      dpChargesTotal: 0,
      brokerageTotal: 0,
      netPnl: 0,
      maxDrawdownPnl: 0,
      maxDrawdownR: 0,
      exits: { STOP: 0, TARGET: 0, BREAKEVEN: 0, TIME: 0, TRAIL_EMA: 0 },
    };
  }

  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  let grossPnl = 0;
  let totalCharges = 0;
  let dpChargesTotal = 0;
  let brokerageTotal = 0;
  let netPnl = 0;
  let totalHoldingDays = 0;
  let winSumPnl = 0;
  let lossSumPnl = 0;
  let totalNetR = 0;

  const exits = { STOP: 0, TARGET: 0, BREAKEVEN: 0, TIME: 0, TRAIL_EMA: 0 };

  let peakPnl = 0;
  let maxDrawdownPnl = 0;
  let cumPnl = 0;

  let peakR = 0;
  let maxDrawdownR = 0;
  let cumR = 0;

  for (const t of trades) {
    grossPnl += t.grossPnl;
    totalCharges += t.charges.total;
    dpChargesTotal += t.charges.dpCharge * 1.18; // ₹23.60 incl GST
    brokerageTotal += t.charges.brokerage * 1.18;
    netPnl += t.netPnl;
    totalHoldingDays += t.holdingDays;
    totalNetR += t.netR;

    if (t.netPnl > 0) {
      wins++;
      winSumPnl += t.netPnl;
    } else if (t.netPnl < -25) { // Meaningful loss beyond basic roundtrip friction
      losses++;
      lossSumPnl += Math.abs(t.netPnl);
    } else {
      breakevens++;
    }

    exits[t.exitReason]++;

    // Drawdown in PnL
    cumPnl += t.netPnl;
    if (cumPnl > peakPnl) peakPnl = cumPnl;
    const ddPnl = peakPnl - cumPnl;
    if (ddPnl > maxDrawdownPnl) maxDrawdownPnl = ddPnl;

    // Drawdown in R
    cumR += t.netR;
    if (cumR > peakR) peakR = cumR;
    const ddR = peakR - cumR;
    if (ddR > maxDrawdownR) maxDrawdownR = ddR;
  }

  const profitFactor = lossSumPnl > 0 ? winSumPnl / lossSumPnl : winSumPnl > 0 ? 999 : 0;
  const winRate = wins / n;
  const avgHoldingDays = totalHoldingDays / n;
  const expectancyR = totalNetR / n;
  const feeDragPct = grossPnl > 0 ? (totalCharges / grossPnl) * 100 : (totalCharges / 10_000) * 100;

  return {
    trades: n,
    wins,
    losses,
    breakevens,
    winRate,
    avgHoldingDays,
    profitFactor,
    expectancyR,
    feeDragPct,
    grossPnl,
    totalCharges,
    dpChargesTotal,
    brokerageTotal,
    netPnl,
    maxDrawdownPnl,
    maxDrawdownR,
    exits,
  };
}
