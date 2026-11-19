# Phase 0 — Robustness test plan (2026-11-11)

Offline tests can run now (fixtures, no market data). Market-dependent tests are marked BLOCKED.

| # | Test | Runs offline? | Status | Current evidence |
|---|---|---|---|---|
| 1 | Missing EMA 200 never yields TRADE | Yes | PASS | F-R1 test, `recommendationPipeline.test.ts` |
| 2 | Stale or missing news blocks trades (fail-closed) | Yes | PASS | `news.test.ts`, S-07 |
| 3 | Missing or unknown lot size blocks sizing | Yes | PASS | `riskService.test.ts` (UNKNOWN_LOT_SIZE) |
| 4 | Mock data never reaches a TRADE | Yes | PASS | `analysisSafety.test.ts`, `mockExecutionGuard.test.ts` |
| 5 | Daily loss limit stops new entries | Yes | PASS (realised only) | `risk.test.ts`; unrealised not included (R-12) |
| 6 | Correlated positions counted as one exposure | Yes | FAIL | No correlation logic (R-06) |
| 7 | Premium move under a larger index move (gamma) | Yes (synthetic) | FAIL: understated 14–72% | `PHASE3_PREMIUM_MODEL_CHECK.md` (S-06) |
| 8 | Gap through a stop | Partly | NOT TESTED | Stop-gap allowance is an assumed percentage (R-05) |
| 9 | Expiry-day entries after cutoff | Yes | NOT TESTED | Cutoff documented, enforcement not confirmed |
| 10 | Higher transaction costs | Yes | NOT TESTED | Cost rates unverified (D-12) |
| 11 | IV expansion and contraction | BLOCKED | BLOCKED | Needs option IV history |
| 12 | Sudden reversal (bullish to bearish within the session) | BLOCKED | BLOCKED | Needs intraday market data |
| 13 | Delayed or missing live data | Yes (fixtures) | PASS for fail-closed; live behaviour BLOCKED | `staleMarketGate.test.ts` 9/9 |
| 14 | API interruption and token expiry | Yes | PASS (classification); live BLOCKED | `upstoxErrorClassification.test.ts` 10/10 |
| 15 | Illiquid contracts | BLOCKED | BLOCKED | Needs bid-ask history |
| 16 | Consecutive losing trades and drawdown | BLOCKED | BLOCKED | Needs trade outcomes (historical stage) |

Next offline step: items 6, 9 and 10 can be tested with fixtures once the owner decides how correlated exposure and expiry cutoffs should be defined. Those are rule decisions, so they are not implemented in this phase.
