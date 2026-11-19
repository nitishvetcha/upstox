# Strategy candidate comparison (2026-11-09)

Written for: the research team. Classifications: REJECTED, INSUFFICIENT EVIDENCE, DATA BLOCKED, RESEARCH CANDIDATE, READY TO PROPOSE FOR VALIDATION. VERIFIED is not used; it requires completed independent validation, which has not occurred for any candidate.

Ranking is by evidence quality and feasibility, not by theoretical return.

## 1. Comparison table

| Rank | Candidate | Evidence quality | Data availability | Indian-market relevance | Main risks | Replication feasibility | Classification | Priority |
|---|---|---|---|---|---|---|---|---|
| 1 | Cross-sectional momentum (6/12 m, cost-aware) | Moderate as hypothesis: several Indian studies report profit, some after costs (snippets only) | Daily prices held; **no point-in-time membership** | High (multiple Indian samples) | Survivorship; crash risk; turnover costs; concentration in few names | **Not faithful** without PIT membership | **DATA BLOCKED** | Highest interest; cannot be tested faithfully now |
| 2 | Index time-series momentum (NIFTY, SENSEX) | Low for India (Singh et al. abstract, stock-level); strong US/multi-asset base (JFE 2012, not read in full) | Index daily series held from 2000; placeholder years excluded | Moderate (index-level Indian test has not been published in what was found) | Index vs tradable instrument; futures roll; regime sensitivity | **Testable** at index level with exclusions | **RESEARCH CANDIDATE** (testable; evidence thin) | Best testable-now option |
| 3 | Covered calls on NSE stocks / Nifty | Low to moderate: C1–C3 positive in old samples; snippets | Stock prices held; call prices only from 2024-06 (no bid/ask) | Moderate (Indian sources exist) | Upside cap; assignment and dividend treatment; fill assumptions | Not faithful pre-2024; a 2024-onward daily-print test is an upper bound | **DATA BLOCKED** | Second priority after data is resolved |
| 4 | Bull call debit spread (index) | Low: one Nifty spread study 2007–2018 (secondary, index points) | Index levels held; option prints from 2024-06, no bid/ask | Moderate | Fills; premium decay; short window | **No** faithful test | **DATA BLOCKED** | Low |
| 5 | Bear put debit spread (index) | Low, unfavourable in the one Indian study found (B3) | As above | Moderate | As above | **No** | **INSUFFICIENT EVIDENCE** (unfavourable reading; not rejected outright) | Low |
| 6 | Calendar / diagonal spreads (index; Slivka-type) | Low to moderate: B1 out-of-sample reported as starting point (abstract) | Option prices 2015–2019 not held; 2024-06 onward prints only | Moderate (Indian, peer-reviewed-style) | Expiry alignment; vol term structure; fills | **No** for pre-2024 | **DATA BLOCKED** | Low–moderate; revisit with data |
| 7 | Protective collar (stock) | None found for India; US benchmark only (C5) | Stock prices held; put and call prices absent pre-2024 | Low–moderate | Upside cap; put cost; settlement | **No** | **INSUFFICIENT EVIDENCE** and **DATA BLOCKED** | Low |
| 8 | Momentum-based stock options | None found | Stock option prints from 2024-06 only | Low | Liquidity; PIT | **No** | **DATA BLOCKED** | Low |
| 9 | Defined-risk directional stock spreads | None found in Indian sources | As above | Low | Liquidity; fills | **No** | **DATA BLOCKED** | Low |
| 10 | Volatility-regime defined-risk (long straddle, etc.) | Low: B2 master's thesis, limited sample | IV and Greeks absent; IV must not be inferred | Low–moderate | Theta; IV regime; no observed IV | **No** | **DATA BLOCKED** | Low |
| 11 | Long-horizon equity reversal | Low to mixed: A6 (snippet) versus momentum evidence in A4 and A9 | PIT membership needed; losers' delistings | Moderate | Survivorship strongly biases losers' tail; contradictory horizons | **No** | **DATA BLOCKED** | Low |
| 12 | Intraday mean reversion | Overlaps the rejected intraday series (I1–I8) and the 2015 intraday study (A7) | Intraday since 2022 | Moderate | Costs; prior failures | Not proposed | **REJECTED** (overlap with rejected series) | Do not pursue |
| 13 | Short strangles / weekly option selling | Low; secondary and blog sources only (B4, B5) | Option prices without bid/ask | Low | Undefined risk; tail losses | Not appropriate | **REJECTED** (undefined risk; evidence not adequate) | Do not pursue |
| 14 | Trend-following option strategies (index trend filter plus debit spreads) | Low: combines A2 and B3 without a joint study | As index debit spreads | Low–moderate | Two weak signals combined; fills | **No** | **INSUFFICIENT EVIDENCE** | Low |

## 2. Classification counts
Counts of the primary classification per row (14 rows in the table above):
- READY TO PROPOSE FOR VALIDATION: **0**
- RESEARCH CANDIDATE: **1** (index time-series momentum)
- DATA BLOCKED: **8** (rows 1, 3, 4, 6, 8, 9, 10, 11)
- INSUFFICIENT EVIDENCE: **3** (rows 5, 7, 14; row 7 also carries DATA BLOCKED)
- REJECTED: **2** (rows 12, 13)

## 3. Reasons for the top-ranked classifications

**Cross-sectional momentum (DATA BLOCKED).** Evidence is the most abundant of any candidate in this phase, and several Indian sources report profits, some after costs. It is blocked because point-in-time index membership and delisting histories are not held. Without them, the sample's survivorship bias cannot be controlled, and that bias is largest for the losers that a long-short momentum test depends on. This is a data blocker, not a verdict on the strategy.

**Index time-series momentum (RESEARCH CANDIDATE).** The only candidate that can be tested faithfully now, on index-level daily data from 2000 for NIFTY and SENSEX, with placeholder years excluded. The Indian evidence is thin: the one Indian study found (Singh et al., abstract) is stock-level, not index-level. The US and multi-asset base (Moskowitz, Ooi and Pedersen 2012) was not read in full. Index levels are not directly tradable; any implementation would need futures or an ETF with its costs, which are not verified.

**Covered calls (DATA BLOCKED).** Indian evidence exists and is mostly positive for risk reduction, but the samples are old and the sources were not read in full. Historical call prices with bid/ask are absent before 2024-06.

## 4. Candidates deliberately not classified as research candidates
- Anything relying on inferred implied volatility or Greeks: not presented as observed; excluded from any ranking that depends on it.
- Any strategy whose only support is a commercial backtest or blog: excluded from evidence.
- Previously rejected hypotheses (H1–H5, Donchian_55, I1–I8): not revived.

## 5. What would change a classification
- **Cross-sectional momentum:** verified point-in-time index membership with delistings and verified corporate actions would move it to RESEARCH CANDIDATE, then READY TO PROPOSE if the Indian evidence is confirmed in full text.
- **Index debit spreads and calendars:** historical option chains with bid/ask before 2024-06 would be needed. Without them the classification stays DATA BLOCKED.
- **Covered calls:** historical call prices with bid/ask and a verified dividend treatment would move it to RESEARCH CANDIDATE.
