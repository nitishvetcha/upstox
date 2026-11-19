# Server-side risk-gate verification (read-only)

Date: 2026-11-13. Method: static reading of the code paths. No tests were added or changed by this check, and no route was executed.

## Where the risk assessment runs (server side)

| Caller | File | Behaviour (verified in code) |
|---|---|---|
| Recommendation engine | `src/lib/engine/strategy.ts` ~line 240 | Each candidate plan is evaluated. A rejected plan carries its reason. A plan is selected only if `!rejected && risk.allowed && score >= MIN_STRATEGY_SCORE`. |
| Paper engine (entry) | `src/lib/paperEngine.ts` ~line 348 | If `!riskAssessment.allowed`, the entry returns `created: false` with reason `RISK_REJECTED: ...`. No paper trade is created. |
| Risk assessment API | `src/app/api/risk/assess/route.ts` | Requires operator session (`requireOperator`). Evaluates the plan against the server-side snapshot. |
| Backtest | `src/lib/backtestEngine.ts` ~lines 520, 536 | Risk per lot and per-trade risk evaluated for backtest candidates. |

## Fail-safe behaviour (verified in `src/lib/services/risk/riskService.ts`)

- Unknown lot size: rejected (line ~32).
- Non-finite plan values: rejected explicitly (line ~47 comment: NaN would otherwise pass `<` tests).
- Market or option chain unavailable, END_OF_DAY, STALE, or stale by freshness: rejected (lines ~217–225).
- Extreme event risk: new trades blocked (line ~210).
- Wide spread: rejected (line ~245).

## Not verified in this check

- That every paper-trading HTTP route reaches `PaperEngine` entry. The entry path was read in the engine, but the route handlers were not traced line by line.
- Numeric correctness of the 1% limit calculation. That is covered by `riskKnownAnswer.test.ts`; its results were not re-examined here.
- Whether the frontend can bypass the API. Not tested.

Result: the risk gates that were read are enforced on the server. Route-level tracing remains open.
