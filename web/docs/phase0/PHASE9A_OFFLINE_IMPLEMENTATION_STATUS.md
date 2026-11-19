# Phase 9A — offline implementation status

**Label: Offline implementation, not validation.** No Upstox requests were made. No collector is wired to any live source. Engine NO-GO. Strategy 11.4, production formulas, the 1% risk limit and the 60-session live requirement are unchanged.

## Components built

| # | Component | Location | Status |
|---|---|---|---|
| 1 | Snapshot writer (write-once, raw hash, no token) | `src/lib/liveEvidence/evidence.ts` (`writeSnapshotOnce`) | Built, tested |
| 2 | Validator (freshness, populated fields, skew, verdicts VALID / INCOMPLETE / REJECTED) | `evidence.ts` (`validateSnapshot`) | Built, tested |
| 3 | Failure recorder (append-only, bearer tokens scrubbed) | `evidence.ts` (`recordFailure`) | Built, tested |
| 4 | REST freshness rule (last_trade_time age proxy) | `evidence.ts` (`restFreshness`) | Built, tested. Threshold is a caller input. |
| 5 | Offline test suite | `src/lib/liveEvidence/evidence.test.ts` | 16 of 16 pass |

Session evaluation (coverage ≥ 95%, paired-leg ≥ 98%, gap ≤ 15 min, calendar confirmation) is built and tested as `evaluateSession`. Session window (09:15 to 15:30 IST, weekdays, inclusive) is `inSessionIst`.

## Test coverage

Normal, stale, missing depth, missing bid quantity, HTTP 401, empty legs, clock skew, duplicate refused, raw hash stored with no token, 20-minute gap excluded, 94% coverage excluded, unknown calendar held, complete session included, failure log scrubbed, session window boundaries, REST freshness with absent timestamp.

## Limits and open items

1. **REST threshold not chosen.** Tests use 900 seconds as an illustrative input only. The production value needs an owner decision.
2. **REST proxy is not a quote-message age.** The stale rule compares `last_trade_time` with snapshot time. Illiquid strikes can legitimately have old trades.
3. **Holiday calendar not implemented.** Sessions on unconfirmed dates are held, not included.
4. **Closure detection is not automatic.** The recorder writes events; nothing yet produces `MARKET_CLOSED` or `SESSION_GAP` entries from a live loop.
5. **WebSocket not implemented.** Quote-message freshness, the stated stale rule, needs a WebSocket source. Access not confirmed.
6. **Not wired to any collector.** The components are library code with tests. Phase 9B would connect them.

## Governance

- **Paper-live launchd job** (`com.upstox.paperlive`): confirmed not loaded. It must remain unloaded throughout Phase 9A.
- No order-placement code was added or reached.
- No Upstox requests.

## Next

Phase 9B (separate approval): confirm WebSocket access, decide the REST threshold and calendar source, then consider a bounded one-session test. A one-session test establishes collection readiness only. It does not count toward the 60-session requirement.
