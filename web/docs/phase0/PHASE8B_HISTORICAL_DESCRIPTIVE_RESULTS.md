# Phase 8B — historical descriptive analysis (existing dataset only)

**Label: Historical Market-Structure Research — Pilot.** Offline, descriptive. No Upstox requests. No parameter optimisation, no strategy changes, no production claims. Engine NO-GO. Strategy 11.4, the production formulas, the 1% risk limit and the 60-session live requirement are unchanged.

Source: `.research-data/historical-pilot-raw/candles.csv` (4,859 bars, 52 legs). Authoritative reference: `PHASE8_HISTORICAL_RESEARCH_FINDINGS.md`.

## Q1. How do premium and OI differ between CE and PE legs?

| Measure | CE | PE |
|---|---|---|
| Median bar volume | 7,800 | 15,480 |
| Median OI (positive bars only) | 40,800 | 41,580 |
| Zero-OI share of bars | 4.5% | 2.0% |

Observations: PE bars carry about twice the median volume of CE bars. Median positive OI is similar. Zero-OI bars are more frequent on CE legs. Premium levels are not compared across CE and PE, since the legs sit at different moneyness at expiry.

## Q2. How consistent are patterns across the three sampled expiries?

Afternoon (13:15 onward) share of volume, by expiry:

| Index | Latest | Middle | Oldest |
|---|---|---|---|
| NIFTY | 53% | 80% | 90% |
| BANKNIFTY | 55% | 78% | not available |
| FINNIFTY | 62% | 78% | not available |
| MIDCPNIFTY | 53% | 82% | not available |
| SENSEX | 63% | 76% | 92% |
| BANKEX | 71% | 85% | not available |

Observations: the afternoon share is lower on the latest expiries (53% to 71%) and higher on the middle and oldest (76% to 92%). **The index-level range of 63–80% in the findings document averages over expiries and hides this spread.** The pattern is not uniform across expiries.

## Q3. Does afternoon concentration persist across expiry windows?

Persistent in direction (afternoon share above 50% in all 14 expiry windows), but its size changes with the expiry. It is strongest in the oldest and middle windows. Only 3 expiries per index were sampled, so this is a description of those windows, not a trend.

## Q4. How sensitive are OI observations to excluding zero-OI bars?

Last-to-peak OI ratio, with and without zero-OI bars:

| Index | All bars | Positive-only |
|---|---|---|
| NIFTY | 0.66 | 0.66 |
| BANKNIFTY | 0.49 | 0.49 |
| FINNIFTY | 0.72 | 0.72 |
| MIDCPNIFTY | 0.82 | 0.82 |
| SENSEX | 0.74 | 0.74 |
| BANKEX | 0.99 | 0.99 |

Observations: the metric is insensitive to the exclusion. The reason is that the final bar of each leg has positive OI and the peak is always positive. Zero-OI bars still affect other OI measures, such as the share of bars with zero OI, which is reported in the findings document. The OI conclusions in the findings document therefore hold under this exclusion.

## Q5. Which indices have sufficient data quality for further descriptive research?

Legs passing the test: at least 50 bars, and less than 10% zero-OI bars.

| Index | Legs passing | Legs with data | Assessment |
|---|---|---|---|
| NIFTY | 7 | 10 | Usable for most legs. Flag the 2026-11-08 session. |
| BANKNIFTY | 8 | 8 | Passes all legs with data. Oldest expiry missing. |
| FINNIFTY | 7 | 8 | Usable. Thin volume (see findings). |
| MIDCPNIFTY | 8 | 8 | Passes all legs with data. Oldest expiry missing. |
| SENSEX | 5 | 10 | Weakest on OI (2024 legs). Use with care. |
| BANKEX | 7 | 8 | Usable. Thin volume (see findings). |

The test is a screen for descriptive use. It is not a measure of execution quality.

## Corrections to the findings document

1. **Afternoon volume range (§4, item 3):** the 63–80% range is an index average. Per-expiry values range from 53% to 92%.

## Limits

- Three sampled expiries per index, 14-day windows, one contract per leg.
- No bid/ask, depth or execution data.
- Results describe the sampled windows only. They do not establish predictive value or profitability.

## Next step

Phase 8B results feed the Phase 8 findings only as descriptive observations. Any further analysis stays offline. No strategy optimisation and no production validation.
