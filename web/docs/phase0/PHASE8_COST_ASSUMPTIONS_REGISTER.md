# Phase 8 — Cost assumptions register

Status of all cost figures: **ASSUMPTIONS ONLY. NOT VERIFIED OFFICIAL RATES.**

| Item | Assumed rate in research | Source status | Effective date verified? | Action |
|---|---|---|---|---|
| Brokerage | ₹20 per executed order (configured) | Configured default; broker page not verified here | No | Obtain dated broker schedule |
| Exchange transaction charge (options) | 0.03503% of premium turnover (configured) | Configured default; not verified | No | Obtain dated exchange schedule |
| SEBI charge | ₹10 per crore (configured) | Configured default; not verified | No | Obtain dated SEBI schedule |
| STT (options) | 0.1% on sell-side premium (configured) | Configured default; not verified | No | Obtain dated statutory schedule |
| Stamp duty | 0.003% on buy-side premium (configured) | Configured default; not verified | No | Obtain dated statutory schedule |
| GST | 18% on brokerage and exchange charges (configured) | Configured default; not verified | No | Obtain dated statutory schedule |

## Scenario multipliers (owner-approved, research sensitivity)
| Scenario | Cost multiplier | Additional slippage (per leg, per side, on mid) |
|---|---|---|
| Base | 1.0× | none beyond configured costs |
| Adverse | 1.5× | 2% |
| Stress | 2.0× | 4% |

Slippage is applied once per leg per side on mid. It is not added on top of bid/ask spreads, so bid/ask is not double-counted.

## Rules
- Configured values are not changed because a newer rate is found. Differences are recorded and approved separately.
- Any result that uses these costs must state "assumed costs, not verified" alongside the result.
- Before any result counts as evidence, the dated official schedules must be obtained and the register updated.
- Calculation date and configuration version (`nse-options-2024-10`) recorded with each run.
