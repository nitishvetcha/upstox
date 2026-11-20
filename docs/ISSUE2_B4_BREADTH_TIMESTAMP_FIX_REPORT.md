# Issue 2 — B4: Breadth Constituent Timestamps (Fix Report)

Date: 2026-11-06 (IST). Written for: the project owner, for review before this change is relied on in live recommendations.

Scope: B4 only. A constituent quote with no usable trade timestamp must not be treated as fresh because the application substitutes the current time. B1 is unchanged. B2, B3, B5, B6 and B7 were not started.

**Status: implemented and verified offline. Owner decision needed before this changes live behaviour (§9, item 1).** The fix makes breadth stop reporting LIVE when constituent timestamps are missing. In the scenarios tested, that turns a TRADE into NO_TRADE. The live frequency of missing timestamps is unknown and could not be measured without a market-data request, which this task forbids.

## 1. Root cause and exact location

Two code paths combined to make undated constituents look fresh:

1. **Substitution (the root cause).** `web/src/lib/services/upstoxMarket.ts:372` (inside `getBreadth`) set a constituent's timestamp to the current time when its `last_trade_time` was missing or invalid:
   `timestamp: Number.isFinite(ltt) && ltt >= MIN_LTT_EPOCH_MS ? new Date(ltt).toISOString() : now().toISOString()`
2. **Latest-quote rule (amplifier).** `web/src/lib/services/breadthService.ts:101–103` judges the whole set by its *latest* constituent timestamp. One substituted "now" timestamp became the latest, so `tradeFreshnessOf` returned LIVE for the entire set, regardless of the other constituents.

## 2. Existing behaviour (before the fix)

Measured on the unmodified code (§7):
- One undated constituent out of 50, all others fresh → status **LIVE**, breadth factor **available**, decision **TRADE**.
- Every constituent undated (live path) → status **LIVE**, source **LIVE**.
- Calling `calculateBreadth` directly with `timestamp: null` → status STALE. This was already the contract of `breadthService`; the bug was only on the live path, because `upstoxMarket` never passed `null`.
- Empty input → UNAVAILABLE.

## 3. Corrected behaviour (after the fix)

| Input | Status | Source | Notes |
|---|---|---|---|
| All constituents fresh and timestamped | LIVE (unchanged) | LIVE | |
| Some constituents undated (missing or unparseable timestamp) | **STALE** | UNAVAILABLE | Reason: "N of M constituent quote(s) have no usable trade timestamp; freshness cannot be verified" |
| All constituents undated | **STALE** | UNAVAILABLE | Priced quotes exist, so this is not UNAVAILABLE |
| All constituents genuinely stale | STALE (unchanged) | UNAVAILABLE | |
| Future timestamp (more than 5 s ahead) | STALE (unchanged) | UNAVAILABLE | Existing `tradeFreshnessOf` rule |
| Empty constituent input | UNAVAILABLE (unchanged) | UNAVAILABLE | "No valid constituent quotes received" |
| Undated quotes while market CLOSED | STALE | UNAVAILABLE | See §6 on why this differs from the spot path |

**Undated quotes still count as priced quotes.** Advances, declines, unchanged, total, coverage, and the breadth ratio are computed exactly as before. Only the freshness judgement changed. No denominator was changed and no coverage threshold was introduced. The 80% `BREADTH_MIN_COVERAGE_PERCENT` is applied as before.

**Unparseable timestamps are treated as undated.** The old code could let an invalid string sort as the "latest" and mask the fresh quotes; the new code excludes it from the freshness judgement.

## 4. Files changed and why

| File | Change | Why |
|---|---|---|
| `web/src/lib/services/upstoxMarket.ts` | Line 372: `now().toISOString()` → `null` (plus a one-line comment) | Removes the substitution at its source. The file already had uncommitted changes from earlier work, including the `ltt >= MIN_LTT_EPOCH_MS` condition on the same line. Those were not touched. |
| `web/src/lib/services/breadthService.ts` | Undated quotes excluded from the freshness judgement; new `undated > 0` branch sets STALE before the END_OF_DAY and freshness branches | The status logic is where undated quotes must be judged. The file was clean before this change. |
| `web/src/lib/services/breadthTimestamps.test.ts` | **New.** 16 offline tests (§8) | Covers each required scenario, plus the live path through `getBreadth` with a fetch stub. |

Not changed: `engine/strategy.ts` (SHA-256 unchanged, zero diff against HEAD), `engine/analysis.ts` (zero diff), `time.ts`, `breadthConfig.ts`, `types.ts`, `breadth.test.ts`, and every other file.

## 5. Public types and contracts

**No public type or contract changed.** `ConstituentQuote.timestamp` already typed `string | null`. `MarketBreadth.status` keeps its values (`LIVE | PARTIAL | END_OF_DAY | STALE | UNAVAILABLE`). No status, blocker code or field was added.

**Known limitation of the type:** the status type cannot express "unknown". An undated set is reported as STALE, and the difference from genuinely stale data is visible only in the `reason` text. A dedicated status would be a public type change, which the brief asked me to stop and report rather than make. It is not made here.

## 6. Missing versus stale versus empty-data handling

- **Missing or unparseable timestamp:** STALE, source UNAVAILABLE, reason names the undated count. Never LIVE, never filled in with a fabricated time.
- **Genuinely stale timestamp:** STALE, as before.
- **Empty input:** UNAVAILABLE, reason "No valid constituent quotes received". This is the absent-data case, and it is still distinct from STALE.
- **All constituents undated:** STALE, not UNAVAILABLE. The prices are present; only the freshness is unknown.

**Difference from the spot path, flagged for the owner:** when the market is CLOSED, the spot path labels a missing timestamp END_OF_DAY (`liveQuoteSource`), while breadth now labels it STALE. I chose STALE because `calculateBreadth` already returned STALE for a null timestamp in every market state. Both labels block execution. The diagnostic label changes from END_OF_DAY to STALE for closed-market live data with a missing timestamp (§7, scenario 12).

## 7. Before-and-after scenario results

Deterministic: fixed clock (Mon 2026-10-05 12:30 IST, market open; 16:51 IST for the closed cases), NIFTY 50 universe (50 expected), fixed price pattern (30 advancing, 10 declining, 10 unchanged). Fresh = 30 s old, stale = 10 min old, future = +60 s. Harness output was kept outside the repository. No live data was used.

| # | Scenario | Fresh | Stale | Future | Invalid | Missing | Verified-fresh cov. | Adv / Dec / Unch | Ratio | Status (before → after) | Source (after) | Breadth factor (before → after) | Engine decision (before → after) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | All fresh | 50 | 0 | 0 | 0 | 0 | 100% | 30 / 10 / 10 | 3.00 | LIVE → LIVE | LIVE | true → true | TRADE → TRADE |
| 2 | One missing | 49 | 0 | 0 | 0 | 1 | 98% | 30 / 10 / 10 | 3.00 | **LIVE → STALE** | UNAVAILABLE | true → **false** | **TRADE → NO_TRADE** |
| 3 | Several missing (5) | 45 | 0 | 0 | 0 | 5 | 90% | 30 / 10 / 10 | 3.00 | **LIVE → STALE** | UNAVAILABLE | true → **false** | **TRADE → NO_TRADE** |
| 4 | All missing | 0 | 0 | 0 | 0 | 50 | 0% | 30 / 10 / 10 | 3.00 | STALE → STALE | UNAVAILABLE | false → false | NO_TRADE → NO_TRADE |
| 5 | One genuinely stale | 49 | 1 | 0 | 0 | 0 | 98% | 30 / 10 / 10 | 3.00 | LIVE → LIVE | LIVE | true → true | TRADE → TRADE |
| 6 | Mixed 30 fresh / 10 stale / 10 missing | 30 | 10 | 0 | 0 | 10 | 60% | 30 / 10 / 10 | 3.00 | **LIVE → STALE** | UNAVAILABLE | true → **false** | **TRADE → NO_TRADE** |
| 7 | One future (+60 s) | 49 | 0 | 1 | 0 | 0 | 98% | 30 / 10 / 10 | 3.00 | STALE → STALE | UNAVAILABLE | false → false | NO_TRADE → NO_TRADE |
| 8 | One unparseable timestamp | 49 | 0 | 0 | 1 | 0 | 98% | 30 / 10 / 10 | 3.00 | STALE → STALE | UNAVAILABLE | false → false | NO_TRADE → NO_TRADE |
| 9 | Stale majority, one fresh (preserved, flagged §9) | 1 | 49 | 0 | 0 | 0 | 2% | 30 / 10 / 10 | 3.00 | LIVE → LIVE | LIVE | true → true | TRADE → TRADE |
| 10 | Empty input | 0 | 0 | 0 | 0 | 0 | 0% | 0 / 0 / 0 | — | UNAVAILABLE → UNAVAILABLE | UNAVAILABLE | false → false | NO_TRADE → NO_TRADE |
| 11 | All fresh, market CLOSED | 50 | 0 | 0 | 0 | 0 | 0% (EOD) | 30 / 10 / 10 | 3.00 | END_OF_DAY → END_OF_DAY | END_OF_DAY | false → false | NO_TRADE → NO_TRADE |
| 12 | One missing, market CLOSED | 49 | 0 | 0 | 0 | 1 | 0% (EOD) | 30 / 10 / 10 | 3.00 | END_OF_DAY → **STALE** | UNAVAILABLE | false → false | NO_TRADE → NO_TRADE |

Scenario 9 is the same false-freshness family as B4 and was **not** changed, because the brief required preserving existing treatment of genuinely stale quotes. See §9, item 2.

**Live path** (the real `getBreadth` with a fetch stub; the fixed clock is injected):

| Scenario | Before | After |
|---|---|---|
| All constituents carry `last_trade_time` | LIVE, source LIVE | LIVE, source LIVE (unchanged) |
| Every 10th constituent lacks `last_trade_time` (5 of 50) | **LIVE**, source LIVE | **STALE**, source UNAVAILABLE |
| Every constituent lacks `last_trade_time` | **LIVE**, source LIVE | **STALE**, source UNAVAILABLE |
| Every 2nd constituent is 10 min old | LIVE, source LIVE | LIVE, source LIVE (unchanged, §9 item 2) |

In every case, advances, declines and total are identical before and after. Only the status and source changed.

**Engine decision changes:** scenarios 2, 3 and 6 change from TRADE to NO_TRADE. The blocker codes are `INSUFFICIENT_FRESHNESS` and `NO_VALID_STRATEGY`. The breadth factor is the only factor that changes. The engine never gives a candidate when a factor is missing (`strategy.ts:213`), which is why every undated constituent blocks a trade. No other engine decision changed.

## 8. Test cases and results

### 8.1 New tests (`breadthTimestamps.test.ts`, 16)

| Test | Assertion | Failed before the fix? |
|---|---|---|
| B4-1 | All fresh → LIVE, full verified coverage | no (preserved) |
| B4-2 | One missing → STALE, reason names 1 of 50 | **yes** |
| B4-3 | Several missing → STALE, reason names 5 of 50 | **yes** |
| B4-4 | Every missing → STALE, source UNAVAILABLE, counts intact | no (direct call was already STALE; the live path is covered by B4-9a) |
| B5 | All genuinely stale → STALE | no (preserved) |
| B5b | Characterisation: one fresh among stale → LIVE (preserved, flagged) | no (preserved) |
| B4-6 | Mixed 30 / 10 / 10 → STALE, reason names 10 of 50 | **yes** |
| B4-7 | Future timestamp → STALE, never LIVE | no (preserved) |
| B4-8 | Empty input → UNAVAILABLE, not STALE | no (preserved) |
| B4-extra | Unparseable timestamp sorting first → STALE | **yes** |
| B4-10 | Advances, declines, unchanged, ratio, breadth % unchanged by missing timestamps | no (regression guard) |
| B4-11 | Breadth factor available with fresh timestamps; unavailable with an undated constituent | **yes** |
| B4-12 | `unavailableBreadth` still reports UNAVAILABLE | no (preserved) |
| B4-9a | Live path, no `last_trade_time` → not LIVE; no quote stamped with the current time | **yes** |
| B4-9b | Live path, 5 of 50 undated → STALE, counts unchanged | **yes** |
| B4-9c | Live path, all dated → LIVE (preserved) | no (preserved) |

Seven tests failed on the unmodified code, all on the missing-timestamp cases. This confirms they detect the bug. The other nine pass before and after, which shows the preserved behaviour is unchanged.

### 8.2 Results

| Check | Result |
|---|---|
| Focused: `breadthTimestamps.test.ts` + existing `breadth.test.ts` | **28 / 28 pass** (16 new, 12 existing) |
| Full suite: `npm test` | **1999 / 1999 pass, 0 fail** (1983 before; +16 new) |
| `npx tsc --noEmit` | **exit 0** |
| ESLint on `breadthService.ts` and `breadthTimestamps.test.ts` | **0 problems** |
| ESLint on `upstoxMarket.ts` | 0 errors; 2 warnings, both pre-existing unused imports (lines 3:117, 3:207), outside my change |

## 9. Known limitations and decisions for the project owner

1. **Availability impact (decision required before live use).** Any single constituent without a usable trade time now makes breadth STALE, which removes the breadth factor and blocks every candidate for that cycle. In the tested scenarios this turns TRADE into NO_TRADE. The fix is conservative (it can only remove LIVE, never add it), but it is strict. The real frequency of missing `last_trade_time` on constituent quotes is **unknown**: measuring it needs a live Upstox request, which this task does not permit. The only evidence in the repository is the captured fixture in `breadth.test.ts` (test 11), whose constituent rows carry `last_trade_time`. The owner should decide whether a tolerance rule is wanted (for example, a verified-fresh coverage threshold). I did not invent one.
2. **Latest-quote rule (not changed, same false-freshness family).** The set is judged by its *latest* quote. One fresh constituent among 49 stale ones reads LIVE (scenario 9; live path row 4). This is existing behaviour, which the brief asked me to preserve, and it is a real false-freshness case for timestamped quotes. Fixing it changes how freshness of timestamped data is judged, so it needs a decision (for example, judge by majority or by verified-fresh coverage).
3. **Status type cannot express "unknown".** Undated sets are STALE with an explanatory reason. A dedicated status would be a public type change and was not made.
4. **Closed-market label difference from spot (§6).** Undated breadth in a closed market is STALE, while the spot path gives END_OF_DAY. Both block execution. The owner may prefer to align them.
5. **Consumer: `web/src/lib/dataStatus.ts:16`. Correction and follow-up.** This item originally said the data-status summary could show breadth as OK while the engine blocks on it. Testing showed that is wrong for production snapshots: a STALE breadth set reports source UNAVAILABLE, which already prevents the LIVE DATA label. The expression was still wrong for STALE and END_OF_DAY, and it has been corrected in the B4 follow-up (`docs/ISSUE2_B4_FOLLOWUP_REPORT.md`).
6. **Timestamp ordering.** `latestTradeTime` is chosen by string sort. This is correct for the uniform ISO-Z strings `upstoxMarket` produces, but would misorder mixed offsets. Not changed.
7. **Not verified against a live response.** All evidence is offline: stubs, fixtures and the fixed clock.

Consumers checked and unaffected: `paperEngine.ts:277` blocks STALE breadth (safe, and the new STALE is correctly blocked). `backtestSnapshot.ts:129` and `historicalContext.ts` always supply timestamps, so backtests are unaffected. `mock.ts` supplies timestamps. `MarketCard.tsx` renders STALE with a warning tone. `analysis.ts:161` uses LIVE or PARTIAL only, so STALE removes the factor, as intended.

## 10. Strategy 11.4 verification

- `web/src/lib/engine/strategy.ts` SHA-256: **`d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18`**. Matches the expected value.
- `engine/strategy.ts` and `engine/analysis.ts`: zero diff against HEAD.

## 11. Git diff and unrelated dirty state

- `web/src/lib/services/breadthService.ts`: clean before this task; now +10 / −1, all in the freshness judgement.
- `web/src/lib/services/upstoxMarket.ts`: already had uncommitted changes from earlier work (the diff against HEAD includes the `getBreadth` guard for an unmapped index and the `ltt >= MIN_LTT_EPOCH_MS` condition). **This task changed only line 372** (`now()` → `null`) plus a one-line comment. Those earlier hunks were preserved untouched.
- `web/src/lib/services/breadthTimestamps.test.ts`: new file.
- No staging, commit, reset, clean or checkout was performed.

## 12. Protected data

Checked by file timestamp against the new test file's creation time:
- `web/.data`: **0 files written** during this task.
- `web/.research-data`: **0 files written** during this task.
- No file under `.data/` or `.research-data/` was read, repaired, migrated or rewritten.

## 13. Restrictions — confirmation

- **No Upstox, NSE, broker or other market-data request.** All tests and the harness used fetch stubs and fixed fixtures.
- **No live dashboard route was called.** No `/api/...` route was requested.
- **No OAuth refresh, no Analytics Token generation.** `.env.local` and credentials were not read or changed.
- **No paper runner, supervisor, canary, scheduler, collector or automated process** was started. The LaunchAgent was not loaded or restored.
- **No backtest was run.**
- **Strategy 11.4 and its hash:** unchanged (§10).
- **No trading rule, strategy scoring, threshold, risk control, candidate generation or eligibility logic was changed.** Strategy scoring and gates are unmodified; the only effect is that a breadth factor which is now correctly not fresh becomes unavailable, as described in §7.
- **No breadth coverage threshold was changed or invented.** `BREADTH_MIN_COVERAGE_PERCENT` is still 80.
- **No constituent universe was changed.**
- **B1 was not modified.** B2, B3, B5, B6 and B7 were not started.
- **No public type, status or blocker code was added or removed.**
- **No build cache deleted.** `web/.next` and the development cache were not touched.

## 14. How to reproduce

```
cd web
node --test --experimental-strip-types src/lib/services/breadthTimestamps.test.ts src/lib/services/breadth.test.ts
npm test
npx tsc --noEmit
npx eslint src/lib/services/breadthService.ts src/lib/services/breadthTimestamps.test.ts
shasum -a 256 src/lib/engine/strategy.ts
```

The scenario comparison used a scratch harness outside the repository. It is not committed.
