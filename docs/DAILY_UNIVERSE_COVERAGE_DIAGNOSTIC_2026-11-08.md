# Daily universe coverage diagnostic (2026-11-08)

Diagnostic only. No experiment, no repair, no fill, no change to raw data. Sources: `.research-data/upstox-daily-universe-verified-2026-11-08/` and the master `EQUITY_L.csv`. Per-stock outputs are in `.research-data/daily-universe-diagnostic-2026-11-08/`.

Labels: **[Confirmed]** = measured directly. **[Likely]** = best explanation, not yet tested. **[Unresolved]** = cannot be decided from available data.

## 1. The 2014–2015 cohort (Task 1)

**[Confirmed]**
- 15 stocks have a first bar in 2014–2015. 14 of them first appear on 2015-01-01 (CRESTO on 2015-01-05). INDIGO first trades on its real listing date, 2015-11-10, with no missing sessions.
- The 14 stocks' 2015 bars carry real trading volume (for example SBICARD 393 shares, ELIN 626,359, COHANCE 1.76 million). They are not zero-volume placeholders.
- Missing sessions per stock: median 1,243. The longest missing run for most is one long block, for example ACI 2015-03-17 to 2022-11-18 (1,898 sessions), ELIN 2015-09-28 to 2022-12-29 (1,794), SBICARD 2015-01-30 to 2020-03-13 (1,262).
- For several stocks the long missing run ends a few days before the master's listing date: SBICARD (run ends 2020-03-13, listed 2020-03-16), MAHEPC (ends 2020-02-13, listed 2020-02-14), ASALCBR (ends 2020-02-11, listed 2020-02-12), COHANCE (ends 2020-03-06, listed 2020-03-09).
- Missing runs align with the 3,000-day request-chunk boundaries in only 2 of 759 runs. The chunk boundaries do not explain the gaps.

**[Likely]**
- The bars before the real listing date (for example SBICARD's 2015 bars, when SBI Cards was not yet listed) belong to a different instrument mapped to the same ISIN. This is an ISIN-to-instrument mapping problem in the vendor history, not valid price history for the company. The pattern fits: the missing run starts exactly where the vendor's history for that ISIN goes quiet, and ends just before the real listing.
- The 2015-01-30 start date shared by many runs points to a single vendor-side data drop, not independent company events.

**[Unresolved]**
- Whether the 2015-01-01 bars are a real session or a vendor date-stamp shift. 993 stocks have a bar on that date, against 945 on 2014-12-31 and 995 on 2015-01-02, and the median volume is 58,902. The local holiday table does not cover 2015, so the calendar cannot settle this.
- Whether gaps inside a listed period are genuine no-trade days or vendor omissions. Upstox returns no candle on a day without trades, and exchange trade logs are not available to tell the two apart.

**Treatment:** nothing filled or repaired. Pre-listing bars for these ISINs should be excluded from any analysis, and the stocks should not enter research samples before their verified real listing.

## 2. Historical truncation (Task 2)

**[Confirmed]** Comparing the first real trading bar (volume above zero, on a session date) with the master listing date, across 2,396 non-empty series:

| Relation | Stocks |
|---|---|
| Within 7 days of master listing | 1,682 |
| History starts more than 7 days after listing (truncated) | 416 |
| History starts more than 7 days before listing | 298 |

- Truncation cluster: 333 of the 416 late-starting stocks have their first real bar in 2003. Their master listing dates are earlier, in the 1990s. The 2003-01-01 vendor history start covers 236 stocks, and 2003-01-27 covers 158.
- Later clusters: 2026-08-17 (117 stocks) and 2026-04-20 (83). These need checking against listing dates. They may be new listings or vendor starts.
- Earlier history for listing-after-history cases: 298 stocks have bars well before their master listing (for example SHIVAUM from 2006, listed 2025-11-14). Re-listing or ISIN reuse is the likely cause. **[Likely]**

**Stocks able to satisfy 252 consecutive prior sessions (every calendar session present, with real volume):**

| Reference date | Stocks eligible | of 2,397 |
|---|---|---|
| 2010-01-04 | 369 | 15% |
| 2014-01-01 | 698 | 29% |
| 2018-01-01 | 1,044 | 44% |
| 2022-01-03 | 1,306 | 54% |

Stocks with one day or insufficient history: 163 stocks have more than 5% of expected sessions missing. The 575 stocks with an apparent first bar on 2026-11-05 show only one day of data in the first-bar analysis. The eligible sample is therefore smaller early in the development period, and the exact numbers depend on the reference date.

**Survivorship and selection bias.** The universe is today's listed EQ set, so delisted stocks are absent. Eligibility by history requirement also favours stocks that survived long enough to have 252 sessions, so the sample is biased toward survivors and toward companies with long vendor histories.

## 3. Data integrity and price adjustment (Task 3)

**Dropped bars: 778, all reason "OHLC inconsistent"** [Confirmed]. Their count and the verifier's rule are in `verification.json`. None was repaired.

**Extra non-session bars: 416, of which 57 have zero volume** [Confirmed]. Dates with the most extra bars: 2025-04-26 (56), 2009-10-17 (52), 2010-02-06 (51), 2018-11-07 (32). These are on dates outside the calendar, which is built from the equity series. They are not explained yet. **[Unresolved]**

**Price adjustment, universe-wide** [Confirmed]. The proposal says prices are unadjusted. That is not supported. Testing all 1,202 parsed split and bonus events against the ex-date price step, for universe ISINs:

| Result | Events |
|---|---|
| No step, consistent with back-adjusted history | 194 |
| Clear step matching the factor (unadjusted) | 2 |
| Ambiguous (step exists but does not match the factor) | 165 |
| No bar on the ex-date | 10 |

Most ambiguous events are 2006–2007 bonuses where the observed open-to-previous-close move is 3–10%, not the factor. **[Likely]** These are back-adjusted with noise, or a different vendor treatment. They cannot be confirmed either way. The 50-stock result (26 of 26 back-adjusted) therefore does not generalise to the full universe.

**Flagged 35% moves.** The 35% rule catches large steps that the unadjusted case would produce, but it does not catch bonus steps smaller than 35%. Those are handled by the corporate-action ex-date exclusion, which is correct only if the NSE event dates are right.

## 4. Unresolved questions (summary)

1. Are the 2015-01-01 bars a real session or a date shift? (Needs exchange holiday records for 2015.)
2. Do the pre-listing bars for re-listed or re-ISIN'd companies belong to the same instrument? (Needs the vendor's instrument-ID mapping.)
3. What are the 165 ambiguous adjustment events? (Needs the vendor's adjustment flag or a second price source.)
4. Are the 416 extra non-session bars real trades or vendor artefacts?
5. Are gaps inside listed periods no-trade days or omissions? (Needs trade-level data.)
