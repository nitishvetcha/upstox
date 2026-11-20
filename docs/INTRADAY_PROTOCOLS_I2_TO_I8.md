# Intraday protocols I-2 to I-8 (pre-registered, one-hour bars)

Date: 2026-11-06 (IST). Registered before any run. Each hypothesis is tested **separately**. None is combined with another. Rules and parameters are fixed here.

## Common to all hypotheses (identical to I-1)

- **Data:** `.research-data/upstox-clean-2026-11-06-v1/`, one-hour series of the 52 NSE equities, standard grid only (09:15, 10:15, 11:15, 12:15, 13:15, 14:15, 15:15). Unadjusted prices. Sessions containing a flagged daily move (open versus previous close beyond 35%) are excluded in full and counted.
- **Splits:** development 2022-01-03 to 2023-12-31 (exploration); validation 2024-01-01 to 2025-06-30 (acceptance, once); holdout 2025-07-01 to 2026-11-05 (opened only if validation passes, read once).
- **Entry:** the signal is evaluated at the close of bar *i* and executed at the open of bar *i+1* plus adverse slippage. The signal bar must be at 10:15, 11:15, 12:15 or 13:15 (so the entry is at 11:15, 12:15, 13:15 or 14:15). Long only. One position per stock. The entry bar must be in the same session.
- **Stop:** entry − 1.5 × ATR(14) at the signal bar. **Target:** entry + 2.5 × ATR(14). Checked from the entry bar onward. If both are touched in one bar, the stop is taken first. A gap through the stop exits at the open, adverse. **Session end:** exit at the close of the 15:15 bar. No overnight holding.
- **Indicators:** all causal. EMA(20) and EMA(50) on hourly closes; ATR(14) Wilder; RSI(14) Wilder; VWAP reset each session using typical price × volume.
- **Costs and sizing:** identical to I-1 (`INTRADAY_PROTOCOL_I1_TREND_CONTINUATION.md`): BASE and CONSERVATIVE scenarios, intraday statutory-rate assumptions, ₹10,000 risk per trade, notional cap ₹10,00,000.
- **Acceptance:** validation at least 100 trades and CONSERVATIVE expectancy strictly positive, else **rejected** and the holdout is not opened. If validation passes, the holdout must also have at least 100 trades and a strictly positive CONSERVATIVE expectancy.

## Multiplicity rule (fixed now)

Seven hypotheses are tested on the same data. A pass on validation or holdout for any one of them is reported together with the count of hypotheses tested. If more than one passes validation, **every** holdout result is read and reported. The holdout is not used to choose among them.

## The hypotheses

**I-2 BREAKOUT_VOLUME.** Breakouts with volume confirmation continue. Signal at bar *i*: close_i > highest high of the previous 10 standard bars (bars *i−10* to *i−1*); volume_i ≥ 1.5 × mean volume of the previous 20 bars; EMA20_i > EMA50_i.

**I-3 MOMENTUM_PULLBACK.** A pullback to the 20-period average in an uptrend resumes. Signal at bar *i*: EMA20_i > EMA50_i; low_{i−1} ≤ EMA20_{i−1} (the previous bar touched EMA20); close_i > EMA20_i and close_i > close_{i−1}.

**I-4 RELATIVE_STRENGTH.** Stocks that are leading the universe intraday keep leading. Signal at bar *i*, timestamp T: the stock's return since the previous session's last close, close_i / prevSessionClose − 1, ranks in the **top quartile** among all universe stocks that have a bar at T (at least 20 stocks required); and EMA20_i > EMA50_i.

**I-5 OPENING_RANGE_BREAKOUT.** The first hour's high is a level that, once cleared, gets followed. The opening range is the high of the 09:15 bar. Signal only on the 10:15 bar: close_i > opening-range high.

**I-6 VWAP_RECLAIM.** Price reclaiming session VWAP is a buying signal. Signal at bar *i*: close_{i−1} < VWAP_{i−1} and close_i > VWAP_i, where VWAP is reset each session.

**I-7 MEAN_REVERSION_SIDEWAYS.** Oversold moves in a flat market revert. Signal at bar *i*: sideways, meaning |EMA20_i − EMA50_i| / close_i < 0.002, and RSI(14)_i < 30. The target still uses the common 2.5 × ATR (no special exit for this hypothesis).

**I-8 FAILED_BREAKDOWN_REVERSAL.** A break below the previous session's low that fails to hold is a buying signal. Let L_prev be the lowest low of the previous session. Signal at bar *i*: low_{i−1} < L_prev and close_i > L_prev (the breakdown was reclaimed within one bar).

## Declared limits

Survivorship bias (today's constituents, an upper bound). Unadjusted prices with flagged sessions excluded. Statutory costs are assumptions. No margin model. No portfolio-level capital limit. Only the one-hour grid is tested here. Sub-hour (15-minute, 5-minute) research is a separate step, which needs its own collection.
