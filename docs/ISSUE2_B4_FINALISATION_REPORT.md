# Issue 2 — B4 Finalisation: Breadth Freshness (Option A), PARTIAL Display, Tests

Date: 2026-11-06 (IST). Written for: the project owner, reviewing the approved decisions as implemented.

Scope: the three approved decisions only (Option A; PARTIAL display; test updates). B1 and B4 are preserved. B2, B3, B5, B6 and B7 were not started.

**Supersedes** the following earlier statements:
- `ISSUE2_B4_BREADTH_TIMESTAMP_FIX_REPORT.md` §7 rows "one genuinely stale" and "live: every 2nd constituent is 10 min old" (were LIVE; now STALE), and §9 item 2 (the latest-quote rule is removed).
- `ISSUE2_B4_FOLLOWUP_REPORT.md` §4 (Task A stopped for a decision; the decision is now made and implemented).

**Live feed availability is not validated.** How often constituent timestamps are older than 150 s during market hours is still unknown. That needs a live request, which this task does not make.

## 1. Summary

| Decision | Implemented | Verified |
|---|---|---|
| 1. Option A: every constituent must be fresh within the existing 150 s window for LIVE | Yes (`breadthService.ts`) | 24 / 24 matrix and rule tests |
| 2. PARTIAL breadth shows as `PARTIAL LIVE DATA`; LIVE only for LIVE breadth | Yes (`dataStatus.ts`, `DataStatus.tsx` note) | 11 / 11 label tests |
| 3. Update B5b, convert the four pending tests, add the requested cases | Yes | 0 pending tests in the suite |

## 2. Exact implementation changes

### 2.1 `web/src/lib/services/breadthService.ts`

The latest-quote rule is removed. Each valid constituent is judged on its own:

```ts
for (const q of validQuotes) {
  if (typeof q.timestamp !== "string" || !Number.isFinite(Date.parse(q.timestamp))) { counts.undated++; continue; }
  const f = tradeFreshnessOf(q.timestamp, now, 1.25).freshness;
  if (f === "LIVE" || f === "AGING") counts.fresh++;
  else if (f === "END_OF_DAY") counts.endOfDay++;
  else counts.stale++;               // STALE, future-dated (tradeFreshnessOf fails closed)
}
const notFresh = counts.stale + counts.undated;
```

Status order after the existing guards (unchanged: total 0 → UNAVAILABLE; coverage below 80% → UNAVAILABLE; MOCK override):

1. `notFresh > 0` → **STALE**. The reason names the stale/future-dated count and the undated count.
2. `endOfDay > 0` → **END_OF_DAY** (closed session, every quote from today).
3. `coverage < 100` → **PARTIAL** (existing).
4. Otherwise → **LIVE**.

The newest timestamp is still reported in `source.lastTradeTime` for information. It no longer judges freshness.

The 150 s window is the existing `tradeFreshnessOf(…, 1.25)` rule (STALE above 120 × 1.25 = 150 s). AGING quotes (30–150 s) count as inside the window, as they did before. No new threshold was introduced. The 80% coverage constant and the constituent universe are unchanged.

### 2.2 `web/src/lib/dataStatus.ts`

Only the breadth term changed (and its comment):

- Before: `s.breadth !== null && (s.breadth.status === "LIVE" || s.breadth.status === "PARTIAL")`
- After: `s.breadth !== null && s.breadth.status === "LIVE"`

Result: LIVE breadth can give `LIVE DATA`. PARTIAL, END_OF_DAY, STALE, UNAVAILABLE and null breadth cannot.

### 2.3 `web/src/components/DataStatus.tsx`

The `PARTIAL LIVE DATA` note now lists "partial breadth coverage" among the reasons an input is not fully live. Without it, the note would not describe a PARTIAL breadth set.

### 2.4 Tests

| File | Change |
|---|---|
| `web/src/lib/services/breadthSetFreshness.test.ts` | Rewritten. The four pending `todo` tests are now real assertions: one fresh / 49 stale → A-5; stale majority 10 / 40 → A-5b; mixed 25 / 25 → A-4; fresh majority 40 / 10 → A-3. New: missing, invalid, stale and future cases; closed market; empty input; PARTIAL display and engine acceptance. 24 tests. |
| `web/src/lib/services/breadthTimestamps.test.ts` | **B5b updated**: one fresh among 49 stale now asserts STALE (was LIVE). Other 15 tests unchanged. |
| `web/src/lib/dataStatus.breadth.test.ts` | **DS-2 updated**: PARTIAL breadth now asserts `PARTIAL LIVE DATA` (was `LIVE DATA`). Added DS-10 (one fresh, 49 stale) and DS-11 (every constituent undated). 11 tests. |

## 3. Before-and-after freshness scenarios

"Before" is the state at the end of the B4 work (latest-quote rule). "After" is this change. Harness: deterministic fixed clock (Mon 12:30 IST, market open; 16:51 IST for the closed cases), NIFTY 50 universe, fixed price pattern (30 advancing, 10 declining, 10 unchanged). Output kept outside the repository.

| Scenario | Fresh / stale or future / undated | Status before → after | Breadth factor before → after | Engine decision before → after |
|---|---|---|---|---|
| All fresh | 50 / 0 / 0 | LIVE → LIVE | true → true | TRADE → TRADE |
| One missing | 49 / 0 / 1 | STALE → STALE | false → false | NO_TRADE → NO_TRADE |
| Several missing (5) | 45 / 0 / 5 | STALE → STALE | false → false | NO_TRADE → NO_TRADE |
| All missing | 0 / 0 / 50 | STALE → STALE | false → false | NO_TRADE → NO_TRADE |
| **One stale (49 fresh)** | 49 / 1 / 0 | **LIVE → STALE** | **true → false** | **TRADE → NO_TRADE** |
| Mixed 30 fresh / 10 stale / 10 missing | 30 / 10 / 10 | STALE → STALE | false → false | NO_TRADE → NO_TRADE |
| One future (+60 s) | 49 / 1 / 0 | STALE → STALE | false → false | NO_TRADE → NO_TRADE |
| One unparseable timestamp | 49 / 1 / 0 | STALE → STALE | false → false | NO_TRADE → NO_TRADE |
| **Stale majority, one fresh** | 1 / 49 / 0 | **LIVE → STALE** | **true → false** | **TRADE → NO_TRADE** |
| Empty input | 0 / 0 / 0 | UNAVAILABLE → UNAVAILABLE | false → false | NO_TRADE → NO_TRADE |
| All fresh, market CLOSED | 50 / 0 / 0 | END_OF_DAY → END_OF_DAY | false → false | NO_TRADE → NO_TRADE |
| One missing, market CLOSED | 49 / 0 / 1 | STALE → STALE | false → false | NO_TRADE → NO_TRADE |

The live path (`getBreadth` with a fetch stub; the fixed clock injected):

| Live scenario | Before | After |
|---|---|---|
| All constituents carry `last_trade_time` | LIVE / LIVE | LIVE / LIVE |
| Every 10th lacks `last_trade_time` | STALE / UNAVAILABLE | STALE / UNAVAILABLE |
| Every constituent lacks `last_trade_time` | STALE / UNAVAILABLE | STALE / UNAVAILABLE |
| Every 2nd constituent 10 min old | **LIVE / LIVE** | **STALE / UNAVAILABLE** |

Advances, declines, unchanged, total, coverage and the breadth ratio are identical before and after in every row. Only status, source, the breadth factor and the engine decision changed.

**Option A matrix (50 constituents), asserted in the test file:**

| Fresh / 50 | Status | Test |
|---|---|---|
| 50 | LIVE | A-1 |
| 49 | STALE | A-2 |
| 40 | STALE | A-3 |
| 25 | STALE | A-4 |
| 10 | STALE | A-5b |
| 1 | STALE | A-5 |
| 0 | STALE | A-6 |

**Engine acceptance of PARTIAL, unchanged:** `analysis.ts:161` still accepts LIVE or PARTIAL. P-3 confirms a PARTIAL set (84% coverage, all fresh) keeps the breadth factor available. P-4 and P-5 confirm LIVE is accepted and STALE is rejected.

## 4. Data-status label behaviour

Production shape (breadth source matches the status):

| Breadth status | Label before | Label after | Test |
|---|---|---|---|
| LIVE | LIVE DATA | LIVE DATA | DS-1 |
| PARTIAL (84%) | LIVE DATA | **PARTIAL LIVE DATA** | DS-2 |
| END_OF_DAY | PARTIAL LIVE DATA | PARTIAL LIVE DATA | DS-3 |
| STALE | PARTIAL LIVE DATA | PARTIAL LIVE DATA | DS-4, DS-10, DS-11 |
| UNAVAILABLE | PARTIAL LIVE DATA | PARTIAL LIVE DATA | DS-5 |
| null breadth | PARTIAL LIVE DATA | PARTIAL LIVE DATA | DS-6 |
| Mixed snapshots, one STALE | PARTIAL LIVE DATA | PARTIAL LIVE DATA | DS-9 |

Defensive (breadth status inconsistent with its source label, which production does not produce):

| Breadth status with source LIVE | Label before | Label after | Test |
|---|---|---|---|
| STALE | LIVE DATA | PARTIAL LIVE DATA | DS-7 |
| END_OF_DAY | LIVE DATA | PARTIAL LIVE DATA | DS-8 |

DS-7 and DS-8 failed before the previous follow-up change and pass now. The "before" labels in this table for those two rows are the values the old expression produced; the pre-change test failures confirm them.

**Label consumers checked (all consistent with the new labels):**
- `TopBar.tsx:71` and `RecommendationCard.tsx:82`: LIVE DATA and END OF DAY are neutral badges; PARTIAL LIVE DATA is a warning badge. PARTIAL breadth now shows as a warning, which matches the owner's decision.
- `DataStatus.tsx`: icon, colour and note keyed on the label. LIVE stays neutral; PARTIAL uses the warning style; the note now names partial breadth coverage.
- `rss.test.ts`, `news.test.ts`, `runtimeTrust.test.ts`, `productionReadinessAudit.test.ts`: all pass unchanged.
- `MarketCard.tsx`: shows the per-source breadth badge (LIVE and PARTIAL neutral, others warning). Not label-derived, so unchanged.

## 5. Test results

| Check | Result |
|---|---|
| Focused: `breadth.test.ts` | 12 / 12 pass |
| Focused: `breadthTimestamps.test.ts` | 16 / 16 pass |
| Focused: `breadthSetFreshness.test.ts` | 24 / 24 pass |
| Focused: `dataStatus.breadth.test.ts` | 11 / 11 pass |
| **Full suite `npm test`** | **2034 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo** |
| Pending tests (`todo`) | **0.** The four previously pending cases are now real assertions. |

Test count history: 1999 (end of B4) → 2010 (follow-up, 4 pending) → 2034 (this change).

## 6. TypeScript and ESLint

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| ESLint on `breadthService.ts`, `dataStatus.ts`, `DataStatus.tsx`, and the three test files | exit 0, no problems |

## 7. Strategy 11.4 verification

- `web/src/lib/engine/strategy.ts` SHA-256: **`d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18`**. Matches the expected value.
- `engine/strategy.ts` and `engine/analysis.ts`: zero diff against HEAD.

## 8. Engine behaviour

- The engine's gating and eligibility rules are unchanged.
- Scenario decisions that changed (harness rows above): "one stale" and "stale majority" go from TRADE to NO_TRADE, because the breadth factor now correctly reads unavailable. This is the approved consequence of Option A.
- Any non-fresh constituent in a live set now makes the breadth factor unavailable. The engine then gives no candidate for that cycle (the rule that a missing factor suppresses candidates). This is the strict behaviour the owner approved.

## 9. Git diff and unrelated dirty state

- `web/src/lib/services/breadthService.ts`: B4 and this change. +26 / −6 in total, all in the freshness judgement.
- `web/src/lib/services/upstoxMarket.ts`: changed by B4 (line 372), not by this task. Untouched here. Earlier uncommitted work in the file is preserved.
- `web/src/lib/dataStatus.ts`: already dirty before B4 follow-up (a pre-existing "END OF DAY" label hunk). This task changed only the breadth term and its comment. The pre-existing hunk is preserved.
- `web/src/components/DataStatus.tsx`: already dirty before this task (pre-existing "END OF DAY" note, clock icon and styling). This task changed only the PARTIAL note text. The pre-existing hunks are preserved.
- New test files: `breadthSetFreshness.test.ts` (rewritten), `dataStatus.breadth.test.ts`, `breadthTimestamps.test.ts`.
- Documentation: `ISSUE2_B4_FINALISATION_REPORT.md` (this file).
- No staging, commit, reset, clean or checkout was performed.

## 10. Protected data, network and automation

- `web/.data`: **0 files written** during this task (checked by timestamp).
- `web/.research-data`: **0 files written** during this task.
- No Upstox, NSE or broker request. All tests and the scenario harness used fetch stubs, fixtures and a fixed clock.
- No OAuth refresh or Analytics Token generation. No credentials read or changed.
- No live dashboard route was called.
- No runner, collector, scheduler, supervisor or canary was started.

## 11. Remaining limitations

1. **Live availability is unknown.** The frequency of constituent timestamps older than 150 s during market hours has not been measured. Under Option A, one such constituent in a set removes the breadth factor and blocks candidates for that cycle. The live impact is the main thing to watch once this is deployed. Measuring it needs a separately authorised live window.
2. **PARTIAL breadth now shows as a warning.** With partial coverage (80–99%) the dashboard label is PARTIAL LIVE DATA. The engine still scores these sets.
3. **Closed-market label difference.** An undated or stale breadth set in a closed market is STALE, while the spot path reports END_OF_DAY. Both block execution. Unchanged; the owner can align them if wanted.
4. **Timestamp ordering.** The source's `lastTradeTime` is still chosen by string sort. It no longer affects freshness, so the only effect is on the informational field. The strings produced by `upstoxMarket` are uniform ISO-Z, so the order is correct in practice.
5. **`B4` report superseded in part** (see the top of this file).
6. **Mock and historical paths** still bypass the freshness judgement through the MOCK override. Their quotes always carry timestamps, so this is unchanged.

## 12. How to reproduce

```
cd web
node --test --experimental-strip-types src/lib/services/breadth.test.ts src/lib/services/breadthTimestamps.test.ts src/lib/services/breadthSetFreshness.test.ts src/lib/dataStatus.breadth.test.ts
npm test
npx tsc --noEmit
npx eslint src/lib/services/breadthService.ts src/lib/dataStatus.ts src/components/DataStatus.tsx src/lib/services/breadthSetFreshness.test.ts src/lib/services/breadthTimestamps.test.ts src/lib/dataStatus.breadth.test.ts
shasum -a 256 src/lib/engine/strategy.ts
```

The scenario comparison used a scratch harness outside the repository. It is not committed.
