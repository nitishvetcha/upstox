# Testing and verification (2026-11-10)

Status key: PASS, FAIL, PARTIAL, BLOCKED, NOT TESTED, NOT APPLICABLE.

## 1. Automated tests
| Check | Result | Evidence |
|---|---|---|
| Offline unit and integration suite (`npm test`) | **PASS** 2,475 / 2,475, 0 fail, 0 skipped | run on 2026-11-10 (2,432 baseline plus 26 known-answer tests, 7 regression tests and 10 risk-sizing tests) |
| TypeScript (`npx tsc --noEmit`) | **PASS** (no errors) | run on 2026-11-10 |
| Upstox network gate | **PASS** 9 tests | `upstoxNetworkGate.test.ts` |
| News network gate | **PASS** 6 tests | `newsNetworkGate.test.ts` |
| Collector guard (exit 2 before network; coverage of network scripts) | **PASS** 5 tests | `collectionGuard.test.ts` |
| Accessible names on audited form controls | **PASS** | `a11yLabels.test.ts` |
| Write-route input validation | **PASS** 6 tests | `writeRouteValidation.test.ts` |

Caveat: the suite is offline and stub-based. It does not prove network isolation. Isolation was checked separately (section 3).

## 2. Browser audit (isolated mock mode, 127.0.0.1:3150)
| Check | Result | Notes |
|---|---|---|
| 14 routes at 1440, 768, 390 px return HTTP 200 | **PASS** after fix (`/option-history` was 500) | 42 of 42 |
| Console errors, page errors, failed local requests | **PASS** (0) | |
| Horizontal overflow | **PASS** after fix (`/saved-picks` mobile 224 px) | 0 px |
| Unlabeled form controls | **PASS** after fix (saved-picks 8, performance 4) | 0 remaining on the scanned pages |
| Visual inspection of screenshots against design | **NOT TESTED** | screenshots exist; not reviewed against design |
| Form interactions (submit, validation messages, filters, search, modals, dropdowns, tabs) | **NOT TESTED** | not performed |
| Keyboard navigation and focus order | **NOT TESTED** | |
| Refresh, loading, empty and error states | **NOT TESTED** | |

## 3. Network isolation
| Check | Result |
|---|---|
| Process sandbox denies external connections, allows loopback | **PASS** (probe: EPERM external, ECONNREFUSED loopback; control: timeout outside sandbox) |
| Dev server inside sandbox: zero outbound markers | **PASS** (0 upstox_request, 0 news_request, 0 EPERM; 54 upstox_blocked) |
| Browser: external requests blocked at Playwright routing | **PASS** (0 attempted) |
| Browser itself inside OS sandbox | **NOT TESTED** (application-level only) |

## 4. Backend endpoint validation (GET routes, isolated server)
| Check | Result |
|---|---|
| 68 GET routes, valid and invalid inputs (136 calls) | **PASS** for transport and token leakage (0 leaks, 0 transport errors) |
| Unknown path parameters return 404 | **PASS** |
| `/api/options-canary` returns 500 when `CANARY_AUTH_SECRET` is unset | **PARTIAL**: fail-closed as documented; 503 would describe the fault more accurately. Contract left unchanged |
| Authorization (401/403) on protected routes | **NOT TESTED** for most routes |
| Provider-failure and database-failure paths | **NOT TESTED** |

## 5. Backend write routes (disposable temp store, not `.data`)
Method: handlers invoked in-process with `APP_DATA_DIR`, `SAVED_PICKS_FILE`, `PAPER_TRADES_DIR` and `SESSION_EVIDENCE_DIR` pointed at a `mktemp` directory. Protected directories were checked for changes after the run: **0 files changed**.

| Route | Method | Tests run | Result |
|---|---|---|---|
| `/api/saved-picks` | POST | valid create (201), duplicate (409), bad stop (422), self-validated (422), wrong type (422), malformed, empty, null | **PASS** after fix F-W1 |
| `/api/saved-picks` | DELETE | valid id (200), missing id (404), no id (400), malformed | **PASS** |
| `/api/risk/assess` | POST | malformed JSON (400), empty body (400), unknown index (404) | **PASS** after fix F-W2 |
| `/api/auth/logout` | POST | several bodies (200) | **PASS** |
| `/api/opportunities/track` | POST | malformed, empty, wrong type, null (400) | **PARTIAL**: invalid inputs only; valid write not tested |
| `/api/opportunities/outcomes` | PATCH | malformed, empty, wrong type, null (400) | **PARTIAL**: invalid inputs only |
| `/api/recommendations/generate` | POST | malformed, empty, wrong type, null (200) | **PARTIAL**: body ignored (200), no file written; valid generation not tested |
| `/api/recommendations/[id]/refresh` | POST | — | **NOT TESTED**: needs a recommendation fixture |
| `/api/recommendations/[id]/paper-trade` | POST | — | **NOT TESTED**: paper-trading path, excluded by policy |
| `/api/paper-trading/enter`, `/update`, `/close` | POST | — | **NOT TESTED**: paper-trading path, excluded by policy |
| `/api/paper-opportunities` (POST), `/collect`, `/monitor`, `/[id]/evaluate` | POST | — | **NOT TESTED**: paper-trading path, excluded by policy |
| `/api/backtest/run`, `/compare`, `/compare-runs`, `/scenarios`, `/walk-forward` | POST | — | **NOT TESTED**: new research runs, prohibited without approval |

Defects found and fixed in this section are in `IMPLEMENTATION_CHANGELOG.md`: F-W1 (saved-picks non-string instrument threw), F-W2 (risk/assess malformed JSON returned 500).

## 6. Database integrity
| Check | Result |
|---|---|
| Storage model | **Verified**: JSON files under `APP_DATA_DIR` (default `.data`), written atomically. No SQLite or other database engine found in `src` or `scripts` |
| Schema, constraints, indexes | **NOT APPLICABLE** to the JSON stores; file-format and field validation covered by section 5 |
| Read-only inspection of `.data` (authorised 2026-11-10) | **PASS** (aggregate only, nothing modified, `upstox-token.json` not read) |

`.data` findings (aggregate, redacted): 14,908 JSON files and 3 JSONL files across 19 directories. Malformed files: 0. Empty files: 0. Malformed JSONL lines: 0. Record ids are unique in `recommendations` (26), `paper-opportunities` (455) and `opportunity-tracking` (210); duplicate ids: 0; missing ids: 0. `saved-picks/picks.json` holds 0 records. The token file mode is `-rw-------` (owner only); the `.data` directory is `drwxr-xr-x`. Cross-store relationships (for example recommendation to paper-trade ids) and timestamp consistency were **NOT TESTED**. Nothing was repaired.

## 7. Security and dependencies
See `FINAL_PROJECT_STATUS.md` section 4 and `BACKEND_AUDIT.md`. `npm audit`: 8 moderate, all dev-only (ESLint toolchain); production dependencies: 0 findings. **PARTIAL** because npm audit covers known advisories only.

## 8. Quantitative calculations
Independent known-answer tests, with expected values derived by hand from the textbook definitions (not from the implementation):

| Calculation | Result | Evidence |
|---|---|---|
| EMA (SMA seed; constant series; short series; length equals period) | **PASS** | `indicatorsKnownAnswer.test.ts` (4 tests) |
| RSI (Wilder: hand-derived 75; all-up 100; all-down 0; flat 50; insufficient history null) | **PASS** | same file (5 tests) |
| ATR (Wilder: hand-derived 3.5; gap case uses previous close; insufficient history null) | **PASS** | same file (3 tests) |
| MACD (constant series zero; unit ramp gives line 7, signal 7, histogram 0 analytically; short history null) | **PASS** | same file (3 tests) |
| VWAP (hand-derived 10.5; null when volume missing; null for empty or zero volume) | **PASS** | same file (3 tests) |
| Breadth (counts, percentages, strict ±0.05 tolerance, invalid quotes excluded, zero declines, extremes, empty set, coverage below 80%) | **PASS** | `breadthKnownAnswer.test.ts` (8 tests) |
| EMA 9/21/50/200 applied through the dashboard pipeline (period configuration, timeframe) | **NOT TESTED** |  |
| Option-chain metrics | **NOT TESTED** |  |
| Risk assessment and position sizing (`evaluateTradeRisk`): floor sizing, risk and capital limits, hard lot cap, invalid stop/entry/target, unknown lot size, credit trade | **PASS** | `services/risk/riskKnownAnswer.test.ts` (10 tests; costs and slippage zeroed; limits passed explicitly; environment cleared) |
| Lot-size: unknown lot rejected (covered above); lot-size change over time | **PARTIAL** |  |
| Expiry handling, timezone boundaries, incomplete sessions | **NOT TESTED** | not yet written |
| Option-chain metrics (PCR, OI, strike selection) | **NOT TESTED** | not yet written |

Observation (not changed): when breadth is computed with a MOCK source override, `status` can read `LIVE` while `source` is `MOCK`. Consumers must use `source` for provenance. A test that locks in that behaviour was deliberately not added.

## 9. Performance and deployment
**NOT TESTED** in this round. See `FINAL_PROJECT_STATUS.md`.

## 10. Interaction audit (2026-11-10)
See `FRONTEND_AUDIT.md` section 7 for the full table. Summary: navigation (23 links), mobile menu, saved-picks workflow and failure states, keyboard focus on two pages: **PASS** after three fixes. Filters, search, tabs, charts and refresh states: **NOT TESTED**.
