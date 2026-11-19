# Gate 2 Readiness Assessment
## Strategic Evaluation, Quantitative Research Methodology & Gating Determination for Workstream 1 (Options Research & Strategy Validation)

**Document ID:** `GATE_2_READINESS_ASSESSMENT.md`  
**Location:** `web/docs/GATE_2_READINESS_ASSESSMENT.md`  
**Assessment Date:** November 16, 2026  
**Assessor:** Quantitative Systems Engineering & Audit Principal  
**Audited Baseline:** Completed Gate 1 Prototype (`GATE_1_FINAL_EVIDENCE_AUDIT.md`)  
**Scope Reference:** Workstream 1 / Gate 2 (WBS 5.0–5.4 in Master Project Execution Tracker)  
**Execution Mode:** Strategic Readiness Assessment Only (Zero Live Connections, Zero Model Execution)  
**Strategy Alignment:** Strategy 11.4 Formulas and 1.0% Risk Limit **STRICTLY FROZEN**  
**Production Readiness:** STRICT HARD NO-GO (11.25% — Live Trading Prohibited)  

---

## 1. Executive Summary & Gating Decision

This document evaluates the readiness of the Upstox Options Analyzer project to transition from **Gate 1 (Market Data Collector Prototype)** into **Gate 2 (Options Research & Strategy Validation)**.

Based on the evidence audited in `web/docs/GATE_1_FINAL_EVIDENCE_AUDIT.md` and the verified offline status of the codebase:

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| GATE 2 READINESS DETERMINATION                                                                          |
+------------------------------------+--------------------------------------------------------------------+
| Decision Item                      | Status / Determination                                             |
+------------------------------------+--------------------------------------------------------------------+
| Gate 2 Methodology Design (WBS 5.0)| APPROVED FOR OWNER AUTHORIZATION                                   |
| Exploratory Modeling (Track A)     | CONDITIONAL PASS (Permitted for code/sensitivity research only)    |
| Primary Strategy Validation(Track B| GATED ON OBSERVED DATA (Requires >= 60 streaming sessions)        |
| Upstox API Live Token/WebSocket    | STRICTLY PROHIBITED (Deferred to Gate 3)                           |
| Production Capital Deployment      | STRICT HARD NO-GO (Current readiness: 11.25%)                      |
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
```

### Overall Readiness Determination:
**READY FOR METHODOLOGY DESIGN (WBS 5.0) ONLY** under a strictly enforced **Dual-Track Research Architecture**. 

- **Track A (Exploratory Modeling):** Permitted to execute offline using historical REST candles with model-derived Greeks, subject to mandatory metadata watermarking (`DATASET_MODE: MODEL_DERIVED`, `VALIDATION_STATUS: EXPLORATORY_ONLY`). Track A cannot certify production readiness.
- **Track B (Primary Strategy Validation):** Hard-gated on continuous observed streaming market data captured via the Gate 3/4 pipeline. Zero synthetic spreads, modeled Greeks, or fabricated fills are permitted.

---

## 2. Core Pre-Requisite Audit for Gate 2 Entry

Before authorizing Gate 2, all architectural dependencies from prior gates were verified:

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| CORE PRE-REQUISITE AUDIT MATRIX FOR GATE 2 ENTRY                                                        |
+----+--------------------------------+--------------------------------+------------------+---------------+
| #  | Architectural Pre-Requisite    | Evidence Location              | Audited Result   | Gate 2 Impact |
+----+--------------------------------+--------------------------------+------------------+---------------+
| 1  | Dynamic Universe Resolution    | universeSelector.ts:40-150     | PASS (Verified)  | Clean inputs  |
|    | (NSE Circular NSE/FAOP/64506)  | universeSelector.test.ts (6/6) | NIFTY weekly,    | for backtests |
|    |                                |                                | BANKNIFTY monthly|               |
+----+--------------------------------+--------------------------------+------------------+---------------+
| 2  | Replay Determinism & Ordering  | replayEngine.ts:60-120         | PASS (Verified)  | Deterministic |
|    | (Monotonic nanosecond ordering)| replayEngine.test.ts (1/1)     | Stream SHA-256   | event replay  |
|    |                                |                                | identical bit/bit| for validation|
+----+--------------------------------+--------------------------------+------------------+---------------+
| 3  | Storage Schema & Manifests     | storageManager.ts:26-250       | PASS (Verified)  | Standardized  |
|    | (28 columns + SHA-256 hashes)  | storagePartitioning.test.ts    | Tamper detection | storage layer |
|    |                                |                                | active (0o444)   | ready         |
+----+--------------------------------+--------------------------------+------------------+---------------+
| 4  | Paper-Ledger Crash Recovery    | paperLedgerRecovery.ts         | PASS (Verified)  | Execution     |
|    | (Gate M1: Atomic locks/replays)| paperLedgerRecovery.test.ts    | 110/110 passing  | ledger cannot |
|    |                                |                                | assertions       | lose state    |
+----+--------------------------------+--------------------------------+------------------+---------------+
| 5  | Regulatory Transaction Costs   | transactionCosts.ts:71-106     | CONDITIONAL PASS | Realistic net |
|    | (NSE turnover 0.03553%, STT)   | transactionCosts.test.ts       | Plus rate ₹30    | PnL drag      |
|    |                                |                                | fallback active  | accounted for |
+----+--------------------------------+--------------------------------+------------------+---------------+
| 6  | Historical REST Boundaries     | UPSTOX_HISTORICAL_DATA_VERIFI- | PASS (Verified)  | Hard boundary |
|    | (Omission of bid/ask & Greeks) | CATION.md                      | Categorized as   | on synthetic  |
|    |                                |                                | exploratory only | claims        |
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
```

---

## 3. Definitive Separation: Exploratory Modeling vs. Primary Validation

To prevent synthetic backtest artifacts from being misconstrued as empirical proof of strategy profitability, Gate 2 establishes an inviolable structural wall between two research tracks:

```
+─────────────────────────────────────────────────────────────────────────────────────────────────────────+
| STRUCTURAL RESEARCH WALL                                                                                |
|                                                                                                         |
|   ┌───────────────────────────────────────────┐       ┌───────────────────────────────────────────┐   |
|   │         TRACK A: EXPLORATORY              │       │          TRACK B: PRIMARY                 │   |
|   │         (Heuristic / Offline)             │       │          (Empirical / Streaming)          │   |
|   ├───────────────────────────────────────────┤       ├───────────────────────────────────────────┤   |
|   │ Data: Historical REST 1m OHLC candles     │       │ Data: Live Collector Parquet Ticks        │   |
|   │ Greeks: Black-Scholes offline formula     │       │ Greeks: Broker Upstox Proto3 Greeks       │   |
|   │ Quotes: Modeled bid/ask spread (1.5%)     │       │ Quotes: Observed Level 1 Order Depth      │   |
|   │ Execution: Close price / Mid-price        │       │ Execution: Ask buy / Bid sell + latency   │   |
|   │ Tag: VALIDATION_STATUS: EXPLORATORY_ONLY  │       │ Tag: VALIDATION_STATUS: PRIMARY_AUDIT     │   |
|   │                                           │       │                                           │   |
|   │ Prohibited: Production certification      │       │ Required: >= 60 full trading sessions     │   |
|   │ Permitted: Code logic & sensitivity tests │       │ Required: In-Sample (40) / OOS (20) split │   |
|   └───────────────────────────────────────────┘       └───────────────────────────────────────────┘   |
+─────────────────────────────────────────────────────────────────────────────────────────────────────────+
```

### 3.1 Track A: Exploratory Backtesting Specifications
- **Objective:** Evaluate strategy logic, calibrate optimization bounds, and analyze parameter sensitivity surfaces.
- **Input Data:** Upstox Historical REST 1-minute OHLC candles (`/v2/historical-candle/...`).
- **Greeks Computation:** Offline Black-Scholes or Black-76 models calculated from candle close prices, assuming annualized RBI repo rate (6.5%) and dividend yield (1.2%).
- **Spread Assumption:** Synthetic fixed or percentage-based spread (e.g. 1.5% of premium).
- **Mandatory Disclaimers & Watermarks:**
  - Every chart, JSON output, summary table, and report generated by Track A **must embed**:
    ```json
    {
      "dataset_mode": "MODEL_DERIVED",
      "validation_status": "EXPLORATORY_ONLY",
      "disclaimer": "This analysis relies on synthetic Black-Scholes Greeks and modeled bid/ask spreads. It does NOT represent observed market depth and CANNOT be used to justify capital allocation."
    }
    ```
- **Prohibited Claims:** No performance metric from Track A (e.g. Sharpe ratio, win rate, max drawdown) may be cited as evidence of production readiness.

### 3.2 Track B: Primary Strategy Validation Specifications
- **Objective:** Statistically validate Strategy 11.4 using true, unmanipulated market reality.
- **Input Data:** Raw streaming L2 ticks and 1-minute aggregated bars captured by the Upstox Market Data Collector prototype (`web/.data/collector/parquet/`).
- **Data Volume Requirement:** A minimum of **60 full, continuous trading sessions** (375 minutes each, 09:15 to 15:30 IST) across varying market volatility regimes (low IV, earnings events, RBI policy announcements).
- **Session Integrity Gate:** Only sessions with `sessionIntegrityStatus === "FULL_FIDELITY_SESSION"` in their `MANIFEST.jsonl` are eligible for the primary statistical set. Sessions marked `PARTIAL_DATA_SESSION` due to feed drops are audited separately.
- **Execution Modeling:**
  - Option buys execute strictly at `best_ask_price`.
  - Option sells execute strictly at `best_bid_price`.
  - If `spread_pct > 0.05` at entry time, trade execution is rejected by the liquidity gate.
  - Simulated network and processing latency: 250 ms delay between signal generation and order fill.
- **Walk-Forward Matrix:**
  - **In-Sample Phase:** 40 trading sessions. Used to calibrate baseline parameters and verify delta clustering.
  - **Out-of-Sample Phase:** 20 trading sessions. Evaluated forward with strictly locked parameters. Strategy must achieve out-of-sample profit factor $\ge 1.50$ and maximum drawdown $\le 3.0\%$ of allocated margin.

---

## 4. Quantitative Strategy 11.4 Boundary Enforcement

During all Gate 2 research activities, Strategy 11.4 parameters remain **STRICTLY FROZEN**:

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| STRATEGY 11.4 FROZEN PARAMETER MATRIX                                                                  |
+------------------------------------+-----------------------+--------------------------------------------+
| Parameter                          | Frozen Value          | Governance Boundary                        |
+------------------------------------+-----------------------+--------------------------------------------+
| Target Underlyings                 | NIFTY & BANKNIFTY     | Confined to audited index instruments      |
| Short Leg Delta Range              | 0.16 to 0.22          | Delta bounds cannot be widened             |
| Long Hedge Leg Delta Range         | 0.05 to 0.08          | Hedge delta bounds cannot be loosened      |
| Liquidity Spread Gate              | <= 5.0% of premium    | Trades exceeding 5% spread rejected        |
| Maximum Risk per Trade             | 1.0% of account equity| Hard limit; zero override permitted        |
| Profit Target                      | 50% of maximum credit | Auto-exit triggered at 50% capture         |
| Stop Loss Gate (Combined)          | 150% of maximum credit| Auto-exit triggered at 150% loss           |
| Stop Loss Gate (Individual Leg)    | 200% of leg premium   | Stop triggered if single leg doubles       |
| Holding Period                     | Positional / Expiry   | Intraday square-off at 15:15 on expiry day |
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
```

Any optimization or parameter search that seeks to alter these core rules requires an explicit, separate Architecture Change Request (ACR) signed off by the platform owner.

---

## 5. Transaction-Cost Modeling & Account Plan Prerequisite

Accurate validation of high-frequency and multi-leg option strategies requires realistic fee drag modeling.

### 5.1 Verified Statutory Charges
As implemented in `web/src/lib/services/transactionCosts.ts`:
- **Securities Transaction Tax (STT):** 0.15% on sell options turnover (effective April 1, 2026).
- **Exchange Turnover Charge:** 0.03553% (inclusive of IPFT) per official NSE Circular `NSE/FA/73061`.
- **GST:** 18.0% on (Brokerage + Exchange Turnover Fees).
- **SEBI Turnover Fee:** ₹10 per crore (0.0001%).
- **Stamp Duty:** 0.003% on buy options turnover.

### 5.2 Unresolved Upstox Account Plan
- **The Issue:** Upstox offers two distinct retail pricing plans:
  1. **Basic Plan:** ₹20 flat per executed order.
  2. **Plus Plan:** ₹30 flat per executed order.
- **The Risk:** An iron condor consists of 4 legs on entry and 4 legs on exit (8 executed orders per complete roundtrip).
  - Roundtrip brokerage under Basic: $8 \times ₹20 = ₹160$.
  - Roundtrip brokerage under Plus: $8 \times ₹30 = ₹240$ (+50% brokerage overhead).
  - For small accounts or low-premium outer wings, this difference represents a non-trivial friction on net returns.
- **Audited Safeguard:** In `transactionCosts.ts`, the default account plan is explicitly set to:
  `accountPlan: "UNKNOWN"` with fallback to `Plus` plan rate (₹30/order) labeled `CONSERVATIVE_RESEARCH_FALLBACK`.
- **Gating Action Required:** The platform owner must formally confirm the active account plan before live paper trading or capital allocation.

---

## 6. External Vendor Dependencies & Questionnaire Status

The Upstox Support Technical Questionnaire (`web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md`) addresses five unresolved provider-specific constraints:
1. Max instrument keys per single WebSocket connection (1,500 vs. 2,000).
2. Max concurrent WebSocket connections per client API key.
3. Contractual availability of server-initiated heartbeat frames.
4. Conflation rate and tick throttling during high-volatility market bursts.
5. Exact Greek pricing model (Black-Scholes vs. Black-76, underlying spot vs. futures basis).

### Operational Directive:
- **Questionnaire Status:** Finalized, audited, and held offline.
- **Gate 2 Impact:** Gate 2 methodology design and exploratory modeling **can proceed offline** without waiting for vendor answers.
- **Gate 3 Impact:** Dispatching the questionnaire and obtaining written provider answers (or performing empirical live socket probing) is a **mandatory prerequisite for Gate 3 (Live Streaming Collection)**.

---

## 7. Gate 2 Execution Work Breakdown (WBS 5.0–5.4)

Upon owner approval of this readiness assessment, Workstream 1 will proceed under the following structured phases:

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| WORKSTREAM 1 (GATE 2) DETAILED WORK BREAKDOWN                                                           |
+---------+------------------------------------+--------------------------------+-------------------------+
| WBS Ref | Milestone / Task                   | Primary Deliverables           | Dependency / Boundary   |
+---------+------------------------------------+--------------------------------+-------------------------+
| WBS 5.0 | Research Methodology Specification | web/docs/RESEARCH_METHODOLOGY_ | Owner Approval Gate;    |
|         | & Validation Framework             | SPECIFICATION.md               | Documentation Only      |
+---------+------------------------------------+--------------------------------+-------------------------+
| WBS 5.1 | Exploratory Backtest Engine        | web/src/lib/research/          | Strictly Track A;       |
|         | Hardening & Sensitivity Tests      | exploratoryEngine.ts           | REST candles + BS Greeks|
+---------+------------------------------------+--------------------------------+-------------------------+
| WBS 5.2 | Walk-Forward Validation Engine     | web/src/lib/research/          | Strictly Track B;       |
|         | Architecture & Metrics Calculator  | walkForwardEngine.ts           | Zero synthetic inputs   |
+---------+------------------------------------+--------------------------------+-------------------------+
| WBS 5.3 | Collector Capture Ingestion        | web/src/lib/research/          | Gated on Gate 3/Gate 4  |
|         | & Primary Validation Execution     | primaryValidator.ts            | observed streaming data |
+---------+------------------------------------+--------------------------------+-------------------------+
| WBS 5.4 | Final Strategy Validation Report   | web/docs/STRATEGY_11_4_        | Minimum 60 observed     |
|         | & Production Readiness Audit       | FINAL_VALIDATION_REPORT.md     | trading sessions        |
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
```

---

## 8. Final Recommendations & Owner Decisions Required

### 8.1 Summary of Recommendations
1. **Approve Gate 1 Completion:** Formally accept `GATE_1_FINAL_EVIDENCE_AUDIT.md` (CONDITIONAL PASS).
2. **Authorize Gate 2 Methodology Design (WBS 5.0):** Authorize the creation of the comprehensive quantitative research methodology document.
3. **Confirm Dual-Track Separation:** Enforce the rule that exploratory backtesting results can never be presented as proof of strategy production readiness.
4. **Confirm Active Brokerage Plan:** Confirm whether the Upstox account is on the Basic (₹20) or Plus (₹30) plan.
5. **Maintain Production Trading Prohibition:** Keep live trading disabled (Readiness: 11.25% — HARD NO-GO).

### 8.2 Questions for the Platform Owner
Before proceeding, the following items require owner guidance:
1. **Brokerage Plan Confirmation:** Is the trading account enrolled in the Upstox **Basic** (₹20/order) or **Plus** (₹30/order) plan?
2. **Vendor Questionnaire Dispatch:** Do you authorize sending `UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md` to Upstox API technical support, or should we plan for empirical live-socket probing during Gate 3?
3. **Authorization to Begin WBS 5.0:** Do you authorize the engineering team to proceed with **Gate 2 (WBS 5.0: Research Methodology Specification)**?

---

**MANDATORY HALT: System execution is halted. No source code has been altered, no live API calls have been initiated, and no background processes have been spawned. Awaiting explicit owner approval.**
