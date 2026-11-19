# Inventory: Paper-Trading Execution and Monitoring

**Category**: `04-paper-trading-and-monitoring`  
**File Count**: 14 files  
**Description**: Hardened paper trading engine, opportunity runner, monitoring loop, fill modeling, and P&L math

---

### [`web/scripts/paper-live.mjs`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/paper-live.mjs)

- **Relative Path**: `web/scripts/paper-live.mjs`
- **File Type**: `.mjs` (121 lines, 5,706 bytes)
- **Category**: Paper-Trading Execution and Monitoring
- **Purpose & Responsibility**: Lock protection
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:child_process`, `node:fs`, `node:path`, `web/scripts/runner-lib.mjs`, `web/scripts/upstox-cli.mjs`
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Active operational stock opportunity runner. Monitor EOD exit execution and bridge to paper ledger after market hours.
- **Recommended Action**: **`VERIFY`**

---

### [`web/scripts/run-paper-supervisor.mjs`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/run-paper-supervisor.mjs)

- **Relative Path**: `web/scripts/run-paper-supervisor.mjs`
- **File Type**: `.mjs` (102 lines, 3,780 bytes)
- **Category**: Paper-Trading Execution and Monitoring
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:child_process`, `node:fs`, `node:http`, `node:path`, `node:url` *(+1 more)*
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Paper trading support component.
- **Recommended Action**: **`KEEP`**

---

### [`web/scripts/runner-lib.mjs`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/runner-lib.mjs)

- **Relative Path**: `web/scripts/runner-lib.mjs`
- **File Type**: `.mjs` (48 lines, 2,405 bytes)
- **Category**: Paper-Trading Execution and Monitoring
- **Purpose & Responsibility**: Pure helpers for scripts/paper-live.mjs, kept separate so they can be unit-tested.
- **Main Exports / Entry Points**: `function cycleAction`, `function lockHeldByLiveRunner`, `const istDate`, `const istHm`, `function healthRecord`, `const openingWindowMissed`, `function classifyStockErrors`
- **Inbound Dependencies**: `web/scripts/paper-live.mjs`, `web/scripts/run-paper-supervisor.mjs`, `web/src/lib/runnerLib.test.ts`
- **Outbound Dependencies**: `node:child_process`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/runnerLib.test.ts`
- **Known Issues & Safety Implications**: Paper trading support component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/paperEngine.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/paperEngine.ts)

- **Relative Path**: `web/src/lib/paperEngine.ts`
- **File Type**: `.ts` (567 lines, 23,578 bytes)
- **Category**: Paper-Trading Execution and Monitoring
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function calculateEntryFill`, `function calculateExitFill`, `interface PaperEngineOptions`, `class PaperTradingEngine`
- **Inbound Dependencies**: `web/src/lib/backtestEngine.ts`, `web/src/lib/paperTradingHardening.test.ts`, `web/src/lib/recommendationEnricher.ts`, `web/src/lib/services/paperStore.ts`, `web/src/lib/services/paperTrading.test.ts` *(+1 more)*
- **Outbound Dependencies**: `web/src/lib/paperMath.ts`, `web/src/lib/paperReport.ts`, `web/src/lib/paperStateMachine.ts`, `web/src/lib/paperTypes.ts`, `web/src/lib/services/risk/riskConfig.ts` *(+3 more)*
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/paperTradingHardening.test.ts`, `web/src/lib/services/paperTrading.test.ts`, `web/src/lib/services/performance.test.ts`
- **Known Issues & Safety Implications**: Core hardened paper engine. Verified fail-closed, post-fill sizing, 15:30 IST expiry, and atomic persistence.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/paperMath.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/paperMath.ts)

- **Relative Path**: `web/src/lib/paperMath.ts`
- **File Type**: `.ts` (88 lines, 3,113 bytes)
- **Category**: Paper-Trading Execution and Monitoring
- **Purpose & Responsibility**: Pure paper-trading arithmetic shared by the engine, the performance report and the ledger reconciliation.
- **Main Exports / Entry Points**: `const r2`, `function istDay`, `function expiryInstant`, `function calculateNetValue`, `function calculateTradePnL`, `function tradeCostsFor`
- **Inbound Dependencies**: `web/src/lib/paperEngine.ts`, `web/src/lib/paperReport.ts`, `web/src/lib/paperTradingHardening.test.ts`, `web/src/lib/services/paperOpportunityMonitor.ts`
- **Outbound Dependencies**: `web/src/lib/paperTypes.ts`, `web/src/lib/services/transactionCosts.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/paperTradingHardening.test.ts`
- **Known Issues & Safety Implications**: Core hardened paper engine. Verified fail-closed, post-fill sizing, 15:30 IST expiry, and atomic persistence.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/paperReport.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/paperReport.ts)

- **Relative Path**: `web/src/lib/paperReport.ts`
- **File Type**: `.ts` (177 lines, 8,705 bytes)
- **Category**: Paper-Trading Execution and Monitoring
- **Purpose & Responsibility**: Paper-trade ledger report and reconciliation. Pure functions over the trade ledger (PaperTrade[] + events).
- **Main Exports / Entry Points**: `const REPORT_LABEL`, `const CLOSED_STATUSES`, `interface GroupRow`, `interface PaperLedgerReport`, `function buildPaperLedgerReport`, `type LedgerIssueCode`, `interface LedgerIssue`, `interface LedgerReconciliation` *(+1 more)*
- **Inbound Dependencies**: `web/src/app/api/paper-trading/portfolio/route.ts`, `web/src/lib/paperEngine.ts`, `web/src/lib/paperTradingHardening.test.ts`
- **Outbound Dependencies**: `web/src/lib/paperMath.ts`, `web/src/lib/paperTypes.ts`, `web/src/lib/services/paperOpportunityStore.ts`, `web/src/lib/services/transactionCosts.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/paperTradingHardening.test.ts`
- **Known Issues & Safety Implications**: Paper trading support component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/paperStateMachine.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/paperStateMachine.ts)

- **Relative Path**: `web/src/lib/paperStateMachine.ts`
- **File Type**: `.ts` (22 lines, 719 bytes)
- **Category**: Paper-Trading Execution and Monitoring
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function canTransition`, `function validateTransition`
- **Inbound Dependencies**: `web/src/lib/paperEngine.ts`
- **Outbound Dependencies**: `web/src/lib/paperTypes.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Paper trading support component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/paperTypes.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/paperTypes.ts)

- **Relative Path**: `web/src/lib/paperTypes.ts`
- **File Type**: `.ts` (143 lines, 4,341 bytes)
- **Category**: Paper-Trading Execution and Monitoring
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `type PaperTradeStatus`, `type FillPriceSource`, `type ExitReason`, `interface PaperTradeLeg`, `interface PaperTradeEvent`, `interface PaperTradeMonitoring`, `interface PaperTrade`, `interface PaperPortfolioSummary`
- **Inbound Dependencies**: `web/src/lib/backtestEngine.ts`, `web/src/lib/paperEngine.ts`, `web/src/lib/paperMath.ts`, `web/src/lib/paperReport.ts`, `web/src/lib/paperStateMachine.ts` *(+2 more)*
- **Outbound Dependencies**: `web/src/lib/services/risk/riskConfig.ts`, `web/src/lib/services/risk/riskTypes.ts`, `web/src/lib/services/transactionCosts.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/paperTradingHardening.test.ts`
- **Known Issues & Safety Implications**: Paper trading support component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/liveOpportunityCollector.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/liveOpportunityCollector.ts)

- **Relative Path**: `web/src/lib/services/liveOpportunityCollector.ts`
- **File Type**: `.ts` (336 lines, 12,918 bytes)
- **Category**: Paper-Trading Execution and Monitoring
- **Purpose & Responsibility**: Phase 24 — Live opportunity collector.
- **Main Exports / Entry Points**: `interface LiveCollectionRun`, `function saveCollectionRun`, `function listCollectionRuns`, `interface CollectionResult`, `const ENTRY_CUTOFF_IST_MIN`, `function runLiveOpportunityCollection`
- **Inbound Dependencies**: `web/src/app/api/paper-opportunities/collect/route.ts`, `web/src/app/opportunity-journal/page.tsx`, `web/src/lib/ops/opsStatus.ts`, `web/src/lib/paperIntegrity.test.ts`, `web/src/lib/paperTradingHardening.test.ts` *(+6 more)*
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/engine/opportunityEngine.ts`, `web/src/lib/engine/stockOpportunityEngine.ts`, `web/src/lib/services/liveSessionController.ts` *(+2 more)*
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/paperIntegrity.test.ts`, `web/src/lib/paperTradingHardening.test.ts`, `web/src/lib/phase24.test.ts`, `web/src/lib/phase25.test.ts`, `web/src/lib/phase27.test.ts`, `web/src/lib/phase28.test.ts`, `web/src/lib/runnerLib.test.ts`
- **Known Issues & Safety Implications**: Active operational stock opportunity runner. Monitor EOD exit execution and bridge to paper ledger after market hours.
- **Recommended Action**: **`VERIFY`**

---

### [`web/src/lib/services/paperOpportunityMonitor.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/paperOpportunityMonitor.ts)

- **Relative Path**: `web/src/lib/services/paperOpportunityMonitor.ts`
- **File Type**: `.ts` (414 lines, 15,661 bytes)
- **Category**: Paper-Trading Execution and Monitoring
- **Purpose & Responsibility**: Phase 23 — Paper opportunity monitor.
- **Main Exports / Entry Points**: `const FILL_CONVENTION`, `interface EvalInput`, `interface EvalResult`, `function sessionCloseFor`, `function applyEndOfDay`, `function evaluatePaperOpportunity`, `function evaluateAllOpen`, `function createPaperOpportunity`
- **Inbound Dependencies**: `web/src/app/api/paper-opportunities/[id]/evaluate/route.ts`, `web/src/app/api/paper-opportunities/route.ts`, `web/src/lib/paperIntegrity.test.ts`, `web/src/lib/paperTradingHardening.test.ts`, `web/src/lib/phase23.test.ts` *(+7 more)*
- **Outbound Dependencies**: `web/src/lib/paperMath.ts`, `web/src/lib/services/paperOpportunityStore.ts`
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/paperIntegrity.test.ts`, `web/src/lib/paperTradingHardening.test.ts`, `web/src/lib/phase23.test.ts`, `web/src/lib/phase24.test.ts`, `web/src/lib/phase25.test.ts`, `web/src/lib/phase27.test.ts`, `web/src/lib/phase28.test.ts`
- **Known Issues & Safety Implications**: Active operational stock opportunity runner. Monitor EOD exit execution and bridge to paper ledger after market hours.
- **Recommended Action**: **`VERIFY`**

---

### [`web/src/lib/services/paperOpportunityStore.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/paperOpportunityStore.ts)

- **Relative Path**: `web/src/lib/services/paperOpportunityStore.ts`
- **File Type**: `.ts` (359 lines, 12,430 bytes)
- **Category**: Paper-Trading Execution and Monitoring
- **Purpose & Responsibility**: Phase 23 — Paper opportunity lifecycle store.
- **Main Exports / Entry Points**: `type DataSourceState`, `type PaperStatus`, `const TERMINAL_STATES`, `const LEGACY_FIXTURE_CUTOFF`, `function isFixture`, `interface PaperOpportunityEvent`, `type InstrumentType`, `interface PaperOpportunity` *(+9 more)*
- **Inbound Dependencies**: `web/scripts/intraday-evaluation.ts`, `web/scripts/intraday-replay.ts`, `web/src/app/api/opportunities/daily-summary/route.ts`, `web/src/app/api/paper-opportunities/[id]/evaluate/route.ts`, `web/src/app/api/paper-opportunities/[id]/route.ts` *(+18 more)*
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/engine/opportunityEngine.ts`
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/intradayEvaluation.test.ts`, `web/src/lib/paperIntegrity.test.ts`, `web/src/lib/paperTradingHardening.test.ts`, `web/src/lib/phase23.test.ts`, `web/src/lib/phase24.test.ts`, `web/src/lib/phase25.test.ts`, `web/src/lib/phase27.test.ts`, `web/src/lib/phase28.test.ts`
- **Known Issues & Safety Implications**: Paper trading support component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/paperPriceInput.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/paperPriceInput.ts)

- **Relative Path**: `web/src/lib/services/paperPriceInput.ts`
- **File Type**: `.ts` (24 lines, 1,234 bytes)
- **Category**: Paper-Trading Execution and Monitoring
- **Purpose & Responsibility**: Builds the price input for monitoring an OPEN option paper opportunity from a market snapshot.
- **Main Exports / Entry Points**: `function optionMonitorInput`
- **Inbound Dependencies**: `web/src/app/api/paper-opportunities/monitor/route.ts`, `web/src/lib/paperTradingHardening.test.ts`
- **Outbound Dependencies**: `web/src/lib/services/paperOpportunityMonitor.ts`, `web/src/lib/types.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/paperTradingHardening.test.ts`
- **Known Issues & Safety Implications**: Paper trading support component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/paperStore.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/paperStore.ts)

- **Relative Path**: `web/src/lib/services/paperStore.ts`
- **File Type**: `.ts` (22 lines, 1,061 bytes)
- **Category**: Paper-Trading Execution and Monitoring
- **Purpose & Responsibility**: Process-wide singleton, kept on globalThis so every route bundle shares one engine (and one in-memory ledger).
- **Main Exports / Entry Points**: `function getPaperTradingEngine`
- **Inbound Dependencies**: `web/src/app/[section]/page.tsx`, `web/src/app/api/paper-trading/close/route.ts`, `web/src/app/api/paper-trading/enter/route.ts`, `web/src/app/api/paper-trading/portfolio/route.ts`, `web/src/app/api/paper-trading/trades/[id]/route.ts` *(+3 more)*
- **Outbound Dependencies**: `web/src/lib/paperEngine.ts`, `web/src/lib/services/paperLedgerStore.ts`
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Paper trading support component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/paperTradeMonitorRunner.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/paperTradeMonitorRunner.ts)

- **Relative Path**: `web/src/lib/services/paperTradeMonitorRunner.ts`
- **File Type**: `.ts` (185 lines, 6,493 bytes)
- **Category**: Paper-Trading Execution and Monitoring
- **Purpose & Responsibility**: Phase 24 — Paper trade monitor runner.
- **Main Exports / Entry Points**: `interface PaperMonitorRun`, `function saveMonitorRun`, `function listMonitorRuns`, `type PriceFetcher`, `function runOnce`
- **Inbound Dependencies**: `web/src/app/api/paper-opportunities/monitor/route.ts`, `web/src/app/opportunity-journal/page.tsx`, `web/src/lib/ops/opsStatus.ts`, `web/src/lib/phase24.test.ts`, `web/src/lib/phase25.test.ts` *(+3 more)*
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/services/paperOpportunityMonitor.ts`, `web/src/lib/services/paperOpportunityStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/phase24.test.ts`, `web/src/lib/phase25.test.ts`, `web/src/lib/phase27.test.ts`, `web/src/lib/phase28.test.ts`
- **Known Issues & Safety Implications**: Paper trading support component.
- **Recommended Action**: **`KEEP`**

---
