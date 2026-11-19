# P1 protocol refinement — index time-series momentum (2026-11-09)

Written for: the project owner, for an approval decision.
Status: **refinement of P1 only. P1 is not executed.** No backtest or validation was run, no holdout was opened, no data was requested, and no Upstox or NSE request was made. Existing project records were read to resolve the calendar question (section 2). No application code, strategy code, dataset, journal, saved-pick or token was changed.

> **Superseded in part.** Sections 3, 4.1, 4.5, 4.6 and 6A are superseded by `P1_PROTOCOL_REFINEMENT_ADDENDUM_2026-11-09.md` (return convention, transition-based costs, time-shift null as acceptance test, change log C1–C6). The verdict in section 8 is replaced by the addendum's status.

Strategy 11.4 and `strategy.ts` remain frozen (SHA-256 `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18`, checked in this phase).

**Conclusion: READY FOR OWNER APPROVAL** — conditional on the owner fixing one input (the base cost value, section 3) and accepting the scope limits in sections 1 and 2. Nothing here is a finding of profitability.

---

## 1. Index-level signal versus tradable implementations

P1 tests one thing: whether the sign of the trailing 12-month index return, applied to the index level, predicted the following month's index return. It is an **index-level signal test**. It is not an executable or tradable strategy.

| Layer | What it means | Status in P1 |
|---|---|---|
| Theoretical index-level signal performance | Monthly index returns, long when the trailing signal is positive, flat otherwise. Zero-cost. | **Tested (when executed).** This is the only layer P1 evaluates. |
| Hypothetical futures implementation | Would require monthly futures series, roll rules, margin, and futures costs. | **Not tested. Not described as performance.** No futures series is held before 2024-06 (bhavcopy), and no futures cost is verified. |
| Hypothetical ETF implementation | Would require a tradable ETF history, tracking difference, expense ratio and bid/ask. | **Not tested. Not described as performance.** No ETF series is held in the project records, and no ETF cost is verified. |

Rules for reporting:
- Every output of P1 is labelled "index-level signal, not tradable".
- No futures or ETF cost is assumed or shown. Where a tradable cost would apply, it is marked **UNVERIFIED — NOT MEASURED**.
- P1 does not claim that an index-level result implies any executable return.

## 2. Calendar and data integrity

### 2.1 What the project records show (read only)
- The verified calendar (`upstox-daily-universe-verified-2026-11-08/calendar.json`) has 6,629 sessions from 2000-01-03 to 2026-11-05. Its derivation rule is not restated in the records reviewed for this refinement, so it is treated as given.
- **NIFTY** clean series: 6,675 bars. 6,629 fall on calendar sessions; **46 do not**.
- **SENSEX** clean series: 6,675 bars. The same 46 dates are non-calendar. Every calendar session has a SENSEX bar (missing-session count 0).
- **BANKNIFTY, FINNIFTY, BANKEX**: outside P1 (section 2.6).
- The 46 non-calendar NIFTY dates: 18 Saturdays, 3 Sundays, and 25 weekdays; the earliest are 2003-03-22, 2003-10-25, 2003-11-15, 2004-04-17, and a run from 2004-05-24 to 2004-06-07.
- **Equity cross-check (the 50 stored NSE equity series examined):** on each of the 46 dates, at most 3 of the 50 series have a bar. No date has 50. Listed equities did not trade on these dates in any broad sense, so the index bars there are not corroborated as sessions.
- The stored records contain **no BSE calendar or BSE holiday list**. The statement "SENSEX follows the NSE calendar" is an assumption, not a verified fact.

### 2.2 Inclusion and exclusion rules (fixed now)
1. **Session set for P1 = verified NSE-equity calendar sessions** (6,629 from 2000-01-03 to 2026-11-05), intersected with the series' own bars.
2. **Exclude** every index bar whose date is not in the calendar, for both NIFTY and SENSEX. This removes 46 bars per series. It is not a choice made after seeing results.
3. **No bar is interpolated or filled.** A missing calendar session is a blocker and stops the run (section 2.5).
4. Month-end definition: the last calendar session of each calendar month, using the bar on that date.

### 2.3 Duplicate sessions
- The index feasibility records report duplicate sessions in 2015 only for BANKNIFTY, FINNIFTY and BANKEX (not used in P1). **Duplicate-date status for NIFTY and SENSEX was not re-verified in this refinement.** A duplicate-date check on both series is a required pre-run step; any duplicate found stops the run for review.

### 2.4 Placeholder periods
- The index feasibility records report no flat-bar problem for NIFTY and SENSEX from 2000 and zero index volume throughout (so volume cannot be used). **This was not re-verified bar by bar in this refinement**; a flat-bar check is a required pre-run step.
- P1 still requires an explicit guard: any month with a flat-bar run of 5 or more sessions is reported and flagged; if any such month occurs in the development or validation period, the run stops for review rather than excluding it silently.

### 2.5 Stop condition
P1 stops before any run if: (a) any calendar session is missing a bar for the primary series (NIFTY); (b) any non-calendar bar cannot be excluded by the rule in 2.2; or (c) the owner does not accept the BSE calendar assumption for SENSEX (section 2.7).

### 2.6 BANKEX and other indices
**BANKEX is not included in P1.** Reasons from project records: its coverage starts in 2002, with a flat placeholder year in 2002 and part of 2003, and it has a duplicate session in 2015. Its BSE calendar is also unverified. Adding it would widen the search without a justification that survives these checks. BANKNIFTY and FINNIFTY are not in P1 for the same kind of reason (flat years, 2015 duplicates).

### 2.7 SENSEX — status
SENSEX is included **only as a secondary robustness series**, with the explicit assumption that BSE sessions equal the NSE calendar. That assumption is **UNVERIFIED**. If the owner does not accept it, P1 runs on NIFTY alone; this does not block P1.

## 3. Transaction-cost methodology

No cost value in this section is verified. All values are assumptions to be fixed by the owner before approval.

- **Zero-cost benchmark:** gross monthly index returns, no costs. Reported first and always.
- **Base cost (c_base):** a single per-month-change cost, applied at each change of position (entry and exit each cost half of a round trip). **c_base is not set by this document.** The owner must set it, and the source must be stated. Until then it is **UNVERIFIED — NOT SET**. The protocol cannot be executed without it.
- **Scenarios:** 0 × c_base (benchmark), 1 × c_base, 2 × c_base, 3 × c_base. Sensitivity is reported at every scenario, not only the base.
- **Entry and exit treatment:** a long month pays half the round-trip cost on entry and half on exit; a month that stays flat pays nothing; a switch from long to flat pays exit cost only. Entry is at the first session of the month, exit at month end.
- **Delivery-like or futures-like costs:** not applied. Index levels are not held as positions in any real instrument. Applying an equity delivery schedule or a futures schedule to an index level would be an invented mapping and is **not done**.
- **Limitations:** a single index-level cost cannot represent futures roll, margin, financing, tracking error, or an ETF's expense ratio and spread. Results at any cost scenario are index-level only.

## 4. Statistical acceptance criteria (pre-registered; not to be changed after results)

### 4.1 Definitions
- **Monthly strategy return** r_s(m): for month m, the index return from the first to the last calendar session of m if the signal was long at the start of m; 0 otherwise (flat). Net return = r_s(m) minus the cost for the scenario.
- **Signal at month m:** sign of the trailing 12-month return, computed from month-end closes up to the end of month m−1 only. Entry at the start of month m. No look-ahead.
- **Buy-and-hold benchmark** r_b(m): the index return for the same month, every month.
- **Observation count:** the number of monthly observations in the period. **Trade count:** the number of long months (entries). Both are reported.

### 4.2 Risk-adjusted comparison
- **Sharpe ratio (annualised):** mean of monthly (r_s − risk-free) divided by the standard deviation of the same series, times √12. **Risk-free rate is not set by the project records; this protocol uses zero and reports that choice as an assumption.** The same definition is used for buy-and-hold.
- **Sortino ratio:** as above, with downside deviation (monthly returns below zero) in the denominator. Reported, not used as an acceptance test.
- **Comparison:** strategy Sharpe versus buy-and-hold Sharpe for each period.

### 4.3 Profit factor, with flat months
- Profit factor = (sum of positive net monthly returns of **long** months) ÷ (absolute sum of negative net monthly returns of **long** months).
- **Flat months are excluded** from both sums and from the trade count. They are reported separately as a count.
- If there are no negative long months, profit factor is reported as "undefined (no losses)" and does not pass the criterion automatically; the criterion requires at least 20 long months in the period.

### 4.4 Maximum drawdown
- Computed on the cumulative product of (1 + net monthly return) for the strategy and for buy-and-hold, over each period separately. Expressed as the largest peak-to-trough decline, positive number.

### 4.5 Random-entry null
- For each period: generate **10,000** random long/flat monthly paths with the **same number of long months** as the strategy in that period, placed uniformly at random. The seed is fixed in advance at **20261108** (chosen for this protocol; no project convention is claimed). Compute each path's net-return sum at the base cost.
- The null p-value is the share of random paths with a net-return sum at least as large as the strategy's. Acceptance requires p < 0.05 in each period.
- Because monthly returns are serially dependent, the null also reports a block-bootstrap comparison with 12-month blocks, as a robustness check. Both are reported; the iid null is the acceptance test, and the block result is reported in full.

### 4.6 Concentration analysis
- Remove the **5 best long months** from the period and recompute net return. Acceptance requires net return to remain positive at base cost.
- Report the share of net return contributed by the single best calendar year.

### 4.7 What "positive in both development and validation" means
- It means **every** acceptance criterion in section 4.8 passes **separately** in the development period (2000–2014) and separately in the validation period (2015–2021). It does not mean averaging the two periods, and it does not mean one period passing while the other is merely "not negative".
- The holdout (2022 onward) is not used for any criterion.

### 4.8 Acceptance and rejection criteria (fixed now)
Applied separately to development and to validation, at the base cost unless stated:
1. Net return > 0.
2. Strategy Sharpe ≥ buy-and-hold Sharpe.
3. Profit factor ≥ 1.2 (defined per 4.3, with at least 20 long months).
4. Maximum drawdown ≤ 1.5 × buy-and-hold maximum drawdown.
5. Random-entry null p < 0.05.
6. Net return > 0 after removing the 5 best long months.
7. At 2 × c_base, net return > 0.
Failure of any criterion in either period is a rejection of the primary hypothesis for this index. There is no partial pass.

## 5. Parameter sensitivity and multiple comparisons

- **Primary (registered) hypothesis: 12-month lookback.** It is the only lookback whose result can pass acceptance.
- **6-month and 9-month lookbacks:** reported **as sensitivity only**, in the same format, separately. They do not change the primary decision and cannot be substituted for it after results are seen.
- **Multiple comparisons:** three lookbacks are reported, and the primary decision is made on the one fixed in advance. Reporting the others does not make them acceptance tests. Any claim based on a lookback other than 12 months would need its own pre-registration and a correction for the number of comparisons.
- No other parameter is tuned: no threshold, no band, no stop, no alternative signal, no index added after seeing results.

## 6. Protocol boundaries

- Development 2000–2014; validation 2015–2021; holdout 2022 onward reserved and not opened (unchanged from the existing P1).
- No holdout data is accessed. No backtest or validation is run by this document.
- No application code, strategy, dataset, journal, saved pick or token is modified.
- No Upstox or NSE request is made. The calendar checks above used stored records only.

## 6A. Deliberate deviations from the earlier P1 text

These are changes made in this refinement, before any run. They are listed so the owner can reject any of them.

- **Return timing:** the earlier P1 text specified entry at the next month's first open and exit at month end. This refinement uses month-to-month returns from the first to the last calendar session of the month, using closes. The earlier open-based entry is not used because index open prices are not a tradable reference.
- **Concentration:** the earlier text removed the best 5 *years*. This refinement removes the best 5 *long months* (section 4.6) and also reports the best single year.
- **Profit factor:** defined on long months only, with flat months excluded (section 4.3). The earlier text did not define it.
- **Added:** random-entry null with a fixed seed, Sharpe and Sortino comparison, and the flat-run and duplicate guards.
- **Not changed:** the 12-month primary lookback, 6- and 9-month sensitivity, periods, and holdout reservation.

## 7. Blockers and open items

| Item | Status | Owner action needed |
|---|---|---|
| Calendar integrity for NIFTY | **Resolved from project records** (46 non-calendar bars excluded; equity cross-check supports exclusion) | None |
| Calendar integrity for SENSEX (BSE sessions) | **Unverified** assumption (same as NSE calendar) | Accept as robustness-only, or exclude SENSEX |
| Base cost c_base | **Not set** | Set the value and its source; it must be labelled as an assumption unless verified |
| Futures/ETF tradability | **Not tested; costs unverified** | Decide whether a separate tradability protocol is wanted (not part of P1) |
| Risk-free rate for Sharpe | **Assumed zero** | Confirm or specify a source |
| Flat-run guard | Defined; no flat runs known in NIFTY/SENSEX | None |

## 8. Decision

**READY FOR OWNER APPROVAL.**

Methodology is complete and pre-registered. The calendar question for NIFTY is resolved from project records. Two owner inputs are required before any execution: the base cost value c_base with its source, and the decision on SENSEX (robustness-only or excluded). The result would be an **index-level signal finding**, not a tradable strategy result. Approval would authorise execution of P1 in a separate step, and it does not authorise any holdout access.

**Live recommendation engine: NO-GO.** Nothing here establishes profitability or validation.
