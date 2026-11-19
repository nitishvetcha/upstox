# Research roadmap (2026-11-10)

No new experiment is authorised by this document. No backtest, validation or holdout access is planned here.

## Current research status
- **P1 (NIFTY index-level time-series momentum): REJECTED.** Primary hypothesis failed the pre-registered criteria in both periods. Lookback sensitivity (6, 9 months) also failed. Recorded in `strategy-research-next-phase-2026-11-09/P1_RESULTS_2026-11-09.md`.
- **Strategy 11.4: FROZEN.**
- **2022+ holdout: SEALED.**
- **Recommendation engine: NO-GO.**

## Candidate directions (from earlier reports, not started)
Each requires separate approval and a pre-registered protocol. Earlier reports rank them by data feasibility.
1. Cross-sectional momentum: blocked by missing point-in-time index membership and delisting data.
2. Covered calls and option strategies: blocked by missing historical option prices with bid and ask before 2024-06.
3. Index debit spreads and calendars: blocked by the same option-data gap.

## Data requirements before any new protocol
Point-in-time constituents; delisting history; verified corporate actions; historical option chains with bid and ask; verified cost schedules; a verified BSE calendar. None is requested by this document.

## Not in scope
Re-testing rejected hypotheses under new names; tuning rules to pass; commercial backtests as evidence.
