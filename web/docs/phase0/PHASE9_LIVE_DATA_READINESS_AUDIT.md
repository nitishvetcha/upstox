# Phase 9 — live data readiness audit (offline)

**Label: Live-data readiness assessment.** Offline inspection of the repository only. No Upstox requests were made. Not strategy validation. Engine NO-GO. Strategy 11.4, production formulas, the 1% risk limit and the 60-session live requirement are unchanged.

Written for: the project owner, to decide what must be built before any new API access is requested.

**Research question:** can the analyzer reliably collect, timestamp, validate and preserve live market data for all six indices, in a form that could satisfy the 60-session evidence requirement?

**Short answer: not yet.** The analyzer reads live quotes for display and decisions, but it does not persist live snapshots as a time series, does not validate freshness, and does not capture depth or bid/ask quantities. Live collection cannot start until these gaps are closed.

## 1. What exists today

| Capability | Status | Evidence |
|---|---|---|
| Live quote and option-chain requests (on demand) | Exists | `src/lib/services/upstoxMarket.ts` |
| Bid and ask prices read from quotes | Exists | `upstoxMarket.ts` (bid_price, ask_price) |
| Open interest and volume read | Exists | `upstoxMarket.ts` (oi, volume) |
| `last_trade_time` read | Exists | `upstoxMarket.ts` |
| Historical candle collection with manifest and SHA-256 | Exists (historical only) | `scripts/upstox-collect.ts`, `scripts/upstox-pilot-collect.ts` |
| Request-level manifest with HTTP status and errors | Exists (historical collectors) | `manifest.jsonl` in collectors |
| Collection guard (blocked without flags) | Exists | `scripts/lib/collectionGuard.mjs` |
| Live snapshot persistence as a time series | **Missing** | No writer for live quotes or chains found |
| Bid and ask quantities | **Missing** | Not parsed |
| Market depth (five levels per side) | **Missing from the app**; present in the verification script only | Verified in `phase8-connectivity-test.ts` |
| WebSocket feed | **Missing** | No WebSocket client in `src/` or `scripts/` |
| IV and Greeks from V3 quotes | **Not present** in tested responses | Phase 8 execution result |
| Quote freshness check against snapshot time | **Missing** | Stale rule defined in docs, not implemented |
| Session-level completeness and exclusion records | **Missing** | Defined in `PHASE8_DATA_QUALITY_RULES.md`, not implemented |
| Persistent record of market closures and token expiry gaps | **Missing** | Defined in spec, not implemented |

## 2. Gap against required fields

| Required field | Available in live responses | Persisted | Gap |
|---|---|---|---|
| Bid and ask price | Yes | No | Persistence |
| Bid and ask quantity | Not parsed | No | Parser and persistence |
| Depth (five levels) | Not parsed in app | No | Parser, persistence, and check that depth is populated on live legs |
| Last trade time | Yes | No | Persistence and freshness rule |
| Snapshot time (local and UTC) | Not stored | No | Build |
| Message or quote time | Not in REST response | No | Needs WebSocket, or a defined REST substitute |
| OI and volume | Yes | No | Persistence |
| Underlying spot | Yes | No | Persistence |
| IV and Greeks | Not present in tested responses | No | Confirm field source, or mark absent |
| Populated flag per field group | Not implemented | No | Build |

## 3. Freshness and missing-data rules (not yet implemented)

Defined in `PHASE8_DATA_QUALITY_RULES.md`:
- Stale: last message older than 60 seconds at snapshot time. This applies to WebSocket messages. REST responses have no per-message time, so the rule cannot apply to REST as written.
- Snapshot interval: 5 minutes, 09:15 to 15:30 IST, weekdays.
- Clock skew above 2 seconds is flagged.
- Session included only if snapshot coverage is at least 95%, paired-leg bid and ask at least 98%, and no unexplained gap longer than 15 minutes.

Open decisions for Phase 9:
1. A freshness rule for REST data, distinct from the WebSocket rule.
2. A numeric threshold for `last_trade_time` relative to snapshot time, including for illiquid strikes.
3. Holiday, half-day and special-session calendar.

## 4. Failure, closure and gap recording (required, not built)

Each of the following must produce a recorded entry, never a silent gap:
- API failure (HTTP status and error code).
- Rate limit response.
- Token expiry at 03:30 IST.
- Network loss or timeout.
- Market closure (holiday, weekend, or outside 09:15 to 15:30).
- Partial snapshot (some instruments missing or stale).

A session with any unrecorded gap must be excluded, not counted as complete.

## 5. Evidence storage design (proposed)

- One file per snapshot, plus a per-session manifest.
- Raw response kept with its SHA-256 and request sequence.
- Retrieval time and snapshot time both stored, with UTC and IST.
- No access token or credential in any file.
- Write-once: an existing file is never overwritten.
- Each session has a status: complete, incomplete (reason recorded), or excluded (reason recorded).

The existing historical collectors already follow the write-once and manifest pattern (`upstox-collect.ts`). This can be reused.

## 6. Collection safety

**Control gap found:** `scripts/com.upstox.paperlive.plist` is a launchd job that runs `scripts/run-paper-supervisor.mjs` with `KeepAlive` and a calendar interval. It is not loaded at present (`launchctl` shows no Upstox job). If loaded, it would start a recurring loop. `scripts/paper-live.mjs` calls the paper-opportunity collect and monitor endpoints every 30 seconds by default (`PAPER_TRADE_POLL_INTERVAL_MS`). Those endpoints reach Upstox.

This is a recurring live-request process that has not been approved. It must not be loaded until it is reviewed against the approval boundaries. Recommended action: owner decision to keep it unloaded, or to disable it.

Other safety points:
- No order-placement code was found in the reviewed paths. Live trading remains not permitted.
- The collection guard blocks scripts without the flags `MARKET_DATA_PROVIDER=upstox` and `UPSTOX_COLLECTION_ENABLED=true`.
- The dashboard's auto-refresh timer was removed earlier, so the dashboard does not poll on its own.

## 7. What is needed before any new API request

1. Build the snapshot writer with the required fields and the write-once rule. Test offline with a mock response.
2. Build the validation layer: freshness, populated flags, completeness and exclusion. Test offline.
3. Build the failure and closure recorder. Test offline.
4. Decide the freshness rule for REST, and the threshold for `last_trade_time`.
5. Decide whether WebSocket is required for the 60-session evidence, and confirm the account's V3 WebSocket access (the search summary suggested Plus-only; unverified).
6. Resolve the paper-live job: keep it unloaded, or review and disable it.

## 8. Approval boundaries

| Step | Status |
|---|---|
| Offline inspection and planning (this audit) | Complete |
| Offline build and mock tests of the collector and validator | Proposed. No API use. |
| One-session API test | Separate approval required |
| Recurring 60-session collection | Separate approval required |
| Live trading or automatic orders | Not permitted |

## 9. Summary

The analyzer can read live quotes but cannot yet record them as evidence. Five things must be built before a one-session test is worth approving: the snapshot writer, the validator, the failure and closure recorder, the freshness rule for REST, and a decision on WebSocket. The paper-live job needs an owner decision before anything is loaded.

Strategy 11.4, production formulas, the 1% risk limit and the 60-session live requirement are unchanged. The engine remains NO-GO.
