# Phase 8 — offline audit (2026-11-12)

Written for: the project owner, to decide whether recurring collection can be approved. No live requests were made for this audit.

**Recommendation: do not approve recurring collection yet.** Connectivity is confirmed for four contracts. The freshness method, the data schema, the WebSocket path and the request accounting are not ready.

## 1. Request accounting

| # | Endpoint | Target | Date and approval | Result | Recorded in |
|---|---|---|---|---|---|
| 1 | `/v2/option/chain` | NIFTY, 2026-11-17 | Earlier single-request approval | HTTP 401 `UDAPI100050` (expired token) | `PHASE8_API_CAPABILITY_VERIFICATION.md`, attempt log and scope deviation section |
| 2 | `/v2/option/chain` | NIFTY, 2026-11-17 | Approved pair | HTTP 200, ATM 25300 | `phase8-option-keys.json`, scope deviation section |
| 3 | `/v2/option/chain` | BANK NIFTY, 2026-11-23 | Approved pair | HTTP 200, ATM 61200 | `phase8-option-keys.json`, scope deviation section |
| 4 | `/v3/market-quote/quotes` | Four keys | Approved single request | HTTP 200, 121 ms | Verification report, execution result section |

**Gaps in the accounting:**
- Nothing in the code writes a request ledger. Each count is reconstructed by hand in the markdown reports. The scripts print to the terminal only.
- The earlier 401 request (row 1) is not in any JSON file. It is documented in prose only.
- The earlier "2 of 2 used" statement was corrected in the appended scope deviation section. The original text is kept.
- The raw V3 response was not saved. The connectivity script stores field-presence booleans only, so the values behind the presence results cannot be re-examined.

## 2. Script safety

Checked by reading the code. No requests were made to test this.

**`scripts/phase8-option-keys.ts`:**
- One request per entry in a fixed two-item list. No retry loop, no timer, no background work.
- Failures call `process.exit(1)`. Verified in the code.
- Token is read from `.data/upstox-token.json` and never printed.
- The guard runs first. It exits with code 2 before any network call when the env vars are absent.

**Issues to fix before any further run:**
- It overwrites `docs/phase0/phase8-option-keys.json` every time it runs. A second run would destroy the evidence file. Fix: refuse to run if the output file exists.
- It records no request timestamp before the fetch and no response headers. The retrieval time is set after the response arrives.
- A network-level failure is caught, but the message does not record which request failed in the ledger.

**`scripts/phase8-connectivity-test.ts`:**
- One request. No retry. Guard runs first. Approval flag is checked before any network call.
- Accepts 1 to 4 keys. The keys are not checked against the chain output.
- It prints a summary to the terminal. It does not save the summary to a file, and it has no retrieval timestamp. The only timing is latency.
- It does not record rate-limit or other response headers.
- A network-level failure is not caught. The script throws, and nothing is written to a ledger.
- It does not check the HTTP status before building the summary. A 401 produces `returned: false` for each key, with no error code recorded.

**Background execution:** none in either script. `npm run dev:upstox` is not involved.

## 3. Freshness methodology (not yet defined)

The data quality rules set these thresholds:
- A quote is **stale** if the last message for an instrument is more than 60 seconds old at snapshot time.
- A snapshot is kept every 5 minutes, 09:15–15:30 IST, weekdays.
- Message time must fall within the 5-minute window. Clock skew above 2 seconds is flagged.
- Last trade time "must be within the session", with no numeric threshold.

**Gaps:**
- The 60-second stale rule is written for WebSocket messages, which carry a per-message time. The REST V3 response has no message time. Only `last_trade_time` is available, so the rule cannot be applied as written to REST data.
- `last_trade_time` is not a quote timestamp. An illiquid strike can legitimately have no trade for many minutes. A separate rule is needed for legs that trade rarely, and the rule as written would flag those legs as stale.
- "Within the session" needs a numeric threshold, for example N minutes before the snapshot.
- Market-hours handling (holidays, half-days, clock skew) is not specified.
- Freshness was not tested in this run. The four contracts were checked for field presence only.

## 4. Data schema

The collection specification lists these stored fields: snapshot time (local and UTC), instrument key, LTP, last trade time, bid and ask price, bid and ask quantity, five depth levels per side, open interest, volume, IV and Greeks with field source, message time, and a `populated` flag per field group.

**Gaps against this schema:**
- LTP, open interest and volume were not checked in the Phase 8 run. They are required fields.
- Message time: the REST response has none. The schema must say what goes in that column for REST data, or be restricted to WebSocket.
- IV and Greeks: not present in the V3 response for the four legs. The chain response was not inspected for Greeks in this run. The field source must be recorded once the field is confirmed.
- No stored raw sample exists. Schema decisions must be checked against real payloads, not assumptions.
- The `populated` flag per field group is specified but not implemented anywhere.

## 5. WebSocket readiness

**Code status:** no WebSocket client exists in `src/` or `scripts/`. A search found only a test file that mentions the word. The specification states the WebSocket feed is the primary method, with REST as a fallback.

**Unverified claims** (from an external review and a public search, not from Upstox's documentation page, which I have not read):
- Full-mode subscription cap: 2,000 instrument keys individually, 1,500 combined.
- Connections: 2 per user, or 5 with the Plus tier.
- A third-party source states V3 WebSocket is available only to Plus users. This is unconfirmed for this account. It must be checked against the account's actual access, not inferred.

Source for the figures above: [Upstox V3 Get Market Data Feed documentation](https://upstox.com/developer/api-documentation/v3/get-market-data-feed). The figures came from a search summary of that page, and the table was garbled in the summary. They must be confirmed on the page itself before use.

**Not defined yet:**
- Reconnect behaviour and backoff.
- Handling of a dropped connection mid-session. Each gap needs a logged reason, per the specification.
- Token expiry at 03:30 IST during a session. The specification records this as a gap. The handling code does not exist.
- How the subscription set is sized against the verified limit.

## 6. Collection acceptance criteria

These are present in the documents and were not changed during this audit:
- At least 60 sessions with full coverage.
- Snapshot coverage at least 95% per session.
- Paired-leg bid/ask at least 98% of snapshots.
- No unexplained gap longer than 15 minutes.
- Regime labels: at least 10 included sessions each, expiry sessions reported separately with at least 8.

**Gaps:**
- These criteria cannot be checked until the freshness rule (section 3) and the schema (section 4) are defined. A session cannot be counted as "full coverage" without them.
- Session counts and exclusions must be reported with reasons. No collection code produces that report yet.

## 7. Evidence integrity

The Phase 8 files are untracked in git, so no version history exists for them. Checksums taken at the time of this audit (SHA-256):

| File | SHA-256 |
|---|---|
| `docs/phase0/phase8-option-keys.json` | `51e8a9a3f56e556aa5d5fc71a635d9d2a42e2afd81ba38c489cad65026a3d534` |
| `docs/phase0/PHASE8_API_CAPABILITY_VERIFICATION.md` | `60042769ffef3b19958942c8e4a55d9817b53d89e7ce86c9bc2198355c539e78` |
| `scripts/phase8-option-keys.ts` | `368917622327ab35cec5c275711e694b01c2028ed926a7bc14244bcd1778639a` |
| `scripts/phase8-connectivity-test.ts` | `e8215e089b393f07f7181be9ceafce04fa3a626f8b117056a7b5ff13d6525fb5` |
| `scripts/lib/collectionGuard.mjs` | `a60e99cb7995dd7354acc71016f79410bbd37a16ca70a2959137c8f108e1bc40` |

Commit these files, or keep these checksums, so any later change is detectable.

## 8. Checks that need new API access

The following cannot be settled offline. Each one needs a separate written approval with a request limit:
1. Freshness: a single repeated sample of the same four keys, to see how `last_trade_time` moves across time. Needs a request budget and a time window.
2. Rate-limit headers: at least one request with header capture.
3. Closed-market behaviour: one request outside market hours, for comparison.
4. LTP, open interest and volume: fields not yet checked.
5. Greeks in the chain response: a chain request with the field source recorded.
6. WebSocket: subscription limit, connection limit and account access. These need a documentation check first. A live connection test would need its own approval.
7. Other strikes and expiries: needed before any claim beyond the four tested contracts.

## 9. Required before recurring collection is considered

- Fix the output overwrite in `phase8-option-keys.ts`.
- Add a request ledger that writes before each fetch and records the outcome after.
- Save the raw V3 response to a local file, excluding the token. Field values, not just presence, need to be kept for review.
- Define the freshness rule for REST data and for WebSocket data separately.
- Confirm the WebSocket limits and account access on the official documentation page.
- Implement the per-field `populated` flags and the session inclusion checks.
- Commit the Phase 8 files so they have version history.

Strategy 11.4, production formulas and the 1% risk limit are unchanged. The engine remains NO-GO. Recurring collection has not been started.
