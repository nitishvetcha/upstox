  # Final stabilisation and completion report (2026-11-08, second update)

  Written for: the project owner. **Status: partial.** Read the status key first. Nothing here is a browser-verified result unless it says so.

  ## Status key
  - **Completed:** the work is finished and its output exists.
  - **Verified:** a check was run and passed, with the output recorded below.
  - **Partial:** some of the work is done; the rest is listed.
  - **Blocked:** cannot proceed safely without a precise missing input, which is named.
  - **Not attempted:** not started in this session.

  > **CURRENT STATUS (sixth session, 2026-11-09). This block supersedes the summary table, sections 4–9 and all earlier addenda wherever they conflict.**
> - Responsive layout: **verified with Playwright** at 1440, 768, 390 and 375 px across 8 pages (32 checks). Horizontal overflow fixed (was 11 px on /options-research at 375 px); mobile menu added; undersized touch targets reduced from 19 (Overview) and 102 (Stock V2) to 0 and 2. The 2 remaining are the TradingView attribution logo injected by the chart library, deliberately unchanged.
> - Saved picks: **verified in an isolated Playwright run, 15/15**, earlier in this session. Real journal and saved-picks files unchanged (SHA-256).
> - MOCK-to-journal: **verified** at the generate route (real route call on the isolated MOCK server returned `journaled: false`, scratch journal empty). **Defect found and fixed:** the journal refresh route could write outcomes from MOCK data and could substitute the entry price when no current price existed. Now refused (HTTP 409/422) with 9 regression tests.
> - Turbopack warnings: **34 before, 0 after** (eighth session: owner-approved targeted `turbopackIgnore` comments on runtime data-path reads only; comments change no runtime behaviour; see the eighth addendum).
> - Refresh route: now a thin wrapper over `lib/services/journalRefreshService.ts`. Verified by 15 service tests (fixtures, no broker access) and by a real route call (MOCK → 409, repeated → 409, fixture journal file byte-identical).
> - Full suite now **2,342 / 0 fail**; typecheck 0; ESLint 0 errors / 77 warnings; build compiled, 34 warnings; credential scan 0 hits.
> - Strategy full-text reads: **not possible** with the tools available; classifications unchanged.
> - BSE SENSEX/BANKEX quote key: **blocked** pending owner approval for one controlled live request.
> - Full suite **2,327 pass / 0 fail**; ESLint **0 errors / 77 warnings**; typecheck **exit 0**; production build **compiled, 34 Turbopack warnings**; credential scan **0 hits**.
> - Live recommendation engine: **NO-GO**.
>
## Overall
  - **Live recommendation engine: NO-GO.** No validated strategy. No candidate is VERIFIED. Recent data does not prove historical profitability.
  - Git: nothing staged, committed, reset, cleaned, stashed or checked out.
  - Restricted items untouched: Strategy 11.4, H1–H5, A2, A3, all registered protocols, `.data/`, `.research-data/` historical records, `com.upstox.paperlive`, and the NSE collector (stopped, not restarted).

  ## 1. Summary table

  | Task | Status | Section |
  |---|---|---|
  | Browser verification of 8 pages, responsive layouts, console errors | **Not attempted** (HTTP route checks only: verified) | 5 |
  | Saved-picks browser checks (save, duplicate, delete, reload) | **Not attempted** in browser; API/persistence tests verified | 5 |
  | Data provenance audit end to end | **Partial** | 4 |
  | UPSTOX_INVALID_INSTRUMENT fix with regression tests | **Completed and verified** (10 new tests) | 3 |
  | Six index series feasibility | **Completed** (stored data only) | 2 |
  | NSE futures settlement definition | **Blocked:** official definition not found in public search results | 6 |
  | Invalid-OHLC investigation (321 rows) | **Completed**; classification unconfirmed | 6 |
  | Header normalisation (processing layer only) | **Completed** (mapping file; ZIPs unchanged) | 6 |
  | Turbopack warnings: identify exact modules | **Completed** | 7 |
  | Turbopack warnings: safe path refactor | **Not attempted** (designed below; needs per-store tests) | 7 |
  | Phase 11 source-quality review (full-text reads, SEBI primaries) | **Partial**: register and claims corrected; full texts not opened | 8 |
  | Full verification (tsc, ESLint, tests, build) | **Verified** (section 9) | 9 |
  | Git and security review | **Completed** (proposal; nothing staged) | 10 |

  ## 2. Index series feasibility (stored data only)
  Source: `web/.research-data/upstox-clean-2026-11-06-v1/` (cleaned daily series). Full report: `web/docs/INDEX_SERIES_FEASIBILITY_2026-11-08.md`.

  | Index | First–last session | Bars | Flat (O=H=L=C) bars | Duplicate days | Usable from (conservative) |
  |---|---|---|---|---|---|
  | NIFTY | 2000-01-03 – 2026-11-05 | 6,675 | 0 | 0 | 2000-01-03 |
  | BANKNIFTY | 2000-01-01 – 2026-11-05 | 6,666 | 1,369 | 4 | 2006-01-02 |
  | FINNIFTY | 2004-01-01 – 2026-11-05 | 5,675 | 2,032 | 4 | 2013-01-01 |
  | MIDCPNIFTY | 2022-01-10 – 2026-11-05 | 1,196 | 0 | 0 | 2022-01-10 |
  | SENSEX | 2000-01-03 – 2026-11-05 | 6,675 | 0 | 0 | 2000-01-03 |
  | BANKEX | 2002-01-01 – 2026-11-05 | 6,178 | 370 | 1 | 2004-01-01 |

  - Flat bars are whole years of constant prices with zero volume. They are treated as placeholders, and the cause is not confirmed.
  - All series: zero OHLC violations; zero non-zero volume (index volume is zero throughout).
  - Non-calendar dates (about 46 per series) and the BSE calendar for SENSEX and BANKEX are unresolved.
  - The check is feasibility only. It authorises no backtest.

  ## 3. UPSTOX_INVALID_INSTRUMENT
  - **Fix applied** in `web/src/lib/services/upstoxMarket.ts`, with types and labels updated in `web/src/lib/types.ts` and `web/src/lib/fallback.ts`.
    - A missing quote key raises `UPSTOX_QUOTE_MISSING`.
    - Classification uses HTTP status and documented codes only; the message-text match is removed.
    - `UDAPI100060` or a 404 raises `UPSTOX_NOT_FOUND`.
    - `UPSTOX_INVALID_INSTRUMENT` is reachable only through a documented-code list, which is **empty** because no such code has been verified.
    - Failed requests log endpoint, status, error code and instrument key.
  - **Regression tests:** `web/src/lib/services/upstoxErrorClassification.test.ts`, 10 cases, all pass. No live broker request was made.
  - **Still unknown:** the live endpoint behind the earlier reports. No stored log contains the label.
  - Details: `web/docs/UPSTOX_INVALID_INSTRUMENT_INVESTIGATION_2026-11-08.md`.

  ## 4. Provenance audit (partial)
  - Earlier work covered the stock provenance correction and the MOCK-prevents-LIVE rule.
  - This session: the instrument mapping and error labels were corrected (section 3). The end-to-end trace from source through API, service, engine and frontend for LIVE, END_OF_DAY, MOCK, RESEARCH and STALE was **not completed**.
  - Index mapping: the six instrument keys in the registry are `NSE_INDEX|Nifty 50`, `NSE_INDEX|Nifty Bank`, `NSE_INDEX|Nifty Fin Service`, `NSE_INDEX|NIFTY MID SELECT`, `BSE_INDEX|SENSEX` and `BSE_INDEX|BANKEX`. All six have stored daily series (section 2). Unsupported-instrument rejection was not separately tested.
  - **Blocked** for the rest: a full trace needs a bounded walk through each API route and its tests, which was not done.

  ## 5. Frontend, routes and saved picks

  ### Changes made (earlier in the session, still in place)
  - Opportunities: Swing cards under "Swing Stocks"; retired-positional notice in its own section; Decision Funnel showing engine counts only.
  - Options Engine: payoff reference line at the contract strike, not a hardcoded 24000.

  ### Verified
  - **Route checks (HTTP 200, running dev server):** `/`, `/opportunities`, `/options-audit`, `/options-research`, `/strategy-performance`, `/stock-v2`, `/options-engine`, `/recommendation-debug`, `/saved-picks`, `/market-history`, `/option-history`, `/opportunity-journal`, `/performance`, `/strategy-evidence`. This shows the routes respond; it does not show layout or behaviour.
  - **Saved-picks API and persistence** unit tests pass (earlier session).

  ### Not attempted
  - Browser checks of all eight sections at desktop, tablet and mobile widths against the reference PDFs.
  - Chart, loading, error and empty-state checks in the browser; browser console-error inspection.
  - Saved-picks in the browser: save of stock and option picks, duplicate protection, delete, reload persistence, and confirmation that the trading journal is untouched.
  - **Blocker for this session:** browser automation tools must be loaded and driven against a running dev server with isolated fixtures. That was not done in this session.

  ## 6. NSE futures settlement and the 321 invalid rows
  - Invalid rows: 321, all futures (318 stock, 3 index), none options. Violations: low above close (230), high below close (91). Median gap 0.16% of close; maximum 10.5%.
  - Example: METROPOLIS stock future, 2024-06-06, close equals settlement price and sits below the session low.
  - **Settlement definition: Blocked.** The public search returned no official definition of `ClsPric` or `SttlmPric`. The only related hit is an NSE circular (2 July 2026) on a new `.DAT` format from 6 July 2026; its content was not read.
  - Classification stays **unconfirmed** (likely source-definition effect, not corrupted data). The 321 rows stay excluded from range-based futures research.
  - Files: `web/docs/NSE_INVALID_OHLC_DIAGNOSTIC_2026-11-08.md`; row list `web/.research-data/nse-bhavcopy-processing-2026-11-08/invalid_ohlc_rows.csv`.

  ## 7. Turbopack warnings (34)
  - **Modules identified (completed):**
    - `src/lib/stockV2Dashboard.ts` (reads `.research-data/intraday-bars-historical`, a dynamic `readdirSync` of about 12,012 files)
    - `src/lib/services/liveOpportunityCollector.ts` (`.data/collection-logs`, about 22,355 files)
    - `src/lib/services/paperTradeMonitorRunner.ts` (`.data/monitor-logs`, about 23,507 files)
    - `src/lib/optionsAuditReport.ts` (`options-audit` directory)
    - `src/lib/research/inventoryStore.ts`, `src/lib/services/opportunityTrackingStore.ts`, `src/lib/services/paperOpportunityStore.ts`, `src/lib/services/recommendationStore.ts`, `src/lib/services/sessionEvidenceStore.ts`
  - **Cause:** each module builds a runtime data directory path from `process.cwd()` or an environment variable, then lists or reads it with `readdirSync`/`readFileSync` on a variable path. Turbopack traces the whole project for these reads.
  - **Refactor (not applied):** route each store through one helper that returns a fixed, explicit directory and keeps the existing environment-variable override. The file discovery logic stays the same. Each store needs its existing tests run before and after. Blanket `turbopackIgnore` comments were not used.
  - **Status:** the 34 warnings remain. This is **not attempted** in code.
  - Historical files were not moved, rewritten or migrated.

  ## 8. Phase 11 source-quality review (partial)
  - Deliverables from earlier are in `web/docs/strategy-research-2026-11-08/`.
  - **Not done in this session:** full-text reads of the NSE Nifty200 Momentum 30 methodology and whitepaper, Daniel and Moskowitz (Momentum Crashes), Moskowitz, Ooi and Pedersen (Time Series Momentum), and the full Indian covered-call papers (R9, R10). SEBI primary reports were also not opened.
  - The source register still records each source as snippet-only or secondary, and the classifications stay conservative. No candidate is VERIFIED.
  - No protocol was drafted or registered.
  - **Blocked** for full reads: the sources are behind publisher paywalls or were not reachable in search results; the register lists which ones need an authorised copy.

  ## 9. Verification results (this session)
  - Typecheck (`tsc --noEmit`): **exit 0**.
  - ESLint on the changed files: 0 errors; 2 warnings on `src/lib/services/upstoxMarket.ts` (unused type imports). The same import line exists in the committed version, so these predate this session.
  - Full project ESLint from earlier: 0 errors, 86 warnings (not re-counted after later edits).
  - Tests (`npm test`): **2,304 pass, 0 fail, 0 skipped** (2,294 earlier, plus 10 new classification tests).
  - Storage tests: no storage code was changed, so the storage test run was not separately repeated. The full suite includes them.
  - Production build (`NEXT_DIST_DIR=.next-stabilise-verify-2026-11-08b`): **exit 0**; compiled; **34 Turbopack warnings**, unchanged.
  - Browser checks: **not performed** (section 5).
  - Provenance tests: the 10 new classification tests cover the instrument-error paths; the full provenance test set was not separately run.

  ## 10. Git status and proposed commit groups (nothing staged)
  Working tree: 112 modified, 9 deleted, 185 untracked (plus the new files from this session).

  1. **Repository hygiene:** `web/.gitignore` (add `/.next-*/`, `/playwright-report/`, `/test-results/`); root `.gitignore` (add `web/.research-data/`). Exclude `web/AGENTS.md` generated markers unless you want them committed.
  2. **Application correctness, index mapping and provenance:** `web/src/lib/services/upstoxMarket.ts`, `web/src/lib/services/errors.ts` (if changed), `web/src/lib/types.ts`, `web/src/lib/fallback.ts`, and `web/src/lib/services/upstoxErrorClassification.test.ts`. Also the engine and service files not yet reviewed.
  3. **Saved picks:** `web/src/lib/savedPicks.ts` and test, `web/src/app/api/saved-picks/`, `web/src/app/saved-picks/`, `web/src/components/SavePickButton.tsx`, `web/src/lib/savedPickMapping.ts`.
  4. **Research and evidence:** `docs/protocols/`, `web/scripts/nse-bhavcopy-sweep-v2.py`, `web/scripts/nse-bhavcopy-verify.py`, `web/scripts/crosssectional-*.py`, `web/docs/NSE_*.md`, `web/docs/INDEX_SERIES_FEASIBILITY_2026-11-08.md`, `web/docs/strategy-research-2026-11-08/`. Raw `.research-data/` is **excluded**.
  5. **Documentation, configuration and tooling:** other docs, `web/package.json`, lockfile, ESLint config, `.env.example`, and `web/next.config.ts` (adds `distDir` from `NEXT_DIST_DIR`; include only if you want that behaviour).
  6. **Opportunities rewrite and route-group migration:** `web/src/app/(dashboard)/`, `web/src/app/(research)/`, and the nine root-page deletions. Keep separate.

  ### Security review
  - A scan of changed files found no credential-like values (earlier scan; re-run recommended before commit).
  - `web/scripts/check-research-token.ts`: reads the token state through `getAccessToken()` (environment variable `UPSTOX_ANALYTICS_TOKEN`, or `.data/upstox-token.json`). No network call, no refresh. Prints only `CREDENTIAL_AVAILABLE` or `CREDENTIAL_MISSING`. It is untracked and **needs your review** before it is committed.
  - Excluded from every group: `.data/`, `.research-data/`, `.next*` build outputs, secrets.

  ## 11. Remaining limitations
  - No browser verification (sections 5 and 9).
  - Provenance end-to-end audit incomplete (section 4).
  - Turbopack warnings unchanged; refactor designed, not applied (section 7).
  - NSE futures settlement definition unconfirmed; 321 rows excluded from range-based research (section 6).
  - Index series: flat placeholder bars in early years; 2015 duplicate days; non-calendar dates; BSE calendar not verified (section 2).
  - Survivorship bias in the equity universe (current listings only) unresolved.
  - No options bid, ask, IV or Greeks in the bhavcopy.
  - Strategy sources: several read from snippets only (section 8).

  ## 12. Recommended next steps
  1. Browser-verify the eight pages and saved picks against isolated fixtures, with console-error checks.
  2. Run a bounded provenance trace for LIVE, END_OF_DAY, MOCK, RESEARCH and STALE, with tests for each.
  3. Refactor the five storage modules to explicit directory helpers, one at a time, with their tests.
  4. Read NSE's official F&O bhavcopy specification and the July 2026 `.DAT` circular before the next collection.
  5. Fix the 2015 duplicate days and confirm the flat early-year bars against an independent source before any index test.
  6. Full-text reads of the momentum and covered-call sources before any protocol decision.

  ## 13. GO/NO-GO
  - **Live recommendation engine: NO-GO.** No validated strategy; no VERIFIED candidate; the project's protocols show no validated edge; browser verification and the provenance audit are incomplete.

  ---

  ## Addendum (third session): what was checked and what was not

  ### Browser checks (desktop, live dev server, no fixtures)
  - Pages loaded and their text was read: Overview `/`, Opportunities, Options Data Audit, Options Research Lab, Strategy Performance, Stock V2 Research, Options Engine, System Health. **All eight returned page content; console error check reported no errors on each page.**
  - Labels observed: LIVE (news), STALE (market, option chain, technical), UNAVAILABLE (breadth), MOCK (not shown on these pages), RESEARCH and NOT VALIDATED (Opportunities, Options Engine, Strategy Performance). Each NO TRADE carries its reason.
  - Screenshots: `/opportunities` at desktop width, saved to the browser tool's screenshot folder. Visual inspection at that resolution was limited.
  - **Responsive check: inconclusive.** Resizing the browser window to 390 px did not change the layout in the captured screenshots; the desktop sidebar stayed visible. Tablet and mobile are therefore **not verified**.

  ### Findings from the browser pass
  1. **UPSTOX_INVALID_INSTRUMENT root cause (now identified).** The System Health server log shows `/v2/market-quote/quotes` returning HTTP 400 for **SENSEX and BANKEX** with the message "One of either symbol or instrument_key is invalid." These are the BSE indices. The historical endpoint served the same index keys (`BSE_INDEX|SENSEX`, `BSE_INDEX|BANKEX`) and stored data exists for both, so the quote endpoint probably needs a different key or symbol form for BSE indices. **Not verified:** the correct form needs one live request, which was not made. The log lines that carry the old label were written before the fix. After the fix they would be reported as `UPSTOX_API_ERROR` with the message kept.
  2. **Stale logs shown as current.** System Health displays "RUNNER AND SUPERVISOR OUTPUT" and "SERVER ERRORS" from log files dated 30 Oct 2026 without an age label. **Not fixed.**
  3. **Options Research Lab shows BANKNIFTY history "from 2000-01-01" without flagging the flat placeholder years** identified in the index feasibility check. **Not fixed.**
  4. **Options Engine "Stored research round" shows data 4,521 minutes old and labels it "STORED RESEARCH · NOT LIVE".** This labelling is correct.
  5. The Overview chart area showed "Loading candles…" when the text was captured. The screenshot was not checked for completion. **Open.**

  ### Saved picks in the browser: not performed
  The running server writes saved picks to the default file `.data/saved-picks/picks.json`, which is application data. The isolated-storage test needs a second server started with `SAVED_PICKS_FILE` pointing at a temporary file. This was not done. API and persistence unit tests from earlier pass.

  ### Not done in this session
  - Provenance trace end to end (source → API → service → engine → recommendation → frontend).
  - Turbopack refactor of the five storage modules. The plan in section 7 stands.
  - Index data-quality follow-up: the 2015 duplicate days were identified but not resolved, and the BSE calendar was not verified (no BSE session list is stored).
  - Full-text reads of strategy sources and SEBI primary reports.
  - Changed-file security scan re-run.

  ### Verification run in this session
  - Typecheck, full test suite (2,304 pass, 0 fail), production build (34 Turbopack warnings unchanged): recorded in section 9. No code changed after those runs.

  ### Status
  - Live recommendation engine: **NO-GO.** Unchanged.

  ---

  ## Addendum (fourth session, 2026-11-09)

  ### Completed and verified
  - **Item 4, System Health log age.** Each log panel now shows the file's last-written time, its age, the latest ISO timestamp found in the tail, and a CURRENT or STALE label (STALE after 24 h). Logic in `src/lib/ops/logAge.ts`; 7 tests pass (`logAge.test.ts`). Logs are read only; none was changed or deleted.
  - **Item 5, index-history presentation.** The Options Research Lab shows, for all six indices, the raw start, the conservative usable start, placeholder-period warnings, and duplicate-session dates. Source constants in `src/lib/research/indexHistoryQuality.ts`; 7 tests pass. Original datasets are untouched.
  - **Item 6, Overview chart.** The chart API returns 120 valid points for 5m, 15m and 1d. The browser now shows the chart with "Source UPSTOX (LIVE), last 120 candles". The earlier "Loading candles…" was the state before the response arrived. The chart's error path already labels failures "Request failed"; no defect was found there.
  - **Console defect fixed (new).** Duplicate React keys in the news list, caused by article ids (URLs) that repeat within one feed. The list key now includes the position. Browser console shows no errors after reload.
  - **Item 3, SENSEX/BANKEX quote investigation (partial).** Evidence: the quote endpoint rejects `BSE_INDEX|SENSEX` and `BSE_INDEX|BANKEX` with "symbol or instrument_key is invalid", while the historical endpoint accepts the same keys (its error was a date-range error). The stored "BSE" files are BSE Ltd equity, not index data, so they say nothing about index keys. **The correct quote-key form is not established.** Fixing it needs one controlled live diagnostic request, which needs your approval. Nothing is marked fixed.

  ### Verification
  - Changed-file credential scan: 0 hits.
  - Typecheck: exit 0. ESLint on changed files: no problems. Project-wide ESLint: 0 errors, 77 warnings.
  - Full test suite: **2,318 pass, 0 fail, 0 skipped.**
  - Production build (`NEXT_DIST_DIR=.next-stabilise-verify-2026-11-09`): compiled; **34 Turbopack warnings, unchanged.**
  - Browser: Overview, chart and news checked live; market was open, so labels read LIVE.

  ### Not done
  - **Responsive (tablet 768 px, mobile 390/375 px).** Not verified. The browser resize did not change the viewport (`innerWidth` stayed 1920), so this tool cannot emulate device widths.
  - **Saved picks in the browser on an isolated server.** Not run.
  - **Turbopack refactor.** Not started. The five modules and the helper design are in section 7 above.
  - **Provenance end-to-end audit.** Not completed.
  - **Source full-text reads (item 9).** Not done. These need document access beyond the search tool.
  - **BSE quote-key fix.** Waiting on your approval for one controlled live request.

  ### Environment
  - The dev server had stopped; I restarted it on port 3123. It runs the app only, not the paper runner or any collector.

  ### Status
  - Live recommendation engine: **NO-GO.** Unchanged.
  - Git: nothing staged or committed.

---

## Addendum (fifth session): supersedes earlier responsive and saved-picks statements

### Saved picks, isolated browser test: completed and verified
- Tool: Playwright (Chromium) against a temporary dev server on port 3125, started with `MARKET_DATA_PROVIDER=mock`, `SAVED_PICKS_FILE` pointing at a scratch file and a separate build directory. The real saved-picks file was never used.
- Result: **15 of 15 checks pass.** Covered: stock save (201), option save as INDEX_OPTION (201), duplicate save of the same stock (409, message shown, no second record), MOCK save labelled "MOCK DATA: NOT VALIDATED", reload persistence, deletion of the option pick, deletion persisted after reload, RESEARCH rows labelled NOT VALIDATED, and no console errors other than the expected 409 from the deliberate duplicate.
- Real journal and saved-picks files: SHA-256 snapshot before and after **unchanged (27 files)**.
- Results: `scratchpad/saved-picks-results.json`; screenshot `scratchpad/saved-picks-1440.png`.
- Cleanup: the temporary server was stopped, its build directory and scratch picks file were removed. The main dev server on 3123 is still running.
- Limit: MOCK rows were saved through the form and labelled; the test does not show that MOCK data is excluded from the real journal at the recommendation level (see provenance, below).

### Responsive layout, Playwright viewports: completed, with defects found
- 8 pages × 4 viewports (1440×900, 768×1024, 390×844, 375×812) = **32 checks**, measured by Playwright's real viewport, not window resizing.
- **Horizontal overflow:** 0 px on 31 of 32 checks. **One defect:** `/options-research` at 375 px overflows by 11 px. The widest overflowing element is an anchor from the sidebar (`src/components/Sidebar.tsx`). **Cause not isolated; not fixed.**
- **Sidebar:** present and visible at all widths. It does not collapse to a mobile menu, so on phones it takes up layout space. **Design limitation; not changed** (no redesign was requested).
- **Touch targets (below 24 px):** the Overview has 19 and Stock V2 has 102. These do not overflow, but they are below the 24 px minimum (WCAG 2.5.8). **Not fixed.**
- **Console errors:** 0 on all 32 page loads.
- **Limit:** the check measures layout; it does not confirm the look of each page. Screenshots were saved for the desktop, tablet and 390 px views (`scratchpad/resp-*.png`) but were not reviewed visually in this session.
- Results: `scratchpad/responsive-results.json`.

### Provenance: partial, no new defects found in this session
- Not re-traced end to end in this session. The chart and news fixes from the fourth session were verified in the browser.
- **Open:** MOCK exclusion from the real recommendation journal was not tested here; the isolated test only confirmed the label.

### Turbopack and strategy sources: not attempted
- Turbopack: the five modules and the helper design are unchanged from section 7. No refactor was done in this session. The 34 warnings remain.
- Strategy sources: full-text reads were not possible with the search tool used. The source register keeps each source at its existing read depth.

### Verification in this session
- Typecheck (`tsc --noEmit`): exit 0 (run after cleanup).
- Credential-pattern scan of changed files: **0 hits.**
- No code was changed in this session, so the fourth-session results still stand: full test suite **2,318 pass, 0 fail**; ESLint 0 errors, 77 warnings; production build compiled with **34 Turbopack warnings**.

### Blocked
- BSE SENSEX/BANKEX quote-key format: unverified. Needs owner approval for one controlled live diagnostic request. No request was made and no key was guessed.

### Git and status
- Nothing staged, committed, reset, cleaned, stashed or checked out.
- Live recommendation engine: **NO-GO.** Unchanged.

---

## Addendum (sixth session, 2026-11-09)

### 1. Responsive defects: fixed and verified (Playwright, 8 pages × 4 viewports = 32 checks)
- **A. Horizontal overflow.** Measured, not guessed: the 11 px overflow on `/options-research` at 375 px came from the "Field availability" table, which had no scroll wrapper. The sidebar was not the cause (its links are clipped by their own scroller). Fix: the table is wrapped in `overflow-x-auto`, the same pattern the page already used for its other table. No global `overflow-x: hidden`. Result: **0 px overflow on all 32 checks.**
- **B. Mobile navigation.** `src/components/Sidebar.tsx`: below 768 px a menu button (aria-label, aria-expanded, aria-controls) opens a vertical list of all links; Escape closes it and returns focus to the button; navigation closes it. Desktop and tablet (768 px and up) keep the sidebar unchanged. **12/12 navigation checks pass** (open/close, aria state, Escape, keyboard Enter, navigation to a page, menu closes after navigation, sidebar visible at 768 and 1440 px, toggle hidden at 768 and 1440 px).
- **C. Touch targets (below 24 × 24 CSS px).** Added hit-area padding (`min-h-[24px]` and padding), without changing visual icons: chart timeframe toggle (`PriceChart.tsx`), journal filter chips (`RecommendationJournal.tsx`), "What does this score mean?" disclosure (`RecommendationCard.tsx`), "details" link (`OpsPanel.tsx`), MOCK status link (`TopBar.tsx`), Stock V2 strategy chips and per-trade "chart" links (`stock-v2/page.tsx`). **Overview: 19 → 0. Stock V2: 102 → 2. System Health: 2 → 0.** The 2 remaining on Stock V2 are the TradingView attribution logo (an `svg` link injected by the charting library). It is left unchanged because the attribution is part of the library's terms.
- **Console errors:** 0 on all 32 page loads.
- **Limit:** layout is measured programmatically; screenshots were saved but not visually reviewed in this session.

### 2. Provenance audit: defect found and fixed; MOCK exclusion verified at the route
- **Trace checked:** source (`market.getSnapshot`, which may fall back to mock) → `hasMockInput` (`mockInputs.ts`) → generate route → journal (`recommendationStore.saveJournalEntry`) → refresh route → frontend.
- **MOCK-to-journal exclusion: verified** by calling the real generate route on an isolated MOCK server with a scratch journal directory (`RECOMMENDATION_STORE_DIR`). Response: `journaled: false`, `decision: NO_TRADE`. Scratch journal: 0 files. The real journal and saved-picks files were not touched (SHA-256 unchanged).
- **Defect found: `POST /api/recommendations/[id]/refresh`.** It fetched a snapshot and wrote a new outcome into the journal without checking whether the snapshot was MOCK. It also used `side.ltp || side.ask || entry price`, so a missing price silently became the entry price, which is then presented as the current price. **Fixed:** the price logic moved to `src/lib/services/journalRefresh.ts` (`resolveRefreshPrice`). It refuses MOCK or fallback input (HTTP 409), refuses a contract missing from the current chain or without a positive price (HTTP 422), and never substitutes the entry price. Successful refreshes are unchanged.
- **Tests:** `journalRefresh.test.ts`, 9 cases (JR-1 to JR-9): genuine quote used; MOCK subsystem refused even with a price; fallback refused; zero last price falls through to ask; no positive price is an error; contract missing is an error; no contract is an error; strike lookup selects the correct side; MOCK refused even when the contract is missing.
- **Limit:** the refresh route itself was not exercised end to end. Creating a journal entry to refresh needs genuine (non-MOCK) data, which this environment does not have. The helper is tested directly and the route change was verified by typecheck and build only.
- **Other journal writers:** `paper-trade` and `paper-trading/enter` only link an existing entry to a paper trade; they do not write outcomes. Saved picks use a separate file and labels (verified in the browser).
- **Not verified in this session:** STALE data becoming "current" in every panel; the complete trace for RESEARCH results shown as live recommendations (the saved-picks and Options Engine labels were checked earlier; no new run).

### 3. Turbopack warnings
- **Before: 34. After: 34.** Not refactored in this session. Reason: each module needs its own before-and-after test run and an explicit-path helper, and the refactor was not completed. Plan unchanged (section 7). No `turbopackIgnore` or other suppression was used.

### 4. Strategy source review
- No new full-text access in this session. Source register classifications are unchanged. No protocol, validation, holdout or backtest was run.

### 5. Verification (final code)
| Check | Result |
|---|---|
| Typecheck (`tsc --noEmit`) | exit 0 |
| ESLint, full project | **0 errors, 77 warnings** (earlier 2 unused-import warnings in `upstoxMarket.ts` predate this work) |
| Full test suite (`npm test`) | **2,327 pass, 0 fail, 0 skipped** |
| Production build (`NEXT_DIST_DIR=.next-stabilise-verify-2026-11-09b`) | compiled; **34 Turbopack warnings** |
| Saved-picks isolated Playwright | 15/15 (earlier this session; code not changed since in saved-picks files) |
| Responsive Playwright, 8 pages × 4 viewports | 32 checks, 0 overflow, 0 console errors, 0 load errors |
| Navigation Playwright | 12/12 |
| Touch-target measurement | 0 undersized on Overview and System Health; 2 on Stock V2 (third-party attribution logo) |
| Credential-pattern scan, changed files | **0 hits** |
| Real journal and saved-picks checksums | unchanged (27 files) |

### 6. Files changed in this session
- `src/components/Sidebar.tsx` (mobile menu)
- `src/components/OpsPanel.tsx`, `src/components/TopBar.tsx`, `src/components/PriceChart.tsx`, `src/components/RecommendationJournal.tsx`, `src/components/RecommendationCard.tsx` (hit areas)
- `src/app/(research)/options-research/page.tsx` (table wrapper)
- `src/app/(research)/stock-v2/page.tsx` (hit areas)
- `src/app/api/recommendations/[id]/refresh/route.ts` (MOCK refusal and no price substitution)
- `src/lib/services/journalRefresh.ts` and `src/lib/services/journalRefresh.test.ts` (new)
- Earlier in the fourth session: `src/components/NewsPanel.tsx`, `src/lib/ops/logAge.ts`, `src/lib/ops/logAge.test.ts`, `src/lib/research/indexHistoryQuality.ts`, `src/lib/research/indexHistoryQuality.test.ts`, `src/components/OpsDetails.tsx`
- Earlier in the third session and before: as listed in sections 3, 5 and 9.
- Outside the project (scratchpad, not in Git): Playwright scripts and result files.

### 7. Git status
- Nothing staged, committed, reset, cleaned, stashed or checked out. `git status` now lists 318 changed or untracked entries (earlier counts of 112 modified, 9 deleted and 185 untracked are superseded). The commit-group proposal in section 10 still applies; the sidebar and page files belong in group 6 (route and layout) and the journal refresh files in group 2.

### 8. Remaining limitations
- Turbopack: 34 warnings remain; refactor not done.
- BSE SENSEX/BANKEX quote key: unverified; needs owner approval for one controlled live diagnostic request. No request was made.
- Refresh route: the change is verified by helper tests, typecheck and build, not by an end-to-end run.
- Strategy sources: full-text reads not possible with the available tools.
- Responsive: layout measured programmatically; screenshots not visually reviewed.
- Provenance: a full trace for STALE and RESEARCH displays was not re-run this session.

### 9. Final status
- **Live recommendation engine: NO-GO.** No validated strategy, no candidate VERIFIED, and recent data does not prove profitability.


---

## Addendum (seventh session, 2026-11-09)

### 1. Turbopack: investigated, not refactored, decision needed
- **Warned reads** (from the build log): `readdirSync(dir)` and `readFileSync(path.join(dir, file))` in `optionsAuditReport.ts`, plus equivalent calls in `liveOpportunityCollector.ts`, `paperTradeMonitorRunner.ts`, `stockV2Dashboard.ts`, and the store modules. In each case the directory is a runtime value, from `process.cwd()` or an environment override such as `APP_DATA_DIR`, `COLLECTION_LOG_DIR`, `MONITOR_LOG_DIR` or `RECOMMENDATION_STORE_DIR`.
- **Why no change was made:** the warning is triggered by any directory listing or read whose path is only known at runtime. Keeping the environment overrides, file discovery and ordering means those reads stay dynamic, so the warnings stay. The only ways to make them disappear are a suppression comment (not permitted by your instructions) or a change to storage behaviour (also not permitted). I did not make either change.
- **Existing precedent:** `src/lib/dataRoot.ts` already contains a targeted `turbopackIgnore` on the runtime data path. That was in the codebase before this session and was not added by me.
- **Decision needed from the owner:** add targeted, per-call-site `turbopackIgnore` on the runtime-data reads (a documented Next.js mechanism that does not change behaviour), or accept the 34 warnings as a known build artefact. Until you decide, the warning count is **34 before and 34 after**, and I have not claimed any reduction.
- **Modules left unchanged:** all five storage modules and all other storage files.

### 2. Refresh route: complete decision path verified
- **Refactor:** the route now calls `refreshJournalOutcome(id, deps)` in `src/lib/services/journalRefreshService.ts`. The data functions (`getJournalEntry`, `getSnapshot`, `updateJournalEntry`, `computeOutcome`) are injected. The route passes in the real functions.
- **Guards, in order:** 404 for an unknown id; non-trade and closed entries returned unchanged with no market fetch; MOCK or fallback input → 409; any option-chain source other than `LIVE` (STALE, END_OF_DAY, UNAVAILABLE) → 422 `CHAIN_NOT_LIVE`; contract missing or without a positive price → 422, no entry-price substitution; only then is the outcome computed and written. A failed write returns 500 with `journalUpdated: false`.
- **Tests:** `journalRefreshService.test.ts`, 15 cases (RS-1 to RS-15), using test fixtures only: refusals write nothing; a live price writes once; only `status` and `outcome` are patched; repeated refresh targets the same entry with the same patch (no duplicates); a failed or throwing write does not retry. Plus `journalRefresh.test.ts`, 9 cases. **24 of 24 pass.**
- **Real route, fixture journal, isolated MOCK server:** a fixture trade entry (marked as a test fixture) was placed in a scratch journal directory. Two refresh calls and a third returned **HTTP 409, `MOCK_INPUT`, `journalUpdated: false`**. The fixture file was byte-identical afterwards.
- **Not verified, and why:** HTTP 422 for a missing price, the valid-price write through the route, and STALE chains through the route all need a non-MOCK snapshot. This environment has only a live Upstox provider and a MOCK provider, and I didn't make a live broker request. These paths are verified by the service tests only; the route wiring for them is verified by typecheck and build, not by a live run.

### 3. Provenance: both paths enforce the same rules
- **Generation** (`recommendations/generate`): MOCK input is never journaled (verified by a real route call earlier: `journaled: false`, scratch journal empty).
- **Refresh** (`recommendations/[id]/refresh`): MOCK is refused before any write, as above.
- **Missing prices:** refused in both paths. The refresh path no longer substitutes the entry price.
- **Research and live separation:** the Options Engine labels stored research as "STORED RESEARCH · NOT LIVE" (checked in the browser earlier).
- **STALE:** refresh now refuses a non-LIVE option chain. The Overview and System Health show STALE labels (checked in the browser earlier).
- **Gaps not covered by new tests:** the generation path's MOCK exclusion is tested through the existing helper (`mockExecutionGuard.test.ts`) and one real route call, not a full unit test of the route.

### 4. Strategy sources
- No full-text copies are available locally, and I did not repeatedly query inaccessible publishers. Classifications are unchanged. The documents that need an authorised copy are: the NSE Nifty200 Momentum 30 methodology and whitepaper (NSE Indices), Daniel and Moskowitz, "Momentum Crashes" (NBER w20439 and JFE 2016), Moskowitz, Ooi and Pedersen, "Time Series Momentum" (JFE 2012), Misra and Dalmia's covered-call study (Management Dynamics, 2007), Aggarwal's covered-call study (Asia-Pacific Business Review, 2011), and the SEBI F&O study reports (January 2023 and September 2024). No protocol was created.

### 5. Verification (final code)
| Check | Result |
|---|---|
| Typecheck | exit 0 |
| ESLint, full project | 0 errors, 77 warnings |
| Full test suite | **2,342 pass, 0 fail, 0 skipped** |
| Production build (`NEXT_DIST_DIR=.next-stabilise-verify-2026-11-09c`) | compiled; **34 Turbopack warnings** |
| Refresh-route service tests | 15/15 (plus 9 helper tests) |
| Real route, fixture journal, MOCK server | 409 ×3, journal file unchanged |
| Real journal and saved-picks checksums | unchanged (27 files) |
| Credential-pattern scan, changed files | **0 hits** |

### 6. Files changed in this session
- `src/app/api/recommendations/[id]/refresh/route.ts` (thin wrapper over the service)
- `src/lib/services/journalRefreshService.ts` and `src/lib/services/journalRefreshService.test.ts` (new)
- No storage modules changed. No `.data/` or `.research-data/` files changed. Isolated-server scratch directories were removed.

### 7. Git status
- Nothing staged, committed, reset, cleaned, stashed or checked out. `git status` lists 320 changed or untracked entries.

### 8. Final status
- **Live recommendation engine: NO-GO.** The refresh protections are verified in tests and on the real route for MOCK input only. A live, non-MOCK end-to-end run has not been performed. Recent data does not prove profitability.


---

## Addendum (eighth session, 2026-11-09): Turbopack warnings resolved by owner-approved targeted comments

### Directive check
- **Installed Next.js:** 16.4.5. The installed docs (`node_modules/next/dist/docs/01-app/03-api-reference/08-turbopack.md`, `02-guides/lazy-loading.md`) document `/* turbopackIgnore: true */` as a magic comment for skipping bundling of imports. They do **not** describe its use on filesystem calls. The build warning text itself recommends `fs.readdirSync(/*turbopackIgnore: true*/ ...)`, which is the form used here. The alternative `turbopack.ignoreIssue` (config) was not used: it hides output rather than marking the code.
- **Scope:** comment-only edits, placed on the argument of each flagged call. No environment variable, path, file-discovery order, file format, read/write call, or error handling was changed. Each call still runs once, in the same place.

### Call sites modified (all comments added; no code logic changed)
| File | Calls annotated |
|---|---|
| `src/lib/optionsAuditReport.ts` | `readdirSync(dir)`; `path.join(dir, mapFile)` |
| `src/lib/services/liveOpportunityCollector.ts` | `path.join(collectionLogDir(), …)` in write; `existsSync`, `readdirSync`, `readFileSync(path.join(…))` in list |
| `src/lib/services/paperTradeMonitorRunner.ts` | `path.join(dir, …)` in write; `existsSync`, `readdirSync`, `readFileSync(path.join(…))` in list |
| `src/lib/services/opportunityTrackingStore.ts` | `existsSync`, `readdirSync`, `readFileSync(path.join(dir(), f))` |
| `src/lib/services/paperOpportunityStore.ts` | two list functions: `existsSync`, `readdirSync`, `readFileSync(path.join(dir, f))` ×2 |
| `src/lib/services/sessionEvidenceStore.ts` | `existsSync`, `readdirSync`, `readFileSync(path.join(dir, f))` |
| `src/lib/research/inventoryStore.ts` | `readdirSync(dir)`; `readFileSync(path.join(dir, f))` |
| `src/lib/services/recommendationStore.ts` | `process.env.RECOMMENDATION_STORE_DIR` argument of `path.resolve` (value unchanged) |
| `src/lib/stockV2Dashboard.ts` | `readFileSync(path.join(HIST_DIR, f))` |

Not modified: `src/lib/dataRoot.ts` (already had a targeted `turbopackIgnore` before this session); all other storage files; every `.data/` and `.research-data/` file.

### Warning count, step by step (production build after each module)
| Step | Warnings |
|---|---|
| Baseline | 34 |
| `optionsAuditReport.ts` | 31 |
| `liveOpportunityCollector.ts` | 25 |
| `paperTradeMonitorRunner.ts` | 19 |
| `opportunityTrackingStore.ts` + `paperOpportunityStore.ts` (built together) | 7 |
| `sessionEvidenceStore.ts` | 3 |
| `inventoryStore.ts`, `recommendationStore.ts`, `stockV2Dashboard.ts` | **0** |

The final log contains no warning text (checked with a case-insensitive search for "warn"). The count reached 0 because each flagged call was annotated, not because any call was removed.

### Storage tests before and after
- Baseline and after each module, the relevant existing test files were run: options-audit (45), collector and runner-related (293), monitor (97), opportunity tracking (32), paper opportunity (263), session evidence (62), inventory/recommendation/stock-V2 (274). **All passed at each step.**
- Full suite after the last change: **2,342 pass, 0 fail, 0 skipped.**

### Verification of the no-change claim
- Typecheck: exit 0.
- ESLint, full project: 0 errors, 77 warnings (unchanged from earlier; none added by these edits).
- Production build (`NEXT_DIST_DIR=.next-stabilise-verify-final`): compiled; **0 warnings**.
- Real journal and saved-picks checksums (27 files): unchanged. No `.data/` or `.research-data/` file was touched.
- Credential-pattern scan of changed files: **0 hits**.

### Refresh route, strategy sources and BSE
- Unchanged from the seventh session. The refresh route's non-MOCK paths remain verified by service tests only. Strategy full-text reads remain blocked. The BSE quote-key question remains blocked pending a separate approval for one controlled live request.

### Git
- Nothing staged, committed, reset, cleaned, stashed or checked out. `git status` lists 320 changed or untracked entries.

### Status
- **Live recommendation engine: NO-GO.** Unchanged. The Turbopack change is a build-tooling annotation and does not alter any recommendation, journal or data behaviour.
