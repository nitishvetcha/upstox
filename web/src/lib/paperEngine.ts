import type { Analysis, OptionRow, Quote, Snapshot, TradePlan } from "./types.ts";
import type {
  ExitReason,
  FillPriceSource,
  PaperPortfolioSummary,
  PaperTrade,
  PaperTradeEvent,
  PaperTradeLeg,
  PaperTradeStatus,
} from "./paperTypes.ts";
import { validateTransition } from "./paperStateMachine.ts";
import { evaluateTradeRisk } from "./services/risk/riskService.ts";
import { getRiskConfig, type RiskConfig } from "./services/risk/riskConfig.ts";

const STARTING_CAPITAL = 100_000;

function generateId(): string {
  return `pt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function rowForStrike(snapshot: Snapshot, strike: number): OptionRow | undefined {
  return snapshot.chain.find((r) => r.strike === strike);
}

function quoteForLeg(row: OptionRow | undefined, type: "CE" | "PE"): Quote | undefined {
  if (!row) return undefined;
  return type === "CE" ? row.call : row.put;
}

/**
 * Calculates entry fill price and source for a leg based on bid/ask and configured slippage.
 * Long entries prefer ask; short entries prefer bid.
 */
export function calculateEntryFill(
  leg: { side: "BUY" | "SELL"; type: "CE" | "PE"; strike: number; ltp: number },
  quote: Quote | undefined,
  slippagePct = 1.0,
): { fillPrice: number; source: FillPriceSource } {
  const mult = slippagePct / 100;
  if (leg.side === "BUY") {
    if (quote?.ask != null && quote.ask > 0) {
      return { fillPrice: Math.round(quote.ask * (1 + mult) * 100) / 100, source: "ASK" };
    }
    const base = quote?.ltp || leg.ltp;
    return { fillPrice: Math.round(base * (1 + mult) * 100) / 100, source: "LTP_FALLBACK" };
  } else {
    if (quote?.bid != null && quote.bid > 0) {
      return { fillPrice: Math.round(quote.bid * (1 - mult) * 100) / 100, source: "BID" };
    }
    const base = quote?.ltp || leg.ltp;
    return { fillPrice: Math.round(base * (1 - mult) * 100) / 100, source: "LTP_FALLBACK" };
  }
}

/**
 * Calculates exit fill price and source for a leg based on bid/ask and configured slippage.
 * Closing a BUY leg involves selling (prefer bid); closing a SELL leg involves buying (prefer ask).
 */
export function calculateExitFill(
  leg: PaperTradeLeg,
  quote: Quote | undefined,
  slippagePct = 1.0,
): { fillPrice: number; source: FillPriceSource } {
  const mult = slippagePct / 100;
  if (leg.side === "BUY") {
    // Exiting a long position -> selling at bid
    if (quote?.bid != null && quote.bid > 0) {
      return { fillPrice: Math.round(quote.bid * (1 - mult) * 100) / 100, source: "BID" };
    }
    const base = quote?.ltp ?? leg.currentPrice ?? leg.entryFillPrice;
    return { fillPrice: Math.round(base * (1 - mult) * 100) / 100, source: "LTP_FALLBACK" };
  } else {
    // Exiting a short position -> buying back at ask
    if (quote?.ask != null && quote.ask > 0) {
      return { fillPrice: Math.round(quote.ask * (1 + mult) * 100) / 100, source: "ASK" };
    }
    const base = quote?.ltp ?? leg.currentPrice ?? leg.entryFillPrice;
    return { fillPrice: Math.round(base * (1 + mult) * 100) / 100, source: "LTP_FALLBACK" };
  }
}

/**
 * Independent P&L Calculation per unit for any strategy plan and set of leg prices.
 */
export function calculateNetValue(
  legs: { side: "BUY" | "SELL"; type: "CE" | "PE"; strike: number }[],
  getLegPrice: (leg: { side: "BUY" | "SELL"; type: "CE" | "PE"; strike: number }) => number,
): number {
  let total = 0;
  for (const leg of legs) {
    const price = getLegPrice(leg);
    if (leg.side === "BUY") {
      total += price;
    } else {
      total -= price;
    }
  }
  return Math.round(total * 100) / 100;
}

/**
 * Calculates total P&L in INR for a paper trade.
 * For long single-leg / debit: (exitNet - entryNet) * quantity
 * For multi-leg: sum of (exitLeg - entryLeg) * sideMult * quantity
 */
export function calculateTradePnL(
  legs: PaperTradeLeg[],
  quantity: number,
  isClosed = false,
): { pnl: number; currentNetPrice: number } {
  let totalPnL = 0;
  let currentNet = 0;

  for (const leg of legs) {
    const activePrice = isClosed ? (leg.exitPrice ?? leg.entryFillPrice) : (leg.currentPrice ?? leg.entryFillPrice);
    if (leg.side === "BUY") {
      currentNet += activePrice;
      totalPnL += (activePrice - leg.entryFillPrice) * quantity;
    } else {
      currentNet -= activePrice;
      totalPnL += (leg.entryFillPrice - activePrice) * quantity;
    }
  }

  return {
    pnl: Math.round(totalPnL * 100) / 100,
    currentNetPrice: Math.round(currentNet * 100) / 100,
  };
}

export class PaperTradingEngine {
  private trades: PaperTrade[] = [];
  private events: PaperTradeEvent[] = [];
  private overrideConfig?: Partial<RiskConfig>;

  constructor(overrideConfig?: Partial<RiskConfig>) {
    this.overrideConfig = overrideConfig;
  }

  public getTrades(): PaperTrade[] {
    return [...this.trades];
  }

  public getTrade(id: string): PaperTrade | undefined {
    return this.trades.find((t) => t.id === id);
  }

  public getEvents(tradeId?: string): PaperTradeEvent[] {
    if (tradeId) return this.events.filter((e) => e.tradeId === tradeId);
    return [...this.events];
  }

  public setTrades(trades: PaperTrade[], events: PaperTradeEvent[] = []): void {
    this.trades = trades;
    this.events = events;
  }

  /**
   * Attempts to process an analysis recommendation and create a paper trade.
   */
  public processRecommendation(
    analysis: Analysis,
    now: Date = new Date(),
    overrideInputs?: { existingOpenRisk?: number; realizedDailyLoss?: number },
  ): { created: boolean; trade: PaperTrade | null; reason: string } {
    const snapshot = analysis.snapshot;
    const plan = analysis.plan;

    // 1. Freshness check: MUST be LIVE or MOCK
    const src = snapshot.sources.market.source;
    if (src !== "LIVE" && src !== "MOCK") {
      return { created: false, trade: null, reason: `FRESHNESS_BLOCKED: Market data source is ${src}` };
    }
    if (snapshot.breadth?.status === "END_OF_DAY" || snapshot.breadth?.status === "STALE") {
      return { created: false, trade: null, reason: `FRESHNESS_BLOCKED: Breadth status is ${snapshot.breadth.status}` };
    }

    // 2. Status check: MUST be TRADE
    if (analysis.status !== "TRADE" || !plan) {
      return { created: false, trade: null, reason: `RECOMMENDATION_NOT_TRADE: Status is ${analysis.status}` };
    }

    // 3. Duplicate check: Same index, strategy, and signal time window
    const recentDuplicate = this.trades.find(
      (t) =>
        t.index === snapshot.index &&
        t.strategy === plan.strategy &&
        (t.status === "OPEN" || t.status === "PENDING") &&
        Math.abs(new Date(t.createdAt).getTime() - now.getTime()) < 5 * 60_000,
    );

    if (recentDuplicate) {
      return { created: false, trade: null, reason: "DUPLICATE_TRADE_PREVENTED: Identical position is already open" };
    }

    // 4. Position limits & Risk Engine re-evaluation
    const openTrades = this.trades.filter((t) => t.status === "OPEN" || t.status === "PENDING");
    const currentOpenPositions = openTrades.length;
    const existingOpenRisk = overrideInputs?.existingOpenRisk ?? openTrades.reduce((acc, t) => acc + t.riskAmount, 0);

    const closedToday = this.trades.filter(
      (t) => (t.status === "CLOSED" || t.status === "TARGET_HIT" || t.status === "STOPPED_OUT") && t.exitTimestamp && new Date(t.exitTimestamp).toDateString() === now.toDateString(),
    );
    const realizedDailyLoss = overrideInputs?.realizedDailyLoss ?? Math.abs(closedToday.filter((t) => (t.realizedPnL ?? 0) < 0).reduce((acc, t) => acc + (t.realizedPnL ?? 0), 0));

    const riskConfig = getRiskConfig(this.overrideConfig);
    const riskAssessment = evaluateTradeRisk(
      plan,
      snapshot,
      {
        currentOpenPositions,
        existingOpenRisk,
        realizedDailyLoss,
      },
      this.overrideConfig,
      now,
    );

    if (!riskAssessment.allowed) {
      const reason = `RISK_REJECTED: ${riskAssessment.humanReasons[0] ?? riskAssessment.reasons[0]}`;
      return { created: false, trade: null, reason };
    }

    // 5. Fill paper legs with slippage
    const legs: PaperTradeLeg[] = plan.legs.map((leg) => {
      const row = rowForStrike(snapshot, leg.strike);
      const quote = quoteForLeg(row, leg.type);
      const fill = calculateEntryFill(leg, quote, riskConfig.optionSlippagePercent);
      return {
        side: leg.side,
        type: leg.type,
        strike: leg.strike,
        entryLtp: leg.ltp,
        entryFillPrice: fill.fillPrice,
        entryFillSource: fill.source,
        currentPrice: fill.fillPrice,
        exitPrice: null,
      };
    });

    // Net entry price calculation
    let entryPrice = 0;
    for (const leg of legs) {
      if (leg.side === "BUY") entryPrice += leg.entryFillPrice;
      else entryPrice -= leg.entryFillPrice;
    }
    entryPrice = Math.round(entryPrice * 100) / 100;

    const tradeId = generateId();
    const trade: PaperTrade = {
      id: tradeId,
      status: "OPEN",
      index: snapshot.index,
      strategy: plan.strategy,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      signalTimestamp: now.toISOString(),
      entryTimestamp: now.toISOString(),
      exitTimestamp: null,
      expiry: snapshot.expiry,
      legs,
      entryPrice,
      currentPrice: entryPrice,
      exitPrice: null,
      quantity: riskAssessment.quantity,
      lots: riskAssessment.lots,
      lotSize: riskAssessment.lotSize,
      stopLoss: plan.stop,
      target1: plan.target1,
      target2: plan.target2,
      realizedPnL: null,
      unrealizedPnL: 0,
      maxProfit: plan.maxProfit,
      maxLoss: plan.maxLoss,
      exitReason: null,
      targetReached: null,
      recommendationScore: plan.score,
      confidence: Math.round((analysis.factors.reduce((acc, f) => acc + (f.available ? f.score : 0), 0) / 100) * 100),
      riskAmount: riskAssessment.totalRisk,
      riskReward: plan.rr,
      marketDataTimestamp: snapshot.sources.market.lastTradeTime ?? snapshot.sources.market.fetchedAt ?? now.toISOString(),
      marketDataSource: "UPSTOX_LIVE",
      executionMode: "PAPER",
      riskConfigSnapshot: riskConfig,
      riskAssessmentSnapshot: riskAssessment,
    };

    validateTransition("PENDING", "OPEN");
    this.trades.push(trade);

    const event: PaperTradeEvent = {
      timestamp: now.toISOString(),
      tradeId,
      event: "PAPER_TRADE_OPENED",
      marketDataTimestamp: trade.marketDataTimestamp,
      price: entryPrice,
      reason: "Paper trade opened automatically from approved LIVE recommendation",
      details: { legs, quantity: trade.quantity, totalRisk: trade.riskAmount },
    };
    this.events.push(event);

    return { created: true, trade, reason: "PAPER_TRADE_OPENED" };
  }

  /**
   * Revalues open paper trades against fresh market data and checks stops, targets, and expiry.
   */
  public evaluateOpenTrades(snapshot: Snapshot, now: Date = new Date()): PaperTrade[] {
    const updated: PaperTrade[] = [];
    const riskConfig = getRiskConfig(this.overrideConfig);

    for (const trade of this.trades) {
      if (trade.status !== "OPEN") continue;
      if (trade.index !== snapshot.index) continue;

      // Update current leg prices from fresh snapshot
      let currentNet = 0;
      for (const leg of trade.legs) {
        const row = rowForStrike(snapshot, leg.strike);
        const quote = quoteForLeg(row, leg.type);
        const currentPrice = quote?.ltp ?? leg.currentPrice ?? leg.entryFillPrice;
        leg.currentPrice = currentPrice;
        if (leg.side === "BUY") currentNet += currentPrice;
        else currentNet -= currentPrice;
      }
      trade.currentPrice = Math.round(currentNet * 100) / 100;
      const pnlInfo = calculateTradePnL(trade.legs, trade.quantity, false);
      trade.unrealizedPnL = pnlInfo.pnl;
      trade.updatedAt = now.toISOString();
      trade.marketDataTimestamp = snapshot.sources.market.lastTradeTime ?? snapshot.sources.market.fetchedAt ?? now.toISOString();

      // Check Expiry
      const expiryDate = new Date(`${trade.expiry}T15:30:00+05:30`);
      if (now.getTime() >= expiryDate.getTime()) {
        this.closeTrade(trade, "EXPIRED", snapshot, now, riskConfig);
        updated.push(trade);
        continue;
      }

      // Check Stop Loss
      // For Long / Debit: currentNet <= stopLoss
      // For Short / Credit: currentNet >= stopLoss
      const isCredit = trade.entryPrice < 0;
      const hitStop = isCredit ? trade.currentPrice >= trade.stopLoss : trade.currentPrice <= trade.stopLoss;

      if (hitStop) {
        this.closeTrade(trade, "STOPPED_OUT", snapshot, now, riskConfig);
        updated.push(trade);
        continue;
      }

      // Check Targets
      const hitTarget1 = isCredit ? trade.currentPrice <= trade.target1 : trade.currentPrice >= trade.target1;
      if (hitTarget1) {
        trade.targetReached = 1;
        this.closeTrade(trade, "TARGET_HIT", snapshot, now, riskConfig);
        updated.push(trade);
        continue;
      }

      updated.push(trade);
    }

    return updated;
  }

  /**
   * Closes an open paper trade with exit fill slippage.
   */
  public closeTrade(
    trade: PaperTrade,
    reason: PaperTradeStatus,
    snapshot?: Snapshot,
    now: Date = new Date(),
    config: RiskConfig = getRiskConfig(this.overrideConfig),
  ): PaperTrade {
    validateTransition(trade.status, reason);

    trade.status = reason;
    trade.exitReason =
      reason === "TARGET_HIT" ? "TARGET" : reason === "STOPPED_OUT" ? "STOP_LOSS" : reason === "EXPIRED" ? "EXPIRY" : "MANUAL_CLOSE";
    trade.exitTimestamp = now.toISOString();
    trade.updatedAt = now.toISOString();

    let exitNet = 0;
    for (const leg of trade.legs) {
      const row = snapshot ? rowForStrike(snapshot, leg.strike) : undefined;
      const quote = quoteForLeg(row, leg.type);
      const fill = calculateExitFill(leg, quote, config.optionSlippagePercent);
      leg.exitPrice = fill.fillPrice;
      leg.exitFillSource = fill.source;
      if (leg.side === "BUY") exitNet += fill.fillPrice;
      else exitNet -= fill.fillPrice;
    }

    trade.exitPrice = Math.round(exitNet * 100) / 100;
    const finalPnL = calculateTradePnL(trade.legs, trade.quantity, true);
    trade.realizedPnL = finalPnL.pnl;
    trade.unrealizedPnL = 0;

    const eventName = reason === "EXPIRED" ? "PAPER_TRADE_EXPIRED" : "PAPER_TRADE_EXITED";
    this.events.push({
      timestamp: now.toISOString(),
      tradeId: trade.id,
      event: eventName,
      marketDataTimestamp: snapshot?.sources.market.lastTradeTime ?? snapshot?.sources.market.fetchedAt ?? now.toISOString(),
      price: trade.exitPrice,
      reason: `Trade exited via ${trade.exitReason}`,
      details: { realizedPnL: trade.realizedPnL, exitPrice: trade.exitPrice },
    });

    return trade;
  }

  /**
   * Calculates summary statistics for the paper portfolio.
   */
  public getPortfolioSummary(): PaperPortfolioSummary {
    const openTrades = this.trades.filter((t) => t.status === "OPEN");
    const closedTrades = this.trades.filter((t) => t.status === "CLOSED" || t.status === "TARGET_HIT" || t.status === "STOPPED_OUT" || t.status === "EXPIRED");

    const realizedPnL = Math.round(closedTrades.reduce((acc, t) => acc + (t.realizedPnL ?? 0), 0) * 100) / 100;
    const unrealizedPnL = Math.round(openTrades.reduce((acc, t) => acc + (t.unrealizedPnL ?? 0), 0) * 100) / 100;
    const totalPnL = Math.round((realizedPnL + unrealizedPnL) * 100) / 100;

    const currentCapital = Math.round((STARTING_CAPITAL + totalPnL) * 100) / 100;
    const openRisk = Math.round(openTrades.reduce((acc, t) => acc + t.riskAmount, 0) * 100) / 100;
    const maxRiskCap = Math.round(STARTING_CAPITAL * 0.03 * 100) / 100; // 3% max open risk default
    const availableRisk = Math.max(0, Math.round((maxRiskCap - openRisk) * 100) / 100);

    const winningTrades = closedTrades.filter((t) => (t.realizedPnL ?? 0) > 0);
    const losingTrades = closedTrades.filter((t) => (t.realizedPnL ?? 0) < 0);

    const winRate = closedTrades.length > 0 ? Math.round((winningTrades.length / closedTrades.length) * 1000) / 10 : null;
    const averageWin = winningTrades.length > 0 ? Math.round((winningTrades.reduce((acc, t) => acc + (t.realizedPnL ?? 0), 0) / winningTrades.length) * 100) / 100 : null;
    const averageLoss = losingTrades.length > 0 ? Math.round((losingTrades.reduce((acc, t) => acc + (t.realizedPnL ?? 0), 0) / losingTrades.length) * 100) / 100 : null;

    return {
      startingCapital: STARTING_CAPITAL,
      currentCapital,
      realizedPnL,
      unrealizedPnL,
      totalPnL,
      openRisk,
      usedRisk: openRisk,
      availableRisk,
      openPositions: openTrades.length,
      closedTrades: closedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      averageWin,
      averageLoss,
      maxDrawdown: null,
    };
  }
}
