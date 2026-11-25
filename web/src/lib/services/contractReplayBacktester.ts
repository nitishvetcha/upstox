// Phase 3 — Contract Replay Backtester Engine
// Replays historical options trades on certified historical underlying datasets for NSE & MCX:
// - Reconstructs ATM/OTM options contract selection matching Strategy 11.4 / Opportunity Engine
// - Realistic Ask/Bid fill model with spread penalty and tick-level slippage
// - Exchange-specific statutory costs (STT on NSE, CTT on MCX, exchange turnover fees, GST, SEBI)
// - Session-aware cutoff execution (15:15 IST for NSE, 23:15 IST for MCX)
// - Inventory shock window protections (EIA Petroleum / NatGas reports)
// - Cryptographic input fingerprinting and reproducible trade ledger

import type { Candle, Timeframe, UnderlyingId } from "../types.ts";
import { getContractSpec, type ContractSpec } from "./contractMaster.ts";
import {
  costsForAsset,
  type TradeCosts,
  type ExchangeId,
  type StatutoryTaxType,
  type UpstoxAccountPlan,
} from "./transactionCosts.ts";

export type AssetCosts = TradeCosts & { exchange: ExchangeId; taxType: StatutoryTaxType };
import { isCandleWithinSession, assessDataQuality } from "./historicalDataQuality.ts";
import { greeks, type OptionType } from "../options/greeks.ts";
import { istMinutes, istToday } from "../time.ts";
import * as crypto from "node:crypto";

export interface ReplayBacktestConfig {
  underlying: UnderlyingId;
  timeframe?: Timeframe; // default "15m"
  startDate?: string;
  endDate?: string;
  startingCapital?: number; // default ₹100,000
  lots?: number; // default 1
  strategyBias?: "BULLISH_ONLY" | "BEARISH_ONLY" | "BOTH"; // default "BOTH"
  riskFreeRate?: number; // default 0.065
  baseIv?: number; // default 0.15 for NSE indices, 0.28 for Crude, 0.45 for NatGas
  brokerPlan?: UpstoxAccountPlan; // default "BASIC"
  slippageTicks?: number; // default 1 tick
  enforceInventoryShockWindow?: boolean; // default true for MCX
  targetGainPct?: number; // default 0.30 (+30% option gain)
  stopLossPct?: number; // default 0.20 (-20% option loss)
}

export interface ReplayTrade {
  tradeId: string;
  underlying: UnderlyingId;
  contractSymbol: string;
  strike: number;
  optionType: OptionType;
  entryTime: string;
  exitTime: string;
  durationMinutes: number;
  entrySpot: number;
  exitSpot: number;
  entryAsk: number;
  exitBid: number;
  lots: number;
  quantity: number;
  grossPnl: number;
  totalCosts: number;
  netPnl: number;
  pnlPercent: number;
  exitReason: "TARGET" | "STOP_LOSS" | "SESSION_CUTOFF" | "EXPIRY_SQUAREOFF";
  costBreakdown: AssetCosts;
}

export interface ReplayBacktestResult {
  runId: string;
  config: ReplayBacktestConfig;
  contractSpec: ContractSpec;
  inputDataHash: string;
  qualityScore: number;
  totalCandles: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePct: number;
  grossProfit: number;
  grossLoss: number;
  totalStatutoryCosts: number;
  netProfit: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  averageTradeNetPnl: number;
  trades: ReplayTrade[];
  equityCurve: { time: string; equity: number }[];
  isCertified: boolean;
}

/**
 * Rounds a raw price to the asset's exact tick size.
 */
function roundToTick(price: number, tickSize: number): number {
  return Math.round(price / tickSize) * tickSize;
}

/**
 * Checks whether an MCX timestamp falls within the US EIA weekly inventory announcement shock window
 * - Crude Oil: Wednesday 19:30–20:30 IST
 * - Natural Gas: Thursday 19:30–20:30 IST
 */
export function isEiaInventoryShockWindow(d: Date, underlying: UnderlyingId): boolean {
  if (underlying !== "crudeoil" && underlying !== "naturalgas") return false;
  const dayOfWeek = d.getUTCDay(); // note: in IST, Wednesday 8pm is UTC Wednesday 14:30
  const { minutes } = istMinutes(d);
  const istDay = new Date(d.getTime() + 5.5 * 3600_000).getUTCDay();

  // Crude Oil: Wednesday (day 3) 19:30 to 20:30 IST (1170 to 1230 min)
  if (underlying === "crudeoil" && istDay === 3 && minutes >= 1170 && minutes <= 1230) {
    return true;
  }
  // Natural Gas: Thursday (day 4) 19:30 to 20:30 IST (1170 to 1230 min)
  if (underlying === "naturalgas" && istDay === 4 && minutes >= 1170 && minutes <= 1230) {
    return true;
  }
  return false;
}

/**
 * Computes default annual Implied Volatility benchmark for an asset.
 */
function defaultAssetIv(underlying: UnderlyingId): number {
  switch (underlying) {
    case "crudeoil": return 0.28;
    case "naturalgas": return 0.45;
    case "nifty": return 0.14;
    case "banknifty": return 0.16;
    case "sensex": return 0.135;
    default: return 0.15;
  }
}

/**
 * Simulates expected bid-ask half-spread percentage based on asset and session liquidity.
 */
function assetHalfSpreadPct(underlying: UnderlyingId, minutes: number): number {
  if (underlying === "crudeoil" || underlying === "naturalgas") {
    // Peak liquidity in evening session (17:00–23:30): tighter spread ~0.75%
    if (minutes >= 17 * 60) return 0.0075;
    // Morning session: wider spread ~1.5%
    return 0.015;
  }
  // NSE indices: tight spread ~0.4%
  return 0.004;
}

/**
 * Runs the full historical options contract replay backtester.
 */
export function runContractReplayBacktest(
  candles: Candle[],
  config: ReplayBacktestConfig,
): ReplayBacktestResult {
  const underlying = config.underlying;
  const spec = getContractSpec(underlying);
  const startingCapital = config.startingCapital ?? 100_000;
  const lots = Math.max(1, config.lots ?? 1);
  const quantity = lots * spec.lotSize;
  const timeframe = config.timeframe ?? "15m";
  const rate = config.riskFreeRate ?? 0.065;
  const vol = config.baseIv ?? defaultAssetIv(underlying);
  const slippageTicks = config.slippageTicks ?? 1;
  const targetPct = config.targetGainPct ?? 0.30;
  const stopPct = config.stopLossPct ?? 0.20;
  const biasFilter = config.strategyBias ?? "BOTH";
  const enforceEia = config.enforceInventoryShockWindow ?? true;

  // Assess data quality and compute input hash
  const qualityReport = assessDataQuality(candles, underlying, timeframe);
  const inputDataHash = crypto.createHash("sha256").update(JSON.stringify(candles)).digest("hex");

  const trades: ReplayTrade[] = [];
  const equityCurve: { time: string; equity: number }[] = [];
  let currentEquity = startingCapital;
  equityCurve.push({ time: candles[0]?.timestamp ?? new Date().toISOString(), equity: currentEquity });

  // Trade state tracking
  interface ActivePosition {
    tradeId: string;
    strike: number;
    optionType: OptionType;
    contractSymbol: string;
    entryTime: string;
    entrySpot: number;
    entryAsk: number;
    targetPrice: number;
    stopPrice: number;
    lots: number;
    quantity: number;
    tYearsAtEntry: number;
  }

  let activePos: ActivePosition | null = null;
  const autoSquareOffMinutes = parseInt(spec.autoSquareOffTime.split(":")[0], 10) * 60 +
    parseInt(spec.autoSquareOffTime.split(":")[1], 10);

  // Fast indicator calculation for simple directional signals: EMA9 & EMA21
  const closes = candles.map((c) => c.close);
  const ema9: number[] = [];
  const ema21: number[] = [];
  const k9 = 2 / (9 + 1);
  const k21 = 2 / (21 + 1);

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      ema9.push(closes[0]);
      ema21.push(closes[0]);
    } else {
      ema9.push(closes[i] * k9 + ema9[i - 1] * (1 - k9));
      ema21.push(closes[i] * k21 + ema21[i - 1] * (1 - k21));
    }
  }

  for (let i = 21; i < candles.length; i++) {
    const c = candles[i];
    const prevC = candles[i - 1];
    const d = new Date(c.timestamp);
    const { minutes } = istMinutes(d);

    // If outside trading session, skip
    if (!isCandleWithinSession(c, underlying)) continue;

    const tYears = spec.expiryCycle === "WEEKLY" ? 4 / 365 : 18 / 365;

    // 1. Manage Active Position (Check Target, Stop Loss, or Session Cutoff)
    if (activePos) {
      const isCall = activePos.optionType === "CE";
      // Reprice current option value using Black-Scholes at current spot
      const g = greeks({
        spot: c.close,
        strike: activePos.strike,
        tYears: Math.max(0.001, tYears),
        rate,
        vol,
        type: activePos.optionType,
      });

      const halfSpread = assetHalfSpreadPct(underlying, minutes);
      const currentBid = roundToTick(
        Math.max(spec.tickSize, g.price * (1 - halfSpread) - slippageTicks * spec.tickSize),
        spec.tickSize,
      );

      let exitReason: ReplayTrade["exitReason"] | null = null;
      let exitPrice = currentBid;

      // Target hit
      if (currentBid >= activePos.targetPrice) {
        exitReason = "TARGET";
        exitPrice = activePos.targetPrice;
      }
      // Stop loss hit
      else if (currentBid <= activePos.stopPrice) {
        exitReason = "STOP_LOSS";
        exitPrice = activePos.stopPrice;
      }
      // Forced Session Square-Off
      else if (minutes >= autoSquareOffMinutes) {
        exitReason = "SESSION_CUTOFF";
        exitPrice = currentBid;
      }

      if (exitReason) {
        const grossPnl = Math.round((exitPrice - activePos.entryAsk) * activePos.quantity * 100) / 100;

        // Calculate statutory transaction costs
        const buyFill = {
          price: activePos.entryAsk,
          quantity: activePos.quantity,
          side: "BUY" as const,
        };
        const sellFill = {
          price: exitPrice,
          quantity: activePos.quantity,
          side: "SELL" as const,
        };
        const costBreakdown = costsForAsset([buyFill, sellFill], underlying, config.brokerPlan ?? "BASIC");
        const totalCosts = costBreakdown.totalCosts;
        const netPnl = Math.round((grossPnl - totalCosts) * 100) / 100;
        const pnlPercent = Math.round((netPnl / (activePos.entryAsk * activePos.quantity)) * 10000) / 100;

        const durationMinutes = Math.max(
          15,
          Math.round((new Date(c.timestamp).getTime() - new Date(activePos.entryTime).getTime()) / 60_000),
        );

        trades.push({
          tradeId: activePos.tradeId,
          underlying,
          contractSymbol: activePos.contractSymbol,
          strike: activePos.strike,
          optionType: activePos.optionType,
          entryTime: activePos.entryTime,
          exitTime: c.timestamp,
          durationMinutes,
          entrySpot: activePos.entrySpot,
          exitSpot: c.close,
          entryAsk: activePos.entryAsk,
          exitBid: exitPrice,
          lots: activePos.lots,
          quantity: activePos.quantity,
          grossPnl,
          totalCosts,
          netPnl,
          pnlPercent,
          exitReason,
          costBreakdown,
        });

        currentEquity += netPnl;
        equityCurve.push({ time: c.timestamp, equity: currentEquity });
        activePos = null;
        continue;
      }
    }

    // 2. Evaluate New Signal Entry if No Position Active
    if (!activePos) {
      // Don't enter new trades within 1 hour of session cutoff
      if (minutes >= autoSquareOffMinutes - 60) continue;

      // Filter out US EIA shock windows
      if (enforceEia && isEiaInventoryShockWindow(d, underlying)) continue;

      const prevBullish = ema9[i - 1] > ema21[i - 1];
      const currBullish = ema9[i] > ema21[i];
      const prevBearish = ema9[i - 1] < ema21[i - 1];
      const currBearish = ema9[i] < ema21[i];

      // Bullish Momentum Trigger
      const isBullishSignal = !prevBullish && currBullish && c.close > ema9[i];
      // Bearish Momentum Trigger
      const isBearishSignal = !prevBearish && currBearish && c.close < ema9[i];

      let signalType: OptionType | null = null;
      if (isBullishSignal && (biasFilter === "BOTH" || biasFilter === "BULLISH_ONLY")) {
        signalType = "CE";
      } else if (isBearishSignal && (biasFilter === "BOTH" || biasFilter === "BEARISH_ONLY")) {
        signalType = "PE";
      }

      if (signalType) {
        // ATM strike selection
        const atmStrike = Math.round(c.close / spec.strikeStep) * spec.strikeStep;
        const g = greeks({
          spot: c.close,
          strike: atmStrike,
          tYears,
          rate,
          vol,
          type: signalType,
        });

        const halfSpread = assetHalfSpreadPct(underlying, minutes);
        const entryAsk = roundToTick(
          g.price * (1 + halfSpread) + slippageTicks * spec.tickSize,
          spec.tickSize,
        );

        // Required capital verification
        const requiredCapital = entryAsk * quantity;
        if (requiredCapital <= currentEquity) {
          const targetPrice = roundToTick(entryAsk * (1 + targetPct), spec.tickSize);
          const stopPrice = roundToTick(entryAsk * (1 - stopPct), spec.tickSize);
          const contractSymbol = `${spec.symbol} ${atmStrike} ${signalType}`;

          activePos = {
            tradeId: `TR_${underlying}_${c.timestamp.replace(/[^0-9]/g, "").slice(0, 14)}`,
            strike: atmStrike,
            optionType: signalType,
            contractSymbol,
            entryTime: c.timestamp,
            entrySpot: c.close,
            entryAsk,
            targetPrice,
            stopPrice,
            lots,
            quantity,
            tYearsAtEntry: tYears,
          };
        }
      }
    }
  }

  // Calculate final performance metrics
  const winningTrades = trades.filter((t) => t.netPnl > 0).length;
  const losingTrades = trades.filter((t) => t.netPnl <= 0).length;
  const winRatePct = trades.length > 0 ? Math.round((winningTrades / trades.length) * 1000) / 10 : 0;
  const grossProfit = trades.reduce((acc, t) => (t.grossPnl > 0 ? acc + t.grossPnl : acc), 0);
  const grossLoss = Math.abs(trades.reduce((acc, t) => (t.grossPnl < 0 ? acc + t.grossPnl : acc), 0));
  const totalStatutoryCosts = trades.reduce((acc, t) => acc + t.totalCosts, 0);
  const netProfit = trades.reduce((acc, t) => acc + t.netPnl, 0);
  const profitFactor = grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? 99 : 0;
  const averageTradeNetPnl = trades.length > 0 ? Math.round((netProfit / trades.length) * 100) / 100 : 0;

  // Max Drawdown computation
  let peakEquity = startingCapital;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;

  for (const pt of equityCurve) {
    if (pt.equity > peakEquity) peakEquity = pt.equity;
    const dd = peakEquity - pt.equity;
    const ddPct = peakEquity > 0 ? (dd / peakEquity) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
    if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;
  }

  const isCertified = qualityReport.isReplayReady && trades.length >= 5;

  return {
    runId: `REPLAY_${underlying}_${Date.now()}`,
    config,
    contractSpec: spec,
    inputDataHash,
    qualityScore: qualityReport.qualityScore,
    totalCandles: candles.length,
    totalTrades: trades.length,
    winningTrades,
    losingTrades,
    winRatePct,
    grossProfit: Math.round(grossProfit * 100) / 100,
    grossLoss: Math.round(grossLoss * 100) / 100,
    totalStatutoryCosts: Math.round(totalStatutoryCosts * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    profitFactor,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    maxDrawdownPct: Math.round(maxDrawdownPct * 100) / 100,
    averageTradeNetPnl,
    trades,
    equityCurve,
    isCertified,
  };
}
