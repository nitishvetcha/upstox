# Gate 2 — Research Methodology Correction & Consistency Audit Report
## Methodological Corrections, Statistical Formalization, Execution Realism & Holdout Governance Audit

**Document ID:** `GATE_2_METHODOLOGY_CORRECTION_REPORT.md`  
**Location:** `web/docs/GATE_2_METHODOLOGY_CORRECTION_REPORT.md`  
**Author:** Quantitative Systems Engineering & Research Architecture Principal  
**Date:** November 16, 2026  
**Audited Target Document:** `web/docs/GATE_2_RESEARCH_METHODOLOGY.md` (Revision 2.3.0)  
**WBS Reference:** Workstream 1 / Gate 2 (WBS 5.0)  
**Governance Status:** **PROVISIONAL DOCUMENTATION PROGRESS ONLY** (Not Formally Frozen or Approved)  
**Strategy Alignment:** Strategy 11.4 Formulas and 1.0% Risk Limit **STRICTLY FROZEN**  
**Production Readiness:** **11.25% — STRICT HARD NO-GO** (Live Trading Prohibited)  
**Execution Boundaries:** Strictly Offline; Zero Live API Calls, Zero Token Refreshes, Zero WebSockets, Zero Vendor Contact, Zero Capital Allocation  

---

## 1. Executive Summary & Gating Clarification

This report details the systematic corrections applied during the methodology review passes for **Gate 2 (WBS 5.0)**. 

> [!IMPORTANT]
> **GOVERNANCE & APPROVAL BOUNDARY:**
> This report documents **progress in research methodology design and offline documentation only**. It does **not** constitute final freeze or validation approval. Strategy 11.4 remains **unvalidated**, live data collection remains **unauthorized**, and production readiness remains **HARD NO-GO (11.25%)**.

The table below summarizes the eight audited focus areas, their initial defects, and the exact corrections implemented:

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| METHODOLOGY CORRECTIONS AUDIT SCORECARD (EIGHT DEFECT AREAS)                                            |
+----+--------------------------------+--------------------------------+------------------+---------------+
| #  | Focus Area / Issue             | Correction Implemented         | Status           | Section Ref   |
+----+--------------------------------+--------------------------------+------------------+---------------+
| 1  | Causal Stop-Loss Execution     | Removed future 30s window;     | CORRECTED        | Section 5.3   |
|    | (No future information)        | trade print is not a fill;     | Causal & Fail-   |               |
|    |                                | max spread loss as model bound | Closed           |               |
+----+--------------------------------+--------------------------------+------------------+---------------+
| 2  | Absolute Strategy Invariance   | Removed all references to ATR  | CORRECTED        | Section 4     |
|    | (Zero parameter tuning)        | lookback calibration; 100%     | Frozen Baseline  |               |
|    |                                | frozen commit bcdd18a verified | Enforced         |               |
+----+--------------------------------+--------------------------------+------------------+---------------+
| 3  | Statistical Power & Inference  | 69-trade estimate illustrative;| CORRECTED        | Section 5.4   |
|    | (HAC t-test, Bootstrap, 8 tiers| primary unit daily portfolio;  | 8-Tier Hierarchy |               |
|    | N_powered pending moments)     | HAC t-test; stationary block BS| Exhaustive       |               |
+----+--------------------------------+--------------------------------+------------------+---------------+
| 4  | Chronological Split & Rolling  | Excised Sessions 31–40 OOS     | CORRECTED        | Section 5.1   |
|    | Evaluation                     | mislabeling; independent 40/20 | Clean Split      |               |
|    |                                | partition established          | Established      |               |
+----+--------------------------------+--------------------------------+------------------+---------------+
| 5  | Execution Realism & Depth      | L2 depth book-walking; 250ms & | CORRECTED        | Section 5.2   |
|    | (Assumptions labeled)          | 1-tick labeled assumptions;    | Simulation       |               |
|    |                                | non-guarantee declaration      | Assumptions      |               |
+----+--------------------------------+--------------------------------+------------------+---------------+
| 6  | Sealed Holdout Partitioning    | 2025–2026 dataset classified as| CORRECTED        | Section 2.4   |
|    | (Holdout vs. Streaming Store)  | sealed historical benchmark;   | Sealed 0444      |               |
|    |                                | separate from prospective data | Access Gated     |               |
+----+--------------------------------+--------------------------------+------------------+---------------+
| 7  | Session Quality Reconciliation | Contract-second buckets with   | CORRECTED        | Section 3.2;  |
|    | (Explicit denominators & rules)| <= 3.0s freshness rule; 99%    | Explicit         | Table 3.2     |
|    |                                | persistence ratio distinguished| Denominators     |               |
+----+--------------------------------+--------------------------------+------------------+---------------+
| 8  | Transaction Costs Schedule     | Arithmetic reconciliation      | CORRECTED        | Section 2.1;  |
|    | (Statutory circulars, UNKNOWN) | separated from broker note     | UNKNOWN Fallback | Tables 2.1.B  |
|    |                                | confirmation; UNKNOWN Plus     | Maintained       | & 2.1.C       |
+----+--------------------------------+--------------------------------+------------------+---------------+
```

---

## 2. Detailed Technical Audit of Corrections

### 2.1 Causal Stop-Loss Execution & Feed Outage Protocol
- **Initial Defect:** Previous text allowed using the worst traded price across the 30 seconds post-reconnection. This was a lookahead bias that also mistakenly treated trade prints as executable fills.
- **Correction Implemented ([Section 5.3](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/GATE_2_RESEARCH_METHODOLOGY.md#L398-L425)):**
  - Strict causality: orders enter `PENDING_EXIT` during outages; fills are evaluated only after reconnection ($t \ge t_{\text{reconnect}}$).
  - Executable quotes required: A trade print is not proof of an executable fill. Execution requires an active, top-of-book quote with depth ($\text{best\_bid}$ with $\text{best\_bid\_qty} > 0$ for sells, $\text{best\_ask}$ with $\text{best\_ask\_qty} > 0$ for buys).
  - Unresolvable outages: If quotes remain absent post-reconnection, the position is assessed `MAX_STRUCTURAL_SPREAD_LOSS` (wing width minus net credit). This is explicitly documented as a **conservative model risk bound**, not an actual execution price.
  - Legging Risk: If one leg is stopped out while another leg stalls, the structure is flagged `ASYMMETRIC_LEGGING_RISK` and tracked for unhedged delta/gamma risk.

### 2.2 Strategy Invariance & Elimination of Calibration Language
- **Initial Defect:** Previous text suggested calibrating ATR lookback windows or adjusting parameters during the In-Sample phase.
- **Correction Implemented ([Section 4 & 5.1](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/GATE_2_RESEARCH_METHODOLOGY.md#L320-L384)):**
  - All language suggesting calibration, parameter fitting, or retuning has been deleted.
  - Strategy 11.4 formulas, 7 scoring weights, 65-point hurdle, delta selection windows ($0.16\text{--}0.22$ short, $0.05\text{--}0.08$ hedge), 5% spread gate, and the 1.0% per-trade risk limit are verified as 100% frozen (commit `bcdd18a`).
  - Sessions 1–40 are designated strictly as an **observational baseline check** to verify deterministic execution on live data feeds.

### 2.3 Statistical Power, Dependence & Exhaustive Outcome Hierarchy
- **Initial Defect:** The report claimed that 69 trades provided 80% power at $d = 0.30$ and permitted `VALIDATED_PASS` with only 30 trades, misnaming the test as a "one-sample t-test with Welch correction", and leaving intermediate outcomes unclassified.
- **Correction Implemented ([Section 5.4](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/GATE_2_RESEARCH_METHODOLOGY.md#L419-L470)):**
  - Power estimate reassessment: 69 trades is an **illustrative estimate under simplified i.i.d. assumptions**. In real options trading, serial autocorrelation, overlapping multi-day holdings, session clustering, negative skewness, and fat tails will increase the sample size required for true 80% power.
  - In-Sample determination: The exact sample size $N_{\text{powered}}$ cannot be arbitrarily fixed at 70; it will be parameterized from empirical moments ($\hat{\mu}, \hat{\sigma}^2, \hat{\rho}_k$, skewness, kurtosis) measured during In-Sample Sessions 1–40, and is classified as `UNRESOLVED_PENDING_IN_SAMPLE_MOMENTS`.
  - Primary Inference: Daily portfolio net return $R_d$ serves as the primary unit of analysis (eliminating intra-day position correlation). Trade-level returns apply a **HAC-adjusted t-statistic** (Newey & West, 1987) and **Stationary Block Bootstrap** (Politis & Romano, 1994) with automatic block length selection (Patton, Politis, White, 2009).
  - Exhaustive 8-Tier Outcome Hierarchy: Every outcome maps to exactly one state:
    1. `VALIDATED_POWERED_PASS` ($N \ge N_{\text{powered}}$, PF $\ge 1.50$, Max DD $\le 3.0\%$, Win Rate $\ge 65\%$, $p < 0.05$, CI $> 0$).
    2. `UNDERPOWERED_PRELIMINARY_PASS` ($30 \le N < N_{\text{powered}}$, passing metrics, no risk breach; underpowered, requires extended collection).
    3. `UNDERPOWERED_SUBTHRESHOLD_INCONCLUSIVE` ($30 \le N < N_{\text{powered}}$, mixed/weak metrics, no risk breach; inconclusive).
    4. `INSUFFICIENT_SAMPLE_INCONCLUSIVE` ($N < 30$ trades, no risk breach; inconclusive).
    5. `POWERED_EDGE_UNPROVEN` ($N \ge N_{\text{powered}}$, PF $< 1.50$ or Win Rate $< 65\%$, no risk breach; edge unproven).
    6. `STATISTICALLY_INCONCLUSIVE` ($N \ge N_{\text{powered}}$, high nominal metrics, but $p \ge 0.05$ or CI crosses zero).
    7. `OPERATIONAL_RISK_STOP` (Max Drawdown $> 3.0\%$, daily loss $> 2.0\%$, or 1.0% trade risk breached; immediate halt).
    8. `EMPIRICAL_STRATEGY_REFUTATION` ($N \ge N_{\text{powered}}$, PF $< 1.0$, $p < 0.05$ against positive edge; rejected).

### 2.4 Evaluation Partitions: Chronological Split vs. Sub-Period Analysis
- **Initial Defect:** Previous text called Sessions 31–40 "Out-of-Sample Fold 1", directly contradicting the declaration that Sessions 1–40 are in-sample observations.
- **Correction Implemented ([Section 5.1](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/GATE_2_RESEARCH_METHODOLOGY.md#L360-L384)):**
  - Formally established the primary evaluation as an independent **40/20 Chronological Split**: Sessions 1–40 (In-Sample Observational Baseline) and Sessions 41–60 (Out-of-Sample Evaluation).
  - Clarified that any sub-period analysis across Sessions 41–60 (e.g., 41–50 vs. 51–60) serves strictly to evaluate regime sensitivity without calling previously observed in-sample sessions OOS.

### 2.5 Execution Simulation Assumptions & Institutional Realism
- **Initial Defect:** Fixed 250 ms latency and 1-tick slippage were presented as established characteristics rather than assumptions, and L2 book-walking was presented as if it assured fill certainty.
- **Correction Implemented ([Section 5.2](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/GATE_2_RESEARCH_METHODOLOGY.md#L386-L415)):**
  - Explicitly labeled 250 ms latency and 1-tick slippage as **simulation assumptions**, to be empirically measured during the pilot.
  - Documented L2 book-walking limitations: volume-weighted price at snapshot does not account for queue position, competing cancellations, or latency spikes.
  - Added explicit declaration: **Simulated fills are conservative approximations, NOT guaranteed executions.**

### 2.6 Historical Holdout Reclassification
- **Initial Defect:** The 2025–2026 historical dataset was previously described as a forward-looking holdout relative to prospective 60-session collection.
- **Correction Implemented ([Section 2.4](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/GATE_2_RESEARCH_METHODOLOGY.md#L225-L252)):**
  - Formally reclassified as a **Sealed Historical Benchmark Dataset**, acknowledging that it is older than prospective live collection.
  - Maintained POSIX `0444` isolation in `web/.data/collector/holdout_sealed/`.
  - Enforced single-pass terminal benchmark audit role: evaluated only after prospective 60-session validation is completed.

### 2.7 Reconciled Session Quality Metrics & Pipeline Stages
- **Initial Defect:** The 95% quote-quality threshold mixed event counts and 1-second buckets without a quote freshness rule, and the 99% capture metric was conflated with broker completeness.
- **Correction Implemented ([Section 3.2](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/GATE_2_RESEARCH_METHODOLOGY.md#L280-L325)):**
  - 95% Quote Quality: Defined on **contract-second buckets** (22,500 seconds per contract per session) with an explicit **3.0-second freshness rule** ($\text{Age} = t - t_{\text{quote}} \le 3.0\text{ s}$). Requires $\ge 95.0\%$ valid seconds across the universe and $\ge 90.0\%$ for every individual core ATM strike.
  - 99% Internal Persistence Ratio: Measures local storage persistence relative to frames read at the socket. Renamed to avoid implying that the broker delivered every market event.
  - Pipeline Stages Reconciled: Stage 1 (Normal buffer enqueue), Stage 2 (Diagnostic telemetry shedding under temporary load $\le 1.0\%$), and Stage 3 (Market tick drop under overflow—must be exactly ZERO for valid sessions).
  - Explicit separation between 20% data-quality spread limit and 5% strategy entry spread gate.

### 2.8 Transaction Costs: Arithmetic Reconciliation vs. Broker Confirmation
- **Initial Defect:** Statutory rates and GST base were arithmetically reconciled, but required explicit separation from live account confirmation.
- **Correction Implemented ([Section 2.1](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/GATE_2_RESEARCH_METHODOLOGY.md#L34-L155)):**
  - Distinguished arithmetic reconciliation from live broker billing confirmation.
  - Statutory rates (NSE Circular `NSE/FA/73061`, Finance Acts, CGST Act) documented with published dates.
  - Preserved `accountPlan: "UNKNOWN"` with conservative Plus fallback rate (₹30/order) until actual contract notes from the live account are reconciled.

---

## 3. Automated Test Inventory Reconciliation

All automated test suites remain 100% passing across the workspace with zero regressions:

```
+─────────────────────────────────────────────────────────────────────────────────────────────────────────+
| RECONCILED AUTOMATED TEST INVENTORY (Post-Methodology Correction Audit)                                 |
+--------------------------+-----------------------+-------------+----------+-----------------------------+
| Test Category            | Command               | Suites      | Tests    | Duration / Status           |
+--------------------------+-----------------------+-------------+----------+-----------------------------+
| Unit & Property Suites   | npm test              | 303         | 2,940    | ~150s, 0 fail (Node test)   |
| DOM Component Suites     | npm run test:dom      | 1           | 13       | ~0.9s, 0 fail (tsx + jsdom) |
| Route Integration Suites | npm run test:integr...| 1           | 13       | ~0.2s, 0 fail (tsx + node)  |
+--------------------------+-----------------------+-------------+----------+-----------------------------+
| TOTAL OFFLINE TEST BASE  |                       | 305         | 2,966    | 100% Passing (0 failures)   |
+--------------------------+-----------------------+-------------+----------+-----------------------------+
| Playwright Browser Tests | npx playwright test   | 11          | 317      | Pre-verified                |
+--------------------------+-----------------------+-------------+----------+-----------------------------+
| MASTER AUTOMATED TOTAL   |                       | 316         | 3,283    | 0 Failures across workspace |
+─────────────────────────────────────────────────────────────────────────────────────────────────────────+
```

TypeScript compiler check (`cd web && npx tsc --noEmit`) passes with **Exit Code 0** (zero errors).

---

## 4. Compliance Certification & Negative Declarations

1. **Zero Source Code Changes in this Turn:** Zero application source files in `web/src/` were modified.
2. **Strategy 11.4 Baseline Unchanged:** Formulas, scoring checks, and the 1.0% risk limit remain frozen.
3. **Zero Holdout Access:** The sealed 2025–2026 holdout dataset was not queried, sampled, inspected, or unsealed.
4. **Zero Network / Live API Activity:** No requests were made to Upstox APIs; zero tokens were refreshed; zero WebSockets were connected.
5. **Support Questionnaire Held Offline:** [UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md) was not dispatched; zero external vendors were contacted.
6. **No Daemons or Schedulers Activated:** `com.upstox.paperlive.plist` remains disabled.
7. **Clean Git Index:** `git diff --cached` is 100% empty; zero commits were staged or created.
8. **Protected File Integrity:** All 13/13 SHA-256 digests in `MANIFEST.sha256` remain identical to baseline.
9. **Primary Strategy Validation is NOT Complete:** The strategy remains unvalidated on out-of-sample streaming data. Production readiness remains **HARD NO-GO (11.25%)**.

---

> [!IMPORTANT]
> **MANDATORY STOP:** System execution is paused. All methodology corrections have been integrated and audited. Awaiting explicit owner review and approval before proceeding to the next gate.
