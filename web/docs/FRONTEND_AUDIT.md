# Frontend audit (2026-11-10)

Environment: isolated mock server (127.0.0.1:3150), process sandbox, browser request routing blocks every non-localhost host. The browser was not run inside the OS sandbox.

## 1. Mechanical checks (14 routes at 1440, 768, 390 px)
| Check | Result |
|---|---|
| HTTP 200 | **PASS** (42 of 42) after fix F1 (`/option-history` was 500) |
| Console errors and page errors | **PASS** (0) |
| Failed local requests | **PASS** (0) |
| Horizontal overflow | **PASS** after fix F2 (`/saved-picks` mobile 224 px; now 0) |
| External requests attempted by the browser | **PASS** (0) |

## 2. Accessibility (scanned pages)
| Check | Result |
|---|---|
| Form controls without an accessible name | **PASS** after fix F3 (saved-picks 8, performance 4; now 0 on scanned pages) |
| Images without alt text | **PASS** (0 on scanned pages) |
| Buttons without a name | **PASS** (0 on scanned pages) |
| Keyboard navigation and visible focus | **NOT TESTED** |
| Colour contrast | **NOT TESTED** |
| Screen-reader behaviour | **NOT TESTED** |

## 3. Interactions
**NOT TESTED.** Not performed: form submission and validation messages; filters and search; modals and dropdowns; tabs; charts and tables under interaction; refresh behaviour; loading, empty and error states. The saved-picks form was deliberately not submitted in the browser, because submission writes to protected storage. Its server-side validation was tested separately (`TESTING_AND_VERIFICATION.md` section 5).

## 4. Visual review
Screenshots exist for all 42 route and viewport pairs (`scratchpad/shots2`, `shots3`). **NOT TESTED** against the design: they were captured but not reviewed for layout quality, hierarchy or consistency.

## 5. Known issues still open
- No interaction testing (section 3).
- No visual review (section 4).
- `/performance` filter controls were labelled in this round, but their behaviour was not exercised.

## 6. Frontend readiness
**NOT READY.** Mechanical checks pass; interactions, visual review and accessibility beyond names are not verified.


## 7. Update 2026-11-10: interaction audit (isolated mock server, scratch data stores)

Method: Playwright against the sandboxed server on 127.0.0.1:3150, with writable stores (`SAVED_PICKS_FILE`, `APP_DATA_DIR`) pointed at scratch files. After the run, `.data` and `.research-data` had 0 files changed.

| Check | Result | Evidence |
|---|---|---|
| Sidebar navigation: 23 links each load 200 with a heading, no console errors | **PASS** | harness A0-A2 |
| Mobile menu (390 px): opens, aria-expanded true, Escape closes | **PASS** | B0-B3 |
| Saved-picks: empty submit blocked by required validation (no POST) | **PASS** | C1 |
| Saved-picks: valid create adds one row, labelled NOT VALIDATED | **PASS** | C2, C3 |
| Saved-picks: duplicate rejected with announced error, row count stays 1 | **PASS** (verified by direct inspection; the harness assertion was flaky) | direct run |
| Saved-picks: LONG with stop above entry rejected with visible error | **PASS** | C5 |
| Saved-picks: delete removes the row and shows the empty state | **PASS** | C6 |
| Saved-picks: network failure on save shows an announced error, no page error | **PASS** after fix F-FE4 | E1 |
| Saved-picks: HTTP 500 with non-JSON body shows an error | **PASS** after fix F-FE4 | E2 |
| Keyboard: visible focus indicator on first 12 tab stops (home, saved-picks) | **PASS** (Next dev overlay portal excluded) | D |
| Market status consistent between top bar and System Status panel | **PASS** after fix F-FE5 | browser check on a trading holiday |
| Mobile home: banner and buttons no longer squeezed side by side | **PASS** after fix F-FE6; 0 px overflow at 390 and 768 | screenshots |
| Filters, search and tabs on other pages (market-history search, performance filters, strategy tabs) | **NOT TESTED** | |
| Charts under interaction (hover, timeframe switch) | **NOT TESTED** | |
| Refresh behaviour (TopBar periodic refresh, loading and stale states) | **NOT TESTED** | |
| Screen-reader behaviour, colour contrast | **NOT TESTED** | |
| Visual inspection of screenshots | **PARTIAL**: home page inspected at desktop and mobile; the other 13 routes captured but not inspected | |

### Defects found and fixed
- **F-FE4 (saved-picks error states):** a network failure on save threw an unhandled rejection and showed nothing; delete ignored failures; the error text was not announced. Fix: `try/catch` with visible messages, delete checks `response.ok`, error paragraph has `role="alert"`. Regression: `a11yLabels.test.ts` (2 tests) plus browser cases E1, E2.
- **F-FE5 (market status contradiction):** two independent `marketStatus` implementations. `liveSessionController.ts` ignored NSE holidays, so on 2026-11-10 (Diwali-Balipratipada) the System Status panel read OPEN and warned "Market is open but no paper-live process holds the lock", while the top bar correctly read CLOSED. Root cause: the controller's header said it keeps no holiday list. Fix: it now uses `isTradingDay` from `time.ts`, and `nextSessionStart` skips holidays. Regression: `liveSessionHoliday.test.ts` (5 tests). Side effect to note: `liveOpportunityCollector.ts` also uses this controller, so it will no longer treat a holiday as an open session. No protected logic changed.
- **F-FE6 (mobile layout):** the mock banner and two buttons shared one non-wrapping row at 390 px. Fix: column layout below the `sm` breakpoint with wrapping buttons.

### Observations (no change made)
- Mock data gives BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX and BANKEX identical spot, previous close and option chain, and computes their breadth from the BANKNIFTY constituents. All are labelled MOCK, so users are not misled, but mock-mode tests cannot detect a cross-index field-mapping bug. Changing the fixtures would affect many tests, so it is documented as an integration blind spot.
- Delete in saved-picks has no confirmation step. This is a design choice, not changed.
