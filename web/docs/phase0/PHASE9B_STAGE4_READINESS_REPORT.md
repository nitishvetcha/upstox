# Phase 9B Stage 4 — live-pilot readiness closure report

**Status: NOT READY / HOLD.** Offline scheduler design and mock verification are complete. Account entitlement and complete exchange-calendar evidence are not complete. No live collection is approved.

Date: 2026-11-12.

## 1. Deliverables

| Deliverable | Status | Evidence |
|---|---|---|
| Account-entitlement instructions | Complete | `PHASE9B_STAGE4_ENTITLEMENT_VERIFICATION.md` |
| Owner account confirmation | Pending | No account-specific V3 Full-mode confirmation recorded |
| Official exchange calendars | Evidence retained / date-specific HOLD | `PHASE9B_CALENDAR_SOURCE_STATUS.md`; annual 2024–2026 records and 2025 special-session notices identified, required BSE copies retained, and the exact pilot-date amendment check remains required |
| Offline scheduler | Complete | `src/lib/liveEvidence/scheduler.ts` |
| Scheduler mock tests | Complete | `src/lib/liveEvidence/scheduler.test.ts` |
| Pilot cap calculation | Complete | `oneSessionPilotCap(76)` and test |
| Live pilot | Not approved and not run | Separate owner decision required |

## 2. Scheduler design

The scheduler is transport-neutral and owns no token or network code. The clock, timers, capture callback, and event sink are injected.

- 76 slots from 09:15 through 15:30 IST, five minutes apart.
- Each slot invokes `capture` at most once.
- No automatic retry.
- A normal failure is recorded; the next scheduled slot may proceed.
- `TOKEN_EXPIRY` and `RATE_LIMIT` stop later capture attempts.
- Slots earlier than scheduler startup are `MISSING` and never backfilled.
- Duplicate timer firing is ignored.
- Cancellation cancels all pending injected timers.
- The scheduler does not reconnect a WebSocket, start a process, install a daemon, or write a launchd definition.

## 3. Mock verification results

Eight scheduler tests cover the 76-slot grid, five-minute spacing, exactly-once capture, ordinary failure, token-expiry stop, rate-limit stop, restart gaps/no backfill, cancellation, and pilot-cap calculation.

Combined `src/lib/liveEvidence` result after Stage 4: **59/59 passing**. Scoped lint and TypeScript pass.

Full regression after the scheduler change: **2,796 tests, 288 suites, 0 failures, 0 cancelled, 0 skipped**. Full-project lint retains the Stage 3 baseline of 35 errors and 101 warnings in unrelated pre-existing files; `src/lib/liveEvidence/` is clean.

## 4. One-session pilot cap

For a WebSocket pilot with all six paired CE/PE legs on one connection:

| Item | Hard cap |
|---|---:|
| Scheduled evidence snapshots | 76 |
| Authorized-URL API requests | 1 |
| WebSocket connections | 1 |
| Binary subscription messages | 1 |
| Automatic reconnects | 0 |
| Automatic retries | 0 |

Incoming WebSocket ticks are server-pushed messages, not client API requests. The scheduler selects 76 evidence snapshots from the stream. For comparison only, the existing REST design would require at most 76 quote requests, one per slot, with no retry. REST and WebSocket caps must not be added together unless a future pilot explicitly approves both transports; the current recommendation is one transport only.

Any disconnect, 401/token failure, 429/rate limit, unauthorized response, malformed response, or unexpected entitlement failure ends the proposed pilot. Starting a second connection would exceed this cap and requires a new approval.

## 5. Readiness gates

| Gate | Current result |
|---|---|
| Owner confirms account-specific V3 Full entitlement | FAIL — pending |
| Relevant NSE calendar confirmed | Annual records located; exact pilot date not selected |
| Relevant BSE calendar confirmed | Required notice copies retained; exact pilot-date check pending |
| Special-session window confirmed for chosen date | Date not chosen |
| Calendar status for chosen date | HOLD |
| Scheduler mock suite | PASS |
| WebSocket mock/decoder suite | PASS |
| Evidence writer/collector integration | PASS |
| Fixed cap and stop rules recorded | PASS |
| Separate pilot approval | FAIL — not granted |

Result: **do not initiate a live pilot**.

## 6. REST trade-age threshold

No REST trade-age threshold was selected. REST last-trade age remains descriptive and distinct from WebSocket quote-message freshness. The WebSocket 60-second rule continues to use `FeedResponse.currentTs` only.

## 7. Process and persistence controls

A read-only `launchctl` check on 2026-11-12 returned `Could not find service "com.upstox.paperlive"`, confirming it was not loaded. No LaunchAgent file or process was changed or started.

## 8. Governance

- No WebSocket connection was opened.
- No Upstox API request or authorized-URL request was made.
- No subscription was sent.
- No recurring process, scheduler process, paper runner, or LaunchAgent was started.
- No production formulas, Strategy 11.4 rule, 1% risk limit, or 60-session requirement changed.
- Production engine remains **NO-GO**.
