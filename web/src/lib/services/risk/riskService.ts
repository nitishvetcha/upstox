import type { Snapshot, TradePlan } from "../../types.ts";
import { freshnessOf } from "../../time.ts";
import { costsFor } from "../transactionCosts.ts";
import type { RiskConfig } from "./riskConfig.ts";
import { getRiskConfig } from "./riskConfig.ts";
import type { RiskAssessment, RiskInputs, RiskRejectionReason, RiskStatus } from "./riskTypes.ts";

const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

export function evaluateTradeRisk(
  plan: TradePlan,
  snapshot: Snapshot,
  inputs?: RiskInputs,
  overrideConfig?: Partial<RiskConfig>,
  now: Date = new Date(),
): RiskAssessment {
  const config = getRiskConfig(overrideConfig);
  const capital = inputs?.overrideCapital ?? config.accountCapital;
  const existingOpenRisk = inputs?.existingOpenRisk ?? 0;
  const realizedDailyLoss = inputs?.realizedDailyLoss ?? 0;
  const currentOpenPositions = inputs?.currentOpenPositions ?? 0;

  const index = snapshot.index;
  const lotSize = snapshot.lotSize ?? null;

  const reasons: RiskRejectionReason[] = [];
  const warnings: string[] = [];
  const humanReasons: string[] = [];

  if (!lotSize || lotSize <= 0) {
    reasons.push("UNKNOWN_LOT_SIZE");
    humanReasons.push("Lot size is unknown or unavailable from contract metadata");
  }

  const effectiveLotSize = lotSize ?? 1;

  const entry = plan.entry;
  const stop = plan.stop;
  const target = plan.target1;
  const isCredit = plan.credit;

  // 1. Basic strategy price validation
  if (entry <= 0) {
    reasons.push("INVALID_ENTRY");
    humanReasons.push("Invalid entry price (<= 0)");
  }
  // Non-finite plan values fail closed. NaN passes ordinary "< limit" and "<= 0" tests, so each is checked explicitly.
  if (!Number.isFinite(entry)) { reasons.push("INVALID_ENTRY"); humanReasons.push("Entry price is not a finite number"); }
  if (!Number.isFinite(stop)) { reasons.push("INVALID_STOP"); humanReasons.push("Stop price is not a finite number"); }
  if (!Number.isFinite(target)) { reasons.push("INVALID_TARGET"); humanReasons.push("Target price is not a finite number"); }
  if (!Number.isFinite(plan.rr)) { reasons.push("INSUFFICIENT_RR"); humanReasons.push("Risk/reward is not a finite number"); }

  let rawRiskPerUnit = 0;
  let maxLossPerUnit = 0;
  let capitalRequiredPerUnit = 0;

  if (isCredit) {
    // Credit strategy (e.g. Iron Condor)
    rawRiskPerUnit = Math.max(0, stop - entry);
    maxLossPerUnit = plan.maxLoss ?? rawRiskPerUnit;
    capitalRequiredPerUnit = maxLossPerUnit;
  } else {
    // Debit strategy (Long Call, Long Put, Bull Call Spread, Bear Put Spread, Straddle)
    rawRiskPerUnit = Math.max(0, entry - stop);
    maxLossPerUnit = plan.maxLoss ?? entry;
    capitalRequiredPerUnit = entry;
  }

  if (!Number.isFinite(rawRiskPerUnit)) rawRiskPerUnit = 0;
  if (!Number.isFinite(capitalRequiredPerUnit)) {
    reasons.push("INSUFFICIENT_CAPITAL");
    humanReasons.push("Capital requirement is not a finite number");
    capitalRequiredPerUnit = 0;
  }

  if (!(rawRiskPerUnit > 0) && !reasons.includes("INVALID_STOP")) {
    reasons.push("INVALID_STOP");
    humanReasons.push("Stop price does not create positive risk");
  }

  // 2. Legacy display values (unchanged meaning, used by backtests and paper sizing): gross risk with entry slippage.
  const slippageMult = 1 + config.optionSlippagePercent / 100;
  const effectiveRiskPerUnit = rawRiskPerUnit * slippageMult;
  const riskPerLot = r2(effectiveRiskPerUnit * effectiveLotSize) ?? 0;

  // 3. Execution fills (B-costs): adverse slippage on entry and on exit, and a gap allowance on stop exits.
  // Debit: buy at entry×(1+entry slippage); sell at stop×(1−exit slippage−gap) and target×(1−exit slippage).
  // Credit: sell at entry×(1−entry slippage); buy back at stop×(1+exit slippage+gap) and target×(1+exit slippage).
  const sE = config.entrySlippagePercent / 100, sX = config.exitSlippagePercent / 100, gap = config.stopGapPercent / 100;
  const entryFill = isCredit ? entry * (1 - sE) : entry * (1 + sE);
  const stopFill = isCredit ? stop * (1 + sX + gap) : Math.max(0, stop * (1 - sX - gap));
  const targetFill = isCredit ? target * (1 + sX) : target * (1 - sX);
  const entrySide = isCredit ? "SELL" : "BUY";
  const exitSide = isCredit ? "BUY" : "SELL";
  const worstRiskPerUnit = Number.isFinite(entryFill) && Number.isFinite(stopFill)
    ? Math.max(0, isCredit ? stopFill - entryFill : entryFill - stopFill)
    : 0;
  if (!(worstRiskPerUnit > 0) && !reasons.includes("INVALID_STOP")) {
    reasons.push("INVALID_STOP");
    humanReasons.push("Stop price does not create positive risk after slippage and gap allowance");
  }

  // Charges: brokerage is one fee per order (entry and exit), so it does not scale with lots. Percentage charges do.
  const costCfg = config.costs;
  const fixedCosts = costsFor(
    [{ side: entrySide, price: 0, quantity: 0 }, { side: exitSide, price: 0, quantity: 0 }],
    costCfg,
  ).totalCosts;
  const variableCostsPerLot = costsFor(
    [{ side: entrySide, price: entryFill, quantity: effectiveLotSize }, { side: exitSide, price: stopFill, quantity: effectiveLotSize }],
    { ...costCfg, brokeragePerOrder: 0 },
  ).totalCosts;
  const netRiskPerLot = r2(worstRiskPerUnit * effectiveLotSize + variableCostsPerLot) ?? 0;

  // 4. Position sizing on the net worst-case risk (fixed charges come off the budget first).
  const maxAllowedTradeRisk = capital * (config.riskPerTradePercent / 100);
  const maxPositionCapital = capital * (config.maxPositionValuePercent / 100);

  const riskBudget = maxAllowedTradeRisk - fixedCosts;
  const lotsByRisk = netRiskPerLot > 0 && riskBudget > 0 ? Math.floor(riskBudget / netRiskPerLot) : 0;
  const capitalPerUnit = isCredit ? capitalRequiredPerUnit : entryFill;
  const capitalPerLot = capitalPerUnit * effectiveLotSize;
  const lotsByCapital = capitalPerLot > 0 ? Math.floor(maxPositionCapital / capitalPerLot) : 0;

  const maxLotsAllowed = Math.max(0, Math.min(lotsByRisk, lotsByCapital, config.maxLotsPerTrade));
  const lots = maxLotsAllowed;
  const quantity = lots * effectiveLotSize;

  const totalRisk = lots > 0 ? Math.round(fixedCosts + netRiskPerLot * lots) : 0;
  const capitalRequired = Math.round(capitalPerLot * lots);

  // Net reward to target 1, after the same charges. Used for the net reward-to-risk check.
  const rewardPerUnit = isCredit ? entryFill - targetFill : targetFill - entryFill;
  const variableTargetCostsPerLot = costsFor(
    [{ side: entrySide, price: entryFill, quantity: effectiveLotSize }, { side: exitSide, price: targetFill, quantity: effectiveLotSize }],
    { ...costCfg, brokeragePerOrder: 0 },
  ).totalCosts;
  const netRewardPerLot = r2(rewardPerUnit * effectiveLotSize - variableTargetCostsPerLot) ?? 0;
  const netRewardRatio = netRiskPerLot > 0 ? r2(netRewardPerLot / netRiskPerLot) : null;

  const maxTheoreticalLoss =
    quantity > 0 && maxLossPerUnit !== null ? Math.round(maxLossPerUnit * quantity) : null;

  const maxProfitPerUnit = plan.maxProfit;
  const maxProfit =
    quantity > 0 && maxProfitPerUnit !== null ? Math.round(maxProfitPerUnit * quantity) : null;

  const riskPercent = capital > 0 ? r2((totalRisk / capital) * 100) ?? 0 : 0;

  // 4. Validation Rules
  if (lots === 0) {
    reasons.push("ZERO_LOTS");
    humanReasons.push(
      `Position size rounds to 0 lots within max trade risk limit (₹${Math.round(maxAllowedTradeRisk).toLocaleString("en-IN")})`,
    );
  }

  if (totalRisk > maxAllowedTradeRisk) {
    reasons.push("RISK_LIMIT_EXCEEDED");
    humanReasons.push(
      `Trade risk ₹${totalRisk.toLocaleString("en-IN")} exceeds max allowed risk ₹${Math.round(maxAllowedTradeRisk).toLocaleString("en-IN")}`,
    );
  }

  const maxOpenRiskAllowed = capital * (config.maxOpenRiskPercent / 100);
  if (existingOpenRisk + totalRisk > maxOpenRiskAllowed) {
    reasons.push("OPEN_RISK_LIMIT");
    humanReasons.push(
      `Combined open risk ₹${(existingOpenRisk + totalRisk).toLocaleString("en-IN")} exceeds portfolio open risk limit ₹${Math.round(maxOpenRiskAllowed).toLocaleString("en-IN")}`,
    );
  }

  const maxDailyLossAllowed = capital * (config.maxDailyLossPercent / 100);
  if (realizedDailyLoss >= maxDailyLossAllowed) {
    reasons.push("DAILY_LOSS_LIMIT");
    humanReasons.push(
      `Realized daily loss ₹${realizedDailyLoss.toLocaleString("en-IN")} has reached max daily loss limit ₹${Math.round(maxDailyLossAllowed).toLocaleString("en-IN")}`,
    );
  }

  if (currentOpenPositions >= config.maxConcurrentPositions) {
    reasons.push("MAX_CONCURRENT_POSITIONS");
    humanReasons.push(
      `Active open positions count (${currentOpenPositions}) has reached or exceeded max concurrent limit (${config.maxConcurrentPositions})`,
    );
  }

  if (capitalRequired > capital) {
    reasons.push("INSUFFICIENT_CAPITAL");
    humanReasons.push(
      `Capital required ₹${capitalRequired.toLocaleString("en-IN")} exceeds available capital ₹${capital.toLocaleString("en-IN")}`,
    );
  }

  // A non-finite rr is already rejected above; only a finite, low rr is reported here.
  if (Number.isFinite(plan.rr) && plan.rr < config.minRiskReward) {
    reasons.push("INSUFFICIENT_RR");
    humanReasons.push(`Risk/reward 1:${plan.rr} is below minimum 1:${config.minRiskReward}`);
  }
  // The gross ratio above ignores costs and slippage. The net ratio, after both, is what the trade actually earns.
  if (netRewardRatio !== null && netRewardRatio < config.minRiskReward && !reasons.includes("INSUFFICIENT_RR")) {
    reasons.push("INSUFFICIENT_RR");
    humanReasons.push(`Net risk/reward after slippage and charges is 1:${netRewardRatio}, below minimum 1:${config.minRiskReward}`);
  }

  // Check event risk (structured level EXTREME only)
  const eventLevel = snapshot.news.detail?.eventRisk?.level;
  if (eventLevel === "EXTREME") {
    reasons.push("EXTREME_EVENT_RISK");
    humanReasons.push("EXTREME event risk active: new trades blocked");
  }

  // Check data freshness via structured freshnessOf
  const mSrc = snapshot.sources.market;
  const oSrc = snapshot.sources.optionChain;
  // A STALE label means the exchange last trade is old. A recent fetchedAt does not override it.
  const isMarketStale = mSrc.source === "UNAVAILABLE" || mSrc.source === "END_OF_DAY" || mSrc.source === "STALE" || freshnessOf(mSrc.fetchedAt, now, 1).freshness === "STALE";
  const isChainStale = oSrc.source === "UNAVAILABLE" || oSrc.source === "END_OF_DAY" || oSrc.source === "STALE" || freshnessOf(oSrc.fetchedAt, now, 1).freshness === "STALE";

  if (isMarketStale || isChainStale) {
    reasons.push("STALE_PRICE");
    humanReasons.push(
      mSrc.source === "END_OF_DAY" || oSrc.source === "END_OF_DAY"
        ? "Quotes are end-of-day (END_OF_DAY); cannot execute live trade after market close"
        : "Market or option chain data is unavailable or stale",
    );
  }

  // Check leg bid-ask spreads
  let hasWideSpread = false;
  if (plan.legs && plan.legs.length > 0 && snapshot.chain) {
    for (const leg of plan.legs) {
      const row = snapshot.chain.find((r) => r.strike === leg.strike);
      const q = leg.type === "CE" ? row?.call : row?.put;
      if (q && q.ltp > 0 && q.bid !== null && q.ask !== null) {
        const pct = ((q.ask - q.bid) / q.ltp) * 100;
        if (pct > 5.0) {
          hasWideSpread = true;
          break;
        }
      }
    }
  }

  if (hasWideSpread || (plan.rejected && plan.rejected.toLowerCase().includes("spread too wide"))) {
    reasons.push("WIDE_BID_ASK");
    if (!humanReasons.some((r) => r.toLowerCase().includes("spread too wide"))) {
      humanReasons.push("Bid-ask spread too wide on one or more legs (> 5.0%)");
    }
  }

  if (plan.rejected && !hasWideSpread) {
    humanReasons.push(plan.rejected);
  }

  // Assumptions are stated, never hidden. They are configuration, not validated market facts.
  const assumptions = [
    `Entry slippage ${config.entrySlippagePercent}% and exit slippage ${config.exitSlippagePercent}% (adverse, configured assumption)`,
    `Stop gap allowance ${config.stopGapPercent}%: a stop may execute this far beyond its price. Losses beyond that are not covered.`,
    `Charges: brokerage ₹${config.costs.brokeragePerOrder} per order; STT, exchange (including IPFT), SEBI, GST and stamp duty per the configured schedule (${config.costs.source})`,
    "Not modelled: STT on exercise (no exercise occurs: exits before 15:15 on expiry), overnight and event gaps beyond the allowance, and margin requirements for spreads.",
  ];
  warnings.push(...assumptions);
  if (config.costs.brokeragePerOrder === 0) warnings.push("Brokerage is configured as ₹0 per order: set your broker's rate, or costs are understated.");
  if (existingOpenRisk === 0) {
    warnings.push("No live portfolio positions connected (configured default open risk: ₹0)");
  }
  if (realizedDailyLoss === 0) {
    warnings.push("No trade ledger connected (configured default daily loss: ₹0)");
  }

  const allowed = reasons.length === 0 && lots > 0;
  const status: RiskStatus = allowed ? "APPROVED" : "REJECTED";

  return {
    status,
    allowed,
    index,
    lotSize: effectiveLotSize,
    entryPrice: entry,
    stopPrice: stop,
    targetPrice: target,
    riskPerUnit: r2(effectiveRiskPerUnit) ?? 0,
    riskPerLot,
    netRiskPerLot,
    fixedCostsInr: r2(fixedCosts) ?? 0,
    variableCostsPerLot: r2(variableCostsPerLot) ?? 0,
    entryFill: r2(entryFill) ?? 0,
    worstStopFill: r2(stopFill) ?? 0,
    targetFill: r2(targetFill) ?? 0,
    netRewardRatio,
    assumptions,
    quantity,
    lots,
    maxLotsAllowed: Math.min(lotsByRisk, config.maxLotsPerTrade),
    totalRisk,
    maxTheoreticalLoss,
    maxProfit,
    riskRewardRatio: plan.rr,
    capitalRequired,
    riskPercent,
    breakevens: plan.breakevens,
    reasons,
    warnings,
    humanReasons,
  };
}
