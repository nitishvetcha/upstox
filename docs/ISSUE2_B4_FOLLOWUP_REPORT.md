# Issue 2 — B4 Follow-up: Latest-Quote Freshness (Task A) and Data-Status Consistency (Task B)

Date: 2026-11-06 (IST). Written for: the project owner, who must decide Task A before the breadth freshness rule changes.

Scope: the two B4 follow-up defects only. B1 and B4 are preserved. B2, B3, B5, B6 and B7 were not started.

## 1. Summary

| Task | Outcome |
|---|---|
| **Task A** — a fresh quote must not make a mostly stale breadth set read LIVE | **Stopped for an owner decision, per the brief.** No approved freshness-share rule exists in the repository. §4 gives the options and what each would change. No code was changed for Task A. |
| **Task B** — `dataStatus.ts` must not count STALE breadth as OK | **Implemented.** One expression changed. The production path was already correct (§5), so the change matters for inconsistent snapshots and for future regressions. |

Task A is not fixed. The current behaviour is still a defect: one fresh constituent among 49 stale ones reads LIVE. The four pending tests in `breadthSetFreshness.test.ts` record that defect.

## 2. Task A — root cause

`web/src/lib/services/breadthService.ts:101–103`:

```ts
const timestamps = validQuotes.map((q) => q.timestamp).filter(/* parseable */);
const latestTradeTime = timestamps.length ? [...timestamps].sort().reverse()[0] : null;
const tf = tradeFreshnessOf(latestTradeTime, now, 1.25);
```

The whole set is judged by its single newest timestamp. Any fresh constituent makes `tf.freshness` LIVE, so the set is LIVE no matter how many other constituents are stale. This rule is the existing behaviour. B4 did not introduce it, and B4 only stopped undated quotes from counting as fresh.

Reproduced on the current code (50 constituents, all with valid timestamps):

| Fresh / stale | Current status | Source |
|---|---|---|
| 50 / 0 | LIVE | LIVE |
| 49 / 1 | LIVE | LIVE |
| 40 / 10 | LIVE | LIVE |
| 25 / 25 | LIVE | LIVE |
| 10 / 40 | LIVE | LIVE |
| 1 / 49 | **LIVE** | LIVE |
| 0 / 50 | STALE | UNAVAILABLE |

Six of the seven rows read LIVE, including 25 fresh / 25 stale and 1 fresh / 49 stale. That is the defect.

## 3. Task A — what is documented

I searched the repository for an approved rule on how many constituents must be fresh. None exists.

| Source | What it says | Usable for Task A? |
|---|---|---|
| `docs/UPSTOX_LIVE_DIAGNOSTIC_REPORT.md:47` | Engine breadth staleness: fetch age > 150 s | Only a per-fetch age rule. It says nothing about how many constituents must be fresh. |
| `breadthConfig.ts:19–21` (`BREADTH_MIN_COVERAGE_PERCENT = 80`) | "Valid quotes / expected constituents (%) needed before breadth is used as a score input" | Documented for **valid quotes**, not fresh quotes. Reusing it for freshness would change its meaning. |
| `chainFreshness.ts` | Counts fresh contracts and labels the state MIXED, with no threshold | Describes the state; sets no threshold, and its header says it does not drive the STALE decision. |
| Spot and option-chain rules | Judged per quote; any missing or stale timestamp → STALE | These are not set-level rules. |

No documented majority or share-fresh threshold exists, so I have not invented one.

## 4. Task A — options for the owner

Simulated with the repository's own helpers (scratch script, not in the repo). "Current" is the code as it stands. Option A and Option B are simulated, not implemented.

| Fresh / stale | Current | **Option A**: every constituent fresh (existing 150 s rule, no new number) | **Option B**: 80% of constituents fresh (reuses `BREADTH_MIN_COVERAGE_PERCENT`) |
|---|---|---|---|
| 50 / 0 | LIVE | LIVE | LIVE |
| 49 / 1 | LIVE | **STALE** | LIVE |
| 45 / 5 (90%) | LIVE | **STALE** | LIVE |
| 42 / 8 (84%) | LIVE | **STALE** | LIVE |
| 40 / 10 (80%) | LIVE | **STALE** | LIVE |
| 25 / 25 (50%) | LIVE | **STALE** | STALE |
| 10 / 40 (20%) | LIVE | **STALE** | STALE |
| 1 / 49 (2%) | LIVE | **STALE** | STALE |
| 0 / 50 | STALE | STALE | STALE |

Engine effect: a STALE breadth set removes the breadth factor, and with it every candidate for that cycle. Under Option A, a set with one stale constituent does the same.

**Options:**

- **Option A — every constituent fresh.** Uses only the existing 150 s freshness rule, adds no number, and is the same principle B4 applied to undated quotes: anything not verified fresh is not LIVE. This is the strictest. It blocks trading whenever any single constituent is older than 150 s, which may happen often in an index with illiquid members. The live frequency is unknown and could not be measured here. Implementation is a few lines: judge by the oldest timestamp instead of the newest.
- **Option B — 80% of constituents fresh.** Reuses an existing constant, so it introduces no new number. But its documented meaning is coverage of valid quotes, so the owner must approve applying it to freshness. Fresh majority at exactly 80% passes; below it blocks.
- **Option C — a new share (for example, a majority).** Introduces a threshold that does not exist in the repository. Not implemented, per the brief.
- **Option D — keep the current rule and document it as a known limitation.** No code change. The defect remains in live use.

**Recommendation:** Option A, because it is the only option that needs no new number and matches B4's principle. Its availability cost is the decision the owner must make. Before choosing it, measure how often constituents are older than 150 s during market hours. That measurement needs a live request, so it has to be authorised separately.

**Tests:** `breadthSetFreshness.test.ts` asserts the cases both options agree on (all fresh → LIVE; all stale → STALE). It records the defect cases as pending `todo` tests (one fresh / 49 stale, stale majority, mixed). It records the fresh-majority case as pending because the options disagree on it. The existing test `B5b` in `breadthTimestamps.test.ts` locks in the current LIVE for one fresh among 49 stale ones. **It must be updated when Task A is decided.**

## 5. Task B — data-status consistency

### 5.1 Root cause

`web/src/lib/dataStatus.ts` (`dataLabel`) required breadth to be non-null and not UNAVAILABLE, so STALE and END_OF_DAY breadth passed the check. Those states were counted as usable.

### 5.2 Is the production path affected? (correction to the B4 report)

The B4 report (§9 item 5) said the data-status summary could show breadth as OK while the engine blocks on it. **Testing shows that is not true for production snapshots.** `market.ts` sets the breadth source from `calculateBreadth`'s source, and STALE and END_OF_DAY map to a source of UNAVAILABLE or END_OF_DAY. The `all.every(LIVE)` check already fails for those, so the label is PARTIAL LIVE DATA.

The expression was still wrong, because it relied on the source label being consistent with the status. The defensive cases in §6 show the failure. The B4 report has been corrected.

### 5.3 Change

`web/src/lib/dataStatus.ts`, `breadthOk` (one line, plus a comment):

- Before: `s.breadth !== null && s.breadth.status !== "UNAVAILABLE"`
- After: `s.breadth !== null && (s.breadth.status === "LIVE" || s.breadth.status === "PARTIAL")`

PARTIAL is kept as usable, because the engine accepts PARTIAL (`analysis.ts:161`) and that is existing behaviour. Whether a PARTIAL breadth should show as "PARTIAL LIVE DATA" is an owner question (§7).

The file already had uncommitted changes: a pre-existing "END OF DAY" label hunk. That hunk is untouched and remains as it was.

## 6. Task B — scenarios and tests

File: `web/src/lib/dataStatus.breadth.test.ts` (9 tests). "Production shape" means the breadth source matches what `calculateBreadth` reports. "Inconsistent" means the source is forced to LIVE, which production does not produce; it is tested to pin the expression.

| Test | Breadth status (shape) | Label before | Label after | Result before | Result after |
|---|---|---|---|---|---|
| DS-1 | LIVE (production) | LIVE DATA | LIVE DATA | pass | pass |
| DS-2 | PARTIAL, 84% (production) | LIVE DATA | LIVE DATA | pass | pass |
| DS-3 | END_OF_DAY (production) | PARTIAL LIVE DATA | PARTIAL LIVE DATA | pass | pass |
| DS-4 | STALE (production) | PARTIAL LIVE DATA | PARTIAL LIVE DATA | pass | pass |
| DS-5 | UNAVAILABLE (production) | PARTIAL LIVE DATA | PARTIAL LIVE DATA | pass | pass |
| DS-6 | null breadth | PARTIAL LIVE DATA | PARTIAL LIVE DATA | pass | pass |
| **DS-7** | STALE, source forced LIVE (inconsistent) | LIVE DATA | **PARTIAL LIVE DATA** | **fail** | **pass** |
| **DS-8** | END_OF_DAY, source forced LIVE (inconsistent) | LIVE DATA | **PARTIAL LIVE DATA** | **fail** | **pass** |
| DS-9 | one live set, one STALE set | PARTIAL LIVE DATA | PARTIAL LIVE DATA | pass | pass |

DS-7 and DS-8 failed before the change, which confirms they detect the defect. The "before" label for them is the value the code produced for the forced-LIVE source, as the pre-change test failure showed.

The UI reads the label in `TopBar.tsx:71` (LIVE DATA and END OF DAY are neutral; everything else is a warning). The change moves the inconsistent STALE and END_OF_DAY cases from neutral to warning.

## 7. Decisions for the owner

1. **Task A policy** (§4): A, B, C or D. Option A is recommended, but its live availability cost is unmeasured.
2. **PARTIAL breadth label.** It currently reads "LIVE DATA" with 80–99% coverage. The engine accepts it, so I kept it. The owner may want "PARTIAL LIVE DATA" instead, which would be a visible label change.
3. **Closed-market label.** Undated breadth in a closed market is STALE, while the spot path reports END_OF_DAY (B4 report §6). Both block execution. Align them only if wanted.
4. **After Task A is decided:** update `B5b` in `breadthTimestamps.test.ts` and convert the four pending `todo` tests in `breadthSetFreshness.test.ts` into real assertions.

## 8. Verification

| Check | Result |
|---|---|
| Data-status tests (`dataStatus.breadth.test.ts`) | 9 / 9 pass (DS-7 and DS-8 failed before the change) |
| Breadth-set tests (`breadthSetFreshness.test.ts`) | 2 pass; 4 pending `todo`, recording the Task A defect and the policy-dependent case |
| Breadth regression (`breadthTimestamps.test.ts`, `breadth.test.ts`) | pass (B4 behaviour unchanged) |
| Full suite `npm test` | **2010 pass, 0 fail, 4 todo** (1999 before; +15 new tests across the two files; the 4 todo are the pending Task A cases) |
| `npx tsc --noEmit` | exit 0 |
| ESLint on `dataStatus.ts`, `dataStatus.breadth.test.ts`, `breadthSetFreshness.test.ts` | exit 0, no problems |

The four `todo` tests show as "not ok" in node:test's output. That is how node:test reports a known failing test marked `todo`. They do not fail the suite.

## 9. Strategy 11.4 verification

- `web/src/lib/engine/strategy.ts` SHA-256: **`d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18`**. Matches the expected value.
- `engine/strategy.ts` and `engine/analysis.ts`: zero diff against HEAD.

## 10. Git diff and unrelated dirty state

- `web/src/lib/dataStatus.ts`: already dirty before this task (a pre-existing "END OF DAY" label hunk). This task changed only the `breadthOk` line and its comment. The pre-existing hunk is preserved.
- `web/src/lib/services/breadthService.ts` and `web/src/lib/services/upstoxMarket.ts`: changed by B4, not by this task. Untouched here.
- New files: `web/src/lib/dataStatus.breadth.test.ts`, `web/src/lib/services/breadthSetFreshness.test.ts`.
- Edited: `docs/ISSUE2_B4_BREADTH_TIMESTAMP_FIX_REPORT.md` §9 item 5 (correction only).
- No staging, commit, reset, clean or checkout was performed.

## 11. Protected data

Checked by file timestamp against the first new file created in this task:
- `web/.data`: **0 files written**.
- `web/.research-data`: **0 files written**.

## 12. Restrictions — confirmation

- **No Upstox, NSE or broker request.** Tests use fixtures and a fixed clock; scratch scripts used only offline helpers.
- **No OAuth refresh or token generation.** No credentials were read or changed.
- **No live dashboard route was called.**
- **No runner, collector, scheduler, supervisor or canary was started.**
- **`engine/strategy.ts` and `engine/analysis.ts` not modified.** Strategy 11.4 hash unchanged (§9).
- **No threshold changed or invented.** The 80% coverage constant and the 150 s rule are unchanged. Task A's options use only existing constants and are not implemented.
- **No constituent universe change.**
- **B2, B3, B5, B6 and B7 not started.**

## 13. How to reproduce

```
cd web
node --test --experimental-strip-types src/lib/dataStatus.breadth.test.ts src/lib/services/breadthSetFreshness.test.ts
npm test
npx tsc --noEmit
npx eslint src/lib/dataStatus.ts src/lib/dataStatus.breadth.test.ts src/lib/services/breadthSetFreshness.test.ts
shasum -a 256 src/lib/engine/strategy.ts
```
