// Phase 4 — Global Portfolio Circuit Breakers & Heat Stops.
// Enforces institutional-grade risk halts:
// 1. Max Daily Drawdown Halt (2% max loss halts new entries until next session).
// 2. Consecutive Loss Heat Stop (2 consecutive losses trigger a 60-minute cooling-off window).
// 3. Max Concurrent Positions Cap (max 2 active options trades).
// 4. Directional Correlation Guard.

import { getRiskConfig } from "./risk/riskConfig.ts";

export type CircuitBreakerStatus = "NORMAL" | "HEAT_STOP" | "DAILY_HALT" | "POSITION_CAP" | "CORRELATED_LIMIT";

export interface CircuitBreakerState {
  status: CircuitBreakerStatus;
  isTradeAllowed: boolean;
  activeReasons: string[];
  realizedDailyLoss: number;
  unrealizedDailyLoss: number;
  totalDailyDrawdown: number;
  maxDailyLossAllowed: number;
  consecutiveLosses: number;
  currentOpenPositions: number;
  maxConcurrentPositions: number;
  heatStopExpiresAt: string | null;
  cooldownRemainingSec: number;
  updatedAt: string;
}

export interface TradeExitSummary {
  tradeId: string;
  exitTimeIso: string;
  isLoss: boolean;
  realizedPnl: number;
}

class PortfolioCircuitBreaker {
  private status: CircuitBreakerStatus = "NORMAL";
  private consecutiveLosses = 0;
  private heatStopExpiresAtMs: number | null = null;
  private realizedDailyLoss = 0;
  private currentSessionDate: string = new Date().toISOString().slice(0, 10);
  private recentExits: TradeExitSummary[] = [];

  constructor() {
    this.checkSessionReset();
  }

  /**
   * Automatically resets daily counters if date has rolled over.
   */
  private checkSessionReset(now: Date = new Date()): void {
    const today = now.toISOString().slice(0, 10);
    if (today !== this.currentSessionDate) {
      this.currentSessionDate = today;
      this.realizedDailyLoss = 0;
      this.consecutiveLosses = 0;
      this.heatStopExpiresAtMs = null;
      this.status = "NORMAL";
      this.recentExits = [];
    }
  }

  /**
   * Evaluates current circuit breaker status.
   * Includes both realized closed trade losses AND unrealized open position MTM losses.
   */
  public getState(
    now: Date = new Date(),
    openPositionsCount = 0,
    unrealizedMtmLoss = 0
  ): CircuitBreakerState {
    this.checkSessionReset(now);
    const config = getRiskConfig();
    const capital = config.accountCapital > 0 ? config.accountCapital : 100_000;
    const maxDailyLossAllowed = capital * (config.maxDailyLossPercent / 100);
    const maxConcurrent = config.maxConcurrentPositions > 0 ? config.maxConcurrentPositions : 2;

    const reasons: string[] = [];
    let effectiveStatus: CircuitBreakerStatus = "NORMAL";

    const effectiveUnrealizedLoss = Math.max(0, unrealizedMtmLoss);
    const totalDailyDrawdown = this.realizedDailyLoss + effectiveUnrealizedLoss;

    // 1. Check Max Daily Loss Halt (Highest Priority) - combines realized + unrealized MTM loss
    if (totalDailyDrawdown >= maxDailyLossAllowed) {
      effectiveStatus = "DAILY_HALT";
      reasons.push(
        `MAX DAILY DRAWDOWN BREACHED: Cumulative daily drawdown ₹${Math.round(totalDailyDrawdown).toLocaleString("en-IN")} ` +
        `(Realized: ₹${Math.round(this.realizedDailyLoss).toLocaleString("en-IN")}, Open MTM Loss: ₹${Math.round(effectiveUnrealizedLoss).toLocaleString("en-IN")}) ` +
        `exceeded limit of ₹${Math.round(maxDailyLossAllowed).toLocaleString("en-IN")} (${config.maxDailyLossPercent}% of capital). ` +
        `New trades halted until next session (09:15 IST).`
      );
    }
    // 2. Check Consecutive Loss Heat Stop (60-minute cooling off)
    else if (this.heatStopExpiresAtMs !== null && now.getTime() < this.heatStopExpiresAtMs) {
      effectiveStatus = "HEAT_STOP";
      const remainingSec = Math.max(0, Math.round((this.heatStopExpiresAtMs - now.getTime()) / 1000));
      const remainingMin = Math.ceil(remainingSec / 60);
      reasons.push(
        `HEAT STOP ACTIVE: ${this.consecutiveLosses} consecutive losses triggered a cooling-off period. ` +
        `New entries paused for ${remainingMin}m to prevent emotional tilt.`
      );
    }
    // 3. Check Max Concurrent Positions Cap
    else if (openPositionsCount >= maxConcurrent) {
      effectiveStatus = "POSITION_CAP";
      reasons.push(
        `CONCURRENT POSITIONS CAP: Already at ${openPositionsCount}/${maxConcurrent} active positions. ` +
        `Close an existing position before entering a new trade.`
      );
    }

    // Clear expired heat stop
    if (this.heatStopExpiresAtMs !== null && now.getTime() >= this.heatStopExpiresAtMs) {
      this.heatStopExpiresAtMs = null;
      if (effectiveStatus === "HEAT_STOP") {
        effectiveStatus = "NORMAL";
      }
    }

    this.status = effectiveStatus;

    const cooldownRemainingSec =
      this.heatStopExpiresAtMs !== null
        ? Math.max(0, Math.round((this.heatStopExpiresAtMs - now.getTime()) / 1000))
        : 0;

    return {
      status: this.status,
      isTradeAllowed: this.status === "NORMAL",
      activeReasons: reasons,
      realizedDailyLoss: Math.round(this.realizedDailyLoss * 100) / 100,
      unrealizedDailyLoss: Math.round(effectiveUnrealizedLoss * 100) / 100,
      totalDailyDrawdown: Math.round(totalDailyDrawdown * 100) / 100,
      maxDailyLossAllowed: Math.round(maxDailyLossAllowed * 100) / 100,
      consecutiveLosses: this.consecutiveLosses,
      currentOpenPositions: openPositionsCount,
      maxConcurrentPositions: maxConcurrent,
      heatStopExpiresAt:
        this.heatStopExpiresAtMs !== null
          ? new Date(this.heatStopExpiresAtMs).toISOString()
          : null,
      cooldownRemainingSec,
      updatedAt: now.toISOString(),
    };
  }

  /**
   * Evaluates whether an opportunity can be opened right now.
   * Enforces status, MTM drawdown, and correlated exposure between NIFTY/BANKNIFTY/FINNIFTY.
   */
  public canOpenTrade(
    openPositionsCount = 0,
    now: Date = new Date(),
    unrealizedMtmLoss = 0,
    proposedSymbol?: string,
    openUnderlyingSymbols: string[] = []
  ): { allowed: boolean; code?: string; reason?: string } {
    const state = this.getState(now, openPositionsCount, unrealizedMtmLoss);
    if (!state.isTradeAllowed) {
      return {
        allowed: false,
        code: state.status,
        reason: state.activeReasons[0] || "Circuit breaker active",
      };
    }

    // Correlated equity index exposure guard
    if (proposedSymbol && openUnderlyingSymbols.length > 0) {
      const norm = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");
      const p = norm(proposedSymbol);
      const isCorrelatedIndex = (s: string) => s === "NIFTY" || s === "BANKNIFTY" || s === "FINNIFTY";
      if (isCorrelatedIndex(p)) {
        const activeCorrelated = openUnderlyingSymbols.map(norm).find((o) => isCorrelatedIndex(o) && o !== p);
        if (activeCorrelated) {
          return {
            allowed: false,
            code: "CORRELATED_EXPOSURE_LIMIT",
            reason: `CORRELATED EXPOSURE LIMIT: An active position in ${activeCorrelated} is already open. Simultaneous positions across correlated indices (${activeCorrelated} + ${p}) are disallowed to limit joint beta risk.`,
          };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Records a closed trade result and updates circuit breaker state.
   */
  public recordTradeExit(
    trade: { tradeId: string; realizedPnl: number; exitTimeIso?: string },
    now: Date = new Date()
  ): CircuitBreakerState {
    this.checkSessionReset(now);

    const isLoss = trade.realizedPnl < 0;
    const lossAmount = isLoss ? Math.abs(trade.realizedPnl) : 0;

    if (isLoss) {
      this.realizedDailyLoss += lossAmount;
      this.consecutiveLosses += 1;

      // 2 consecutive losses trigger 60-minute heat stop
      if (this.consecutiveLosses >= 2) {
        this.heatStopExpiresAtMs = now.getTime() + 60 * 60 * 1000; // 60 minutes
      }
    } else {
      // Win resets consecutive loss counter
      this.consecutiveLosses = 0;
    }

    this.recentExits.push({
      tradeId: trade.tradeId,
      exitTimeIso: trade.exitTimeIso || now.toISOString(),
      isLoss,
      realizedPnl: trade.realizedPnl,
    });

    return this.getState(now);
  }

  /**
   * Allows manual operator override to reset heat stop.
   */
  public resetHeatStop(): void {
    this.heatStopExpiresAtMs = null;
    this.consecutiveLosses = 0;
    if (this.status === "HEAT_STOP") {
      this.status = "NORMAL";
    }
  }

  /**
   * Testing helper to reset all circuit breaker state.
   */
  public resetAll(): void {
    this.status = "NORMAL";
    this.consecutiveLosses = 0;
    this.heatStopExpiresAtMs = null;
    this.realizedDailyLoss = 0;
    this.currentSessionDate = new Date().toISOString().slice(0, 10);
    this.recentExits = [];
  }
}

// Global singleton instance
export const circuitBreaker = new PortfolioCircuitBreaker();
