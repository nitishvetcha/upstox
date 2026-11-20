# Stock V2 — Development Results

Status: **NO-GO for the candidate set.** No candidate passed the pre-registered selection rule. Validation was not run.

Source: `.research-data/stock-v2/development.json` (generated after the sizing fix; the earlier run is archived as `development-superseded-sizing-defect.json` and is not evidence).

Data: 40 development sessions, 2026-08-06 to 2026-10-05, 50 stocks, CORE gate mode. CORE evaluates no market gates. Those gates are not in the dataset: market state, event risk, India VIX, NIFTY ATR and verified-stock count. The results therefore describe the Core Research variant only, not the Full specification.

Historical research result. Not live. Not a forecast.

## 1. Selection rule (pre-registered, applied once)

Choose the candidate with the higher BASE-scenario net expectancy in R, among candidates with at least 100 development trades and positive CONSERVATIVE-scenario expectancy. If none qualifies, no candidate is selected.

Outcome: both candidates fail the conservative test, so none is selected.

- TREND_RECLAIM: conservative expectancy −0.3927 R, not positive.
- PULLBACK_RECLAIM: conservative expectancy −0.4035 R, not positive.

## 2. Results by candidate and cost scenario

| Candidate | Scenario | Trades | LONG / SHORT | Win rate | Profit factor | Expectancy (R) | Net P&L (₹) | Charges (₹) | Max drawdown (₹) | Max consec. losses |
|---|---|---|---|---|---|---|---|---|---|---|
| TREND_RECLAIM | BASE | 1,853 | 1,014 / 839 | 36.4% | 0.609 | −0.235 | −2,707,026 | 714,751 | 2,754,647 | 16 |
| TREND_RECLAIM | CONSERVATIVE | 1,786 | 1,041 / 745 | 30.4% | 0.405 | −0.393 | −4,668,058 | 1,027,319 | 4,685,442 | 19 |
| TREND_RECLAIM | ADVERSE_SLIPPAGE | 986 | 573 / 413 | 24.5% | 0.225 | −0.491 | −3,981,726 | 357,558 | 3,982,389 | 27 |
| PULLBACK_RECLAIM | BASE | 1,758 | 979 / 779 | 35.0% | 0.559 | −0.258 | −2,885,603 | 677,057 | 2,959,858 | 24 |
| PULLBACK_RECLAIM | CONSERVATIVE | 1,640 | 933 / 707 | 29.4% | 0.383 | −0.404 | −4,428,222 | 940,855 | 4,429,162 | 24 |
| PULLBACK_RECLAIM | ADVERSE_SLIPPAGE | 810 | 469 / 341 | 24.7% | 0.234 | −0.478 | −3,145,969 | 292,416 | 3,150,016 | 19 |

Notes on the table:
- ADVERSE_SLIPPAGE has fewer trades because the planned reward-to-risk falls below 1.5 once slippage is larger, so more signals are rejected.
- Trade counts are fewer than 2,000 stock-sessions because one trade per stock per session is allowed and some sessions have no qualifying plan.

## 3. Exit anatomy (BASE, TREND_RECLAIM)

| Exit | Count | Mean net R |
|---|---|---|
| Target | 218 | +1.70 |
| Stop | 790 | −1.15 |
| Time (15:15 square-off) | 845 | +0.12 |

Stops are 43% of trades and lose more than 1R each, because the adverse slippage on the stop fill is roughly 10% of a tight stop distance. Targets are only 12% of exits. The arithmetic was checked: the three groups reproduce the reported expectancy.

## 4. Verification of the engine

An independent Python reimplementation of EMA, VWAP, the TREND signal, stops, targets, exits and quantity reproduced all 38 RELIANCE development trades exactly (date, side, entry and exit fills, exit reason, quantity, stop and target). See `FOUNDATION_AUDIT.md` for the defects found and fixed.

## 5. Rejections

BASE TREND_RECLAIM: 25,501 rejections, all `RR_BELOW_1_5`. Under the V1 stop and target method, most signals fail the 1.5 reward-to-risk floor; those that pass are concentrated near the session low. Sessions with at least one trade: 1,853 of 2,000.

## 6. Interpretation

- Both candidates are negative before the conservative cost scenario. Costs are not the only cause: gross R is already negative (overall mean gross R −0.17 for TREND BASE).
- The losses come from the stop-loss side. Stops are too frequent and cost more than −1R each. The reward-to-risk floor only admits trades whose targets are reachable from a near-low stop.
- Neither candidate was tuned on this data. A new candidate or parameter set would require a new development set or a new cycle, and must not reuse these results as independent evidence.

## 7. What is not covered

- Full-specification gates (VIX, NIFTY ATR, event risk, market state history). Not in the dataset.
- Point-in-time constituents. The 50-stock list is a single snapshot (survivorship bias, unquantified).
- Walk-forward sub-validation inside development.
- Monthly and per-stock robustness beyond the breakdowns stored in `development.json`.
