// Centralized Risk Management & Position Sizing Configuration
// Application defaults (not financial advice). Safe defaults for risk engine validation.

export interface RiskConfig {
  accountCapital: number; // Configured Risk Capital (INR)
  riskPerTradePercent: number; // Max risk per trade (% of capital)
  maxDailyLossPercent: number; // Max daily loss (% of capital)
  maxOpenRiskPercent: number; // Max open risk across portfolio (% of capital)
  maxPositionValuePercent: number; // Max capital per position (% of capital)
  maxConcurrentPositions: number; // Max concurrent open positions
  minRiskReward: number; // Minimum acceptable R:R ratio
  maxLotsPerTrade: number; // Hard lot cap per trade
  optionSlippagePercent: number; // Estimated execution slippage (%)
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
};

export function getRiskConfig(override?: Partial<RiskConfig>): RiskConfig {
  const envCapital = process.env.ACCOUNT_CAPITAL ? Number(process.env.ACCOUNT_CAPITAL) : undefined;
  const envRiskPerTrade = process.env.RISK_PER_TRADE_PERCENT ? Number(process.env.RISK_PER_TRADE_PERCENT) : undefined;
  const envMaxDailyLoss = process.env.MAX_DAILY_LOSS_PERCENT ? Number(process.env.MAX_DAILY_LOSS_PERCENT) : undefined;
  const envMaxOpenRisk = process.env.MAX_OPEN_RISK_PERCENT ? Number(process.env.MAX_OPEN_RISK_PERCENT) : undefined;
  const envMaxConcurrent = process.env.MAX_CONCURRENT_POSITIONS ? Number(process.env.MAX_CONCURRENT_POSITIONS) : undefined;

  const cfg: RiskConfig = {
    accountCapital: override?.accountCapital ?? envCapital ?? DEFAULT_RISK_CONFIG.accountCapital,
    riskPerTradePercent: override?.riskPerTradePercent ?? envRiskPerTrade ?? DEFAULT_RISK_CONFIG.riskPerTradePercent,
    maxDailyLossPercent: override?.maxDailyLossPercent ?? envMaxDailyLoss ?? DEFAULT_RISK_CONFIG.maxDailyLossPercent,
    maxOpenRiskPercent: override?.maxOpenRiskPercent ?? envMaxOpenRisk ?? DEFAULT_RISK_CONFIG.maxOpenRiskPercent,
    maxPositionValuePercent: override?.maxPositionValuePercent ?? DEFAULT_RISK_CONFIG.maxPositionValuePercent,
    maxConcurrentPositions: override?.maxConcurrentPositions ?? envMaxConcurrent ?? DEFAULT_RISK_CONFIG.maxConcurrentPositions,
    minRiskReward: override?.minRiskReward ?? DEFAULT_RISK_CONFIG.minRiskReward,
    maxLotsPerTrade: override?.maxLotsPerTrade ?? DEFAULT_RISK_CONFIG.maxLotsPerTrade,
    optionSlippagePercent: override?.optionSlippagePercent ?? DEFAULT_RISK_CONFIG.optionSlippagePercent,
  };

  validateRiskConfig(cfg);
  return cfg;
}

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
  if (!Number.isFinite(cfg.optionSlippagePercent) || cfg.optionSlippagePercent < 0) {
    throw new Error(`Invalid risk config: optionSlippagePercent must be >= 0 (got ${cfg.optionSlippagePercent})`);
  }
}
