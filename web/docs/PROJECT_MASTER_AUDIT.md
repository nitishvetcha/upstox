# Project master audit (2026-11-10)

Scope: the Upstox Options Analyzer web application in `web/`, plus the research artefacts under `docs/`. This audit does not cover trading performance; see section 6.

## 1. Architecture (verified from source)
- Next.js 16 app router with server route handlers under `src/app/api` (83 route files: 68 GET, 19 POST, 1 DELETE, 1 PATCH across handlers).
- Provider layer: `src/lib/services/market.ts` selects mock or Upstox. Upstox HTTP calls go through `upstoxMarket.ts`, `futures.ts` and the historical-options adapter, all now behind `upstoxNetworkGate.ts`.
- Persistence: JSON files under `APP_DATA_DIR` (default `.data`), written atomically. No database engine.
- Research: `scripts/` holds collectors, research runners and paper-trading runners. Collectors are fail-closed (exit 2) unless explicitly authorised.
- Dependencies: 6 production, 10 development.

## 2. Current condition
- Offline tests: 2,432 pass, 0 fail. TypeScript clean.
- Mock-mode browser audit at three widths: 42 of 42 routes return 200 with no console errors (after fixes). Interaction review is not done.
- Network isolation: verified with a process sandbox (external denied, loopback allowed) for the dev server; browser isolation is application-level.

## 3. Critical findings and status
| Finding | Severity | Status |
|---|---|---|
| Development default was live (`MARKET_DATA_PROVIDER=upstox`), and a server made 67 live Upstox requests | Critical | Fixed: default mock; central gate; news and collectors fail-closed |
| Mock gate covered only the snapshot path | High | Fixed: gate at the shared Upstox client and direct call sites |
| Two write-route defects (saved-picks type error; risk/assess 500 on bad JSON) | Medium | Fixed with regression tests |
| `/option-history` HTTP 500 | Medium | Fixed |
| Layout overflow on `/saved-picks` mobile | Low | Fixed |
| Unlabeled form controls (12) | Low | Fixed |
| 8 moderate npm advisories (dev-only) | Low | Open: needs approval to upgrade |
| Six unexplained untracked entries and several tracked files modified by unknown origin | Medium (provenance) | Open: inventory written; no changes made |
| Quantitative calculations unverified | High for any trading claim | Open |

## 4. Verified facts vs assumptions
Verified: items in section 2 and in `TESTING_AND_VERIFICATION.md`. Assumed: that the eight remaining collector scripts not covered by the guard tests have no other network path (the coverage test checks for known patterns such as `fetch(`, `https://` and `urllib`, not every possible client).

## 5. Work not performed
Interaction testing, authorization and failure-path backend tests, integration tracing, database read-only review, performance measurement, quantitative known-answer tests, deployment review, online research.

## 6. Trading recommendation engine
**NO-GO.** The software checks above do not establish a profitable or validated strategy. P1 is rejected; Strategy 11.4 is frozen; the holdout is sealed.


## 7. Update 2026-11-10: integration findings

### Breadth provenance: `status=LIVE` with `source=MOCK`
- **Root cause:** in `calculateBreadth`, a MOCK `sourceOverride` skips the per-quote freshness checks and sets `status` to `LIVE` (full coverage) or `PARTIAL`. `status` therefore describes coverage and freshness of the computed set; provenance lives only in `source`.
- **Consumers checked:** `MarketCard` uses the source-aware `breadthBadge` (safe). `dataLabel` requires every subsystem source to be LIVE, including breadth, so it cannot return LIVE DATA for mock input (safe; locked by test `MS-2` in `mockLiveSafeguards.test.ts`). `analysis.ts` uses `status` only to decide whether to include breadth in the score (correct for both mock and live; mock analysis is gated elsewhere by `hasMockInput`). `strategy.ts` and `paperEngine.ts` read only END_OF_DAY and STALE.
- **Impact:** no misleading UI or downstream path was found. The risk is a future consumer that reads `breadth.status` alone. The meaning of the field was not changed. **Status: PARTIAL** (no defect, documented hazard).

### Market status divergence (fixed)
See `FRONTEND_AUDIT.md` F-FE5: two market-status implementations disagreed on holidays.

### Mock data blind spot
Five indices share identical mock values (see `FRONTEND_AUDIT.md` observations). Cross-index mapping cannot be verified in mock mode.
