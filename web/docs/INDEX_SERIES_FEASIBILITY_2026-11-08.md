# Index daily series: feasibility check (2026-11-08)

Written for: the research team. This is a data-integrity check on stored daily index series. It is **not** a strategy test and does not authorise any backtest.

## Source and method
- Read-only. Stored data only; no Upstox or NSE requests were made.
- Series: `web/.research-data/upstox-clean-2026-11-06-v1/` (cleaned daily series, one file per index). Each file's `summary` gives the raw chunk count, unique bars, duplicates and the cleaned SHA-256.
- Checks made in this session on the bars themselves: duplicate calendar days, flat bars (open = high = low = close), OHLC consistency, non-zero volume, and comparison of bar dates with the verified NSE equity calendar (`upstox-daily-universe-verified-2026-11-08/calendar.json`).
- Raw origin: Upstox daily candle chunks (`upstox-raw-2026-11-06-v1/1d/`).

## Per-series results

| Index | Instrument key | Summary: first–last session | Bars | Duplicate calendar days | Flat (O=H=L=C) bars | Bars on non-calendar days | Calendar days missing | OHLC violations | Non-zero volume | Cleaned SHA-256 (prefix) |
|---|---|---|---|---|---|---|---|---|---|---|
| NIFTY | NSE_INDEX\|Nifty 50 | 2000-01-03 – 2026-11-05 | 6,675 | 0 | 0 | 46 | 0 | 0 | 0 | `6fb52221` |
| BANKNIFTY | NSE_INDEX\|Nifty Bank | 2000-01-01 – 2026-11-05 | 6,666 | 4 | 1,369 | 47 | 14 | 0 | 0 | `ff314024` |
| FINNIFTY | NSE_INDEX\|Nifty Fin Service | 2004-01-01 – 2026-11-05 | 5,675 | 4 | 2,032 | 43 | 1 | 0 | 0 | `04423b6c` |
| MIDCPNIFTY | NSE_INDEX\|NIFTY MID SELECT | 2022-01-10 – 2026-11-05 | 1,196 | 0 | 0 | 0 | 0 | 0 | 0 | `08411458` |
| SENSEX | BSE_INDEX\|SENSEX | 2000-01-03 – 2026-11-05 | 6,675 | 0 | 0 | 46 | 0 | 0 | 0 | `da30157a` |
| BANKEX | BSE_INDEX\|BANKEX | 2002-01-01 – 2026-11-05 | 6,178 | 1 | 370 | 46 | 0 | 0 | 0 | `4d1f532e` |

Notes on the columns:
- "Non-calendar days" are bar dates that are not in the NSE equity calendar. For SENSEX and BANKEX the correct calendar is BSE's, which was not available, so those counts are not conclusive. For NIFTY the same dates appear, so they are most likely special sessions (for example Muhurat trading) missing from the equity calendar. Not confirmed.
- Index volume is zero on every bar, in every series. Volume cannot be used as a liquidity measure for these indices.

## Flat bars are placeholder-like, and must be excluded
Flat bars are concentrated in whole years:
- **BANKNIFTY:** every bar in 2000–2004 is flat; 110 of 251 bars in 2005 are flat; one flat bar in 2015. The first bar (2000-01-01) is 1000 on all four prices.
- **FINNIFTY:** every bar in 2004–2011 is flat; 39 of 251 in 2012; one in 2015.
- **BANKEX:** every bar in 2002 is flat; 118 of 254 in 2003; one in 2015.

A market index does not stay at one price for a full year with zero volume. These bars are treated as **unusable placeholders**, not as market data. This is an inference from the pattern; the upstream cause was not confirmed.

## Duplicate days
- BANKNIFTY: 2015-06-29, 2015-07-02, 2015-08-10, 2015-11-11 each have two bars.
- FINNIFTY: the same four dates.
- BANKEX: 2015-11-09.
The summary reports zero conflicting duplicates, so the two bars on each day differ only by timestamp. Which one is correct was not determined. Do not use these days until resolved.

## Usable start dates (conservative)
Based only on the flat-bar pattern and the duplicate check:

| Index | Use from (conservative) | Reason |
|---|---|---|
| NIFTY | 2000-01-03 | No flat bars, no violations. |
| SENSEX | 2000-01-03 | No flat bars, no violations. Calendar check needs BSE sessions. |
| BANKNIFTY | 2006-01-02 | Flat through 2005. Four duplicate days in 2015 to resolve. |
| FINNIFTY | 2013-01-01 | Flat through 2012. Four duplicate days in 2015 to resolve. |
| BANKEX | 2004-01-01 | Flat through 2003. One duplicate day in 2015 to resolve. |
| MIDCPNIFTY | 2022-01-10 | Series starts then; no earlier data exists in the stored set. |

The 2015 flat bars and duplicate days need to be resolved before those index series are used across 2015.

## Conclusion
- **Usable as stored, with the caveats above:** NIFTY and SENSEX (2000 onward); BANKNIFTY, FINNIFTY and BANKEX from the conservative dates above; MIDCPNIFTY only from 2022.
- **Not usable as stored:** any flat or placeholder bar, and the duplicate days listed above.
- **Not established by this check:** whether each series is point-in-time; whether non-calendar dates are real sessions; BSE calendar alignment for SENSEX and BANKEX.
- **Not a strategy result.** This report does not test any trend or momentum rule.
