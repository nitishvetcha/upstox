# Full Application Audit — Upstox Options Analyzer
**Audit date:** 2026-11-03 | **Auditor:** read-only fork | **Project:** `/web`

---

## 1. Frontend Pages

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| Dashboard | `/` | **Functional** | Server component; calls `getDashboard()` → `getAnalysis()` for NIFTY+BANKNIFTY. Renders OpsPanel, RecommendationCard, MarketCards, NewsPanel, PriceChart (Recharts), DataQualityPanel, RiskPanel, RecommendationWidget, RecommendationJournal, ResearchLabSummary. All wired to real services; mock data clearly labelled. |
| Opportunities | `/opportunities` | **Functional** | Server component; calls `evaluateOptionsOpportunity`, `scanStocks`, `scanLongTerm` directly (no HTTP self-fetch since Phase 29 fix). Glossary, grading, expiry info all rendered. |
| Opportunity Journal | `/opportunity-journal` | **Functional** | Shows paper opportunities, session evidence, collection/monitor run status, daily summary. Auth/connection status banner present. |
| Section router | `/[section]` | **Functional** | Routes 13 slugs; paper-trading renders inline; others delegate to SectionViews components. |
| Market History | `/market-history` | **Functional** | Client component; searches stocks, fetches candle history via `/api/stocks/[symbol]/history`. Has chart with EMA/VWAP overlays via Recharts. |
| Performance | `/performance` | **Functional** | Backtest runs, equity chart (EquityCharts), trade journal, run form. Backed by backtestStore + performance report builder. |
| Strategy Evidence | `/strategy-evidence` | **Functional** | Calls `/api/strategy/evidence`; renders gates, per-index evidence, decision badge. Client component with polling. |
| Strategy Performance | `/strategy-performance` | **Functional** | Renders intraday replay, positional V1/V2 frozen results, paper opportunity summaries. Server component. |
| Options Audit | `/options-audit` | **Functional** | Renders `auditReport()` output; per-index verdicts and round details. |
| Options Research | `/options-research` | **Functional** | Inventory list from `loadInventories()`; data class badges. |
| Option History | `/option-history` | **Functional** | Historical option data quality via `/api/historical-options/data-quality`. |
| Recommendation Debug | `/recommendation-debug` | **Functional** | Diagnostic panel; calls `/api/recommendations/diagnostic`. |

**Logged-out state:** `OpsPanel` shows `EXPIRED`/`MISSING` auth status with a "Login" link (`/api/auth/login`). `DataStatus` shows `MOCK FALLBACK` banner. `TopBar` shows login button when status is not VALID. No page crashes when logged out — all fall back to mock data with clear labelling.

---

## 2. UI Components

| Component | Status | Notes |
|-----------|--------|-------|
| `TopBar` | **Complete** | Live clock, NIFTY/BANKNIFTY tickers, change %, expiry, auth badge, auto-refresh every 5 min. Login button when auth expired. |
| `Sidebar` | **Complete** | 13 section links with active-state styling. |
| `MarketCard` | **Complete** | Spot, change, EMA structure, VWAP, RSI/MACD/ATR, trend, breadth, option chain summary, sources per subsystem. |
| `RecommendationCard` | **Complete** | TRADE/WAIT/NO TRADE badge, factors table, plan details, risk info. |
| `DataStatus` | **Complete** | LIVE/MOCK/PARTIAL LIVE/MOCK FALLBACK label with per-reason explanation. |
| `OpsPanel` | **Complete** | Auth status, paper runner state, source status per subsystem, options audit verdict, attention list. |
| `SectionViews` | **Complete** | RecommendationView, MarketOverview, OptionChainView, StrategiesView, NewsView, SystemHealthView, SettingsView, BacktestRunsView all implemented. |
| `AnalysisPanels` | **Complete** | MarketPanel, RiskPanel, TechnicalsPanel, OptionsPanel, LevelsPanel, DataQualityPanel, IndexSwitch, RecommendationSummary. |
| `NewsPanel` | **Complete** | Per-index news score, event risk, sentiment breakdown. |
| `PriceChart` | **Complete** | Client component; NIFTY/BANKNIFTY, 4 timeframes, EMA9/21/VWAP overlays, Recharts LineChart. Falls back gracefully when data unavailable. |
| `RecommendationWidget` | **Complete** | Polls `/api/recommendations/today`. |
| `RecommendationJournal` | **Complete** | Lists journal entries from recommendationStore. |
| `WalkForwardView` | **Complete** | Walk-forward backtest results with equity and trade tables. |
| `EquityCharts` (performance/) | **Complete** | Recharts-based equity curves and drawdown chart. |

**Mobile/desktop:** Tailwind responsive grid (`lg:grid-cols-2`) used throughout. No obvious breakpoint regressions from code inspection. Charts use `ResponsiveContainer`.

---

## 3. API Routes

### Wired to real data (mock fallback when logged out)
- `GET /api/market/[index]` — `getSnapshot()` → Upstox or mock
- `GET /api/analysis/[index]` — `getAnalysis()` → strategy.ts
- `GET /api/option-chain/[index]` — option chain with ATM slice
- `GET /api/technical/[index]` — candle series + indicators
- `GET /api/news/[index]` — RSS news provider
- `GET /api/breadth/[index]` — market breadth (Upstox constituents quotes)
- `GET /api/events/[index]` — event risk
- `GET /api/sentiment/[index]` — sentiment score
- `GET /api/auth/status` — token status, optional connection verify
- `GET/POST /api/auth/login`, `GET /api/auth/callback` — OAuth flow
- `POST /api/auth/logout`, `GET /api/auth/health`
- `GET /api/opportunities/top` — multi-engine opportunity aggregator
- `GET /api/opportunities/daily-summary` — paper opportunity daily summary
- `GET /api/paper-opportunities/*` — paper opportunity CRUD + monitor + collect
- `GET /api/paper-trading/portfolio` — paper ledger report
- `GET/POST /api/paper-trading/trades` — paper trades
- `POST /api/paper-trading/enter`, `/close`, `/update`
- `GET /api/recommendations/*` — journal, generate, today, analytics, evaluation, export
- `POST /api/risk/assess`, `GET /api/risk/config`
- `GET /api/strategy/evidence` — strategy evidence report
- `POST /api/backtest/run`, `GET /api/backtest/runs` — backtest
- `GET /api/performance/[runId]/*` — equity, monthly, trades, risk, regimes
- `GET /api/stocks/[symbol]`, `/history`, `/technicals`, `/search`

### Requiring Upstox live auth to return real data
- All market, option-chain, technical, breadth endpoints (fall back to mock without auth)
- `/api/historical-options/data-quality` — requires Upstox Plus plan access
- `/api/backtest/run` — requires real historical candles via Upstox
- Stock intraday/swing/long-term opportunity scans

### Potentially thin / worth verifying
- `GET /api/opportunities/stocks/intraday`, `/swing`, `/long-term` — each calls engine directly; `scanLongTerm` notes `NO_FUNDAMENTAL_PROVIDER` (no P/E, no EPS, no dividend data)
- `GET /api/opportunities/outcomes` — reads `opportunityTrackingStore`; depends on historical outcome data being populated
- `GET /api/opportunities/track` — POST-only tracking; reads correctly
- `GET /api/backtest/walk-forward/*` — walk-forward engine wired; requires real candle data

---

## 4. Market Data & Authentication

**Auth flow (src/lib/services/upstoxAuth.ts):** Complete. OAuth authorization-code with PKCE state, cookie-based anti-CSRF, file-backed token storage (`.data/upstox-token.json`). Token verified on use; 401 triggers `markTokenInvalid()`. Environment: `UPSTOX_CLIENT_ID`, `UPSTOX_CLIENT_SECRET`, `UPSTOX_REDIRECT_URI` required.

**Provider switching (src/lib/services/market.ts):** `MARKET_DATA_PROVIDER=upstox` enables live data; default is mock. `withFallback()` transparently falls back to mock on any Upstox error, tagging the reason (`UPSTOX_AUTH_EXPIRED`, `UPSTOX_TIMEOUT`, etc.).

**Upstox market provider (upstoxMarket.ts):** Implements full `MarketDataProvider` interface — quotes, option chain (with expiry selection), technicals, candles, breadth (constituent batch quotes), futures VWAP. TTL-based caching via `cache.ts`. All HTTP errors produce typed `UpstoxError` with fallback reason.

**Mock provider (mockMarket.ts / mock.ts):** Complete Black-Scholes option chain, realistic indicators, mock news. Deterministic from a fixed timestamp. Clearly labelled in every snapshot's `sources`.

**Current state:** OAuth token expired 2026-10-29. All market data serving mock with `UPSTOX_AUTH_EXPIRED` fallback reason. UI shows this correctly.

---

## 5. Analysis Engine

**src/lib/engine/analysis.ts:** Complete. Computes 8 factors: trend (EMA 9/21/50/200), RSI, MACD, futures VWAP, option chain OI/PCR, support/resistance from OI, news/sentiment, market breadth. Each factor has `available` guard — missing inputs produce conservative output, never fabricated values.

**Technical analysis (services/technicalAnalysis.ts):** EMA (9/21/50/200), RSI 14, ATR 14, MACD (12/26/9), Bollinger bands, ADX, VWAP. `chartSeries()` returns time-series for candle charts.

**Futures VWAP (services/futures.ts):** Selects nearest unexpired futures contract, computes session VWAP from candles. Falls back to `unavailableVwap()` cleanly.

**Breadth (services/breadthService.ts):** NIFTY 50 / BANKNIFTY constituent quotes, computes advancers/decliners/unchanged, breadth ratio. Requires live auth for real data; mock breadth available.

**News (services/news.ts, newsProvider.ts, rssNewsProvider.ts):** RSS-based news scoring (positive/neutral/negative), event risk detection (earnings, policy, geopolitical). Runs independently of Upstox. No news = `UNAVAILABLE` source, not mock news substituted when live.

**Option chain analytics (services/optionChainAnalytics.ts):** ATM strike, PCR (OI + volume), OI-based S/R, max pain, expected move, IV metrics. All feed into `analysis.ts`.

---

## 6. Strategy Engine

**src/lib/engine/strategy.ts:** The signal-generation logic for NIFTY and BANKNIFTY options.
- Generates: Long Call, Long Put, Bull Call Spread, Bear Put Spread, Iron Condor, Long Straddle, Bull Put Credit Spread, Bear Call Credit Spread.
- Produces `TRADE` / `WAIT` / `NO TRADE` with factor breakdown.
- Version string: `"11.4-frozen"` in `journalTypes.ts`.
- **Working-tree change vs last commit (bcdd18a):** 4-line staleness logic change (lines 283–288 current vs 283–284 committed). Option chain and news staleness no longer cause NO TRADE; they contribute to WAIT. Strategy owner decision pending — NOT VERIFIED as 11.4-frozen.

**Opportunity Engine (engine/opportunityEngine.ts v20.1):** Independent of 11.4. Scores contracts on 8 weighted factors (underlying direction, OI intelligence, S/R room, liquidity, delta, IV attractiveness, R:R quality, expected-move fit). Grades A+/A/B/C/REJECT.

**Stock Opportunity Engine (engine/stockOpportunityEngine.ts v20.1):** Intraday and swing scans for NIFTY 50 stocks. Uses batch Upstox quote API. Per-stock VWAP/EMA not computed (noted in ponytail comment — requires 50 candle-history calls). Long-term engine notes `NO_FUNDAMENTAL_PROVIDER` — fundamental data (P/E, earnings) not available.

**Strategy Evidence Engine (src/lib/strategyEvidenceEngine.ts):** Aggregates paper trade outcomes, evaluates gate criteria, produces GO/HOLD/REJECT verdict. Correctly separates synthetic from genuine evidence. Wired to `/api/strategy/evidence`.

---

## 7. Paper Trading & Settlement

**paperEngine.ts:** Complete. Full contract-identity matching (5-field), expiry-before-valuation ordering, in-memory rollback on persistence failure, capital reservation system, multi-leg support, STALE_QUOTES monitoring. All state-mutating paths covered by rollback. Settlement pending → Bhavcopy ingestion → verified or unverified. Phase 2.3.16 defects DEF-06, DEF-07, G1–G14 addressed (except G5 disk crash recovery and G13 exercise STT — documented as blocked).

**settlementIngestion.ts:** Complete (Phase 2.3.13–2.3.16). ZIP extraction, RFC 4180 CSV parsing, 5-field identity, idempotency, candidate revision workflow, quarantine log, operator promotion audit trail. Exercise STT/IPFT flagged `UNVERIFIED_MISSING_EXERCISE_SPECIFICATION`.

**paperLedgerStore.ts:** Atomic snapshot writes (tmp → rename), backup before overwrite, event log append. Disk crash recovery between write and rename is a documented open issue.

**paperReport.ts:** `buildPaperLedgerReport()` produces realized/unrealized PnL, capital reconciliation, provenance-filtered verified-live counts. `reconcileLedger()` cross-checks in-memory vs events for consistency. Exercise costs annotated as unverified.

**paperTypes.ts:** Full type coverage including settlement lifecycle, capital reservation, cost verification status.

**paperStateMachine.ts:** `canTransition()` enforces valid state machine transitions.

**paperStore.ts / paperOpportunityStore.ts:** Production storage wired to `.data/`. Test isolation via `PAPER_TRADES_DIR` / `SESSION_EVIDENCE_DIR`.

**Runners/scripts:** `paper-live.mjs`, `run-paper-supervisor.mjs` exist. Currently stopped. LaunchAgent disabled.

---

## 8. Reporting

**Paper ledger report:** Complete. Separated by provenance (UPSTOX_LIVE, SYNTHETIC_TEST, MOCK_SIMULATION, etc.). Unverified exercise costs explicitly flagged.

**Recommendations journal:** `recommendationStore.ts` persists every generated recommendation as immutable snapshot. Evaluation (outcome) can be attached. Wired to journal page and evidence engine.

**Strategy performance page:** Shows intraday replay (frozen results), positional V1/V2, paper opportunity outcomes. No fabricated statistics.

**Backtest/walk-forward performance:** `services/performance/` — report builder, journal, metrics, equity curve. Walk-forward engine with window-by-window results.

**Options audit:** `optionsAudit.ts` + `optionsAuditReport.ts` — multi-round audit per session, verdict (DATA_TRUSTED / PRICES_TRUSTED_IV_UNVERIFIED / DATA_NOT_TRUSTED / INSUFFICIENT), displayed in OpsPanel and `/options-audit`.

---

## 9. Tests

**Test file count:** 72 test files (`find src -name "*.test.ts" | wc -l`).

**Coverage by layer:**
- Services: futures, breadth, market data, news, RSS, technical, backtest, paper trading, settlement, multi-session, performance, phase integration, auth, contract freshness, timestamps
- Engine: strategy/analysis, intraday replay, positional V1/V2, opportunity engine
- Lib: calendar, contract integrity, dashboard, evaluation, journal, ops, paper integrity, recommendation, risk, score text, runtime trust, walk-forward
- API: options canary route
- Research: audit experiments, candidate status, options inventory

**Verified passing (this session):** 356 tests, 356 pass, 0 fail. TypeScript: clean.

**Test script isolation:** `npm test` sets `UPSTOX_TOKEN_FILE`, `SESSION_EVIDENCE_DIR`, `PAPER_TRADES_DIR` to `.test-data/` paths. Multi-session harness wraps all fs write APIs with a path-guarded write guard.

**Gap:** No Playwright / E2E / browser tests. No API route integration tests (routes are tested via engine unit tests).

---

## 10. Deployment & Config

**Next.js version:** 16.3.8 (latest Next.js 15 is 15.x; note 16.x is the current release). App Router throughout.

**Dev server:** `next dev -p 3123`. Build: `next build`. Start: `next start`.

**Environment variables required:**
- `UPSTOX_CLIENT_ID`, `UPSTOX_CLIENT_SECRET`, `UPSTOX_REDIRECT_URI` — OAuth
- `MARKET_DATA_PROVIDER=upstox` — switches from mock to live
- `UPSTOX_TOKEN_FILE` — token storage path (default: `.data/upstox-token.json`)
- `PAPER_TRADES_DIR`, `SESSION_EVIDENCE_DIR`, `ACCOUNT_CAPITAL` — paper trading config
- `OPTION_CHAIN_RANGE` — optional, default 10

**Env file:** `../.env` exists (not `.env.local`). Contents not inspected (safety rule).

**PM2/Docker:** No `ecosystem.config.*`, no `Dockerfile`, no `docker-compose`. No process manager configuration found.

**LaunchAgent:** Disabled. Not restored.

**Production build:** `.next/` directory exists (BUILD_ID, app-path-routes-manifest.json, `build/` dir present). Build was previously run; `npm run build` not re-run this session.

**Logging:** Structured JSON logs via `console.info/warn` in upstoxMarket.ts for every Upstox request. No centralized log aggregation configured.

**Security:** No broker order endpoints. OAuth PKCE state, no token in logs. Cookie-based CSRF. UPSTOX_TOKEN_FILE path uses server-only env var.

---

## 11. Critical Gaps

### G-STRAT: Strategy 11.4 Baseline Unverified
**File:** `src/lib/engine/strategy.ts` lines 283–288  
**Issue:** Working-tree version differs from last commit (`bcdd18a`) by a substantive 4-line change to staleness signal logic. No git tag, no frozen backup. Strategy owner must decide which version is the approved 11.4-frozen baseline.  
**Consequence:** Cannot certify strategy integrity for any paper or live evidence.

### G-DISK: Disk Crash Recovery Unimplemented
**Files:** `src/lib/services/paperLedgerStore.ts`  
**Issue:** Between `writeFileSync(tmp)` and `renameSync(tmp → final)`, a crash leaves an orphaned `.tmp-*` file. Recovery requires event-log replay; the event schema and idempotency model are not specified.  
**Consequence:** A crash during persistence leaves ledger in an unknown state until manually inspected.

### G-STT: Exercise Statutory Charges Unverified
**Files:** `src/lib/paperTypes.ts:74`, `src/lib/paperEngine.ts:860,949,1019`  
**Issue:** STT on exercise and IPFT charges are flagged `UNVERIFIED_MISSING_EXERCISE_SPECIFICATION`. Rates depend on tax year and contract type; no authoritative specification available.  
**Consequence:** Net P&L for expired/exercised options is not fully verified. Correctly annotated.

### G-FUND: No Fundamental Data Provider
**File:** `src/lib/engine/longTermEngine.ts` (`NO_FUNDAMENTAL_PROVIDER`)  
**Issue:** Long-term stock analysis has no P/E, earnings, or dividend data. Only price-based scoring.  
**Consequence:** Long-term opportunity grades are incomplete.

### G-PERSTOCK: No Per-Stock Intraday Technicals
**File:** `src/lib/engine/stockOpportunityEngine.ts` (ponytail comment)  
**Issue:** Per-stock VWAP/EMA/RSI require 50 candle-history calls; not computed. Only relative strength vs NIFTY and price-level analysis used.  
**Consequence:** Intraday stock grades are based on quote data only, not full technical profile.

### G-E2E: No End-to-End Browser Tests
**Issue:** No Playwright, Cypress, or equivalent. Frontend correctness under load or edge cases (empty data, API errors, partial hydration) is not covered by automated tests.

### G-PM2: No Process Manager Configuration
**Issue:** No PM2 ecosystem file, no Docker, no systemd unit. Deployment requires manual process management.

### G-OPTCHAIN: Option Quote Feature Flags Disabled
**Files:** `optionContractLTT.ts`, `optionQuoteCanary.ts`  
**Issue:** `OPTION_QUOTE_LTT_ENABLED` and `OPTION_QUOTE_CANARY_ENABLED` both false. Contract-level option LTP and canary verification are therefore disabled. Settlement relies on Bhavcopy ingestion, not real-time option quotes.

---

## 12. Implementation Priority Order (Offline-Safe)

Work that can be completed **without Upstox live authentication:**

1. **Strategy 11.4 baseline decision** — compare committed vs working-tree, get strategy-owner sign-off, git-tag the approved version. Purely documentation + git.
2. **Disk crash recovery spec** — define event schema, ordering contract, idempotency model. No code until spec exists.
3. **PM2 ecosystem config** — create `ecosystem.config.cjs` for the Next.js process and paper runner scripts. Pure configuration.
4. **E2E test skeleton** — Playwright setup with mock-data test that loads the dashboard and asserts no unhandled errors.
5. **Exercise STT/IPFT** — obtain authoritative specification; implement once available.
6. **Fundamental data provider** — integrate a free or licensed data source (NSE/BSE fundamentals); no Upstox dependency.

Work that **requires Upstox live authentication:**
7. **Option quote LTT / canary** — enable after token is refreshed and tested.
8. **Per-stock intraday technicals** — 50 batch candle calls; needs live Upstox account.
9. **Historical options data** — requires Upstox Plus plan; blocked on plan upgrade.
10. **Backtest with real candles** — requires live Upstox historical data access.
11. **Live paper trading** — start runner + supervisor after token refresh and LaunchAgent re-enable decision.
