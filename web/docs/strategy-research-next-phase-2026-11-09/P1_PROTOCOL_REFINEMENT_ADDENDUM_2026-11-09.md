# P1 protocol refinement — addendum and change log (2026-11-09)

Written for: the project owner, for an approval decision.
Status: **documentation only. P1 is not executed.** No backtest, statistical test, validation or holdout inspection was run. No data was requested. No Upstox or NSE request was made. No application code, strategy code, dataset, journal, saved pick or token was changed. Strategy 11.4 and `strategy.ts` are unchanged (SHA-256 `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18`).

This addendum **supersedes** sections 3, 4.1, 4.5, 4.6 and 6A of `P1_PROTOCOL_REFINEMENT.md`, where they conflict. All other sections of that document stand. The original hypothesis, the 12-month primary lookback, the 6- and 9-month sensitivity runs, the periods, the calendar rules and the holdout reservation are unchanged.

---

## Change log

| # | Item | Before (P1_PROTOCOL_REFINEMENT.md) | Now | Reason |
|---|---|---|---|---|
| C1 | Return convention | Return from first to last calendar session of the month (first-session close used as entry) | Primary: close of last session of m−1 to close of last session of m. Companion: open-to-open (section 1.2) | The first-session close is not known when the position is taken. The earlier text mixed signal timing and entry price. |
| C2 | Cost rule | Half round-trip charged on entry and half on exit for **every** long month | Cost charged only on position transitions (section 2) | The earlier rule charged a round trip for each month held long, which is inconsistent with a continuously held position. |
| C3 | Period boundaries and costs | Not defined | Each period is self-contained: starts flat, closes out at period end (section 2.3) | Needed for consistent first and final observations. |
| C4 | Null test | iid random long/flat paths with fixed seed (4.5) | Time-shift null is the acceptance test. iid null is diagnostic only (section 3) | Signal persistence makes the iid null too weak for the timing claim. |
| C5 | Block bootstrap | 12-month blocks, reported in full, not defined | Diagnostic confidence interval only, fully defined (section 3.3) | Bootstrap of returns does not test timing; it cannot be an acceptance test. |
| C6 | Concentration | Best 5 long months, best calendar year (4.6) | Unchanged in substance; best-5-long-months is the acceptance test, best-year share is reported only | Clarified. No threshold changed. |
| C7 | Open-to-open companion description | Described as excluding only the initial overnight gap | Described as a different window: excludes P_(m−1)→O_m, includes the terminal gap P_m→O_(m+1); not a clean execution-delay measure (section 1.2) | The earlier wording was inaccurate. Formulas unchanged. |
| C8 | Metric definitions | Sharpe, Sortino, drawdown, profit factor and trade count defined on r_s(m), r_b(m) and "long months" | Bound to N_m and B_m, with trade count defined as entries (section 4A) | Keeps every criterion on the revised, cost-consistent series. |
| C9 | Criterion 6 definition | Defined only in the superseded section 4.6 | Defined in section 4A: set the 5 best long months' N_m to 0, recompute | Prevents an undefined acceptance test. |
| C10 | Open-to-open validation boundary | Companion exit could fall on 2022-01 (holdout) for the final month | Validation companion ends with the October 2021 observation (exit at November 2021 open); primary is unchanged through December 2021; companion close-out at the revised boundary (section 1.2A) | Owner decision (option a). Keeps all companion prices inside the authorised validation period. No 2022+ price used. |
| C11 | SENSEX | Included as robustness series, with an unverified BSE calendar | Excluded from P1. PC-4 cancelled. | Owner decision 1. |
| C12 | Development companion boundary | Not addressed; final month exit would fall in the validation period | Resolved by owner option (i): development companion ends with the November 2014 observation, exiting at the December 2014 open (section 1.2B). Count 166; primary count 167 (first valid observation February 2001; see results closure record). | Keeps every companion return inside its own window. Owner approval recorded in section 8. |
| C13 | Companion window rules | Only validation boundary stated | Consolidated in section 1.2C, covering both companions, close-out, and the signal-lookback clarification | Owner request to make both windows explicit and auditable. |
| C14 | Cost input c_base | Not set (main document section 3) | c_base = 0.10% round-trip, labelled HYPOTHETICAL OWNER-SELECTED INDEX-LEVEL RESEARCH ASSUMPTION — NOT EMPIRICALLY VERIFIED; scenarios 0/1/2/3× = 0.00/0.10/0.20/0.30% (section 2.6) | Owner selection for index-level research only. Not tied to any verified futures, ETF, broker, exchange or statutory cost. |

No criterion in section 4.8 of the main document is removed. Criterion 5 (random-entry null p < 0.05) is re-expressed as the time-shift null in section 3.1. This is a change of **test**, made before any run, and is listed here so the owner can reject it.

---

## 1. Return convention

### 1.1 Primary: close-to-close, theoretical index-level
- Let P_t be the close of the last calendar session of month t.
- Signal S_m = 1 if P_{m−1} / P_{m−13} − 1 > 0, else 0. It uses only closes up to the end of month m−1, so it is known when the month-m position is set.
- Position for month m: x_m = S_m.
- Gross month return: R_m = P_m / P_{m−1} − 1.

**What this measures:** the price change from the signal close to the next month-end close. It assumes that a position could be taken at the signal close P_{m−1}. That is **not an executable price** in the strict sense, because the signal is only known once that close has printed. The primary test is therefore a **theoretical index-level test**, not a tradable return.

**Movements included:** all price change from P_{m−1} to P_m, including the overnight gap after the signal close and the first session's intraday move.
**Movements excluded:** none beyond the calendar and placeholder rules. No price is interpolated.

### 1.2 Companion: open-to-open
- Position set at the open O_m of the first calendar session of month m, using the signal from P_{m−1}.
- Exit at the open O_{m+1} of the first session of m+1.
- Gross month return: R^o_m = O_{m+1} / O_m − 1, with the same transition-cost rule (section 2).

**The companion is a different measurement window, not a primary variant with one gap removed.** Relative to the primary (P_{m−1} → P_m), it:
- **Excludes** the initial close-to-open gap P_{m−1} → O_m and the intraday move from P_{m−1} to O_m.
- **Starts** at the open O_m, not the signal close P_{m−1}. The first-session movement from O_m onward is included.
- **Ends** at the open O_{m+1} of the following month, not at the close P_m. It therefore **includes** the final close-to-open gap P_m → O_{m+1}, which the primary does not include.

Net effect: the companion removes the initial gap and adds the terminal gap, and the window endpoints shift by a full session on each side. A difference between the two conventions therefore reflects both the entry-timing gap and the terminal-gap treatment. It is **not** a clean measure of execution delay, and it must not be described as one. Neither formula is changed, and no convention is selected on the basis of results.

Both conventions are computed from the same clean series. Index open prices were checked for NIFTY in the authorised scope (section 5, PC-3: PASS).

### 1.2A Period boundary of the open-to-open companion (owner decision, approved)
- **Validation companion (2015-01 to 2021-12 period):** the companion return is evaluated only for months m whose exit open O_(m+1) lies on or before the November 2021 open. The December 2021 open is not used, and no 2022+ price is used. The last companion observation is therefore **October 2021** (exit at the November 2021 open).
- **Primary validation is unchanged:** it uses close-to-close through December 2021 (84 monthly observations).
- **Validation companion observation count: 82** (2015-01 to 2021-10). This differs from the primary count and is reported explicitly.
- **Close-out:** the companion's period-end close-out cost c_h is applied at this revised boundary, in the October 2021 observation, if x = 1 in that month. It is not applied in December 2021.
### 1.2B Development companion boundary (owner decision, approved: option (i))
- **Development companion window: January 2000 to November 2014 (labels).** Its last observation is **November 2014**, exiting at the December 2014 open. December 2014 is excluded from the companion only.
- **Signal availability (corrected at execution, owner-confirmed as a data-availability correction):** the 12-month signal for January 2001 needs the December 1999 close, which is unavailable. The first valid observation is therefore **February 2001**. The label "January 2000" in the window does not produce an observation.
- **Development companion observation count: 166** (2001-02 to 2014-11). The primary development count is **167** (2001-02 to 2014-12). Both are reported. Earlier figures of 167 and 168 are superseded.
- **Close-out:** applied at the November 2014 observation, if x = 1 in that month, at the revised boundary.

### 1.2C Rules for companion windows (owner decision)
1. Development companion: 2001-02 to 2014-11 observations (window label January 2000 to November 2014; first valid observation February 2001, owner-confirmed correction).
2. Validation companion: 2015-01 to 2021-10 observations (82 months).
3. Period-end close-out cost applied at each companion's revised boundary.
4. Primary close-to-close periods: development 2001-02 to 2014-12 (167 months); validation 2015-01 to 2021-12 (84 months). The development start is corrected from January to February 2001 (data availability).
5. **No companion return uses a price from the following period.** Each companion's exit open lies inside its own window.
6. **Signals may use prior-period closes.** The 12-month lookback for an observation in January 2015 uses closes from 2014. This is the same lookback the primary uses. It is not a price from a following period, and it is stated here so the rule is not read more strictly than intended. Only the companion return's own prices are limited to the window.

The observation counts and boundaries above are the only ones that apply. Different counts between the primary and the companion are expected and are reported explicitly.

### 1.3 Decision rule for the two conventions
- **Primary decision is made on 1.1 (close-to-close).** Its convention is fixed here.
- **1.2 (open-to-open) is required to be reported in full**, with all acceptance criteria applied to it.
- A claim that the signal is **supported at index level** requires 1.1 to pass. A claim of any executable-proxy result requires 1.2 to pass as well. Neither claim is made by this document.
- If 1.1 passes and 1.2 fails, the result is reported as "index-level theoretical result, not robust to execution delay". It is not reclassified as passing.

---

## 2. Transaction-cost consistency

### 2.1 Positions and transitions
- x_m ∈ {0, 1} is the position for month m (section 1.1).
- x_{m₀} = 0 is the position before the first month of the period. The period starts flat.
- Transition at month m: Δ_m = |x_m − x_{m−1}| ∈ {0, 1}.
- Flat-to-long (entry) and long-to-flat (exit) each cost half of the round-trip cost: c_h = k × c_base / 2, where k ∈ {0, 1, 2, 3} is the cost scenario.

### 2.2 Cost per month
- C_m = c_h × Δ_m.
- A flat-to-long transition costs c_h (entry). A long-to-flat transition costs c_h (exit).
- **Consecutive long months cost nothing beyond the first entry**, because Δ_m = 0.
- **Consecutive flat months cost nothing**, because Δ_m = 0 and x_m = 0.
- A full flat→long→flat cycle costs 2 c_h = k × c_base in total. This is the round trip.

### 2.3 First and final observations in each period
- **First observation:** if x_first = 1, the entry cost c_h is charged in the first month, because the period starts flat.
- **Final observation:** each period closes out. If x_last = 1, a close-out cost c_h is charged in the last month of the period. Each period is therefore self-contained.
- The close-out is a **period accounting convention**, not an assumed trade. It is applied identically to the strategy and to buy-and-hold (section 2.5).
- The period does not carry a position into the next period.
- **Companion close-out:** the open-to-open companion's close-out uses the companion's own last evaluated month (section 1.2A). For validation that is October 2021.

### 2.4 Net monthly return and cumulative return
- Net return: N_m = x_m × R_m − C_m − 1{m = last} × c_h × x_last.
- Net return for buy-and-hold: B_m = R_m − c_h × 1{m = first} − c_h × 1{m = last}.
- Cumulative net return over a period: ∏ (1 + N_m) − 1. Maximum drawdown is computed on the same cumulative series (main document section 4.4).
- Log form for the null test: L = Σ ln(1 + N_m). This is monotone in the cumulative return, so the null ranking is unchanged.
- A transition cost is attributed to the month in which the transition is made (the month whose position changes). This is used for profit factor (section 4.3 of the main document).

### 2.5 Buy-and-hold convention
- Buy-and-hold is long every month. Its only transitions are the start entry and the period close-out (section 2.4). Its cost is therefore 2 c_h per period, not a monthly cost.
- The Sharpe and drawdown comparison (main document 4.2, 4.4) uses B_m for buy-and-hold, so the comparison is cost-consistent.

### 2.6 Cost values and status
- **c_base = 0.10% (10 basis points), round-trip.** Status: **HYPOTHETICAL OWNER-SELECTED INDEX-LEVEL RESEARCH ASSUMPTION — NOT EMPIRICALLY VERIFIED.**
- **Rationale:** a transparent round-number sensitivity anchor, selected by the owner for research purposes. It is not derived from project cost records, from any estimated equity or intraday cost model, or from actual execution data.
- **What this does not represent:** verified NIFTY futures costs, ETF costs, broker charges, exchange charges, or statutory costs (STT, stamp, GST, SEBI fee, CDSL). It is not a claim about tradability.
- **Scenarios (round-trip):** 0× = 0.00%; 1× = 0.10%; 2× = 0.20%; 3× = 0.30%. Per-transition charge c_h = k × c_base / 2, so the per-transition charge at 1× is 0.05%.
- **Transition rule (unchanged, section 2.2):** cost is charged only on position transitions. Consecutive long months carry no repeated round-trip cost. Consecutive flat months carry no cost. Each period's entry and close-out treatment is unchanged (sections 2.3 and 1.2C).
- **Visibility:** the zero-cost result (0×) is reported in full alongside every scenario. Nothing is shown at 1× alone.
- **Acceptance criteria are not changed to suit this value.** Criterion 1 is evaluated at 1×, criterion 7 at 2×. The 0× and 3× results are reported in full.
- Where the main document's section 3 says c_base is unset, this section supersedes it.
- No futures, ETF, delivery, or statutory cost schedule is applied. A single index-level cost cannot represent futures roll, margin, financing, tracking error, or an ETF's expense ratio and spread. Results are **index-level only**, at every cost scenario.

---

## 3. Random-entry null and serial dependence

### 3.1 Why the iid null is not the acceptance test
- The 12-month signal is persistent. A run of long months is produced by a run of positive trailing returns, so the position series is strongly autocorrelated.
- Monthly returns are also serially dependent in trending periods.
- An iid null that places the same number of long months at random positions **destroys the run structure of the strategy's own positions**. Its null distribution is therefore not comparable to the strategy's, and it is too lenient in trending periods. It cannot separate timing from exposure clustering.
- **Decision:** the iid null is retained as a **diagnostic only** and is not an acceptance requirement.

### 3.2 Acceptance test: time-shift null (circular shift of the signal)
- Let n be the number of months in the period.
- For each shift j ∈ {1, …, n−1}, define the shifted position x^{(j)}_m = x_{((m + j − 1) mod n) + 1}. This keeps the strategy's run structure and serial dependence but breaks its alignment with the returns.
- Recompute N^{(j)}_m with the same cost convention (section 2) and the same return series R_m. Compute L^{(j)} = Σ ln(1 + N^{(j)}_m).
- Observed statistic: L^{obs} for the strategy with the true alignment.
- **p-value:** p = (1 + #{j : L^{(j)} ≥ L^{obs}}) / n. The "+1" avoids a zero p-value.
- **Replications:** all n−1 shifts, enumerated. No random seed is used, so the result is deterministic.
- **Acceptance:** p < 0.05 in **each** period. With n ≈ 168 (development) and n ≈ 84 (validation), p < 0.05 means no more than about 8 of the development shifts and about 4 of the validation shifts reach at least the observed log return.
- **Limitation (stated):** circular shifts wrap across the period boundary, and the n−1 shifts are not independent observations. p is a comparison of alignment, not a probability over a model of returns.

### 3.3 Diagnostic only: moving block bootstrap of the paired difference
- Paired difference: D_m = N_m − B_m (strategy net minus buy-and-hold net, same month, same cost scenario).
- Method: moving block bootstrap. Block length 12 months. Blocks are all overlapping starts 1, …, n−11. Draw ⌈n/12⌉ blocks with replacement, concatenate, and truncate to n.
- Replications: B = 10,000.
- Seed: 20261108, set once before the first replication.
- Statistic: mean of D_m over the resampled series.
- **Report:** the 95% percentile interval of the bootstrap means, and the share of replications with mean ≤ 0. Reported in full.
- **Status: diagnostic only.** It measures uncertainty about the average difference, not whether timing adds anything. It does not replace the time-shift null.

### 3.4 Acceptance status of each test
| Test | Status |
|---|---|
| Time-shift null, p < 0.05 in each period (section 3.2) | **Acceptance** (criterion 5) |
| Moving block bootstrap (section 3.3) | **Diagnostic**. Not an acceptance criterion. |
| iid random-entry null (main document 4.5) | **Diagnostic**. Not an acceptance criterion. |

### 3.5 Limits of statistical certainty
- Each period has few independent regimes (about 14 years in development and 7 in validation). Monthly observations within a regime are not independent.
- The time-shift null and the bootstrap interval are therefore **approximate**. A pass on either does not establish a true p-value over a population of index histories.
- These limits are reported with every result. They are not a reason to add more tests after seeing results.

---

## 4. Consequences for section 4.8 of the main document

- Criterion 5 now reads: time-shift null p < 0.05 in each period (section 3.2).
- Criteria 1–4, 6 and 7 are retained, with the metric bindings in section 4A.
- The rejection rule is unchanged: failure of any criterion in either period rejects the primary hypothesis for this index. There is no partial pass.
- Criterion 1.2 (open-to-open companion) must pass all criteria for any executable-proxy claim (section 1.3).

## 4A. Metric bindings (supersede the return definitions in the main document)

The main document's sections 4.1–4.4 defined returns as r_s(m) and r_b(m), gross of cost. Those definitions are **superseded and must not be used for any acceptance criterion**. Every surviving metric is bound as follows.

- **Strategy series:** N_m (section 2.4). This is the only strategy series used in any metric.
- **Buy-and-hold series:** B_m (section 2.4), which includes the period-start entry and period-end close-out cost.
- **Risk-free rate:** the same value for both series. The confirmed assumption is zero (owner decision 5). Excess return is N_m − rf_m (or B_m − rf_m) with rf_m = 0 under that assumption.
- **Sharpe (criterion 2):** mean(N_m − rf_m) ÷ standard deviation(N_m − rf_m) × √12 over the period. Buy-and-hold Sharpe uses the identical formula on B_m. Both include the entry and close-out costs. No gross series is used.
- **Sortino:** the same construction, with downside deviation of N_m (and of B_m) in the denominator. Reported only; not an acceptance test.
- **Maximum drawdown (criterion 4):** computed on the cumulative product ∏(1 + N_m) for the strategy and ∏(1 + B_m) for buy-and-hold, per period.
- **Net return (criteria 1 and 7):** ∏(1 + N_m) − 1 at c_base and at 2 × c_base respectively, using the transition cost in section 2.2.
- **Profit factor (criterion 3):** sum of positive N_m over months with x_m = 1, divided by the absolute sum of negative N_m over the same months. Flat months (x_m = 0) are excluded. A transition cost is part of the N_m of the month in which it occurs.
- **Trade count:** number of entries, i.e. months with Δ_m = 1 and x_m = 1. This replaces "number of long months" as the trade count. The "at least 20 long months" floor in criterion 3 is kept, and the number of long months is still reported.
- **Concentration (criterion 6):** this is a definition added here, because section 4.6 of the main document is superseded. Identify the 5 months with x_m = 1 and the largest N_m. Set N_m to 0 for those 5 months and leave every other N_m unchanged, including its cost. Recompute ∏(1 + N_m) − 1 over the period. Criterion 6 passes if the result is greater than 0 at c_base. The share of net return from the best calendar year is reported only.
- **Null (criterion 5):** section 3.2, using L = Σ ln(1 + N_m) with the same cost convention. No gross series is used.

No surviving criterion refers to the superseded r_s(m), r_b(m), the first-to-last-session return, or the iid random-entry null.

---

## 5. Pre-run integrity checks (results)

These are read-only integrity checks on existing records, in the authorised development and validation scope (2000-01-01 to 2021-12-31). They do not test any hypothesis. Owner approval covers NIFTY only.

- **PC-1 (duplicate dates, NIFTY): PASS.** 5,474 bars in scope, 5,474 unique dates, 0 duplicates, 0 out-of-order rows.
- **PC-2 (flat-bar runs of 5 or more, NIFTY): PASS.** 0 flat bars in scope, 0 runs.
- **PC-3 (open availability and OHLC consistency, NIFTY): PASS.** 0 missing or non-positive values; 0 OHLC violations. Volume is 0 on all in-scope bars.
- **Scope note:** the script parsed the stored file, which also contains 2022+ rows. Those rows were used only to exclude them by date. No 2022+ price was read, tabulated or used.
- **PC-4 (SENSEX calendar): CANCELLED.** SENSEX is excluded from P1 by owner decision (section 8).

---

## 6. Status

**READY FOR OWNER APPROVAL**

Reasons:
- The return convention is fixed and its limits are stated (section 1).
- Costs are defined on transitions, with consistent first and final observations (section 2).
- The acceptance test is defined in a way that accounts for serial dependence, and the remaining bootstrap is labelled as diagnostic (section 3).
- The remaining uncertainty is stated as a limit, not treated as resolved.

This is **not** a finding of profitability. The result of any P1 run would be an **index-level theoretical finding**, not a tradable strategy result.

---

## 7. Owner decisions (listed separately)

1. **Set c_base** (the round-trip index-level cost value) and its source. Until set, P1 cannot run. The value must be labelled as an assumption unless verified.
2. **Confirm the primary convention** (section 1.1, close-to-close, theoretical) and the requirement to report the open-to-open companion (section 1.2).
3. **Confirm the time-shift null as the acceptance test** and the moving block bootstrap as diagnostic only (section 3.4). Reject either if you prefer a different statistically defensible rule.
4. **SENSEX:** accept the BSE-equals-NSE calendar assumption as a robustness-only series, or exclude SENSEX. NIFTY alone does not block P1.
5. **Risk-free rate for Sharpe:** confirm zero, or specify a source.
6. **Authorise the pre-run integrity checks PC-1 to PC-3** (stored records only), as a separate step, before any P1 execution.
7. **Approve or reject the change log** (section C1 to C6), particularly C4, which replaces the iid null as the acceptance test.

Nothing in this list is decided by this document.

---

---

## 8. Owner decisions: recorded and remaining

**Recorded (owner approval, this session):**
1. **Universe:** NIFTY only. SENSEX excluded from P1 (C11).
2. **Return conventions:** close-to-close is the primary theoretical index-level test; the open-to-open companion is required and reported (section 1.3).
3. **Statistical methodology:** time-shift null is the acceptance test (criterion 5); moving block bootstrap is diagnostic only; iid random-entry test is diagnostic only.
4. **Risk-free rate:** zero, as an explicit assumption (section 4A).
5. **Change log:** C1–C9 approved, subject to the documented limitations. C10 and C11 added under the owner's approval for option (a) and the NIFTY-only scope.
6. **Strategy boundaries:** Strategy 11.4 remains frozen. No live trading or automated execution.
7. **Integrity checks PC-1, PC-2 and PC-3:** PASS, NIFTY, authorised scope only (section 5).
8. **Validation companion boundary, option (a):** December 2021 excluded from the companion only; companion ends with October 2021 (section 1.2A).
9. **Development companion boundary, option (i):** companion window January 2000 to November 2014 labels, first valid observation February 2001, last observation November 2014 exiting at the December 2014 open; count 166 (section 1.2B).
10. **Companion window rules** as set out in section 1.2C.
11. **Option 1 confirmed:** P1 remains a theoretical NIFTY index-level study only. No futures or ETF implementation claims.
12. **Cost input c_base:** 0.10% round-trip, labelled HYPOTHETICAL OWNER-SELECTED INDEX-LEVEL RESEARCH ASSUMPTION — NOT EMPIRICALLY VERIFIED. Scenarios 0×, 1×, 2×, 3× = 0.00%, 0.10%, 0.20%, 0.30% (section 2.6).

**Remaining, requiring owner decision before P1 execution:**
- **A. `c_base`: RESOLVED** as a labelled hypothetical owner selection, 0.10% round-trip (section 8, item 12). It is not verified and does not represent futures, ETF, broker, exchange or statutory costs.
- **B. Development companion boundary (C12): RESOLVED** by owner option (i), recorded in section 8, item 9.
- **C. Separate P1 execution approval.** Required after A is settled. Nothing in this document authorises execution.

**Status:** P1 is not executed. The protocol is methodologically complete: windows, integrity checks PC-1 to PC-3 (PASS, NIFTY), cost input and acceptance rules are all fixed. **Execution now requires only your separate explicit approval.** No P1 run has been authorised. The live recommendation engine remains **NO-GO**.

**Live recommendation engine: NO-GO.** Nothing here establishes profitability or validation.
