# Inventory: Tests and Test Fixtures

**Category**: `09-tests-and-fixtures`  
**File Count**: 64 files  
**Description**: Automated test suites covering unit math, integration workflows, paper trading hardening, and regressions

---

### [`web/src/lib/calendar.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/calendar.test.ts)

- **Relative Path**: `web/src/lib/calendar.test.ts`
- **File Type**: `.ts` (80 lines, 4,365 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Run: npm test   (explicit historical timestamps only; no wall-clock time)
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/services/historicalCandles.ts`, `web/src/lib/services/mock.ts`, `web/src/lib/time.ts` *(+1 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/contractIntegrity.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/contractIntegrity.test.ts)

- **Relative Path**: `web/src/lib/contractIntegrity.test.ts`
- **File Type**: `.ts` (420 lines, 17,381 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 11.2 — Contract integrity, identity preservation, slippage, stop/target, position sizing.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/engine/strategy.ts`, `web/src/lib/recommendationEnricher.ts`, `web/src/lib/services/mock.ts` *(+2 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/dashboard.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/dashboard.test.ts)

- **Relative Path**: `web/src/lib/dashboard.test.ts`
- **File Type**: `.ts` (186 lines, 11,116 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Run: npm test   (frontend contract: adapter, section loading, backtest views — no browser needed)
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/backtestEngine.ts`, `web/src/lib/dashboard.ts`, `web/src/lib/engine/strategy.ts` *(+7 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/engine/engine.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/engine/engine.test.ts)

- **Relative Path**: `web/src/lib/engine/engine.test.ts`
- **File Type**: `.ts` (92 lines, 3,984 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Run: npm test
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/engine/analysis.ts`, `web/src/lib/engine/strategy.ts`, `web/src/lib/services/mock.ts` *(+1 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/engine/intradayConfidence.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/engine/intradayConfidence.test.ts)

- **Relative Path**: `web/src/lib/engine/intradayConfidence.test.ts`
- **File Type**: `.ts` (16 lines, 929 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/engine/stockOpportunityEngine.ts`, `web/src/lib/services/stockService.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/engine/intradayReplay.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/engine/intradayReplay.test.ts)

- **Relative Path**: `web/src/lib/engine/intradayReplay.test.ts`
- **File Type**: `.ts` (100 lines, 5,922 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: A stock whose price follows f(minuteIndex); bars span ±0.1% around close.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/engine/intradayReplay.ts`, `web/src/lib/types.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/engine/positionalBacktest.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/engine/positionalBacktest.test.ts)

- **Relative Path**: `web/src/lib/engine/positionalBacktest.test.ts`
- **File Type**: `.ts` (76 lines, 3,914 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/engine/positionalBacktest.ts`, `web/src/lib/types.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/engine/positionalTrend.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/engine/positionalTrend.test.ts)

- **Relative Path**: `web/src/lib/engine/positionalTrend.test.ts`
- **File Type**: `.ts` (69 lines, 3,285 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Weekday-only daily series ending on NOW's date; close follows f(i).
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/engine/positionalTrend.ts`, `web/src/lib/types.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/engine/positionalV2.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/engine/positionalV2.test.ts)

- **Relative Path**: `web/src/lib/engine/positionalV2.test.ts`
- **File Type**: `.ts` (95 lines, 4,745 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/engine/positionalBacktest.ts`, `web/src/lib/engine/positionalV2.ts`, `web/src/lib/types.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/evaluation.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/evaluation.test.ts)

- **Relative Path**: `web/src/lib/evaluation.test.ts`
- **File Type**: `.ts` (572 lines, 21,903 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 11.5 — Statistical evaluation tests E1–E45.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:fs`, `node:path`, `node:test`, `web/src/lib/evaluationEngine.ts` *(+3 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/historicalOptionData.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/historicalOptionData.test.ts)

- **Relative Path**: `web/src/lib/historicalOptionData.test.ts`
- **File Type**: `.ts` (509 lines, 24,334 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 11.6 — Historical option data fidelity tests D1–D40.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:fs`, `node:path`, `node:test`, `web/src/lib/backtestSnapshot.ts` *(+4 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/historicalOptions.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/historicalOptions.test.ts)

- **Relative Path**: `web/src/lib/historicalOptions.test.ts`
- **File Type**: `.ts` (430 lines, 16,765 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 12 — Real Historical Options Data Acquisition & Fidelity Upgrade
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert`, `node:test`, `web/src/lib/adapters/upstoxHistoricalOptionsAdapter.ts`, `web/src/lib/historicalOptionsDataset.ts`, `web/src/lib/historicalOptionsProvider.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/intradayEvaluation.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/intradayEvaluation.test.ts)

- **Relative Path**: `web/src/lib/intradayEvaluation.test.ts`
- **File Type**: `.ts` (54 lines, 2,983 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: qty 100; fills 1000.50 / 1009.495 → ₹899.50; charges buy ≈ ₹30.23, sell ≈ ₹52.51; risk ₹1,000
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/intradayEvaluation.ts`, `web/src/lib/services/paperOpportunityStore.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/journal.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/journal.test.ts)

- **Relative Path**: `web/src/lib/journal.test.ts`
- **File Type**: `.ts` (740 lines, 32,801 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 11.3 / 11.3.2 / 11.4 — Recommendation Journal tests.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:fs`, `node:path`, `node:test`, `web/src/lib/engine/strategy.ts` *(+6 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/ops/ops.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/ops/ops.test.ts)

- **Relative Path**: `web/src/lib/ops/ops.test.ts`
- **File Type**: `.ts` (130 lines, 7,638 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:fs`, `node:os`, `node:path`, `node:test` *(+3 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/optionsAudit.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/optionsAudit.test.ts)

- **Relative Path**: `web/src/lib/optionsAudit.test.ts`
- **File Type**: `.ts` (201 lines, 11,733 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/optionsAudit.ts`, `web/src/lib/services/mock.ts`, `web/src/lib/types.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/optionsDataQualityDiagnostic.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/optionsDataQualityDiagnostic.test.ts)

- **Relative Path**: `web/src/lib/optionsDataQualityDiagnostic.test.ts`
- **File Type**: `.ts` (184 lines, 5,908 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Stale cases
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:fs`, `node:os`, `node:path`, `node:test` *(+1 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/paperIntegrity.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/paperIntegrity.test.ts)

- **Relative Path**: `web/src/lib/paperIntegrity.test.ts`
- **File Type**: `.ts` (117 lines, 6,320 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Regression tests: paper-trade accounting must be immutable, single-close and arithmetically correct.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:fs`, `node:path`, `node:test`, `web/src/lib/services/liveOpportunityCollector.ts` *(+3 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/paperTradingHardening.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/paperTradingHardening.test.ts)

- **Relative Path**: `web/src/lib/paperTradingHardening.test.ts`
- **File Type**: `.ts` (567 lines, 31,087 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Paper-trading hardening regression suite.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:fs`, `node:path`, `node:test`, `web/src/lib/engine/strategy.ts` *(+12 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/phase13.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/phase13.test.ts)

- **Relative Path**: `web/src/lib/phase13.test.ts`
- **File Type**: `.ts` (446 lines, 25,240 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 13 — long-term data + recommendation diagnostics.
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:fs`, `node:os`, `node:path`, `node:test` *(+7 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/phase14.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/phase14.test.ts)

- **Relative Path**: `web/src/lib/phase14.test.ts`
- **File Type**: `.ts` (375 lines, 23,737 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 14 — one-command Upstox login + live recommendation flow.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:fs`, `node:os`, `node:path`, `node:test` *(+11 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/phase15.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/phase15.test.ts)

- **Relative Path**: `web/src/lib/phase15.test.ts`
- **File Type**: `.ts` (434 lines, 20,745 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 15 — Live Recommendation Evidence Collection & Production Validation
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:fs`, `node:os`, `node:path`, `node:test` *(+4 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/phase16.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/phase16.test.ts)

- **Relative Path**: `web/src/lib/phase16.test.ts`
- **File Type**: `.ts` (366 lines, 16,722 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 16 — Genuine Live Evidence Collection & Paper-Trade Validation Tests
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:fs`, `node:os`, `node:path`, `node:test` *(+4 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/phase18.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/phase18.test.ts)

- **Relative Path**: `web/src/lib/phase18.test.ts`
- **File Type**: `.ts` (295 lines, 12,747 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 18 — Evidence Semantics Correction
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/engine/strategy.ts`, `web/src/lib/journalTypes.ts`, `web/src/lib/strategyEvidenceEngine.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/phase19.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/phase19.test.ts)

- **Relative Path**: `web/src/lib/phase19.test.ts`
- **File Type**: `.ts` (386 lines, 21,150 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 19 — Opportunity Engine tests.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/engine/opportunityEngine.ts`, `web/src/lib/engine/stockOpportunityEngine.ts`, `web/src/lib/testFixtures/stockScan.ts` *(+1 more)*
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/phase20.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/phase20.test.ts)

- **Relative Path**: `web/src/lib/phase20.test.ts`
- **File Type**: `.ts` (453 lines, 23,411 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 20 — Opportunity Engine v20.0 tests.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/engine/longTermEngine.ts`, `web/src/lib/engine/opportunityEngine.ts`, `web/src/lib/engine/stockOpportunityEngine.ts` *(+2 more)*
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/phase21.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/phase21.test.ts)

- **Relative Path**: `web/src/lib/phase21.test.ts`
- **File Type**: `.ts` (131 lines, 6,967 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 21 — Regression tests for confirmed bugs found during live validation.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/engine/opportunityEngine.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/phase22.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/phase22.test.ts)

- **Relative Path**: `web/src/lib/phase22.test.ts`
- **File Type**: `.ts` (441 lines, 22,011 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 22 — Trade plan realism, grading, outcome tracking tests.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:fs`, `node:os`, `node:path`, `node:test` *(+4 more)*
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/phase23.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/phase23.test.ts)

- **Relative Path**: `web/src/lib/phase23.test.ts`
- **File Type**: `.ts` (655 lines, 25,197 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 23 — Paper opportunity lifecycle tests
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:fs`, `node:os`, `node:path`, `node:test` *(+2 more)*
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/phase24.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/phase24.test.ts)

- **Relative Path**: `web/src/lib/phase24.test.ts`
- **File Type**: `.ts` (703 lines, 27,902 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 24 — Live collection & monitoring tests
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:fs`, `node:os`, `node:path`, `node:test` *(+7 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/phase25.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/phase25.test.ts)

- **Relative Path**: `web/src/lib/phase25.test.ts`
- **File Type**: `.ts` (277 lines, 11,871 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 25 — Multi-Session Live Paper Trading & Performance Evidence Unit Tests.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:fs`, `node:path`, `node:test`, `web/src/lib/engine/opportunityEngine.ts` *(+5 more)*
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/phase27.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/phase27.test.ts)

- **Relative Path**: `web/src/lib/phase27.test.ts`
- **File Type**: `.ts` (200 lines, 10,085 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 27 — Live Market Readiness, End-to-End Validation & Paper Trading Launch Tests.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:fs`, `node:path`, `node:test`, `web/src/lib/engine/opportunityEngine.ts` *(+7 more)*
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/phase28.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/phase28.test.ts)

- **Relative Path**: `web/src/lib/phase28.test.ts`
- **File Type**: `.ts` (198 lines, 10,096 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 28 — Genuine Live Market Observation & Operational Verification Tests.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:fs`, `node:path`, `node:test`, `web/src/lib/engine/opportunityEngine.ts` *(+7 more)*
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/phase29.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/phase29.test.ts)

- **Relative Path**: `web/src/lib/phase29.test.ts`
- **File Type**: `.ts` (166 lines, 7,974 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 29 — Fix recommendation pipeline & stock recommendations
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:fs`, `node:path`, `node:test`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/phase30.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/phase30.test.ts)

- **Relative Path**: `web/src/lib/phase30.test.ts`
- **File Type**: `.ts` (234 lines, 10,703 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 30 — Live-market validation & data freshness audit
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/engine/opportunityEngine.ts`, `web/src/lib/time.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/phase30_1.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/phase30_1.test.ts)

- **Relative Path**: `web/src/lib/phase30_1.test.ts`
- **File Type**: `.ts` (213 lines, 9,725 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 30.1 — Close the data-freshness gap (missing last_trade_time)
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/engine/opportunityEngine.ts`, `web/src/lib/services/stockService.ts`, `web/src/lib/services/upstoxMarket.ts` *(+1 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/phase30_4.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/phase30_4.test.ts)

- **Relative Path**: `web/src/lib/phase30_4.test.ts`
- **File Type**: `.ts` (475 lines, 21,464 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 30.4 — Prototype option-contract LTT association tests.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/engine/opportunityEngine.ts`, `web/src/lib/services/optionContractLTT.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/productionReadinessAudit.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/productionReadinessAudit.test.ts)

- **Relative Path**: `web/src/lib/productionReadinessAudit.test.ts`
- **File Type**: `.ts` (410 lines, 17,197 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:fs`, `node:test`, `web/src/lib/dataStatus.ts`, `web/src/lib/engine/opportunityEngine.ts` *(+9 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/recommendation.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/recommendation.test.ts)

- **Relative Path**: `web/src/lib/recommendation.test.ts`
- **File Type**: `.ts` (363 lines, 15,547 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Run: npm test
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/engine/strategy.ts`, `web/src/lib/recommendationEnricher.ts`, `web/src/lib/services/mock.ts` *(+1 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/research/auditExperiments.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/research/auditExperiments.test.ts)

- **Relative Path**: `web/src/lib/research/auditExperiments.test.ts`
- **File Type**: `.ts` (86 lines, 3,501 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/research/auditExperiments.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/research/candidateStatus.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/research/candidateStatus.test.ts)

- **Relative Path**: `web/src/lib/research/candidateStatus.test.ts`
- **File Type**: `.ts` (18 lines, 1,041 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/research/candidateStatus.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/research/optionsAuditResearch.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/research/optionsAuditResearch.test.ts)

- **Relative Path**: `web/src/lib/research/optionsAuditResearch.test.ts`
- **File Type**: `.ts` (360 lines, 11,906 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/optionsAudit.ts`, `web/src/lib/research/optionsAuditResearch.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/research/optionsAuditResearchPhase8.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/research/optionsAuditResearchPhase8.test.ts)

- **Relative Path**: `web/src/lib/research/optionsAuditResearchPhase8.test.ts`
- **File Type**: `.ts` (168 lines, 10,463 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 8: expiry-boundary semantics, report reproducibility and production isolation for options-audit-2-research.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:fs`, `node:os`, `node:path`, `node:test` *(+5 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/research/optionsInventory.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/research/optionsInventory.test.ts)

- **Relative Path**: `web/src/lib/research/optionsInventory.test.ts`
- **File Type**: `.ts` (36 lines, 2,391 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/research/optionsInventory.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/research/researchRunner.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/research/researchRunner.test.ts)

- **Relative Path**: `web/src/lib/research/researchRunner.test.ts`
- **File Type**: `.ts` (107 lines, 5,370 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: End-to-end checks of scripts/options-audit-research.ts `round` failure paths. Runs the real script in a temp cwd
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:child_process`, `node:fs`, `node:os`, `node:path` *(+2 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/runnerLib.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/runnerLib.test.ts)

- **Relative Path**: `web/src/lib/runnerLib.test.ts`
- **File Type**: `.ts` (64 lines, 3,943 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/scripts/runner-lib.mjs`, `web/src/lib/services/liveOpportunityCollector.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/runtimeTrust.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/runtimeTrust.test.ts)

- **Relative Path**: `web/src/lib/runtimeTrust.test.ts`
- **File Type**: `.ts` (123 lines, 7,381 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 11 (2026-10-28): regressions for defects found by inspecting the running app.
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:fs`, `node:path`, `node:test`, `web/src/lib/dataStatus.ts` *(+8 more)*
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/scoreText.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/scoreText.test.ts)

- **Relative Path**: `web/src/lib/scoreText.test.ts`
- **File Type**: `.ts` (18 lines, 1,143 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/scoreText.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/backtest.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/backtest.test.ts)

- **Relative Path**: `web/src/lib/services/backtest.test.ts`
- **File Type**: `.ts` (125 lines, 5,060 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/backtestEngine.ts`, `web/src/lib/backtestSnapshot.ts`, `web/src/lib/backtestTypes.ts` *(+1 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/breadth.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/breadth.test.ts)

- **Relative Path**: `web/src/lib/services/breadth.test.ts`
- **File Type**: `.ts` (216 lines, 9,535 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/engine/strategy.ts`, `web/src/lib/services/breadthService.ts`, `web/src/lib/services/mock.ts` *(+2 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/futures.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/futures.test.ts)

- **Relative Path**: `web/src/lib/services/futures.test.ts`
- **File Type**: `.ts` (244 lines, 14,054 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Run: npm test   (deterministic fixtures; no Upstox account needed)
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `node:zlib`, `web/src/lib/engine/strategy.ts`, `web/src/lib/services/candles.ts` *(+5 more)*
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/marketData.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/marketData.test.ts)

- **Relative Path**: `web/src/lib/services/marketData.test.ts`
- **File Type**: `.ts` (357 lines, 16,513 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Run: npm test   (no Upstox account needed: fetch is stubbed with documented Upstox response shapes)
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/engine/strategy.ts`, `web/src/lib/services/errors.ts`, `web/src/lib/services/market.ts` *(+5 more)*
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/news.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/news.test.ts)

- **Relative Path**: `web/src/lib/services/news.test.ts`
- **File Type**: `.ts` (291 lines, 15,635 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Run: npm test   (deterministic fixtures; no news-provider account needed)
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/dataStatus.ts`, `web/src/lib/engine/strategy.ts`, `web/src/lib/services/cache.ts` *(+5 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/paperTrading.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/paperTrading.test.ts)

- **Relative Path**: `web/src/lib/services/paperTrading.test.ts`
- **File Type**: `.ts` (232 lines, 10,774 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/engine/strategy.ts`, `web/src/lib/paperEngine.ts`, `web/src/lib/services/mock.ts` *(+1 more)*
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/performance.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/performance.test.ts)

- **Relative Path**: `web/src/lib/services/performance.test.ts`
- **File Type**: `.ts` (343 lines, 19,838 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Run: npm test   (deterministic fixtures; expected values computed by hand in comments)
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/backtestEngine.ts`, `web/src/lib/backtestTypes.ts`, `web/src/lib/paperEngine.ts` *(+4 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/phase10.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/phase10.test.ts)

- **Relative Path**: `web/src/lib/services/phase10.test.ts`
- **File Type**: `.ts` (483 lines, 31,191 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Run: npm test   (deterministic fixtures; no Upstox account needed)
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/backtestEngine.ts`, `web/src/lib/backtestSnapshot.ts`, `web/src/lib/backtestTypes.ts` *(+10 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/phase9.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/phase9.test.ts)

- **Relative Path**: `web/src/lib/services/phase9.test.ts`
- **File Type**: `.ts` (338 lines, 20,369 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Run: npm test   (deterministic fixtures; no Upstox account needed)
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/backtestEngine.ts`, `web/src/lib/backtestExecution.ts`, `web/src/lib/backtestSnapshot.ts` *(+8 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/risk.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/risk.test.ts)

- **Relative Path**: `web/src/lib/services/risk.test.ts`
- **File Type**: `.ts` (306 lines, 13,468 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/engine/strategy.ts`, `web/src/lib/services/mock.ts`, `web/src/lib/services/risk/riskConfig.ts` *(+2 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/rss.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/rss.test.ts)

- **Relative Path**: `web/src/lib/services/rss.test.ts`
- **File Type**: `.ts` (235 lines, 13,586 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Run: npm test   (deterministic fixtures; real feeds are validated live, not here)
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/engine/strategy.ts`, `web/src/lib/services/cache.ts`, `web/src/lib/services/mock.ts` *(+4 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/technical.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/technical.test.ts)

- **Relative Path**: `web/src/lib/services/technical.test.ts`
- **File Type**: `.ts` (301 lines, 16,178 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Run: npm test   (deterministic fixtures; no Upstox account needed)
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/engine/strategy.ts`, `web/src/lib/services/candles.ts`, `web/src/lib/services/errors.ts` *(+6 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/services/upstoxAuth.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/services/upstoxAuth.test.ts)

- **Relative Path**: `web/src/lib/services/upstoxAuth.test.ts`
- **File Type**: `.ts` (47 lines, 2,373 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Run: npm test
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/services/upstoxAuth.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/strategyEvidence.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/strategyEvidence.test.ts)

- **Relative Path**: `web/src/lib/strategyEvidence.test.ts`
- **File Type**: `.ts` (476 lines, 18,143 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Phase 11.8 — Final Strategy Evidence & Go/No-Go Assessment Tests
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert`, `node:test`, `web/src/lib/backtestTypes.ts`, `web/src/lib/journalTypes.ts`, `web/src/lib/strategyEvidenceEngine.ts` *(+1 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/testFixtures/stockScan.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/testFixtures/stockScan.ts)

- **Relative Path**: `web/src/lib/testFixtures/stockScan.ts`
- **File Type**: `.ts` (51 lines, 2,724 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Deterministic scanner inputs for tests: no network, no clock dependence beyond the `now` passed in.
- **Main Exports / Entry Points**: `function fixtureQuotes`, `function fixtureDaily`, `const FIXTURE_DEPS`, `const FIXTURE_NOW`
- **Inbound Dependencies**: `web/src/lib/phase19.test.ts`, `web/src/lib/phase20.test.ts`, `web/src/lib/phase22.test.ts`
- **Outbound Dependencies**: `web/src/lib/engine/stockOpportunityEngine.ts`, `web/src/lib/services/stockService.ts`, `web/src/lib/types.ts`
- **Git Status**: Untracked
- **Existing Tests & Coverage**: Direct coverage in `web/src/lib/phase19.test.ts`, `web/src/lib/phase20.test.ts`, `web/src/lib/phase22.test.ts`
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/lib/walkForwardEngine.test.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/lib/walkForwardEngine.test.ts)

- **Relative Path**: `web/src/lib/walkForwardEngine.test.ts`
- **File Type**: `.ts` (277 lines, 11,258 bytes)
- **Category**: Tests and Test Fixtures
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: *(None / Default entry point)*
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `node:assert/strict`, `node:test`, `web/src/lib/backtestTypes.ts`, `web/src/lib/types.ts`, `web/src/lib/walkForwardEngine.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Automated test file itself
- **Known Issues & Safety Implications**: Protects regression safety, invariant adherence, and simulation integrity.
- **Recommended Action**: **`KEEP`**

---
