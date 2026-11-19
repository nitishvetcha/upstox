# DRAFT protocol for a GO / NO-GO decision on the recommendation engine

Status: **DRAFT for owner review. Not registered. Not approved. No data has been accessed for this draft.**

## Why this is needed
The recommendation engine stays NO-GO until a strategy has validated, out-of-sample evidence. P1 was rejected, and the holdout (2022 onward) is sealed. A new protocol must use a holdout that has not been touched.

## 1. Question
A single, falsifiable question, for example: "Does the engine's TRADE decision have a positive net expectancy after the cost model, on data it was not tuned on?" One question only.

## 2. Hypothesis and success criteria (fixed before any data is read)
- Metric: net expectancy per trade after charges and slippage, with a confidence interval.
- Pass: lower bound of the interval above zero, with the minimum trade count stated in advance.
- Fail: anything else. The result is reported as-is. No threshold may be changed after results are seen.

## 3. Data
- Development set: a period chosen and frozen before the study. Used for building and checking only.
- Holdout: a later period, never used before, opened once. Its start and end dates are recorded here before any run.
- Data sources: stored data only, unless a live collection is separately approved.

## 4. Cost model
- Charges, slippage and fill rules stated explicitly, identical to the cost model in the repository, with any change recorded.

## 5. Frozen components
- Strategy 11.4 (`src/lib/engine/strategy.ts`, SHA-256 d0170b40…). Not modified for this study.
- The F-R1 fix (trend factor unavailable without EMA 200) is part of the engine as shipped and is recorded in the study.

## 6. Analysis plan
- One pre-stated analysis. Any other analysis is labelled exploratory and cannot change the GO decision.
- Multiple-comparison rule: none needed if there is a single primary analysis.

## 7. Reporting
- Report every run, including failures. No selective reporting.
- The holdout result is reported once. A second look requires a new protocol.

## 8. Decision rule
- PASS: GO is recommended to the owner, who decides.
- FAIL or inconclusive: NO-GO remains.

## 9. Owner sign-off
- Approved by: ____________ Date: ________
- Holdout dates recorded before run: ____________
