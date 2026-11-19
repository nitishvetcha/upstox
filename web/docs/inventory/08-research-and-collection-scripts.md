# Inventory: Research and Data Collection Scripts

**Category**: `08-research-and-collection-scripts`  
**File Count**: 24 files  
**Description**: CLI runners, audit background loops, research lab scripts, backtesters, and replay utilities

---

### [`web/scripts/backtest-positional-v2.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/backtest-positional-v2.ts)

- **Relative Path**: `web/scripts/backtest-positional-v2.ts`
- **File Type**: `.ts` (74 lines, 4,045 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: Runs positional-v2 per docs/positional-v2-hypothesis.md. Each period runs ONCE; results are never overwritten.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/engine/positionalBacktest.ts`, `web/src/lib/engine/positionalV2.ts`, `web/src/lib/marketHistory.ts` *(+4 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/scripts/backtest-positional.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/backtest-positional.ts)

- **Relative Path**: `web/scripts/backtest-positional.ts`
- **File Type**: `.ts` (43 lines, 2,667 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: Positional-engine backtest vs buy-and-hold NIFTY. Writes only to .data/positional-backtest/ (never paper records).
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/engine/positionalBacktest.ts`, `web/src/lib/marketHistory.ts`, `web/src/lib/services/breadthConstituents.generated.ts` *(+3 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/scripts/com.upstox.paperlive.plist`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/com.upstox.paperlive.plist)

- **Relative Path**: `web/scripts/com.upstox.paperlive.plist`
- **File Type**: `.plist` (89 lines, 2,627 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/scripts/dev-upstox.mjs`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/dev-upstox.mjs)

- **Relative Path**: `web/scripts/dev-upstox.mjs`
- **File Type**: `.mjs` (48 lines, 2,108 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: npm run dev:upstox — start the app, make sure Upstox is connected (opening the login page once if needed),
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:child_process`, `web/scripts/upstox-cli.mjs`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/scripts/intraday-evaluation.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/intraday-evaluation.ts)

- **Relative Path**: `web/scripts/intraday-evaluation.ts`
- **File Type**: `.ts` (29 lines, 2,630 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: Phase 2 intraday evaluation report (rules: docs/intraday-evaluation-rules.md). Read-only on paper records.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/intradayEvaluation.ts`, `web/src/lib/services/paperOpportunityStore.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/scripts/intraday-replay.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/intraday-replay.ts)

- **Relative Path**: `web/scripts/intraday-replay.ts`
- **File Type**: `.ts` (87 lines, 5,434 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: Historical replay of the intraday stock strategy (docs/intraday-replay-rules.md, intraday-replay-1).
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/engine/intradayReplay.ts`, `web/src/lib/intradayEvaluation.ts`, `web/src/lib/marketHistory.ts` *(+5 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/scripts/live-verification.mjs`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/live-verification.mjs)

- **Relative Path**: `web/scripts/live-verification.mjs`
- **File Type**: `.mjs` (131 lines, 5,906 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: READ-ONLY Live Verification Script for Phase 5.1 / 6A.1
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:fs`, `web/src/lib/engine/strategy.ts`, `web/src/lib/services/breadthService.ts`, `web/src/lib/services/mock.ts`, `web/src/lib/services/risk/riskService.ts` *(+1 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/scripts/options-audit-research.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/options-audit-research.ts)

- **Relative Path**: `web/scripts/options-audit-research.ts`
- **File Type**: `.ts` (151 lines, 9,609 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: Research Protocol options-audit-2-research CLI.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/ops/jsonl.ts`, `web/src/lib/optionsAudit.ts`, `web/src/lib/research/optionsAuditResearch.ts` *(+6 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/scripts/options-data-audit.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/options-data-audit.ts)

- **Relative Path**: `web/scripts/options-data-audit.ts`
- **File Type**: `.ts` (86 lines, 6,579 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: Phase 4 options data audit (docs/options-data-audit.md). Read-only Upstox calls; writes only .data/options-audit/.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/optionsAudit.ts`, `web/src/lib/optionsAuditReport.ts`, `web/src/lib/services/instrumentRegistry.ts` *(+4 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/scripts/options-data-quality-diagnostic.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/options-data-quality-diagnostic.ts)

- **Relative Path**: `web/scripts/options-data-quality-diagnostic.ts`
- **File Type**: `.ts` (49 lines, 4,768 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: Phase 4: Market-Data Suitability and Independent Validation
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/optionsAudit.ts`, `web/src/lib/optionsDataQualityDiagnostic.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/scripts/options-research-inventory.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/options-research-inventory.ts)

- **Relative Path**: `web/scripts/options-research-inventory.ts`
- **File Type**: `.ts` (99 lines, 8,034 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: Historical Options Research Lab — measures what historical options data actually exists. Read-only Upstox calls.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/marketHistory.ts`, `web/src/lib/research/optionsInventory.ts`, `web/src/lib/services/instrumentRegistry.ts` *(+2 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/scripts/paper-collect.mjs`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/paper-collect.mjs)

- **Relative Path**: `web/scripts/paper-collect.mjs`
- **File Type**: `.mjs` (33 lines, 1,223 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: npm run paper:collect — one live collection cycle, then exit.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/scripts/upstox-cli.mjs`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/scripts/paper-cycle.mjs`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/paper-cycle.mjs)

- **Relative Path**: `web/scripts/paper-cycle.mjs`
- **File Type**: `.mjs` (28 lines, 1,526 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: npm run paper:cycle — collect then evaluate, once, then exit.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/scripts/upstox-cli.mjs`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/scripts/paper-evaluate.mjs`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/paper-evaluate.mjs)

- **Relative Path**: `web/scripts/paper-evaluate.mjs`
- **File Type**: `.mjs` (30 lines, 1,078 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: npm run paper:evaluate — evaluate OPEN paper trades once, then exit.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/scripts/upstox-cli.mjs`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/scripts/research-audit-experiments.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/research-audit-experiments.ts)

- **Relative Path**: `web/scripts/research-audit-experiments.ts`
- **File Type**: `.ts` (294 lines, 13,450 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: Phase 5: Research-Only Audit Methodology Experiments CLI
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:fs`, `node:path`, `web/src/lib/ops/jsonl.ts`, `web/src/lib/optionsAudit.ts`, `web/src/lib/research/auditExperiments.ts` *(+3 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/scripts/run-option-ltt-audit.mts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/run-option-ltt-audit.mts)

- **Relative Path**: `web/scripts/run-option-ltt-audit.mts`
- **File Type**: `.mts` (196 lines, 8,460 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: Phase 30.5 — Live option-contract LTT audit runner.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/scripts/run-paper-supervisor.sh`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/run-paper-supervisor.sh)

- **Relative Path**: `web/scripts/run-paper-supervisor.sh`
- **File Type**: `.sh` (52 lines, 1,690 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: !/bin/zsh
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: *None*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/scripts/upstox-login.mjs`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/upstox-login.mjs)

- **Relative Path**: `web/scripts/upstox-login.mjs`
- **File Type**: `.mjs` (18 lines, 816 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: npm run upstox:login — with the dev server running, open the Upstox login once and wait for the callback.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/scripts/upstox-cli.mjs`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/scripts/validate-instruments.mjs`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/scripts/validate-instruments.mjs)

- **Relative Path**: `web/scripts/validate-instruments.mjs`
- **File Type**: `.mjs` (46 lines, 2,682 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: READ-ONLY validation: configured breadth constituents + derivative lot sizes vs the Upstox NSE instrument master.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:fs`, `node:zlib`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/research/auditExperiments.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/research/auditExperiments.ts)

- **Relative Path**: `web/src/lib/research/auditExperiments.ts`
- **File Type**: `.ts` (165 lines, 5,111 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: Research-Only Audit Methodology Experiments (Phase 5)
- **Main Exports / Entry Points**: `const AUTHORITATIVE_TICK_SIZE`, `interface TickComparisonSample`, `interface TickComparisonResult`, `function evaluateTickAwareComparison`, `type BidAskClassification`, `interface BidAskClassificationResult`, `function classifyBidAskSpread`, `interface IvSensitivityResult` *(+1 more)*
- **Inbound Dependencies**: `web/scripts/research-audit-experiments.ts`, `web/src/lib/research/auditExperiments.test.ts`, `web/src/lib/research/optionsAuditResearch.ts`
- **Outbound Dependencies**: `web/src/lib/optionsAudit.ts`, `web/src/lib/services/mock.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/research/auditExperiments.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/research/candidateStatus.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/research/candidateStatus.ts)

- **Relative Path**: `web/src/lib/research/candidateStatus.ts`
- **File Type**: `.ts` (58 lines, 2,217 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: Every opportunity card is a research candidate. This helper states why none is an executable trade.
- **Main Exports / Entry Points**: `const RESEARCH_BANNER`, `type CandidateKind`, `function candidateStatus`
- **Inbound Dependencies**: `web/src/app/opportunities/page.tsx`, `web/src/lib/productionReadinessAudit.test.ts`, `web/src/lib/research/candidateStatus.test.ts`, `web/src/lib/runtimeTrust.test.ts`
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/productionReadinessAudit.test.ts`, `web/src/lib/research/candidateStatus.test.ts`, `web/src/lib/runtimeTrust.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/research/frozenResults.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/research/frozenResults.ts)

- **Relative Path**: `web/src/lib/research/frozenResults.ts`
- **File Type**: `.ts` (37 lines, 2,626 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: Read-only summaries of frozen research artifacts. Never recomputes or rewrites them.
- **Main Exports / Entry Points**: `interface GroupLike`, `interface ReplayPeriod`, `const intradayReplay`, `const positionalV1`, `const positionalV2Dev`
- **Inbound Dependencies**: `web/src/app/strategy-performance/page.tsx`
- **Outbound Dependencies**: `node:fs`, `node:path`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/research/optionsAuditResearch.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/research/optionsAuditResearch.ts)

- **Relative Path**: `web/src/lib/research/optionsAuditResearch.ts`
- **File Type**: `.ts` (483 lines, 21,117 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: Phase 6: Multi-Session Next-Weekly Validation Experiment
- **Main Exports / Entry Points**: `const RESEARCH_AUDIT_VERSION`, `const RESEARCH_DTE_BASIS`, `const RESEARCH_MIN_DTE`, `const RESEARCH_MAX_DTE`, `const TARGET_LABEL`, `const FALLBACK_LABEL`, `const RESEARCH_SLOT_MIN`, `type ResearchHorizon` *(+17 more)*
- **Inbound Dependencies**: `web/scripts/options-audit-research.ts`, `web/src/lib/productionReadinessAudit.test.ts`, `web/src/lib/research/optionsAuditResearch.test.ts`, `web/src/lib/research/optionsAuditResearchPhase8.test.ts`
- **Outbound Dependencies**: `web/src/lib/engine/opportunityEngine.ts`, `web/src/lib/optionsAudit.ts`, `web/src/lib/research/auditExperiments.ts`, `web/src/lib/types.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/productionReadinessAudit.test.ts`, `web/src/lib/research/optionsAuditResearch.test.ts`, `web/src/lib/research/optionsAuditResearchPhase8.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/research/optionsInventory.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/research/optionsInventory.ts)

- **Relative Path**: `web/src/lib/research/optionsInventory.ts`
- **File Type**: `.ts` (68 lines, 4,998 bytes)
- **Category**: Research and Data Collection Scripts
- **Purpose & Responsibility**: Historical Options Research Lab — data inventory and experiment readiness. Pure: no I/O.
- **Main Exports / Entry Points**: `const INVENTORY_VERSION`, `type DataClass`, `interface ContractProbe`, `interface Inventory`, `interface Experiment`, `const MIN_COMPLETED_EXPIRIES`, `function experimentReadiness`, `function classifyLocalDataset`
- **Inbound Dependencies**: `web/scripts/options-research-inventory.ts`, `web/src/app/options-research/page.tsx`, `web/src/lib/research/inventoryStore.ts`, `web/src/lib/research/optionsInventory.test.ts`
- **Outbound Dependencies**: *None*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/research/optionsInventory.test.ts`
- **Known Issues & Safety Implications**: Standard application component.
- **Recommended Action**: **`KEEP`**

---
