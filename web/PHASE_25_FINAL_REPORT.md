# PHASE 25 — MULTI-SESSION LIVE PAPER TRADING & PERFORMANCE EVIDENCE REPORT

## Executive Summary

- **Phase Status**: `PASS WITH LIMITATIONS`
- **Engine Version**: 20.1 (Unchanged)
- **Frozen Strategy Version**: 11.4-frozen (Unchanged)
- **Market Status at Audit**: `CLOSED` (Current local time: 16:56 IST, NSE market closed at 15:30 IST)
- **Upstox Auth Status**: `NOT_CONNECTED` (Requires user login via `npm run upstox:login`)
- **Safety Guarantee**: 0 Real Order Endpoints, 0 Order Executions, 0 Strategy Modifications

---

## 1. Engineering & Verification Summary

### Test Suite & Verification Results
- **Dedicated Phase 25 Tests**: `web/src/lib/phase25.test.ts` (8 / 8 tests passed)
- **Complete Test Suite**: 1,176 / 1,176 tests passed cleanly (`npm test`)
- **TypeScript Verification**: Clean compilation (`npm run typecheck` / `tsc --noEmit`)
- **Production Build**: Successful Next.js Turbopack build (`npx next build`)

### Files Created & Modified
1. `web/src/lib/services/sessionEvidenceStore.ts` (**NEW**): Multi-session persistence store tracking per-IST date (`YYYY-MM-DD`) evidence records, deduplicating same-day reruns and building multi-session analytics.
2. `web/src/lib/phase25.test.ts` (**NEW**): Unit test suite covering session persistence, session-date uniqueness, same-day rerun deduplication, source validation, terminal state immutability, zero-trade analytics, realized R/Profit Factor calculations, order safety.
3. `web/src/app/api/paper-opportunities/sessions/route.ts` (**NEW**): API endpoint surfacing multi-session evidence summary and audit records.
4. `web/src/lib/services/paperOpportunityStore.ts`: Updated file storage paths to dynamic getters (`getDir()`) to support isolated test runs.
5. `web/src/lib/services/liveOpportunityCollector.ts`: Integrated session evidence logging into `runLiveOpportunityCollection()`.
6. `web/src/lib/services/paperTradeMonitorRunner.ts`: Integrated session evidence logging into `runOnce()`.
7. `web/src/app/api/paper-opportunities/monitor/route.ts`: Fixed Option Chain price indexing bug by caching full chain contract premiums from `snap.chain`.
8. `web/src/app/opportunity-journal/page.tsx`: Redesigned dashboard to display Market Status, Upstox Auth Status, Multi-Session Evidence Card, Open & Completed Trades, and Market Session Audit Log.
9. `web/src/lib/journal.test.ts`: Fixed fixture time parameter bug in `computeOutcome` tests.

### Confirmed Bugs Fixed
1. **Monitor Option Chain Lookup Deficiency**: Previously, `/api/paper-opportunities/monitor` only mapped top 3 accepted opportunities from `evaluateOptionsOpportunity`. If an open paper trade contract fell outside top 3 on subsequent cycles, its price was lost as `null`. Fixed by indexing all call/put contract keys across `snap.chain`.
2. **Static Store Directory Caching**: `paperOpportunityStore.ts` and `sessionEvidenceStore.ts` statically cached `DIR` at module load, preventing test suite path isolation. Fixed by converting to dynamic `getDir()` getters.
3. **Journal Outcome Expiry Test Flaw**: Fixed hardcoded `new Date()` evaluation in `journal.test.ts` that caused false expiry failures.

---

## 2. Multi-Session Evidence Metrics

| Metric | Recorded Value |
| :--- | :--- |
| **Distinct Sessions Recorded** | 0 (Live production runs awaiting active session logging) |
| **Session Date Range** | N/A |
| **Total Collection Cycles** | 0 |
| **Total Monitoring Cycles** | 0 |
| **Live Opportunities Observed** | 0 |
| **Accepted Opportunities** | 0 |
| **Rejected Opportunities** | 0 |
| **Paper Opportunities Created** | 0 |
| **Duplicate Opportunities Skipped**| 0 |

---

## 3. Paper Trade Performance Outcomes

| Metric | Outcome |
| :--- | :--- |
| **Open Trades** | 0 |
| **Completed Trades** | 0 |
| **T1 Hits** | 0 |
| **T2 Hits** | 0 |
| **Stop Hits** | 0 |
| **Expirations** | 0 |
| **Invalidations** | 0 |
| **Sample Size Label** | `INSUFFICIENT_SAMPLE` |
| **Win Rate** | `null` (Insufficient sample) |
| **Average Realized R** | `null` |
| **Expectancy R** | `null` |
| **Profit Factor** | `null` |
| **Max Drawdown R** | `null` |
| **Average MFE R** | `null` |
| **Average MAE R** | `null` |

*Note: In accordance with Section 9 & 10 rules, 0 completed trades reports `INSUFFICIENT_SAMPLE` and `null` metrics, strictly avoiding false 0% win rates.*

---

## 4. Data Quality & Fill Model Audit

- **Data Quality Coverage**: All paper trade creations strictly enforce `LIVE` data quality (`isAllLive(dq)` for options and `source === "UPSTOX"` for stocks). `MOCK`, `STALE`, or `UNAVAILABLE` sources are rejected.
- **Fill Model Convention**: Documented conservative `LTP` (Last Traded Price) convention.
- **Execution Limitation**: The system relies on LTP as a proxy for execution. Realized spread costs and bid/ask slippage are not currently simulated in the paper engine.

---

## 5. Safety & Constraint Audit

- **Order Placement Endpoints**: 0
- **Order Modification Endpoints**: 0
- **Order Cancellation Endpoints**: 0
- **Real Order Execution Calls**: 0
- **Strategy Code Modifications**: NO (Scoring, ranking, entry, stop, target, R:R, and thresholds remain 100% frozen).

---

## 6. Daily Operational Workflow

To accumulate multi-session live paper trading evidence during live market hours:

1. **Authenticate with Upstox** (Daily before 09:15 IST):
   ```bash
   npm run upstox:login
   ```
2. **Verify Upstox Authentication & Market Status**:
   ```bash
   npm run upstox:status
   ```
3. **Run Continuous Collector & Monitor** (During NSE session 09:15 – 15:30 IST):
   ```bash
   npm run paper:live
   ```
   *Or trigger single cycles on demand:*
   ```bash
   npm run paper:cycle
   ```
4. **Inspect Outcomes & Multi-Session Journal**:
   Visit `http://localhost:3123/opportunity-journal` or call `GET /api/paper-opportunities/sessions`.

---

## 7. Final Conclusion & Next Steps

Phase 25 has successfully established the infrastructure, persistent storage, API surface, dashboard UI, and comprehensive test suite for multi-session live paper trading evidence collection.

Because the current local time is **16:56 IST (Market Closed)** and **Upstox Authentication is disconnected**, live collection was blocked for the current session.

**HARD STOP ENFORCED**: Strategy optimization, parameter tuning, or threshold alterations are strictly prohibited until genuine multi-session paper trade evidence has been accumulated during active market hours.
