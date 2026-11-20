# Protocol H3_BREADTH_REGIME, v1.0

**Breadth regime (predictive comparison, NOT executable)**

## Hypothesis and rule

Breadth on day t = share of eligible stocks whose close on t is above their mean of valid closes over the previous 50 sessions (requires at least 40 valid sessions). Regime HIGH if breadth >= 0.50, otherwise LOW. Outcome: equal-weight mean 21-session forward return of the eligible universe, executed open t+1 to open t+22, GROSS. Reported as predictive comparison only.

## Common rules (all five protocols)

Amendment A1 (2026-11-08, before any run): the development end date 2017-12-31 is not a trading session; the runner now uses the last session on or before it. Runner hash changed from def5cfa35964c6f9bd7e93e5c19b3d441e9ccdd2a62b591f08c1f4c931ec96c3 to 88d118a6ac39f2233c0078949ef9210b8bfead3e3b8807f3d52587fbffef87aa. No methodological rule changed.

- Version: v1.0, registered 2026-11-08 (2026-11-08), BEFORE any run.
- Runner: `web/scripts/crosssectional-daily-dev.py`, SHA-256 `88d118a6ac39f2233c0078949ef9210b8bfead3e3b8807f3d52587fbffef87aa`.
- Inputs (SHA-256): {
 "daily universe calendar": "df8abbfcf3a65f69351af9646d10daa99d4f2beb2b75c6fadf3fe7cbb106770f",
 "daily universe coverage": "55a744bfcbd125deffd90ecd0504b7f63bc963c8720ae9dbafadf3be8d4d2f37",
 "daily universe verification": "13deb3944db2240728990aaefb30ee8c040f5b054fb1e44fe5ce544780c9716d",
 "equity master": "3675bb26683a8dc3d6d70bfde45086f0a6c8975c45a92e2522b068d108f5970e",
 "corporate-action validation": "fe1eb76f5d871f53c60e8742cf1d6e320a881cdb726d211021cacaacd197d652",
 "NIFTY 50 daily (v1 verified)": "d83bca47753d4d1d5169e2d8d7eea85f86d1ddd79959f737bf5817ecf736417e"
}
- Scope of the first execution: DEVELOPMENT ONLY, 2010-01-04 to 2017-12-31. Trades must exit on or before 2017-12-31. Validation (2018-01-01 to 2021-12-31) and holdout (2022-01-03 to 2026-11-05) are not executed.
- Universe: 2,397 NSE EQ series (today's listed set; survivorship bias is an upper bound).
- Eligibility on signal date t (frozen): at least 240 valid sessions among the previous 252 calendar sessions (ending at t), AND the median of close × volume over the valid sessions of the previous 60 sessions is at least the liquidity threshold, AND at least 45 valid sessions in those 60.
- Valid session: a calendar session with a bar, volume > 0, on or after the verified listing date, not a flagged open (|open / previous close − 1| > 35%) and not a corporate-action ex-date (split, bonus or face-value).
- Liquidity thresholds: PRIMARY Rs 1 crore; sensitivities Rs 50 lakh and Rs 2 crore reported alongside. No threshold is chosen from results.
- Execution: signal at close of t; entry at the open of t+1 (rolled forward up to 5 sessions if no valid bar; entry skipped if none); exit at the open of the scheduled day (rolled forward likewise; forced exit at last valid price if none, counted).
- Slippage: LOW 0.10% per side; HIGH 0.25% per side (owner decision; applied to prices).
- Brokerage Rs 20 per executed order (both scenarios). Exchange transaction charge Rs 306.99 per crore per side (NSE circular NSE/FA/73061, effective 1 Mar 2026). IPFT Rs 0.01 per crore per side (same circular).
- UNRESOLVED / PROVISIONAL: SEBI fee (Rs 10 per crore used provisionally); STT 0.1% per side on delivery (provisional); stamp duty 0.015% buy side (provisional; state-specific); GST 18% (rate per secondary sources; base differs by scenario: LOW = brokerage and exchange charges; HIGH = brokerage, exchange, SEBI, IPFT and DP). Upstox DP charge Rs 20 + GST per sell per scrip per day (customer-facing; CDSL tariff UNRESOLVED).
- Historical-rate limitation: the confirmed exchange and IPFT rates apply from 1 Mar 2026. For development dates they are APPLIED AS A SENSITIVITY ASSUMPTION ONLY (historical rates Rs 297 and Rs 10 per crore before that date are not used in this run and must be re-run for historically exact results). No current rate is presented as the historical statutory cost.
- Fixed charges are converted to a percentage using an assumed position notional of Rs 1,00,000 (documented assumption).
- Null: 1,000 random same-size portfolios drawn from the eligible set on the same date, same execution and cost rules; seed 20261108 (per-date seed = seed + t).
- Decision framework (validation and holdout) is registered here but NOT applied in this run: validation pass requires mean spread > 0, date-clustered 95% lower bound > 0, and null percentile >= 97.5 (one-sided), net of the HIGH scenario.
- Reporting: gross and net (LOW and HIGH); turnover; costs by component; drawdown; eligible counts by year; exclusions; skipped dates and names; forced exits; truncations; all failures reported. No threshold, lookback or regime cut is changed after results are seen.
- Strategy 11.4, raw data, previous research results and Git state are not modified.
