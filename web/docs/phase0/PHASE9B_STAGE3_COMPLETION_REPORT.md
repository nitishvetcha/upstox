# Phase 9B Stage 3 — WebSocket client and offline verification completion report

**Label: offline implementation and verification, not live validation.** No WebSocket connection was opened. No Upstox API request was made. Engine remains **NO-GO**. Strategy 11.4, production formulas, the 1% risk limit, and the 60-session requirement are unchanged.

Date: 2026-11-12.

## 1. Files created and modified

| File | Change |
|---|---|
| `src/lib/liveEvidence/proto/MarketDataFeed.proto` | Added the official Upstox V3 response schema. |
| `src/lib/liveEvidence/wsDecoder.ts` | Added protobuf loading, decoding, test encoding, and normalized feed extraction. |
| `src/lib/liveEvidence/wsClient.ts` | Added injected transport client, official binary subscription request encoder, message handling, deduplication, missing-instrument detection, silence checks, disconnect/gap/reconnect controls, and evidence-record mapping. |
| `src/lib/liveEvidence/wsClient.test.ts` | Added mock-only schema, decoding, subscription, six-index, depth, timestamp, silence, duplicate, disconnect, and reconnect tests. |
| `src/lib/liveEvidence/collector.ts` | Added the WebSocket snapshot adapter to the existing validator, write-once writer, manifest, and failure log. |
| `src/lib/liveEvidence/wsIntegration.test.ts` | Added decoded-message-to-collector integration tests. |
| `package.json`, `package-lock.json` | Added one pinned direct dependency, `protobufjs@8.8.1`; lockfile adds its `long@5.3.2` dependency. |
| `docs/phase0/PHASE9B_CALENDAR_SOURCE_STATUS.md` | Recorded official calendar sources and unresolved HOLDs. |
| `docs/phase0/PHASE9B_STAGE3_COMPLETION_REPORT.md` | Added this report. |

The worktree already contained extensive unrelated changes before Stage 3. They were preserved.

## 2. Protobuf schema source and hash

- Official documentation: `https://upstox.com/developer/api-documentation/v3/get-market-data-feed/`
- Official schema URL: `https://assets.upstox.com/feed/market-data-feed/v3/MarketDataFeed.proto`
- Schema: proto3, package `com.upstox.marketdatafeederv3udapi.rpc.proto`, 2,259 bytes.
- SHA-256: `3e1c939dce2c83a3fef91405c5ca268dfa089aae973319f56685f12a5afcf612`
- The test suite recomputes and pins this hash.

The schema defines response messages only. Official documentation separately specifies subscription requests as UTF-8 JSON sent in a binary WebSocket frame. The implementation follows that distinction.

## 3. Decoder package and version

- Direct dependency: `protobufjs@8.8.1`, exact-pinned, BSD-3-Clause.
- Transitive dependency: `long@5.3.2`, Apache-2.0.
- `npm ls protobufjs long --depth=1` confirms only that dependency edge.
- No existing dependency version changed as part of the Stage 3 install.
- `npm audit --omit=dev` reported zero production vulnerabilities at installation time.
- Compatibility: the official schema loads, including `google/protobuf/wrappers.proto`; TypeScript typecheck passes.

## 4. Mock message decoding results

- Official `FeedResponse` messages encode and decode from mock bytes.
- `marketFF`, `firstLevelWithGreeks`, LTPC fields, request mode, OI, volume, IV, Greeks, and timestamps normalize successfully.
- Invalid protobuf bytes produce a recorded `DECODE_ERROR`; they do not crash the client.
- Duplicate instrument/timestamp messages are recorded and not delivered twice.
- No access token or credential is included in decoded or stored mock evidence.

## 5. Six indices and paired CE/PE tests

One mock `full_d5` response contains 12 instruments: paired CE and PE legs for NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX, and BANKEX.

Result: 12 decoded legs, six distinct indices, six CE legs, six PE legs, and no missing-instrument event. Instrument metadata is injected; unknown keys remain explicitly `UNKNOWN` rather than being guessed.

## 6. Five-level depth and timestamp extraction

- Five bid and five ask levels are extracted from `marketFF.marketLevel.bidAskQuote`.
- A three-level mock is `INCOMPLETE` under the five-level rule.
- `FeedResponse.currentTs` becomes each leg's `quoteTimeUtc`; LTPC `ltt` becomes `lastTradeTime`.
- Epoch values are milliseconds, as documented by official examples and confirmed by ISO conversion tests.
- A 30-second quote age validates; a 90-second quote age is `INCOMPLETE` under the existing 60-second WebSocket freshness rule.
- Response enum `RequestMode` is `full_d5`; the documented subscription request name is `full`. Both are tested and are not conflated.

## 7. Subscription, heartbeat, disconnect, and reconnect tests

- Subscription encoder produces `{guid, method:"sub", data:{mode:"full", instrumentKeys:[...]}}` as UTF-8 bytes.
- Empty GUID or key list is refused.
- On open, the client sends one injected subscription payload.
- With no subscription encoder, it records `SUBSCRIBE_UNAVAILABLE`, sends nothing, and closes.
- There is no undocumented application heartbeat frame. `checkSilence` records `SILENT_FEED` after the configured interval and takes no automatic network action.
- Close records `DISCONNECT`. Reconnect is explicit/owner-driven, records `SESSION_GAP` and `RECONNECT`, and never backfills or replays missed data.
- Reconnect limits produce `GAVE_UP`; further connections are refused.

## 8. Evidence collector integration

Decoded mock feeds are mapped to the existing `SnapshotRecord`, validated by `validateSnapshot`, then passed through `storeWebSocketSnapshot` in `collector.ts`.

The shared path writes a write-once snapshot, appends the manifest row, records duplicate failures, preserves the raw-message hash, and refuses overwrite. Integration tests confirm a fresh 12-leg record is `VALID`/`STORED`, a second write is `DUPLICATE`, and stored output contains no credential.

## 9. NSE/BSE calendar source references

Full references and dates are in `PHASE9B_CALENDAR_SOURCE_STATUS.md`.

- NSE F&O 2025: `NSE/FAOP/65588`, issued 2024-12-13.
- NSE 2025 Muhurat timing: `NSE/CMTR/70319`, issued 2025-09-22; normal market 13:45–14:45 IST on 2025-10-21.
- NSE F&O 2026: `NSE/FAOP/71777`, issued 2025-12-12.
- NSE capital-market 2026: `NSE/CMTR/71775`, issued 2025-12-12.
- BSE equity 2025: official Equity Segment Master Circular dated 2025-04-29, section 2.2.

Unresolved: NSE/BSE 2024, BSE 2026, and the later BSE 2025 Muhurat timing notice. These remain `HOLD`. Consequently, a combined six-index 2026 session is not calendar-cleared.

## 10. Full regression and lint results

| Check | Result |
|---|---|
| Live-evidence scoped tests | 51/51 pass |
| Scoped ESLint, `src/lib/liveEvidence/` | Pass, no findings |
| TypeScript, `tsc --noEmit` | Pass |
| Full regression, `npm test` | 2,788 tests, 288 suites, 0 failures, 0 cancelled, 0 skipped |
| Full lint, `npm run lint` | Fails on 35 errors and 101 warnings in pre-existing files outside `src/lib/liveEvidence/`; Stage 3 scoped lint is clean. |

The full-lint failures include existing `no-explicit-any` findings in research scripts, existing React purity/effect findings in UI components, and CommonJS browser-check imports. None is in a Stage 3 file, and unrelated cleanup was not authorized or attempted.

## 11. Network and governance confirmation

- The only Upstox network access was downloading the explicitly approved official `.proto` file and reading official documentation.
- **No WebSocket connection was opened.** Every transport in tests is an in-memory mock.
- **No Upstox API request was made.** No authorized-feed URL was requested.
- No one-session pilot, recurring collection, or 60-session collection ran.
- The paper-live job was not loaded or run.
- No production formula, strategy threshold, risk limit, or execution code changed.
- Engine remains **NO-GO**. A bounded one-session pilot still requires separate owner approval after review of this report and resolution/acceptance of calendar HOLDs.
