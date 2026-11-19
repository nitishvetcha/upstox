# Strategy research overview — next phase (2026-11-09)

Written for: the project owner and research team.
Scope: documentation only. No strategy was implemented, no backtest or validation was run, no holdout was opened, no market or token data was requested, and no application code, `strategy.ts`, `.data/`, `.research-data/`, journal or saved-picks file was changed.

**Overall decision: live recommendation engine NO-GO.** No candidate in this phase is VERIFIED or READY TO PROPOSE FOR VALIDATION on the evidence in hand. Nothing here establishes a profitable strategy.

## 1. Question
Is there a strategy in Indian equities or index/stock derivatives with a net edge after realistic costs, slippage, liquidity and risk? As of this phase, the evidence does not answer yes. The phase's job is to find the most credible candidates, reject what the evidence or data does not support, and name the single most useful next step.

## 2. Starting point (from the project record)
- Strategy 11.4 is frozen. `strategy.ts` SHA-256 `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18` (checked in this phase; unchanged).
- Earlier stock momentum and reversal hypotheses did not establish a credible edge (H1–H5; A2 and A3 audits).
- Daily DONCHIAN_55 failed holdout.
- Eight intraday hypotheses failed validation after realistic costs.
- No candidate is VERIFIED.
- The application is recommendation-only; no automated broker orders.

Previously rejected hypotheses are not treated as successful and are not revived here.

## 3. Method
1. **Literature and official sources:** searched for Indian and international evidence on cross-sectional and time-series momentum, reversal, and index and stock option strategies. Recorded read depth for every source (see `ACADEMIC_AND_OFFICIAL_EVIDENCE.md`).
2. **Data feasibility:** assessed each candidate against the existing project datasets using the project's own reports only. No new data was requested (see `DATA_FEASIBILITY_ASSESSMENT.md`).
3. **Classification:** each candidate is classed as REJECTED, INSUFFICIENT EVIDENCE, DATA BLOCKED, RESEARCH CANDIDATE or READY TO PROPOSE FOR VALIDATION (see `STRATEGY_CANDIDATE_COMPARISON.md`). VERIFIED was not used.
4. **Protocols:** drafted for the strongest candidates only, as proposals that are not executed (see `PROPOSED_VALIDATION_PROTOCOLS.md`).

## 4. Source-access limits
- Most academic papers were available only as abstracts, previews or search snippets. None of the Indian papers was read in full in this phase.
- Several sources are secondary press coverage or commercial blogs. These are not treated as evidence.
- The SEBI primary report on F&O profitability was not opened; figures are from press coverage of it.
- The NSE research papers on momentum and covered calls were listed, not read in full.
- Where a source was not read in full, the documents say so. No finding is stated beyond what the accessible text supports.

## 5. What the phase concludes at a glance
- **Strongest evidence (Indian):** cross-sectional momentum, with several Indian studies reporting positive momentum profits, some after costs (snippets). **Blocked by data:** no point-in-time index membership, so survivorship bias cannot be controlled.
- **Testable now with clean data:** time-series momentum on the stored index series, but Indian evidence is thin and the index series have placeholder years (usable from 2000 for NIFTY and SENSEX only, subject to the BSE calendar check).
- **Options:** the best Indian options evidence (Slivka et al. 2020, calendar spreads) and a 2007–2018 Nifty spread study are abstract-level, and option bid/ask, IV and Greeks are unavailable for any history before 2024-06. Option strategies are mostly DATA BLOCKED for a faithful test.
- **Rejected for this phase:** naked or short-premium option selling (undefined risk, weak evidence from secondary sources only); intraday reversal (overlaps the rejected intraday series); any strategy relying on inferred IV or Greeks.

## 6. Document set
- `ACADEMIC_AND_OFFICIAL_EVIDENCE.md` — sources, read depth, findings, limits.
- `DATA_FEASIBILITY_ASSESSMENT.md` — datasets, gaps, bias, testability.
- `STRATEGY_CANDIDATE_COMPARISON.md` — comparison table and classifications.
- `PROPOSED_VALIDATION_PROTOCOLS.md` — proposals only; not executed; no holdout opened.
- `FINAL_RESEARCH_RECOMMENDATION.md` — the answers the brief asks for.

**Live recommendation engine: NO-GO.** Strategy validation has not been completed. Passing research documents do not prove profitability.
