# Inventory: Engines and Domain Logic

**Category**: `01-engines-and-domain-logic`  
**File Count**: 9 files  
**Description**: Core quantitative engines, opportunity evaluation, Black-Scholes pricing, and technical indicators

---

### [`web/src/lib/dashboard.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/dashboard.ts)

- **Relative Path**: `web/src/lib/dashboard.ts`
- **File Type**: `.ts` (182 lines, 7,939 bytes)
- **Category**: Engines and Domain Logic
- **Purpose & Responsibility**: The one frontend contract for the dashboard: backend Analysis → display fields. Pure formatting/selection only —
- **Main Exports / Entry Points**: `type Freshness`, `interface DashboardView`, `function toDashboardView`
- **Inbound Dependencies**: `web/src/app/page.tsx`, `web/src/components/AnalysisPanels.tsx`, `web/src/components/SectionViews.tsx`, `web/src/lib/dashboard.test.ts`
- **Outbound Dependencies**: `web/src/lib/services/risk/riskConfig.ts`, `web/src/lib/time.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/dashboard.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/engine/analysis.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/engine/analysis.ts)

- **Relative Path**: `web/src/lib/engine/analysis.ts`
- **File Type**: `.ts` (276 lines, 13,355 bytes)
- **Category**: Engines and Domain Logic
- **Purpose & Responsibility**: Each check: [bullish?, text if true, text if false].
- **Main Exports / Entry Points**: `function analyzeMarket`
- **Inbound Dependencies**: `web/src/lib/engine/engine.test.ts`, `web/src/lib/engine/opportunityEngine.ts`, `web/src/lib/engine/strategy.ts`, `web/src/lib/services/phase10.test.ts`
- **Outbound Dependencies**: `web/src/lib/services/optionChainAnalytics.ts`, `web/src/lib/services/technicalAnalysis.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/engine/engine.test.ts`, `web/src/lib/services/phase10.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/engine/intradayReplay.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/engine/intradayReplay.ts)

- **Relative Path**: `web/src/lib/engine/intradayReplay.ts`
- **File Type**: `.ts` (142 lines, 7,614 bytes)
- **Category**: Engines and Domain Logic
- **Purpose & Responsibility**: Historical replay of the live intraday stock scanner + collector + monitor, minute by minute.
- **Main Exports / Entry Points**: `const REPLAY_VERSION`, `interface DayBars`, `interface ReplayTrade`, `function replayDay`, `const MIN_BARS_PER_DAY`, `const CORP_ACTION_GAP`, `type DayIssue`, `interface DayCounters` *(+1 more)*
- **Inbound Dependencies**: `web/scripts/intraday-replay.ts`, `web/src/lib/engine/intradayReplay.test.ts`
- **Outbound Dependencies**: `web/src/lib/engine/stockOpportunityEngine.ts`, `web/src/lib/services/stockService.ts`, `web/src/lib/types.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/engine/intradayReplay.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/engine/longTermEngine.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/engine/longTermEngine.ts)

- **Relative Path**: `web/src/lib/engine/longTermEngine.ts`
- **File Type**: `.ts` (106 lines, 4,048 bytes)
- **Category**: Engines and Domain Logic
- **Purpose & Responsibility**: Phase 20 — Long-Term Opportunity Engine.
- **Main Exports / Entry Points**: `const LONG_TERM_ENGINE_VERSION`, `interface FundamentalData`, `interface FundamentalProvider`, `const NO_FUNDAMENTAL_PROVIDER`, `type LongTermRating`, `interface LongTermOpportunity`, `interface LongTermResult`, `function scanLongTerm`
- **Inbound Dependencies**: `web/src/app/api/opportunities/stocks/long-term/route.ts`, `web/src/app/api/opportunities/top/route.ts`, `web/src/app/opportunities/page.tsx`, `web/src/lib/phase20.test.ts`
- **Outbound Dependencies**: `web/src/lib/engine/stockOpportunityEngine.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/phase20.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/engine/opportunityEngine.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/engine/opportunityEngine.ts)

- **Relative Path**: `web/src/lib/engine/opportunityEngine.ts`
- **File Type**: `.ts` (565 lines, 24,480 bytes)
- **Category**: Engines and Domain Logic
- **Purpose & Responsibility**: Phase 20 — Opportunity Engine v20.0 → 20.1
- **Main Exports / Entry Points**: `const OPPORTUNITY_ENGINE_VERSION`, `const WEIGHTS`, `const FILTERS`, `type StrategyType`, `type OpportunityGrade`, `function gradeOpportunity`, `interface SignalLine`, `interface ContractOpportunity` *(+3 more)*
- **Inbound Dependencies**: `web/src/app/api/opportunities/options/route.ts`, `web/src/app/api/opportunities/top/route.ts`, `web/src/app/api/paper-opportunities/collect/route.ts`, `web/src/app/api/paper-opportunities/route.ts`, `web/src/app/opportunities/page.tsx` *(+20 more)*
- **Outbound Dependencies**: `web/src/lib/engine/analysis.ts`, `web/src/lib/services/optionChainAnalytics.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/phase19.test.ts`, `web/src/lib/phase20.test.ts`, `web/src/lib/phase21.test.ts`, `web/src/lib/phase22.test.ts`, `web/src/lib/phase24.test.ts`, `web/src/lib/phase25.test.ts`, `web/src/lib/phase27.test.ts`, `web/src/lib/phase28.test.ts`, `web/src/lib/phase30.test.ts`, `web/src/lib/phase30_1.test.ts`, `web/src/lib/phase30_4.test.ts`, `web/src/lib/productionReadinessAudit.test.ts`, `web/src/lib/runtimeTrust.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/engine/positionalBacktest.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/engine/positionalBacktest.ts)

- **Relative Path**: `web/src/lib/engine/positionalBacktest.ts`
- **File Type**: `.ts` (249 lines, 10,711 bytes)
- **Category**: Engines and Domain Logic
- **Purpose & Responsibility**: Portfolio backtest of the positional engine on daily candles. Pure: no I/O, no paper-trade records.
- **Main Exports / Entry Points**: `interface Costs`, `const DEFAULT_COSTS`, `interface BacktestConfig`, `const DEFAULT_CONFIG`, `interface BtTrade`, `interface BacktestResult`, `interface Stats`, `function orderCost` *(+2 more)*
- **Inbound Dependencies**: `web/scripts/backtest-positional-v2.ts`, `web/scripts/backtest-positional.ts`, `web/src/app/strategy-performance/page.tsx`, `web/src/lib/engine/positionalBacktest.test.ts`, `web/src/lib/engine/positionalV2.test.ts` *(+1 more)*
- **Outbound Dependencies**: `web/src/lib/engine/positionalTrend.ts`, `web/src/lib/types.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/engine/positionalBacktest.test.ts`, `web/src/lib/engine/positionalV2.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/engine/positionalTrend.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/engine/positionalTrend.ts)

- **Relative Path**: `web/src/lib/engine/positionalTrend.ts`
- **File Type**: `.ts` (154 lines, 8,375 bytes)
- **Category**: Engines and Domain Logic
- **Purpose & Responsibility**: Positional (multi-day, long-only) stock signals from DAILY candles.
- **Main Exports / Entry Points**: `const POSITIONAL_VERSION`, `const POSITIONAL_RETIRED_NOTE`, `type PositionalSetup`, `interface PositionalSignal`, `interface PositionalReject`, `const MIN_BARS`, `function checkDailyCandles`, `function sinceLastCorporateAction` *(+2 more)*
- **Inbound Dependencies**: `web/src/app/opportunities/page.tsx`, `web/src/lib/engine/positionalBacktest.ts`, `web/src/lib/engine/positionalTrend.test.ts`, `web/src/lib/engine/positionalV2.ts`, `web/src/lib/engine/stockOpportunityEngine.ts`
- **Outbound Dependencies**: `web/src/lib/services/technicalAnalysis.ts`, `web/src/lib/types.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/engine/positionalTrend.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/engine/positionalV2.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/engine/positionalV2.ts)

- **Relative Path**: `web/src/lib/engine/positionalV2.ts`
- **File Type**: `.ts` (194 lines, 8,820 bytes)
- **Category**: Engines and Domain Logic
- **Purpose & Responsibility**: Positional v2: weekly trend-following with a NIFTY 200-day market filter and a 3×ATR trailing stop.
- **Main Exports / Entry Points**: `const POSITIONAL_V2_VERSION`, `interface V2Config`, `interface V2Trade`, `interface V2Result`, `function v2Signal`, `function runPositionalV2`
- **Inbound Dependencies**: `web/scripts/backtest-positional-v2.ts`, `web/src/lib/engine/positionalV2.test.ts`
- **Outbound Dependencies**: `web/src/lib/engine/positionalBacktest.ts`, `web/src/lib/engine/positionalTrend.ts`, `web/src/lib/services/technicalAnalysis.ts`, `web/src/lib/types.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/engine/positionalV2.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/engine/stockOpportunityEngine.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/engine/stockOpportunityEngine.ts)

- **Relative Path**: `web/src/lib/engine/stockOpportunityEngine.ts`
- **File Type**: `.ts` (426 lines, 20,384 bytes)
- **Category**: Engines and Domain Logic
- **Purpose & Responsibility**: Phase 20 — Stock Opportunity Engine v20.0 → 20.1
- **Main Exports / Entry Points**: `const STOCK_OPPORTUNITY_VERSION`, `type IntradaySetup`, `type SwingSetup`, `interface StockOpportunity`, `interface StockOpportunityResult`, `function intradayConfidence`, `function scoreIntradayQuote`, `function niftyProxyChange` *(+2 more)*
- **Inbound Dependencies**: `web/src/app/api/opportunities/stocks/intraday/route.ts`, `web/src/app/api/opportunities/stocks/swing/route.ts`, `web/src/app/api/opportunities/top/route.ts`, `web/src/app/api/paper-opportunities/collect/route.ts`, `web/src/app/opportunities/page.tsx` *(+11 more)*
- **Outbound Dependencies**: `web/src/lib/engine/opportunityEngine.ts`, `web/src/lib/engine/positionalTrend.ts`, `web/src/lib/marketHistory.ts`, `web/src/lib/services/breadthConstituents.generated.ts`, `web/src/lib/services/cache.ts` *(+5 more)*
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/engine/intradayConfidence.test.ts`, `web/src/lib/phase19.test.ts`, `web/src/lib/phase20.test.ts`, `web/src/lib/phase22.test.ts`, `web/src/lib/phase24.test.ts`, `web/src/lib/phase27.test.ts`, `web/src/lib/phase28.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---
