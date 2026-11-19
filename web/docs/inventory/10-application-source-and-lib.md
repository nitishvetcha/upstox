# Inventory: Application Source and Libraries

**Category**: `10-application-source-and-lib`  
**File Count**: 51 files  
**Description**: Shared TypeScript types, dashboard helpers, math routines, and general utility functions

---

### [`web/src/lib/adapters/upstoxHistoricalOptionsAdapter.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/adapters/upstoxHistoricalOptionsAdapter.ts)

- **Relative Path**: `web/src/lib/adapters/upstoxHistoricalOptionsAdapter.ts`
- **File Type**: `.ts` (189 lines, 8,016 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Phase 12 — Upstox historical options adapter.
- **Main Exports / Entry Points**: `const UDAPI1149`, `class UpstoxHistoricalOptionsAdapter`, `const upstoxHistoricalOptions`
- **Inbound Dependencies**: `web/src/app/api/auth/health/route.ts`, `web/src/app/api/historical-options/data-quality/route.ts`, `web/src/app/option-history/page.tsx`, `web/src/lib/historicalOptions.test.ts`
- **Outbound Dependencies**: `web/src/lib/historicalOptionsProvider.ts`, `web/src/lib/services/upstoxAuth.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/historicalOptions.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/backtestEngine.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/backtestEngine.ts)

- **Relative Path**: `web/src/lib/backtestEngine.ts`
- **File Type**: `.ts` (720 lines, 40,601 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const STRATEGY_VERSION`, `const RISK_CONFIG_VERSION`, `const DATA_VERSION`, `function riskRejectionCode`, `function overnightSessions`, `function rejectionCode`, `function slippageAwareSizing`, `const MIN_TRADES_FOR_VALIDATION` *(+5 more)*
- **Inbound Dependencies**: `web/src/app/api/backtest/compare-runs/route.ts`, `web/src/app/api/backtest/run/route.ts`, `web/src/lib/dashboard.test.ts`, `web/src/lib/services/backtest.test.ts`, `web/src/lib/services/backtestScenarios.ts` *(+4 more)*
- **Outbound Dependencies**: `web/src/lib/backtestExecution.ts`, `web/src/lib/backtestSnapshot.ts`, `web/src/lib/backtestTypes.ts`, `web/src/lib/engine/strategy.ts`, `web/src/lib/paperEngine.ts` *(+8 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/dashboard.test.ts`, `web/src/lib/services/backtest.test.ts`, `web/src/lib/services/performance.test.ts`, `web/src/lib/services/phase10.test.ts`, `web/src/lib/services/phase9.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/backtestExecution.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/backtestExecution.ts)

- **Relative Path**: `web/src/lib/backtestExecution.ts`
- **File Type**: `.ts` (62 lines, 3,496 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Intrabar execution model (pure, deterministic). Historical option OHLC does not exist here: option prices
- **Main Exports / Entry Points**: `type ExecutionModel`, `const INTRABAR_PATH_MODEL`, `const SAME_BAR_EXIT_POLICY`, `function intrabarPath`, `interface IntrabarExit`, `function evaluateIntrabarExit`
- **Inbound Dependencies**: `web/src/lib/backtestEngine.ts`, `web/src/lib/backtestTypes.ts`, `web/src/lib/services/backtestInputs.ts`, `web/src/lib/services/phase9.test.ts`
- **Outbound Dependencies**: `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/services/phase9.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/backtestSnapshot.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/backtestSnapshot.ts)

- **Relative Path**: `web/src/lib/backtestSnapshot.ts`
- **File Type**: `.ts` (155 lines, 7,372 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: SYNTHETIC option pricing for backtests: Black-Scholes at a flat 14.5% IV benchmark (no historical
- **Main Exports / Entry Points**: `const BACKTEST_IV`, `function yearsToExpiry`, `function priceOption`, `const NEUTRAL_UNAVAILABLE_NEWS`, `function buildHistoricalOptionChain`, `function buildHistoricalSnapshot`
- **Inbound Dependencies**: `web/src/lib/backtestEngine.ts`, `web/src/lib/historicalOptionData.test.ts`, `web/src/lib/services/backtest.test.ts`, `web/src/lib/services/phase10.test.ts`, `web/src/lib/services/phase9.test.ts`
- **Outbound Dependencies**: `web/src/lib/backtestTypes.ts`, `web/src/lib/services/breadthConfig.ts`, `web/src/lib/services/breadthService.ts`, `web/src/lib/services/historicalContext.ts`, `web/src/lib/services/instrumentRegistry.ts` *(+4 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/historicalOptionData.test.ts`, `web/src/lib/services/backtest.test.ts`, `web/src/lib/services/phase10.test.ts`, `web/src/lib/services/phase9.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/backtestTypes.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/backtestTypes.ts)

- **Relative Path**: `web/src/lib/backtestTypes.ts`
- **File Type**: `.ts` (276 lines, 9,260 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `type BacktestMode`, `interface BacktestRunMeta`, `interface CapitalFeasibility`, `interface BacktestRunConfig`, `interface BacktestTradeLeg`, `interface BacktestTrade`, `interface EquityCurvePoint`, `interface MonthlyPerformance` *(+9 more)*
- **Inbound Dependencies**: `web/src/lib/backtestEngine.ts`, `web/src/lib/backtestSnapshot.ts`, `web/src/lib/services/backtest.test.ts`, `web/src/lib/services/backtestInputs.ts`, `web/src/lib/services/backtestScenarios.ts` *(+12 more)*
- **Outbound Dependencies**: `web/src/lib/backtestExecution.ts`, `web/src/lib/services/historicalCandles.ts`, `web/src/lib/services/historicalContext.ts`, `web/src/lib/services/risk/riskConfig.ts`, `web/src/lib/services/transactionCosts.ts` *(+1 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/services/backtest.test.ts`, `web/src/lib/services/performance.test.ts`, `web/src/lib/services/phase10.test.ts`, `web/src/lib/services/phase9.test.ts`, `web/src/lib/strategyEvidence.test.ts`, `web/src/lib/walkForwardEngine.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/dataStatus.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/dataStatus.ts)

- **Relative Path**: `web/src/lib/dataStatus.ts`
- **File Type**: `.ts` (16 lines, 999 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: One honest global label: LIVE only when every subsystem of every index is live.
- **Main Exports / Entry Points**: `type DataLabel`, `function dataLabel`
- **Inbound Dependencies**: `web/src/app/layout.tsx`, `web/src/components/DataStatus.tsx`, `web/src/components/RecommendationCard.tsx`, `web/src/lib/productionReadinessAudit.test.ts`, `web/src/lib/runtimeTrust.test.ts` *(+1 more)*
- **Outbound Dependencies**: `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/productionReadinessAudit.test.ts`, `web/src/lib/runtimeTrust.test.ts`, `web/src/lib/services/news.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/evaluationEngine.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/evaluationEngine.ts)

- **Relative Path**: `web/src/lib/evaluationEngine.ts`
- **File Type**: `.ts` (770 lines, 33,001 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Phase 11.5 — Statistical evaluation layer over the genuine recommendation journal.
- **Main Exports / Entry Points**: `type SampleAdequacy`, `type EvidenceClassification`, `interface EvaluationFilters`, `interface DataQualityReport`, `interface BootstrapResult`, `interface WilsonCI`, `interface BreakdownSlice`, `interface DrawdownMetrics` *(+6 more)*
- **Inbound Dependencies**: `web/src/app/api/recommendations/evaluation/export/route.ts`, `web/src/app/api/recommendations/evaluation/route.ts`, `web/src/components/RecommendationEvaluation.tsx`, `web/src/lib/evaluation.test.ts`, `web/src/lib/strategyEvidenceEngine.ts`
- **Outbound Dependencies**: `web/src/lib/journalTypes.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/evaluation.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/fallback.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/fallback.ts)

- **Relative Path**: `web/src/lib/fallback.ts`
- **File Type**: `.ts` (15 lines, 688 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const FALLBACK_LABELS`
- **Inbound Dependencies**: `web/src/app/api/breadth/[index]/route.ts`, `web/src/app/api/market/[index]/route.ts`, `web/src/app/api/market/expiries/[index]/route.ts`, `web/src/app/api/option-chain/[index]/route.ts`, `web/src/app/api/technical/[index]/route.ts` *(+1 more)*
- **Outbound Dependencies**: `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/historicalOptionDataAudit.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/historicalOptionDataAudit.ts)

- **Relative Path**: `web/src/lib/historicalOptionDataAudit.ts`
- **File Type**: `.ts` (234 lines, 10,513 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Phase 11.6 — Historical option data audit and fidelity assessment.
- **Main Exports / Entry Points**: `type DatasetMode`, `type OptionFieldQuality`, `interface OptionDataQuality`, `interface ProviderInvestigationRecord`, `interface DataQualityScorecard`, `const UPSTOX_INVESTIGATION`, `const CURRENT_OPTION_DATA_QUALITY`, `function buildDataQualityScorecard` *(+2 more)*
- **Inbound Dependencies**: `web/src/app/api/backtest/data-quality/route.ts`, `web/src/lib/historicalOptionData.test.ts`, `web/src/lib/strategyEvidenceEngine.ts`
- **Outbound Dependencies**: `web/src/lib/services/historicalContext.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/historicalOptionData.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/historicalOptionsDataset.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/historicalOptionsDataset.ts)

- **Relative Path**: `web/src/lib/historicalOptionsDataset.ts`
- **File Type**: `.ts` (319 lines, 11,553 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Phase 12 — Historical options dataset validation, versioning, and fingerprinting.
- **Main Exports / Entry Points**: `function datasetHash`, `type ValidationFailReason`, `interface ValidationResult`, `function validateObservation`, `function validateDataset`, `interface DatasetMetadata`, `function buildDatasetMetadata`, `interface FieldQualityMap` *(+3 more)*
- **Inbound Dependencies**: `web/src/app/api/historical-options/data-quality/route.ts`, `web/src/app/option-history/page.tsx`, `web/src/lib/historicalOptions.test.ts`
- **Outbound Dependencies**: `web/src/lib/historicalOptionsProvider.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/historicalOptions.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/historicalOptionsProvider.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/historicalOptionsProvider.ts)

- **Relative Path**: `web/src/lib/historicalOptionsProvider.ts`
- **File Type**: `.ts` (152 lines, 6,167 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Phase 12 — Real Historical Options Data Acquisition & Fidelity Upgrade
- **Main Exports / Entry Points**: `type FieldQuality`, `type DatasetMode`, `interface HistoricalOptionObservation`, `interface ContractQuery`, `interface HistoricalOptionQuery`, `interface HistoricalChainQuery`, `type CapabilityStatus`, `interface CapabilityMatrix` *(+4 more)*
- **Inbound Dependencies**: `web/src/lib/adapters/upstoxHistoricalOptionsAdapter.ts`, `web/src/lib/historicalOptions.test.ts`, `web/src/lib/historicalOptionsDataset.ts`
- **Outbound Dependencies**: *None*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/historicalOptions.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/journalOutcome.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/journalOutcome.ts)

- **Relative Path**: `web/src/lib/journalOutcome.ts`
- **File Type**: `.ts` (368 lines, 13,509 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Phase 11.3 — Outcome calculation: MFE, MAE, P&L, R-multiple.
- **Main Exports / Entry Points**: `interface PriceObservation`, `function computeOutcome`, `interface JournalValidationReport`, `function validateRecommendationJournal`, `interface DailyCollectionSummary`, `interface JournalAnalytics`, `function computeAnalytics`
- **Inbound Dependencies**: `web/src/app/api/recommendations/[id]/refresh/route.ts`, `web/src/app/api/recommendations/analytics/route.ts`, `web/src/components/RecommendationJournal.tsx`, `web/src/lib/journal.test.ts`
- **Outbound Dependencies**: `web/src/lib/journalTypes.ts`, `web/src/lib/recommendationEnricher.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/journal.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/journalTypes.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/journalTypes.ts)

- **Relative Path**: `web/src/lib/journalTypes.ts`
- **File Type**: `.ts` (81 lines, 2,786 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Phase 11.3 / 11.4 — Recommendation Journal types.
- **Main Exports / Entry Points**: `type JournalStatus`, `type ExitReason`, `interface RecommendationOutcome`, `interface StrategyVersionInfo`, `interface RecommendationJournalEntry`, `const STRATEGY_VERSION`
- **Inbound Dependencies**: `web/src/app/api/recommendations/generate/route.ts`, `web/src/components/RecommendationJournal.tsx`, `web/src/lib/evaluation.test.ts`, `web/src/lib/evaluationEngine.ts`, `web/src/lib/journal.test.ts` *(+11 more)*
- **Outbound Dependencies**: `web/src/lib/recommendationEnricher.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/evaluation.test.ts`, `web/src/lib/journal.test.ts`, `web/src/lib/phase13.test.ts`, `web/src/lib/phase14.test.ts`, `web/src/lib/phase15.test.ts`, `web/src/lib/phase16.test.ts`, `web/src/lib/phase18.test.ts`, `web/src/lib/productionReadinessAudit.test.ts`, `web/src/lib/strategyEvidence.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/marketHistory.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/marketHistory.ts)

- **Relative Path**: `web/src/lib/marketHistory.ts`
- **File Type**: `.ts` (238 lines, 10,089 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Phase 13 — long-term history for indices and NSE equities (read-only).
- **Main Exports / Entry Points**: `const HISTORY_RANGES`, `type HistoryRange`, `const HISTORY_INTERVALS`, `type HistoryInterval`, `const PROVIDER_PLAN`, `function rangeStart`, `interface HistoryChunk`, `function planHistoryChunks` *(+7 more)*
- **Inbound Dependencies**: `web/scripts/backtest-positional-v2.ts`, `web/scripts/backtest-positional.ts`, `web/scripts/intraday-replay.ts`, `web/scripts/options-research-inventory.ts`, `web/src/app/api/stocks/[symbol]/history/route.ts` *(+5 more)*
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/services/candles.ts`, `web/src/lib/services/technicalAnalysis.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/phase13.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/ops/jsonl.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/ops/jsonl.ts)

- **Relative Path**: `web/src/lib/ops/jsonl.ts`
- **File Type**: `.ts` (14 lines, 702 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Tolerant JSONL reader: a missing file is empty; malformed or truncated lines are counted, never thrown.
- **Main Exports / Entry Points**: `function readJsonl`
- **Inbound Dependencies**: `web/scripts/options-audit-research.ts`, `web/scripts/research-audit-experiments.ts`, `web/src/lib/ops/ops.test.ts`, `web/src/lib/ops/opsStatus.ts`, `web/src/lib/optionsAuditReport.ts` *(+1 more)*
- **Outbound Dependencies**: `node:fs`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/ops/ops.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/ops/opsStatus.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/ops/opsStatus.ts)

- **Relative Path**: `web/src/lib/ops/opsStatus.ts`
- **File Type**: `.ts` (120 lines, 8,252 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Operational status from real evidence on disk (lock file, collection/monitor logs, runner health events).
- **Main Exports / Entry Points**: `type RunnerState`, `interface HealthEvent`, `function deriveRunnerState`, `function runnerStatus`, `function redact`, `function logTail`, `type Severity`, `interface Attention` *(+2 more)*
- **Inbound Dependencies**: `web/src/components/OpsDetails.tsx`, `web/src/components/OpsPanel.tsx`, `web/src/lib/ops/ops.test.ts`
- **Outbound Dependencies**: `node:child_process`, `node:fs`, `node:path`, `web/src/lib/ops/jsonl.ts`, `web/src/lib/services/liveOpportunityCollector.ts` *(+1 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/ops/ops.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/postLogin.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/postLogin.ts)

- **Relative Path**: `web/src/lib/postLogin.ts`
- **File Type**: `.ts` (60 lines, 2,893 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Phase 14 — one live evaluation of NIFTY and BANK NIFTY right after login (no polling, nothing journaled).
- **Main Exports / Entry Points**: `interface IndexEvaluation`, `function evaluateIndex`, `function evaluateBoth`, `function evaluationLines`
- **Inbound Dependencies**: `web/src/app/api/auth/callback/route.ts`, `web/src/lib/phase14.test.ts`
- **Outbound Dependencies**: `web/src/lib/engine/strategy.ts`, `web/src/lib/recommendationDiagnostic.ts`, `web/src/lib/services/market.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/phase14.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/recommendationDiagnostic.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/recommendationDiagnostic.ts)

- **Relative Path**: `web/src/lib/recommendationDiagnostic.ts`
- **File Type**: `.ts` (328 lines, 18,045 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Phase 13 — structured "why no recommendation?" diagnostic.
- **Main Exports / Entry Points**: `type BlockerCode`, `interface RecommendationBlocker`, `interface RecommendationWarning`, `type CheckStatus`, `interface RecommendationCheck`, `interface CandidatePreview`, `type FinalDecision`, `interface RecommendationDiagnostic` *(+3 more)*
- **Inbound Dependencies**: `web/src/app/api/recommendations/diagnostic/route.ts`, `web/src/app/recommendation-debug/page.tsx`, `web/src/components/RecommendationDiagnosticPanel.tsx`, `web/src/components/SectionViews.tsx`, `web/src/lib/phase13.test.ts` *(+2 more)*
- **Outbound Dependencies**: `web/src/lib/engine/strategy.ts`, `web/src/lib/journalTypes.ts`, `web/src/lib/recommendationEnricher.ts`, `web/src/lib/services/risk/riskTypes.ts`, `web/src/lib/time.ts` *(+1 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/phase13.test.ts`, `web/src/lib/phase14.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/recommendationEnricher.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/recommendationEnricher.ts)

- **Relative Path**: `web/src/lib/recommendationEnricher.ts`
- **File Type**: `.ts` (320 lines, 13,410 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Enriches the Analysis output with contract-level details and natural-language reasoning.
- **Main Exports / Entry Points**: `function buildDisplaySymbol`, `interface ContractDetail`, `interface EntryDetail`, `interface OiAnalysisResult`, `type Decision`, `interface RecommendationResponse`, `function primaryLeg`, `function contractDetails` *(+4 more)*
- **Inbound Dependencies**: `web/src/app/api/recommendations/generate/route.ts`, `web/src/components/RecommendationWidget.tsx`, `web/src/lib/contractIntegrity.test.ts`, `web/src/lib/evaluation.test.ts`, `web/src/lib/journal.test.ts` *(+4 more)*
- **Outbound Dependencies**: `web/src/lib/paperEngine.ts`, `web/src/lib/services/risk/riskConfig.ts`, `web/src/lib/services/risk/riskTypes.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/contractIntegrity.test.ts`, `web/src/lib/evaluation.test.ts`, `web/src/lib/journal.test.ts`, `web/src/lib/recommendation.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/scoreText.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/scoreText.ts)

- **Relative Path**: `web/src/lib/scoreText.ts`
- **File Type**: `.ts` (15 lines, 1,380 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Plain-language explanation of the recommendation score. It is an agreement score, never a win probability.
- **Main Exports / Entry Points**: `function scoreExplanation`
- **Inbound Dependencies**: `web/src/components/RecommendationCard.tsx`, `web/src/lib/scoreText.test.ts`
- **Outbound Dependencies**: `web/src/lib/types.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/scoreText.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/sectionLoad.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/sectionLoad.ts)

- **Relative Path**: `web/src/lib/sectionLoad.ts`
- **File Type**: `.ts` (18 lines, 814 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Independent section loading: one failing or hanging data source degrades only its own section.
- **Main Exports / Entry Points**: `type SectionResult`, `function loadSection`
- **Inbound Dependencies**: `web/src/app/[section]/page.tsx`, `web/src/lib/dashboard.test.ts`
- **Outbound Dependencies**: *None*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/dashboard.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/sections.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/sections.ts)

- **Relative Path**: `web/src/lib/sections.ts`
- **File Type**: `.ts` (15 lines, 797 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Sidebar order (spec §32). `phase` = the build phase that delivers the page.
- **Main Exports / Entry Points**: `const SECTIONS`
- **Inbound Dependencies**: `web/src/app/[section]/page.tsx`, `web/src/components/Sidebar.tsx`
- **Outbound Dependencies**: *None*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/backtestInputs.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/backtestInputs.ts)

- **Relative Path**: `web/src/lib/services/backtestInputs.ts`
- **File Type**: `.ts` (50 lines, 3,492 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: One place that turns a backtest request into engine inputs (used by run / scenarios / compare routes):
- **Main Exports / Entry Points**: `const INTRADAY_WARMUP_DAYS`, `const DAILY_WARMUP_DAYS`, `function configFromBody`, `const dataModelFromBody`, `function loadBacktestInputs`
- **Inbound Dependencies**: `web/src/lib/services/backtestRequest.ts`, `web/src/lib/services/phase9.test.ts`
- **Outbound Dependencies**: `web/src/lib/backtestExecution.ts`, `web/src/lib/backtestTypes.ts`, `web/src/lib/services/historicalCandles.ts`, `web/src/lib/services/historicalContext.ts`, `web/src/lib/services/instrumentRegistry.ts` *(+1 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/services/phase9.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/backtestRequest.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/backtestRequest.ts)

- **Relative Path**: `web/src/lib/services/backtestRequest.ts`
- **File Type**: `.ts` (16 lines, 1,061 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Shared by run / scenarios / compare: real chunked Upstox history only (no mock candles).
- **Main Exports / Entry Points**: `function backtestInputs`
- **Inbound Dependencies**: `web/src/app/api/backtest/compare-runs/route.ts`, `web/src/app/api/backtest/compare/route.ts`, `web/src/app/api/backtest/run/route.ts`, `web/src/app/api/backtest/scenarios/route.ts`, `web/src/app/api/backtest/walk-forward/route.ts`
- **Outbound Dependencies**: `next/server`, `web/src/lib/services/backtestInputs.ts`, `web/src/lib/services/upstoxAuth.ts`, `web/src/lib/services/upstoxMarket.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/backtestScenarios.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/backtestScenarios.ts)

- **Relative Path**: `web/src/lib/services/backtestScenarios.ts`
- **File Type**: `.ts` (83 lines, 4,679 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Descriptive what-if runs on the SAME candles + strategy + risk config. Nothing here optimizes or recommends.
- **Main Exports / Entry Points**: `const CAPITAL_SCENARIOS`, `const CAPITAL_NOTE`, `function summaryRow`, `function runCapitalScenarios`, `const SENSITIVITY_THRESHOLDS`, `function compareExecutionModels`, `const COMPARISON_NOTE`, `function compareRuns`
- **Inbound Dependencies**: `web/src/app/api/backtest/compare-runs/route.ts`, `web/src/app/api/backtest/compare/route.ts`, `web/src/app/api/backtest/scenarios/route.ts`, `web/src/components/SectionViews.tsx`, `web/src/lib/dashboard.test.ts` *(+3 more)*
- **Outbound Dependencies**: `web/src/lib/backtestEngine.ts`, `web/src/lib/backtestTypes.ts`, `web/src/lib/services/historicalContext.ts`, `web/src/lib/services/performance/metrics.ts`, `web/src/lib/services/performance/report.ts` *(+1 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/dashboard.test.ts`, `web/src/lib/services/phase10.test.ts`, `web/src/lib/services/phase9.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/backtestStore.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/backtestStore.ts)

- **Relative Path**: `web/src/lib/services/backtestStore.ts`
- **File Type**: `.ts` (46 lines, 1,828 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: The single source of truth for completed backtest runs. Kept on globalThis because Next can load this module once
- **Main Exports / Entry Points**: `function saveBacktestRun`, `function getBacktestRun`, `function getAllBacktestRuns`
- **Inbound Dependencies**: `web/src/app/api/backtest/compare-runs/route.ts`, `web/src/app/api/backtest/compare/route.ts`, `web/src/app/api/backtest/run/route.ts`, `web/src/app/api/backtest/runs/[id]/route.ts`, `web/src/app/api/backtest/runs/route.ts` *(+8 more)*
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/backtestTypes.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/breadthService.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/breadthService.ts)

- **Relative Path**: `web/src/lib/services/breadthService.ts`
- **File Type**: `.ts` (185 lines, 5,763 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function classifyBreadthSignal`, `function classifyPriceBreadthState`, `function calculateBreadth`, `function unavailableBreadth`
- **Inbound Dependencies**: `web/scripts/live-verification.mjs`, `web/src/lib/backtestSnapshot.ts`, `web/src/lib/productionReadinessAudit.test.ts`, `web/src/lib/services/breadth.test.ts`, `web/src/lib/services/mock.ts` *(+1 more)*
- **Outbound Dependencies**: `web/src/lib/services/breadthConfig.ts`, `web/src/lib/time.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/productionReadinessAudit.test.ts`, `web/src/lib/services/breadth.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/cache.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/cache.ts)

- **Relative Path**: `web/src/lib/services/cache.ts`
- **File Type**: `.ts` (19 lines, 928 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: The one short-lived server-side cache for Upstox data (quotes, chains, candles, futures).
- **Main Exports / Entry Points**: `function clearUpstoxCache`, `function cached`
- **Inbound Dependencies**: `web/src/lib/engine/stockOpportunityEngine.ts`, `web/src/lib/services/futures.ts`, `web/src/lib/services/historicalCandles.ts`, `web/src/lib/services/news.test.ts`, `web/src/lib/services/newsProvider.ts` *(+4 more)*
- **Outbound Dependencies**: *None*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/services/news.test.ts`, `web/src/lib/services/phase9.test.ts`, `web/src/lib/services/rss.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/candles.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/candles.ts)

- **Relative Path**: `web/src/lib/services/candles.ts`
- **File Type**: `.ts` (48 lines, 2,820 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Candle plan + normalization (pure). Upstox v3 candles arrive newest-first as
- **Main Exports / Entry Points**: `const TIMEFRAMES`, `const DEFAULT_TIMEFRAME`, `function isTimeframe`, `const CANDLE_PLAN`, `const HISTORY_TTL_MS`, `const DAILY_TTL_MS`, `function normalizeCandles`, `function mergeCandles`
- **Inbound Dependencies**: `web/src/app/api/technical/[index]/route.ts`, `web/src/lib/marketHistory.ts`, `web/src/lib/services/futures.test.ts`, `web/src/lib/services/historicalCandles.ts`, `web/src/lib/services/technical.test.ts` *(+1 more)*
- **Outbound Dependencies**: `web/src/lib/services/errors.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/services/futures.test.ts`, `web/src/lib/services/technical.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/errors.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/errors.ts)

- **Relative Path**: `web/src/lib/services/errors.ts`
- **File Type**: `.ts` (24 lines, 961 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: An Upstox failure the dashboard recovers from by falling back to mock data.
- **Main Exports / Entry Points**: `class UpstoxError`, `class InvalidRequestError`, `class NewsError`
- **Inbound Dependencies**: `web/scripts/options-audit-research.ts`, `web/src/app/api/option-chain/[index]/route.ts`, `web/src/lib/phase14.test.ts`, `web/src/lib/services/candles.ts`, `web/src/lib/services/futures.ts` *(+9 more)*
- **Outbound Dependencies**: `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/phase14.test.ts`, `web/src/lib/services/marketData.test.ts`, `web/src/lib/services/news.test.ts`, `web/src/lib/services/technical.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/historicalCandles.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/historicalCandles.ts)

- **Relative Path**: `web/src/lib/services/historicalCandles.ts`
- **File Type**: `.ts` (218 lines, 9,634 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Historical candle range loader (read-only). Splits a requested range into Upstox-sized chunks, fetches each,
- **Main Exports / Entry Points**: `const MAX_CHUNK_DAYS`, `const HISTORICAL_TTL_MS`, `const istDay`, `function expectedBarsPerSession`, `interface Chunk`, `function planChunks`, `function tradingDays`, `interface Coverage` *(+9 more)*
- **Inbound Dependencies**: `web/src/lib/backtestTypes.ts`, `web/src/lib/calendar.test.ts`, `web/src/lib/historicalOptionData.test.ts`, `web/src/lib/services/backtestInputs.ts`, `web/src/lib/services/historicalContext.ts` *(+3 more)*
- **Outbound Dependencies**: `web/src/lib/services/cache.ts`, `web/src/lib/services/candles.ts`, `web/src/lib/time.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/calendar.test.ts`, `web/src/lib/historicalOptionData.test.ts`, `web/src/lib/services/phase10.test.ts`, `web/src/lib/services/phase9.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/historicalContext.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/historicalContext.ts)

- **Relative Path**: `web/src/lib/services/historicalContext.ts`
- **File Type**: `.ts` (217 lines, 9,975 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Phase 10 historical inputs beyond the index's own candles (read-only Upstox history):
- **Main Exports / Entry Points**: `type HistoricalDataQuality`, `interface ComponentQuality`, `type OptionsDataMode`, `type IvSource`, `const VIX_KEY`, `const VIX_PERCENTILE_LOOKBACK`, `const VIX_MIN_HISTORY`, `const VIX_DAILY_WARMUP_DAYS` *(+11 more)*
- **Inbound Dependencies**: `web/src/lib/backtestEngine.ts`, `web/src/lib/backtestSnapshot.ts`, `web/src/lib/backtestTypes.ts`, `web/src/lib/historicalOptionData.test.ts`, `web/src/lib/historicalOptionDataAudit.ts` *(+5 more)*
- **Outbound Dependencies**: `web/src/lib/services/breadthConfig.ts`, `web/src/lib/services/breadthConstituents.generated.ts`, `web/src/lib/services/historicalCandles.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/historicalOptionData.test.ts`, `web/src/lib/services/phase10.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/mockMarket.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/mockMarket.ts)

- **Relative Path**: `web/src/lib/services/mockMarket.ts`
- **File Type**: `.ts` (39 lines, 1,596 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: MOCK provider: slices the mock snapshot into the provider contract. Always labelled source: MOCK.
- **Main Exports / Entry Points**: `function mockProvider`
- **Inbound Dependencies**: `web/src/lib/services/breadth.test.ts`, `web/src/lib/services/market.ts`, `web/src/lib/services/technical.test.ts`
- **Outbound Dependencies**: `web/src/lib/services/errors.ts`, `web/src/lib/services/mock.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/services/breadth.test.ts`, `web/src/lib/services/technical.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/news.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/news.ts)

- **Relative Path**: `web/src/lib/services/news.ts`
- **File Type**: `.ts` (232 lines, 12,895 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Pure news analysis: normalization, dedupe, relevance, sentiment, aggregation, event risk. No I/O.
- **Main Exports / Entry Points**: `function tokenize`, `function findPhrase`, `type RawArticle`, `function normalizeNewsApi`, `function dedupe`, `function relevance`, `const relevanceLabel`, `function sentiment` *(+3 more)*
- **Inbound Dependencies**: `web/src/lib/services/news.test.ts`, `web/src/lib/services/newsProvider.ts`, `web/src/lib/services/rss.test.ts`, `web/src/lib/services/rssNewsProvider.ts`
- **Outbound Dependencies**: `web/src/lib/services/errors.ts`, `web/src/lib/services/newsConfig.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/services/news.test.ts`, `web/src/lib/services/rss.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/newsApi.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/newsApi.ts)

- **Relative Path**: `web/src/lib/services/newsApi.ts`
- **File Type**: `.ts` (21 lines, 950 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Normalized response builders shared by the news routes (no provider fields, no keys).
- **Main Exports / Entry Points**: `const allNews`, `function sentimentSummary`, `function eventSummary`, `function indexNews`
- **Inbound Dependencies**: `web/src/app/api/events/[index]/route.ts`, `web/src/app/api/events/route.ts`, `web/src/app/api/news/[index]/route.ts`, `web/src/app/api/news/route.ts`, `web/src/app/api/sentiment/[index]/route.ts`
- **Outbound Dependencies**: `web/src/lib/services/instrumentRegistry.ts`, `web/src/lib/services/newsProvider.ts`, `web/src/lib/time.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/newsProvider.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/newsProvider.ts)

- **Relative Path**: `web/src/lib/services/newsProvider.ts`
- **File Type**: `.ts` (92 lines, 5,165 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: News providers (server-only). Every provider returns raw normalized articles + its own status; the articles
- **Main Exports / Entry Points**: `interface NewsProvider`, `function fetchNewsPool`, `const newsApiProvider`, `const rssProvider`, `const NEWS_PROVIDERS`, `function getIndexNews`
- **Inbound Dependencies**: `web/src/lib/services/market.ts`, `web/src/lib/services/news.test.ts`, `web/src/lib/services/newsApi.ts`, `web/src/lib/services/rss.test.ts`
- **Outbound Dependencies**: `web/src/lib/services/cache.ts`, `web/src/lib/services/errors.ts`, `web/src/lib/services/instrumentRegistry.ts`, `web/src/lib/services/news.ts`, `web/src/lib/services/newsConfig.ts` *(+2 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/services/news.test.ts`, `web/src/lib/services/rss.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/optionChainAnalytics.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/optionChainAnalytics.ts)

- **Relative Path**: `web/src/lib/services/optionChainAnalytics.ts`
- **File Type**: `.ts` (78 lines, 3,916 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Pure option-chain maths, shared by mock and live data. No I/O.
- **Main Exports / Entry Points**: `function atmStrike`, `function strikeStep`, `function sliceAroundAtm`, `function validExpiries`, `function chainMetrics`
- **Inbound Dependencies**: `web/src/app/api/auth/health/route.ts`, `web/src/app/api/option-chain/[index]/route.ts`, `web/src/lib/engine/analysis.ts`, `web/src/lib/engine/opportunityEngine.ts`, `web/src/lib/services/market.ts` *(+2 more)*
- **Outbound Dependencies**: `web/src/lib/time.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/services/marketData.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/optionContractLTT.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/optionContractLTT.ts)

- **Relative Path**: `web/src/lib/services/optionContractLTT.ts`
- **File Type**: `.ts` (267 lines, 11,187 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Phase 30.4 — Prototype: associate per-contract exchange trade times with option-chain rows.
- **Main Exports / Entry Points**: `const OPTION_QUOTE_LTT_ENABLED`, `interface ContractQuoteFreshness`, `interface ChainLTTAudit`, `function extractEvaluationKeys`, `function parseLTT`, `function buildChainLTTAudit`
- **Inbound Dependencies**: `web/src/lib/phase30_4.test.ts`
- **Outbound Dependencies**: `web/src/lib/engine/opportunityEngine.ts`, `web/src/lib/services/upstoxMarket.ts`, `web/src/lib/time.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/phase30_4.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/performance/api.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/performance/api.ts)

- **Relative Path**: `web/src/lib/services/performance/api.ts`
- **File Type**: `.ts` (33 lines, 1,621 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Shared request helpers for /api/performance/* (reads the one backtest run store; no second source of truth).
- **Main Exports / Entry Points**: `function filtersFrom`, `function loadReport`, `const json`
- **Inbound Dependencies**: `web/src/app/api/performance/[runId]/equity/route.ts`, `web/src/app/api/performance/[runId]/export/route.ts`, `web/src/app/api/performance/[runId]/monthly/route.ts`, `web/src/app/api/performance/[runId]/regimes/route.ts`, `web/src/app/api/performance/[runId]/risk/route.ts` *(+3 more)*
- **Outbound Dependencies**: `web/src/lib/backtestTypes.ts`, `web/src/lib/services/backtestStore.ts`, `web/src/lib/services/performance/report.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/performance/journal.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/performance/journal.ts)

- **Relative Path**: `web/src/lib/services/performance/journal.ts`
- **File Type**: `.ts` (93 lines, 4,769 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Trade journal + CSV export. Multi-leg trades keep their legs (never flattened into one fake leg).
- **Main Exports / Entry Points**: `function journalEntry`, `const journal`, `const TRADE_COLUMNS`, `function tradesCsv`, `const LEG_COLUMNS`, `function legsCsv`
- **Inbound Dependencies**: `web/src/app/api/performance/[runId]/export/route.ts`, `web/src/app/api/performance/[runId]/trades/route.ts`, `web/src/app/performance/page.tsx`, `web/src/components/performance/TradeJournal.tsx`, `web/src/lib/dashboard.test.ts` *(+2 more)*
- **Outbound Dependencies**: `web/src/lib/backtestTypes.ts`, `web/src/lib/services/performance/metrics.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/dashboard.test.ts`, `web/src/lib/services/performance.test.ts`, `web/src/lib/services/phase9.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/performance/metrics.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/performance/metrics.ts)

- **Relative Path**: `web/src/lib/services/performance/metrics.ts`
- **File Type**: `.ts` (263 lines, 13,216 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Performance & risk analytics over COMPLETED backtest results (pure, deterministic; no clock, no randomness,
- **Main Exports / Entry Points**: `interface Metric`, `const PERIODS_PER_YEAR`, `const MIN_RETURN_OBSERVATIONS`, `const MIN_DAYS_FOR_ANNUALIZATION`, `const istDay`, `const istMonth`, `const holdingMinutes`, `function coreMetrics` *(+17 more)*
- **Inbound Dependencies**: `web/src/app/api/backtest/walk-forward/[id]/equity/route.ts`, `web/src/app/performance/page.tsx`, `web/src/lib/backtestEngine.ts`, `web/src/lib/services/backtestScenarios.ts`, `web/src/lib/services/performance.test.ts` *(+2 more)*
- **Outbound Dependencies**: `web/src/lib/backtestTypes.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/services/performance.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/performance/report.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/performance/report.ts)

- **Relative Path**: `web/src/lib/services/performance/report.ts`
- **File Type**: `.ts` (230 lines, 12,916 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Phase 8 performance report: one deterministic function from a completed BacktestResult (+ optional trade
- **Main Exports / Entry Points**: `const PERFORMANCE_LABEL`, `function historicalWarnings`, `const REGIME_ORDER`, `interface TradeFilters`, `function filterTrades`, `const METRIC_HELP`, `interface ReportOptions`, `function buildPerformanceReport` *(+1 more)*
- **Inbound Dependencies**: `web/src/app/api/performance/[runId]/export/route.ts`, `web/src/app/api/performance/[runId]/trades/route.ts`, `web/src/app/performance/page.tsx`, `web/src/lib/dashboard.test.ts`, `web/src/lib/services/backtestScenarios.ts` *(+2 more)*
- **Outbound Dependencies**: `web/src/lib/backtestTypes.ts`, `web/src/lib/services/performance/metrics.ts`, `web/src/lib/services/risk/riskConfig.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/dashboard.test.ts`, `web/src/lib/services/performance.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/recommendationStore.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/recommendationStore.ts)

- **Relative Path**: `web/src/lib/services/recommendationStore.ts`
- **File Type**: `.ts` (107 lines, 4,202 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Phase 11.3 / 11.3.2 — Recommendation journal persistence.
- **Main Exports / Entry Points**: `const PROD_STORE_DIR`, `function createRecommendationStore`, `function saveJournalEntry`, `function getJournalEntry`, `function getAllJournalEntries`, `function updateJournalEntry`
- **Inbound Dependencies**: `web/src/app/api/paper-trading/enter/route.ts`, `web/src/app/api/recommendations/[id]/paper-trade/route.ts`, `web/src/app/api/recommendations/[id]/refresh/route.ts`, `web/src/app/api/recommendations/[id]/route.ts`, `web/src/app/api/recommendations/analytics/route.ts` *(+12 more)*
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/journalTypes.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/evaluation.test.ts`, `web/src/lib/journal.test.ts`, `web/src/lib/phase15.test.ts`, `web/src/lib/phase16.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/rssNewsProvider.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/rssNewsProvider.ts)

- **Relative Path**: `web/src/lib/services/rssNewsProvider.ts`
- **File Type**: `.ts` (120 lines, 6,197 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Real-time RSS news (public publisher feeds). Lightweight, safe extraction of RSS 2.0 <item> / Atom <entry>:
- **Main Exports / Entry Points**: `function parseFeed`, `function feedFreshness`, `function clearRssBackoff`, `function fetchRss`
- **Inbound Dependencies**: `web/src/lib/services/newsProvider.ts`, `web/src/lib/services/rss.test.ts`
- **Outbound Dependencies**: `web/src/lib/services/cache.ts`, `web/src/lib/services/errors.ts`, `web/src/lib/services/news.ts`, `web/src/lib/services/newsConfig.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/services/rss.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/stockService.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/stockService.ts)

- **Relative Path**: `web/src/lib/services/stockService.ts`
- **File Type**: `.ts` (147 lines, 7,720 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Phase 13 — NSE equity + index market data (read-only). Independent of the options strategy.
- **Main Exports / Entry Points**: `interface StockInstrument`, `interface StockMarketData`, `function equityMaster`, `function searchInstruments`, `function resolveSymbol`, `function normalizeStockQuote`, `function stockQuote`, `function stockHistory`
- **Inbound Dependencies**: `web/src/app/api/stocks/[symbol]/history/route.ts`, `web/src/app/api/stocks/[symbol]/route.ts`, `web/src/app/api/stocks/[symbol]/technicals/route.ts`, `web/src/app/api/stocks/search/route.ts`, `web/src/app/market-history/page.tsx` *(+6 more)*
- **Outbound Dependencies**: `node:fs`, `node:path`, `node:zlib`, `web/src/lib/marketHistory.ts`, `web/src/lib/services/breadthConstituents.generated.ts` *(+4 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/engine/intradayConfidence.test.ts`, `web/src/lib/phase13.test.ts`, `web/src/lib/phase30_1.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/technicalAnalysis.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/technicalAnalysis.ts)

- **Relative Path**: `web/src/lib/services/technicalAnalysis.ts`
- **File Type**: `.ts` (271 lines, 13,800 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Pure technical analysis on real candles. No I/O, no generated data: anything that can't be computed is null.
- **Main Exports / Entry Points**: `const VOLATILITY`, `const istDate`, `function ema`, `function rsi`, `function atr`, `function macd`, `function vwap`, `function previousDay` *(+6 more)*
- **Inbound Dependencies**: `web/src/app/api/stocks/[symbol]/technicals/route.ts`, `web/src/app/api/technical/[index]/route.ts`, `web/src/lib/backtestSnapshot.ts`, `web/src/lib/engine/analysis.ts`, `web/src/lib/engine/positionalTrend.ts` *(+6 more)*
- **Outbound Dependencies**: `web/src/lib/time.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/services/futures.test.ts`, `web/src/lib/services/technical.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/walkForwardStore.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/walkForwardStore.ts)

- **Relative Path**: `web/src/lib/services/walkForwardStore.ts`
- **File Type**: `.ts` (42 lines, 1,387 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function saveWalkForwardRun`, `function getWalkForwardRun`, `function getAllWalkForwardRuns`
- **Inbound Dependencies**: `web/src/app/api/backtest/walk-forward/[id]/equity/route.ts`, `web/src/app/api/backtest/walk-forward/[id]/route.ts`, `web/src/app/api/backtest/walk-forward/[id]/trades/route.ts`, `web/src/app/api/backtest/walk-forward/[id]/windows/route.ts`, `web/src/app/api/backtest/walk-forward/route.ts` *(+3 more)*
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/walkForwardEngine.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/strategyEvidenceEngine.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/strategyEvidenceEngine.ts)

- **Relative Path**: `web/src/lib/strategyEvidenceEngine.ts`
- **File Type**: `.ts` (587 lines, 25,679 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Phase 11.8 — Final strategy evidence and go/no-go assessment engine.
- **Main Exports / Entry Points**: `const FROZEN_STRATEGY_VERSION`, `const FROZEN_RISK_CONFIG`, `type EvidenceDecision`, `type EvidenceConclusion`, `type GateStatus`, `interface EvidenceGate`, `interface DataFidelityEntry`, `interface BacktestSummary` *(+5 more)*
- **Inbound Dependencies**: `web/src/app/api/strategy/evidence/export/route.ts`, `web/src/app/api/strategy/evidence/route.ts`, `web/src/app/strategy-evidence/page.tsx`, `web/src/lib/phase15.test.ts`, `web/src/lib/phase16.test.ts` *(+5 more)*
- **Outbound Dependencies**: `web/src/lib/backtestTypes.ts`, `web/src/lib/evaluationEngine.ts`, `web/src/lib/historicalOptionDataAudit.ts`, `web/src/lib/journalTypes.ts`, `web/src/lib/services/historicalContext.ts` *(+1 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/phase15.test.ts`, `web/src/lib/phase16.test.ts`, `web/src/lib/phase18.test.ts`, `web/src/lib/productionReadinessAudit.test.ts`, `web/src/lib/research/optionsAuditResearchPhase8.test.ts`, `web/src/lib/runtimeTrust.test.ts`, `web/src/lib/strategyEvidence.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/time.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/time.ts)

- **Relative Path**: `web/src/lib/time.ts`
- **File Type**: `.ts` (169 lines, 7,213 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: IST is UTC+5:30 with no DST, so a fixed offset is exact.
- **Main Exports / Entry Points**: `function istMinutes`, `type MarketStatus`, `const NSE_HOLIDAYS`, `const NSE_SPECIAL_SESSIONS`, `const REGULAR_SESSION`, `function isTradingDay`, `function sessionWindow`, `const isRegularSession` *(+8 more)*
- **Inbound Dependencies**: `web/scripts/options-audit-research.ts`, `web/src/app/layout.tsx`, `web/src/components/AnalysisPanels.tsx`, `web/src/components/DataStatus.tsx`, `web/src/components/DataTimestamps.tsx` *(+30 more)*
- **Outbound Dependencies**: *None*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/calendar.test.ts`, `web/src/lib/phase30.test.ts`, `web/src/lib/phase30_1.test.ts`, `web/src/lib/productionReadinessAudit.test.ts`, `web/src/lib/research/optionsAuditResearchPhase8.test.ts`, `web/src/lib/services/marketData.test.ts`, `web/src/lib/services/phase10.test.ts`, `web/src/lib/services/phase9.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/types.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/types.ts)

- **Relative Path**: `web/src/lib/types.ts`
- **File Type**: `.ts` (424 lines, 13,587 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Where a piece of data came from. UNAVAILABLE = not produced yet (e.g. candle indicators before Phase 3).
- **Main Exports / Entry Points**: `type IndexId`, `type DataSource`, `type Freshness`, `type Subsystem`, `type FallbackReason`, `interface SourceInfo`, `interface Quote`, `interface OptionRow` *(+30 more)*
- **Inbound Dependencies**: `web/scripts/backtest-positional-v2.ts`, `web/scripts/backtest-positional.ts`, `web/scripts/intraday-replay.ts`, `web/scripts/options-audit-research.ts`, `web/scripts/options-data-audit.ts` *(+102 more)*
- **Outbound Dependencies**: `web/src/lib/services/risk/riskTypes.ts`
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/calendar.test.ts`, `web/src/lib/contractIntegrity.test.ts`, `web/src/lib/dashboard.test.ts`, `web/src/lib/engine/engine.test.ts`, `web/src/lib/engine/intradayReplay.test.ts`, `web/src/lib/engine/positionalBacktest.test.ts`, `web/src/lib/engine/positionalTrend.test.ts`, `web/src/lib/engine/positionalV2.test.ts`, `web/src/lib/historicalOptionData.test.ts`, `web/src/lib/journal.test.ts`, `web/src/lib/optionsAudit.test.ts`, `web/src/lib/paperTradingHardening.test.ts`, `web/src/lib/phase13.test.ts`, `web/src/lib/phase14.test.ts`, `web/src/lib/phase19.test.ts`, `web/src/lib/phase20.test.ts`, `web/src/lib/phase21.test.ts`, `web/src/lib/phase22.test.ts`, `web/src/lib/phase30_4.test.ts`, `web/src/lib/productionReadinessAudit.test.ts`, `web/src/lib/recommendation.test.ts`, `web/src/lib/runtimeTrust.test.ts`, `web/src/lib/services/backtest.test.ts`, `web/src/lib/services/breadth.test.ts`, `web/src/lib/services/futures.test.ts`, `web/src/lib/services/marketData.test.ts`, `web/src/lib/services/news.test.ts`, `web/src/lib/services/paperTrading.test.ts`, `web/src/lib/services/performance.test.ts`, `web/src/lib/services/phase10.test.ts`, `web/src/lib/services/phase9.test.ts`, `web/src/lib/services/risk.test.ts`, `web/src/lib/services/technical.test.ts`, `web/src/lib/walkForwardEngine.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/walkForwardEngine.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/walkForwardEngine.ts)

- **Relative Path**: `web/src/lib/walkForwardEngine.ts`
- **File Type**: `.ts` (469 lines, 16,256 bytes)
- **Category**: Application Source and Libraries
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `type WindowType`, `interface WalkForwardConfig`, `interface WindowDefinition`, `interface WindowResult`, `type WalkForwardValidationGate`, `interface AggregateOOSMetrics`, `interface ConcentrationWarning`, `interface WalkForwardResult` *(+4 more)*
- **Inbound Dependencies**: `web/src/app/api/backtest/walk-forward/route.ts`, `web/src/lib/services/walkForwardStore.ts`, `web/src/lib/strategyEvidence.test.ts`, `web/src/lib/strategyEvidenceEngine.ts`, `web/src/lib/walkForwardEngine.test.ts`
- **Outbound Dependencies**: `web/src/lib/backtestEngine.ts`, `web/src/lib/backtestTypes.ts`, `web/src/lib/services/backtestScenarios.ts`, `web/src/lib/services/historicalContext.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/strategyEvidence.test.ts`, `web/src/lib/walkForwardEngine.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---
