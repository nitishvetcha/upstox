# Application completion master plan — Phase A (codebase audit)

Audit date: 2026-11-13. Method: static inspection of the repository, route and page listings, test-file counts, and grep for mock and placeholder markers. No API calls, no token operations, no launch of any process. Strategy 11.4 is frozen. Production NO-GO.

Verified figures in this audit are marked **verified**. Anything not run in this session is marked **unverified** and must be checked before it is reported as working.

## 1. Architecture (verified)

- **Framework:** Next.js App Router with TypeScript (`src/app`, `src/lib`, `scripts`).
- **Pages:** dashboard, opportunities, recommendation debug, option and market history, options audit, options engine and research, strategy performance and evidence, stock v2, saved picks, login and PIN change.
- **API routes:** about 130 route handlers under `src/app/api`. Groups: auth (login, PIN, Upstox OAuth start and callback, status, health), market and option chain, expiries, technicals, breadth, news, sentiment, recommendations, opportunities (options and stocks), paper trading and paper opportunities, risk (assess and config), backtest (run, walk-forward, scenarios, runs, data quality), performance and evidence exports, research candles, saved picks.
- **Storage:** no database library in `package.json` (verified). State is kept in JSON and JSON-lines files under `.data/` (about 2.3 GB) and `.research-data/` (about 2.4 GB).
- **Strategy engine:** `src/lib/engine/` includes `strategy.ts`, `analysis.ts`, `engine.test.ts`, positional and intraday engines, and replay code.
- **Risk:** `src/lib/risk/` and `src/lib/services/risk*` (verified present). Risk assessment route exists.
- **Paper trading:** `paperEngine.ts`, `paperStateMachine.ts`, `paperMath.ts`, `paperReport.ts`, `paperIntegrity.test.ts` and routes under `/api/paper-trading` and `/api/paper-opportunities` (verified present).
- **Indicators:** EMA, RSI, MACD and ATR implementations exist in `src/lib/services/technicalAnalysis.ts`, `src/lib/stockV2/indicators.ts` and `src/lib/marketHistory.ts` (verified present). Correctness is **unverified** until tested against reference values in Phase D.

## 2. Test suite (partly verified)

- **Test files:** 179 (verified).
- **Last full run:** 2,767 passing, 0 failing, from the regression run recorded in the Phase 9B Stage 2 report. That run predates the Stage 3 and Stage 4 additions and the rate-limit runner. **A full rerun is needed** before any status is claimed.
- **Guard regression:** 5 of 5 (last run, verified).

## 3. Verified completed features

- Upstox OAuth start and PIN-protected operator sessions (routes and tests present).
- Option-chain, expiry and quote retrieval through `upstoxMarket.ts` (verified by the Phase 8 connectivity and option-key runs).
- Historical expired-option candles (pilot data present: 4,859 bars, verified in `.research-data/historical-pilot-raw/`).
- Collection guard that blocks network scripts without explicit flags (verified, 5 of 5 regression).
- Phase 9A evidence components and Phase 9B collector, WebSocket decoder and client (offline, mock-tested, 59 tests in `src/lib/liveEvidence/`, verified at last run).
- Rate-limit test runner, executed once and completed with 35 of 35 HTTP 200 responses (verified in `.research-data/rate-limit-test/`).

## 4. Incomplete, broken or unverified

| Area | Status | Evidence |
|---|---|---|
| Live WebSocket feed | **Not connected.** The client and decoder are offline only. | `wsClient.ts` takes an injected transport; no production transport exists. |
| Live data freshness labels | **Unverified.** The statuses LIVE, DELAYED, STALE, HISTORICAL, MOCK and UNAVAILABLE exist in the codebase; whether each is driven by real provenance is unverified. | Not yet checked. |
| Database and persistent store | **Missing.** JSON files only. No indexes, no migrations, no integrity guarantees beyond write-once rules in some modules. | No DB library in `package.json`. |
| Mock data path | **Present.** `src/lib/services/mock.ts` and `mockMarket.ts` are used by `market.ts`, `recommendations/generate` and research code. The dashboard must never show MOCK as LIVE. | Import audit above. |
| Strategy 11.4 inputs | **Partly unsupported.** Bid/ask filter, VWAP from index volume, full-chain OI and Greeks cannot be reproduced from historical data. See `HISTORICAL_ACQUISITION_FEASIBILITY_AUDIT.md`. | Feasibility audit. |
| Scheduler | **Offline and unwired.** `src/lib/liveEvidence/scheduler.ts` has injected timers and no production caller. Only its test imports it. | Verified by grep. |
| Full regression | **Needs rerun** after Stage 3, Stage 4 and rate-limit changes. | Section 2. |
| Paper-live launchd job | **Unloaded (verified).** It must stay unloaded. | `launchctl list`. |

## 5. Mock implementations

- `src/lib/services/mock.ts` and `mockMarket.ts`: mock market data used when `MARKET_DATA_PROVIDER=mock`. These must always display as MOCK.
- `src/lib/testFixtures/mockSnapshotTradeInputs.ts`: test fixture only.
- Mock markers in non-test code: **1 TODO/FIXME/placeholder** found by grep. Location to be identified in Phase D.

## 6. Data-source dependencies

- **Upstox:** sole provider in governance. Verified capabilities: option chains, expiries, LTP, bid/ask prices and quantities, depth on V3 quotes, expired-option candles with OI on Plus. Not verified for this account: V3 Full-mode entitlement (portal check was blocked; UNCONFIRMED).
- **News:** RSS feeds and NewsAPI (`NEWS_API_KEY` present in `.env.local`; value not printed).
- **NSE and BSE:** official holiday circulars recorded; data products not yet evaluated.
- **Other providers:** not yet evaluated (Phase B).

## 7. Strategy dependencies

- Strategy 11.4 is frozen. It needs data that the historical endpoint cannot supply (section 4).
- Any change to entry, exit, width, delta or VWAP logic requires a written proposal and approval (Phase C).
- The 1% risk limit is unchanged.

## 8. Security issues

- **Secrets in local env files:** `.env.local` contains client credentials and the news key. Values were not printed in this audit. The file must not be committed.
- **Token file:** `.data/upstox-token.json` holds the OAuth token. It is excluded from output by the tests and runner. Confirm `.gitignore` covers `.data/`.
- **Operator PIN and sessions:** PIN stored as a salted hash, durable session store with hashed IDs (per the earlier build record).
- **CSP:** enforced by default (per the earlier build record). Verification is **unverified** in this audit.
- **Scheduler:** not wired. It must stay that way until a separate approval.

## 9. Testing gaps

- No end-to-end test of the full dashboard against real data (not permitted without approval).
- No frontend component tests were checked in this audit.
- Reference-value tests for indicators were not checked.
- Failure-mode tests exist for the collector, the WebSocket client and the rate-limit runner. Their coverage of the Phase 14 edge cases (for example WebSocket disconnect under load) is **unverified**.
- The full regression suite must be rerun and recorded.

## 10. Recommended completion sequence

1. **Phase B (next):** data-source feasibility, using official documentation and web research only. No Upstox API calls. Output: `DATA_SOURCE_FEASIBILITY_REPORT.md`.
2. **Phase C:** strategy feasibility matrix and completion proposal. Output: `STRATEGY_COMPLETION_PROPOSAL.md`. No implementation of material strategy changes before approval.
3. **Phase D (can start now, in parallel):** fix the mock-as-live risk, add a persistent store with indexes and integrity checks, verify indicator correctness against reference values, verify the risk gates are enforced server-side, and rerun the full regression suite.
4. **Phase E:** data acquisition, only after provider and scope approval, with resumable, audited pipelines.
5. **Phase F:** strategy implementation and reproducible backtesting, with the holdout frozen first.
6. **Phase G:** final QA and `APPLICATION_COMPLETION_FINAL_REPORT.md`.

## 11. Decisions that need the owner

1. **Data provider.** Phase B will report options. Choosing one and approving its cost is needed before Phase E.
2. **Strategy changes.** The bid/ask filter, VWAP input, delta and full-chain OI all need decisions (Phase C).
3. **Live operation.** Whether the dashboard may run live feeds in a supervised session. This needs a separate approval.
4. **Holdout selection.** Required before any validation (Phase F).
5. **Production.** Remains NO-GO. Production approval is separate.

## 12. Governance

- No real order placement. No automatic trading. No unattended live trading.
- No API calls, token generation or refresh under this plan without explicit authorization.
- No background jobs, schedulers or LaunchAgents without explicit approval.
- The paper-live LaunchAgent stays unloaded.
- The 1% risk limit and Strategy 11.4 are unchanged unless separately approved.

## 13. Phase B and Phase D status (2026-11-13)

**Phase B (data-source feasibility):** complete as a documentary review. See `DATA_SOURCE_FEASIBILITY_REPORT.md`. No provider is verified to supply historical bid/ask, full-chain OI and Greeks together. Pricing and licences are unknown for every provider. No purchases or API calls.

**Phase D (offline implementation), verified in this session:**
- **Regression suite:** 2,814 tests pass, 0 fail (`npm test`). This supersedes the 2,767 figure in section 2.
- **Lint:** 35 errors and 101 warnings across the project. Errors are concentrated in older probe and research scripts (`scripts/phase8-connectivity-test.ts`, `scripts/historical-expired-probe.ts`, `scripts/phase8-option-keys.ts`, `scripts/phase3-*`, and browser check scripts). Those scripts were executed as evidence, so they are left unchanged to keep their recorded hashes valid. Fixing them is a separate, owner-approved task.
- **Indicator reference checks:** 7 new tests in `src/lib/services/technicalReference.test.ts` check EMA, RSI and ATR against values derived by hand from their definitions. All pass. MACD is not yet covered.
- **Mock-to-LIVE path:** the provider path relabels synthetic breadth to MOCK (`asMockBreadth`). The backtest path deliberately keeps status LIVE with source MOCK, by an earlier owner decision. This is a known risk. It is recorded here, and the change is deferred until backtest inputs are reviewed. Other LIVE labels (candle freshness, collector) are gated by real checks, but not every path has been verified.
- **Database:** assessment and migration plan written (`DATABASE_MIGRATION_AND_ROLLBACK_PLAN.md`). No storage changed.

**Update (2026-11-13, later):**
- Regression: 2,834 pass, 0 fail (`npm test`).
- Lint: 35 errors, 101 warnings. ESLint now ignores `.research-data/` and `.data/`, which had been double-counting archived copies. No rule was weakened. Of the 35 errors, 29 are in executed evidence scripts that are protected by the hash policy and were not changed. The remaining 6 are in other files and are not yet fixed.
- Evidence archive: 13 files archived with a SHA-256 manifest (`.research-data/evidence-archive/2026-11-13T05-29-55Z/`). All 13 hashes verified before and after the lint step.
- SQLite isolated integration: 8 tests pass, covering batch writes with reconciliation, duplicate prevention, rollback on a failed batch, index use, restart, two-process concurrent writes, rollback rehearsal, and integrity and foreign-key checks. A real defect was found and fixed: `INSERT OR IGNORE` silently hid CHECK violations. The store (`src/lib/sqliteStore/`) is not the active storage.
- Strategy proposal: `STRATEGY_COMPLETION_PROPOSAL.md`. Proposal only. No strategy change implemented.

**Not yet done in Phase D:**
- Server-side risk-gate verification.
- MACD reference checks.
- Migration dry run and rollback rehearsal (needs owner approval).
- Full mock-provenance trace across all routes.
