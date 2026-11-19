# Inventory: Persistence and Audit Storage

**Category**: `05-persistence-and-audit-storage`  
**File Count**: 8 files  
**Description**: Durable ledgers, session evidence store, audit trail append-only logs, and diagnostic storage

---

### [`web/src/lib/optionsAudit.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/optionsAudit.ts)

- **Relative Path**: `web/src/lib/optionsAudit.ts`
- **File Type**: `.ts` (128 lines, 8,531 bytes)
- **Category**: Persistence and Audit Storage
- **Purpose & Responsibility**: Phase 4 options data audit (docs/options-data-audit.md, options-audit-1). Pure: no I/O.
- **Main Exports / Entry Points**: `const AUDIT_VERSION_LEGACY`, `const AUDIT_VERSION`, `const LIVE_MAX_AGE_S`, `const PRICE_TOL`, `const MIN_SESSIONS`, `const IV_MEDIAN_MAX`, `const MAX_FAILED_ROUND_SHARE`, `function yearsToExpiry` *(+8 more)*
- **Inbound Dependencies**: `web/scripts/options-audit-research.ts`, `web/scripts/options-data-audit.ts`, `web/scripts/options-data-quality-diagnostic.ts`, `web/scripts/research-audit-experiments.ts`, `web/src/app/options-audit/page.tsx` *(+9 more)*
- **Outbound Dependencies**: `web/src/lib/engine/opportunityEngine.ts`, `web/src/lib/services/mock.ts`, `web/src/lib/types.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/optionsAudit.test.ts`, `web/src/lib/productionReadinessAudit.test.ts`, `web/src/lib/research/optionsAuditResearch.test.ts`, `web/src/lib/research/optionsAuditResearchPhase8.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/optionsAuditReport.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/optionsAuditReport.ts)

- **Relative Path**: `web/src/lib/optionsAuditReport.ts`
- **File Type**: `.ts` (42 lines, 2,496 bytes)
- **Category**: Persistence and Audit Storage
- **Purpose & Responsibility**: The one authoritative options-audit report (options-audit-1). Used by the CLI, the audit page and the dashboard,
- **Main Exports / Entry Points**: `const AUDIT_DIR`, `function auditReport`
- **Inbound Dependencies**: `web/scripts/options-data-audit.ts`, `web/src/app/options-audit/page.tsx`, `web/src/components/OpsPanel.tsx`, `web/src/lib/ops/ops.test.ts`, `web/src/lib/optionsDataQualityDiagnostic.ts` *(+1 more)*
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/ops/jsonl.ts`, `web/src/lib/optionsAudit.ts`, `web/src/lib/services/instrumentRegistry.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/ops/ops.test.ts`, `web/src/lib/research/optionsAuditResearchPhase8.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/optionsDataQualityDiagnostic.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/optionsDataQualityDiagnostic.ts)

- **Relative Path**: `web/src/lib/optionsDataQualityDiagnostic.ts`
- **File Type**: `.ts` (206 lines, 7,323 bytes)
- **Category**: Persistence and Audit Storage
- **Purpose & Responsibility**: Pure read-only diagnostics for Phase 4 options market data suitability and quality review.
- **Main Exports / Entry Points**: `type SampleClassification`, `interface ClassifiedSampleDiagnostic`, `interface IndexQualityDiagnostic`, `function classifySample`, `function analyzeIndexRounds`, `function generateDataQualityDiagnostic`
- **Inbound Dependencies**: `web/scripts/options-data-quality-diagnostic.ts`, `web/src/lib/optionsDataQualityDiagnostic.test.ts`
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/ops/jsonl.ts`, `web/src/lib/optionsAudit.ts`, `web/src/lib/optionsAuditReport.ts` *(+1 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/optionsDataQualityDiagnostic.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/research/inventoryStore.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/research/inventoryStore.ts)

- **Relative Path**: `web/src/lib/research/inventoryStore.ts`
- **File Type**: `.ts` (13 lines, 622 bytes)
- **Category**: Persistence and Audit Storage
- **Purpose & Responsibility**: Reads saved research inventories (newest first). Server-side only.
- **Main Exports / Entry Points**: `type SavedInventory`, `function loadInventories`
- **Inbound Dependencies**: `web/src/app/options-research/page.tsx`, `web/src/app/page.tsx`
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/research/optionsInventory.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/liveSessionController.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/liveSessionController.ts)

- **Relative Path**: `web/src/lib/services/liveSessionController.ts`
- **File Type**: `.ts` (63 lines, 2,135 bytes)
- **Category**: Persistence and Audit Storage
- **Purpose & Responsibility**: Market session controller for Indian NSE.
- **Main Exports / Entry Points**: `type MarketStatus`, `function marketStatus`, `function isMarketOpen`, `function minutesRemainingInSession`, `function nextSessionStart`
- **Inbound Dependencies**: `web/scripts/options-data-audit.ts`, `web/src/app/opportunity-journal/page.tsx`, `web/src/components/OpsDetails.tsx`, `web/src/components/OpsPanel.tsx`, `web/src/lib/phase24.test.ts` *(+3 more)*
- **Outbound Dependencies**: *None*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/phase24.test.ts`, `web/src/lib/phase27.test.ts`, `web/src/lib/phase28.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/opportunityTrackingStore.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/opportunityTrackingStore.ts)

- **Relative Path**: `web/src/lib/services/opportunityTrackingStore.ts`
- **File Type**: `.ts` (82 lines, 2,848 bytes)
- **Category**: Persistence and Audit Storage
- **Purpose & Responsibility**: Outcome tracking for opportunity-engine recommendations.
- **Main Exports / Entry Points**: `type OutcomeState`, `interface OpportunityRecord`, `function listOpportunityRecords`, `function saveOpportunityRecord`, `function getOpportunityRecord`, `function updateOpportunityRecord`
- **Inbound Dependencies**: `web/src/app/api/opportunities/outcomes/route.ts`, `web/src/app/api/opportunities/track/route.ts`, `web/src/app/opportunities/page.tsx`
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/engine/opportunityEngine.ts`
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/paperLedgerStore.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/paperLedgerStore.ts)

- **Relative Path**: `web/src/lib/services/paperLedgerStore.ts`
- **File Type**: `.ts` (136 lines, 6,688 bytes)
- **Category**: Persistence and Audit Storage
- **Purpose & Responsibility**: Durable storage for the options paper-trading ledger (PaperTradingEngine).
- **Main Exports / Entry Points**: `const paperLedgerDir`, `interface LoadedLedger`, `function loadPaperLedger`, `function savePaperLedger`
- **Inbound Dependencies**: `web/src/lib/paperTradingHardening.test.ts`, `web/src/lib/services/paperStore.ts`
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/paperTypes.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/paperTradingHardening.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/sessionEvidenceStore.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/sessionEvidenceStore.ts)

- **Relative Path**: `web/src/lib/services/sessionEvidenceStore.ts`
- **File Type**: `.ts` (354 lines, 14,720 bytes)
- **Category**: Persistence and Audit Storage
- **Purpose & Responsibility**: Phase 25 — Multi-session evidence store and analytics.
- **Main Exports / Entry Points**: `function getISTDateString`, `interface MarketSessionRecord`, `function saveSessionRecord`, `function getSessionRecord`, `function listSessionRecords`, `function recordCollectionCycle`, `function recordMonitoringCycle`, `interface MultiSessionSummary` *(+1 more)*
- **Inbound Dependencies**: `web/src/app/api/paper-opportunities/sessions/route.ts`, `web/src/app/opportunity-journal/page.tsx`, `web/src/lib/paperIntegrity.test.ts`, `web/src/lib/phase25.test.ts`, `web/src/lib/phase27.test.ts` *(+1 more)*
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/services/liveOpportunityCollector.ts`, `web/src/lib/services/paperOpportunityStore.ts`, `web/src/lib/services/paperTradeMonitorRunner.ts`
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/paperIntegrity.test.ts`, `web/src/lib/phase25.test.ts`, `web/src/lib/phase27.test.ts`, `web/src/lib/phase28.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---
