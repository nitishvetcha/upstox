# Intraday protocol I-1: trend continuation on one-hour bars (pre-registered)

Date: 2026-11-06 (IST). Registered before any run. Rules and parameters are fixed here and are not tuned after results are seen.

## Hypothesis

Within an established intraday uptrend, a one-hour close that breaks the previous bar's high continues the move enough to pay for costs and slippage.

## Data

- `.research-data/upstox-clean-2026-11-06-v1/`, 1-hour series of the 52 NSE equities, 2022-01-03 to 2026-11-05. Prices are unadjusted.
- Only standard bars are used: start times 09:15, 10:15, 11:15, 12:15, 13:15, 14:15, 15:15 IST (seven per full session). Off-grid stamps are dropped and counted.
- A session containing any day flagged for a candidate corporate action (open versus previous close beyond 35%, from the daily store) is excluded in full and counted.

## Splits (chronological, fixed now)

| Set | Dates | Use |
|---|---|---|
| Development | 2022-01-03 to 2023-12-31 | Exploration only (this is the first look at the rule) |
| Validation | 2024-01-01 to 2025-06-30 | Acceptance test, once |
| Holdout | 2025-07-01 to 2026-11-05 | Opened only if validation passes, read once |

## Features (causal: bar *i* uses bars ≤ *i*)

- EMA(20) and EMA(50) on hourly closes, carried across sessions.
- ATR(14) on hourly true range (Wilder).

## Entry (signal at the close of bar *i*, executed at the open of bar *i+1*)

Long only, when all of the following hold:
1. EMA(20) > EMA(50) at bar *i* (uptrend).
2. Close of bar *i* > high of bar *i−1* (continuation breakout).
3. Bar *i* is at 10:15, 11:15, 12:15 or 13:15, so the entry bar (*i+1*) is at 11:15, 12:15, 13:15 or 14:15. Entries never occur on the 15:15 bar.
4. No open position in that stock.

## Exit (intraday only, no overnight holding)

Checked from the entry bar onward, using each bar's high and low. If stop and target both lie inside one bar, the **stop is taken first** (conservative).

- **Stop:** entry − 1.5 × ATR(14) at the signal bar. A gap below the stop exits at the bar's open, adverse (`GAP_STOP`).
- **Target:** entry + 2.5 × ATR(14) at the signal bar.
- **Session end:** if neither is hit, exit at the close of the session's last standard bar (15:15), adverse.

## Execution costs (BASE and CONSERVATIVE)

| Item | BASE | CONSERVATIVE |
|---|---|---|
| Slippage per side (adverse) | 0.05% | 0.10% |
| Brokerage per order | ₹0 (optimistic bound, not a rate) | ₹20 |
| STT (intraday, sell side only) | 0.025% of sell turnover | same |
| Exchange transaction charge (both sides) | 0.00297% | same |
| SEBI fee (both sides) | 0.0001% | same |
| Stamp duty (buy side) | 0.003% | same |
| GST | 18% on brokerage, exchange and SEBI fee | same |

These are statutory-rate assumptions to verify before any use beyond research. No broker-specific rate is used. Margin requirements are not modelled.

## Position sizing and risk

Risk budget ₹10,000 per trade (1% of ₹10,00,000). Quantity = floor(10,000 ÷ (entry − stop)), capped so that quantity × entry ≤ ₹10,00,000. One position per stock at a time.

## Metrics

Per set and scenario: trades, win rate, net expectancy in R, profit factor, maximum drawdown in R, average win and loss, exit mix, excluded-by-flag count, and yearly breakdown.

## Acceptance (fixed now)

1. At least 100 trades in validation, and validation CONSERVATIVE expectancy in R strictly positive. If not, the experiment is **rejected** and the holdout is not opened.
2. If validation passes, the holdout is read once. Acceptance requires at least 100 holdout trades and a strictly positive holdout CONSERVATIVE expectancy in R.

Nothing else. A failing result is reported as a failure. The rules, parameters and splits are not changed.

## Declared limits

- Survivorship bias (today's constituents): an upper bound.
- Unadjusted prices. Flagged sessions are excluded, not corrected.
- Statutory costs are assumptions.
- No margin, no portfolio-level capital constraint: trades are summed.
- Only the 52-stock universe and the 1-hour grid are used. Intraday sub-hour bars are not tested here.
