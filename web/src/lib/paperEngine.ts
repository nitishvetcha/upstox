import type { Analysis, DataSource, IndexId, OptionRow, Quote, Snapshot } from "./types.ts";
import type {
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
import { costsFor, DEFAULT_TRANSACTION_COSTS, type TransactionCostConfig } from "./services/transactionCosts.ts";
import { calculateNetValue, calculateTradePnL, expiryInstant, istDay, r2, tradeCostsFor } from "./paperMath.ts";
import { buildPaperLedgerReport, CLOSED_STATUSES } from "./paperReport.ts";
import { tradeFreshnessOf } from "./time.ts";
import {
  DEFAULT_SETTLEMENT_DIR,
  buildContractKey,
  isValidDateFormat,
  listSettlementRecords,
  loadMetadata,
  type SettlementContractKey,
  type SettlementRecord,
  type SupportedSettlementSymbol,
} from "./services/settlementIngestion.ts";
import type { PaperTradeSettlementMetadata } from "./paperTypes.ts";

// Re-exported: these were defined here before the math moved to paperMath.ts.
export { calculateNetValue, calculateTradePnL };

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
 * Authoritative contract matching for an option leg against a snapshot.
 * Requires:
 * 1. Matching underlying index (trade.index === snapshot.index)
 * 2. Matching expiry date (trade.expiry === snapshot.expiry)
 * 3. Matching strike row
 * 4. Matching option type (CE vs PE)
 * 5. Matching instrumentKey if present on both leg and quote
 * Fails closed if any identity component does not match or is ambiguous.
 */
export function matchLegQuote(
  snapshot: Snapshot,
  trade: { index: IndexId; expiry: string },
  leg: { strike: number; type: "CE" | "PE"; instrumentKey?: string | null },
): { quote: Quote | undefined; reason?: string } {
  if (snapshot.index !== trade.index) {
    return { quote: undefined, reason: `Underlying mismatch: expected ${trade.index}, got ${snapshot.index}` };
  }
  if (!trade.expiry || !snapshot.expiry || snapshot.expiry !== trade.expiry) {
    return { quote: undefined, reason: `Option chain expiry mismatch: expected ${trade.expiry}, got ${snapshot.expiry}` };
  }
  const row = snapshot.chain.find((r) => r.strike === leg.strike);
  if (!row) {
    return { quote: undefined, reason: `No strike row found for strike ${leg.strike}` };
  }
  const quote = leg.type === "CE" ? row.call : row.put;
  if (!quote) {
    return { quote: undefined, reason: `Missing quote for ${leg.type} on strike ${leg.strike}` };
  }
  if (leg.instrumentKey && quote.instrumentKey) {
    if (leg.instrumentKey !== quote.instrumentKey) {
      return { quote: undefined, reason: `Instrument key mismatch: expected ${leg.instrumentKey}, got ${quote.instrumentKey}` };
    }
  }
  return { quote };
}

/**
 * Derives truthful market-data provenance for paper trades.
 * Genuine Upstox live data requires genuine UPSTOX provider and LIVE source.
 * A null, missing, mock, synthetic, or manual provider is never stamped UPSTOX_LIVE.
 */
export function determineMarketDataSource(snapshot: Snapshot): string {
  const m = snapshot.sources?.market;
  const oc = snapshot.sources?.optionChain;

  if (
    Reflect.get((m ?? {}) as object, "provider") === "MANUAL_UI" ||
    Reflect.get(snapshot as object, "source") === "MANUAL_UI" ||
    Reflect.get(snapshot as object, "fallbackReason") === "MANUAL_UI"
  ) {
    return "MANUAL_UI";
  }

  if (m?.provider === "UPSTOX" && oc?.provider === "UPSTOX") {
    if (m.source === "LIVE" && oc.source === "LIVE") {
      return "UPSTOX_LIVE";
    }
    if (m.source === "END_OF_DAY" || oc.source === "END_OF_DAY") {
      return "UPSTOX_EOD";
    }
    return "UPSTOX_UNVERIFIED";
  }

  if (m?.provider === "MOCK" || oc?.provider === "MOCK" || m?.source === "MOCK" || oc?.source === "MOCK") {
    return "MOCK_SIMULATION";
  }

  if (m?.provider == null || oc?.provider == null) {
    return "SYNTHETIC_TEST";
  }

  return "UNVERIFIED";
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

export interface PaperEngineOptions {
  // Accept MOCK snapshots (deterministic simulation / tests). The persisted app engine sets this to false,
  // so mock data can never open a trade in the real ledger. Default true keeps the unit-test fixtures working.
  allowMock?: boolean;
  costs?: TransactionCostConfig;
  // Called after every state change that must be persisted. May throw: on entry the trade is rolled back.
  onChange?: (trades: PaperTrade[], events: PaperTradeEvent[]) => void;
  // When set, new trades are refused (e.g. the persisted ledger was unreadable and must not be overwritten).
  blocked?: string | null;
}

export class PaperTradingEngine {
  private trades: PaperTrade[] = [];
  private events: PaperTradeEvent[] = [];
  private overrideConfig?: Partial<RiskConfig>;
  private allowMock: boolean;
  private costs: TransactionCostConfig;
  private onChange?: PaperEngineOptions["onChange"];
  private blocked: string | null;
  public lastPersistError: string | null = null;

  constructor(overrideConfig?: Partial<RiskConfig>, options: PaperEngineOptions = {}) {
    this.overrideConfig = overrideConfig;
    this.allowMock = options.allowMock ?? true;
    this.costs = options.costs ?? DEFAULT_TRANSACTION_COSTS;
    this.onChange = options.onChange;
    this.blocked = options.blocked ?? null;
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

  private sourceAcceptable(s: DataSource): boolean {
    return s === "LIVE" || (this.allowMock && s === "MOCK");
  }

  // Returns null on success or the error text. Never throws.
  private persist(): string | null {
    if (!this.onChange) return null;
    try {
      this.onChange(this.trades, this.events);
      this.lastPersistError = null;
      return null;
    } catch (e) {
      this.lastPersistError = (e as Error).message;
      return this.lastPersistError;
    }
  }

  // In-memory state rollback restoring trades and events symmetrically on persistence failures
  private rollbackToSnapshot(savedTrades: PaperTrade[], savedEvents: PaperTradeEvent[]): void {
    this.events = savedEvents;
    for (const saved of savedTrades) {
      const current = this.trades.find((t) => t.id === saved.id);
      if (current) {
        for (const key of Object.keys(current) as (keyof PaperTrade)[]) {
          if (!(key in saved)) {
            delete (current as unknown as Record<keyof PaperTrade, unknown>)[key];
          }
        }
        Object.assign(current, saved);
      }
    }
    this.trades = savedTrades;
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

    if (this.blocked) {
      return { created: false, trade: null, reason: `LEDGER_UNAVAILABLE: ${this.blocked}` };
    }

    // 1. Freshness check: market data must be LIVE (or MOCK only for an engine explicitly allowed to simulate)
    const src = snapshot.sources.market.source;
    if (!this.sourceAcceptable(src)) {
      return { created: false, trade: null, reason: `FRESHNESS_BLOCKED: Market data source is ${src}` };
    }
    const chainSource = snapshot.sources.optionChain.source;
    if (!this.sourceAcceptable(chainSource)) {
      return { created: false, trade: null, reason: `FRESHNESS_BLOCKED: Option chain data source is ${chainSource}` };
    }
    if (snapshot.breadth?.status === "END_OF_DAY" || snapshot.breadth?.status === "STALE") {
      return { created: false, trade: null, reason: `FRESHNESS_BLOCKED: Breadth status is ${snapshot.breadth.status}` };
    }

    // 1b. Contract-level freshness: individual leg quotes must be verified fresh
    if (plan?.legs) {
      for (const leg of plan.legs) {
        const row = rowForStrike(snapshot, leg.strike);
        const quote = quoteForLeg(row, leg.type);
        if (quote?.lastTradeTime !== undefined) {
          if (!quote.lastTradeTime) {
            return { created: false, trade: null, reason: `FRESHNESS_BLOCKED: Contract ${leg.strike} ${leg.type} quote has no exchange trade timestamp` };
          }
          const freshness = tradeFreshnessOf(quote.lastTradeTime, now).freshness;
          if (freshness !== "LIVE") {
            return { created: false, trade: null, reason: `FRESHNESS_BLOCKED: Contract ${leg.strike} ${leg.type} quote is ${freshness}` };
          }
        }
      }
    }

    // 2. Status check: MUST be TRADE
    if (analysis.status !== "TRADE" || !plan) {
      return { created: false, trade: null, reason: `RECOMMENDATION_NOT_TRADE: Status is ${analysis.status}` };
    }

    // 3. Duplicate check (idempotency): one active position per index + strategy, however old it is.
    //    The previous 5-minute window let the same signal open a second identical position 6 minutes later,
    //    and let a restart or a retry re-enter an existing position.
    const duplicate = this.trades.find(
      (t) =>
        t.index === snapshot.index &&
        t.strategy === plan.strategy &&
        (t.status === "OPEN" ||
          t.status === "PENDING" ||
          t.status === "SETTLEMENT_PENDING" ||
          t.status === "SETTLEMENT_UNVERIFIED"),
    );

    if (duplicate) {
      return { created: false, trade: null, reason: `DUPLICATE_TRADE_PREVENTED: ${duplicate.index} ${duplicate.strategy} position ${duplicate.id} is already active` };
    }

    // 4. Position limits & Risk Engine re-evaluation
    const openTrades = this.trades.filter(
      (t) =>
        t.status === "OPEN" ||
        t.status === "PENDING" ||
        t.status === "SETTLEMENT_PENDING" ||
        t.status === "SETTLEMENT_UNVERIFIED",
    );
    const currentOpenPositions = openTrades.length;
    const existingOpenRisk = overrideInputs?.existingOpenRisk ?? openTrades.reduce((acc, t) => acc + t.riskAmount, 0);

    // Realized loss today (IST day), counting every terminal status incl. SETTLED_VERIFIED. Net of costs.
    const today = istDay(now);
    const closedToday = this.trades.filter(
      (t) =>
        (t.status === "CLOSED" ||
          t.status === "TARGET_HIT" ||
          t.status === "STOPPED_OUT" ||
          t.status === "EXPIRED" ||
          t.status === "SETTLED_VERIFIED") &&
        t.exitTimestamp &&
        istDay(t.exitTimestamp) === today,
    );
    const realizedDailyLoss =
      overrideInputs?.realizedDailyLoss ??
      Math.abs(closedToday.filter((t) => (t.realizedPnL ?? 0) < 0).reduce((acc, t) => acc + (t.realizedPnL ?? 0), 0));

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

    if (!riskAssessment.allowed || riskAssessment.portfolioAllowed === false) {
      const reason = `RISK_REJECTED: ${riskAssessment.humanReasons[0] ?? riskAssessment.portfolioHumanReasons?.[0] ?? riskAssessment.reasons[0] ?? "Portfolio risk limit reached"}`;
      return { created: false, trade: null, reason };
    }

    // 5. Fill paper legs with spread (ask/bid) and slippage
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
        instrumentKey: quote?.instrumentKey ?? null,
      };
    });

    // Net entry price calculation
    let entryPrice = 0;
    for (const leg of legs) {
      if (leg.side === "BUY") entryPrice += leg.entryFillPrice;
      else entryPrice -= leg.entryFillPrice;
    }
    entryPrice = Math.round(entryPrice * 100) / 100;

    // 5b. Re-check sizing against the ACTUAL simulated fill. The risk engine sizes on the plan's reference
    //     entry; the fill can change both risk and capital. Size down (never up) so every frozen risk cap
    //     still holds at the price actually simulated.
    let lots = riskAssessment.lots;
    let quantity = riskAssessment.quantity;
    let riskAmount = riskAssessment.totalRisk;
    let sizingNote: string | null = null;
    const actualCredit = -entryPrice;
    const realRiskPerUnit = plan.credit ? plan.stop - actualCredit : entryPrice - plan.stop;
    if (!(realRiskPerUnit > 0)) {
      return { created: false, trade: null, reason: `RISK_REJECTED: Simulated fill ${entryPrice} is at or beyond the stop ${plan.stop}` };
    }
    const actualCapitalPerUnit = plan.credit
      ? Math.max(realRiskPerUnit, (plan.maxLoss ?? realRiskPerUnit) + (plan.entry - actualCredit))
      : entryPrice;
    const maxTradeRisk = riskConfig.accountCapital * (riskConfig.riskPerTradePercent / 100);
    const maxOpenRisk = riskConfig.accountCapital * (riskConfig.maxOpenRiskPercent / 100);
    const maxPositionValue = riskConfig.accountCapital * (riskConfig.maxPositionValuePercent / 100);
    // Same basis as the plan's net worst-case risk (services/risk/riskService.ts): the realised entry, the same stop
    // exit (with its gap allowance), percentage charges recomputed at those realised prices, and the per-trade
    // brokerage taken off first.
    const lotSize = riskAssessment.lotSize;
    const stopExitPerUnit = riskAssessment.worstStopFill ?? plan.stop;
    const realWorstPerUnit = plan.credit ? stopExitPerUnit - actualCredit : entryPrice - stopExitPerUnit;
    if (!(realWorstPerUnit > 0)) {
      return { created: false, trade: null, reason: `RISK_REJECTED: Simulated fill ${entryPrice} leaves no positive risk to the stop after its gap allowance` };
    }
    const fixedCharges = riskAssessment.fixedCostsInr ?? 0;
    const fillEntrySide = plan.credit ? "SELL" : "BUY";
    const fillExitSide = plan.credit ? "BUY" : "SELL";
    const variableAtFill = costsFor(
      [{ side: fillEntrySide, price: entryPrice, quantity: lotSize }, { side: fillExitSide, price: stopExitPerUnit, quantity: lotSize }],
      { ...riskConfig.costs, brokeragePerOrder: 0 },
    ).totalCosts;
    const netRiskPerLotAtFill = realWorstPerUnit * lotSize + variableAtFill;
    const capitalPerLotAtFill = actualCapitalPerUnit * lotSize;
    const remainingOpenRisk = Math.max(0, maxOpenRisk - existingOpenRisk);
    const lotsByTradeRisk = Math.floor((maxTradeRisk - fixedCharges) / netRiskPerLotAtFill);
    const lotsByOpenRisk = Math.floor((remainingOpenRisk - fixedCharges) / netRiskPerLotAtFill);
    const lotsByCapital = Math.floor(maxPositionValue / capitalPerLotAtFill);
    const finalLots = Math.min(lots, lotsByTradeRisk, lotsByOpenRisk, lotsByCapital);
    if (finalLots < 1) {
      return { created: false, trade: null, reason: "RISK_REJECTED: Simulated fill leaves no whole lot within per-trade risk, open-risk, and position-value limits" };
    }
    if (finalLots < lots) sizingNote = `lots reduced ${lots} -> ${finalLots} for fill ${entryPrice} vs plan entry ${plan.entry}`;
    lots = finalLots;
    quantity = lots * lotSize;
    riskAmount = Math.round(fixedCharges + netRiskPerLotAtFill * lots);

    const tradeId = generateId();
    const marketSource = snapshot.sources.market.source;
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
      quantity,
      lots,
      lotSize: riskAssessment.lotSize,
      stopLoss: plan.stop,
      target1: plan.target1,
      target2: plan.target2,
      realizedPnL: null,
      grossPnL: null,
      transactionCosts: null,
      unrealizedPnL: 0,
      maxProfit: plan.maxProfit,
      maxLoss: plan.maxLoss,
      exitReason: null,
      targetReached: null,
      recommendationScore: plan.score,
      confidence: Math.round((analysis.factors.reduce((acc, f) => acc + (f.available ? f.score : 0), 0) / 100) * 100),
      riskAmount,
      riskReward: plan.rr,
      marketDataTimestamp: snapshot.sources.market.lastTradeTime ?? snapshot.sources.market.fetchedAt ?? now.toISOString(),
      // Truthful provenance: genuine UPSTOX provider and LIVE source required for UPSTOX_LIVE
      marketDataSource: determineMarketDataSource(snapshot),
      executionMode: "PAPER",
      monitoring: { status: "OK", lastValidQuoteAt: now.toISOString(), reason: null },
      riskConfigSnapshot: riskConfig,
      riskAssessmentSnapshot: riskAssessment,
    };
    trade.unrealizedPnL = this.markToMarket(trade);

    validateTransition("PENDING", "OPEN");

    const snapshotTrades = structuredClone(this.trades);
    const snapshotEvents = structuredClone(this.events);
    this.trades.push(trade);

    const event: PaperTradeEvent = {
      timestamp: now.toISOString(),
      tradeId,
      event: "PAPER_TRADE_OPENED",
      marketDataTimestamp: trade.marketDataTimestamp,
      price: entryPrice,
      reason: marketSource === "LIVE"
        ? "Paper trade opened automatically from approved LIVE recommendation"
        : "SIMULATION: paper trade opened from a MOCK snapshot (not live-market data)",
      // Event details are an immutable audit snapshot. `trade.legs` is subsequently marked to market.
      details: { legs: structuredClone(legs), quantity: trade.quantity, totalRisk: trade.riskAmount, sizingNote },
    };
    this.events.push(event);

    // A trade that cannot be recorded durably must not exist: roll back so a restart cannot disagree with memory.
    const err = this.persist();
    if (err) {
      this.rollbackToSnapshot(snapshotTrades, snapshotEvents);
      return { created: false, trade: null, reason: `LEDGER_WRITE_FAILED: ${err}` };
    }

    return { created: true, trade, reason: "PAPER_TRADE_OPENED" };
  }

  // Unrealized P&L in INR: gross mark-to-market minus the estimated round-trip costs if closed at current prices.
  private markToMarket(trade: PaperTrade): number {
    const gross = calculateTradePnL(trade.legs, trade.quantity, false).pnl;
    const estCosts = tradeCostsFor(trade.legs, trade.quantity, (l) => l.currentPrice ?? l.entryFillPrice, this.costs).totalCosts;
    return r2(gross - estCosts);
  }

  /**
   * Revalues open paper trades against fresh market data and checks stops, targets, and expiry.
   *
   * A trade is only revalued, and a stop/target only evaluated, when the snapshot source is trusted AND every
   * leg has a positive quote. Otherwise the trade keeps its last verified value, is flagged STALE_QUOTES and no
   * stop/target decision is taken on guessed prices. Expiry is time-based and still applies.
   */
  public evaluateOpenTrades(snapshot: Snapshot, now: Date = new Date()): PaperTrade[] {
    const updated: PaperTrade[] = [];
    const riskConfig = getRiskConfig(this.overrideConfig);
    let changed = false;

    const snapshotTrades = structuredClone(this.trades);
    const snapshotEvents = structuredClone(this.events);

    const sourcesTrusted =
      this.sourceAcceptable(snapshot.sources.market.source) && this.sourceAcceptable(snapshot.sources.optionChain.source);

    for (const trade of this.trades) {
      if (trade.status !== "OPEN") continue;
      if (trade.index !== snapshot.index) continue;

      const expiryDate = expiryInstant(trade.expiry);
      const isExpiredNow = now.getTime() >= expiryDate.getTime();

      // Check Expiry First: transition to SETTLEMENT_PENDING without fabricated exit fills
      // or re-marking from later expiries
      if (isExpiredNow) {
        this.transitionToPendingSettlement(trade, now, false);
        changed = true;
        updated.push(trade);
        continue;
      }

      // Validate contract expiry identity: if snapshot is from a different expiry or missing expiry
      if (!trade.expiry || !snapshot.expiry || snapshot.expiry !== trade.expiry) {
        const reason = "Option chain expiry mismatch";
        if (trade.monitoring?.status !== "STALE_QUOTES") {
          this.events.push({
            timestamp: now.toISOString(),
            tradeId: trade.id,
            event: "PAPER_QUOTE_UNAVAILABLE",
            marketDataTimestamp: trade.marketDataTimestamp,
            price: trade.currentPrice,
            reason: `Position not revalued: ${reason}`,
            details: {
              tradeExpiry: trade.expiry,
              snapshotExpiry: snapshot.expiry,
              lastValidQuoteAt: trade.monitoring?.lastValidQuoteAt ?? null,
            },
          });
        }
        trade.monitoring = {
          status: "STALE_QUOTES",
          lastValidQuoteAt: trade.monitoring?.lastValidQuoteAt ?? trade.entryTimestamp,
          reason,
        };
        trade.updatedAt = now.toISOString();
        changed = true;
        updated.push(trade);
        continue;
      }

      const legQuoteMatches = trade.legs.map((leg) => matchLegQuote(snapshot, trade, leg));
      const legQuotes = legQuoteMatches.map((m) => m.quote);

      let quoteInvalidReason: string | null = null;
      const quotesValid = legQuotes.every((q, i) => {
        const leg = trade.legs[i];
        const match = legQuoteMatches[i];
        if (!q || !Number.isFinite(q.ltp) || q.ltp <= 0) {
          quoteInvalidReason = match.reason ?? "missing or zero quote on one or more legs";
          return false;
        }
        if (q.lastTradeTime !== undefined) {
          if (!q.lastTradeTime) {
            quoteInvalidReason = "missing exchange trade timestamp on one or more legs";
            return false;
          }
          const freshness = tradeFreshnessOf(q.lastTradeTime, now).freshness;
          if (freshness !== "LIVE") {
            quoteInvalidReason = `untrusted ${freshness} quote on one or more legs`;
            return false;
          }
        }
        if (leg.side === "BUY" && (q.bid == null || q.bid <= 0)) {
          quoteInvalidReason = "missing executable bid on long option leg";
          return false;
        }
        if (leg.side === "SELL" && (q.ask == null || q.ask <= 0)) {
          quoteInvalidReason = "missing executable ask on short option leg";
          return false;
        }
        return true;
      });

      if (!sourcesTrusted || !quotesValid) {
        const reason = !sourcesTrusted
          ? `source not trusted (market ${snapshot.sources.market.source}, option chain ${snapshot.sources.optionChain.source})`
          : (quoteInvalidReason ?? "missing or zero quote on one or more legs");
        if (trade.monitoring?.status !== "STALE_QUOTES") {
          this.events.push({
            timestamp: now.toISOString(),
            tradeId: trade.id,
            event: "PAPER_QUOTE_UNAVAILABLE",
            marketDataTimestamp: trade.marketDataTimestamp,
            price: trade.currentPrice,
            reason: `Position not revalued: ${reason}`,
            details: { lastValidQuoteAt: trade.monitoring?.lastValidQuoteAt ?? null },
          });
        }
        trade.monitoring = { status: "STALE_QUOTES", lastValidQuoteAt: trade.monitoring?.lastValidQuoteAt ?? trade.entryTimestamp, reason };
        trade.updatedAt = now.toISOString();
        changed = true;
        updated.push(trade);
        continue;
      }

      // Update current leg prices from fresh snapshot using conservative executable side
      let currentNet = 0;
      trade.legs.forEach((leg, i) => {
        const currentPrice = leg.side === "BUY" ? (legQuotes[i]!.bid ?? legQuotes[i]!.ltp) : (legQuotes[i]!.ask ?? legQuotes[i]!.ltp);
        leg.currentPrice = currentPrice;
        if (leg.side === "BUY") currentNet += currentPrice;
        else currentNet -= currentPrice;
      });
      trade.currentPrice = Math.round(currentNet * 100) / 100;
      trade.unrealizedPnL = this.markToMarket(trade);
      trade.updatedAt = now.toISOString();
      trade.marketDataTimestamp = snapshot.sources.market.lastTradeTime ?? snapshot.sources.market.fetchedAt ?? now.toISOString();
      trade.monitoring = { status: "OK", lastValidQuoteAt: now.toISOString(), reason: null };
      changed = true;

      // Check Stop Loss
      // For Long / Debit: currentNet <= stopLoss
      // For Short / Credit: currentNet >= stopLoss
      const isCredit = trade.entryPrice < 0;
      const hitStop = isCredit ? trade.currentPrice >= trade.stopLoss : trade.currentPrice <= trade.stopLoss;

      if (hitStop) {
        this.closeTrade(trade, "STOPPED_OUT", snapshot, now, riskConfig, false);
        updated.push(trade);
        continue;
      }

      // Check Targets
      const hitTarget1 = isCredit ? trade.currentPrice <= trade.target1 : trade.currentPrice >= trade.target1;
      if (hitTarget1) {
        trade.targetReached = 1;
        this.closeTrade(trade, "TARGET_HIT", snapshot, now, riskConfig, false);
        updated.push(trade);
        continue;
      }

      updated.push(trade);
    }

    if (changed) {
      const err = this.persist();
      if (err) {
        this.rollbackToSnapshot(snapshotTrades, snapshotEvents);
        return this.trades.filter((t) => t.status === "OPEN" && t.index === snapshot.index);
      }
    }
    return updated;
  }

  /**
   * Closes an open paper trade with exit fill spread/slippage and modeled transaction costs.
   * realizedPnL is NET of costs; grossPnL and transactionCosts are stored so it can be reconciled.
   */
  public closeTrade(
    trade: PaperTrade,
    reason: PaperTradeStatus,
    snapshot?: Snapshot,
    now: Date = new Date(),
    config: RiskConfig = getRiskConfig(this.overrideConfig),
    shouldPersist = true,
  ): PaperTrade {
    const snapshotTrades = structuredClone(this.trades);
    const snapshotEvents = structuredClone(this.events);

    validateTransition(trade.status, reason);

    trade.status = reason;
    trade.exitReason =
      reason === "TARGET_HIT" ? "TARGET" : reason === "STOPPED_OUT" ? "STOP_LOSS" : reason === "EXPIRED" ? "EXPIRY" : "MANUAL_CLOSE";
    trade.exitTimestamp = now.toISOString();
    trade.updatedAt = now.toISOString();

    let exitNet = 0;
    const exitSources: FillPriceSource[] = [];

    // Contract identity validation: snapshot must match trade underlying and expiry to be used for quote fills
    let validSnapshot: Snapshot | undefined = snapshot;
    if (snapshot) {
      if (snapshot.index !== trade.index || !snapshot.expiry || !trade.expiry || snapshot.expiry !== trade.expiry) {
        validSnapshot = undefined;
      }
    }

    for (const leg of trade.legs) {
      let quote: Quote | undefined = undefined;
      if (validSnapshot) {
        const match = matchLegQuote(validSnapshot, trade, leg);
        quote = match.quote;
      }
      const fill = calculateExitFill(leg, quote, config.optionSlippagePercent);
      leg.exitPrice = fill.fillPrice;
      leg.exitFillSource = fill.source;
      exitSources.push(fill.source);
      if (leg.side === "BUY") exitNet += fill.fillPrice;
      else exitNet -= fill.fillPrice;
    }

    trade.exitPrice = Math.round(exitNet * 100) / 100;
    const gross = calculateTradePnL(trade.legs, trade.quantity, true).pnl;
    const costs = tradeCostsFor(trade.legs, trade.quantity, (l) => l.exitPrice ?? l.entryFillPrice, this.costs);
    trade.grossPnL = gross;
    trade.transactionCosts = costs;
    trade.realizedPnL = r2(gross - costs.totalCosts);
    trade.unrealizedPnL = 0;

    const eventName = reason === "EXPIRED" ? "PAPER_TRADE_EXPIRED" : "PAPER_TRADE_EXITED";
    this.events.push({
      timestamp: now.toISOString(),
      tradeId: trade.id,
      event: eventName,
      marketDataTimestamp: validSnapshot?.sources.market.lastTradeTime ?? validSnapshot?.sources.market.fetchedAt ?? trade.marketDataTimestamp ?? now.toISOString(),
      price: trade.exitPrice,
      reason: `Trade exited via ${trade.exitReason}`,
      details: {
        realizedPnL: trade.realizedPnL,
        grossPnL: gross,
        costs: costs.totalCosts,
        exitPrice: trade.exitPrice,
        exitFillSources: exitSources,
        exitQuoteVerified: exitSources.every((s) => s !== "LTP_FALLBACK"),
      },
    });

    if (shouldPersist) {
      const err = this.persist();
      if (err) {
        this.rollbackToSnapshot(snapshotTrades, snapshotEvents);
        throw new Error(`LEDGER_PERSIST_FAILED: ${err}`);
      }
    }
    return trade;
  }

  /**
   * Transitions an open trade whose expiry has passed into SETTLEMENT_PENDING.
   * No exit fill, no fabricated LTP or intrinsic fallback, no capital release.
   */
  public transitionToPendingSettlement(
    trade: PaperTrade,
    now: Date = new Date(),
    shouldPersist = true,
  ): PaperTrade {
    const snapshotTrades = structuredClone(this.trades);
    const snapshotEvents = structuredClone(this.events);

    validateTransition(trade.status, "SETTLEMENT_PENDING");
    trade.status = "SETTLEMENT_PENDING";
    trade.updatedAt = now.toISOString();
    trade.exitPrice = null;
    trade.exitTimestamp = null;
    trade.realizedPnL = null;
    for (const leg of trade.legs) {
      leg.exitPrice = null;
      leg.exitFillSource = null;
    }
    this.events.push({
      timestamp: now.toISOString(),
      tradeId: trade.id,
      event: "PAPER_TRADE_SETTLEMENT_PENDING",
      marketDataTimestamp: trade.marketDataTimestamp,
      price: null,
      reason: `Trade expired at ${trade.expiry}; pending authoritative exchange settlement`,
      details: {
        expiry: trade.expiry,
        index: trade.index,
        strategy: trade.strategy,
        riskAmountReserved: trade.riskAmount,
      },
    });

    if (shouldPersist) {
      const err = this.persist();
      if (err) {
        this.rollbackToSnapshot(snapshotTrades, snapshotEvents);
        throw new Error(`LEDGER_PERSIST_FAILED: ${err}`);
      }
    }
    return trade;
  }

  /**
   * Reconciles expired options against authoritative official settlement Bhavcopy records.
   * Matches the exact 5-tuple: (TradDt, TckrSymb, XpryDt, StrkPric, OptnTp).
   * Transitions to SETTLED_VERIFIED on valid match, or SETTLEMENT_UNVERIFIED on missing/ambiguous data.
   * Never fabricates fallback prices. Idempotent: already settled trades are unchanged.
   */
  public settlePendingTrades(
    tradeDate: string,
    options: {
      storageDir?: string;
      now?: Date;
      overrideCosts?: TransactionCostConfig;
    } = {},
  ): {
    settled: PaperTrade[];
    unverified: PaperTrade[];
    errors: string[];
  } {
    const now = options.now ?? new Date();
    const storageDir = options.storageDir ?? DEFAULT_SETTLEMENT_DIR;
    const errors: string[] = [];
    const settled: PaperTrade[] = [];
    const unverified: PaperTrade[] = [];

    if (!isValidDateFormat(tradeDate)) {
      errors.push(`INVALID_TRADE_DATE: ${tradeDate}`);
      return { settled, unverified, errors };
    }

    const eligible = this.trades.filter(
      (t) =>
        (t.status === "SETTLEMENT_PENDING" || t.status === "SETTLEMENT_UNVERIFIED") &&
        t.expiry.slice(0, 10) === tradeDate,
    );

    if (eligible.length === 0) {
      return { settled, unverified, errors };
    }

    const snapshotTrades = structuredClone(this.trades);
    const snapshotEvents = structuredClone(this.events);

    const metadata = loadMetadata(storageDir, tradeDate);
    if (!metadata || (metadata.status !== "SUCCESS" && metadata.status !== "IDEMPOTENT_NOOP")) {
      const reason = !metadata
        ? `No settlement metadata found for trade date ${tradeDate}`
        : `Settlement dataset has non-authoritative status: ${metadata.status}`;
      errors.push(reason);

      for (const trade of eligible) {
        if (trade.status === "SETTLEMENT_PENDING") {
          validateTransition(trade.status, "SETTLEMENT_UNVERIFIED");
          trade.status = "SETTLEMENT_UNVERIFIED";
          trade.updatedAt = now.toISOString();
          trade.settlement = {
            settledAt: now.toISOString(),
            tradeDate,
            archiveHash: metadata?.archiveHash ?? "",
            csvHash: metadata?.csvHash ?? "",
            sourceFile: metadata?.sourceFilename ?? "",
            costVerificationStatus: "UNVERIFIED_MISSING_EXERCISE_SPECIFICATION",
            legs: [],
            unverifiedReason: reason,
          };
          this.events.push({
            timestamp: now.toISOString(),
            tradeId: trade.id,
            event: "PAPER_TRADE_SETTLEMENT_UNVERIFIED",
            marketDataTimestamp: trade.marketDataTimestamp,
            price: null,
            reason,
            details: { tradeDate, status: metadata?.status ?? "MISSING" },
          });
          unverified.push(trade);
        } else {
          unverified.push(trade);
        }
      }
      const err = this.persist();
      if (err) {
        this.rollbackToSnapshot(snapshotTrades, snapshotEvents);
        errors.push(`LEDGER_PERSIST_FAILED: ${err}`);
        return { settled: [], unverified: [], errors };
      }
      return { settled, unverified, errors };
    }

    const allRecords = listSettlementRecords(tradeDate, { storageDir });
    let changed = false;

    for (const trade of eligible) {
      const sym = trade.index.toUpperCase();
      if (sym !== "NIFTY" && sym !== "BANKNIFTY") {
        errors.push(`Unsupported settlement index: ${trade.index}`);
        continue;
      }
      const symbol = sym as SupportedSettlementSymbol;
      const expiryDate = trade.expiry.slice(0, 10);

      let tradeEligible = true;
      let failureReason: string | null = null;
      const legRecords: SettlementRecord[] = [];

      for (const leg of trade.legs) {
        const key: SettlementContractKey = {
          tradeDate,
          symbol,
          expiryDate,
          strikePrice: leg.strike,
          optionType: leg.type,
        };
        const targetKey = buildContractKey(key);
        const matching = allRecords.filter((r) => buildContractKey(r) === targetKey);

        if (matching.length === 0) {
          tradeEligible = false;
          failureReason = `Missing settlement record for contract ${targetKey}`;
          break;
        }
        if (matching.length > 1) {
          tradeEligible = false;
          failureReason = `Ambiguous multiple settlement records found for ${targetKey}`;
          break;
        }

        const rec = matching[0];
        if (typeof rec.settlementPrice !== "number" || !Number.isFinite(rec.settlementPrice) || rec.settlementPrice < 0) {
          tradeEligible = false;
          failureReason = `Invalid settlement price (${rec.settlementPrice}) for contract ${targetKey}`;
          break;
        }

        legRecords.push(rec);
      }

      if (!tradeEligible || legRecords.length !== trade.legs.length) {
        const reason = failureReason ?? `Failed contract matching for trade ${trade.id}`;
        errors.push(reason);

        if (trade.status === "SETTLEMENT_PENDING") {
          validateTransition(trade.status, "SETTLEMENT_UNVERIFIED");
          trade.status = "SETTLEMENT_UNVERIFIED";
          trade.updatedAt = now.toISOString();
          trade.settlement = {
            settledAt: now.toISOString(),
            tradeDate,
            archiveHash: metadata.archiveHash,
            csvHash: metadata.csvHash,
            sourceFile: metadata.sourceFilename,
            costVerificationStatus: "UNVERIFIED_MISSING_EXERCISE_SPECIFICATION",
            legs: [],
            unverifiedReason: reason,
          };
          this.events.push({
            timestamp: now.toISOString(),
            tradeId: trade.id,
            event: "PAPER_TRADE_SETTLEMENT_UNVERIFIED",
            marketDataTimestamp: trade.marketDataTimestamp,
            price: null,
            reason,
            details: { tradeDate, failureReason: reason },
          });
          unverified.push(trade);
          changed = true;
        } else {
          unverified.push(trade);
        }
        continue;
      }

      // Valid match for all legs! Calculate settlement exit fills.
      let exitNet = 0;
      let hasAdvisoryDiscrepancy = false;
      const settlementLegs: PaperTradeSettlementMetadata["legs"] = [];

      for (let i = 0; i < trade.legs.length; i++) {
        const leg = trade.legs[i];
        const rec = legRecords[i];
        leg.exitPrice = rec.settlementPrice;
        leg.exitFillSource = "EXCHANGE_SETTLEMENT";

        if (leg.side === "BUY") exitNet += rec.settlementPrice;
        else exitNet -= rec.settlementPrice;

        if (rec.discrepancyFlag) hasAdvisoryDiscrepancy = true;

        settlementLegs.push({
          strike: leg.strike,
          type: leg.type,
          settlementPrice: rec.settlementPrice,
          underlyingSettlementPrice: rec.underlyingSettlementPrice,
          intrinsicValue: rec.intrinsicValue,
          discrepancyFlag: rec.discrepancyFlag,
        });
      }

      trade.exitPrice = r2(exitNet);
      trade.exitTimestamp = now.toISOString();
      trade.exitReason = "SETTLEMENT";
      trade.updatedAt = now.toISOString();

      const gross = calculateTradePnL(trade.legs, trade.quantity, true).pnl;
      const costConfig = options.overrideCosts ?? this.costs;
      const costs = tradeCostsFor(trade.legs, trade.quantity, (l) => l.exitPrice ?? l.entryFillPrice, costConfig);

      trade.grossPnL = gross;
      trade.transactionCosts = costs;
      trade.realizedPnL = r2(gross - costs.totalCosts);
      trade.unrealizedPnL = 0;

      validateTransition(trade.status, "SETTLED_VERIFIED");
      trade.status = "SETTLED_VERIFIED";

      trade.settlement = {
        settledAt: now.toISOString(),
        tradeDate,
        archiveHash: metadata.archiveHash,
        csvHash: metadata.csvHash,
        sourceFile: metadata.sourceFilename,
        costVerificationStatus: "UNVERIFIED_MISSING_EXERCISE_SPECIFICATION",
        legs: settlementLegs,
        advisoryDiscrepancy: hasAdvisoryDiscrepancy,
      };

      this.events.push({
        timestamp: now.toISOString(),
        tradeId: trade.id,
        event: "PAPER_TRADE_SETTLED_VERIFIED",
        marketDataTimestamp: trade.marketDataTimestamp,
        price: trade.exitPrice,
        reason: `Settled via official exchange settlement data (${tradeDate})`,
        details: {
          tradeDate,
          archiveHash: metadata.archiveHash,
          csvHash: metadata.csvHash,
          sourceFile: metadata.sourceFilename,
          exitPrice: trade.exitPrice,
          grossPnL: trade.grossPnL,
          realizedPnL: trade.realizedPnL,
          costs: costs.totalCosts,
          costVerificationStatus: trade.settlement.costVerificationStatus,
          advisoryDiscrepancy: hasAdvisoryDiscrepancy,
        },
      });

      settled.push(trade);
      changed = true;
    }

    if (changed) {
      const err = this.persist();
      if (err) {
        this.rollbackToSnapshot(snapshotTrades, snapshotEvents);
        errors.push(`LEDGER_PERSIST_FAILED: ${err}`);
        return { settled: [], unverified: [], errors };
      }
    }
    return { settled, unverified, errors };
  }

  /**
   * Calculates summary statistics for the paper portfolio. Derived from the same ledger report the API and the
   * reconciliation use, so the dashboard cannot disagree with the ledger.
   */
  public getPortfolioSummary(): PaperPortfolioSummary {
    const cfg = getRiskConfig(this.overrideConfig);
    const rep = buildPaperLedgerReport(this.trades);
    const startingCapital = cfg.accountCapital;
    const totalPnL = r2(rep.netPnL + rep.unrealizedPnL);
    const maxRiskCap = r2(startingCapital * (cfg.maxOpenRiskPercent / 100));
    const closed = this.trades.filter((t) => (CLOSED_STATUSES as readonly string[]).includes(t.status));

    return {
      startingCapital,
      currentCapital: r2(startingCapital + totalPnL),
      realizedPnL: rep.netPnL,
      unrealizedPnL: rep.unrealizedPnL,
      totalPnL,
      openRisk: rep.exposure.openRisk,
      usedRisk: rep.exposure.openRisk,
      availableRisk: Math.max(0, r2(maxRiskCap - rep.exposure.openRisk)),
      openPositions: rep.exposure.openPositions,
      closedTrades: rep.counts.closed,
      winningTrades: closed.filter((t) => (t.realizedPnL ?? 0) > 0).length,
      losingTrades: closed.filter((t) => (t.realizedPnL ?? 0) < 0).length,
      winRate: rep.winRate,
      averageWin: rep.averageWin,
      averageLoss: rep.averageLoss,
      maxDrawdown: rep.maxDrawdown,
      grossPnL: rep.grossPnL,
      totalCosts: rep.totalCosts,
      profitFactor: rep.profitFactor,
      expectancy: rep.expectancy,
    };
  }
}
