# Proposed validation protocols (2026-11-09)

Written for: the project owner and research team.
Status: **proposals only. Not registered. Not executed. No backtest was run, no validation was run, and no holdout was opened.** Each protocol needs separate approval before any step is taken. The approval will also decide whether the required data is sourced.

## Protocol P1 — Index time-series momentum (NIFTY and SENSEX), the only testable-now candidate

### 1. Hypothesis
A daily time-series momentum rule on the index level (sign of the trailing 12-month return, with a 1-month holding period) earns a positive net return relative to buy-and-hold after a stated cost model, over the development period, and its sign is stable in the validation period.

### 2. Universe
- NIFTY 50 (NSE_INDEX|Nifty 50) and SENSEX (BSE_INDEX|SENSEX) only. No other index is included in this protocol.
- Index levels only. Tradability via futures or ETF is **not** tested here; it would need a separate protocol with its own costs.

### 3. Data
- Daily index series from `upstox-clean-2026-11-06-v1` for NIFTY (usable from 2000-01-03) and SENSEX (usable from 2000-01-03).
- **Before any use:** resolve the SENSEX and BANKEX BSE session calendar, and confirm that the ~46 non-calendar dates per series are real sessions or excluded. These are data prerequisites, not analysis.
- Exclusions: none needed for NIFTY or SENSEX placeholder bars (none found in the check), subject to the calendar check.

### 4. Signal and entry/exit rules (fixed before any run)
- Signal at each month end: sign of the trailing 12-month close-to-close return (index level).
- Long when positive, flat when not. No short side in this protocol.
- Entry at the first session's open of the following month (no look-ahead: signal uses only closes up to the signal date).
- Exit at the next month end.
- No parameter tuning. Lookback and holding period are fixed by this document.

### 5. Look-ahead and survivorship protections
- Signal computed only from data available at the signal date.
- Index membership is not an input (single index), so membership survivorship does not arise; index-level survivorship is not controlled and must be stated as a limitation.

### 6. Transaction-cost model (assumption, unverified)
- Two cost scenarios, both marked as assumptions: a delivery-like cost of the project's estimated model per round trip, and a futures-like cost placeholder. Neither is verified. Sensitivity from 0 to 3 times the base cost is required.

### 7. Periods
- Development: 2000-01-03 to 2014-12-31 (parameters fixed here; no tuning).
- Validation: 2015-01-01 to 2021-12-31 (one run, pre-declared).
- Holdout: 2022-01-01 onward is **reserved and not opened**. It is used only after separate approval.

### 8. Minimum sample
- At least 150 monthly decisions across the development and validation periods combined. With a 12-month lookback the first decision is in 2001, so the development period supplies about 170 decisions; this is a required minimum, not a target.

### 9. Acceptance criteria (pre-declared)
- Net return after the base cost model is positive and exceeds buy-and-hold on a risk-adjusted basis in both development and validation.
- Positive sign persists in both sub-periods.
- Profit factor at least 1.2 at base costs and not negative at 2 times base costs.
- Maximum drawdown no worse than 1.5 times buy-and-hold.

### 10. Rejection criteria (pre-declared)
- Any criterion above fails in either period.
- Net return is positive only at zero cost.
- Result depends on a single calendar year or single episode (concentration test: removing the best 5 years must not turn the result negative).

### 11. Robustness tests
- Lookback sensitivity: 6, 9, 12 months (reported, not chosen after the fact).
- Cost sensitivity: 0 to 3 times base.
- Calendar-year breakdown and drawdown episodes.
- Random-entry null: matched random monthly long/flat paths with the same exposure, to test whether timing adds anything.
- Placeholder-period check: confirm no returns are computed across excluded flat years.

### 12. Stop conditions
- Calendar check fails (BSE sessions unresolved): stop before any run.
- Any use of holdout data: stop and report.

---

## Protocol P2 — Cross-sectional momentum (design only; DATA BLOCKED)

This is listed for completeness. It **cannot be run faithfully** until point-in-time NSE index membership and delisting histories are sourced under a separate approval. Its design, so that it is ready if that data is approved:

- Universe: point-in-time NIFTY 200 membership as of each rebalance date, including names later delisted.
- Signal: 6- and 12-month price momentum, volatility-adjusted (following the NSE Nifty200 Momentum 30 construction, to be read in full before use).
- Portfolio: decile sort, equal weight, non-overlapping monthly or semi-annual rebalance.
- Costs: as P1, plus turnover-based costs per rebalance, with stated assumptions.
- Periods: development and validation as in P1; holdout reserved.
- Protections: survivorship (delisted names included), look-ahead (membership as of the decision date), concentration (top-N name share reported).
- Acceptance and rejection: as P1, with a required cost-sensitivity pass and an explicit test that the result is not produced by losers that are absent from the current list.

Do not run this protocol until the membership data is approved and verified.

---

## Protocols not drafted
- Index debit spreads, calendar spreads, covered calls, collars, stock options: **not drafted**. The data required (historical option chains with bid/ask before 2024-06, lot-size history, verified cost schedules) is absent, so a protocol would be a plan without a feasible test. The data gap is the first item.
- Intraday reversal and undefined-risk option selling: **not drafted** (rejected).

## Holdout protection statement
No protocol in this document opens, reads or refers to holdout data. The 2022-onward window in P1 is reserved and is not used in any development or validation step.
