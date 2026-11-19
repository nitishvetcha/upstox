# Final research recommendation (2026-11-09)

Written for: the project owner.
Status: **documentation only.** No strategy was implemented, no backtest or validation was run, no holdout was opened, no data was requested, and no application code, `strategy.ts`, `.data/`, `.research-data/`, journal or saved-picks file was modified.

**Overall decision: live recommendation engine NO-GO.** This phase does not establish that any strategy is profitable, validated or ready. No candidate is VERIFIED, and none is READY TO PROPOSE FOR VALIDATION on the evidence in hand.

## 1. Which candidates deserve further investigation?
1. **Index time-series momentum (NIFTY and SENSEX, index level).** The only candidate that can be tested faithfully now on clean data. Indian evidence is thin, so this is a research candidate, not a result.
2. **Cross-sectional momentum (equities).** The most Indian evidence of any candidate, with several studies reporting profits (some after costs, per snippets). Worth investigating **once point-in-time membership data is approved and sourced.**
3. **Covered calls (Nifty and stocks).** Positive Indian evidence for risk reduction in old samples. Worth investigating once historical call prices with bid/ask are available.

## 2. Which candidates should be rejected?
- **Intraday mean reversion:** overlaps the eight intraday hypotheses already rejected after costs.
- **Short strangles, weekly option selling and other undefined-risk premium selling:** undefined risk, evidence limited to blogs and secondary summaries, and no bid/ask data to test them faithfully.
- **Any inferred-IV or inferred-Greeks strategy presented as observed:** excluded on data grounds.
- **Previously rejected hypotheses** (H1–H5, Donchian_55, I1–I8): not revived.

## 3. Which candidates are blocked by unavailable data?
- Cross-sectional momentum (no point-in-time membership, no delisting histories).
- Index debit spreads, calendar spreads, volatility-regime option strategies (no option prices with bid/ask, no IV or Greeks, and no option history before 2024-06).
- Covered calls (no call prices with bid/ask before 2024-06).
- Protective collars and stock option strategies (same option-data gap; no Indian evidence for collars).
- Long-horizon equity reversal (survivorship).

## 4. Which candidate has the strongest evidence?
**Cross-sectional momentum** has the strongest *Indian* evidence base, but it is snippet-level and data-blocked. **Index time-series momentum** has the strongest *testability*, but its Indian evidence is the weakest of the research candidates. No candidate combines strong evidence, full-text review and feasible data, so no single candidate has the strongest evidence across all three tests.

## 5. The single best next validation proposal
**Protocol P1: index time-series momentum on NIFTY and SENSEX at index level** (see `PROPOSED_VALIDATION_PROTOCOLS.md`).

Why this one:
- The data is held and the sample starts in 2000.
- The rules are fixed before any run, with no tuning.
- Development, validation and holdout periods are declared; the holdout is reserved and not opened.
- It can fail cleanly, which matters more than an optimistic result.

Preconditions before it runs (each needs your approval):
1. Resolve the SENSEX and BSE calendar (the ~46 non-calendar dates per series).
2. Confirm the cost model as an explicit assumption, with the sensitivity range fixed in advance.
3. Accept that the result would be an index-level finding, not a tradable strategy. Tradability needs a separate protocol with futures or ETF costs.

## 6. What additional data would materially improve confidence?
In order of impact:
1. **Point-in-time NSE index constituents** (NIFTY 50, NIFTY 200) with delistings and the corporate-action history. This is the single biggest blocker for equity research.
2. **Historical option chains with bid/ask, volume and open interest** from before 2024-06, for NIFTY and BANKNIFTY. This unlocks the index option families.
3. **Verified corporate actions** for the full equity universe.
4. **A verified BSE session calendar** and resolution of the duplicate and non-calendar index dates.
5. **Verified statutory cost schedules** (SEBI fee, STT, stamp, GST base and entry treatment, CDSL DP tariff), and a broker contract note sample for cost calibration.
6. **Full-text access** to the Indian momentum papers (A1–A4), the Nifty option spread paper (B1), the NSE covered-call papers (C1, C4), the NSE Nifty200 Momentum 30 whitepaper and the SEBI primary F&O report (C6).

Each item needs separate approval. None is requested by this document, and no request was made.

## 7. What should we avoid spending time on?
- Re-testing intraday reversal or any previously rejected hypothesis under a new name.
- Option strategies that need IV or Greeks inferred from daily prints.
- Undefined-risk premium selling.
- Commercial or blog backtests as evidence.
- Tuning any rule until it passes: holdout discipline and pre-declared criteria must hold.
- Collecting more data before the protocol and the question it answers are approved.

## 8. Source-access limits to resolve
- Indian momentum and option papers were read as snippets or abstracts only. Their full text must be obtained (through authorised access) before any proposal relies on them.
- The SEBI primary report was not opened; its figures here are from press coverage.

## 9. Frozen items (confirmed)
- Strategy 11.4 and `src/lib/engine/strategy.ts` unchanged; SHA-256 `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18` (checked in this phase).
- No holdout opened; no validation run; no protocol registered.
- No Upstox or NSE request; no token refreshed; no paid data.
- No data, journal or saved-picks file modified.

## 10. Summary
The evidence supports continued research, not a validated strategy. The most useful next step is to decide whether to approve the index-level time-series protocol (P1), and in parallel whether to approve sourcing point-in-time membership, which is the largest blocker for any equity result.

**Live recommendation engine: NO-GO** until independent strategy validation is completed and the result is credible on out-of-sample data. This research does not establish profitability.
