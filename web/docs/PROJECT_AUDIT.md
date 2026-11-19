# MASTER IMPLEMENTATION DIRECTIVE — PHASE 0 AUDIT REPORT
## Stock & Options Recommendation Engine: Complete Audit, Baseline Verification & Enhancement Architecture

**Date:** 2026-11-17  
**Status:** Formally Audited — Phase 0 Complete  
**Target:** Owner Review & Approval Prior to Phase 1–7 Execution  

---

## 1. Executive Summary & Audit Mandate

The objective of this audit is to establish the ground-truth technical state of the Upstox Options Analyzer's recommendation engines, verify compliance with non-negotiable architectural requirements, identify confirmed implementation defects, and define an end-to-end restructuring plan.

### Core Non-Negotiable Rules
1. **Capital Independence**: Recommendation generation must be completely independent of user account capital. Sizing must not block trade recommendations.
2. **Strategy 11.4 Frozen Integrity**: The approved baseline (`bcdd18a`) in `web/src/lib/engine/strategy.ts` must remain byte-for-byte unmodified.
3. **Strict Data State Governance**: `LIVE`, `PARTIAL`, `END_OF_DAY`, `STALE`, `MOCK`, and `UNAVAILABLE` states must be rigorously distinguished. `END_OF_DAY` data produces an EOD Watchlist, never a live intraday trade.
4. **No Live Execution / No Cloud Costs**: 100% local macOS execution, ₹0 vendor fees, paper-trading mode only.

---

## 2. End-to-End Recommendation Data Flow Audit

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                CURRENT DATA PIPELINE                                   │
└────────────────────────────────────────────────────────────────────────────────────────┘
 [Upstox V2/V3 REST & WebSocket / Offline Mock Provider]
                           │
                           ▼
 [Normalization Layer: upstoxMarket.ts / stockService.ts]
   - Normalizes quotes, candles, and option chain
   - Tags data source: LIVE, PARTIAL, END_OF_DAY, MOCK, UNAVAILABLE
                           │
                           ▼
 [Technical & Breadth Analysis: analysis.ts / technicalAnalysis.ts]
   - Computes EMA, RSI, MACD, ATR, Daily S/R
   - Computes Market Breadth (Adv/Dec, ADR, momentum)
   - Evaluates 7-factor regime direction (-1.0 to +1.0)
                           │
        ┌──────────────────┴──────────────────┐
        ▼                                     ▼
 [Options Engine: strategy.ts &       [Stock Engine: stockOpportunityEngine.ts]
  opportunityEngine.ts]                 - Batch quotes 50 NIFTY constituents
   - Strategy 11.4: Directional ATM     - Computes relative strength vs NIFTY
     Call/Put, Spreads, Iron Condor     - Evaluates intraday & swing setups
   - Phase 20/22 Opportunity Engine:    - Calculates structural stop & targets
     ATM ±7 strike candidate ranking    - Formulates invalidation levels
        │                                     │
        ▼                                     ▼
 [Risk Assessment: riskService.ts]    [Opportunity Aggregator: top/route.ts]
   - Checks stop, targets, R:R >= 1.2   - Aggregates top Options & Stock trades
   - BLOCKS trades if lots === 0! ◄──[DEFECT: Capital Dependency in riskService]
                           │
                           ▼
 [Presentation: dashboard.ts & UI Component Views]
   - Displays Market Overview, Recommendations, Factors & Risk Assessment
```

---

## 3. Confirmed Implementation Defects

### Defect 1: Account Capital Blocks Market Trade Recommendations
- **Location**: [`web/src/lib/services/risk/riskService.ts#L120-L156`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/src/lib/services/risk/riskService.ts#L120-L156) and [`web/src/lib/engine/strategy.ts#L240-L249`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/src/lib/engine/strategy.ts#L240-L249).
- **Exact Mechanism**:
  1. `riskService.ts` computes `riskBudget = maxAllowedTradeRisk - fixedCosts`.
  2. With default ₹1,00,000 capital and 1.0% risk, max trade risk is ₹1,000.
  3. A standard NIFTY lot (stop $\ge 15\text{ pts} \times 65\text{ lot} = ₹975$–₹1,400) results in `lots = Math.floor(riskBudget / netRiskPerLot) = 0`.
  4. Line 151 triggers: `if (lots === 0) { reasons.push("ZERO_LOTS"); }`.
  5. This forces `risk.allowed = false`.
  6. In `strategy.ts` line 249: `const best = candidates.find(c => !c.rejected && c.risk?.allowed ...)`.
  7. Because `risk.allowed` is `false`, `best` evaluates to `null`.
  8. Strategy 11.4 falls back to `NO TRADE`, completely discarding valid high-conviction market signals simply because the user did not configure a large capital balance.
- **Severity**: **CRITICAL**. Conflates trade signal validity with portfolio affordability.

### Defect 2: EOD Breadth Permitted into Live Intraday Trade Confirmation
- **Location**: [`web/src/lib/engine/analysis.ts#L161`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/src/lib/engine/analysis.ts#L161).
- **Exact Mechanism**:
  Accepting `END_OF_DAY` breadth into `rawFactors()` allows post-market closing breadth to clear the `missing` factors check in `strategy.ts`. While `strategy.ts` has an `isEod` check that forces status to `WAIT`, secondary engines and candidate scorers evaluate the setup as if breadth confirmation were active in real time.
- **Severity**: **HIGH**. Violates data integrity rules.

### Defect 3: Option Entry Fill Assumes LTP Rather than Executable Bid/Ask
- **Location**: [`web/src/lib/engine/opportunityEngine.ts#L298-L318`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/src/lib/engine/opportunityEngine.ts#L298-L318).
- **Exact Mechanism**:
  `calcTradePoints()` uses `q.ltp` as both entry and target reference. For long option purchases, the real executable fill occurs at the `ask`, while exit fills occur at the `bid`. When bid-ask spread is 5–10%, assuming fills at LTP produces artificially favorable reward-to-risk ratios that cannot be executed in the live market.
- **Severity**: **HIGH**. Overstates net edge.

### Defect 4: Simplistic Intraday Stock Setup Scoring
- **Location**: [`web/src/lib/engine/stockOpportunityEngine.ts#L225-L265`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/src/lib/engine/stockOpportunityEngine.ts#L225-L265).
- **Exact Mechanism**:
  `detectIntradaySetup()` classifies any stock where `q.ltp > q.previousClose * 1.005` (+0.5% gain) as a `"BREAKOUT"`. A 0.5% move above previous close without testing previous day high, opening range high, or consolidation resistance with volume expansion is not a technical breakout.
- **Severity**: **MEDIUM**. Generates false setup labels.

### Defect 5: Entanglement of Intraday Scanner and EOD Watchlist
- **Location**: [`web/src/lib/engine/stockOpportunityEngine.ts#L450-L458`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/src/lib/engine/stockOpportunityEngine.ts#L450-L458).
- **Exact Mechanism**:
  The stock scanner attempts to serve both live intraday trading and post-market scanning in a single pass. When the market is closed, it rejects quotes as not live or marks trades as `REJECT` rather than seamlessly transitioning into a dedicated next-session EOD Watchlist with next-day entry triggers.
- **Severity**: **MEDIUM**. Degrades dashboard utility outside 09:15–15:30 IST.

---

## 4. Incorrect Assumptions in the Existing Codebase

1. **The Capital Precondition Fallacy**: Assumed that an options recommendation engine cannot evaluate whether a setup is mathematically sound unless it knows the user's account balance. A trade setup's risk-reward, entry, stop, and targets are inherent market properties, independent of whether an account trades 1 lot or 100 lots.
2. **The Guaranteed LTP Fill Fallacy**: Assumed that options contracts trade at the last-traded price without spread crossing penalty or depth limitations.
3. **The Static S/R Floor Fallacy**: Assumed that historical support/resistance levels represent future profit room, even if current spot has already breached or moved past that level.
4. **The IV Percentile Spread Fallacy**: Assumed that an elevated IV percentile ($> 65$) automatically justifies buying a debit spread. Debit spreads are net directional debit trades that still suffer theta decay if direction is stagnant.
5. **The Continuous Live Market Fallacy**: Assumed that outside market hours the system must try to find live trades, rather than cleanly switching to an EOD Observation/Watchlist regime.

---

## 5. Functionality That Already Works (Verified Baseline)

| Component | Source File | Status & Evidence |
| :--- | :--- | :--- |
| **Strategy 11.4 Baseline** | [`strategy.ts`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/src/lib/engine/strategy.ts) | **100% Frozen & Verified**. Identical to Commit `bcdd18a` (SHA-256 `d0170b40a4b9fb...`). Zero diff. |
| **Technical Analysis Core** | [`technicalAnalysis.ts`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/src/lib/services/technicalAnalysis.ts) | Accurately calculates EMA 9, 21, 50, 200, RSI 14, MACD histogram, and daily ATR. |
| **Option Window & Verification** | [`optionCandidateWindow.ts`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/src/lib/services/optionCandidateWindow.ts) | Bounded candidate universe strictly limited to ATM $\pm 7$ strikes. Independent quote verification against Upstox V3. |
| **Market Data Normalization** | [`upstoxMarket.ts`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/src/lib/services/upstoxMarket.ts) | Normalizes quotes, completed history, and candle series with strict fail-closed handling on malformed rows. |
| **Gate 2 Decision Matrix** | [`decisionMatrix.ts`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/src/lib/research/decisionMatrix.ts) | Formally approved. Proved across all 8 mutually exclusive states over 2,160 automated test sweeps. |

---

## 6. Upstox Free Tier Data Limitations & Boundaries

To ensure the recommendation engine remains 100% free and robust, all modules must respect physical API constraints:

1. **Option Greeks & Depth**:
   - Upstox option-chain endpoint provides current LTP, bid/ask, volume, OI, and current-session Greeks.
   - **Limitation**: Historical Option Candle V3 provides historical OHLCV and OI, but **does not provide historical Greeks or historical bid/ask depth**. Backtests must use mathematical Black-Scholes approximations or prospectively collected ticks.
2. **Index Volume & VWAP**:
   - Spot indices (NIFTY 50, BANK NIFTY) have **volume = 0**. Spot VWAP is mathematically undefined and must remain `null`.
   - Futures VWAP from front-month contracts must be used when volume-weighted benchmark confirmation is required.
3. **API Rate Limits**:
   - Upstox Free Tier enforces rate limits.
   - Batch equity quotes (`/v2/market-quote/quotes`) can fetch all 50 NIFTY constituents in a single HTTP request.
   - Historical candle requests (`/v3/historical-candle/...`) must NOT be called concurrently for all 50 stocks on every page render. Intraday candle fetching must be selectively targeted to top breakout candidates or cached per trading session.

---

## 7. Strategy 11.4 Baseline Integrity vs. Opportunity Engine

A critical architectural distinction verified during this audit:

- **Strategy 11.4** is implemented in [`web/src/lib/engine/strategy.ts`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/src/lib/engine/strategy.ts). It is the authoritative research strategy frozen at Commit `bcdd18a`. It implements:
  - Directional regimes $\rightarrow$ Long Option (ATM / nearest delta 0.5)
  - Volatility regimes $\rightarrow$ Debit Spread
  - Range regimes $\rightarrow$ Iron Condor (Credit, 50% profit target, 2x credit stop loss)
  - Event risk $\rightarrow$ ATM Straddle (if move history $>$ entry)
- **Opportunity Engine** is implemented in [`web/src/lib/engine/opportunityEngine.ts`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/src/lib/engine/opportunityEngine.ts). It is a contract-ranking engine that evaluates candidate strikes based on liquidity, spread, and delta sweet-spots.
- **Audit Finding**: Strategy 11.4 in `strategy.ts` was **never modified**. However, `opportunityEngine.ts` previously attempted to introduce ad-hoc spread selections.
- **Resolution**: Keep `strategy.ts` completely isolated. Any experimental range-channel or spread algorithms will be placed into a dedicated, separately versioned module (`EXP_CHANNEL_OPTIONS_V1`).

---

## 8. Proposed Changes (File-by-File Implementation Plan)

### Phase 1: Shared Data & Risk Decoupling
- **`web/src/lib/services/risk/riskService.ts`**:
  - Separate `strategyAllowed` (valid entry, stop, targets, positive risk, $R:R \ge 1.2$) from `portfolioAllowed` (capital affordability, open risk, concurrent positions).
  - When `capital` is unconfigured or zero, set `lots: null` and `capitalRequired: null`, but allow `strategyAllowed = true` if the market trade plan is mathematically sound.
  - Sizing constraints will never push `"ZERO_LOTS"` to block recommendation generation.
- **`web/src/lib/services/risk/riskConfig.ts`**:
  - Document that account capital is an optional portfolio configuration parameter, not a prerequisite for generating market trade recommendations.

### Phase 2: Stock Recommendation Engine Restructuring
- **`web/src/lib/engine/stockOpportunityEngine.ts`**:
  - **Module A: Intraday Stock Scanner**:
    - Evaluates 10 distinct setups: Breakout (PDH breach + volume), Breakout Retest, Pullback Continuation (EMA 9/21 bounce), Momentum Continuation, ORB, VWAP Reclaim, VWAP Rejection, HOD Continuation, Support Bounce, Resistance Rejection.
    - Requires relative volume $> 1.2x$ and relative strength vs NIFTY.
    - Only runs when data is `LIVE`.
  - **Module B: Swing Stock Scanner**:
    - Evaluates daily trends (EMA 20/50/200), multi-day consolidation breakouts, and ATR invalidation levels.
  - **Module C: EOD Watchlist Generator**:
    - Uses completed session data to output candidate observation lists for the next trading day.
    - Explicitly displays: `"EOD WATCHLIST — NOT A LIVE TRADE SIGNAL"`.

### Phase 3: Options Opportunity Engine Restructuring
- **`web/src/lib/engine/opportunityEngine.ts`**:
  - Calculate entry and exit prices using executable bid/ask quotes:
    - Long Option: $\text{Entry} = \text{Ask}$, $\text{Exit} = \text{Bid}$.
    - Short Option: $\text{Entry} = \text{Bid}$, $\text{Exit} = \text{Ask}$.
  - Compute net $R:R$ factoring in statutory transaction costs (brokerage, STT, turnover charges, GST).
  - Validate directional structural room: verify that resistance is ahead of spot for calls, and support is below spot for puts.
  - Fails closed when sideways ($|\text{dir}| < 0.15$) with explicit rationale.

### Phase 4: Strategy 11.4 Protection & Experimental Strategy Module
- **`web/src/lib/engine/strategy.ts`**:
  - Retain byte-for-byte frozen baseline.
- **`web/src/lib/engine/experimentalOptionsEngine.ts`** *(New File)*:
  - Isolated experimental engine (`EXP_CHANNEL_RANGE_V1`, `EXP_DEBIT_SPREAD_V1`).
  - Evaluates range-bound boundary mean-reversion setups with dedicated strategy IDs and separate validation telemetry.

### Phase 5: Shared Recommendation Quality & Diagnostic Layer
- **`web/src/lib/recommendationDiagnostic.ts`**:
  - Standardize 6 clear outcome states: `QUALIFIED`, `WATCHLIST`, `WAIT`, `REJECTED`, `DATA_INSUFFICIENT`, `EOD_ONLY`.
  - Provide human-readable explainability for every pass/fail criterion.

### Phase 6: Dashboard Integration
- **`web/src/lib/dashboard.ts`** & Presentation Components:
  - Present recommendations with entry range, structural stop, Target 1 & 2, net $R:R$, setup type, and signal expiration.
  - Clearly distinguish live trade recommendations from EOD next-session watchlists.

---

## 9. Comprehensive Testing & Validation Strategy

1. **Capital-Independence Verification**:
   - Automated tests verifying that setting `process.env.ACCOUNT_CAPITAL = undefined` produces fully populated trade plans ($R:R$, stops, targets) for both stocks and options.
2. **Strategy 11.4 Regression Suite**:
   - Automated hash and diff test asserting zero modifications against Commit `bcdd18a`.
3. **Stock Setup Discrimination Tests**:
   - Test suites verifying that a $+0.5\%$ stock without volume or PDH breakout is classified as `WAIT` or rejected, while a true volume-confirmed breakout qualifies.
4. **Options Executable Pricing Tests**:
   - Tests asserting that entry uses ask and exit uses bid, verifying realistic slippage and net $R:R$ accounting.
5. **Data State Integrity Tests**:
   - Tests proving that `END_OF_DAY` breadth forces status to `WAIT` or `EOD_ONLY`, and never generates an intraday `TRADE` signal.

---

## 10. Audit Conclusion & Phase 0 Deliverable Sign-Off

The existing codebase contains solid foundations (frozen Strategy 11.4, accurate technical calculations, independent quote verification, and Gate 2 decision matrix proofs). The failures observed were caused by **conflating account portfolio sizing with market trade analysis**, **lack of executable bid/ask pricing**, and **premature strategy blending**.

The proposed architecture resolves all confirmed defects while strictly preserving the frozen Strategy 11.4 baseline and operating within the Upstox Free Tier.

**Awaiting Owner Approval to proceed to Phase 1 Execution.**
