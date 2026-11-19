> **ARCHIVED — superseded.** The current authoritative reference is `PHASE8_HISTORICAL_RESEARCH_FINDINGS.md`. This file is kept as part of the audit trail.

# Phase 8 — historical pilot research report (revised with actual candle values)

**Label: Historical Market-Structure Research — Pilot.** Not profitability, win-rate, expectancy or strategy-validation evidence. Descriptive only. No parameters optimised, no formula selected, Strategy 11.4 not modified. Engine NO-GO.

Written for: the project owner, to read the pilot results and decide what further data, if any, is needed.

## 0. Acquisition and integrity

- **Calls:** 60 of 60 used. All returned HTTP 200. No retries, no stops. Discovery calls: none.
- **Bars:** 4,859 bars saved to `.research-data/historical-pilot-raw/candles.csv` (OHLC, volume, OI, request sequence, retrieval time). Metadata log: `docs/phase0/historical-pilot-acquisition-log.json`. The probe evidence (`historical-coverage-probe.json`) is unchanged.
- **Bar counts match the probe exactly** for all 60 legs.
- **Eight legs returned empty on re-request** (BANKNIFTY, FINNIFTY, MIDCPNIFTY and BANKEX oldest-expiry ATM CE and PE). They are recorded as empty, not filled. The emptiness is confirmed, but its cause is not.
- **OHLC consistency:** 0 bars violate high ≥ open, close ≥ low, etc.
- **Volume:** no negative values. 590 bars have volume 0.
- **OI:** present on every bar. 159 bars have OI 0. 4,700 have OI above 0.

Coverage: 14 days per leg, 30-minute bars, 52 legs with data across six indices and three expiries each. Not a full history.

## 1. Six-index comparison

| Index | Legs with data | Legs empty | Bars | Premium range (all legs, close) | Total volume | Notes |
|---|---|---|---|---|---|---|
| NIFTY | 10 | 0 | 1,156 | 0.05 to 2,400 | 12.8 bn | 2024 expiry: ATM CE OI 93 of 128 bars zero |
| BANKNIFTY | 8 | 2 | 1,059 | 0.05 to 2,506.7 | 1.0 bn | Oldest expiry empty |
| FINNIFTY | 8 | 2 | 691 | 0.05 to 908 | 0.06 bn | Oldest expiry empty |
| MIDCPNIFTY | 8 | 2 | 852 | 0.05 to 650 | 0.29 bn | Oldest expiry empty |
| SENSEX | 10 | 0 | 516 | 0.05 to 5,940 | 3.7 bn | 2024 expiry: lowest bar counts (31, 39) |
| BANKEX | 8 | 2 | 585 | 0.05 to 1,895.7 | 0.06 bn | Oldest expiry empty |

Volume totals are summed across all bars and are large because raw volume is in units, not lots. Compare within an index rather than across them.

## 2. Premium movement by index, expiry and strike

The full per-leg table is in §9. Key patterns:

- **Expiry decay is the dominant pattern.** Most OTM legs and many ATM legs close at or near the 0.05 tick floor on expiry day. Examples: NIFTY 2026-11-09 ATM CE (1.2 at window start, 0.05 at end), NIFTY 2026-11-09 OTM CE (2.5 to 0.05), BANKNIFTY 2026-10-27 OTM CE (1,434.85 to 0.05).
- **Some legs rise into expiry.** ITM legs and some ATM puts rise: NIFTY 2026-11-09 ITM CE (2.35 to 144.35), BANKNIFTY 2026-10-27 ITM PE (264.55 to 325), SENSEX 2026-11-05 ITM CE (3.75 to 309.95).
- **Premium levels are not comparable across indices.** Strike spacing, lot size and spot level differ (see the strike step column in §9).

These are observations of the 14-day window, not forecasts or tradable signals.

## 3. Volume distribution and patterns

- **Intraday concentration:** volume is heavily concentrated late in the session. The 14:45 bar holds 25.7% of all volume. Bars from 13:15 onward hold about 68%. Morning bars (09:15 to 11:15) hold about 19%.
- **Time-of-day distribution (share of total volume):** 09:15 4.8%, 09:45 3.3%, 10:15 3.4%, 10:45 2.9%, 11:15 4.6%, 11:45 3.8%, 12:15 4.2%, 12:45 5.0%, 13:15 6.7%, 13:45 9.3%, 14:15 11.9%, 14:45 25.7%, 15:15 12.5%.
- **Interpretation caution:** 14:45 is a regular bar on 51 dates, so it is not an artefact of the off-grid stamps. Whether it reflects closing-session activity or a longer bar interval cannot be determined from these data (see the deeper analysis, §5).
- **Volume by expiry:** the latest expiries have the most bars. Oldest-expiry volume varies: NIFTY and SENSEX 2024 legs carry large volume, while the four empty legs have none.
- **Zero-volume bars:** 590 in total. Of these, 545 have OI above 0. Zero volume with positive OI is normal when a contract is open but not traded in that interval.

## 4. OI build-up and unwinding

- **Peak timing:** peak OI time varies by leg (§9). Most peaks fall between late morning and mid-afternoon, and a few occur on the day before expiry.
- **Unwinding into expiry:** on many legs OI falls after the peak. The last-to-peak ratio ranges from 11% (BANKEX 2026-10-29 ITM CE) to 100%, but 100% often means the peak is the final bar (see §9).
- **Put-call differences:** several ITM PE legs unwind more than ATM PE legs on the same expiry (for example BANKNIFTY 2026-10-27 ITM PE 21% vs ATM PE 44%).
- **OI at window start is often very low or zero** on OTM and ITM legs (for example SENSEX 2026-11-05 OTM PE and BANKEX 2026-10-29 OTM PE start at 0). This may reflect listing timing, not market activity. It is not confirmed.

These are descriptive observations. They do not show whether OI changes predict price.

## 5. Missing-bar analysis

- **Expected bars:** a 14-day window with about 10 sessions gives about 130 bars at 30-minute intervals. Many legs reach 120 to 146 bars. Others fall well short.
- **Missing-bar estimate:** counting 13 bars per observed session day, about **393 bars are missing** across all legs. This is a lower bound, because a day with no bars at all is not counted.
- **Largest gaps (sessions-based):** BANKEX 2026-10-29 ITM CE (7 days, 55 bars, about 36 missing), MIDCPNIFTY 2026-05-26 ATM PE (7 days, 59 bars, about 32 missing), NIFTY 2026-11-09 ATM PE (6 days, 53 bars, about 25 missing).
- **Off-grid timestamps:** bars start at 09:15, 09:45, 10:15, ..., 15:15 as expected, but 18 bars start at 14:20, 14:50 or 15:20. All 18 are NIFTY 2026-11-09 legs on a single session, 2026-11-08. This is a single-session anomaly, not a general stamping pattern (see the deeper analysis).
- **Gap-length metric not used:** consecutive-bar gaps include overnight and weekend breaks, so raw gap lengths overstate missing data and are not reported here. The session-based estimate above is the only missing-data measure used.

Missing bars are most likely no-trade intervals on illiquid legs. That cannot be confirmed without bid/ask data.

## 6. Zero-OI investigation

- **Count:** 159 zero-OI bars in total.
- **Concentration:** 93 of them are NIFTY 2024-10-03 ATM CE (73% of its 128 bars). Other concentrations: SENSEX 2024-10-04 ATM CE (19), NIFTY 2024-10-03 ATM PE (16), NIFTY 2026-11-09 OTM PE (11), NIFTY 2026-11-09 ITM PE (8).
- **Zero OI with trading volume:** 114 bars have OI 0 but volume above 0. In standard derivatives markets, traded contracts normally have positive open interest. This pattern is therefore a probable **data artefact**, not a genuine absence of open interest. This is an inference from market structure, not from a confirmed Upstox specification.
- **Zero OI with zero volume:** 45 bars. These are consistent with a contract that is open but not traded in the interval, or with no activity at all. Also not confirmed.
- **Pattern by period:** the 2024 expiries have most of the zero-OI bars. The 2026 expiries have very few.

**Conclusion for research use:** zero OI should be treated as **unknown**, not as genuine zero, especially on 2024 contracts. OI-based conclusions should exclude those bars or be run with and without them.

## 7. ATM, ITM and OTM price comparisons

Within an expiry, at timestamps where both legs have a bar:

- **Ordering check:** 1,945 comparisons. **47 violate expected ordering** (26 CE, 21 PE, about 2.4%). Expected ordering: ITM CE ≥ ATM CE ≥ OTM CE, and ITM PE ≥ ATM PE ≥ OTM PE.
- **Interpretation:** the violations are most likely due to bars being stamped at different last-trade times for different strikes, not to real market moves. They are a data-quality limit. Comparisons across legs at the same timestamp are therefore approximate.
- **Example at expiry:** NIFTY 2026-11-09 ITM CE closes at 144.35 while OTM CE closes at 0.05 (§9).

These are descriptive. No pricing model was applied, and no implied volatility or Greeks are reported.

## 8. Data-quality limitations and exclusions

1. **Eight legs empty** (oldest-expiry ATM CE and PE for four indices). Confirmed on re-request. Cause unknown.
2. **Zero OI on 159 bars**, including 114 with traded volume (§6). Treated as unknown.
3. **Off-grid bar timestamps** (14:20, 14:50, 15:20) and ordering violations across strikes (§5, §7).
4. **Missing bars:** about 393 by session-based estimate, a lower bound (§5).
5. **Single contract per leg:** one strike and one expiry per position. Results do not generalise.
6. **14-day window:** not a full history.
7. **Underlying identity:** not independently verified (only the strike-grid check).
8. **Bid/ask, depth and execution cost:** not available in these candles. Nothing here supports execution-cost or fill conclusions.

**Exclusions for any downstream analysis:** the eight empty legs; the 159 zero-OI bars (or all OI-based analysis run separately with and without them); bars with off-grid timestamps if timing analysis is attempted.

## 9. Appendix: per-leg premium, volume and OI

All values from the raw candle file. "First close" is the window start, "last close" the window end (expiry day). "OI peak" shows the time of the peak. "Last/peak OI" is the ratio of final OI to peak OI.

| Index | Expiry | Leg | Strike | Bars | First close | Last close | Min | Max | Total volume | OI first | OI peak (time) | OI last | Last/peak OI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| NIFTY | 2026-11-09 | ATM_CE | 25050 | 124 | 1.2 | 0.05 | 0.05 | 178.55 | 1,58,16,21,535 | 585 | 1,79,11,010 (11-09T14:15) | 1,43,79,950 | 80% |
| NIFTY | 2026-11-09 | ATM_PE | 25050 | 53 | 2,129.05 | 5.3 | 5.3 | 2,170 | 53,09,20,195 | 0 | 73,11,395 (11-09T14:45) | 72,42,105 | 99% |
| NIFTY | 2026-11-09 | ITM_CE | 24900 | 146 | 2.35 | 144.35 | 0.9 | 270.9 | 1,51,01,33,430 | 10,595 | 2,28,85,720 (11-09T13:15) | 38,24,795 | 17% |
| NIFTY | 2026-11-09 | OTM_CE | 25200 | 146 | 2.5 | 0.05 | 0.05 | 108.5 | 1,42,36,31,690 | 11,440 | 1,96,01,010 (11-09T11:45) | 73,88,940 | 38% |
| NIFTY | 2026-11-09 | ITM_PE | 25200 | 103 | 2,400 | 154.95 | 154.95 | 2,400 | 6,84,09,315 | 0 | 12,29,280 (11-09T14:15) | 4,26,010 | 35% |
| NIFTY | 2026-11-09 | OTM_PE | 24900 | 67 | 1,285 | 0.05 | 0.05 | 1,285 | 2,01,20,02,460 | 0 | 2,95,38,795 (11-09T13:45) | 1,46,27,015 | 50% |
| NIFTY | 2026-05-12 | ATM_CE | 23400 | 129 | 856 | 0.05 | 0.05 | 1,084.7 | 84,50,23,205 | 1,950 | 3,43,91,110 (05-12T14:45) | 2,47,56,940 | 72% |
| NIFTY | 2026-05-12 | ATM_PE | 23400 | 130 | 94.1 | 20.3 | 2.6 | 162.35 | 2,28,99,67,160 | 75,790 | 4,11,14,840 (05-12T14:15) | 1,15,06,365 | 28% |
| NIFTY | 2024-10-03 | ATM_CE | 25250 | 128 | 505 | 0.15 | 0.15 | 1,051.15 | 96,16,75,700 | 6,375 | 2,74,18,925 (10-03T14:45) | 2,18,07,375 | 80% |
| NIFTY | 2024-10-03 | ATM_PE | 25250 | 130 | 95 | 0.05 | 0.05 | 145.94 | 1,60,83,98,675 | 43,000 | 3,90,16,900 (10-03T14:45) | 2,55,68,075 | 66% |
| BANKNIFTY | 2026-10-27 | ATM_CE | 54000 | 130 | 1,686 | 0.1 | 0.1 | 2,224 | 6,87,60,840 | 2,33,190 | 19,75,530 (10-27T14:15) | 14,80,860 | 75% |
| BANKNIFTY | 2026-10-27 | ATM_PE | 54000 | 130 | 210 | 25 | 15.25 | 304.95 | 21,74,16,930 | 7,10,790 | 27,27,690 (10-27T14:15) | 11,97,630 | 44% |
| BANKNIFTY | 2026-10-27 | ITM_CE | 53700 | 123 | 1,929.2 | 275.05 | 275.05 | 2,506.7 | 23,99,880 | 19,860 | 1,21,740 (10-26T09:15) | 45,270 | 37% |
| BANKNIFTY | 2026-10-27 | OTM_CE | 54300 | 130 | 1,434.85 | 0.05 | 0.05 | 1,950.4 | 11,70,70,590 | 55,860 | 25,00,350 (10-27T13:45) | 17,19,570 | 69% |
| BANKNIFTY | 2026-10-27 | ITM_PE | 54300 | 130 | 264.55 | 325 | 57.85 | 448.4 | 8,70,62,880 | 76,170 | 16,02,090 (10-27T12:15) | 3,32,610 | 21% |
| BANKNIFTY | 2026-10-27 | OTM_PE | 53700 | 130 | 165.05 | 0.15 | 0.15 | 199.4 | 5,18,07,450 | 66,360 | 7,77,090 (10-27T13:45) | 3,07,020 | 40% |
| BANKNIFTY | 2026-05-26 | ATM_CE | 55100 | 143 | 564.45 | 0.05 | 0.05 | 610.35 | 24,95,99,850 | 71,820 | 47,55,900 (05-26T14:45) | 26,71,020 | 56% |
| BANKNIFTY | 2026-05-26 | ATM_PE | 55100 | 143 | 1,438.95 | 6.9 | 6.9 | 2,255.1 | 23,12,18,430 | 51,120 | 34,27,890 (05-26T14:45) | 16,93,530 | 49% |
| FINNIFTY | 2026-10-27 | ATM_CE | 24300 | 59 | 514.45 | 3.7 | 3.7 | 530 | 53,68,200 | 1,260 | 1,83,900 (10-27T14:15) | 1,50,420 | 82% |
| FINNIFTY | 2026-10-27 | ATM_PE | 24300 | 130 | 87.25 | 0.05 | 0.05 | 170.3 | 1,49,90,880 | 10,980 | 3,33,000 (10-27T15:15) | 3,33,000 | 100% |
| FINNIFTY | 2026-10-27 | ITM_CE | 24150 | 48 | 839.2 | 153.4 | 150.75 | 839.2 | 72,660 | 900 | 4,560 (10-27T15:15) | 4,560 | 100% |
| FINNIFTY | 2026-10-27 | OTM_CE | 24450 | 54 | 383.6 | 0.05 | 0.05 | 383.6 | 76,69,920 | 720 | 2,16,900 (10-27T14:45) | 1,11,360 | 51% |
| FINNIFTY | 2026-10-27 | ITM_PE | 24450 | 117 | 174.4 | 146.75 | 30.4 | 253.35 | 37,78,440 | 1,500 | 79,920 (10-27T11:45) | 25,080 | 31% |
| FINNIFTY | 2026-10-27 | OTM_PE | 24150 | 108 | 77.75 | 0.05 | 0.05 | 112.25 | 30,23,160 | 2,040 | 77,760 (10-27T13:45) | 47,400 | 61% |
| FINNIFTY | 2026-05-26 | ATM_CE | 25950 | 120 | 189.8 | 0.2 | 0.2 | 299.25 | 1,02,75,780 | 1,260 | 2,69,460 (05-26T14:45) | 1,71,840 | 64% |
| FINNIFTY | 2026-05-26 | ATM_PE | 25950 | 55 | 908 | 17.5 | 15.9 | 908 | 1,26,99,540 | 1,200 | 1,60,260 (05-26T13:15) | 1,14,780 | 72% |
| MIDCPNIFTY | 2026-10-27 | ATM_CE | 13225 | 71 | 415.1 | 0.05 | 0.05 | 415.1 | 2,73,36,000 | 840 | 4,09,920 (10-27T13:45) | 3,57,360 | 87% |
| MIDCPNIFTY | 2026-10-27 | ATM_PE | 13225 | 128 | 73.6 | 4.9 | 4.9 | 310.35 | 3,08,29,080 | 3,240 | 4,26,240 (10-27T13:15) | 3,69,960 | 87% |
| MIDCPNIFTY | 2026-10-27 | ITM_CE | 13150 | 62 | 336.7 | 69.85 | 39.65 | 336.7 | 1,13,32,440 | 240 | 2,07,120 (10-26T11:15) | 44,160 | 21% |
| MIDCPNIFTY | 2026-10-27 | OTM_CE | 13300 | 129 | 450 | 0.05 | 0.05 | 570 | 7,00,10,040 | 15,000 | 12,13,080 (10-27T13:45) | 9,91,080 | 82% |
| MIDCPNIFTY | 2026-10-27 | ITM_PE | 13300 | 130 | 63.45 | 79.75 | 30.25 | 367 | 2,67,16,680 | 2,82,840 | 5,32,320 (10-27T12:45) | 2,66,880 | 50% |
| MIDCPNIFTY | 2026-10-27 | OTM_PE | 13150 | 130 | 50 | 0.05 | 0.05 | 239 | 2,65,56,240 | 3,240 | 7,38,840 (10-27T11:45) | 2,56,680 | 35% |
| MIDCPNIFTY | 2026-05-26 | ATM_CE | 14675 | 143 | 80.55 | 0.65 | 0.65 | 85.25 | 7,29,11,400 | 11,400 | 16,60,800 (05-26T14:45) | 12,41,640 | 75% |
| MIDCPNIFTY | 2026-05-26 | ATM_PE | 14675 | 59 | 650 | 0.05 | 0.05 | 650 | 2,50,07,400 | 4,080 | 11,86,680 (05-26T15:15) | 11,86,680 | 100% |
| SENSEX | 2026-11-05 | ATM_CE | 79300 | 65 | 3.1 | 9.95 | 2.4 | 219 | 33,50,53,220 | 300 | 47,02,840 (11-05T12:45) | 34,96,060 | 74% |
| SENSEX | 2026-11-05 | ATM_PE | 79300 | 14 | 1,969.55 | 0.05 | 0.05 | 1,969.55 | 23,60,76,820 | 600 | 52,33,840 (11-05T15:15) | 52,33,840 | 100% |
| SENSEX | 2026-11-05 | ITM_CE | 79000 | 91 | 3.75 | 309.95 | 2.65 | 464.85 | 39,27,95,280 | 800 | 88,96,140 (11-05T12:15) | 17,10,360 | 19% |
| SENSEX | 2026-11-05 | OTM_CE | 79600 | 63 | 2.6 | 0.05 | 0.05 | 85.75 | 32,53,47,040 | 140 | 44,95,860 (11-05T14:15) | 25,64,280 | 57% |
| SENSEX | 2026-11-05 | ITM_PE | 79600 | 13 | 830.2 | 290 | 219.65 | 969.65 | 2,54,92,900 | 5,720 | 5,84,580 (11-05T14:45) | 2,86,700 | 49% |
| SENSEX | 2026-11-05 | OTM_PE | 79000 | 49 | 5,940 | 0.05 | 0.05 | 5,940 | 36,64,71,060 | 0 | 81,15,680 (11-05T13:45) | 43,88,140 | 54% |
| SENSEX | 2026-05-14 | ATM_CE | 75400 | 50 | 1,170 | 0.7 | 0.7 | 1,377 | 62,37,43,460 | 20 | 1,20,13,860 (05-14T14:45) | 96,01,460 | 80% |
| SENSEX | 2026-05-14 | ATM_PE | 75400 | 101 | 262 | 1.3 | 1.3 | 1,163.05 | 61,35,87,140 | 60 | 95,53,200 (05-14T14:45) | 52,34,120 | 55% |
| SENSEX | 2024-10-04 | ATM_CE | 81700 | 31 | 2,909.75 | 0.15 | 0.15 | 2,909.75 | 32,23,08,480 | 0 | 61,40,305 (10-04T15:15) | 61,40,305 | 100% |
| SENSEX | 2024-10-04 | ATM_PE | 81700 | 39 | 22.4 | 10.9 | 7 | 114.15 | 41,56,96,820 | 0 | 58,70,680 (10-04T15:15) | 58,70,680 | 100% |
| BANKEX | 2026-10-29 | ATM_CE | 61700 | 74 | 826.1 | 18.35 | 18.35 | 826.1 | 59,53,110 | 420 | 1,00,170 (10-29T13:45) | 83,070 | 83% |
| BANKEX | 2026-10-29 | ATM_PE | 61700 | 62 | 425.5 | 0.05 | 0.05 | 983.9 | 25,58,400 | 60 | 2,60,220 (10-29T15:15) | 2,60,220 | 100% |
| BANKEX | 2026-10-29 | ITM_CE | 61400 | 55 | 964.5 | 317.45 | 93 | 964.5 | 35,15,880 | 240 | 89,130 (10-29T13:15) | 9,870 | 11% |
| BANKEX | 2026-10-29 | OTM_CE | 62000 | 113 | 1,041.65 | 0.05 | 0.05 | 1,340.5 | 94,44,960 | 1,530 | 1,83,660 (10-29T14:15) | 1,33,950 | 73% |
| BANKEX | 2026-10-29 | ITM_PE | 62000 | 115 | 480.8 | 280.55 | 280.55 | 1,166.75 | 1,17,240 | 2,190 | 8,970 (10-29T14:45) | 8,850 | 99% |
| BANKEX | 2026-10-29 | OTM_PE | 61400 | 57 | 601.95 | 0.05 | 0.05 | 765.2 | 33,66,750 | 0 | 1,28,370 (10-29T15:15) | 1,28,370 | 100% |
| BANKEX | 2026-05-27 | ATM_CE | 61800 | 61 | 696.4 | 1.25 | 1 | 842.9 | 2,02,87,050 | 210 | 10,17,240 (05-27T14:45) | 9,21,570 | 91% |
| BANKEX | 2026-05-27 | ATM_PE | 61800 | 48 | 1,369.5 | 2.9 | 2.9 | 1,895.7 | 1,73,28,180 | 240 | 4,16,970 (05-27T15:15) | 4,16,970 | 100% |

The eight empty legs are not in this table. They are the BANKNIFTY, FINNIFTY, MIDCPNIFTY and BANKEX oldest-expiry ATM CE and PE legs (2024-10-01 and 2024-09-30), each with 0 bars.

## 10. Governance

- Strategy 11.4 is not tuned or modified by this report.
- No alternative strategy is selected or validated here.
- The compromised holdout periods remain excluded from any validation.
- The 60-session live requirement is unchanged.
- Production formulas and the 1% risk limit are unchanged.
- Engine remains NO-GO.

## 11. Questions still open

**Answerable with the raw bars now on disk, descriptively:** premium paths by leg, volume profiles, OI build-up and unwinding, and cross-index comparison of the same patterns.

**Needs new historical data (separate approval):**
- Cause of the eight empty legs (32-request zero-candle follow-up).
- Whether the zero-OI bars on traded contracts are a data artefact (needs a comparison against a known-liquid contract in the same period).
- Whether longer history exists beyond 14 days per contract.

**Needs live data:** bid/ask spread, quoted depth, realistic fills and slippage, liquidity at a given order size, execution cost, and live quote freshness.
