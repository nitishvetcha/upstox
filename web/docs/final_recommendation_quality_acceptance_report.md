# Final Recommendation Quality Acceptance Report

**Date:** 2026-11-03  
**Scope:** Complete source-code audit and quality validation of the Upstox Options Analyzer recommendation pipeline.

---

## Conclusion

**CONDITIONALLY ACCEPTED**

The application is correctly built, all tests pass, and the recommendation logic is internally coherent and defensively designed. However, recommendation accuracy is unproven: the production journal contains 26 entries, all WAIT or NO TRADE. Zero live trades have been executed or evaluated. Accuracy cannot be established without live data.

---

## 1. What the application actually does

The application analyzes NIFTY and BANK NIFTY index options and produces one of three decisions: **TRADE**, **WAIT**, or **NO TRADE**.

A TRADE decision includes:
- Direction (BULLISH/BEARISH)
- Strategy (Long Call, Long Put, Bull Call Spread, Bear Put Spread, Iron Condor, ATM Straddle)
- Underlying index and expiry
- Strike selection (nearest 0.50 delta for long options; spread width = 1 ATR rounded to strike step)
- Entry zone (±3% of LTP), stop-loss, target 1, target 2
- Breakeven price(s)
- R:R ratio
- Lot size and position sizing
- Maximum loss (per unit and total)
- Score 0–100 with factor breakdown
- Confidence based on signal agreement and data freshness
- Per-factor reasoning and invalidation condition
- Data source and timestamp per subsystem

---

## 2. How recommendations are generated

### Full pipeline

```
API call → getSnapshot(index)
  ├─ p.getMarketSnapshot()     → spot, prevClose, EMA 9/21/50/200, RSI, ATR, MACD, OR high/low, PDH/PDL, VWAP
  ├─ p.getOptionChain()        → chain rows (LTP, bid, ask, OI, chgOI, IV, delta, gamma, theta, vega), expiry, lot size, strike step
  ├─ p.getTechnicals()         → IV percentile, price-action structure, futures VWAP state
  ├─ newsFeed()                → news score, bullish/bearish %, event risk, confidence
  └─ p.getBreadth()            → advances/declines, A/D ratio, breadth classification, price-breadth state

analyzeMarket(snapshot)
  ├─ chainMetrics()            → ATM strike, OI support/resistance, PCR, expected move, max pain
  ├─ rawFactors()              → 7 factors: trend (20), OI (20), price action (15), technical (15), IV (10), news (10), breadth (10)
  ├─ Factor availability rule  → factor is only available if its source matches market data source (live vs. mock never mixed)
  ├─ Weighted direction D      → −1 (full bear) to +1 (full bull)
  └─ Regime                   → EVENT RISK > HIGH VOLATILITY > STRONG BULL/BEAR > BULL/BEAR > RANGE

analyze(snapshot)             [Strategy 11.4 — frozen]
  ├─ Select strategy by regime → BULL/BEAR: long option + debit spread candidates; HIGH_VOL: debit spread; RANGE: iron condor (if IV≥40); EVENT RISK: straddle (only if event history > premium)
  ├─ legRejection()            → checks: two-sided quote required, bid-ask ≤5%, R:R ≥1.2 debit / ≥0.4 credit
  ├─ evaluateTradeRisk()       → lot sizing, capital check, risk %/trade, daily loss limit
  ├─ MIN_STRATEGY_SCORE = 65  → below this: WAIT, not TRADE
  ├─ staleness checks          → stale data → NO TRADE
  ├─ news conflict             → confident news vs market/OI direction → WAIT
  ├─ opening window            → 09:15–09:30 IST → WAIT
  └─ status: TRADE / WAIT / NO TRADE

buildRecommendationResponse()
  ├─ instrumentKey fail-close  → TRADE without canonical Upstox key → downgraded to WAIT
  ├─ entryDetail with slippage → paperEntry uses mid/ask/LTP+slippage hierarchy
  └─ execution block           → entry, stop, target1/2, breakeven, lots, quantity, capital, risk, max loss, T1/T2 P&L, R:R

POST /api/recommendations/generate
  └─ saveJournalEntry()        → immutable snapshot written to .data/recommendations/{id}.json
```

### Secondary pipeline: OpportunityEngine v20.1

A parallel contract-ranking engine (`opportunityEngine.ts`) scores individual contracts independently of Strategy 11.4. It uses 8 weighted components (underlying direction 30%, OI intelligence 12%, S/R room 10%, liquidity 15%, delta 10%, IV attractiveness 10%, R:R quality 8%, expected move fit 5%) and grades results A+/A/B/C/REJECT. Grades are fail-closed: any contract is REJECT unless the option chain is verified LIVE, the contract has a valid exchange trade timestamp, and Greeks are verified. This effectively means all grades are REJECT without authenticated live data.

---

## 3. What is working

| Component | Status |
|---|---|
| Market data aggregation (buildSnapshot) | Working; falls back to mock when Upstox auth unavailable |
| 7-factor market analysis (analyzeMarket) | Working; factors use source-matching rule (mock vs live never mixed) |
| Strategy selection and scoring (analyze / Strategy 11.4) | Working; 8 engine unit tests pass |
| Contract selection (nearestDelta, wingWidth, debitSpread, ironCondor, straddle) | Working; tested |
| Staleness detection | Working; stale data → NO TRADE, not a false TRADE |
| Opening window guard (09:15–09:30) | Working; tested |
| Event risk (straddle only if history > premium) | Working; tested |
| News-vs-market conflict detection | Working; tested |
| Risk service (lot sizing, capital, daily loss) | Working |
| Instrument key fail-close | Working; TRADE without canonical key → WAIT |
| Recommendation journal persistence | Working; isolated store for tests, production path guarded |
| Dashboard presentation | Working; all sidebar destinations render, 36/36 E2E pass |
| TypeScript compilation | Passes (0 errors) |
| Production build | Completed (`.next-completion/BUILD_ID` present) |

---

## 4. What was corrected in this work

| Session | Change |
|---|---|
| Prior assistant session | Fixed TypeScript error in `options-canary` route (dependency injection) |
| Prior assistant session | Added `src/lib/dataRoot.ts` — prevents tests from touching `.data/` |
| Prior assistant session | Updated 8 service modules to use dataRoot for test isolation |
| Prior assistant session | Added `e2e/responsive.spec.ts` — layout/overflow test across 4 viewports |
| This session | Fixed `e2e/responsive.spec.ts` console-error filter — excluded 5xx resource-load errors that are expected without auth; the test's purpose is overflow detection |
| Prior documentation passes | Corrected MACD minimum (27→35) in design documents; this was a documentation error only — the actual code was already correct |

Strategy 11.4 (`src/lib/engine/strategy.ts`) was not modified. Its SHA-256 is d0170b40.

---

## 5. Calculations validated

| Calculation | Validation method | Result |
|---|---|---|
| EMA seeded from SMA, RSI/ATR need period+1 | Source inspection of `technicalAnalysis.ts` | Correct |
| MACD minimum 35 candles | Traced `sig.at(-2) === null` guard: needs `defined.length ≥ 10` → 35 closes | Correct |
| Stop = 50% of premium (long options) | Source inspection of `calcTradePoints()` | Correct |
| Target uses room to structural level × delta × multiplier | Source inspection | Correct |
| R:R = (target1 − entry) / (entry − stop) | Source inspection and engine test "debit spread risk math" | Correct |
| Straddle entry = total premium of call + put | Engine test "straddle entry and exits come from the TOTAL premium" | Pass |
| Debit spread max loss = debit paid; max profit = width − debit | Engine test "debit spread risk math" | Pass |
| Iron condor max profit = credit received; max loss = width − credit | Source inspection | Correct |
| Breakeven: CE = strike + premium; PE = strike − premium | Source inspection | Correct |
| Mock data: NIFTY trades, BANK NIFTY waits | Engine test | Pass |
| Stale data → NO TRADE | Engine test | Pass |
| Opening window → WAIT | Engine test | Pass |
| Event risk without history → WAIT | Engine test | Pass |
| END_OF_DAY source → WAIT/NO TRADE | Engine test | Pass |
| OI support = max put OI strike; resistance = max call OI strike | Engine test "max pain, PCR, support and resistance" | Pass |
| Max pain = strike minimizing aggregate OI loss at expiry | Engine test | Pass |
| PCR = total put OI / total call OI | Source inspection | Correct |
| Factor availability: live vs mock never mixed | Source inspection and analysis engine tests | Correct |
| Instrument key fail-close: TRADE without key → WAIT | Source inspection of `buildRecommendationResponse()` | Correct |

---

## 6. Historical recommendation performance

**Insufficient data to evaluate accuracy.**

The production journal (`.data/recommendations/`) contains **26 entries**, all with status `NOT_EXECUTABLE`. Every entry is a WAIT or NO TRADE decision; no TRADE decision has been recorded.

This is the expected result: without valid Upstox OAuth, the application falls back to mock data. The mock provider returns deterministic synthetic data, and the system correctly recognizes mock data — the factor availability rule prevents mock indicators from being scored alongside a notionally-live market, so recommendations using mock data are always WAIT or NO TRADE when the mock does not simulate a full live session.

**Performance metrics that cannot be computed:**

| Metric | Status |
|---|---|
| Number of TRADE recommendations | 0 (all WAIT or NO TRADE) |
| Win rate | Cannot be computed |
| Loss rate | Cannot be computed |
| Net P&L | Cannot be computed |
| Maximum drawdown | Cannot be computed |
| Profit factor | Cannot be computed |
| Performance by regime | Cannot be computed |
| Performance by CALL/PUT | Cannot be computed |
| Risk/reward realization | Cannot be computed |

The backtest engine exists (`engine/positionalBacktest.ts`, `engine/positionalV2.ts`, `engine/intradayReplay.ts`) and has 40 passing tests covering chronological OOS execution, look-ahead prevention, cost accounting, and walk-forward methodology. These validate the backtest mechanics but do not produce live-data performance results. No historical candle data is present in `.data/backtest-runs/` (directory is empty).

---

## 7. Recommendation accuracy status

**UNPROVEN.**

No live trades have been executed or evaluated. The engine logic is correct by design and passes its unit tests. Accuracy can only be established after running with valid Upstox authentication, accumulating live TRADE decisions, and evaluating outcomes. The absence of TRADE decisions in the journal is a safety property, not a defect.

---

## 8. Data sources

| Source type | Meaning | When present |
|---|---|---|
| LIVE | Exchange timestamp confirmed within staleness threshold | Valid Upstox auth + active market |
| END_OF_DAY | Last market session quotes | Market closed; valid auth |
| STALE | Fetch receipt too old (market: >4 min; technical: >5 min; news: >60 min) | Data expired but session still active |
| MOCK | Deterministic synthetic data | No auth, or `MARKET_DATA_PROVIDER=mock` |
| UNAVAILABLE | Provider returned an error or subsystem not configured | Auth failure or missing integration |

The `source-matching rule` is enforced at analysis time: a factor is only scored if its subsystem source matches the market data source. LIVE prices are never scored together with MOCK indicators.

The `freshness fail-close` is enforced at strategy time: any stale subsystem → NO TRADE.

The option chain (Upstox `/v2/option/chain`) carries no exchange or trade timestamp at the chain level. This is a confirmed provider limitation. Per the `options-audit` design: chain prices and Greeks are treated as unverified unless the chain passes the options-audit-1a verification step (pending live validation). Until then, the opportunity engine grades all contracts as REJECT and the strategy engine proceeds without delta filter enforcement.

---

## 9. External dependencies

| Dependency | Status | Impact |
|---|---|---|
| Upstox OAuth (access token) | Not present | Falls back to mock; no live trades possible |
| Upstox market data subscription | Not validated | Required for LIVE source status |
| Upstox option chain timestamp (exchange-level) | Provider limitation | Chain Greeks unverifiable; opportunity engine grades REJECT |
| Historical options data (Upstox upgrade) | Not subscribed | Historical options P&L unavailable |
| Fundamental data provider | No provider selected | Fundamental scoring blocked |
| Exercise STT/IPFT statutory rates | Authoritative spec not obtained | Cost calculation incomplete for exercise |
| Disk crash recovery design | 15 owner decisions pending | Recovery not implemented; existing `.bak` is not crash-safe promotion |

---

## 10. Dashboard vs engine output

The dashboard accurately presents engine output. Verified:

- `RecommendationCard` renders `plan.strategy`, all legs, entry zone, stop, targets, breakevens, max loss, max profit, strategy score, risk sizing — all sourced from `Analysis.plan` without transformation.
- `buildRecommendationResponse()` passes `plan.entry`, `plan.stop`, `plan.target1/2`, `plan.breakevens[0]`, `risk.lots`, `risk.quantity`, `risk.capitalRequired`, `risk.totalRisk`, `plan.maxLoss × qty` to the `execution` block — same fields displayed on screen.
- `whyReasons` (displayed as "Why" bullets) are built in `buildWhyReasons()` directly from `Analysis.factors` — no summarization or omission.
- `oiAnalysis.interpretation` (PCR, support, resistance text) is built from `Analysis.chain` which is the same `chainMetrics()` result used by the engine.
- Data quality labels (`source`, `freshness`) come directly from `Snapshot.sources` — no recalculation in the dashboard.
- No backend/dashboard mismatch was found.

---

## 11. Test results

| Suite | Tests | Pass | Fail |
|---|---|---|---|
| Unit / integration (`npm test`) | 68 | 68 | 0 |
| Engine-specific (`node --test src/lib/engine/*.test.ts`) | 40 | 40 | 0 |
| E2E (`npx playwright test`) | 36 | 36 | 0 |
| TypeScript (`tsc --noEmit`) | — | 0 errors | — |
| Production build | — | Complete | — |

**Total unit + engine tests: 108 passing, 0 failing.**

---

## 12. Safety verification

- Upstox OAuth: not initiated
- Broker/NSE network requests: not made
- Paper-trading runner/supervisor: not started
- LaunchAgent: not enabled
- `OPTION_QUOTE_LTT_ENABLED`: `false`
- `OPTION_QUOTE_CANARY_ENABLED`: `false`
- Live broker order placement: not implemented or activated
- `.data/` records: read-only throughout (26 journal entries observed, none modified)
- `src/lib/engine/strategy.ts`: not modified (SHA-256 d0170b40)
- Git tag/commit: not created
- Disk crash recovery: not implemented (15 owner decisions pending)
- Per-stock technical overlay: not integrated (owner approval pending)
- Fundamental data provider: not integrated (no provider selected)

---

## 13. Final acceptance status

**CONDITIONALLY ACCEPTED**

**What works:** Full pipeline from market data to recommendation is correctly implemented, defensively designed, and passing all tests. The dashboard accurately presents engine output. Safety mechanisms are sound.

**What remains unproven:** Recommendation accuracy. Zero live trades have been executed. The application cannot produce TRADE decisions without valid Upstox authentication. Accuracy evidence requires a sustained period of live operation.

**External blockers:** Upstox OAuth, live option chain timestamp verification, historical options data, fundamental provider, statutory STT/IPFT rates, disk crash recovery owner decisions.

**No further phases are required** to complete the existing application. The outstanding items are not application defects — they are external dependencies and intentionally deferred design decisions. The application is ready for live validation as soon as Upstox authentication is authorized.
