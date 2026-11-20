# Data verification, 2026-11-08 (Phase 1)

Written for: the project owner. Scope: the immutable raw stores already collected (no new downloads). Verification code: `web/scripts/upstox-verify-clean.ts`. Outputs: `.research-data/upstox-verified-2026-11-08-15m/`, `.research-data/upstox-verified-2026-11-08-v1/`, `.research-data/corporate-actions-verified-2026-11-08/`.

## 1. Files and integrity

| Dataset | Expected files | Present | Valid | Missing | Invalid | Extra | Temp | Manifest mismatches | Raw candles |
|---|---|---|---|---|---|---|---|---|---|
| 15-minute, 50 equities, 2022-01-01 to 2026-11-05 | 3200 | 3200 | 3200 | 0 | 0 | 0 | 0 | 0 | 1,485,161 |
| 1-hour, 50 equities, 2022-01-01 to 2026-11-05 | 1,050 | 1,050 | 1,050 | 0 | 0 | 0 | 0 | 0 | part of 703,398 |
| Daily, 6 indices and 50 equities, 2000-01-01 to 2026-11-05 | 224 | 224 | 224 | 0 | 0 | 0 | 0 | 0 | part of 703,398 |

- Every expected file (a plan applied to the universe file) is present and passes the file-level checks: schema, instrument key, interval, chunk range, HTTP 200, body status, candle count against the manifest, and no duplicate timestamps within a chunk.
- Bar-level anomalies were dropped and counted, never repaired: 15-minute 600 bars (all of them are Muhurat-session bars from 18:00 onward, 3 sessions × 4 bars × 50 series), plus 4 OHLC-inconsistent bars; 1-hour 202.
- Manifest: 3,200 rows for the 15-minute store, 0 failed rows, 0 duplicate STORED rows. Duplicate or conflicting timestamps across chunks: 0.
- **Hash limitation (reported, not hidden).** The manifest records a SHA-256 of the raw response text, but the raw text was not stored, only parsed JSON. Re-serialising the stored JSON reproduces the recorded hash in only 26 of 3200 files. Those hashes therefore cannot prove byte-level identity. The verified reference for every raw file is now the SHA-256 of its stored bytes, listed in `verification.json` (`fileHashes`).

## 2. Calendar and sessions

- Calendar: 6,629 sessions from 2000-01-03 to 2026-11-05, derived from the equity daily series (a date is a session when at least half of the equities listed by then have a bar). The index series is not used: it publishes zero-volume holiday bars.
- Special sessions (from `src/lib/time.ts`): Muhurat on 2022-10-24, 2023-11-12, 2024-11-01, 2025-10-21. 2022-10-24, 2023-11-12 and 2024-11-01 contain bars after 18:00 that are off the standard grid. 2025-10-21 runs 13:45–14:45. All four are excluded from research.
- Market-wide irregular sessions (25% of listed equities short of a regular session): 2024-03-02 and 2024-05-18 (in addition to the Muhurat dates above). Excluded.

## 3. Universe: 50 equities (the earlier count of 52 was an error)

The universe is the 50 NSE equities whose daily history is in the local store, plus the 6 indices. The earlier figure of 52 counted the two BSE index series (SENSEX and BANKEX) alongside the 50 equities. The universe is today's constituents and is **survivorship-biased** (an upper bound). A point-in-time constituent list is not available from the collected sources.

Per stock, after excluded sessions (special, irregular, corporate-action ex-dates). "Dropped" is the fraction of raw candles dropped at verification.

| Symbol | ISIN | Listing (first daily bar) | 15m expected sessions | 15m missing | 15m partial | 15m dropped | 15m gate | 1h missing | 1h partial | 1h gate | Corp-action events 2000–2026 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| RELIANCE | INE002A01018 | 2022-01-01 | 860 | 0 | 1 | 0.0004 | yes | 0 | 0 | yes | 3 |
| INFY | INE009A01021 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 4 |
| LT | INE018A01030 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 4 |
| JSWSTEEL | INE019A01038 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| ASIANPAINT | INE021A01026 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| MAXHEALTH | INE027H01010 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| HINDUNILVR | INE030A01027 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| HINDALCO | INE038A01020 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| HDFCBANK | INE040A01034 | 2022-01-01 | 861 | 0 | 1 | 0.00043 | yes | 0 | 1 | yes | 0 |
| SUNPHARMA | INE044A01036 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| GRASIM | INE047A01021 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| CIPLA | INE059A01026 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 1 |
| SBIN | INE062A01020 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| EICHERMOT | INE066A01021 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| TATASTEEL | INE081A01020 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| DRREDDY | INE089A01031 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| ICICIBANK | INE090A01021 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| M&M | INE101A01026 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 1 |
| BSE | INE118H01025 | 2022-01-01 | 859 | 0 | 1 | 0.00043 | yes | 0 | 0 | yes | 2 |
| SBILIFE | INE123W01016 | 2022-01-01 | 861 | 0 | 1 | 0.00043 | yes | 0 | 1 | yes | 0 |
| ITC | INE154A01025 | 2022-01-01 | 861 | 0 | 1 | 0.0004 | yes | 0 | 0 | yes | 2 |
| TMPV | INE155A01022 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 1 |
| TATACONSUM | INE192A01025 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| ONGC | INE213A01029 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| KOTAKBANK | INE237A01036 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| AXISBANK | INE238A01034 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| NESTLEIND | INE239A01024 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| BEL | INE263A01024 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| TITAN | INE280A01028 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| BAJFINANCE | INE296A01032 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| BHARTIARTL | INE397D01024 | 2022-01-01 | 861 | 0 | 1 | 0.00043 | yes | 0 | 1 | yes | 0 |
| ADANIENT | INE423A01024 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 1 |
| APOLLOHOSP | INE437A01024 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| TCS | INE467B01029 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 3 |
| ULTRACEMCO | INE481G01011 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| COALINDIA | INE522F01014 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| MARUTI | INE585B01010 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| INDIGO | INE646L01027 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| TECHM | INE669C01036 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| SHRIRAMFIN | INE721A01047 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| NTPC | INE733E01010 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 1 |
| ADANIPORTS | INE742F01042 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 1 |
| POWERGRID | INE752E01010 | 2022-01-01 | 860 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 2 |
| JIOFIN | INE758E01017 | 2023-08-21 | 458 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| ETERNAL | INE758T01015 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| HDFCLIFE | INE795G01014 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| TRENT | INE849A01020 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |
| HCLTECH | INE860A01027 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 3 |
| BAJAJ-AUTO | INE917I01010 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 1 |
| BAJAJFINSV | INE918I01026 | 2022-01-01 | 861 | 0 | 0 | 0.0004 | yes | 0 | 0 | yes | 0 |

Gate (`predictive-g1-*/gate.json`): all 50 series pass the 15-minute gate and all 50 pass the 1-hour gate (≤1% missing, ≤5% partial, ≤0.1% dropped).

## 4. Corporate actions

- Source: NSE corporate-action records, 2000–2026 (27 year files, 42,972 records, all parse, required fields present, no ex-date year mismatch). 31 duplicate rows, which are identical records that appear more than once.
- Split and bonus events parsed: 1,202. Subjects that mention a split or bonus but could not be parsed: 231 (listed in the validation file; they are not used).
- Universe events tested against the price evidence (ex-date open versus previous close, using the verified unadjusted daily series):

| Symbol | Ex-date | Kind | Expected factor | Observed open gap | Verdict |
|---|---|---|---|---|---|
| CIPLA | 24-Apr-2006 | bonus | 0.4000 | 1.0235 | CONTRADICTED |
| INFY | 13-Jul-2006 | bonus | 0.5000 | 1.0326 | AMBIGUOUS |
| TCS | 28-Jul-2006 | bonus | 0.5000 | 0.9897 | CONTRADICTED |
| LT | 28-Sep-2006 | bonus | 0.5000 | 1.0402 | AMBIGUOUS |
| HCLTECH | 15-Mar-2007 | bonus | 0.5000 | 1.0153 | CONTRADICTED |
| LT | 01-Oct-2008 | bonus | 0.5000 | 1.0218 | CONTRADICTED |
| TCS | 16-Jun-2009 | bonus | 0.5000 | 0.9853 | CONTRADICTED |
| RELIANCE | 26-Nov-2009 | bonus | 0.5000 | 1.0124 | CONTRADICTED |
| ADANIENT | 10-Dec-2009 | bonus | 0.5000 | 1.0169 | CONTRADICTED |
| ITC | 03-Aug-2010 | bonus | 0.5000 | 1.0147 | CONTRADICTED |
| BAJAJ-AUTO | 08-Sep-2010 | bonus | 0.5000 | 1.0017 | CONTRADICTED |
| ADANIPORTS | 23-Sep-2010 | face-value split | 0.2000 | 1.0188 | CONTRADICTED |
| TMPV | 12-Sep-2011 | face-value split | 0.2000 | 0.954 | AMBIGUOUS |
| LT | 11-Jul-2013 | bonus | 0.6667 | 1.029 | CONTRADICTED |
| INFY | 02-Dec-2014 | bonus | 0.5000 | 0.9954 | CONTRADICTED |
| HCLTECH | 19-Mar-2015 | bonus | 0.5000 | 0.9867 | CONTRADICTED |
| INFY | 15-Jun-2015 | bonus | 0.5000 | 0.9893 | CONTRADICTED |
| ITC | 01-Jul-2016 | bonus | 0.6667 | 0.9906 | CONTRADICTED |
| LT | 13-Jul-2017 | bonus | 0.6667 | 1.0047 | CONTRADICTED |
| RELIANCE | 07-Sep-2017 | bonus | 0.5000 | 1.0004 | CONTRADICTED |
| M&M | 21-Dec-2017 | bonus | 0.5000 | 0.995 | CONTRADICTED |
| TCS | 31-May-2018 | bonus | 0.5000 | 0.9869 | CONTRADICTED |
| INFY | 04-Sep-2018 | bonus | 0.5000 | 1.0068 | CONTRADICTED |
| NTPC | 19-Mar-2019 | bonus | 0.8333 | 1.0125 | CONTRADICTED |
| HCLTECH | 05-Dec-2019 | bonus | 0.5000 | 1.0019 | CONTRADICTED |
| POWERGRID | 29-Jul-2021 | bonus | 0.7500 | 0.9996 | CONTRADICTED |
| BSE | 21-Mar-2022 | bonus | 0.3333 | 0.9554 | AMBIGUOUS |
| POWERGRID | 12-Sep-2023 | bonus | 0.7500 | 1.0232 | CONTRADICTED |
| RELIANCE | 28-Oct-2024 | bonus | 0.5000 | 1.0069 | CONTRADICTED |
| BSE | 23-May-2025 | bonus | 0.3333 | 1.0111 | CONTRADICTED |

**Decision on adjustments.** Of the testable events, 26 show no price step at the ex-date and 4 are ambiguous. The vendor history is already back-adjusted for these events, so applying the NSE factors would double-count. The few unexplained jumps (BAJFINANCE 2003–2004 and one 2025 stock) cannot be attributed to a corporate action from the records. **No adjustment is applied.** Instead, every split, bonus and face-value ex-date session is excluded from the diagnostics. Dividends were not tested. Dividend ex-dates are not excluded, and the vendor's treatment of dividends is unverified.
