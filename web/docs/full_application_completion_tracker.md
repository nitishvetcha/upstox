# Full Application Completion Tracker
**Last updated:** 2026-11-03 (Round 2 final remediation) | **Source:** read-only source inspection + documentation consistency remediation

Status definitions:
- **Complete** — implemented, tested, verified working
- **Partially Complete** — implemented but with known gaps or unverified paths
- **Not Implemented** — no implementation exists
- **Blocked** — depends on missing specification, external data, or decision
- **Requires Live Auth** — implementation complete but real data requires valid Upstox token

---

## Frontend Pages

| Feature | File | Status | Notes |
|---------|------|--------|-------|
| Dashboard (main) | `src/app/page.tsx` | **Complete** | OpsPanel, MarketCards, RecommendationCard, NewsPanel, PriceChart, DataStatus all rendered |
| Dashboard — logged-out state | `src/app/page.tsx`, `OpsPanel` | **Complete** | EXPIRED/MISSING auth shown; DataStatus shows MOCK FALLBACK |
| Opportunities page | `src/app/opportunities/page.tsx` | **Complete** | Options + stock intraday/swing/long-term; grading and glossary |
| Opportunity Journal | `src/app/opportunity-journal/page.tsx` | **Complete** | Paper opportunities, session evidence, auth/runner status banner |
| Section router | `src/app/[section]/page.tsx` | **Complete** | 13 slugs routed; paper-trading section renders inline |
| Market History | `src/app/market-history/page.tsx` | **Requires Live Auth** | UI complete; chart renders; candle data requires Upstox |
| Performance / Backtest | `src/app/performance/page.tsx` | **Requires Live Auth** | UI complete; backtest requires real candles |
| Strategy Evidence | `src/app/strategy-evidence/page.tsx` | **Complete** | Evidence report rendered; works with synthetic data |
| Strategy Performance | `src/app/strategy-performance/page.tsx` | **Complete** | Frozen intraday replay + positional results rendered |
| Options Audit | `src/app/options-audit/page.tsx` | **Complete** | Renders per-index audit verdicts |
| Options Research | `src/app/options-research/page.tsx` | **Complete** | Inventory list; works without auth |
| Option History | `src/app/option-history/page.tsx` | **Requires Live Auth** | Requires Upstox Plus plan for historical option data |
| Recommendation Debug | `src/app/recommendation-debug/page.tsx` | **Complete** | Diagnostic panel with factor breakdown |

---

## UI Components

| Feature | File | Status | Notes |
|---------|------|--------|-------|
| TopBar (tickers, auth, refresh) | `src/components/TopBar.tsx` | **Complete** | Live clock, change %, login button on auth failure |
| Sidebar navigation | `src/components/Sidebar.tsx` | **Complete** | 13 sections, active state |
| MarketCard (NIFTY/BANKNIFTY) | `src/components/MarketCard.tsx` | **Complete** | Spot, indicators, option chain summary, source labels |
| RecommendationCard | `src/components/RecommendationCard.tsx` | **Complete** | TRADE/WAIT/NO TRADE, factors, plan details |
| DataStatus banner | `src/components/DataStatus.tsx` | **Complete** | LIVE/MOCK/PARTIAL/FALLBACK with per-reason text |
| OpsPanel (system health) | `src/components/OpsPanel.tsx` | **Complete** | Auth, runner, source status, options audit verdict, attention list |
| SectionViews (all sections) | `src/components/SectionViews.tsx` | **Complete** | 8 section views implemented |
| AnalysisPanels (6 panels) | `src/components/AnalysisPanels.tsx` | **Complete** | Market, Risk, Technicals, Options, Levels, DataQuality |
| NewsPanel | `src/components/NewsPanel.tsx` | **Complete** | Per-index sentiment + event risk |
| PriceChart (Recharts) | `src/components/PriceChart.tsx` | **Requires Live Auth** | UI complete; real candle data requires Upstox |
| RecommendationWidget | `src/components/RecommendationWidget.tsx` | **Complete** | Polls today's recommendation |
| RecommendationJournal | `src/components/RecommendationJournal.tsx` | **Complete** | Lists journal entries |
| WalkForwardView | `src/components/WalkForwardView.tsx` | **Requires Live Auth** | UI complete; requires real backtest runs |
| Performance equity charts | `src/components/performance/EquityCharts.tsx` | **Requires Live Auth** | UI complete; requires backtest data |
| Mobile responsiveness | All components | **Complete** | Tailwind responsive grid throughout; `ResponsiveContainer` for charts |

---

## API Routes

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /api/market/[index]` | **Complete** | Mock fallback when logged out |
| `GET /api/analysis/[index]` | **Complete** | Strategy analysis on mock or live snapshot |
| `GET /api/option-chain/[index]` | **Requires Live Auth** | Returns mock chain without token |
| `GET /api/technical/[index]` | **Requires Live Auth** | Returns mock technicals without token |
| `GET /api/news/[index]` | **Complete** | RSS provider; independent of Upstox |
| `GET /api/events/[index]` | **Complete** | Event risk detection; independent |
| `GET /api/sentiment/[index]` | **Complete** | Sentiment scoring |
| `GET /api/breadth/[index]` | **Requires Live Auth** | Constituent quotes require Upstox |
| `GET /api/auth/status` | **Complete** | Token status + optional connection verify |
| `GET /api/auth/login` | **Requires Live Auth** | OAuth redirect; needs valid credentials |
| `GET /api/auth/callback` | **Requires Live Auth** | OAuth callback; token exchange |
| `POST /api/auth/logout` | **Complete** | Clears token file |
| `GET /api/auth/health` | **Complete** | Health check |
| `GET /api/opportunities/top` | **Complete** | Multi-engine aggregation; mock data when logged out |
| `GET /api/opportunities/daily-summary` | **Complete** | Reads paperOpportunityStore |
| `GET /api/opportunities/options` | **Complete** | Options opportunities |
| `GET /api/opportunities/stocks/intraday` | **Requires Live Auth** | Needs Upstox stock quotes |
| `GET /api/opportunities/stocks/swing` | **Requires Live Auth** | Needs Upstox historical data |
| `GET /api/opportunities/stocks/long-term` | **Partially Complete** | No fundamental data provider; price-only scoring |
| `GET /api/opportunities/outcomes` | **Complete** | Reads tracking store |
| `POST /api/opportunities/track` | **Complete** | Saves opportunity tracking record |
| `GET /api/paper-opportunities` | **Complete** | List all paper opportunities |
| `POST /api/paper-opportunities` | **Complete** | Create; rejects non-LIVE data sources |
| `GET /api/paper-opportunities/[id]` | **Complete** | Single opportunity detail |
| `POST /api/paper-opportunities/[id]/evaluate` | **Complete** | Evaluate a specific opportunity |
| `POST /api/paper-opportunities/collect` | **Requires Live Auth** | Collects live snapshots |
| `GET /api/paper-opportunities/monitor` | **Complete** | Monitor runner status |
| `GET /api/paper-opportunities/open` | **Complete** | Open paper opportunities |
| `GET /api/paper-opportunities/sessions` | **Complete** | Session evidence |
| `GET /api/paper-trading/portfolio` | **Complete** | Ledger report + reconciliation |
| `GET /api/paper-trading/trades` | **Complete** | List trades |
| `GET /api/paper-trading/trades/[id]` | **Complete** | Single trade detail |
| `POST /api/paper-trading/enter` | **Complete** | Open a paper trade |
| `POST /api/paper-trading/close` | **Complete** | Close a paper trade |
| `POST /api/paper-trading/update` | **Complete** | Update trade monitoring |
| `GET /api/recommendations` | **Complete** | Journal entries |
| `POST /api/recommendations/generate` | **Complete** | Generate + journal; mock when logged out |
| `GET /api/recommendations/today` | **Complete** | Today's recommendation |
| `GET /api/recommendations/[id]` | **Complete** | Single recommendation |
| `POST /api/recommendations/[id]/paper-trade` | **Complete** | Convert recommendation to paper trade |
| `POST /api/recommendations/[id]/refresh` | **Complete** | Re-evaluate recommendation |
| `GET /api/recommendations/analytics` | **Complete** | Aggregated analytics |
| `GET /api/recommendations/daily-summary` | **Complete** | Daily summary |
| `GET /api/recommendations/diagnostic` | **Complete** | Diagnostic breakdown |
| `GET /api/recommendations/evaluation` | **Complete** | Evaluation results |
| `GET /api/recommendations/export` | **Complete** | Export journal |
| `POST /api/risk/assess` | **Partially Complete** | Risk assessment logic complete; route handler lacks input validation — missing fields (e.g. absent `maxLoss`) cause a runtime type error |
| `GET /api/risk/config` | **Complete** | Current risk config |
| `GET /api/strategy/evidence` | **Complete** | Strategy evidence report |
| `GET /api/strategy/evidence/export` | **Complete** | Export evidence |
| `POST /api/backtest/run` | **Requires Live Auth** | Requires real historical candles |
| `GET /api/backtest/runs` | **Complete** | List saved backtest runs |
| `GET /api/backtest/runs/[id]` | **Complete** | Single run detail |
| `GET /api/backtest/compare` | **Complete** | Run comparison |
| `GET /api/backtest/compare-runs` | **Complete** | Bulk comparison |
| `GET /api/backtest/scenarios` | **Complete** | Scenario definitions |
| `GET /api/backtest/data-quality` | **Complete** | Data quality report |
| `GET /api/backtest/walk-forward` | **Requires Live Auth** | Walk-forward requires real candles |
| `GET /api/backtest/walk-forward/[id]/*` | **Requires Live Auth** | Equity, trades, windows, regimes |
| `GET /api/performance/[runId]/*` | **Requires Live Auth** | Requires a completed backtest run |
| `GET /api/stocks/[symbol]` | **Requires Live Auth** | Single stock quote |
| `GET /api/stocks/[symbol]/history` | **Requires Live Auth** | Historical candles |
| `GET /api/stocks/[symbol]/technicals` | **Requires Live Auth** | Stock technicals |
| `GET /api/stocks/search` | **Requires Live Auth** | Instrument search |
| `GET /api/historical-options/data-quality` | **Blocked** | Requires Upstox Plus plan |
| `GET /api/options-canary` | **Blocked** | `OPTION_QUOTE_CANARY_ENABLED=false` |
| `GET /api/market/expiries/[index]` | **Requires Live Auth** | Expiry list from Upstox |

---

## Market Data & Authentication

| Feature | Status | Notes |
|---------|--------|-------|
| OAuth login flow | **Requires Live Auth** | Complete implementation; needs valid credentials |
| OAuth callback + token exchange | **Requires Live Auth** | Implemented |
| Token storage (file-based) | **Complete** | `.data/upstox-token.json`; `UPSTOX_TOKEN_FILE` override |
| Token expiry detection | **Complete** | 401 → `markTokenInvalid()`; status check on every request |
| Mock fallback on auth failure | **Complete** | `withFallback()` handles all error cases |
| Logged-out UI state | **Complete** | DataStatus, OpsPanel, TopBar all show clear state |
| Live quotes (NIFTY/BANKNIFTY) | **Requires Live Auth** | |
| Option chain (live) | **Requires Live Auth** | Expiry selection, ATM, full chain |
| Technical indicators (live candles) | **Requires Live Auth** | EMA, RSI, ATR, MACD, VWAP from real candles |
| Futures VWAP (live) | **Requires Live Auth** | Contract selection + session VWAP |
| Market breadth (live) | **Requires Live Auth** | NIFTY 50 constituent batch quotes |
| RSS news feed | **Complete** | Independent of Upstox; runs without auth |
| Event risk detection | **Complete** | Independent of Upstox |
| Mock data (development) | **Complete** | Black-Scholes chain, realistic indicators, mock news |
| Data source labelling | **Complete** | Per-subsystem source in every snapshot |
| Freshness validation | **Complete** | `tradeFreshnessOf()` with LTT-based staleness |
| TTL caching | **Complete** | `cache.ts` with per-endpoint TTLs |

---

## Analysis Engine

| Feature | Status | Notes |
|---------|--------|-------|
| EMA 9/21/50/200 | **Complete** | |
| RSI 14 | **Complete** | |
| ATR 14 | **Complete** | |
| MACD (12/26/9) | **Complete** | |
| Bollinger Bands | **Complete** | |
| ADX | **Complete** | |
| Futures VWAP | **Complete** | Session VWAP from futures candles |
| Options chain PCR (OI + volume) | **Complete** | |
| OI-based support/resistance | **Complete** | |
| Max pain calculation | **Complete** | |
| Expected move (from IV) | **Complete** | |
| IV percentile | **Complete** | |
| Market breadth | **Complete** (live) / **Complete** (mock) | |
| News sentiment scoring | **Complete** | RSS-based; 0 = neutral |
| Event risk detection | **Complete** | HIGH/EXTREME blocks TRADE |
| Factor aggregation (8 factors) | **Complete** | Each factor guards against missing inputs |
| Chart time series | **Complete** | 5 timeframes via `chartSeries()` |

---

## Strategy Engine (11.4)

| Feature | Status | Notes |
|---------|--------|-------|
| Strategy version constant | **Complete** | `"11.4-frozen"` in `journalTypes.ts` |
| **Strategy baseline integrity** | **Complete** | Restored to bcdd18a; SHA-256 d0170b40 verified; see `docs/strategy_11_4_baseline_verification.md` |
| Entry conditions | **Complete** | Restored to committed baseline (`bcdd18a`); no permanent git-tag required |
| Exit conditions | **Complete** | Stop-loss, target1, target2 wired |
| Signal generation (TRADE/WAIT/NO TRADE) | **Complete** | With factor breakdown |
| Staleness filters | **Complete** | Restored: all staleness (incl. option-chain/news) → NO TRADE |
| Conflict detection | **Complete** | Multiple signals → WAIT |
| Strike/expiry selection | **Complete** | Wing width from ATR; nearest-delta selection |
| Risk filters | **Complete** | Min score, min R:R, max bid-ask % |
| Recommendation journaling | **Complete** | Every generated recommendation persisted |
| Strategy evidence evaluation | **Complete** | Paper outcomes feed evidence engine |
| Opportunity Engine (v20.1) | **Complete** | Independent of 11.4; 8-factor scoring |
| Stock Opportunity Engine (v20.1) | **Partially Complete** | Existing OHLCV scoring is implemented; per-stock EMA/RSI/VWAP overlay is design-only and not wired; pure implementation/tests and live integration remain future work |
| Long-term engine | **Blocked** | No fundamental data provider; provider candidates identified (FMP, Twelve Data) but none selected, approved, or API-keyed; see `docs/fundamental_provider_comparison.md` |
| Positional engine (V2) | **Complete** | With frozen results for evidence |
| Intraday replay | **Complete** | With frozen results |

---

## Paper Trading

| Feature | Status | Notes |
|---------|--------|-------|
| Trade creation from recommendation | **Complete** | |
| Multi-leg position creation | **Complete** | |
| Capital reservation | **Complete** | |
| Full contract identity validation | **Complete** | 5-field: underlying, expiry, strike, type, instrument key |
| Expiry-before-valuation ordering | **Complete** | DEF-07 resolved |
| Stop-loss exit | **Complete** | |
| Target1/Target2 exit | **Complete** | |
| EOD exit | **Complete** | |
| Stale quotes monitoring | **Complete** | STALE_QUOTES with reason |
| Duplicate trade prevention | **Complete** | |
| In-memory rollback on persist failure | **Complete** | All mutation paths |
| Disk crash recovery | **Blocked** | Recovery design complete; 15 owner decisions pending (D1–D11, D8a, D12–D14; D15 retired/absorbed; see `docs/disk_crash_recovery_implementation_plan.md` §10); not implemented |
| Test isolation (SESSION_EVIDENCE_DIR etc.) | **Complete** | G1 resolved |
| Settlement pending transition | **Complete** | |
| Bhavcopy ingestion (ZIP + CSV) | **Complete** | |
| 5-field settlement identity | **Complete** | TradDt, TckrSymb, XpryDt, StrkPric, OptnTp |
| Settlement idempotency | **Complete** | |
| Multi-leg all-or-nothing settlement | **Complete** | |
| Candidate revision workflow | **Complete** | Operator promotion with audit trail |
| Quarantine log (persistent) | **Complete** | G7 resolved |
| Unsupported symbol handling | **Complete** | G14 resolved |
| Exercise STT/IPFT | **Blocked** | Authoritative statutory specification required |
| Restart recovery | **Complete** | Ledger reloaded from snapshot on restart |
| Capital release on trade close/settlement | **Complete** | |
| SETTLEMENT_UNVERIFIED path | **Complete** | When no Bhavcopy available |
| Paper runner script | **Complete** | `paper-live.mjs`; currently stopped |
| Supervisor script | **Complete** | `run-paper-supervisor.mjs`; currently stopped |

---

## Reporting

| Feature | Status | Notes |
|---------|--------|-------|
| Paper ledger report | **Complete** | Realized/unrealized PnL, capital reconciliation |
| Provenance separation (synthetic vs live) | **Complete** | G9, G11 resolved |
| Exercise cost annotation | **Complete** | Explicitly unverified |
| Recommendation journal | **Complete** | Immutable snapshots + outcome attachment |
| Strategy evidence report | **Complete** | Gate evaluation, per-index verdict |
| Options data audit | **Complete** | Multi-round per-session, data quality verdict |
| Backtest performance report | **Requires Live Auth** | Requires completed backtest run |
| Walk-forward performance report | **Requires Live Auth** | Requires walk-forward run |
| Intraday replay results | **Complete** | Frozen results displayed |
| P&L calculation (net of costs) | **Partially Complete** | Transaction costs modeled; exercise STT unverified |
| Ledger reconciliation | **Complete** | `reconcileLedger()` cross-checks memory vs events |

---

## Testing

| Feature | Status | Notes |
|---------|--------|-------|
| Service unit tests | **Complete** | 365 tests, 0 failing (including new API integration + strategy restored) |
| Engine unit tests | **Complete** | Strategy, analysis, opportunity, positional, intraday |
| Paper trading lifecycle tests | **Complete** | Multi-session harness, persistence fault injection |
| Settlement ingestion tests | **Complete** | ZIP parsing, CSV parsing, identity, idempotency, quarantine |
| Auth unit tests | **Complete** | |
| Test isolation (write guard) | **Complete** | Path-guarded write interceptor in multi-session harness |
| TypeScript | **Complete** | 0 errors |
| E2E / browser tests | **Complete** | 27 passed / 4 skipped / 0 failed — `@playwright/test` 1.64.1 + Chromium installed; all selectors fixed |
| API route integration tests | **Complete** | `apiIntegration.test.ts` — 9 tests, service-layer wiring verified |
| Performance / load tests | **Not Implemented** | |

---

## Deployment & Operations

| Feature | Status | Notes |
|---------|--------|-------|
| Development server (`next dev`) | **Complete** | Port 3123 |
| Production build (`.next/`) | **Complete** | Previously built; current working tree changes not built |
| Environment variable documentation | **Complete** | `.env.example` created with all 32 vars, safe defaults, inline docs |
| PM2 / process manager config | **Complete** | `ecosystem.config.cjs` created; dashboard only, no runner/supervisor |
| Docker / container config | **Not Implemented** | |
| LaunchAgent (paper runner) | **Complete** (disabled) | Config exists; deliberately disabled |
| Structured logging | **Partially Complete** | Upstox request logs via JSON; no log aggregation |
| Health check endpoint | **Complete** | `GET /api/auth/health` |
| Option quote LTT feature flag | **Complete** (disabled) | `OPTION_QUOTE_LTT_ENABLED=false`; guarded by env var |
| Option quote canary feature flag | **Complete** (disabled) | `OPTION_QUOTE_CANARY_ENABLED=false` |
| Live broker execution | **Not Implemented** | Intentionally unauthorized |

---

## Summary Counts

| Status | Count |
|--------|-------|
| Complete | 159 |
| Partially Complete | 5 |
| Requires Live Auth | 32 |
| Blocked | 5 |
| Not Implemented | 3 |
| **Total rows** | **204** |

*Round 2 final remediation (2026-11-03): The verified 204-row baseline was preserved. This documentation-only pass did not change feature statuses or counts. See `docs/round2_final_consistency_audit.md`.*

**Round 2 final audit corrections (2026-11-03):**
- Summary counts fully recounted: 204 rows, 159 Complete, 5 PC, 32 RLA, 5 Blocked, 3 NI
- Disk crash recovery row note: authoritative register is 15 pending owner decisions (D1–D11, D8a, D12–D14); D15 is retired into D8a
- Round 2 correction report arithmetic error noted: "Complete 94→92 (−2)" was wrong — correct delta is −1 (only risk/assess moved Complete→PC; long-term engine was PC→Blocked, not Complete→Blocked)

**Round 2 corrections (2026-11-03):**
- POST /api/risk/assess: Complete → Partially Complete (route handler lacks input validation)
- Long-term engine: Partially Complete → Blocked (no provider selected, approved, or licensed)
- Strategy git-tag removed from all blockers/work lists (owner: no permanent tag required)
- Entry conditions note updated: removed "git-tag pending" language

**Round 2 changes (2026-11-03):**
- Disk crash recovery: event type enumeration/design complete; implementation remains blocked on 15 owner decisions
- Stock Opportunity Engine: per-stock technical design and synthetic test matrix written; implementation and live wiring are not complete
- Long-term engine: fundamental provider comparison framework written; no provider is selected and all current pricing/rate/coverage claims require official verification
- Exercise STT/IPFT: authoritative statutory sources identified; rates not changed pending verified text
- Historical options: Upstox Plus plan dependency documented; upgrade path documented
- Skipped E2E tests: all 4 audited; all correctly blocked on auth; no false positives found
- Dashboard gaps: none found offline; 1 medium-priority item (POST /api/risk/assess input guard)
- Docs: 4 new documents created

**Round 1 changes (2026-11-03):**
- Strategy 11.4 baseline: Blocked → Complete (restored to bcdd18a, SHA-256 verified)
- .env.example: Partially Complete → Complete
- PM2 config: Not Implemented → Complete
- E2E tests: Not Implemented → Complete (27 passed / 4 skipped / 0 failed; @playwright/test 1.64.1 installed)
- API integration tests: Not Implemented → Complete (9 tests, service-layer wiring)
- Entry conditions / Staleness filters: Partially Complete → Complete (strategy restored)

**Remaining blocked items (post-Round 2 corrections):**
1. Disk crash recovery — authoritative design ready (`docs/disk_crash_recovery_implementation_plan.md`); all 15 decisions D1–D11, D8a, D12–D14 require owner approval before code changes
2. Exercise STT/IPFT — authoritative statutory text (Finance Act / NSE circular) required
3. Historical options — Upstox Plus plan upgrade required; auth also required
4. Fundamental data provider — evaluation subjects documented; **nothing selected, approved, credentialed, purchased, or verified**
5. Per-stock EMA/RSI/VWAP — design only; pure code/tests are not yet implemented, and live path additionally requires authorization/auth/session-calendar decisions
6. `POST /api/risk/assess` input guard — TypeScript-only change; offline-completable

**Remaining offline-completable work:**
- `POST /api/risk/assess` input validation (TypeScript only — add body shape guard to route handler)
- Per-stock technicals: pure implementation and PT01–PT23 with deterministic synthetic fixtures, in a separately authorized code phase
- Disk crash recovery: R01–R27 plus additional replay/promotion tests, only after all 15 decisions are approved and in a separately authorized code phase
- Docker config (if deployment target is containerised)

**Removed from tracker:**
- Strategy git-tag `strategy-11.4-frozen` — owner confirmed no permanent tag required
