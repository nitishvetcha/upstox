// Quantitative Strategy Historical Validator.
// Evaluates the Opening Range Breakout (ORB) + EMA + VWAP strategy over past historical candles.
// Outputs comprehensive quantitative metrics (Win Rate, Profit Factor, Net R, Drawdowns),
// detailed trade logs, and TradingView Lightweight Chart markers.

import type { Candle } from "../types.ts";
import { ema, atr, istDate } from "./technicalAnalysis.ts";
import { generateTradingViewPineScript } from "../tradingViewPineScript.ts";

export type TradeDirection = "CE_LONG" | "PE_SHORT";
export type TradeOutcome = "TARGET_2_HIT" | "TARGET_1_PARTIAL" | "STOP_LOSS_HIT" | "THETA_TIME_STOP" | "SESSION_CLOSE";

export interface HistoricalTrade {
  id: string;
  symbol: string;
  direction: TradeDirection;
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskAmount: number;
  pnlR: number;
  outcome: TradeOutcome;
  barsHeld: number;
  orbHigh: number;
  orbLow: number;
  notes: string;
}

export interface ChartMarker {
  time: number; // Unix epoch seconds for TradingView Lightweight Charts
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  text: string;
}

export interface ValidationMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRatePct: number;
  profitFactor: number;
  netR: number;
  maxDrawdownR: number;
  maxDrawdownPct: number;
  expectancyR: number;
  avgWinR: number;
  avgLossR: number;
  winLossRatio: number;
  longTrades: number;
  shortTrades: number;
  longWinRatePct: number;
  shortWinRatePct: number;
}

export interface EquityPoint {
  timestamp: string;
  tradeIndex: number;
  equityR: number;
  drawdownR: number;
}

export interface StrategyValidationReport {
  symbol: string;
  timeframe: string;
  totalCandles: number;
  startDate: string;
  endDate: string;
  metrics: ValidationMetrics;
  trades: HistoricalTrade[];
  equityCurve: EquityPoint[];
  chartMarkers: ChartMarker[];
  pineScript: string;
}

export interface ValidatorOptions {
  symbol?: string;
  timeframe?: string;
  rrTarget1?: number; // default 1.5
  rrTarget2?: number; // default 2.5
  atrBuffer?: number; // default 0.15
  thetaMaxBars?: number; // default 3 bars (45 min on 15m)
}

function getIstMinutes(iso: string): number {
  const d = new Date(iso);
  const istDate = new Date(d.getTime() + 330 * 60_000);
  return istDate.getUTCHours() * 60 + istDate.getUTCMinutes();
}

export function validateHistoricalStrategy(
  candles: Candle[],
  options?: ValidatorOptions,
): StrategyValidationReport {
  const symbol = options?.symbol ?? "NIFTY";
  const timeframe = options?.timeframe ?? "15m";
  const rr1 = options?.rrTarget1 ?? 1.5;
  const rr2 = options?.rrTarget2 ?? 2.5;
  const atrBufferMult = options?.atrBuffer ?? 0.15;
  const thetaMaxBars = options?.thetaMaxBars ?? 3;

  if (!candles || candles.length < 20) {
    return {
      symbol,
      timeframe,
      totalCandles: candles?.length ?? 0,
      startDate: "",
      endDate: "",
      metrics: {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        breakevenTrades: 0,
        winRatePct: 0,
        profitFactor: 0,
        netR: 0,
        maxDrawdownR: 0,
        maxDrawdownPct: 0,
        expectancyR: 0,
        avgWinR: 0,
        avgLossR: 0,
        winLossRatio: 0,
        longTrades: 0,
        shortTrades: 0,
        longWinRatePct: 0,
        shortWinRatePct: 0,
      },
      trades: [],
      equityCurve: [],
      chartMarkers: [],
      pineScript: generateTradingViewPineScript({ symbol, rrTarget1: rr1, rrTarget2: rr2, atrBuffer: atrBufferMult }),
    };
  }

  // Pre-calculate indicators across the full candle series
  const closes = candles.map((c) => c.close);
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const calculatedAtr = atr(candles, 14) ?? (candles[0].high - candles[0].low);

  // Group candle indices by trading day (IST)
  const daysMap = new Map<string, number[]>();
  for (let i = 0; i < candles.length; i++) {
    const day = istDate(candles[i].timestamp);
    const indices = daysMap.get(day) ?? [];
    indices.push(i);
    daysMap.set(day, indices);
  }

  const trades: HistoricalTrade[] = [];
  const chartMarkers: ChartMarker[] = [];

  // Simulate trading day-by-day
  for (const [, indices] of daysMap.entries()) {
    if (indices.length < 2) continue;

    let orbHigh: number | null = null;
    let orbLow: number | null = null;
    let runningVolume = 0;
    let runningPv = 0;

    let activeTrade: {
      direction: TradeDirection;
      entryTime: string;
      entryPrice: number;
      stopLoss: number;
      target1: number;
      target2: number;
      risk: number;
      target1Hit: boolean;
      currentStopLoss: number;
      entryBarIndex: number;
    } | null = null;

    for (const idx of indices) {
      const candle = candles[idx];
      const mins = getIstMinutes(candle.timestamp);
      const e9 = ema9[idx] ?? candle.close;
      const e21 = ema21[idx] ?? candle.close;

      // Update session VWAP
      const vol = candle.volume && candle.volume > 0 ? candle.volume : 1000;
      runningPv += ((candle.high + candle.low + candle.close) / 3) * vol;
      runningVolume += vol;
      const vwap = runningPv / runningVolume;

      // 09:15 to 09:30: Opening Range formulation
      if (mins >= 9 * 60 + 15 && mins <= 9 * 60 + 30) {
        orbHigh = orbHigh === null ? candle.high : Math.max(orbHigh, candle.high);
        orbLow = orbLow === null ? candle.low : Math.min(orbLow, candle.low);
        continue;
      }

      // If active trade is running, evaluate intra-bar exit conditions
      if (activeTrade) {
        const barsHeld = idx - activeTrade.entryBarIndex;
        let exitPrice: number | null = null;
        let outcome: TradeOutcome | null = null;
        let notes = "";

        if (activeTrade.direction === "CE_LONG") {
          // Check Stop Loss
          if (candle.low <= activeTrade.currentStopLoss) {
            exitPrice = activeTrade.currentStopLoss;
            outcome = activeTrade.target1Hit ? "TARGET_1_PARTIAL" : "STOP_LOSS_HIT";
            notes = activeTrade.target1Hit ? "Stopped at breakeven after Target 1" : "Initial stop hit";
          }
          // Check Target 2
          else if (candle.high >= activeTrade.target2) {
            exitPrice = activeTrade.target2;
            outcome = "TARGET_2_HIT";
            notes = "Full Target 2 achieved (+2.5R)";
          }
          // Check Target 1 partial profit & trailing stop
          else if (candle.high >= activeTrade.target1 && !activeTrade.target1Hit) {
            activeTrade.target1Hit = true;
            activeTrade.currentStopLoss = activeTrade.entryPrice; // Move to Breakeven
          }
          // Theta time stop (exceeded max bars without reaching Target 1)
          else if (barsHeld >= thetaMaxBars && !activeTrade.target1Hit) {
            exitPrice = candle.close;
            outcome = "THETA_TIME_STOP";
            notes = `Theta decay protection (held ${barsHeld * 15}m)`;
          }
          // Intraday session square-off at or after 15:15 IST
          else if (mins >= 15 * 60 + 15) {
            exitPrice = candle.close;
            outcome = "SESSION_CLOSE";
            notes = "Intraday 15:15 IST auto square-off";
          }
        } else {
          // PE Short Trade
          if (candle.high >= activeTrade.currentStopLoss) {
            exitPrice = activeTrade.currentStopLoss;
            outcome = activeTrade.target1Hit ? "TARGET_1_PARTIAL" : "STOP_LOSS_HIT";
            notes = activeTrade.target1Hit ? "Stopped at breakeven after Target 1" : "Initial stop hit";
          }
          // Check Target 2
          else if (candle.low <= activeTrade.target2) {
            exitPrice = activeTrade.target2;
            outcome = "TARGET_2_HIT";
            notes = "Full Target 2 achieved (+2.5R)";
          }
          // Check Target 1 partial profit
          else if (candle.low <= activeTrade.target1 && !activeTrade.target1Hit) {
            activeTrade.target1Hit = true;
            activeTrade.currentStopLoss = activeTrade.entryPrice; // Breakeven
          }
          // Theta time stop
          else if (barsHeld >= thetaMaxBars && !activeTrade.target1Hit) {
            exitPrice = candle.close;
            outcome = "THETA_TIME_STOP";
            notes = `Theta decay protection (held ${barsHeld * 15}m)`;
          }
          // Session square-off
          else if (mins >= 15 * 60 + 15) {
            exitPrice = candle.close;
            outcome = "SESSION_CLOSE";
            notes = "Intraday 15:15 IST auto square-off";
          }
        }

        if (exitPrice !== null && outcome !== null) {
          const rawPnl =
            activeTrade.direction === "CE_LONG"
              ? exitPrice - activeTrade.entryPrice
              : activeTrade.entryPrice - exitPrice;
          
          let pnlR = rawPnl / activeTrade.risk;
          // If stopped out after T1 was hit, 50% locked at +1.5R, 50% out at 0R => +0.75R
          if (outcome === "TARGET_1_PARTIAL") {
            pnlR = 0.75;
          }

          const trade: HistoricalTrade = {
            id: `trade-${trades.length + 1}`,
            symbol,
            direction: activeTrade.direction,
            entryTime: activeTrade.entryTime,
            exitTime: candle.timestamp,
            entryPrice: Math.round(activeTrade.entryPrice * 100) / 100,
            exitPrice: Math.round(exitPrice * 100) / 100,
            stopLoss: Math.round(activeTrade.stopLoss * 100) / 100,
            target1: Math.round(activeTrade.target1 * 100) / 100,
            target2: Math.round(activeTrade.target2 * 100) / 100,
            riskAmount: Math.round(activeTrade.risk * 100) / 100,
            pnlR: Math.round(pnlR * 100) / 100,
            outcome,
            barsHeld,
            orbHigh: Math.round((orbHigh ?? 0) * 100) / 100,
            orbLow: Math.round((orbLow ?? 0) * 100) / 100,
            notes,
          };

          trades.push(trade);

          // Add exit chart marker
          const exitEpoch = Math.floor(new Date(candle.timestamp).getTime() / 1000);
          chartMarkers.push({
            time: exitEpoch,
            position: activeTrade.direction === "CE_LONG" ? "aboveBar" : "belowBar",
            color: pnlR > 0 ? "#10b981" : "#ef4444",
            shape: pnlR > 0 ? "circle" : "square",
            text: `Exit: ${outcome} (${pnlR >= 0 ? "+" : ""}${trade.pnlR}R)`,
          });

          activeTrade = null;
        }
      }

      // Check for new trade trigger (only if no active trade and before 14:30 IST)
      if (!activeTrade && orbHigh !== null && orbLow !== null && mins > 9 * 60 + 30 && mins < 14 * 60 + 30) {
        const buffer = (calculatedAtr || 10) * atrBufferMult;

        // Long Breakout Trigger: Close > ORB High, Close > VWAP, EMA 9 > EMA 21
        if (candle.close > orbHigh && candle.close > vwap && e9 > e21) {
          const entryPrice = candle.close;
          const stopLoss = orbLow - buffer;
          const risk = Math.max(entryPrice - stopLoss, 1.0);
          const target1 = entryPrice + rr1 * risk;
          const target2 = entryPrice + rr2 * risk;

          activeTrade = {
            direction: "CE_LONG",
            entryTime: candle.timestamp,
            entryPrice,
            stopLoss,
            target1,
            target2,
            risk,
            target1Hit: false,
            currentStopLoss: stopLoss,
            entryBarIndex: idx,
          };

          const entryEpoch = Math.floor(new Date(candle.timestamp).getTime() / 1000);
          chartMarkers.push({
            time: entryEpoch,
            position: "belowBar",
            color: "#10b981",
            shape: "arrowUp",
            text: `BUY CE @ ${entryPrice.toFixed(1)}`,
          });
        }
        // Short Breakdown Trigger: Close < ORB Low, Close < VWAP, EMA 9 < EMA 21
        else if (candle.close < orbLow && candle.close < vwap && e9 < e21) {
          const entryPrice = candle.close;
          const stopLoss = orbHigh + buffer;
          const risk = Math.max(stopLoss - entryPrice, 1.0);
          const target1 = entryPrice - rr1 * risk;
          const target2 = entryPrice - rr2 * risk;

          activeTrade = {
            direction: "PE_SHORT",
            entryTime: candle.timestamp,
            entryPrice,
            stopLoss,
            target1,
            target2,
            risk,
            target1Hit: false,
            currentStopLoss: stopLoss,
            entryBarIndex: idx,
          };

          const entryEpoch = Math.floor(new Date(candle.timestamp).getTime() / 1000);
          chartMarkers.push({
            time: entryEpoch,
            position: "aboveBar",
            color: "#ef4444",
            shape: "arrowDown",
            text: `BUY PE @ ${entryPrice.toFixed(1)}`,
          });
        }
      }
    }
  }

  // Calculate Cumulative Performance & Drawdown
  let cumulativeR = 0;
  let peakR = 0;
  let maxDrawdownR = 0;
  const equityCurve: EquityPoint[] = [];

  let winningTrades = 0;
  let losingTrades = 0;
  let breakevenTrades = 0;
  let grossProfitR = 0;
  let grossLossR = 0;
  let longTrades = 0;
  let shortTrades = 0;
  let longWins = 0;
  let shortWins = 0;

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    cumulativeR += t.pnlR;
    if (cumulativeR > peakR) peakR = cumulativeR;
    const currentDd = peakR - cumulativeR;
    if (currentDd > maxDrawdownR) maxDrawdownR = currentDd;

    equityCurve.push({
      timestamp: t.exitTime,
      tradeIndex: i + 1,
      equityR: Math.round(cumulativeR * 100) / 100,
      drawdownR: Math.round(currentDd * 100) / 100,
    });

    if (t.pnlR > 0) {
      winningTrades++;
      grossProfitR += t.pnlR;
      if (t.direction === "CE_LONG") longWins++;
      else shortWins++;
    } else if (t.pnlR < 0) {
      losingTrades++;
      grossLossR += Math.abs(t.pnlR);
    } else {
      breakevenTrades++;
    }

    if (t.direction === "CE_LONG") longTrades++;
    else shortTrades++;
  }

  const totalTrades = trades.length;
  const winRatePct = totalTrades > 0 ? Math.round((winningTrades / totalTrades) * 1000) / 10 : 0;
  const profitFactor = grossLossR > 0 ? Math.round((grossProfitR / grossLossR) * 100) / 100 : grossProfitR > 0 ? 99.9 : 0;
  const expectancyR = totalTrades > 0 ? Math.round((cumulativeR / totalTrades) * 100) / 100 : 0;
  const avgWinR = winningTrades > 0 ? Math.round((grossProfitR / winningTrades) * 100) / 100 : 0;
  const avgLossR = losingTrades > 0 ? Math.round((grossLossR / losingTrades) * 100) / 100 : 0;
  const winLossRatio = avgLossR > 0 ? Math.round((avgWinR / avgLossR) * 100) / 100 : avgWinR;
  const maxDrawdownPct = peakR > 0 ? Math.round((maxDrawdownR / peakR) * 1000) / 10 : 0;

  const longWinRatePct = longTrades > 0 ? Math.round((longWins / longTrades) * 1000) / 10 : 0;
  const shortWinRatePct = shortTrades > 0 ? Math.round((shortWins / shortTrades) * 1000) / 10 : 0;

  return {
    symbol,
    timeframe,
    totalCandles: candles.length,
    startDate: candles[0]?.timestamp ?? "",
    endDate: candles[candles.length - 1]?.timestamp ?? "",
    metrics: {
      totalTrades,
      winningTrades,
      losingTrades,
      breakevenTrades,
      winRatePct,
      profitFactor,
      netR: Math.round(cumulativeR * 100) / 100,
      maxDrawdownR: Math.round(maxDrawdownR * 100) / 100,
      maxDrawdownPct,
      expectancyR,
      avgWinR,
      avgLossR,
      winLossRatio,
      longTrades,
      shortTrades,
      longWinRatePct,
      shortWinRatePct,
    },
    trades,
    equityCurve,
    chartMarkers,
    pineScript: generateTradingViewPineScript({
      symbol,
      rrTarget1: rr1,
      rrTarget2: rr2,
      atrBuffer: atrBufferMult,
      thetaMaxBars,
    }),
  };
}
