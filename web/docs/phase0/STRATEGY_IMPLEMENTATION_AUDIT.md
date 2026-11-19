# Phase 0 — Strategy implementation audit (2026-11-11)

Scope: does the code implement the documented 7-check strategy and its formulas? Read-only audit. No rule, weight, threshold or frozen-file change.
Frozen file: `src/lib/engine/strategy.ts`, SHA-256 `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18` (verified this session).

Status key: PASS = independently verified by reading code and passing tests. FAIL = defect or inconsistency confirmed. BLOCKED = needs data or owner decision. NOT TESTED = not verified.

| ID | Severity | Status | Finding |
|---|---|---|---|
| S-01 | — | PASS | Seven checks with weights 20/20/15/15/10/10/10 (total 100). `src/lib/engine/analysis.ts:199-205`. Tests: `engine.test.ts` 8/8. |
| S-02 | — | PASS | Threshold 65 applied to the best non-rejected, risk-approved candidate. `strategy.ts:6, 249`. |
| S-03 | — | PASS | F-R1 fixed in the analysis layer: missing EMA 200 makes the trend check unavailable, and the engine's existing rule blocks the trade. `analysis.ts` (trend factor). Test `recommendationPipeline.test.ts` 15/15 including the previously skipped F-R1 case. `strategy.ts` not changed. |
| S-04 | MEDIUM | FAIL (documentation) | Debit-spread stop and targets use constants not in the documented formulas: stop = 0.5 × debit; target 1 = debit + 0.5 × max profit; target 2 = debit + 0.8 × max profit (`strategy.ts` spread builder). Action: document the constants with their origin, or justify them. Cannot change the frozen file without review. |
| S-05 | HIGH | FAIL (semantics) | Long-option expected move = |delta| × `indicators.atr`. `indicators.atr` is the **daily** ATR (`types.ts` Indicators comment; `technicalMapping.ts` maps `atr: t.dailyAtr`). The stop and targets therefore use a daily range for an intraday premium exit. Owner review required (outside this audit's authority to change). |
| S-06 | HIGH | FAIL (quantified, synthetic) | Premium move uses delta only; gamma, theta and vega are ignored. Offline check (`scripts/phase3-premium-model-check.ts`, `PHASE3_PREMIUM_MODEL_CHECK.md`): under synthetic inputs the delta-only move understates a full repricing by 14% to 72%, the largest error for out-of-the-money strikes close to expiry. Stops and targets are therefore set too tight. Real IV and expiry data are needed to size the error for live use (BLOCKED). |
| S-07 | HIGH | PASS (fail-closed) but design decision | When news is stale or unavailable, the news factor is unavailable (`analysis.ts` news block). The strategy's missing-factor rule then builds no candidate at all (`strategy.ts` missing check). Result: the engine cannot produce TRADE while the news feed is down. Current live state: news UNAVAILABLE. Owner decision: keep (fail-closed) or make news optional with a stated rule. |
| S-08 | MEDIUM | NOT TESTED | Overlap between checks: trend (EMA 9/21/50, price vs EMA 50), technical (MACD) and price action all derive from the same OHLC series. Structural overlap confirmed by reading; quantitative overlap needs historical data (Phase 2). |
| S-09 | HIGH | BLOCKED | Stocks do not use this engine. Stock recommendations come from separate engines (`stockOpportunityEngine.ts` v20.1, `positionalV2.ts`, `intradayReplay.ts`, `longTermEngine.ts`). This audit covers only the index-option 7-check engine. The stock engines need their own audit. |
| S-10 | LOW | PASS | Direction is the side with the larger points total; checks that disagree add none (`analysis.ts` side-flip logic). Tests `engine.test.ts`. |
| S-11 | MEDIUM | NOT TESTED | Reporting of bullish score, bearish score and directional separation (requested in the external review) is not implemented. The output shows a single total. Action: add these three values to the output (display only, no rule change). |

Summary: 7-check scoring, threshold and the F-R1 fix are verified. The formulas that set stops and targets have two issues (S-04, S-05) that need owner review. Stocks are outside this engine's audit (S-09).
