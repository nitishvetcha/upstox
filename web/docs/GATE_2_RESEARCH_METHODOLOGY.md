# Gate 2 — Quantitative Options Research Methodology Specification
## Research Protocol, Transaction-Cost Accounting, Execution Modeling, Statistical Validity & Holdout Governance for Strategy 11.4

**Document ID:** `GATE_2_RESEARCH_METHODOLOGY.md`  
**Location:** `web/docs/GATE_2_RESEARCH_METHODOLOGY.md`  
**Author:** Quantitative Systems Engineering & Research Architecture  
**Date:** November 17, 2026  
**Revision:** 3.1.0 (Master Final Methodology Resolution — Exhaustive Decision Table Codified)  
**Governance Status:** PROVISIONAL METHODOLOGY SPECIFICATION ONLY (Offline Documentation Only — Ready for Formal Freeze)  
**WBS Reference:** Workstream 1 / Gate 2 (WBS 5.0)  
**Strategy Alignment:** Strategy 11.4 Formulas and 1.0% Risk Limit **STRICTLY FROZEN** (Commit `bcdd18a`)  
**Production Readiness:** **11.25% — STRICT HARD NO-GO** (Live Trading Prohibited)  
**Execution Boundaries:** Strictly Offline; Zero Live API Calls, Zero Token Refreshes, Zero WebSockets, Zero Vendor Contact, Zero Capital Allocation  

---

## 1. Executive Mandate & Purpose

This specification governs the quantitative research methodology, historical evaluation protocols, execution simulation rules, transaction-cost accounting, and statistical acceptance criteria for **Strategy 11.4** within the Upstox Options Analyzer platform.

The objective of this methodology is to establish explicit, auditable protocols that eliminate research vulnerabilities—such as lookahead bias, survivorship bias, unrealistic execution assumptions, synthetic data fabrication, parameter snooping, and fee calculation errors—prior to conducting strategy validation.

> [!IMPORTANT]
> **GOVERNANCE BOUNDARY & SCOPE CLARIFICATION:**
> Approval of this document constitutes provisional acceptance of the **research methodology, simulation assumptions, and statistical test design only**. It does **not** prove that Strategy 11.4 is profitable, does **not** validate the data feed, and does **not** authorize live data collection, paper trading, or live capital allocation. Production readiness remains strictly at **11.25% (HARD NO-GO)**.

This specification enforces eight critical engineering principles:
1. **Strictly Causal, Fail-Closed Stop-Loss & Outage State Accounting:** Eliminates all future price windows and cherry-picked fills. A trade print is not treated as an executable fill. Outages transition through an explicit causal state machine (`PENDING_EXIT`, `PARTIALLY_FILLED`, `ONE_LEG_EXITED`, `ASYMMETRIC_LEGGING_RISK`, `UNRESOLVED_POSITION`, `RECONCILIATION_REQUIRED`, `CLOSED`). Unresolvable outages are modeled under conservative defined-risk structural loss bounds (a mathematical risk bound, not an invented fill price).
2. **Absolute Strategy Invariance:** Reaffirms that Strategy 11.4 contains zero tunable parameters. Indicators, scoring weights, thresholds, delta windows, and the 1.0% risk limit are permanently locked to commit `bcdd18a`.
3. **Dual-Unit Statistical Inference & Dependence Governance:**
   - **Primary Analysis Unit:** Daily portfolio net return $R_d$ (percentage return on capital per calendar day, $T=20$ OOS trading days), eliminating intraday overlapping position correlation.
   - **Secondary Analysis Unit:** Trade-level net return $r_i$ for execution analysis, applying Heteroskedasticity and Autocorrelation Consistent (HAC / Newey-West) standard errors and stationary block bootstrap.
   - **Multi-Session Position Dependence:** Positions carried across multiple days (overnight/weekend risk) create serial dependence across daily returns $R_d$. Multi-session holding periods must be modeled using overlapping block bootstrap techniques.
4. **Defensible Power Procedure:** The 69-trade sample estimate is classified as an illustrative Gaussian i.i.d. baseline. The exact required sample size $N_{\text{powered}}$ is officially categorized as `UNRESOLVED_PENDING_IN_SAMPLE_MOMENTS` until empirical moments (variance, autocorrelation $\hat{\rho}_k$, skewness, kurtosis) are measured during Sessions 1–40.
5. **Strict Clock Domain Separation:** Prohibits subtracting timestamps across incompatible clock domains. Preserves provider event time (`feed_server_ts` epoch ms), local monotonic time (`local_receipt_mono_ns` ns), and local wall-clock time (`local_receipt_utc_ms` epoch ms). Quote age and freshness ($\le 3,000\text{ ms}$) are computed strictly within the local clock domain.
6. **Exhaustive Eight-State Decision Hierarchy with Operational Precedence:** Enforces an ordered decision tree where `OPERATIONAL_RISK_STOP` takes absolute precedence over all statistical evaluations, terminating the test immediately upon risk breach.
7. **Versioned Experiment Manifest & Longitudinal Freeze:** Establishes an immutable experiment manifest binding code, schema, collector, simulator, cost schedule, and random seeds across all 60 sessions. Any material protocol deviation after Session 1 requires aborting and restarting from Session 1.
8. **Sealed Historical Benchmark Isolation:** Reclassifies the 2025–2026 dataset as an older, separately sealed historical benchmark (`0444` permissions, read-prohibited during development) distinct from prospective 60-session live streaming data.

---

## 2. Methodological Foundations & Regulatory Accounting

### 2.1 Transaction-Cost Model, Regulatory Sources & Arithmetic Reconciliation

#### A. The Legal & Mathematical Basis of GST on Securities Transactions
Under the Central Goods and Services Tax Act, 2017 (CGST Act) and corresponding State/UT GST enactments, financial transactions involving the transfer of securities are not goods or services (Schedule III of CGST Act); therefore, **GST is never levied on the traded premium turnover ($\sum P \times Q$)**. 

GST is levied at **18.0%** exclusively on the consideration charged for taxable intermediary financial services. In retail options trading, the taxable base consists of:
1. **Brokerage Fees** charged by the trading member (CBIC Service Accounting Code 997152).
2. **Exchange Transaction Charges** levied by the stock exchange (including Investor Protection Fund Trust contributions).
3. **Clearing Charges** (where separately billed).

GST is **STRICTLY EXCLUDED** from:
- Total traded premium turnover.
- Securities Transaction Tax (STT).
- SEBI Regulatory Turnover Fees.
- Stamp Duty.

$$\text{Taxable Service Base} = \text{Brokerage} + \text{Exchange Transaction Charges (including IPFT)}$$

$$\text{GST Amount} = \text{Taxable Service Base} \times 0.18$$

#### B. Itemized Statutory & Brokerage Schedule with Published Authorities
The rates below represent published regulatory schedules and broker tariffs. They represent our simulation baseline, but **broker contract-note reconciliation remains required** to verify actual broker billing:

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| ITEMIZED TRANSACTION COST SCHEDULE & PUBLISHED REGULATORY CITATIONS                                     |
+----+-----------------------------+-----------------------+--------------------------+------------------+
| #  | Charge Component            | Rate / Tariff         | Taxable Base / Traded Leg| Published Source |
+----+-----------------------------+-----------------------+--------------------------+------------------+
| 1  | Brokerage                   | ₹20/order (Basic) or  | Per executed order fill  | Upstox Published |
|    |                             | ₹30/order (Plus)      | (Entry & Exit legs)      | Retail Tariff    |
|    |                             | Default: UNKNOWN (₹30)|                          | (Active Retail)  |
+----+-----------------------------+-----------------------+--------------------------+------------------+
| 2  | Exchange Transaction Charge | 0.03553%              | Traded Premium Turnover  | NSE Circular     |
|    | (Unified Exchange + IPFT)   | (₹3,553.00 per crore) | (Buy Premium + Sell Prem)| NSE/FA/73061     |
|    |                             |                       |                          | (Oct 1, 2024)    |
+----+-----------------------------+-----------------------+--------------------------+------------------+
| 3  | Goods & Services Tax (GST)  | 18.00%                | Brokerage + Exchange     | CGST Act, 2017;  |
|    |                             | (0.1800)              | Transaction Charges ONLY | CBIC SAC 997152  |
+----+-----------------------------+-----------------------+--------------------------+------------------+
| 4  | Securities Transaction Tax  | 0.1500%               | Sell Premium Turnover    | Finance Act,     |
|    | (STT)                       | (₹1,500.00 per crore) | ONLY (Buy side = 0.0%)   | 2024 / 2026      |
|    |                             |                       |                          | (Apr 1, 2026)    |
+----+-----------------------------+-----------------------+--------------------------+------------------+
| 5  | SEBI Regulatory Turnover Fee| 0.0001%               | Traded Premium Turnover  | SEBI Regulations |
|    |                             | (₹10.00 per crore)    | (Buy Premium + Sell Prem)| Gazette No.      |
|    |                             |                       |                          | 2014-15/03/1089  |
+----+-----------------------------+-----------------------+--------------------------+------------------+
| 6  | Stamp Duty                  | 0.0030%               | Buy Premium Turnover     | Indian Stamp Act |
|    |                             | (₹300.00 per crore)   | ONLY (Sell side = 0.0%)  | Rules, 2019      |
|    |                             |                       |                          | (July 1, 2020)   |
+----+-----------------------------+-----------------------+--------------------------+------------------+
```

*Note on Delivery / Exercise STT:* If an ITM option expires and is exercised, STT is 0.125% of settlement value. Because Strategy 11.4 mandates closing positions before **15:15 IST** on expiry day, exercise STT is not modeled.

#### C. Independent Arithmetic Reconciliation of Round-Trip Calculations

##### Scenario 1: Single Option Contract Roundtrip (1 Lot NIFTY 50 = 25 units)
- Entry: Buy 1 lot @ ₹150.00 ($\text{Buy Turnover} = ₹3,750.00$). Exit: Sell 1 lot @ ₹180.00 ($\text{Sell Turnover} = ₹4,500.00$). Total Turnover: $₹8,250.00$. Gross P&L: $+₹750.00$. Orders: 2.

```
+─────────────────────────────────────────────────────────────────────────────────────────────────────────+
| ARITHMETIC RECONCILIATION — SINGLE OPTION ROUNDTRIP (TURNOVER: ₹8,250.00)                               |
+-----------------------------+------------------------------------+--------------------------------------+
| Charge Component            | Upstox Basic Plan (₹20/order)      | Conservative Fallback (Plus ₹30/ord) |
+-----------------------------+------------------------------------+--------------------------------------+
| Brokerage                   | 2 orders × ₹20.00 = ₹40.00         | 2 orders × ₹30.00 = ₹60.00           |
| Exchange Charges (0.03553%) | ₹8,250.00 × 0.0003553 = ₹2.93      | ₹8,250.00 × 0.0003553 = ₹2.93        |
| Taxable Base for GST        | ₹40.00 + ₹2.93 = ₹42.93            | ₹60.00 + ₹2.93 = ₹62.93              |
| GST (18.0% on Taxable Base) | ₹42.93 × 0.18 = ₹7.73              | ₹62.93 × 0.18 = ₹11.33               |
| STT (0.15% on Sell Prem)    | ₹4,500.00 × 0.0015 = ₹6.75         | ₹4,500.00 × 0.0015 = ₹6.75           |
| SEBI Turnover Fee (₹10/cr)  | ₹8,250.00 × 0.000001 = ₹0.01       | ₹8,250.00 × 0.000001 = ₹0.01         |
| Stamp Duty (0.003% on Buy)  | ₹3,750.00 × 0.00003 = ₹0.11        | ₹3,750.00 × 0.00003 = ₹0.11          |
+-----------------------------+------------------------------------+--------------------------------------+
| TOTAL TRANSACTION FRICTION  | ₹57.53 (0.697% of turnover)        | ₹81.13 (0.983% of turnover)          |
| NET ARITHMETIC P&L          | +₹692.47 (Gross ₹750 - ₹57.53)     | +₹668.87 (Gross ₹750 - ₹81.13)       |
+-----------------------------+------------------------------------+--------------------------------------+
```

##### Scenario 2: Strategy 11.4 4-Leg Iron Condor Roundtrip (1 Lot NIFTY 50 = 25 units)
- 4 legs entered, 4 legs exited. Total Buy Turnover = **₹4,125.00**. Total Sell Turnover = **₹6,200.00**. Combined Turnover = **₹10,325.00**. Gross P&L = **+₹3,000.00**. Orders = 8.

```
+─────────────────────────────────────────────────────────────────────────────────────────────────────────+
| ARITHMETIC RECONCILIATION — 4-LEG IRON CONDOR (TURNOVER: ₹10,325.00, 8 ORDERS)                          |
+-----------------------------+------------------------------------+--------------------------------------+
| Charge Component            | Upstox Basic Plan (₹20/order)      | Conservative Fallback (Plus ₹30/ord) |
+-----------------------------+------------------------------------+--------------------------------------+
| Brokerage                   | 8 orders × ₹20.00 = ₹160.00        | 8 orders × ₹30.00 = ₹240.00          |
| Exchange Charges (0.03553%) | ₹10,325.00 × 0.0003553 = ₹3.67     | ₹10,325.00 × 0.0003553 = ₹3.67       |
| Taxable Base for GST        | ₹160.00 + ₹3.67 = ₹163.67          | ₹240.00 + ₹3.67 = ₹243.67            |
| GST (18.0% on Taxable Base) | ₹163.67 × 0.18 = ₹29.46            | ₹243.67 × 0.18 = ₹43.86              |
| STT (0.15% on Sell Prem)    | ₹6,200.00 × 0.0015 = ₹9.30         | ₹6,200.00 × 0.0015 = ₹9.30           |
| SEBI Turnover Fee (₹10/cr)  | ₹10,325.00 × 0.000001 = ₹0.01      | ₹10,325.00 × 0.000001 = ₹0.01        |
| Stamp Duty (0.003% on Buy)  | ₹4,125.00 × 0.00003 = ₹0.12        | ₹4,125.00 × 0.00003 = ₹0.12          |
+-----------------------------+------------------------------------+--------------------------------------+
| TOTAL TRANSACTION FRICTION  | ₹202.56 (1.962% of turnover)       | ₹296.96 (2.876% of turnover)         |
| NET ARITHMETIC P&L          | +₹2,797.44 (Gross ₹3,000 - ₹202.56)| +₹2,703.04 (Gross ₹3,000 - ₹296.96)  |
+-----------------------------+------------------------------------+--------------------------------------+
```

#### D. Account Plan Status & Unresolved Confirmation
- **Status:** Maintained as `accountPlan: "UNKNOWN"`.
- **Simulation Rule:** All backtest P&L figures apply the **Plus plan rate (₹30.00 per order)** as `CONSERVATIVE_RESEARCH_FALLBACK` until the owner provides verified contract notes confirming whether the account is billed under Basic or Plus.

---

### 2.2 Greek Terminology & Provenance Governance

Exchanges match trades and broadcast order depth; exchanges do not broadcast option Greeks. Upstox streaming Greeks are derivative values computed on broker infrastructure. The taxonomy strictly partitions data into three categories:

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| DATA CATEGORY AND PROVENANCE CLASSIFICATION                                                            |
+-------------------+-----------------------------------+--------------------+----------------------------+
| Category Code     | Description                       | Provenance Tag     | Calculation Authority      |
+-------------------+-----------------------------------+--------------------+----------------------------+
| Category 1        | Raw trades, depth, bids, asks,    | PROVENANCE_EXCH_   | NSE Matching Engine        |
| MARKET_OBSERVED   | volumes, OI, and exchange times   | MATCHING_ENGINE    | (Zero Model Assumptions)   |
+-------------------+-----------------------------------+--------------------+----------------------------+
| Category 2        | Upstox-streamed Greeks and IV     | PROVENANCE_BROKER_ | Upstox Infrastructure      |
| BROKER_SUPPLIED_  | embedded in WebSocket Feed V3     | FEED_MODEL_OUTPUT  | (Broker Black-76 / B-S)    |
| MODEL_OUTPUT      |                                   |                    |                            |
+-------------------+-----------------------------------+--------------------+----------------------------+
| Category 3        | Offline Black-Scholes Greeks      | PROVENANCE_LOCAL_  | Internal Research Engine   |
| OFFLINE_RESEARCH_ | calculated from historical OHLC   | RESEARCH_MODEL     | (Synthetic Parameter Fits) |
| MODEL_OUTPUT      | candle close prices               |                    |                            |
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
```

1. Gateway timestamps (`feed_server_ts`) must be preserved alongside local monotonic timestamps (`local_receipt_mono_ns`).
2. Missing broker Greeks remain explicitly `null` (zero synthetic forward-filling).
3. The underlying pricing basis (spot index vs. futures contract) remains an unconfirmed broker assumption.

---

### 2.3 Clock Domain Separation & Timestamp Governance

A major temporal defect is comparing or subtracting timestamps originating from incompatible clocks (e.g., subtracting epoch milliseconds from monotonic nanoseconds). The platform enforces strict clock domain isolation:

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| CLOCK DOMAIN TAXONOMY & PERMITTED OPERATIONS                                                            |
+----+-----------------------+---------------------+-----------------------+------------------------------+
| #  | Field Identifier      | Clock Domain        | Precision / Type      | Permitted Operations         |
+----+-----------------------+---------------------+-----------------------+------------------------------+
| 1  | feed_server_ts        | Provider Wall-Clock | Unix Epoch ms (int64) | Ordering provider events;    |
|    |                       |                     |                       | compare with wall-clock only |
+----+-----------------------+---------------------+-----------------------+------------------------------+
| 2  | local_receipt_mono_ns | Local Monotonic     | BigInt nanoseconds    | Duration within local system;|
|    |                       | (process.hrtime)    | (Zero wall drift)     | NEVER subtract from epoch ms |
+----+-----------------------+---------------------+-----------------------+------------------------------+
| 3  | local_receipt_utc_ms  | Local Wall-Clock    | Unix Epoch ms (int64) | Local calendar mapping;      |
|    |                       | (Date.now())        |                       | Network transit latency      |
+----+-----------------------+---------------------+-----------------------+------------------------------+
| 4  | exchange_timestamp_ms | Exchange Matching   | Unix Epoch ms (int64) | Market-event sequencing;     |
|    |                       | Engine              | (NSE matching clock)  | Provider gateway latency     |
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
```

#### Strict Temporal Rules:
1. **Clock Separation:** Mathematical subtraction between `feed_server_ts` and `local_receipt_mono_ns` is strictly prohibited.
2. **Transit Latency Calculation:** Gateway transit latency is calculated only between compatible wall-clock domains:
   $$\text{Network Transit Latency} = \text{local\_receipt\_utc\_ms} - \text{feed\_server\_ts}$$
3. **Internal Processing Duration:** Internal collector pipeline latency is measured strictly in nanoseconds using monotonic deltas:
   $$\Delta t_{\text{pipeline}} = \text{local\_pipeline\_exit\_mono\_ns} - \text{local\_receipt\_mono\_ns}$$
4. **Quote Age & Freshness Evaluation:** Freshness is evaluated relative to the local receipt wall-clock:
   $$\text{Quote Age}(t) = t_{\text{local\_utc\_ms}} - t_{\text{quote\_local\_utc\_ms}} \le 3,000\text{ ms}$$

---

### 2.4 Research Firewall: Exploratory Modeling vs. Primary Validation

```
+─────────────────────────────────────────────────────────────────────────────────────────────────────────+
| THE QUANTITATIVE RESEARCH FIREWALL                                                                      |
|                                                                                                         |
|   ┌───────────────────────────────────────────────┐   ┌───────────────────────────────────────────────┐  |
|   │         TRACK A: EXPLORATORY RESEARCH         │   │         TRACK B: PRIMARY VALIDATION           │  |
|   ├───────────────────────────────────────────────┤   ├───────────────────────────────────────────────┤  |
|   │ Input: Historical REST 1m OHLC candles        │   │ Input: Observed Streaming Parquet Ticks       │  |
|   │ Greeks: OFFLINE_RESEARCH_MODEL_OUTPUT         │   │ Greeks: BROKER_SUPPLIED_MODEL_OUTPUT          │  |
|   │ Spreads: Modeled (Synthetic 1.5% fixed)       │   │ Spreads: MARKET_OBSERVED Level 1 Bids/Asks    │  |
|   │ Fills: Candle Close / Mid-Price               │   │ Fills: Crossing Real Spread + Latency Penalty │  |
|   │ Tag: VALIDATION_STATUS: EXPLORATORY_ONLY      │   │ Tag: VALIDATION_STATUS: PRIMARY_AUDIT         │  |
|   │                                               │   │                                               │  |
|   │ PERMITTED: Code pipeline verification,        │   │ REQUIRED: Minimum 60 Valid Trading Sessions   │  |
|   │ parameter range bounds, sensitivity surfaces  │   │ REQUIRED: Multi-Regime Out-of-Sample Testing  │  |
|   │                                               │   │                                               │  |
|   │ PROHIBITED: Capital allocation authorization, │   │ ELIGIBLE: Owner Production Readiness Review   │  |
|   │ live trading claims, production readiness     │   │                                               │  |
|   └───────────────────────────────────────────────┘   └───────────────────────────────────────────────┘  |
+─────────────────────────────────────────────────────────────────────────────────────────────────────────+
```

**Anti-Fabrication Rule:** Primary validation (Track B) prohibits synthetic historical data, modeled spreads, or offline Black-Scholes Greeks derived from candle closes.

---

### 2.5 Governance: Sealed Historical Benchmark vs. Prospective Streaming Data

To prevent retrospective data snooping, the architecture strictly distinguishes two separate datasets:
1. **Sealed 2025–2026 Historical Benchmark Dataset (`web/.data/collector/holdout_sealed/`):**
   - Older, pre-existing historical archive.
   - Stored under POSIX permissions `0444` (read-only); access is logically gated and forbidden during development and testing.
   - SHA-256 manifest is verified, but dataset is not queried, filtered, or optimized against.
   - Role: Acts strictly as an independent **historical benchmark audit**, evaluated once after prospective 60-session validation is completed.
2. **Prospective 60-Valid-Session Streaming Dataset (`web/.data/collector/parquet/`):**
   - Newly collected streaming ticks captured from live market feeds during Gate 3/4.
   - Evaluated chronologically: Sessions 1–40 (In-Sample Observation) and Sessions 41–60 (Out-of-Sample Holdout).

---

## 3. 60-Valid-Session Collection Roadmap & Session Quality Metrics

### 3.1 Two-Stage Phased Collection
- **Phase 1: 5-Session Passive Pilot:** Evaluates socket stability, watchdogs, buffer backpressure, and storage finalization. Zero order execution. Requires 5 consecutive finalized sessions with 100% SHA-256 match and internal persistence ratio $\ge 99.0\%$.
- **Phase 2: 55-Session Production Collection:** Ingests live streaming feeds over ~11 calendar weeks across diverse market regimes (at least 12 weekly NIFTY expiries, 3 monthly BANKNIFTY expiries, low-IV and high-IV days).

### 3.2 Session Quality Metrics, Freshness Rules & Explicit Denominators

```
+─────────────────────────────────────────────────────────────────────────────────────────────────────────+
| RECONCILED SESSION QUALITY METRICS SPECIFICATION                                                        |
+----+-----------------------+-----------------------------+-----------------------+----------------------+
| #  | Metric                | Mathematical Formula        | Measurement Interval  | Acceptance Rule      |
+----+-----------------------+-----------------------------+-----------------------+----------------------+
| 1  | 375-Minute Duration   | T_session = T_close - T_open| Continuous session    | T_open <= 09:15:05;  |
|    |                       | Net Active Time =           | boundary: 09:15:00 to | T_close >= 15:30:00; |
|    |                       | 22,500s - Σ(gapDuration_s)  | 15:30:00 IST (22,500s)| Net Active >= 22,320s|
|    |                       | Denom: 22,500 seconds       |                       | (Outage <= 180s total|
|    |                       |                             |                       | Max single gap <= 60s|
+----+-----------------------+-----------------------------+-----------------------+----------------------+
| 2  | Quote-Quality Metric  | Q_contract =                | Evaluated per second  | Q_universe >= 95.0%; |
|    | (Contract-Second      | N_valid_sec(c) / 22,500     | for every contract c; | AND Q_c >= 90.0% for |
|    | Buckets with Freshness| Denom: 22,500 seconds per   | Freshness: quote age  | EVERY individual     |
|    | Rule <= 3.0s)         | subscribed contract         | <= 3.0 seconds        | Core ATM ± 3 contract|
+----+-----------------------+-----------------------------+-----------------------+----------------------+
| 3  | Internal Persistence  | P_ratio = N_persisted /     | Full session;         | P_ratio >= 99.0%     |
|    | Ratio (Post-Receipt)  | N_transport_read            | measured at local     | Buffer drops = 0;    |
|    |                       | Denom: Total frames read at | storage finalization  | Stage 2 shed <= 1.0% |
|    |                       | local socket boundary       | boundary              |                      |
+----+-----------------------+-----------------------------+-----------------------+----------------------+
```

#### Detailed Definitions for Quote-Quality Governance:
1. **Quote Freshness Rule:** A contract-second bucket $t$ is evaluated as valid if and only if the most recent quote update for contract $c$ arrived at timestamp $t_{\text{quote\_local\_ms}}$ satisfying:
   $$\text{Quote Age} = t_{\text{local\_ms}} - t_{\text{quote\_local\_ms}} \le 3,000 \text{ ms}$$
   Quotes older than 3.0 seconds are classified as **`STALE_QUOTE`**, and that contract-second evaluates as invalid ($0$).
2. **Missing Timestamps:** If a quote update arrives with missing or null timestamps (`feed_server_ts` or `local_receipt_mono_ns`), it is discarded as corrupt.
3. **Subscribed Contracts with Zero Data:** If a subscribed contract never ticks during a session, its coverage $Q_c = 0.0\%$, directly penalizing universe coverage and failing per-contract coverage.
4. **Per-Contract Reporting:** Coverage is computed and reported for every individual contract $c \in U$, guaranteeing that active ATM contracts cannot conceal missing quotes in less-active outer wings.
5. **Separation of Spread Thresholds:**
   - **Data-Quality Threshold:** $\text{Spread} \le 20.0\%$ of mid. Purpose: Filters out corrupt data prints, off-market test quotes, or crossed books.
   - **Strategy Entry Threshold:** $\text{Spread} \le 5.0\%$ of premium. Purpose: Strict liquidity execution gate for Strategy 11.4 trade entries.

---

## 4. Quantitative Strategy 11.4 Boundary Invariance

Strategy 11.4 rules and risk limits remain **STRICTLY FROZEN**:
- **Zero Free Parameters:** Strategy 11.4 contains no tunable parameters. There is no lookback fitting, delta window calibration, or threshold modification.
- **Frozen Specifications (Commit `bcdd18a`):**
  - Short leg delta: $0.16 \le |\Delta| \le 0.22$.
  - Long hedge delta: $0.05 \le |\Delta| \le 0.08$.
  - Spread gate: $\le 5.0\%$ of premium.
  - Maximum risk per trade: **1.0% of capital (STRICTLY FROZEN)**.
  - Maximum open exposure: 20% capital / 5 lots.
  - Profit target: 50% of maximum credit.
  - Stop loss: 150% of maximum credit (combined) / 200% of leg premium (individual).
  - Expiry square-off: Mandatory close before 15:15 IST.
  - Signal evaluation: 7 checks (Trend 20, Option Chain 20, Price Action 15, Indicators 15, Volatility 10, News 10, Breadth 10) requiring score $\ge 65.0$.

---

## 5. Walk-Forward Simulation, Execution Realism & Statistical Power

### 5.1 Evaluation Partitions: Chronological Split vs. Sub-Period Verification
1. **Primary Evaluation Design: Chronological 40/20 Split**
   - **Sessions 1 to 40 (In-Sample Observational Baseline):** Used strictly to verify that the frozen code operates deterministically on live streaming feeds and observe live slippage distributions. No parameter tuning occurs.
   - **Sessions 41 to 60 (Out-of-Sample Evaluation):** Evaluated strictly forward in time with locked code to test strategy performance.
2. **Sub-Period Regime Analysis:**
   - Out-of-Sample performance across Sessions 41–60 may be analyzed across two distinct 10-session blocks (Sessions 41–50 vs. Sessions 51–60) to assess regime sensitivity.
   - Sessions 1–40 are designated in-sample observations and cannot serve as out-of-sample evidence.

### 5.2 Execution Simulation Assumptions & Queue Limitations
1. **Simulation Assumptions (Unverified until Pilot):**
   - **250 ms Latency Buffer:** Assumes an order fill is evaluated against the market quote arriving $250\text{ ms}$ after signal generation ($t_{\text{fill}} = t_{\text{signal}} + 250\text{ ms}$).
   - **1-Tick Adversarial Slippage:** Assumes fills cross the spread and incur an extra 1 minimum tick size (₹0.05 per unit) penalty.
   - *Status:* These are **simulation assumptions**, not empirically confirmed broker execution speeds. Actual execution latency will be measured during the authorized pilot.
2. **Microstructure Limitations:**
   - **Level 2 Book-Walking:** If order size $Q > Q_{\text{top}}$, the fill walks the depth book. However, book-walking only captures static depth at a single snapshot; it cannot model queue priority, rapid cancellations, or competing latency.
   - **Non-Guarantee Declaration:** **Simulated fills are conservative approximations, NOT guaranteed executions.**

### 5.3 Causal Stop-Loss Protocol, Outages & Legging Risk State Accounting

The execution simulation operates on a strictly causal, forward-only basis. Retroactive lookbacks, worst-price scanning windows, and future quote assumptions are prohibited.

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| CAUSAL STOP-LOSS & OUTAGE STATE TRANSITION TAXONOMY                                                     |
+----+---------------------------+------------------------------------+-----------------------------------+
| #  | State Code                | Trigger Condition                  | Resolution & Accounting Rule      |
+----+---------------------------+------------------------------------+-----------------------------------+
| 1  | OPEN                      | Normal position tracking           | Continuous quote monitoring       |
+----+---------------------------+------------------------------------+-----------------------------------+
| 2  | PENDING_EXIT              | Stop loss or square-off triggered; | Awaiting verified market quote    |
|    |                           | feed active or reconnecting        | at t_fill = t_trigger + 250ms     |
+----+---------------------------+------------------------------------+-----------------------------------+
| 3  | PARTIALLY_FILLED          | Market depth insufficient to fill  | Unfilled remainder stays pending; |
|    |                           | entire order lot size              | walked through next quote levels  |
+----+---------------------------+------------------------------------+-----------------------------------+
| 4  | ONE_LEG_EXITED            | One wing leg filled while opposing | Transition to asymmetric exposure;|
|    |                           | leg remains unexecuted             | timer initiated (max 5 seconds)   |
+----+---------------------------+------------------------------------+-----------------------------------+
| 5  | ASYMMETRIC_LEGGING_RISK   | Hedge broken due to feed failure,  | Naked exposure recorded; flagged; |
|    |                           | crossed book, or rejection         | market order sent for remaining   |
+----+---------------------------+------------------------------------+-----------------------------------+
| 6  | UNRESOLVED_POSITION       | Feed outage persists to close, or  | Marked for manual reconciliation; |
|    |                           | quotes unpopulated post-reconnect  | structural loss bound applied     |
+----+---------------------------+------------------------------------+-----------------------------------+
| 7  | RECONCILIATION_REQUIRED   | Mismatch between expected book and | Automated execution suspended;    |
|    |                           | actual executed fills              | fail closed until owner review    |
+----+---------------------------+------------------------------------+-----------------------------------+
| 8  | CLOSED                    | All legs fully filled and audited  | Final realized P&L and fees booked|
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
```

#### Detailed Execution Rules:
1. **Immediate Execution Boundary:** When a stop loss triggers at $t_{\text{stop}}$, execution is attempted at $t_{\text{fill}} = t_{\text{stop}} + 250\text{ ms}$ against active top-of-book quotes.
2. **Feed Outages & Transport Disconnections:**
   - If market quotes are unavailable at $t_{\text{stop}}$, the order transitions to **`PENDING_EXIT`**.
   - Upon reconnection ($t_{\text{reconnect}}$), the order executes against the **first observed executable quote with depth** ($\text{best\_bid}$ with $\text{best\_bid\_qty} > 0$ for sells; $\text{best\_ask}$ with $\text{best\_ask\_qty} > 0$ for buys) for $t \ge t_{\text{reconnect}}$.
   - **Trade Prints:** A trade print alone is **not an executable quote** and cannot be treated as a guaranteed fill.
3. **Unresolvable Outage Protocol:**
   - If quotes remain unpopulated or crossed post-reconnect, the position transitions to **`UNRESOLVED_POSITION`**.
   - In simulation, the trade is assessed **`MAX_STRUCTURAL_SPREAD_LOSS`** (the defined wing width minus net credit). This represents a conservative mathematical risk bound, **not an actual execution price**.
4. **Legging Risk in Multi-Leg Structures:**
   - If an outage or partial fill causes one leg of an iron condor to close while the opposing protective hedge remains unexecuted, the defined-risk structure is broken.
   - The engine flags this as **`ASYMMETRIC_LEGGING_RISK`** and records the naked exposure rather than assuming spread protection held.

---

### 5.4 Statistical Validity, Power Analysis & Exhaustive Outcome Hierarchy

#### A. Power Analysis & In-Sample Variance Determination
Calculating the required sample size for $80\%$ statistical power at $\alpha = 0.05$ requires empirical knowledge of:
1. Expected net trade return $\mu$ and return variance $\sigma^2$.
2. Serial autocorrelation $\rho_k$ across consecutive calendar sessions and multi-day overlapping positions.
3. Return skewness and excess kurtosis (fat tails).

Because Strategy 11.4 has never operated on observed streaming market feeds, these parameters cannot be known a priori without inventing empirical data. 

**Defensible Determination Procedure:**
- The illustrative 69-trade sample estimate is based on simplified Gaussian i.i.d. assumptions ($d=0.30, \alpha=0.05, 1-\beta=0.80$). It serves only as an illustrative conceptual baseline.
- During In-Sample observation (Sessions 1–40), the empirical moments ($\hat{\mu}, \hat{\sigma}^2, \hat{\rho}_k$, skewness, kurtosis) will be computed from live execution traces.
- Using these empirical moments, the required sample size $N_{\text{powered}}$ for 80% power at $\alpha = 0.05$ will be calculated via stationary block-bootstrap power simulation before entering Out-of-Sample evaluation.
- Until Sessions 1–40 provide empirical moments, the exact powered sample size is formally classified as **`UNRESOLVED_PENDING_IN_SAMPLE_MOMENTS`**.

#### B. Primary Statistical Inference Procedure
To account for temporal dependence, overlapping holdings, and intraday multi-position structures:
1. **Primary Unit of Analysis:** Daily portfolio net return $R_d$ (percentage return on capital per calendar day). Daily aggregation naturally eliminates intra-day overlapping position correlation and provides a consistent time-series unit ($T=20$ OOS trading days).
2. **Secondary Unit of Analysis:** Trade-level net return $r_i$ for granular execution analysis, using HAC (Newey-West) standard errors and stationary block bootstrap.
3. **Multi-Session Position Dependence:**
   - Daily aggregation does *not* eliminate serial dependence from positions carried across multiple days (overnight/weekend risk).
   - If positions span multiple sessions, daily returns $R_d$ will exhibit multi-day autocorrelation.
   - Overnight and multi-session positions must be evaluated using overlapping session-block bootstrapping (Politis & Romano, 1994) with average block length calibrated via Patton, Politis, and White (2009).
4. **HAC & Bootstrap Standards:**
   - Trade-level hypothesis testing applies **HAC (Heteroskedasticity and Autocorrelation Consistent) t-statistics** (Newey & West, 1987).
   - Non-parametric two-sided 95% Confidence Intervals for mean net return and Profit Factor are generated using the **Stationary Block Bootstrap** with 10,000 resamples.
   - Conventional Student's t-test without HAC adjustment is explicitly acknowledged as non-robust to serial correlation and will not serve as the primary inference authority.

#### C. Exhaustive & Mutually Exclusive Outcome Hierarchy with Precedence
Every conceivable Out-of-Sample evaluation result maps to exactly one of the eight mutually exclusive outcome states.

> [!CAUTION]
> **OPERATIONAL RISK PRECEDENCE:**
> An `OPERATIONAL_RISK_STOP` takes absolute precedence over all statistical evaluations. If a cumulative drawdown limit (> 3.0%), single-day loss limit (> 2.0%), or per-trade risk limit (> 1.0%) is breached at any time, testing terminates immediately with status `OPERATIONAL_RISK_STOP` regardless of sample size, win rate, or statistical significance.

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| EXHAUSTIVE VALIDATION OUTCOME STATE MATRIX (EVALUATED IN STRICT PRECEDENCE ORDER)                       |
+----+-----------------------+---------------------------------------+------------------------------------+
|Rank| Outcome State         | Empirical Condition                   | Governance Action                  |
+----+-----------------------+---------------------------------------+------------------------------------+
| 1  | OPERATIONAL_RISK_STOP | Cumulative Drawdown > 3.00%, single   | Immediate operational halt. Shuts  |
|    | (FIRST PRIORITY)      | daily loss > 2.00%, trade risk        | down testing to protect capital.   |
|    |                       | allocation > 1.00%, feed outage > 180s| Absolute circuit breaker.          |
|    |                       | or data corruption                    |                                    |
+----+-----------------------+---------------------------------------+------------------------------------+
| 2  | VALIDATED_POWERED_PASS| N >= N_powered, T >= 20, PF >= 1.50,  | Strategy meets formal statistical  |
|    |                       | Max DD <= 3.0%, Win Rate >= 65%,      | power and performance criteria;    |
|    |                       | Annualized Sharpe > 1.00, p < 0.05,   | eligible for owner review.         |
|    |                       | 95% Bootstrap CI > 0                  |                                    |
+----+-----------------------+---------------------------------------+------------------------------------+
| 3  | UNDERPOWERED_         | 30 <= N < N_powered, T >= 20, PF      | Positive preliminary signals, but  |
|    | PRELIMINARY_PASS      | >= 1.50, Max DD <= 3.0%, Win Rate     | sample is underpowered (< 80%).    |
|    |                       | >= 65%, Net P&L > 0, zero risk breaches| Gated; requires extended collection|
+----+-----------------------+---------------------------------------+------------------------------------+
| 4  | UNDERPOWERED_         | 30 <= N < N_powered, T >= 20, fails   | Underpowered sample exhibiting     |
|    | SUBTHRESHOLD_         | pass hurdle (PF < 1.50 OR WR < 65%    | sub-target, breakeven, or negative |
|    | INCONCLUSIVE          | OR Net P&L <= 0), zero risk breaches  | returns without risk breach. Gated.|
+----+-----------------------+---------------------------------------+------------------------------------+
| 5  | INSUFFICIENT_SAMPLE_  | N < 30 executed trades OR T < 20 valid| Sample size too small for test.    |
|    | INCONCLUSIVE          | sessions completed, zero risk breaches| Inconclusive; extended collection. |
+----+-----------------------+---------------------------------------+------------------------------------+
| 6  | POWERED_EDGE_         | N >= N_powered, T >= 20, fails hurdle | Adequately powered sample failed to|
|    | UNPROVEN              | (PF < 1.50 OR WR < 65% OR Sharpe <= 1)| meet performance benchmarks, but   |
|    |                       | does not satisfy Rank 8 refutation    | does not refute edge. Barred.      |
+----+-----------------------+---------------------------------------+------------------------------------+
| 7  | STATISTICALLY_        | N >= N_powered, T >= 20, PF >= 1.50,  | High nominal performance, but high |
|    | INCONCLUSIVE          | Win Rate >= 65%, Net P&L > 0, but     | variance prevents statistical      |
|    |                       | HAC p >= 0.05 OR 95% CI crosses zero  | confidence. Gated from production. |
+----+-----------------------+---------------------------------------+------------------------------------+
| 8  | EMPIRICAL_STRATEGY_   | N >= N_powered, T >= 20, (PF < 1.00   | Statistically significant negative |
|    | REFUTATION            | OR Net P&L < 0), and (HAC p_refute    | edge. Strategy 11.4 permanently    |
|    |                       | < 0.05 OR 95% Bootstrap CI < 0)       | rejected on empirical grounds.     |
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
```

*Note on Automated Verification:* The exhaustive 8-state partition is codified and mathematically proven via automated decision table tests in [`decisionMatrix.ts`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/src/lib/research/decisionMatrix.ts) and [`decisionMatrix.test.ts`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/src/lib/research/decisionMatrix.test.ts) (13 tests including an exhaustive 2,160-case combinatorial grid sweep). Every possible outcome maps to exactly one state without gaps, fall-throughs, or ambiguities.

---

## 6. Versioned Experiment Manifest & Longitudinal Freeze Governance

To guarantee that the experimental setup is longitudinal and immune to mid-experiment drift, a **Versioned Experiment Manifest** must be created and signed off before Session 1:

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| VERSIONED EXPERIMENT MANIFEST INVENTORY                                                                 |
+----+--------------------------------+--------------------------------+----------------------------------+
| #  | Component                      | Version / Build Reference      | Cryptographic Verification       |
+----+--------------------------------+--------------------------------+----------------------------------+
| 1  | Strategy Implementation        | Strategy 11.4-frozen           | Git Commit SHA: bcdd18a          |
+----+--------------------------------+--------------------------------+----------------------------------+
| 2  | Strategy Configuration         | config-strategy-11.4-v1        | SHA-256 of frozen config JSON    |
+----+--------------------------------+--------------------------------+----------------------------------+
| 3  | Market Data Collector Daemon   | collector-daemon-v1.0.0        | Git Commit SHA of collector build|
+----+--------------------------------+--------------------------------+----------------------------------+
| 4  | Market Data Storage Schema     | COLLECTOR_DATA_SCHEMA.md v1.0.0| SHA-256 of schema specification  |
+----+--------------------------------+--------------------------------+----------------------------------+
| 5  | Quote Freshness Policy         | Age <= 3.0s, Contract-Second   | SHA-256 of data quality policy   |
+----+--------------------------------+--------------------------------+----------------------------------+
| 6  | Execution Simulator Engine     | sim-engine-v1.0.0              | Git Commit SHA of simulator code |
+----+--------------------------------+--------------------------------+----------------------------------+
| 7  | Transaction-Cost Schedule      | nse-options-2026-03            | SHA-256 of transactionCosts.ts   |
+----+--------------------------------+--------------------------------+----------------------------------+
| 8  | Statistical Inference Script   | stats-eval-v1.0.0              | Git Commit SHA of analysis suite |
+----+--------------------------------+--------------------------------+----------------------------------+
| 9  | Session Validity Rules         | FULL_FIDELITY_SESSION Criteria | SHA-256 of manifest validator    |
+----+--------------------------------+--------------------------------+----------------------------------+
```

### Protocol Deviation Governance:
1. **Zero Mid-Experiment Alterations:** The executable collector, schema, quote freshness filters, execution simulator, and strategy code must remain 100% frozen across all 60 sessions.
2. **Protocol Deviation Review:** If a software bug, system defect, or external exchange feed change requires code modifications after Session 1:
   - A formal **Protocol Deviation Record** must be documented.
   - If the deviation is **material** (alters tick ingestion, timestamps, quote filtering, fill prices, or fee calculations), **the experiment must be aborted and restarted from Session 1**. Mid-experiment code changes cannot be combined into a valid 60-session corpus.

---

## 7. Open Decisions & Governance Sign-Off

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| OPEN DECISIONS REGISTER & GOVERNANCE BLOCKERS                                                           |
+----+-----------------------------+------------------------------------+--------------------------------+
| #  | Decision Item               | Current Default / Fallback         | Required Action                |
+----+-----------------------------+------------------------------------+--------------------------------+
| 1  | Upstox Account Plan         | UNKNOWN (Plus ₹30/order fallback)  | Owner confirmation via notes   |
+----+-----------------------------+------------------------------------+--------------------------------+
| 2  | Technical Questionnaire     | Held offline (web/docs/UPSTOX_     | Owner dispatch decision or     |
|    |                             | SUPPORT_TECHNICAL_QUESTIONNAIRE.md)| empirical socket calibration   |
+----+-----------------------------+------------------------------------+--------------------------------+
| 3  | Measured Live Latency       | Assumed 250 ms simulation latency  | Empirical measurement during   |
|    | Distribution                | and 1-tick slippage buffer         | authorized Phase 1 pilot       |
+----+-----------------------------+------------------------------------+--------------------------------+
| 4  | In-Sample Powered Sample    | UNRESOLVED_PENDING_IN_SAMPLE_      | Empirical moment estimation    |
|    | Size (N_powered)            | MOMENTS                            | during Sessions 1–40           |
+----+-----------------------------+------------------------------------+--------------------------------+
| 5  | Live Collection Auth (Gate 3| BLOCKED (Awaiting Owner Approval)  | Required before Pilot Phase 1  |
+----+-----------------------------+------------------------------------+--------------------------------+
| 6  | Production Capital Deploy   | STRICT HARD NO-GO (11.25%)         | Blocked until 60-session audit |
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
```

**MANDATORY HALT: System execution is paused. All methodology design documentation is complete. Awaiting explicit owner review and approval before proceeding to the next gate.**
