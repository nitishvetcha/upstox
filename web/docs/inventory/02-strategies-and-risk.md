# Inventory: Strategies and Risk Management

**Category**: `02-strategies-and-risk`  
**File Count**: 6 files  
**Description**: Strategy definitions, frozen strategy 11.4, portfolio risk evaluation, position sizing, and stop loss rules

---

### [`web/src/lib/engine/strategy.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/engine/strategy.ts)

- **Relative Path**: `web/src/lib/engine/strategy.ts`
- **File Type**: `.ts` (302 lines, 13,628 bytes)
- **Category**: Strategies and Risk Management
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const MIN_STRATEGY_SCORE`, `function straddle`, `function staleness`, `function analyze`, `function recommendationOfTheDay`
- **Inbound Dependencies**: `web/scripts/live-verification.mjs`, `web/src/app/api/paper-trading/enter/route.ts`, `web/src/app/api/recommendations/[id]/paper-trade/route.ts`, `web/src/app/api/recommendations/diagnostic/route.ts`, `web/src/app/api/recommendations/generate/route.ts` *(+22 more)*
- **Outbound Dependencies**: `web/src/lib/engine/analysis.ts`, `web/src/lib/services/risk/riskConfig.ts`, `web/src/lib/services/risk/riskService.ts`, `web/src/lib/services/risk/riskTypes.ts`, `web/src/lib/time.ts` *(+1 more)*
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/contractIntegrity.test.ts`, `web/src/lib/dashboard.test.ts`, `web/src/lib/engine/engine.test.ts`, `web/src/lib/journal.test.ts`, `web/src/lib/paperTradingHardening.test.ts`, `web/src/lib/phase13.test.ts`, `web/src/lib/phase14.test.ts`, `web/src/lib/phase18.test.ts`, `web/src/lib/recommendation.test.ts`, `web/src/lib/services/breadth.test.ts`, `web/src/lib/services/futures.test.ts`, `web/src/lib/services/marketData.test.ts`, `web/src/lib/services/news.test.ts`, `web/src/lib/services/paperTrading.test.ts`, `web/src/lib/services/phase10.test.ts`, `web/src/lib/services/risk.test.ts`, `web/src/lib/services/rss.test.ts`, `web/src/lib/services/technical.test.ts`
- **Known Issues & Safety Implications**: Enforces frozen strategy 11.4-frozen and strict risk limits (1% trade, 3% open, 20% cap). Invariant protected.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/intradayEvaluation.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/intradayEvaluation.ts)

- **Relative Path**: `web/src/lib/intradayEvaluation.ts`
- **File Type**: `.ts` (118 lines, 6,623 bytes)
- **Category**: Strategies and Risk Management
- **Purpose & Responsibility**: Phase 2 intraday evaluation (docs/intraday-evaluation-rules.md, frozen 2026-10-23). Pure: reads nothing, writes nothing.
- **Main Exports / Entry Points**: `const EVAL_VERSION`, `const EVAL_START`, `const NOTIONAL`, `const MIN_TRADES`, `const MAX_DD_R`, `const MIN_PF`, `const MIN_SESSIONS`, `const COSTS` *(+8 more)*
- **Inbound Dependencies**: `web/scripts/intraday-evaluation.ts`, `web/scripts/intraday-replay.ts`, `web/src/app/strategy-performance/page.tsx`, `web/src/lib/intradayEvaluation.test.ts`
- **Outbound Dependencies**: `web/src/lib/services/paperOpportunityStore.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/intradayEvaluation.test.ts`
- **Known Issues & Safety Implications**: Enforces frozen strategy 11.4-frozen and strict risk limits (1% trade, 3% open, 20% cap). Invariant protected.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/risk/riskConfig.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/risk/riskConfig.ts)

- **Relative Path**: `web/src/lib/services/risk/riskConfig.ts`
- **File Type**: `.ts` (79 lines, 4,580 bytes)
- **Category**: Strategies and Risk Management
- **Purpose & Responsibility**: Centralized Risk Management & Position Sizing Configuration
- **Main Exports / Entry Points**: `interface RiskConfig`, `const DEFAULT_RISK_CONFIG`, `function getRiskConfig`, `function validateRiskConfig`
- **Inbound Dependencies**: `web/src/app/api/risk/config/route.ts`, `web/src/app/page.tsx`, `web/src/components/SectionViews.tsx`, `web/src/lib/backtestEngine.ts`, `web/src/lib/backtestTypes.ts` *(+10 more)*
- **Outbound Dependencies**: *None*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/dashboard.test.ts`, `web/src/lib/phase14.test.ts`, `web/src/lib/services/risk.test.ts`
- **Known Issues & Safety Implications**: Enforces frozen strategy 11.4-frozen and strict risk limits (1% trade, 3% open, 20% cap). Invariant protected.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/risk/riskService.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/risk/riskService.ts)

- **Relative Path**: `web/src/lib/services/risk/riskService.ts`
- **File Type**: `.ts` (230 lines, 8,324 bytes)
- **Category**: Strategies and Risk Management
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function evaluateTradeRisk`
- **Inbound Dependencies**: `web/scripts/live-verification.mjs`, `web/src/app/api/risk/assess/route.ts`, `web/src/lib/backtestEngine.ts`, `web/src/lib/engine/strategy.ts`, `web/src/lib/paperEngine.ts` *(+1 more)*
- **Outbound Dependencies**: `web/src/lib/services/risk/riskConfig.ts`, `web/src/lib/services/risk/riskTypes.ts`, `web/src/lib/time.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/services/risk.test.ts`
- **Known Issues & Safety Implications**: Enforces frozen strategy 11.4-frozen and strict risk limits (1% trade, 3% open, 20% cap). Invariant protected.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/risk/riskTypes.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/risk/riskTypes.ts)

- **Relative Path**: `web/src/lib/services/risk/riskTypes.ts`
- **File Type**: `.ts` (54 lines, 1,739 bytes)
- **Category**: Strategies and Risk Management
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `type RiskStatus`, `type RiskRejectionReason`, `interface RiskInputs`, `interface RiskAssessment`
- **Inbound Dependencies**: `web/src/lib/engine/strategy.ts`, `web/src/lib/paperTypes.ts`, `web/src/lib/recommendationDiagnostic.ts`, `web/src/lib/recommendationEnricher.ts`, `web/src/lib/services/risk/riskService.ts` *(+1 more)*
- **Outbound Dependencies**: `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Enforces frozen strategy 11.4-frozen and strict risk limits (1% trade, 3% open, 20% cap). Invariant protected.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/transactionCosts.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/transactionCosts.ts)

- **Relative Path**: `web/src/lib/services/transactionCosts.ts`
- **File Type**: `.ts` (69 lines, 3,125 bytes)
- **Category**: Strategies and Risk Management
- **Purpose & Responsibility**: Statutory + broker costs for NSE index OPTIONS (per executed order leg), configurable. Kept separate from
- **Main Exports / Entry Points**: `interface TransactionCostConfig`, `const DEFAULT_TRANSACTION_COSTS`, `const COSTS_NOT_MODELED`, `interface TradeCosts`, `const ZERO_COSTS`, `interface Fill`, `function costsFor`
- **Inbound Dependencies**: `web/src/components/SectionViews.tsx`, `web/src/lib/backtestEngine.ts`, `web/src/lib/backtestTypes.ts`, `web/src/lib/paperEngine.ts`, `web/src/lib/paperMath.ts` *(+4 more)*
- **Outbound Dependencies**: *None*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/paperTradingHardening.test.ts`, `web/src/lib/services/phase10.test.ts`
- **Known Issues & Safety Implications**: Enforces frozen strategy 11.4-frozen and strict risk limits (1% trade, 3% open, 20% cap). Invariant protected.
- **Recommended Action**: **`KEEP`**

---
