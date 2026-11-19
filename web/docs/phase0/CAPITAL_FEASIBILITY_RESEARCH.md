# Capital feasibility research (2026-11-11)

**SYNTHETIC — RESEARCH ONLY.** Not a deposit recommendation, not a trading recommendation, not evidence of profitability. Engine NO-GO. Production unchanged.

Assumptions (synthetic): index 25000, volatility 0.12, rate 0.065, 3 days to expiry, lot 65. Costs: base configured rates, round trip. Safety buffer: 10% on the per-lot maximum loss (research assumption). Limits applied without relaxation: 1% risk, 20% allocation, 5-lot cap.

## Lots permitted by width and capital
| Width | Valid on 50-pt step | Debit/unit | Max profit/unit | Buffered loss per lot (₹) | Lots at ₹1.0L | Lots at ₹1.7L | Lots at ₹2.0L | Lots at ₹3.0L | Lots at ₹5.0L | Lots at ₹6.0L |
|---|---|---|---|---|---|---|---|---|---|---|
| 25 | no | 12.5 | 12.5 | 1,024 | 0 | 1 | 1 | 2 | 4 | 5 |
| 50 | yes | 24.0 | 26.0 | 1,849 | 0 | 0 | 1 | 1 | 2 | 3 |
| 75 | no | 34.7 | 40.3 | 2,609 | 0 | 0 | 0 | 1 | 1 | 2 |
| 100 | yes | 44.4 | 55.6 | 3,306 | 0 | 0 | 0 | 0 | 1 | 1 |
| 150 | yes | 61.4 | 88.6 | 4,517 | 0 | 0 | 0 | 0 | 1 | 1 |
| 200 | yes | 75.2 | 124.8 | 5,499 | 0 | 0 | 0 | 0 | 0 | 1 |
| 300 | yes | 94.5 | 205.5 | 6,877 | 0 | 0 | 0 | 0 | 0 | 0 |

## Minimum capital for one lot
| Width | Valid | Minimum capital for 1 lot (1% rule, buffered, costs) | Also needs 20% allocation |
|---|---|---|---|
| 25 | no | ₹1,03,000 | ₹5000 |
| 50 | yes | ₹1,85,000 | ₹8000 |
| 75 | no | ₹2,61,000 | ₹12000 |
| 100 | yes | ₹3,31,000 | ₹15000 |
| 150 | yes | ₹4,52,000 | ₹20000 |
| 200 | yes | ₹5,50,000 | ₹25000 |
| 300 | yes | ₹6,88,000 | ₹31000 |

These figures are minimum estimates from a synthetic model. They are not guaranteed minimums. Real capital needs depend on actual premiums, margin, liquidity and execution.
