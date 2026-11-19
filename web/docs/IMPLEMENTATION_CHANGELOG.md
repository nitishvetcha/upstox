# Implementation changelog: this programme (2026-11-09 to 2026-11-10)

Only changes made in the session are listed. Earlier work is in the existing phase reports. Nothing was staged, committed, reset or cleaned.

## Safety and isolation
| ID | Change | Files | Verification |
|---|---|---|---|
| S1 | Central Upstox network gate: refuses unless `MARKET_DATA_PROVIDER=upstox` | `src/lib/services/upstoxNetworkGate.ts` (new); called in `upstoxMarket.ts`, `futures.ts`, `adapters/upstoxHistoricalOptionsAdapter.ts` | `upstoxNetworkGate.test.ts` (9 tests); isolated run: 54 blocked, 0 sent |
| S2 | Development default changed to mock (one line) | `web/.env.local` (`MARKET_DATA_PROVIDER=mock`; value recorded in incident record) | static check; server not started outside sandbox |
| S3 | News fail-closed: NewsAPI and RSS need `NEWS_EXTERNAL_ENABLED=true` and `MARKET_DATA_PROVIDER=upstox` | `src/lib/services/newsNetworkGate.ts` (new); `newsProvider.ts`, `rssNewsProvider.ts` | `newsNetworkGate.test.ts` (6 tests) |
| S4 | Collector fail-closed: 17 scripts exit 2 before any network call unless authorised | `scripts/lib/collectionGuard.mjs` (new); header added to 17 scripts; scripts otherwise unchanged | `collectionGuard.test.ts` (5 tests), including coverage of all network scripts |
| S5 | LaunchAgent `com.upstox.paperlive.plist` moved (not deleted) to `~/Library/LaunchAgents.disabled/` | outside repository | SHA-256 unchanged; not loaded; rollback in `GATING_AND_LAUNCHAGENT_2026-11-09.md` |

## Defects fixed
| ID | Defect | Root cause | Fix | Regression test |
|---|---|---|---|---|
| F1 | `/option-history` returned HTTP 500 | Gate error thrown outside the adapter's try block | Adapter returns structured `PROVIDER_NOT_LIVE` result | `upstoxNetworkGate.test.ts` (probe test) |
| F2 | `/saved-picks` overflowed 224 px at 390 px | Fixed 3-column grid with intrinsic input widths | Responsive `auto-fit` grid; table in overflow wrapper | browser recheck: 0 px |
| F3 | Unlabeled form controls on `/saved-picks` (8) and `/performance` (4) | Placeholder used as the only name | `aria-label` added | `a11yLabels.test.ts` |
| F-W1 | `POST /api/saved-picks` with non-string `instrument` threw an unhandled TypeError | `validatePick` called `.trim()` before checking type | Type check added to `validatePick` | `writeRouteValidation.test.ts` (3 tests); harness now returns 422 |
| F-W2 | `POST /api/risk/assess` with malformed JSON returned 500 | One `try` covered JSON parsing and computation | JSON parsed separately, returns 400 | `writeRouteValidation.test.ts` (2 tests) |

## Test-suite adjustments (setup only; assertions unchanged)
- 16 test files that stub `fetch` for the live path now set `MARKET_DATA_PROVIDER=upstox` explicitly (listed in `INCIDENT_REMEDIATION_2026-11-09.md`, plus the candle and news files).
- Four news test files set `NEWS_EXTERNAL_ENABLED=true` (the authorised path).
- `researchRunner.test.ts` passes the collector authorisation flags to its child process; its preload still intercepts every request.
- `newsNetworkGate.test.ts` clears news caches before the authorised-path test, because blocked results from earlier tests are cached.

## Not changed (deliberately)
- Strategy 11.4, `strategy.ts`, thresholds, scoring and risk limits.
- `/api/options-canary` 500 contract (documented fail-closed behaviour).
- `package.json`, `package-lock.json`, dependencies (see Git provenance: several were modified by unknown origin; not touched by this work).
- Protected data: `.data`, `.research-data`, historical datasets, journals, saved picks on disk.

## Added tests (verification only, no production code changed)
- `src/lib/services/indicatorsKnownAnswer.test.ts` (18 tests): hand-derived expected values for EMA, RSI, ATR, MACD, VWAP.
- `src/lib/services/breadthKnownAnswer.test.ts` (8 tests): hand-derived expected values for breadth counts, percentages, tolerance, coverage and empty sets.
- Both pass against the unchanged implementation, so no indicator or breadth defect was found.

## 2026-11-10 frontend and integration fixes
| ID | Change | Files | Verification |
|---|---|---|---|
| F-FE4 | Saved-picks save and delete handle network and non-JSON failures; error is `role="alert"` | `src/app/saved-picks/page.tsx` | `a11yLabels.test.ts`; browser E1, E2 |
| F-FE5 | Session controller uses the NSE holiday calendar; `nextSessionStart` skips holidays | `src/lib/services/liveSessionController.ts` | `liveSessionHoliday.test.ts` (5 tests); browser check |
| F-FE6 | Home page banner and buttons stack on small screens | `src/app/(dashboard)/page.tsx` | screenshots; 0 px overflow |

## Added tests: risk sizing (verification only)
- `src/lib/services/risk/riskKnownAnswer.test.ts` (10 tests). No risk limit, threshold or strategy logic was changed. Result: all pass.
