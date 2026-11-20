# Daily equity research protocol (pre-registered, written before any result)

Date: 2026-11-06 (IST). Written for: the project owner. Registered before the experiment runs. Rules are not changed after results are seen.

## Data

- **Source:** the derived, cleaned daily series in `.research-data/upstox-clean-2026-11-06-v1/` (from the immutable raw store `.research-data/upstox-raw-2026-11-06-v1/`, Upstox v3 historical candles).
- **Universe:** 52 NSE equities, from today's constituents. **Survivorship-biased:** delisted and former constituents are absent, so results are an upper bound on what a real investor could have achieved. Stated in every output.
- **Prices are unadjusted.** Corporate actions (splits, bonus issues) are not corrected. Any trade whose holding period (entry day to exit day, inclusive) includes a day with an open-to-previous-close move greater than 35% is **excluded and counted**. These are candidate corporate actions or bad prints. They are not adjusted.
- **Calendar:** sessions are the dates on which at least half of the stocks already listed that day have a bar. The index daily series publishes bars on holidays with zero volume, so it is not used as the calendar.
- **Indices** are not traded. They are not part of this protocol.

## Splits (chronological, fixed now)

| Set | Dates | Use |
|---|---|---|
| Development | 2000-01-01 to 2015-12-31 | Exploration of all three candidates. Selection uses only this set |
| Validation | 2016-01-01 to 2021-12-31 | Used once, for the selected candidate only |
| Holdout | 2022-01-01 to 2026-11-05 | Untouched until validation is complete. Used once, for the selected candidate only |

The holdout is opened **only if the validation passes** (criterion (a) below). Acceptance requires both, so a failed validation means the holdout is never read.

## Signals and execution (no look-ahead)

- Indicators on day *t* use only bars up to and including day *t*.
- A signal at the close of day *t* is executed at the open of day *t+1* plus adverse slippage.
- Exits are checked from day *t+2* onward, using the day's high and low. If stop and target are both touched in one bar, the stop is assumed first (conservative). A gap through the stop exits at the open, adverse.
- One position per stock at a time. A time stop exits at the close of the last day.

## Candidates (three independent hypotheses)

1. **TREND_BREAKOUT_20.** Hypothesis: a close above the prior 20-day high, in an established uptrend (close above the 200-day simple moving average), continues. Stop 2 × ATR(14) below entry. Target 3 × ATR. Time stop 20 days.
2. **PULLBACK_RSI2.** Hypothesis: a short-term oversold reading within an uptrend (RSI(2) below 10, close above the 200-day simple moving average) reverts. Stop 2 × ATR. Target 2 × ATR. Time stop 5 days.
3. **DONCHIAN_55.** Hypothesis: a close above the prior 55-day high, with the close above the 50-day simple moving average, starts a longer move. Stop 2 × ATR. Target 4 × ATR. Time stop 40 days.

ATR is Wilder's 14-day average of true range, measured at the signal day.

## Position sizing

Risk budget 1% of a notional capital of ₹10,00,000 (₹10,000 per trade). Quantity = floor(risk budget ÷ (entry − stop)). Risk is measured in R, where 1 R is the planned risk in rupees.

## Costs and slippage

Two scenarios. Each is an **assumption**. The statutory rates below must be verified against the current NSE and SEBI schedules before any use beyond research.

| Item | BASE | CONSERVATIVE |
|---|---|---|
| Slippage per side (adverse) | 0.10% | 0.25% |
| Brokerage per order | ₹0 | ₹20 |
| STT on delivery (both sides) | 0.10% of turnover | same |
| Exchange transaction charge | 0.00297% of turnover (both sides) | same |
| SEBI fee | 0.0001% of turnover (both sides) | same |
| Stamp duty (buy side) | 0.015% of turnover | same |
| GST | 18% on brokerage, exchange and SEBI fee | same |

No broker-specific rate is used. Brokerage ₹0 in BASE is a deliberate assumption, not an offer, and the CONSERVATIVE scenario is the one to read.

## Metrics

Per candidate and per scenario: trade count, win rate, net expectancy in R, profit factor, maximum drawdown in R, average win and loss, consecutive losses, excluded-by-jump count, and breakdown by year. Result is reported in net R after costs.

## Selection rule (fixed now)

From the development set only: a candidate qualifies if it has at least 100 trades and positive CONSERVATIVE expectancy. Among qualifying candidates, the one with the higher BASE expectancy is selected. If none qualifies, no candidate is selected, and the validation and holdout sets are **not opened**.

## Acceptance

A selected candidate is accepted only if (a) validation net expectancy in R is positive in CONSERVATIVE, and (b) the holdout, read once, is also positive in CONSERVATIVE. Nothing else. A failed validation or holdout is reported as a failure. Thresholds are not changed.

## Declared limits

- Survivorship bias (upper bound).
- Unadjusted prices; flagged jumps excluded, not corrected. Stocks with many flagged jumps are visible in the coverage report.
- No portfolio-level capital constraint: trades are summed, not sequenced.
- Statutory costs are assumptions; verify before use.
- Gap risk is modelled only through the open price on the day of the stop.
