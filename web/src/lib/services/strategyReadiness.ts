// Strategy-specific evidence gates for the free, live-paper validation program.
// This module deliberately cannot approve real-money trading. Its only positive
// verdict means that a strategy has earned a human review after enough verified
// paper observations; it is not a profitability claim or investment advice.
import { TERMINAL_STATES, type PaperOpportunity } from "./paperOpportunityStore.ts";
import type { PaperTrade } from "../paperTypes.ts";

export const PAPER_READINESS_REQUIREMENTS = {
  // Human-capital review requires a meaningful sample for each isolated market/setup.
  minimumCompletedTrades: 250,
  minimumProfitFactor: 1.15,
  maximumDrawdownR: 15,
  minimumNetR: 0,
  minimumDistinctRegimes: 3,
  // A setup is not allowed to influence its parent strategy's evidence until
  // it has produced this many verified outcomes on its own.
  setupQuarantineTrades: 30,
} as const;

export type ReadinessStrategy = "EQUITY_STOCKS" | "NIFTY_OPTIONS" | "BANKNIFTY_OPTIONS" | "OTHER_INDEX_OPTIONS" | "MCX_CRUDEOIL" | "MCX_NATURALGAS";
export type PaperReadinessVerdict = "INSUFFICIENT_EVIDENCE" | "HOLD" | "PAPER_EVIDENCE_SUFFICIENT";

export interface StrategyReadinessReport {
  strategy: ReadinessStrategy;
  completedTrades: number;
  quarantinedTrades: number;
  excludedRecords: number;
  costedLedgerRecords: number;
  wins: number;
  losses: number;
  netR: number;
  averageR: number | null;
  profitFactor: number | null;
  maxDrawdownR: number;
  distinctRegimes: string[];
  setups: SetupEvidence[];
  verdict: PaperReadinessVerdict;
  blockers: string[];
  nextRequirement: string;
  realMoneyEligible: false;
}
export interface SetupEvidence {
  setup: string;
  completedTrades: number;
  netR: number;
  profitFactor: number | null;
  maxDrawdownR: number;
  status: "INSUFFICIENT_SAMPLE" | "OBSERVATION_ONLY" | "ELIGIBLE_FOR_STRATEGY_REVIEW";
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function categoryOf(opp: PaperOpportunity): ReadinessStrategy | null {
  const underlying = opp.underlying.trim().toUpperCase();
  if (opp.instrumentType === "STOCK") return "EQUITY_STOCKS";
  if (underlying === "CRUDEOIL") return "MCX_CRUDEOIL";
  if (underlying === "NATURALGAS") return "MCX_NATURALGAS";
  if (underlying === "NIFTY") return "NIFTY_OPTIONS";
  if (underlying === "BANKNIFTY") return "BANKNIFTY_OPTIONS";
  return "OTHER_INDEX_OPTIONS";
}

function isVerifiedCompletedLivePaper(opp: PaperOpportunity): boolean {
  // Manual, fixture, mock, stale, and legacy records must never build a case
  // for promotion. The collector stamps a provenance field specifically for
  // this purpose.
  return opp.provenance === "LIVE_COLLECTOR" &&
    opp.source === "LIVE" &&
    opp.status !== "EOD_UNPRICED" &&
    TERMINAL_STATES.includes(opp.status) &&
    typeof opp.realizedR === "number" &&
    Number.isFinite(opp.realizedR);
}

function isClosedCostedLiveTrade(trade: PaperTrade | undefined): trade is PaperTrade {
  return !!trade &&
    trade.marketDataSource === "UPSTOX_LIVE" &&
    trade.exitTimestamp !== null &&
    typeof trade.realizedPnL === "number" && Number.isFinite(trade.realizedPnL) &&
    typeof trade.riskAmount === "number" && Number.isFinite(trade.riskAmount) && trade.riskAmount > 0 &&
    trade.transactionCosts !== null && trade.transactionCosts !== undefined;
}

export interface ReadinessEvidenceOptions {
  costedTrades?: PaperTrade[];
  // The operator-facing API sets this true. Kept optional only so historic,
  // pure unit tests can continue to exercise the aggregation math directly.
  requireCostedLedger?: boolean;
}

function maxDrawdownR(records: PaperOpportunity[]): number {
  let running = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const record of [...records].sort((a, b) => (a.closedAt ?? a.updatedAt).localeCompare(b.closedAt ?? b.updatedAt))) {
    running += record.realizedR!;
    peak = Math.max(peak, running);
    maxDrawdown = Math.max(maxDrawdown, peak - running);
  }
  return r2(maxDrawdown);
}

function setupEvidence(records: PaperOpportunity[]): SetupEvidence[] {
  const groups = new Map<string, PaperOpportunity[]>();
  for (const record of records) groups.set(record.strategyType, [...(groups.get(record.strategyType) ?? []), record]);
  return Array.from(groups.entries()).map(([setup, items]) => {
    const values = items.map((item) => item.realizedR!);
    const profit = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
    const loss = Math.abs(values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
    return {
      setup,
      completedTrades: items.length,
      netR: r2(values.reduce((sum, value) => sum + value, 0)),
      profitFactor: loss > 0 ? r2(profit / loss) : null,
      maxDrawdownR: maxDrawdownR(items),
      // Passing the quarantine only allows these observations into the parent
      // strategy evidence. It is not a trade approval or a profitability claim.
      status: (items.length < PAPER_READINESS_REQUIREMENTS.setupQuarantineTrades
        ? "INSUFFICIENT_SAMPLE"
        : "ELIGIBLE_FOR_STRATEGY_REVIEW") as SetupEvidence["status"],
    };
  }).sort((a, b) => b.completedTrades - a.completedTrades || b.netR - a.netR);
}

export function buildStrategyReadiness(opportunities: PaperOpportunity[], options: ReadinessEvidenceOptions = {}): StrategyReadinessReport[] {
  const tradesById = new Map((options.costedTrades ?? []).map((trade) => [trade.id, trade]));
  const strategies: ReadinessStrategy[] = ["EQUITY_STOCKS", "NIFTY_OPTIONS", "BANKNIFTY_OPTIONS", "OTHER_INDEX_OPTIONS", "MCX_CRUDEOIL", "MCX_NATURALGAS"];
  return strategies.map((strategy) => {
    const all = opportunities.filter((opp) => categoryOf(opp) === strategy);
    const baseVerified = all.filter(isVerifiedCompletedLivePaper);
    const costedRecords = baseVerified.flatMap((opp) => {
      const trade = opp.openedPaperTradeId ? tradesById.get(opp.openedPaperTradeId) : undefined;
      if (!isClosedCostedLiveTrade(trade)) return [];
      // R is derived from the net, costed ledger P&L rather than the simpler
      // opportunity monitor's gross price movement.
      return [{ ...opp, realizedR: r2(trade.realizedPnL! / trade.riskAmount), closedAt: trade.exitTimestamp! }];
    });
    const verifiedRecords = options.requireCostedLedger ? costedRecords : baseVerified;
    const recordsBySetup = new Map<string, PaperOpportunity[]>();
    for (const record of verifiedRecords) {
      recordsBySetup.set(record.strategyType, [...(recordsBySetup.get(record.strategyType) ?? []), record]);
    }
    // New or modified setups must earn a 30-trade observation sample before
    // their results can improve a wider strategy score. This prevents one good
    // early streak from being treated as evidence for the whole strategy.
    const records = verifiedRecords.filter((record) =>
      (recordsBySetup.get(record.strategyType)?.length ?? 0) >= PAPER_READINESS_REQUIREMENTS.setupQuarantineTrades,
    );
    const quarantinedTrades = verifiedRecords.length - records.length;
    const rs = records.map((record) => record.realizedR!);
    const wins = rs.filter((r) => r > 0).length;
    const losses = rs.filter((r) => r < 0).length;
    const grossProfit = rs.filter((r) => r > 0).reduce((sum, r) => sum + r, 0);
    const grossLoss = Math.abs(rs.filter((r) => r < 0).reduce((sum, r) => sum + r, 0));
    const netR = r2(rs.reduce((sum, r) => sum + r, 0));
    const profitFactor = grossLoss > 0 ? r2(grossProfit / grossLoss) : null;
    const drawdown = maxDrawdownR(records);
    const distinctRegimes = Array.from(new Set(records.map((record) => record.regime).filter((regime) => regime && regime !== "UNCLASSIFIED"))).sort();
    const blockers: string[] = [];

    if (quarantinedTrades > 0) {
      blockers.push(`${quarantinedTrades} verified outcome(s) remain in the ${PAPER_READINESS_REQUIREMENTS.setupQuarantineTrades}-trade setup quarantine`);
    }
    if (options.requireCostedLedger && costedRecords.length === 0) {
      blockers.push("No closed, costed UPSTOX_LIVE ledger trades are linked to this strategy");
    }
    if (records.length < PAPER_READINESS_REQUIREMENTS.minimumCompletedTrades) {
      blockers.push(`${records.length}/${PAPER_READINESS_REQUIREMENTS.minimumCompletedTrades} verified completed live-paper trades`);
    }
    if (profitFactor === null || profitFactor < PAPER_READINESS_REQUIREMENTS.minimumProfitFactor) {
      blockers.push(`Profit factor ${profitFactor?.toFixed(2) ?? "N/A"} is below ${PAPER_READINESS_REQUIREMENTS.minimumProfitFactor.toFixed(2)}`);
    }
    if (netR <= PAPER_READINESS_REQUIREMENTS.minimumNetR) blockers.push(`Net performance ${netR.toFixed(2)}R is not positive`);
    if (drawdown > PAPER_READINESS_REQUIREMENTS.maximumDrawdownR) blockers.push(`Drawdown ${drawdown.toFixed(2)}R exceeds ${PAPER_READINESS_REQUIREMENTS.maximumDrawdownR}R`);
    if (distinctRegimes.length < PAPER_READINESS_REQUIREMENTS.minimumDistinctRegimes) {
      blockers.push(`${distinctRegimes.length}/${PAPER_READINESS_REQUIREMENTS.minimumDistinctRegimes} distinct verified market regimes`);
    }

    const verdict: PaperReadinessVerdict = records.length < PAPER_READINESS_REQUIREMENTS.minimumCompletedTrades
      ? "INSUFFICIENT_EVIDENCE"
      : blockers.length > 0 ? "HOLD" : "PAPER_EVIDENCE_SUFFICIENT";
    const nextRequirement = verdict === "PAPER_EVIDENCE_SUFFICIENT"
      ? "Independent human review of raw live-paper records, costs, slippage, and market-regime coverage is required; this is never real-money approval."
      : "Continue collecting exchange-verified LIVE paper observations. Mock, manual, stale, and unpriced records are excluded.";

    return {
      strategy,
      completedTrades: records.length,
      quarantinedTrades,
      excludedRecords: all.length - verifiedRecords.length,
      costedLedgerRecords: costedRecords.length,
      wins,
      losses,
      netR,
      averageR: records.length ? r2(netR / records.length) : null,
      profitFactor,
      maxDrawdownR: drawdown,
      distinctRegimes,
      setups: setupEvidence(verifiedRecords),
      verdict,
      blockers,
      nextRequirement,
      realMoneyEligible: false,
    };
  });
}
