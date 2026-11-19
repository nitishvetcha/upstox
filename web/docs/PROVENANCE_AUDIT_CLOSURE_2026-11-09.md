# Provenance audit closure (2026-11-09)

Written for: the project owner and maintainers.
Status: **documentation only.** No application source, test, configuration, strategy, data, journal or saved-pick file was changed by this report. The historical documents it references (`PROVENANCE_AUDIT_FINAL_2026-11-09.md` and `F1_STALE_MARKET_CLOSURE_REVIEW_2026-11-09.md`) are not overwritten. Where they disagree with this report, this report is the later record.

**Overall decision: live recommendation engine NO-GO.** Closing the provenance findings below does not establish strategy profitability, validation or live readiness. No candidate strategy is VERIFIED, and recent data does not prove historical profitability.

---

## 1. Status table

| ID | Finding (from the audit) | Correction in this closure | Verification | Remaining limitation | Status |
|---|---|---|---|---|---|
| **F1** | A STALE market quote could pass the strategy and risk gates when its `fetchedAt` was recent. | None to the finding. | Enricher `STALE_MARKET` blocker and risk-service `STALE_PRICE` check added. 9 fixture tests (`staleMarketGate.test.ts`). Closure review classified every production path (`F1_STALE_MARKET_CLOSURE_REVIEW_2026-11-09.md`): no confirmed bypass. Full suite passed at the time. | (a) The raw analysis endpoint (`/api/analysis/[index]`) and dashboard show the engine's output without the enricher blocker; they depend on the risk service staying in place. (b) No test covers the raw endpoint or dashboard rendering for a STALE market. (c) The engine's own `staleness()` still does not name the STALE market label; the guard is in the enricher because `strategy.ts` is frozen. | **Closed**, with the limitations listed |
| **F2** | END_OF_DAY was displayed as STALE outside market hours. | **Corrected example.** The audit cited the Overview's `market: STALE` text as an END_OF_DAY case. That reading was wrong. The Overview shows the raw source label, and at that time the quote came from an earlier session, where STALE is the correct label. The actual defect was in `sourceMeta` (`src/lib/services/market.ts`), which mapped an END_OF_DAY source to a STALE freshness for the analysis badge and the technical status. | `sourceMeta` now keeps END_OF_DAY. Display label "END OF DAY" added. `provenanceLabels.test.ts` (11 fixture tests). Two existing assertions that encoded the old mapping were updated and their never-LIVE-or-AGING rule kept. Full suite passed. | (a) **UI changes were not browser-verified.** The display components were checked by typecheck, build and tests only. (b) Component rendering has no direct test; the label mapping and `sourceMeta` do. (c) Gates were not changed, but END_OF_DAY-as-executable is blocked by the existing risk and recommendation rules, not by the label. | **Closed**, with the browser limitation stated |
| **F3** | Journal records kept the fetch time but not the exchange last-trade time. | None to the finding. | `marketLastTradeTime` and `optionChainLastTradeTime` added to the recommendation response; fetch-time fields keep their meaning. `recommendationTimestamps.test.ts` (6 fixture tests), including a store round trip and an old-record read. Existing journal files confirmed byte-identical. | (a) `optionChainLastTradeTime` is the **newest** contract trade time in the chain. It is not the oldest, and it is not a per-contract freshness guarantee: an old contract inside a fresh chain is not flagged by this field. (b) Existing journal records do not have the new fields and show them as absent. (c) Only new entries carry both timestamps. | **Closed**, with the chain limitation stated |
| **F4** | Refresh does not check the market quote label. | None. | Refresh price comes from a LIVE, per-contract-verified option chain (`journalRefreshService.ts`; tests RS-1 to RS-15). | Recorded as a design decision, not a defect. | **Accepted** (no change) |
| **F5** | Stored research rows showed a green "RECOMMENDATION" badge. | None to the finding. | Helper `storedResearchRowBadge` (`src/lib/options/storedResearchBadge.ts`). Stored RECOMMENDATION shows "STORED RESEARCH: RECOMMENDATION · NOT LIVE" in amber; NO TRADE unchanged. `storedResearchBadge.test.ts` (6 fixture tests). Browser check: header "STORED RESEARCH · NOT LIVE" visible, rows NO TRADE, no console errors. | (a) **The RECOMMENDATION branch was unit-tested but not observed in the browser**, because every current stored row is NO TRADE. (b) The helper is used on the Options Engine page only; other pages were checked and had no equivalent stored-research badge. | **Closed**, with the browser limitation stated |
| **F6** | Fallback data cannot inherit a LIVE label. | None. | Audit reading of `withFallback`, `hasMockInput` and `aggregateRequiredSource`. | Static reading only. | Confirmed safe by reading (no change) |
| **F7** | The frontend MOCK label was not checked in live mode. | None. | Not performed. | Open. | **Unverified** |

---

## 2. Closure detail

### F1 — closed
- **Fix:** `src/lib/recommendationEnricher.ts` sets `NO_TRADE` and adds a `STALE_MARKET` blocker when the market source is STALE. `src/lib/services/risk/riskService.ts` treats a STALE market source as `STALE_PRICE` regardless of `fetchedAt`. `strategy.ts` (frozen Strategy 11.4) was not modified. One early attempt edited `strategy.ts`; the frozen-hash test caught it and the edit was reverted, after which the hash matched again.
- **Evidence:** `staleMarketGate.test.ts` (SM-1 to SM-5, RG-1 to RG-4); closure review sections 3 and 4.
- **Remaining limitations:**
  1. The raw analysis endpoint and the dashboard depend on the risk service (review R1). This is a dependency, not a bypass.
  2. No test covers the raw analysis JSON or dashboard rendering for a STALE market (review R3).
  3. The engine's internal `staleness()` does not name the STALE market label (review section 3.4).

### F2 — closed, with corrected wording
- **Corrected finding:** `sourceMeta` (`src/lib/services/market.ts`) mapped an END_OF_DAY source to a STALE freshness. This reached the analysis badge ("DATA …"), the technical status and the execution note.
- **Not the cause:** the Overview's `market: STALE` text. That text comes from the raw source label in `OpsPanel`. The quote behind it was from an earlier session, so STALE was correct.
- **Fix:** END_OF_DAY keeps its freshness and is displayed as "END OF DAY" (`src/lib/freshnessLabel.ts`), in `AnalysisPanels.tsx`, `DataTimestamps.tsx` and `OpsPanel.tsx`. Each subsystem now also shows its exchange last-trade time when one exists, and the fetch time is labelled as "fetched". Other labels, including MOCK, UNAVAILABLE and null, are displayed as before.
- **Evidence:** `provenanceLabels.test.ts` (FL-1 to FL-6, FD-1, FD-2, FG-1 to FG-3). Two existing tests (`runtimeTrust.test.ts`, `freshnessConsistency.test.ts`) asserted the old mapping; their assertions were updated to the new label while keeping the rule that a non-LIVE source is never shown as LIVE or AGING.
- **Remaining limitations:** UI changes were **not browser-verified**. Component rendering has no direct test.

### F3 — closed, with the chain limitation
- **Fix:** `src/lib/recommendationEnricher.ts` adds two optional fields, `marketLastTradeTime` and `optionChainLastTradeTime`, copied from the source. A missing value is stored as null and is never replaced by the fetch time. `marketSnapshotTimestamp` and `optionChainTimestamp` keep their fetch-time meaning.
- **Evidence:** `recommendationTimestamps.test.ts` (TS-1 to TS-6). Existing journal and saved-picks files confirmed byte-identical after the change.
- **Remaining limitations:**
  1. `optionChainLastTradeTime` is the **newest** trade time among the chain's contracts. It is not the oldest, and it is not a freshness guarantee per contract.
  2. Existing journal records do not carry the new fields. They are read as absent, not reconstructed.

### F5 — closed, with the browser limitation
- **Fix:** the stored-row badge is produced by `storedResearchRowBadge` (`src/lib/options/storedResearchBadge.ts`), used in `options-engine/page.tsx`. The decision, score and status are unchanged.
- **Evidence:** `storedResearchBadge.test.ts` (SR-1 to SR-6). Browser: the page header and all six rows were checked; no console errors.
- **Remaining limitation:** the RECOMMENDATION branch was **not observed in the browser**, because every current stored row is NO TRADE. It is covered by the unit test only.

---

## 3. Unresolved risks (carried forward, unchanged)

| Ref | Risk | Status |
|---|---|---|
| U1 | The chain's LIVE label relies on `verifyEvaluationOptionPrices`, which was not re-tested in the audit. | Unverified |
| U2 | Freshness thresholds (120 s market and chain; AGING from 30 s) are fixed constants, not tied to market hours. | Open |
| U3 | The chain's last-trade time is the newest contract's (see F3). An old contract inside a fresh chain is not flagged. | Open |
| R1 | The raw analysis path depends on the risk service's STALE rejection. | Dependency |
| R2 | The raw analysis output does not name the STALE market reason. | Open |
| R3 | No test covers the raw analysis endpoint or dashboard for a STALE market. | Open |
| R5 | Backtest outputs were not traced to any live surface. | Unverified |
| R6 | The diagnostic gate list does not name the market STALE state. | Open |
| F7 | Frontend MOCK labels in live mode were not checked. | Unverified |
| BSE | SENSEX/BANKEX quote-key format is unverified. Resolution needs owner approval for one controlled live diagnostic request. No request was made and no key was guessed. | Blocked |
| SRC | Strategy source full-text reads were not possible with the available tools. Classifications are unchanged; no candidate is VERIFIED. | Blocked |

---

## 4. Verification of this closure

- This document was written without modifying application source, tests, configuration, data, journal files or saved-picks files.
- The existing journal and saved-picks files were checked by SHA-256 against the pre-change snapshot: **byte-identical (27 files).**
- The test, build and lint results recorded in each closure section are from the implementation steps, not from this documentation step. No new test or build was run here.

---

## 5. Files

**Created:** `web/docs/PROVENANCE_AUDIT_CLOSURE_2026-11-09.md` (this file).

**Modified:** none.

**Historical documents kept unchanged:** `web/docs/PROVENANCE_AUDIT_FINAL_2026-11-09.md`, `web/docs/F1_STALE_MARKET_CLOSURE_REVIEW_2026-11-09.md`. Note that the audit's F2 example is superseded by section 2 of this report.

---

## 6. Overall decision

- **Live recommendation engine: NO-GO.**
- Closed findings reduce specific provenance risks (stale market quotes, end-of-day display, timestamp loss, misleading stored-research badge). They do not validate any strategy, do not establish profitability, and do not make the engine ready for live recommendations.
