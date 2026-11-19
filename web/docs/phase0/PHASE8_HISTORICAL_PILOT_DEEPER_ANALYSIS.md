> **ARCHIVED — superseded.** The current authoritative reference is `PHASE8_HISTORICAL_RESEARCH_FINDINGS.md`. This file is kept as part of the audit trail.

# Phase 8 — historical pilot: deeper descriptive analysis

**Label: Historical Market-Structure Research — Pilot.** Descriptive only. Not profitability, win-rate, expectancy or strategy-validation evidence. No parameters optimised, no formula selected, Strategy 11.4 not modified. Engine NO-GO.

Written for: the project owner, to decide whether the zero-candle follow-up (32 requests) is worth doing. No Upstox requests were made for this analysis. Source: `.research-data/historical-pilot-raw/candles.csv` (4,859 bars, 60 legs, 14-day windows).

## 1. Premium decay

**Important caveat first.** The "ATM" legs were chosen as ATM at expiry, not at window start. Fourteen days earlier those strikes were usually far out of the money. So the last-to-first ratio mostly reflects strike selection and expiry decay together. It is not a decay rate for an at-the-money option.

| Index | ATM legs | Median last/first close | Legs ending at ₹0.05 floor (all legs) | OTM legs at floor |
|---|---|---|---|---|
| NIFTY | 6 | 2.5e-3 | 3 of 6 ATM | 2 of 2 |
| BANKNIFTY | 4 | 4.8e-3 | 1 of 4 ATM | 1 of 2 |
| FINNIFTY | 4 | 7.2e-3 | 1 of 4 ATM | 2 of 2 |
| MIDCPNIFTY | 4 | 8.1e-3 | 2 of 4 ATM | 2 of 2 |
| SENSEX | 6 | 5.0e-3 | 1 of 6 ATM | 2 of 2 |
| BANKEX | 4 | 2.1e-3 | 1 of 4 ATM | 2 of 2 |

Observations:
- OTM legs reach the ₹0.05 floor almost everywhere (11 of 12 OTM legs).
- Exceptions where premium rose: SENSEX 2026-11-05 ATM CE (×3.2) and some ITM legs.
- Premium ratios are not comparable across indices, because strike steps and spot levels differ.

## 2. Volume by index and expiry

| Index | Median bar volume | Afternoon share (≥13:15) | Zero-volume bars |
|---|---|---|---|
| NIFTY | 25,480 | 66.8% | 115 of 1,156 (9.9%) |
| BANKNIFTY | 29,370 | 65.5% | 38 of 1,059 (3.6%) |
| FINNIFTY | 1,200 | 68.4% | 176 of 691 (25.5%) |
| MIDCPNIFTY | 12,360 | 63.1% | 101 of 852 (11.9%) |
| SENSEX | 105,020 | 73.1% | 32 of 516 (6.2%) |
| BANKEX | 360 | 79.9% | 128 of 585 (21.9%) |

Observations:
- Afternoon concentration (13:15 onward) is between 63% and 80% in every index.
- Thin indices (FINNIFTY, BANKEX) have many zero-volume bars, consistent with illiquid strikes.
- Volume levels are in units, not lots, and are not comparable across indices.

## 3. OI build-up and unwinding (zero-OI bars excluded)

Ratio of last OI to peak OI, using only bars with positive OI:

| Index | Legs | Median last/peak |
|---|---|---|
| NIFTY | 10 | 0.66 |
| BANKNIFTY | 8 | 0.49 |
| FINNIFTY | 8 | 0.72 |
| MIDCPNIFTY | 8 | 0.82 |
| SENSEX | 10 | 0.74 |
| BANKEX | 8 | 0.99 |

Observations:
- OI typically falls by a third to a half from its peak into expiry, with BANKNIFTY the strongest unwind (0.49). BANKEX shows almost no unwinding (0.99), possibly because its legs are thin.
- These describe the window only. They do not show whether OI changes predict price.

## 4. Timestamp-aligned ITM, ATM and OTM ordering

Comparisons made only where both legs have a bar at the same timestamp, within the same expiry.

| Index | Comparisons | Ordering violations | Rate |
|---|---|---|---|
| NIFTY | 334 | 16 | 4.8% |
| BANKNIFTY | 513 | 0 | 0.0% |
| FINNIFTY | 323 | 8 | 2.5% |
| MIDCPNIFTY | 389 | 14 | 3.6% |
| SENSEX | 155 | 2 | 1.3% |
| BANKEX | 231 | 7 | 3.0% |

Total: 47 violations of 1,945 comparisons, as previously reported. The rate is highest for NIFTY and lowest for BANKNIFTY. The earlier explanation (last-trade stamping differences) remains a hypothesis. The NIFTY 2026-11-08 timestamps in §5 may account for some NIFTY violations, but this has not been checked leg by leg.

## 5. The 14:45 concentration and the off-grid timestamps

**Off-grid timestamps (correction to the pilot report).** The 18 bars at 14:20, 14:50 and 15:20 are **all** NIFTY 2026-11-09 legs on a single session, 2026-11-08 (the day before expiry). They are not a general stamping pattern across indices or dates. They look like a single-session data anomaly and should be checked before NIFTY 2026-11-09 is used.

**The 14:45 bar.** It appears on 51 distinct dates across all indices, with 394 bars in total. It is a regular feature of the series, not an artefact of the off-grid stamps.
- On expiry-date bars, 14:45 holds 27.5% of volume. Across all bars it holds 25.7%.
- Every leg's final bar on expiry day is at 15:15, so the expiry-day series does end at 15:15.

**Interpretation.** A volume peak in the final 30 minutes of the Indian session is consistent with closing-session activity. It is also consistent with a 14:45 bar that aggregates a longer interval than 30 minutes. The data cannot distinguish these. Checking would need the bar definition from the source, or a 1-minute series for a few sessions (which would need approval).

## 6. Data-quality scorecard

| Index | Legs with data | Empty legs | Zero-OI bars (traded) | Off-grid bars | Ordering violations | Zero-volume bars | Status |
|---|---|---|---|---|---|---|---|
| NIFTY | 10 of 10 | 0 | 11.2% (98) | 18, one session | 4.8% | 9.9% | Usable for descriptive work with the 2026-11-08 session flagged and zero-OI bars excluded |
| BANKNIFTY | 8 of 10 | 2 | 0.0% | 0 | 0.0% | 3.6% | Cleanest index. Oldest expiry missing |
| FINNIFTY | 8 of 10 | 2 | 0.0% | 0 | 2.5% | 25.5% | Thin. Oldest expiry missing |
| MIDCPNIFTY | 8 of 10 | 2 | 0.0% | 0 | 3.6% | 11.9% | Oldest expiry missing |
| SENSEX | 10 of 10 | 0 | 5.0% (15) | 0 | 1.3% | 6.2% | Usable. 2024 OI weak |
| BANKEX | 8 of 10 | 2 | 0.5% (1) | 0 | 3.0% | 21.9% | Thin. Oldest expiry missing |

Overall: 114 zero-OI bars carry volume (98 NIFTY, 15 SENSEX, 1 BANKEX). The total is 159 zero-OI bars.

The scorecard covers the bars that were returned. It does not measure coverage of the full listed history, which remains unknown.

## 7. Corrections to the pilot report

1. **Off-grid timestamps (§5 of the pilot report):** described as a general pattern. Correct statement: all 18 are NIFTY 2026-11-09 legs on 2026-11-08.
2. **14:45 concentration (§3 of the pilot report):** described as possibly a stamping artefact. Correct statement: 14:45 is a regular bar on 51 dates. Its cause is not established (§5 above).

## 8. Recommendation on the 32-request zero-candle follow-up

The follow-up asks why four indices returned no candles for their oldest expiry. Its value is now lower than before, because the core descriptive questions are answered from the existing bars. It is still worth doing if the goal is to decide whether those four oldest expiries can be used at all. It is not needed for the descriptive pilot.

It should be approved only if a decision depends on those oldest expiries. Otherwise the pilot should proceed on the 52 legs with data.

## 9. Governance

- Descriptive only. No parameter optimised. No formula selected.
- Strategy 11.4 not tuned or modified.
- Compromised holdout periods remain excluded.
- 60-session live requirement, production formulas and the 1% risk limit unchanged.
- Engine NO-GO.
