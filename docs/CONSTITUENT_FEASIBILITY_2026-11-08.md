# Point-in-time constituent feasibility for H1 research (2026-11-08)

Investigation only. No backtest, no validation, no holdout, no purchases. No live NSE or niftyindices requests were made in this investigation, because the standing master instruction prohibits NSE requests without approval. Each claim is labelled by its evidence:

- **[Local]** verified from files in this repository.
- **[Search]** from web search snippets only. The primary page could not be opened, so it is unverified.
- **[Unknown]** not established. A live check or owner decision is needed.

## 1. Verdict

**A sufficiently complete point-in-time universe cannot be constructed from the sources available today.** Monthly constituent archives would remove the membership part of survivorship bias only for the index-member universe, and only for the years they cover. They do not remove the bias from the price side, because the price histories for delisted and removed stocks are missing in the current data.

A new independently registered research design is **not yet justified**. It becomes justified only after the probes in section 6 establish coverage. The H1 result must stay labelled "development only, survivorship-biased, not validated".

## 2. What the current data contains [Local]

| Item | Finding |
|---|---|
| Universe in H1 | `web/.research-data/nse-equity-master-2026-11-08/EQUITY_L.csv`: 2,632 data rows, today's listed EQ set. Delisted stocks are absent by construction. |
| Price source in H1 | Upstox daily candles, `upstox-daily-universe-verified-2026-11-08`: 2,397 series. |
| Calendar | 6,629 sessions, 2000-01-03 to 2026-11-05. |
| History start (firstBar) | 964 series start before 2013; 1,199 before 2017. Distribution is uneven: 476 series start in 2003 and 353 in 2026. Both clusters look like vendor defaults or re-listings, not real listing dates, and need checking. |
| Pre-listing bars | `docs/FULL_MARKET_UNIVERSE_REQUIREMENTS` and the coverage diagnostic record 298 stocks with bars well before their master listing date. SBICARD has 2015 bars before its real listing, which belong to a different instrument mapped to the same ISIN. |
| Symbol and ISIN mapping | EQUITY_L provides ISIN and symbol. The vendor's instrument-ID mapping is not available, so the ISIN-reuse cases cannot be resolved. |
| NSE bhavcopy sweep 2010 | `nse-bhavcopy-sweep-2010-2026-2026-11-08` and its INTERRUPTED copy: 172 days, **all UNAVAILABLE** (HTTP 403 and 404), 2010-01-04 to 2010-09-08, then stopped. No 2010 bhavcopy was obtained. |
| NSE bhavcopy newhost | `nse-bhavcopy-newhost-2024-06-03-to-2026-11-05`: 158 days STORED, 2024-06-03 to 2025-01-17 only. A gap of about 2 years is not covered. |
| Constituent lists in repo | `web/scripts/constituents/bankex.txt` and `sensex.txt` (current lists only). `sync-constituents.mjs` pulls **current** NIFTY, BANKNIFTY, FINNIFTY and MIDCPNIFTY CSVs. It produces no history. |

The repository therefore has **no historical membership data at all**, and **no delisted price histories**.

## 3. What the free sources offer [Search, unverified]

| Source | Coverage claimed | Caveat |
|---|---|---|
| niftyindices.com historical constituent reports (monthly) | Monthly files from April 2013 to March 2022, per forum posts. F&O index constituents from April 2022. | Not opened. Coverage after 2022 is reported as trimmed. Pre-2013 is reported as hard to find for free. Nifty 500 and Midcap history for 2011–2012 was not found. |
| NSE bhavcopy (cash equity) | Daily, every traded EQ security on the day. In principle includes stocks that later delisted, for their trading days. | 2010 access failed from this environment (section 2). NSE's old site reported as retired in 2023 by a forum user. Access to older files is unverified. |
| NSE delisted-securities list | No current public list was found. | [Unknown] |
| Third-party copies (GitHub, Kaggle-style datasets) | Some cover only 2007 or single indices. | Not official. Not validated against NSE. Would need reconciliation before any use. |
| Paid vendors (LSEG, Refinitiv, Bloomberg, EODHD) | Point-in-time constituents with delisted prices. | Excluded: the owner wants free only. |

## 4. Required membership dates and why monthly archives are not enough

A point-in-time universe needs, for each rebalance date, the set of stocks eligible on that date. Four things must hold:

1. **Historical date coverage.** Membership must cover every H1 rebalance, 2010–2026. Monthly archives cover 2013–2022 at best (per search). **Gap: 2010–2012 and 2022–2026 are unverified, and the 2010 bhavcopy fails.**
2. **Additions and removals.** Monthly snapshots show the state at month end. Stocks added and removed inside a month are missed. Index-change press releases would be needed to fill this, and they were not found in bulk.
3. **Delisted and suspended stocks.** A constituent list says a stock was a member, but not whether its price history is available. Upstox's history is for current instruments. **Without delisted price histories, a removed stock becomes an unexplained gap, so the bias remains.** NSE bhavcopy could fill this only if it is accessible for the relevant years.
4. **Symbol and ISIN mapping.** Index lists use symbols, which change with name changes and mergers. The mapping to ISIN needs EQUITY_L, which is current only. Renamed or re-ISIN'd stocks would be mis-mapped or dropped without a historical master.

Conclusion: **monthly archives do not automatically eliminate survivorship bias.** They remove it for membership only, and only for the covered years. The price side is still missing.

## 5. Recommendation

1. **Do not register a new research design yet.** Feasibility is not established.
2. **Run a bounded free probe, after owner approval**, with three checks:
   - (a) Open the niftyindices historical report page and record which months and indices exist, from 2010 to 2026.
   - (b) Request one 2010 bhavcopy date and one delisted-stock day from NSE archives, to test access. Stop on the first refusal.
   - (c) Count how many members of a single 2013 monthly snapshot have no price history in the current Upstox data. This quantifies the delisting gap directly.
3. **Decision rule for a new design** (to be written only if the probe passes): the universe must come from monthly membership with a stated rule for in-month changes, with delisted price coverage of at least a stated fraction, and the ISIN mapping must be reproducible from a dated source. If any of the three fails, the design is rejected and H1 stays a survivorship-biased development result.
4. **Keep the existing caveat** in every H1 output: "today's listed set; survivorship bias present".

## 6. Open questions for the owner

- Approve the bounded probe in 5.2, which makes live requests to niftyindices and NSE archives?
- Accept that 2010–2012 may not be recoverable free, which would shorten the H1 window to 2013 onward?
- Confirm that "free only" excludes third-party GitHub copies unless they are reconciled against NSE.

## 7. Limits of this report

- All search-based coverage claims are unverified and must be checked before use.
- The 476 series starting in 2003 and the 353 starting in 2026 were not explained. They may be data artefacts, which would affect any universe built from them.
- No evidence was produced here about whether H1's edge survives a point-in-time universe. That is the question the probe is meant to make answerable.
