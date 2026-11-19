# Phase 0 — Historical validation plan (2026-11-11)

Status: PLAN ONLY. No data accessed, no backtest run, no holdout opened.

## Preconditions (all must be met before any evidence is claimed)
1. **Holdout status known.** The repository records a sealed 2022-onward holdout, and P1 was rejected. Owner must confirm whether that holdout was ever used. If it was, it is not evidence and a new holdout must be defined.
2. **Clean dataset.** The historical index series have flat placeholder bars, duplicate days and unverified calendars (`docs/INDEX_SERIES_FEASIBILITY_2026-11-08.md`; finding D-11). Resolve or exclude them first.
3. **Point-in-time constituents.** Breadth needs historical constituent membership (D-07). Without it, breadth cannot be tested historically.
4. **Point-in-time option data.** Historical option chains, strikes, expiries and trade times. The current chain has no generation timestamp (D-04). Without it, option-chain signals cannot be tested historically.
5. **News point-in-time.** Historical news with publication time. Without it, the news check cannot be tested historically.

## Datasets
- **Development:** a chronological period, fixed before study. Used to debug and understand.
- **Validation:** a later period, used to test candidate rules without tuning them against the results.
- **Holdout:** the final period, untouched until the rules and parameters are frozen. Opened once.
- Split by time, not by random candles. Overlapping trades need a purge gap so a trade that spans the boundary cannot leak into the holdout.

## Required measurements (net of costs and slippage)
Win rate; average win; average loss; expectancy per trade with a confidence interval; profit factor; maximum drawdown; consecutive losses; cost sensitivity; signal frequency. Results split by regime (trending up, trending down, sideways, high and low volatility), expiry sessions, event sessions and gap sessions.

## Acceptance (to be fixed by the owner before the holdout is opened)
Numbers in the external plan (profit factor above 1.2, drawdown budget, minimum trade count) are proposals. They must be approved and frozen first. The result is reported whether it passes or not.

## Rules
- No change to weights, the 65 threshold or the stop formulas to improve results. A change means a new version and a fresh holdout.
- Stocks and index options are tested separately (S-09). A pass for one does not approve the other.

## Status of each precondition
| Precondition | Status |
|---|---|
| Holdout status | BLOCKED: owner confirmation needed |
| Clean dataset | BLOCKED: D-11 unresolved |
| Point-in-time constituents | FAIL: static list (D-07) |
| Point-in-time option data | BLOCKED: no timestamp from chain endpoint (D-04) |
| Point-in-time news | NOT TESTED |
