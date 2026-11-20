# Predictive-power diagnostic G-1 (pre-registered)

Date: 2026-11-06 (IST). Registered before any run. This is a diagnostic: it measures whether signals predict returns **before** any exit rule, stop, target or cost. It does not select, accept or reject a trading strategy.

## Question

Do the eight signal families (I-2 to I-8 definitions, and I-1) predict forward returns better than chance and better than the same stocks at the same time of day?

## Data and grids

- The 52 NSE equities, one-hour standard grid (seven bars per session). The 15-minute grid is run later, under the same protocol, once its collection is complete.
- Unadjusted prices. Sessions with a flagged daily move (open versus previous close beyond 35%) are excluded in full.
- Periods: development 2022-01-03 to 2023-12-31 and validation 2024-01-01 to 2025-06-30. **The holdout (2025-07-01 to 2026-11-05) is not used.**

## Signals

Each family uses the definition in `docs/INTRADAY_PROTOCOLS_I2_TO_I8.md` with **one change**: the time-of-day restriction is removed for this diagnostic, so that every bar except the first is eligible. The first bar of a session is excluded because the opening-range signal needs it. Entry-time restrictions are a trading rule and are therefore not part of a predictive-power question.

## Outcome measures

For each signal occurrence at bar *i* (close), the forward return over horizon H is log(close_{i+H} / close_i), using only bars in the same session. Horizons:
- **H = 1 bar** (one hour on the one-hour grid).
- **H = 3 bars.**
- **Session end:** close of the last standard bar of the session.

## Benchmarks

1. **Time-of-day baseline.** For each stock, horizon and time-of-day slot, the average forward return over all eligible bars. Excess return = signal forward return − baseline for that slot. This removes the intraday drift pattern.
2. **Null (random entries).** For each signal and each stock, the same number of bars is drawn at random, with the same time-of-day distribution, from all eligible bars. The mean excess is computed for each of 200 draws. The signal's mean excess is reported with its percentile in that null distribution.

## Statistics

- Mean excess return in basis points, with n (number of occurrences).
- t-statistic = mean / (standard deviation / √n). **This overstates significance**, because occurrences overlap in time and are correlated across stocks. It is reported as an upper bound on significance.
- Hit rate: fraction of occurrences with positive excess return.
- Null percentile of the mean excess.

## Regimes

Each session is labelled from the NIFTY 50 daily series, restricted to the equity calendar dates (NIFTY publishes holiday bars with zero volume, so its own calendar is not used):
- **Trend:** NIFTY close above or below its 200-day simple moving average.
- **Volatility:** NIFTY 20-day realised volatility above or below its median over the period.

Excess returns are reported separately for each regime. No regime is chosen after the results are seen.

## Decision rule (fixed now)

A signal shows **predictive power** only if all of the following hold in validation: mean excess return above zero at H = 1 bar **and** H = session end; null percentile at or above 97.5 (one-sided); and the sign is the same in development. Passing this rule does **not** accept a strategy. It only justifies a full cost-adjusted protocol, registered separately, with its own holdout.

Any signal that fails is reported as having no detectable predictive power at that horizon. Results are reported for every signal, passing or not.

## Declared limits

Survivorship bias (today's constituents) in the universe. Unadjusted prices. Overlapping observations inflate t-statistics. Sample-size differences across signals and regimes. Results describe the 52-stock universe, 2022 to mid-2025, and nothing beyond it.
