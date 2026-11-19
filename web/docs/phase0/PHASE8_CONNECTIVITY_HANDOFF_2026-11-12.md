# Phase 8 connectivity handoff (2026-11-12). No API request was made for this report.

## 1. Instrument keys (task 1)
**Not available from retained data.** The four ATM CE/PE instrument keys were not written to disk by the app. The option-chain responses are held only in memory for the cache TTL and were not saved. The keys therefore cannot be identified without reading a chain response again.

Expiry dates confirmed from the startup log (the dev server's own log lines):
| Underlying | Expiry used by the app | Source in log |
|---|---|---|
| NIFTY | 2026-11-17 | `/v2/option/chain` with `expiry: 2026-11-17`, HTTP 200 |
| BANK NIFTY | 2026-11-23 | `/v2/option/chain` with `expiry: 2026-11-23`, HTTP 200 |

Instrument key counts from the log: NIFTY 142 strikes with keys; BANK NIFTY 189 strikes with keys. ATM strike and keys: BLOCKED until a chain response is read again.

## 2. Can the test use those keys without another chain request? (task 2)
No, not with the data on hand. The test needs four exact keys. Keys could be taken from a chain response, but none was kept. Re-reading the chain would be another request, which needs approval.

A cleaner option: save the ATM keys to a local file the next time a chain is read under approval. The test can then use that file and make no chain request.

## 3. Approval guard and collection safety (task 3)
Checked in `scripts/phase8-connectivity-test.ts`:
- Requires `MARKET_DATA_PROVIDER=upstox` and `UPSTOX_COLLECTION_ENABLED=true` (collection guard, verified: refuses with "No network request was sent" when unset).
- Requires `PHASE8_LIVE_TEST_APPROVED=yes` (verified: prints "NOT RUN" when unset).
- Accepts at most four keys; makes one request; no loop, no timer, no collector, no order endpoints.
- Registered in `scripts/lib/collectionGuard.mjs` (a test enforces that every network script is registered).
Result: the script cannot start recurring collection.

## 4. V3 endpoint and fields inspected (task 4)
Endpoint: `GET {UPSTOX_API_BASE}/v3/market-quote/quotes?instrument_key=…` (comma-separated keys).
Field mapping now matches the app's own V3 parser (`src/lib/services/optionPriceVerification.ts`):
- Entries are keyed by `instrument_token`, which equals the instrument key.
- Bid price and quantity: `depth.buy[]` levels (`price`, `quantity`).
- Ask price and quantity: `depth.sell[]` levels.
- Depth levels counted per side.
- Last trade time: top-level `last_trade_time`.
- IV or Greeks: `option_greeks` or `iv` (presence only; the field names are not confirmed by any stored response).
Correction: the earlier version of the test read different field names (`market_data.bid_qty`, `depth.buy` as a flat list). Those were guesses and have been replaced.

## 5. Can a single four-key request run now? (task 5)
Not yet. Blockers, in order:
1. **Keys:** no retained chain response, so the four ATM keys are unknown. One approved chain request per underlying is needed (or a saved key file).
2. **Approval:** the approved chain request was used and failed (401, expired token). The owner must approve the chain request(s) again after a fresh login.
3. **Unexpected traffic:** the dev startup made many requests outside the approved test (dashboard loads: market quotes for all indices, option chains, historical candles, futures, news RSS and NewsAPI). This is a separate defect (see section 6).
4. **Field verification:** no stored V3 response confirms that depth, quantities, last trade time or Greeks are populated for option contracts. The test is the only way to establish that.

## 6. Other findings
- **Background traffic (fixed in code):** the top bar re-ran the dashboard's data loading every five minutes. Removed. Market data now updates only on the Refresh data button. Startup itself still loads the dashboard data once, which is expected.
- **Reload loop in an open tab (not reproduced):** a clean headless browser redirected once to sign-in and stopped. Likely a stale session in the open tab; closing tabs stops it.
- **Historical options PROVIDER_BLOCKED, UDAPI100011:** separate issue, not investigated in this report. The error code meaning is not confirmed here.
- **Token:** the OAuth token shown valid until 13/11/2026 03:30 IST. It expires daily.

## 7. Recommendation
1. Stop the dev server (Ctrl+C) so no further requests are made.
2. Owner approves exactly one NIFTY chain request and one BANK NIFTY chain request, to retain ATM keys to a local file (no other requests).
3. Owner approves the single four-key V3 test using those keys.
4. Result recorded in PHASE8_API_CAPABILITY_VERIFICATION. Collection stays off until then.
Engine NO-GO. No production change.
