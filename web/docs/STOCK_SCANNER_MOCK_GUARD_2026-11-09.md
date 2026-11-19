# Stock scanner mock-mode guard (2026-11-09)

Written for: the project owner and maintainers.
Status: **implemented and verified.** Fixes the defect recorded in section 6 of `PROVENANCE_AND_FRONTEND_FINAL_COMPLETION_2026-11-09.md`. That report is left unchanged.

**Overall decision: live recommendation engine NO-GO.** This change stops the scanner from contacting Upstox outside Upstox mode. It does not validate any strategy or establish readiness.

---

## 1. The defect (as found)

`scanStocks` (`src/lib/engine/stockOpportunityEngine.ts`) obtained its token with `getAccessToken()` without checking `MARKET_DATA_PROVIDER`. Wherever `.data/upstox-token.json` existed, loading `/opportunities` in mock mode made real Upstox quote requests (`/v2/market-quote/quotes`) and daily-candle requests. Those requests were made during this session's isolated mock checks, before the fix. The count was not recorded. The application read the token file; it did not refresh, rotate or write it.

## 2. The fix

- `scanStocks` now calls `providerMode()` first. If the mode is not `upstox`, it returns `unavailableStockScan(kind, now)` immediately. That check comes before `getAccessToken()`, before any token-file read, before any analytics-token read and before any HTTP request. The check also comes before the injected `deps.quotes` and `deps.daily` functions.
- `unavailableStockScan` returns a result with `source: "UNAVAILABLE"`, `freshness: "UNAVAILABLE"`, no opportunities, and a reason saying the application is not in Upstox mode. No stock opportunity is fabricated.
- Upstox mode is unchanged. The scan code after the check is not modified.

## 3. Test changes

- **New:** `src/lib/engine/stockScanGuard.test.ts`, 6 tests (SG-1 to SG-6). They replace the token file with a sentinel file, set a sentinel analytics token, and observe every file read (through the default `fs` objects, with `syncBuiltinESMExports` so named imports see the patches) and every `fetch` call.
  - SG-1: mock mode returns UNAVAILABLE for intraday and swing, with no opportunities.
  - SG-2: mock mode reads neither the token file nor the analytics token.
  - SG-3: mock mode makes zero HTTP requests.
  - SG-4: mock mode does not call injected quote or daily dependencies.
  - SG-5: an empty, unknown, typo or fallback provider value is treated as not Upstox.
  - SG-6: in Upstox mode with injected fixtures, the normal path runs and makes no network request.
- **Four existing scanner fixture files changed** (test setup only; no assertion was changed): `src/lib/phase20.test.ts`, `src/lib/stockProvenance.test.ts`, `src/lib/stockSwingFreshness.test.ts`, `src/lib/services/phase11MarketReliability.test.ts`. Their fixtures inject every I/O dependency. Under the guard, they fail in the default mock mode, because the guard runs first. Each file now sets Upstox mode, points the token file at a nonexistent path and clears the analytics token, so they run as engine-logic tests with no token and no network. All 149 scanner fixture tests pass.
- Sanity check of the observer: in Upstox mode with a sentinel token, the token-file read was recorded (`tokenFileReadObserved: true`), and no fetch was made. So the mock-mode "no read" results are meaningful.

## 4. Verification

| Check | Result |
|---|---|
| Guard tests (`stockScanGuard.test.ts`) | 6 of 6 pass |
| Scanner fixture tests (149) | all pass |
| Full suite (`npm test`) | **2,403 pass, 0 fail, 0 skipped** |
| Typecheck (`tsc --noEmit`) | exit 0 |
| ESLint on changed files | no problems |
| Production build (isolated directory) | compiled; **0 Turbopack warnings** |
| Isolated browser, mock mode, desktop 1440×900 and mobile 390×844 | `/opportunities` header: "Data source (options): MOCK · stock scans: UNAVAILABLE". Horizontal overflow 0 px; console errors 0. |
| Server log of the isolated instance | **0 `upstox_request` entries** and 0 `upstox_fallback` entries after loading `/opportunities` at both widths |

The isolated browser instance used a token path that does not exist, so even a regression could not have made a request from it. The guard tests are the stronger proof. The log check is supporting evidence.

## 5. Boundaries

- **Live requests:** none were made for this change. The guard tests patch `fetch` and the file reads. The isolated browser instance was in mock mode with no token file. The main server on port 3123 was not used for `/opportunities`.
- **Token:** `.data/upstox-token.json` was not deleted, modified, rotated or refreshed. The guard tests use a sentinel file in a temporary directory, which is removed afterwards.
- **Strategy 11.4:** `src/lib/engine/strategy.ts` is unchanged. Its SHA-256 is `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18`, matching the frozen value in `src/lib/options/options.test.ts`.
- **Recommendation scoring, risk thresholds and unrelated trading logic:** not changed.
- **Journal and saved picks:** the 27 files under `.data/recommendations` and `.data/saved-picks` are byte-identical to the pre-change snapshot.
- **Historical data:** `.data/` and `.research-data/` were not modified.
- **Processes:** no collector, scheduler, paper runner or LaunchAgent was started or changed. The isolated instance was stopped and its temporary files removed.
- **Git:** nothing staged or committed.

## 6. Remaining limitations

1. The number of unintended Upstox requests made before this fix is unknown; the application log did not record them as a count.
2. Upstox-mode behaviour is verified by fixtures and by the existing scanner tests. It has not been exercised against live Upstox data, which this task did not permit.
3. The browser checks covered the mock configuration only.
4. Other code paths that read the token file in mock mode were not part of this request. Only `scanStocks` was changed. Any other such path should be reviewed separately.

**Live recommendation engine: NO-GO.** No strategy is validated, no candidate is VERIFIED, and recent data does not prove profitability.
