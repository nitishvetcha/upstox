# Development results, five registered protocols (v1.0 + amendment A1)

Scope: development only, 2010-01-04 to 2017-12-31. Validation and holdout were not run or opened. No threshold was changed after seeing results. Runner `web/scripts/crosssectional-daily-dev.py` (hash in `REGISTRY_v1.0.json`). Costs are PROVISIONAL sensitivity scenarios (see the protocols). Results are not evidence of profitability.

## Eligible stock counts (30 June each year, primary Rs 1 crore)

2010: 277 | 2011: 247 | 2012: 224 | 2013: 220 | 2014: 387 | 2015: 375 | 2016: 416 | 2017: 599

The 2010 to 2013 sample is small. This limited early sample is disclosed.

## H1 and H2 (executable hypothetical long-only portfolios, net of costs)

| Run | Rebalances | Net spread mean | t (over rebalances) | Hit rate | Mean null percentile | Skipped dates / names / forced exits / truncated |
|---|---|---|---|---|---|---|
| H1_primary_LOW | 93 | 1.493% | 3.86 | 0.70 | 65.2 | 0 / 0 / 5 / 0 |
| H1_primary_HIGH | 93 | 1.489% | 3.86 | 0.70 | 65.2 | 0 / 0 / 5 / 0 |
| H2_primary_LOW | 394 | -0.004% | -0.05 | 0.47 | 48.3 | 0 / 0 / 4 / 0 |
| H2_primary_HIGH | 394 | -0.004% | -0.05 | 0.47 | 48.3 | 0 / 0 / 4 / 0 |
| H1_sens_50L_HIGH | 93 | 1.578% | 4.45 | 0.72 | 67.7 | 0 / 1 / 6 / 0 |
| H1_sens_2Cr_HIGH | 93 | 1.249% | 3.20 | 0.63 | 62.8 | 0 / 0 / 3 / 0 |
| H2_sens_50L_HIGH | 394 | 0.026% | 0.29 | 0.48 | 48.3 | 0 / 1 / 7 / 0 |
| H2_sens_2Cr_HIGH | 394 | 0.038% | 0.40 | 0.49 | 49.3 | 0 / 0 / 3 / 0 |

Primary portfolio results (Rs 1 crore): H1 net portfolio mean 2.38% per 21-session rebalance (LOW) and 2.07% (HIGH); cumulative net 569% (LOW) and 404% (HIGH); maximum drawdown -27% (LOW) and -31% (HIGH). H2 net portfolio mean -0.16% per 5-session rebalance (LOW) and -0.46% (HIGH); cumulative -62% (LOW) and -89% (HIGH).

## H3, H4 and H5 (predictive comparisons, gross, NOT executable)

| Comparison | Primary (Rs 1 crore) | Rs 50 lakh | Rs 2 crore |
|---|---|---|---|
| H3 breadth HIGH (days) | 1.23% (1,194) | 1.34% (1,184) | 1.06% (1,194) |
| H3 breadth LOW (days) | 1.64% (759) | 1.77% (769) | 1.47% (759) |
| H4 volatility HIGH (days) | 0.85% (802) | 0.97% (802) | 0.69% (802) |
| H4 volatility LOW (days) | 1.76% (1,151) | 1.88% (1,151) | 1.59% (1,151) |
| H5 liquidity Q5 minus Q1 (days) | -1.07% (1,953) | -1.01% (1,953) | -0.71% (1,953) |

## Critical finding: probable data artefact (must be resolved before any further step)

- Development-window close-to-close moves above 20%: **1,436** of 1.92 million bar pairs. Most come from illiquid stocks, including VINEETLAB, which shows repeated moves of 100% to 177% (for example 2016-07-01 +177%, 2016-06-28 +172%), and KHADIM, PREMIERPOL and TIL.
- Momentum (H1) selects stocks with the largest recent returns. These artefacts would therefore enter the top decile and inflate the spread. H1's high result and its large t-statistic are **probably contaminated** by such moves. I have not yet confirmed how many H1 positions contain them.
- H5's negative spread (less liquid stocks outperform) is consistent with the same contamination, since illiquid stocks carry the artefacts.
- Survivorship bias (today's listed set) also inflates long-only results.

## Failures and gaps reported

- No dates skipped in H1 or H2 at the primary threshold. A few names were skipped at the Rs 50 lakh threshold (1 name).
- Forced exits (no valid bar at scheduled exit): 3 to 7 per run.
- No trades truncated at the development end.
- The H2 null percentile averages 48 to 49, so H2 is indistinguishable from random portfolios.
- H1's null percentile averages 63 to 68, below the 97.5 threshold that the validation rule would require.

## Recommendation

Do not proceed to validation. First, decide on a pre-registered price-artefact rule (protocol amendment A2, before any further run). Options to propose: exclude any stock-day with an absolute close-to-close move above a fixed threshold unless confirmed by a second source; or exclude stocks with fewer than a fixed number of valid trading days in the last 60 sessions. Any such rule must be fixed before it is applied, and the development run must be repeated under it. Results under the current rules must be reported as contaminated, not used for selection.
