# Phase 0 — GO / NO-GO readiness matrix (2026-11-11)

Decision: **NO-GO** for the recommendation engine, for stocks and for index options. Nothing in this matrix changes that.

| Area | Index options (NIFTY, BANK NIFTY) | Stocks | Shared infrastructure |
|---|---|---|---|
| Strategy implementation | 7-check scoring, threshold and F-R1 fix PASS. Stop and target formulas need owner review (S-04, S-05, S-06) | NOT TESTED (separate engines, S-09) | — |
| Data reliability | Freshness, completeness, identity PASS. Option-chain timestamp open (D-04). Survivorship open (D-07) | BLOCKED | Token and error handling PASS |
| Risk engine | Sizing arithmetic PASS. Correlation FAIL (R-06). Gap and expiry FAIL (R-07). Costs unverified (R-09) | BLOCKED | — |
| Historical validation | BLOCKED (preconditions in HISTORICAL_VALIDATION_PLAN) | BLOCKED | — |
| Robustness | Offline items PASS or FAIL as listed; market items BLOCKED | BLOCKED | — |
| Forward paper trading | Not approved | Not approved | — |
| Real-money trading | Prohibited | Prohibited | — |
| Overall | **NO-GO** | **NO-GO** | **NO-GO (audit first)** |

## What would move a row toward GO
- Index options: owner decisions on S-05, S-07 and the correlation rule; a clean dataset; point-in-time option data; a passing holdout under an approved protocol; costs verified.
- Stocks: a separate audit of the stock engines, then the same evidence.
- Shared: verified costs, correlated exposure logic, and a passing data-quality review.

Passing code tests is not evidence of profitability. A GO decision needs out-of-sample evidence, approved before the holdout is opened.
