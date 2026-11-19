# NSE F&O bhavcopy: invalid-OHLC diagnostic (2026-11-08)

Written for: the project owner and the research team, to decide whether these rows enter future research.

## Source
- Collection: `web/.research-data/nse-bhavcopy-newhost-2024-06-03-to-2026-11-05-2026-11-08` (603 ZIPs). Read-only; no NSE requests made.
- Outputs (new, processing-only): `web/.research-data/nse-bhavcopy-processing-2026-11-08/`
  - `invalid_ohlc_rows.csv`: all 321 rows, with date, symbol, instrument, expiry, strike, option type, OHLC, volume, open interest and violation.
  - `invalid_ohlc_summary.json`: counts.
  - `header_normalisation.json`: header mapping for the processing layer.

## Definition used
A row is invalid when high is below open, close or low, or when low is above open or close. Rows with open, high and low all zero and close above zero are no-trade placeholders and are excluded from this count (13,423,075 rows; see the verification record).

## Result
- 321 invalid rows of 22,472,487 contract rows (0.0014%).
- Instruments: 318 stock futures (STF), 3 index futures (IDF). **No option rows are affected.**
- Violation categories:
  - Low above close: 230 rows.
  - High below close: 91 rows.
  - High below open or low: 0 rows.
- Dates affected: 241 of 603 sessions. The most affected dates have 3–4 rows each.
- Symbols affected: 143. Most have 1–10 rows. The highest counts are SAIL (10), OBEROIRLTY (8), KAYNES (8), APOLLOTYRE (6), SUNTV (6), SHREECEM (6) and BLUESTARCO (6).

## Magnitude
- Median gap between the close and the violated bound: 0.16% of close.
- 75% of rows are within 0.5% of the bound.
- Largest gap: 10.5%.

## Example (METROPOLIS stock future, session 2024-06-06, expiry 2024-08-29)
Open 2045.55, high 2045.55, low 2000.50, close 1985.15, last price 2000.50, settlement price 1985.15, volume 14, open interest 6,400. The close equals the settlement price and lies below the session low.

## Classification
- **Likely source-definition effect, not corrupted data.** In every example checked, the "close" column equals the settlement price (`SttlmPric`), and the settlement price can sit outside the session's high–low range. This pattern is specific to futures.
- **Not confirmed.** I could not verify NSE's exact definition of the settlement price against an official document from this environment. The classification stands until NSE's bhavcopy specification is checked.
- **No evidence of corrupted or mis-parsed values.** Values parse cleanly, there are no negative prices, and no duplicates.

## Recommendation for research use
1. Keep the rows in the raw collection; do not edit them.
2. Exclude these 321 rows from any research that uses the futures high, low or range (for example range-based or intraday-style analysis).
3. If futures are used only for settlement-based daily analysis, the close may be used, but this must be stated in the protocol and the definition checked first.
4. Options rows are unaffected by this issue.

## Open item
Confirm the NSE bhavcopy definition of `ClsPric` and `SttlmPric` for futures against the official specification before any futures analysis is registered.

## Settlement-definition check (2026-11-08)
- A public web search for NSE's F&O bhavcopy data dictionary did not return an official definition of `ClsPric` or `SttlmPric`. The only documentary hit was an NSE circular dated 2 July 2026 announcing a `.DAT` version of the F&O bhavcopy from 6 July 2026. Its contents were not read, so any column change is unverified.
- Status: **unconfirmed.** The classification above stands. The 321 rows stay excluded from range-based futures research.
- Action: compare the `.DAT` header with the existing columns before the next collection, and read NSE's official specification once it is available.
