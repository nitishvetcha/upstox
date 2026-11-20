# Predictive-power diagnostic G-1, protocol V2 (pre-registered before any V2 result)

Date: 2026-11-08 (IST). Applies to the one-hour grid (G-1 1h) and the fifteen-minute grid (G-1 15m).
The original protocol `docs/PREDICTIVE_POWER_DIAGNOSTIC_G1.md` is preserved unchanged. This V2 document lists every change and is written before the V2 runs.

## Purpose

Diagnostic only. It asks whether the eight registered signal families (I-1 to I-8) predict forward returns above a per-stock, per-time-of-day baseline and above random entries. It does not accept or reject a trading strategy, and it does not include exits, costs or position sizing.

## Data

- Verified dataset: `.research-data/upstox-verified-2026-11-08-15m/` (15m) and `.research-data/upstox-verified-2026-11-08-v1/` (1h, daily, calendar, index). Produced by `scripts/upstox-verify-clean.ts` from the immutable raw stores. Prices are unadjusted (see the corporate-action finding below).
- Universe: the 50 NSE equities with a complete listing (the earlier "52" was an error; see audit).
- Analysis window: 2022-01-03 to 2025-06-30. **The holdout (2025-07-01 onward) is never loaded into memory.** Each forward return is confined to one session, so no holdout price is read.
- Periods: development 2022-01-03 to 2023-12-31; validation 2024-01-01 to 2025-06-30.

## Session exclusions (applied to the whole session of the stock or market)

1. **Flagged daily move (V1 rule, kept):** the stock's open differs from its previous close by more than 35%.
2. **Corporate-action ex-date (new in V2):** the ex-date session of any split, bonus or face-value event for the stock in the NSE corporate-action dataset. Reason: 26 of 26 testable 2006–2025 events show no price step at the ex-date, so the vendor history is already back-adjusted; the ex-date session is kept out of the sample rather than trusting or correcting the adjustment per event. Events are listed in `corporate-actions-verified-2026-11-08/corporate-actions-validation-all-years.json`.
3. **Special sessions (new in V2):** dates in `NSE_SPECIAL_SESSIONS` (`src/lib/time.ts`): Muhurat and special-timing sessions.
4. **Market-wide irregular sessions (new in V2):** a date where at least 25% of the listed equities have fewer bars than the regular session would contain. The rule is computed from the data before any result; it removes the 2024-03-02 and 2024-05-18 partial sessions.

Excluded sessions are removed from signal occurrences, from eligibility, from null pools, and from the relative-strength ranking on that date. Exclusions use only information that is known before the affected bars are used. The 25% and 35% rules use the day's own open, which is known at the open. Irregular-session classification uses the full day, but a whole excluded day is never used for a signal, so it cannot leak into any analysed bar.

## Completeness and quality gate (must pass before any diagnostic runs)

Global, must all be zero: missing files, invalid files, extra files, temporary (`.tmp`) files, manifest mismatches, manifest duplicate STORED rows.

Per equity series, after removing excluded sessions (items 3 and 4 above):
- missing sessions ≤ 1% of expected sessions (expected = calendar sessions from the listing date, which is the first daily bar, to 2026-11-05);
- partial sessions ≤ 5% of expected sessions;
- dropped bars ≤ 0.1% of raw candles.

A series that fails any of these is excluded and listed. The diagnostic runs only if the global gate passes and at least 40 series remain. If the gate fails, the data issue is fixed and the gate re-run; the diagnostic is not run on incomplete data.

Corporate-action ex-dates (item 2) are not counted as missing or partial sessions.

## Signals (definitions unchanged from `INTRADAY_PROTOCOLS_I2_TO_I8.md`)

The time-of-day restriction is removed for the diagnostic, as in V1. Eligibility is defined separately below.

- **I-1 TREND_CONTINUATION:** EMA20 > EMA50 and close > previous bar's high.
- **I-2 BREAKOUT_VOLUME:** EMA20 > EMA50; close > highest high of the previous 10 bars; volume ≥ 1.5 × mean volume of the previous 20 bars.
- **I-3 MOMENTUM_PULLBACK:** EMA20 > EMA50; previous bar's low ≤ previous EMA20; close > EMA20 and close > previous close.
- **I-4 RELATIVE_STRENGTH:** EMA20 > EMA50; the stock's return since the previous session's last close is in the top quartile of the included universe at that timestamp (at least 20 stocks with a bar at that timestamp).
- **I-5 OPENING_RANGE:** close > opening-range high, where the opening range is the high of all bars of the session that start before 10:15 (for the 1h grid this is the 09:15 bar, identical to V1).
- **I-6 VWAP_RECLAIM:** previous close < previous session VWAP and close > VWAP (VWAP reset each session, typical price × volume).
- **I-7 MEAN_REVERSION_SIDEWAYS:** |EMA20 − EMA50| / close < 0.002 and RSI(14) < 30.
- **I-8 FAILED_BREAKDOWN:** previous bar's low < previous session's low and close > previous session's low.

All lookbacks are counts of bars of the grid being analysed (EMA 20/50, RSI 14, 10-bar high, 20-bar volume, the 2 sessions for prior close and low). On the 15m grid this means EMA20 spans 5 hours; this is stated explicitly, and it is the same bar-count convention used on the 1h grid.

**Direction.** All eight registered signals are bullish (long) entries. The diagnostic therefore reports results for the long direction only. A bearish mirror was not registered and is not tested.

## Eligibility, horizons and forward returns

- Eligible bars: start time ≥ 10:15 IST. On the 1h grid this equals V1 (every bar except the first). On the 15m grid, the first hour (09:15–10:15) is excluded because the opening-range signal needs the full first hour. Bars whose forward return is not available (crossing the session end) are not eligible for that horizon.
- Horizons, on the 1h grid: 1 bar (1 h), 3 bars (3 h), session end (as V1).
- Horizons, on the 15m grid: 1 bar (15 min), 4 bars (1 h), 12 bars (3 h), session end. The 4-bar and 12-bar horizons are the time-equivalents of the 1h grid's 1-bar and 3-bar horizons.
- Forward return = log(close at horizon / close now), within the same session.

## Time-of-day baseline (corrected to the registered text)

For each period, stock, horizon and time-of-day slot: the mean forward return of all eligible bars in that slot. Excess return of a signal occurrence = its forward return − the baseline of its own stock, horizon and slot. V1's interrupted implementation pooled the baseline across stocks; that deviated from the registered text and is corrected here.

## Random-entry null (fixed seed, larger number of draws)

For each period, signal and horizon, and for each occurrence, one eligible bar is drawn at random from the **same stock, same period and same time-of-day slot**. The mean excess over all occurrences is one draw. The number of draws is **1000** (V1 registered 200). Seed: **20261108** (mulberry32 PRNG). The observed mean's percentile in the null distribution is reported.

## Regimes (no look-ahead; per-period volatility median)

Every label uses only information up to the close of the previous session. Each session is labelled from NIFTY 50 closes restricted to the trading calendar:
- **Trend:** previous session's close above (UP) or not above (DOWN) its 200-session simple moving average. Unavailable for the first 200 sessions of the calendar.
- **Volatility:** 20-session realised volatility (annualised, from log returns up to the previous session) above (HIGH) or not above (LOW) the **median of that quantity over the same period** (development median for development dates, validation median for validation dates). V1 used the whole sample, including the holdout; corrected here.

## Uncertainty (correlated observations)

Occurrences on the same date are correlated across stocks (common market moves), and occurrences in consecutive bars of one stock are correlated. Reported uncertainty therefore uses **date-clustered** standard errors: S_d = sum of (x_i − mean) over the occurrences on date d; SE = sqrt(sum_d S_d²) / N; 95% interval = mean ± 1.96 × SE. The IID t-statistic from V1 is still reported for comparability, labelled as overstating significance.

## Decision rule (V2)

For each primary horizon (1h grid: 1 bar and session end; 15m grid: 4 bars and session end), a signal shows **predictive evidence** only if all of these hold:
1. Validation mean excess > 0.
2. Validation null percentile ≥ 97.5 (one-sided).
3. Validation date-clustered 95% lower bound > 0 (new in V2).
4. Development mean excess > 0 (sign check).

Signals that pass are candidates for a separately registered cost-adjusted protocol with its own holdout. **Passing this rule is not evidence of profitability.** Every signal, passing or not, is reported.

## Multiplicity

Eight signals × two grids × several horizons are tested. With a 97.5 percentile threshold, about 0.25 false positives are expected per 8 tests by chance alone. Any pass is reported with the full table of tests, and a pass in one grid is not treated as confirmed without the other.

## Reporting (required for each grid)

For every signal and horizon and period: forward return of the occurrences (raw, bps), baseline-adjusted excess (bps), date-clustered 95% interval, IID t, hit rate, null percentile, sample size (occurrences and distinct dates); breakdown by stock and by regime; the decision-rule result.

## Declared limits

Survivorship bias (today's constituents, an upper bound). Unadjusted prices from the vendor, which are already back-adjusted for most corporate actions; the 2003–2004 BAJFINANCE and 2025 single-stock jumps are not explained by the NSE corporate-action records and are excluded by rule 1. Dividends are not adjusted. No costs, no exits, no margin. Results describe the 50 stocks, 2022 to mid-2025, long direction only.
