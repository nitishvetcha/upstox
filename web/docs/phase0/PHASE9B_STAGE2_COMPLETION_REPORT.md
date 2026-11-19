# Phase 9B Stage 2 — completion report

**Label: Offline implementation and verification. Not validation.** No Upstox API requests. No WebSocket connection. No live collection. Engine NO-GO. Strategy 11.4, production formulas, the 1% risk limit and the 60-session live requirement are unchanged.

Written for: the project owner, before any live-data access is considered.

## 1. Files created and modified

| File | Change | Purpose |
|---|---|---|
| `src/lib/liveEvidence/collector.ts` | Created | Collector: one attempt per slot, manifest, restart resume, failure handling, session summary |
| `src/lib/liveEvidence/collector.test.ts` | Created | 14 mock-based tests |
| `docs/phase0/PHASE9B_STAGE2_COMPLETION_REPORT.md` | Created | This report |

Unchanged in this stage: `src/lib/liveEvidence/evidence.ts` and its tests (Phase 9A), the historical collectors, `scripts/lib/collectionGuard.mjs`, and all production code. The git tree already had many uncommitted changes when this session began. None of them were made in Stage 2.

## 2. Collector architecture and data flow

```
sessionSlots(IST date)  ->  76 slots, 09:15 to 15:30 IST, every 5 min, as UTC
        |
collectSession(opts)    dependency-injected: fetch(keys), nowUtc, dir, rules, calendar flag
        |
  for each slot:
    already resolved in manifest?   -> skip (restart)
    slot earlier than nowUtc?       -> MISSING, never fetched (no backfill)
    session stopped?                -> NOT_ATTEMPTED
    fetch once (no retry)
      network error                 -> FAILED, recorded
      HTTP 401                      -> stop session, TOKEN_EXPIRY
      HTTP 429                      -> stop session, RATE_LIMIT
      other non-200                 -> FAILED, API_ERROR
      200                           -> parseQuotes -> validateSnapshot (evidence.ts)
                                       -> writeSnapshotOnce (write-once, raw hash)
                                          EEXIST -> DUPLICATE, not overwritten
    append manifest row (append-only JSONL)
  evaluateSession (evidence.ts): coverage, paired legs, gaps, calendar -> INCLUDED / EXCLUDED / HOLD
  session-summary.json written with the manifest hash
```

Credential check: the raw response is searched for the access token before storage. A match throws, and nothing is stored for that slot.

Outputs per session directory: `snapshots/`, `manifest.jsonl`, `failures.jsonl`, `session-summary.json`.

## 3. Six-index and paired-leg coverage

Tested with one CE and one PE per index, for all six indices (12 instrument keys in one mock response).

- The parser returns 12 legs: 6 CE and 6 PE, across NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX and BANKEX.
- Each leg carries five bid levels and five ask levels when the mock supplies them.

## 4. Restart and failure-handling results

| Scenario | Result | Test |
|---|---|---|
| Full session, all slots valid | 3 of 3 STORED and VALID; session INCLUDED with known calendar | Passes |
| Unknown calendar | Session HOLD | Passes |
| Restart after 2 slots | Only the new slot is requested | Passes |
| Slots before restart time | MISSING, not fetched (not backfilled) | Passes |
| HTTP 401 | Session stops; later slots NOT_ATTEMPTED; one request only | Passes |
| HTTP 429 | Session stops; RATE_LIMIT recorded | Passes |
| HTTP 500 | That slot FAILED; each slot attempted once; later slots continue | Passes |
| Network timeout | Slot FAILED; NETWORK recorded | Passes |
| Duplicate snapshot | DUPLICATE; existing file kept unchanged | Passes |
| Credential in response | Throws; nothing stored for that slot | Passes |
| Token search across all stored files | Not found | Passes |
| Manifest has one row per slot | 3 rows for 3 slots | Passes |
| Slot schedule | 76 slots, first 03:45Z, last 10:00Z | Passes |

Earlier in this stage one test failed, and the fix is recorded here. The first version allowed one interval of tolerance on restart, so a slot 5 minutes before the restart time was fetched as a backfill. The rule now treats any slot earlier than the restart time as missed. This matches the plan.

## 5. Test and regression results

- **Phase 9B collector and Phase 9A evidence tests:** 30 of 30 pass.
- **Lint on `src/lib/liveEvidence/`:** clean.
- **Full regression suite (`npm test`):** 2,767 tests, 0 failures, 0 cancelled.
- **Guard regression:** 5 of 5 pass (verified earlier in this session; the guard test runs as part of the full suite).

## 6. Confirmation that all tests used mocks

- Every fetch in the collector tests is a mock function that returns a canned response.
- Nothing in `collector.test.ts` references `api.upstox.com` (checked: zero matches).
- No test reads a real token. The token string in tests is the literal `TEST-ONLY-TOKEN-9f3a`.
- The clock is supplied by the test (`nowUtc`), not read from the system.

## 7. WebSocket documentation findings

Source: official Upstox V3 market-data feed page, `https://upstox.com/developer/api-documentation/v3/get-market-data-feed/` (read via a web-fetch subagent, HTTP 200). No connection was opened.

| Item | Finding | Confidence |
|---|---|---|
| Modes | ltpc, option_greeks, full, full_d30 | Read from page |
| Limits, normal | ltpc 5,000 individual / 2,000 combined; option_greeks 3,000 / 2,000; full 2,000 / 1,500 | Read from page |
| Limits, Plus | full_d30 50 individual / 1,500 combined (Plus table only). No separate Plus figures stated for ltpc, option_greeks or full. | Read from page |
| Connections per user | 2 normal; 5 under Upstox Plus | Read from page |
| Plan requirement | No general plan requirement stated. Upstox Plus is named only for the Plus limits and full_d30. | Read from page |
| ltpc fields | ltp, last trade time, last quantity, change, and opening auction price in auction periods. No bid/ask, depth, OI, volume or Greeks. | Read from page |
| full fields | Includes five bid/ask levels, Greeks, OHLC, OI, IV, volume fields and auction fields | Read from page |
| full_d30 fields | Same structure as full, with 30 bid/ask levels | Read from page |
| option_greeks fields | **Conflict:** the mode table says "only option greeks", but the sample includes top-of-book bid/ask and LTP. Verify before relying on either. | Conflict on page |
| Per-message timestamp | Yes: a current-tick timestamp on live messages, plus a last-trade time per instrument | Read from page. Field location unclear between sample and table. |
| Encoding | Protobuf. Requests must be binary. | Read from page |

**What this means for the evidence specification:**
- Quote-message freshness (the 60-second rule) needs a per-message timestamp. The documentation says messages carry one, so WebSocket can meet the rule in principle. REST cannot.
- Five depth levels per side are available on full and full_d30, not on ltpc.
- The Plus-only full_d30 mode is not needed for five levels.
- The conflict on option_greeks must be resolved before IV or Greeks are specified.

**What is not established:** whether this account has WebSocket entitlement, and whether the Plus plan changes limits for the modes the evidence needs. The page does not answer the account question, and Plus activation does not prove it.

## 8. Remaining blockers before a one-session pilot

1. **Account entitlement:** confirm WebSocket access for this account. This needs owner action in the Upstox account, not a code change.
2. **Option_greeks conflict:** resolve from the official sample or a documented field table before IV or Greeks are specified.
3. **WebSocket client:** not built. Needs protobuf decoding, heartbeats, reconnect and subscription management. Must be tested offline first.
4. **REST threshold:** owner decision on any numeric trade-age value. None is adopted.
5. **Holiday calendar:** official NSE and BSE circulars, not yet collected. Until they are, every session is HOLD.
6. **Scheduler:** nothing schedules collection. The paper-live launchd job stays unloaded. A scheduler must be designed with the approval boundaries in the Phase 9B plan.
7. **Pilot approval:** a one-session test needs a separate approval with a fixed request cap, no retries, and the stop rules in the plan.

## 9. Governance

- No Upstox API requests were made in Stage 2.
- No WebSocket connection was opened.
- The paper-live launchd job (`com.upstox.paperlive`) is confirmed not loaded.
- No order-placement code exists in the liveEvidence modules.
- Strategy 11.4, production formulas, the 1% risk limit and the 60-session requirement are unchanged.
- Engine remains NO-GO.
