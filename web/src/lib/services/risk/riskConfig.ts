// Centralized Risk Management & Position Sizing Configuration
// Application defaults (not financial advice). Safe defaults for risk engine validation.
import { DEFAULT_TRANSACTION_COSTS, type TransactionCostConfig } from "../transactionCosts.ts";

export interface RiskConfig {
  accountCapital: number; // Configured Risk Capital (INR)
  riskPerTradePercent: number; // Max risk per trade (% of capital)
  maxDailyLossPercent: number; // Max daily loss (% of capital)
  maxOpenRiskPercent: number; // Max open risk across portfolio (% of capital)
  maxPositionValuePercent: number; // Max capital per position (% of capital)
  maxConcurrentPositions: number; // Max concurrent open positions
  minRiskReward: number; // Minimum acceptable R:R ratio
  maxLotsPerTrade: number; // Hard lot cap per trade
  optionSlippagePercent: number; // Default adverse slippage (%) when entry/exit values are not set
  entrySlippagePercent: number; // Adverse slippage on the entry fill (%). Assumption, configurable.
  exitSlippagePercent: number; // Adverse slippage on each exit fill, stop and target (%). Assumption, configurable.
  stopGapPercent: number; // Extra adverse fill when a stop executes beyond its price (gap allowance, %). Assumption.
  costs: TransactionCostConfig; // Brokerage and statutory charges (see services/transactionCosts.ts)
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  accountCapital: 100_000,
  riskPerTradePercent: 1.0,
  maxDailyLossPercent: 2.0,
  maxOpenRiskPercent: 3.0,
  maxPositionValuePercent: 20.0,
  maxConcurrentPositions: 3,
  minRiskReward: 1.2,
  maxLotsPerTrade: 5,
  optionSlippagePercent: 1.0,
  entrySlippagePercent: 1.0,
  exitSlippagePercent: 1.0,
  stopGapPercent: 2.0,
  costs: DEFAULT_TRANSACTION_COSTS,
};

const num = (v: string | undefined) => (v === undefined || v.trim() === "" ? undefined : Number(v));

export function getRiskConfig(override?: Partial<RiskConfig>): RiskConfig {
  const envCapital = num(process.env.ACCOUNT_CAPITAL);
  const envRiskPerTrade = num(process.env.RISK_PER_TRADE_PERCENT);
  const envMaxDailyLoss = num(process.env.MAX_DAILY_LOSS_PERCENT);
  const envMaxOpenRisk = num(process.env.MAX_OPEN_RISK_PERCENT);
  const envMaxConcurrent = num(process.env.MAX_CONCURRENT_POSITIONS);
  const envSlippage = num(process.env.RISK_SLIPPAGE_PERCENT);
  const envEntrySlippage = num(process.env.RISK_ENTRY_SLIPPAGE_PERCENT);
  const envExitSlippage = num(process.env.RISK_EXIT_SLIPPAGE_PERCENT);
  const envStopGap = num(process.env.RISK_STOP_GAP_PERCENT);

  const baseCosts = override?.costs ?? DEFAULT_TRANSACTION_COSTS;
  const costs: TransactionCostConfig = {
    ...baseCosts,
    brokeragePerOrder: num(process.env.COST_BROKERAGE_PER_ORDER) ?? baseCosts.brokeragePerOrder,
    sttRate: num(process.env.COST_STT_RATE) ?? baseCosts.sttRate,
    exchangeTxnRate: num(process.env.COST_EXCHANGE_TXN_RATE) ?? baseCosts.exchangeTxnRate,
    gstRate: num(process.env.COST_GST_RATE) ?? baseCosts.gstRate,
    sebiRate: num(process.env.COST_SEBI_RATE) ?? baseCosts.sebiRate,
    stampDutyRate: num(process.env.COST_STAMP_DUTY_RATE) ?? baseCosts.stampDutyRate,
  };

  const optionSlippagePercent = override?.optionSlippagePercent ?? envSlippage ?? DEFAULT_RISK_CONFIG.optionSlippagePercent;
  const cfg: RiskConfig = {
    accountCapital: override?.accountCapital ?? envCapital ?? DEFAULT_RISK_CONFIG.accountCapital,
    riskPerTradePercent: override?.riskPerTradePercent ?? envRiskPerTrade ?? DEFAULT_RISK_CONFIG.riskPerTradePercent,
    maxDailyLossPercent: override?.maxDailyLossPercent ?? envMaxDailyLoss ?? DEFAULT_RISK_CONFIG.maxDailyLossPercent,
    maxOpenRiskPercent: override?.maxOpenRiskPercent ?? envMaxOpenRisk ?? DEFAULT_RISK_CONFIG.maxOpenRiskPercent,
    maxPositionValuePercent: override?.maxPositionValuePercent ?? DEFAULT_RISK_CONFIG.maxPositionValuePercent,
    maxConcurrentPositions: override?.maxConcurrentPositions ?? envMaxConcurrent ?? DEFAULT_RISK_CONFIG.maxConcurrentPositions,
    minRiskReward: override?.minRiskReward ?? DEFAULT_RISK_CONFIG.minRiskReward,
    maxLotsPerTrade: override?.maxLotsPerTrade ?? DEFAULT_RISK_CONFIG.maxLotsPerTrade,
    optionSlippagePercent,
    entrySlippagePercent: override?.entrySlippagePercent ?? envEntrySlippage ?? optionSlippagePercent,
    exitSlippagePercent: override?.exitSlippagePercent ?? envExitSlippage ?? optionSlippagePercent,
    stopGapPercent: override?.stopGapPercent ?? envStopGap ?? DEFAULT_RISK_CONFIG.stopGapPercent,
    costs,
  };

  validateRiskConfig(cfg);
  return cfg;
}

const nonNeg = (v: number) => Number.isFinite(v) && v >= 0;

export function validateRiskConfig(cfg: RiskConfig): void {
  if (!Number.isFinite(cfg.accountCapital) || cfg.accountCapital <= 0) {
    throw new Error(`Invalid risk config: accountCapital must be > 0 (got ${cfg.accountCapital})`);
  }
  if (!Number.isFinite(cfg.riskPerTradePercent) || cfg.riskPerTradePercent <= 0) {
    throw new Error(`Invalid risk config: riskPerTradePercent must be > 0 (got ${cfg.riskPerTradePercent})`);
  }
  if (!Number.isFinite(cfg.maxDailyLossPercent) || cfg.maxDailyLossPercent <= 0) {
    throw new Error(`Invalid risk config: maxDailyLossPercent must be > 0 (got ${cfg.maxDailyLossPercent})`);
  }
  if (!Number.isFinite(cfg.maxOpenRiskPercent) || cfg.maxOpenRiskPercent <= 0) {
    throw new Error(`Invalid risk config: maxOpenRiskPercent must be > 0 (got ${cfg.maxOpenRiskPercent})`);
  }
  if (!Number.isFinite(cfg.maxPositionValuePercent) || cfg.maxPositionValuePercent <= 0) {
    throw new Error(`Invalid risk config: maxPositionValuePercent must be > 0 (got ${cfg.maxPositionValuePercent})`);
  }
  if (!Number.isFinite(cfg.maxConcurrentPositions) || cfg.maxConcurrentPositions <= 0) {
    throw new Error(`Invalid risk config: maxConcurrentPositions must be > 0 (got ${cfg.maxConcurrentPositions})`);
  }
  if (!Number.isFinite(cfg.minRiskReward) || cfg.minRiskReward <= 0) {
    throw new Error(`Invalid risk config: minRiskReward must be > 0 (got ${cfg.minRiskReward})`);
  }
  if (!Number.isFinite(cfg.maxLotsPerTrade) || cfg.maxLotsPerTrade <= 0) {
    throw new Error(`Invalid risk config: maxLotsPerTrade must be > 0 (got ${cfg.maxLotsPerTrade})`);
  }
  for (const [name, v] of [
    ["optionSlippagePercent", cfg.optionSlippagePercent],
    ["entrySlippagePercent", cfg.entrySlippagePercent],
    ["exitSlippagePercent", cfg.exitSlippagePercent],
    ["stopGapPercent", cfg.stopGapPercent],
    ["brokeragePerOrder", cfg.costs.brokeragePerOrder],
    ["sttRate", cfg.costs.sttRate],
    ["exchangeTxnRate", cfg.costs.exchangeTxnRate],
    ["gstRate", cfg.costs.gstRate],
    ["sebiRate", cfg.costs.sebiRate],
    ["stampDutyRate", cfg.costs.stampDutyRate],
  ] as const) {
    if (!nonNeg(v)) throw new Error(`Invalid risk config: ${name} must be >= 0 (got ${v})`);
  }
}
