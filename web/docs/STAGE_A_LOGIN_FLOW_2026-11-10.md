# Stage A: login-to-logout check (mock, isolated token file)

**Result: 34 pass, 0 fail** at 1440 and 390 px (`tests/browser/login-logout.check.cjs`).

## What was checked
- Logged out: a protected page (`/saved-picks`) redirects to `/login` and keeps the return path.
- Wrong token: "Invalid operator token" shown; stays on login.
- Correct token: leaves login; `op_session` cookie is HttpOnly and SameSite=Strict.
- Operator token is not stored in localStorage or sessionStorage.
- Main pages load without an application error: `/`, `/opportunities`, `/option-chain` (NIFTY and BANK NIFTY), `/saved-picks`, `/recommendations`.
- Sign out lands on `/login`; the protected page redirects again; the session cookie is cleared.
- No page errors during the flow.

## Isolation (important)
- Logout clears the Upstox token file (`clearToken`). The default location is the real `.data/upstox-token.json`.
- The check ran on a server started with `UPSTOX_TOKEN_FILE` pointing to a scratch file.
- Verified afterwards: `.data/upstox-token.json` unchanged (502 bytes, same timestamp).
- The first attempt ran against the default location; it was stopped before the check started, so nothing was cleared.

## Environment notes
- Playwright's own browser cache was empty; the check uses the installed Google Chrome via `CHROME_PATH`. No download was made.

## Not covered
- Real Upstox token behaviour (no live requests permitted).
- Search, filters and tabs on the other list views (stage A item 1).
- The loading, stale, empty and error sweep across all dashboard pages (stage A item 2).
- Retiring `src/lib/testFixtures/mockSnapshotLegacyBreadth.ts` (stage A item 4).

## Full suite
- 2,713 tests: 2,712 pass, 0 fail, 1 skipped (F-R1). Type-check exit 0.

## Stage A: state sweep (loading, error, empty)

**Result: 20 pass, 0 fail** at 1440 and 390 px (`tests/browser/state-sweep.check.cjs`, mock server, scratch token file).

**Defects found and fixed (recommendation journal, on the home page)**
- While the list loaded, nothing was shown. Now: "Loading recommendations…".
- A failed list request was shown as "No recommendations found", which presents a failure as an empty journal. Now: an explicit alert, "Could not load recommendations…", and no empty message. Network errors are handled the same way.
- Code: `src/components/RecommendationJournal.tsx` (new `loadError` state; loading and alert rows).

**Checks that pass**
- Journal: loading text while the request is pending; explicit error on a failed request.
- Opportunities page: failed `/api/opportunities/*` requests render without an application error; normal load renders; no LIVE label on mock data.
- Option chain: failed expiry load shows the alert; the 31-row table still renders.
- Dashboard: failed `/api/breadth/*` does not break the page; Market Breadth card still renders.
- No page errors.

**Note on the first version of this check:** it targeted `/opportunity-journal`, which is server-rendered from local files and never calls `/api/recommendations`. The journal lives on the home page. One loading assertion also had a fallback that could never fail; it was replaced with a real check.

## Stage A: filters on list views

- Saved picks: search, type, source and status filters (done earlier, 39 browser checks).
- Recommendation journal: underlying, decision, status and day-range filters already exist in `RecommendationJournal.tsx`. They were not separately browser-tested in this step.

## Stage A: open items

- **Legacy mock-breadth test fixture.** `src/lib/testFixtures/mockSnapshotLegacyBreadth.ts` is still used by 17 test files. Retiring it means rewriting those tests against proper LIVE fixtures or changing their expectations, and that needs a review of each file. It is deferred, not done.
- **Journal filter browser test.** Add one browser assertion per filter. Small, not done.

## Full suite (after these changes)
- 2,713 tests: 2,712 pass, 0 fail, 1 skipped (F-R1). Type-check exit 0.

## Stage A: journal filter browser test (completed)

**Result: 20 pass, 0 fail** at 1440 and 390 px (`tests/browser/journal-filters.check.cjs`).

- Defaults: All underlying, 7d range pressed.
- Underlying: NIFTY pressed; BANKNIFTY not pressed.
- Decision: TRADE pressed; WAIT not pressed (one choice per group).
- Range: Today pressed, 7d not; All Time pressed.
- The journal still renders after filtering; no page errors.

**Change:** filter buttons in `RecommendationJournal.tsx` now expose `aria-pressed`, so the active filter is available to assistive technology.

**Scoping:** the check finds the journal's own `<section>` (the one containing "Journal Summary"), so other pages' buttons with the same text are ignored.

## Stage A status

| Item | Status |
|---|---|
| 1. Search, filters and tabs on list views | **Done**: saved picks (39 checks) and journal filters (20 checks) |
| 2. Loading, stale, empty and error sweep | **Done**: 20 checks; two defects fixed |
| 3. Login-to-logout and consistency | **Done**: 34 checks |
| 4. Retire legacy mock-breadth fixture | **Deferred**: needs a per-file review of 17 test files; recommended as a separate cleanup step |

Full suite after these changes: 2,713 tests, 2,712 pass, 0 fail, 1 skipped (F-R1). Type-check exit 0. The real Upstox token file is unchanged; the test server is stopped.

## Stage A item 4: legacy fixture retirement (scoped, not started)

- The legacy fixture (`src/lib/testFixtures/mockSnapshotLegacyBreadth.ts`) is imported by 17 test files, covering about 400 tests in total (largest: `paperSettlementLifecycle`, `phase10`, `phase13`, `phase14`, `paperTrading`).
- Retiring it means deciding, per file, whether each test should use a labelled LIVE-style breadth input or change its expectation. That needs review of each file's intent, so it is a 1–2 session task, not a single edit.
- Recommended approach: one file per step, run its tests after each step, and keep the full suite green before moving on.
- Until then the fixture stays. It reproduces the pre-change engine inputs exactly and does not affect app behaviour.

## Stage A item 4: fixture retained and renamed (decision changed)

- Checked file by file: with the plain mock snapshot, the tests that use the legacy fixture fail because they need a snapshot that **produces a trade** (for example PFC-1, which checks charges on a realised trade). Retiring the fixture would mean rewriting those tests, not just swapping an import.
- **Decision:** keep the fixture and rename it to `src/lib/testFixtures/mockSnapshotTradeInputs.ts`. Its comment states it is a test input, not market data.
- Renamed in 17 test files (import path and alias only; no assertion changed).
- Verification: type-check exit 0; full suite **2,713 tests, 2,712 pass, 0 fail, 1 skipped** (F-R1).
- Remaining debt: the trade-producing mock breadth input is still a LIVE label inside a test helper. A future cleanup can replace it with explicit trade-scenario fixtures.

## Stage A status (final)

All four items are complete in the form decided:
1. Search, filters and tabs on list views: done.
2. Loading, stale, empty and error states: done.
3. Login-to-logout and consistency: done.
4. Legacy fixture: kept as a named trade-input fixture (not retired); see above.
