# Phase 9B — implementation and verification plan

**Label: Plan, not validation.** Offline. No Upstox requests. Engine NO-GO. Strategy 11.4, production formulas, the 1% risk limit and the 60-session live requirement are unchanged.

Written for: the project owner, to decide the Phase 9B decisions and the boundaries of any future live test.

## Stage order

1. **Decisions** (this plan, owner sign-off): REST freshness policy, holiday calendar source, WebSocket entitlement and field requirements.
2. **Offline collector integration** (mocks only): wire `src/lib/liveEvidence/evidence.ts` into a collector and test it.
3. **One-session pilot:** separate approval, only after stages 1 and 2 pass.
4. **60-session collection:** separate approval, only after the pilot is reviewed.

Nothing in stages 3 or 4 is approved by this plan.

## 1. REST freshness policy (decision required)

Three distinct concepts, which must not be merged:

| Concept | Definition | Source | Stored as |
|---|---|---|---|
| Retrieval time | When our application received the response | Local clock at receipt | `retrievedAtUtc` |
| Last trade time | When the instrument last traded | `last_trade_time` in response | `lastTradeTime` |
| Quote freshness | Whether the quote can be established as current | Not available from REST as shown | `quoteFreshness` (see below) |

**Proposed policy:**
- An illiquid option is **not rejected** for having no recent trade. Its quote is recorded with its last-trade age, and the snapshot is marked `NO_RECENT_TRADE`, which is distinct from `STALE`.
- `quoteFreshness` for REST is `UNKNOWN` unless a per-quote timestamp is available. It must not be reported as fresh.
- Quote freshness for the stated 60-second rule requires a WebSocket message timestamp. Without it, the 60-second rule cannot be applied and the session is held.
- Any numeric trade-age threshold is an owner decision and is not chosen here. The 900-second value in the tests is illustrative only.

**Decision needed:** approve the three-concept split and the `UNKNOWN` treatment for REST.

## 2. Holiday and exchange calendar (decision required)

- **Source:** official NSE and BSE trading-holiday circulars for each year, plus special-session notices (for example Muhurat trading). A third-party calendar is not an acceptable source of record.
- **Scope:** NIFTY and BANKNIFTY, FINNIFTY, MIDCPNIFTY (NSE) and SENSEX, BANKEX (BSE). Confirm that the two exchanges' calendars agree for these products.
- **Handling:**
  - Holiday or unknown date: session `HOLD`, never `INCLUDED`.
  - Half-day or special session: session labelled with its actual window, and excluded from the full-session criteria unless the window is confirmed.
- **Action:** collect the circulars for the sampling period and record their references in `docs/phase0/`. Not done in this plan.

**Decision needed:** approve the source hierarchy and the `HOLD` rule for unknown dates.

## 3. WebSocket entitlement and field requirements (decision required)

**Entitlement is not established.** The earlier search summary reported that V3 WebSocket is Plus-only. That is an unverified third-party statement. The Plus activation does not, by itself, prove the subscription limits, connection count or fields we need.

**Verification to do (offline, documentation only):**
- Read the official Upstox V3 market-data feed documentation directly, including subscription modes, per-mode and per-connection limits, and any plan requirement.
- Confirm which fields each mode provides: bid and ask prices and quantities, five depth levels, last trade time, message timestamp, OI, volume, and IV or Greeks.
- Record the exact modes that deliver the fields the evidence specification requires.

**Required fields for the evidence specification:**
- Message timestamp (needed for the 60-second quote-freshness rule).
- Bid and ask price and quantity.
- Five depth levels per side.
- Last trade time, OI, volume, underlying spot.
- IV and Greeks, if the specification keeps them, with their source field recorded.

**Decision needed:** after the documentation check, decide whether WebSocket is required for the 60-session evidence. If REST cannot provide message timestamps, the evidence standard for quote freshness cannot be met by REST alone.

## 4. Offline collector integration and restart testing

Build with mocks only. No network. Tests to write:

| Test | Expected result |
|---|---|
| All six indices, mock responses | Each index produces snapshots with correct keys |
| Paired CE and PE legs | Paired-leg rate computed per snapshot |
| Interrupted collection, then restart | Gap recorded as `SESSION_GAP`; no silent continuation |
| Duplicate snapshot (same time and sequence) | Refused by write-once; logged |
| Duplicate snapshot at a different sequence | Stored separately, flagged |
| API failure (non-200) | Recorded, no automatic retry |
| Rate-limit response | Recorded, collection pauses, no automatic retry |
| Token expiry (401) | Recorded as `TOKEN_EXPIRY`; stops and waits for owner |
| Credentials in input | Never written to any stored file |
| Holiday in mock calendar | Session `HOLD` |

**Restart rule:** on restart, the collector resumes the next scheduled snapshot. It never backfills silently and never re-requests a missed snapshot without a logged decision.

## 5. Exact boundaries for the future one-session pilot

Proposed boundaries, subject to separate approval:

| Item | Boundary |
|---|---|
| Date | One confirmed trading session, chosen by the owner |
| Indices | All six, or a stated subset |
| Requests | A fixed maximum, computed from the snapshot schedule and the number of legs |
| Interval | 5 minutes, 09:15 to 15:30 IST (per the existing spec) |
| Retries | None |
| Stop conditions | Any 401, 429, 5xx, network loss, or unexpected response |
| Recurring jobs | None. The paper-live job stays unloaded |
| Storage | Evidence directory only, write-once, no credentials |
| Purpose | Verify capture, timestamps, depth, storage and session evaluation |
| Counts toward 60 sessions? | No |

The pilot must not start until the stage 1 decisions are signed off and the stage 2 tests pass.

## 6. Governance

- The paper-live launchd job (`com.upstox.paperlive`) stays unloaded throughout Phase 9B.
- No Upstox requests are made under this plan.
- Strategy 11.4, production formulas and the 1% risk limit are unchanged.
- The 60-session requirement is unchanged.
- No order placement. Live trading is not permitted.
- Engine NO-GO.

## 7. Decisions requested from the owner

1. Approve the REST freshness split, including `UNKNOWN` for quote freshness on REST and the rule that illiquid options are not rejected for lacking a recent trade.
2. Approve the calendar source hierarchy (official NSE and BSE circulars) and the `HOLD` rule.
3. Authorise an offline documentation check of the Upstox V3 WebSocket entitlement and field requirements.
4. Authorise stage 2 (offline collector integration with mocks).
