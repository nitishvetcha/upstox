# Rate-limit and endpoint-limit test — execution specification

**Status: SPECIFICATION ONLY. NOT AUTHORIZED. No Upstox API call has been made.** Execution requires explicit owner approval of the request list in section 3. Production remains NO-GO. Strategy 11.4 is frozen.

## 1. Purpose

Measure, on a bounded sample:
- The bar cap per candle request (does the endpoint truncate, and at what window length).
- Which candle intervals return data for expired options.
- Rate-limit behaviour and response headers.

It does not acquire data for any backtest.

## 2. Endpoints and parameters (from the official Upstox expired-instrument documentation)

| Endpoint | Parameters | Used for |
|---|---|---|
| `GET /v2/expired-instruments/historical-candle/{expired_instrument_key}/{interval}/{to_date}/{from_date}` | key (URL-encoded `|`), interval, to_date and from_date as `YYYY-MM-DD` | Bar cap, interval support |
| `GET /v2/expired-instruments/option/contract?instrument_key=…&expiry_date=YYYY-MM-DD` | underlying key, expiry | Header and response measurement only |
| `GET /v2/expired-instruments/expiries?instrument_key=…` | underlying key | Header measurement only |
| `GET /v3/historical-candle/{instrument_key}/days/1/{to}/{from}` | underlying key, daily | One underlying check for the spot reference |

Documentation note: the expiries page lists `instrument_key` under path parameters in its table, while its curl sample sends it as a query parameter. The query form is used here, because the sample is the working form.

Interval values: the documentation lists `1minute, 3minute, 5minute, 15minute, 30minute, day`. The error message for an invalid interval lists a different set (`1minute, 30minute, day, week, month`). This test checks each interval, so the conflict is tested rather than assumed.

## 3. Sample contracts (from `docs/phase0/historical-coverage-probe.json`, already-known keys)

| Label | Expired instrument key | Strike | Expiry |
|---|---|---|---|
| A | `NSE_FO|40039|09-11-2026` | 25050 | 2026-11-09 (NIFTY ATM CE) |
| B | `NSE_FO|49415|27-10-2026` | 54000 | 2026-10-27 (BANKNIFTY ATM CE) |
| C | `BSE_FO|1134391|05-11-2026` | 79300 | 2026-11-05 (SENSEX ATM CE) |

Keys are not re-discovered by this test. Re-discovery would add requests.

## 4. Planned request sequence (35 requests; hard cap 35)

| Block | Requests | What it measures |
|---|---|---|
| **A. Bar cap, 30-minute** | 6 | Key A, `30minute`, window ending 2026-11-09, lengths 14, 30, 60, 90, 180 and 365 days |
| **B. Interval support** | 4 | Key A, 14-day window, intervals `1minute`, `5minute`, `15minute`, `day` |
| **C. Rate-limit behaviour** | 20 | Key A, `30minute`, 14-day window, repeated 20 times, one request per second |
| **D. Other indices** | 2 | Keys B and C, `30minute`, 14-day window |
| **E. Metadata headers** | 2 | One expiries call (NIFTY) and one contract-list call (NIFTY 2026-11-09) |
| **F. Underlying spot check** | 1 | `NSE_INDEX|Nifty 50` daily candle, 7-day window ending 2026-11-09 |
| **Total** | **35** | |

Why 35 and not 50: the test only needs to answer its questions. Fifteen extra requests have no defined purpose yet. If the owner wants a larger budget, the extra requests need a stated purpose and must be added to this table before approval.

## 5. Request discipline

- **One request at a time.** No parallel calls.
- **Fixed pacing:** one second between requests (block C). Blocks A, B, D, E and F run in the order listed, with the same one-second spacing.
- **No automatic retries of any kind.** A failed request is recorded and the test stops (section 7).
- **Exact order:** the sequence in section 4 is hard-coded. No loop over expiries, indices or contracts. Nothing is generated from earlier responses except the window dates for block A, which are fixed in advance.
- **Hard cap:** the runner refuses to send request 36.

## 6. What is recorded for each request

- Sequence number and block label.
- Start timestamp (UTC) and duration in milliseconds.
- Endpoint path and parameters (no token).
- HTTP status.
- Response headers, excluding `authorization`, `set-cookie` and any header containing a credential. Header names and values are kept for rate-limit headers.
- Response body SHA-256 and byte length. The body itself is stored in a file named by sequence number, so the bar counts can be checked.
- Candle count, first and last timestamp, and whether the count equals the window's expected bars (for block A, to show truncation).
- Error code and message when present.

## 7. Stop conditions (immediate)

The test stops at the request where any of these happens. The stop is recorded, and no further request is sent.

| Condition | Action |
|---|---|
| HTTP 401 | Stop. Owner must re-authenticate. No refresh by the test. |
| HTTP 429 | Stop. Record headers, including any retry-after value. Owner reviews. |
| Any HTTP 5xx | Stop. Record. |
| Network failure or timeout | Stop. Record. |
| Response shape not as documented (no `status: success`, or missing `data`) | Stop. Record. |
| Error code not expected for the request | Stop. Record. |
| Request 36 would be sent | Refused by the runner. |

No automatic retry exists in any path.

## 8. Token handling

- The test uses the existing stored token only. It does not refresh, generate or print it.
- Before the first request, the runner checks the token's expiry field offline. It stops if the token is missing, invalidated or expired.
- The token value is never written to any output file.
- Current token status (offline check, no request): expires 2026-11-12T22:00:00Z, not invalidated.

## 9. Confirmation that no full acquisition can start

- The runner has no loop over the expiries list, the contract list or the index list. Its request list is a fixed array of 35 entries.
- It writes only to a dedicated test output directory (for example `.research-data/rate-limit-test/`). It refuses to run if that directory already exists.
- It does not write to the historical pilot file or to any acquisition manifest.
- Approval covers this single run. A second run needs a second approval.

## 10. Expected usage, cost, duration and storage

| Item | Estimate |
|---|---|
| Requests | 35 (max 35) |
| Duration | About 40 to 60 seconds of pacing, plus response time |
| Data volume | Under 1 MB of raw responses |
| Storage impact | Negligible |
| Monetary cost | **Not established.** Upstox pricing for these endpoints was not checked. Plus access is active. |
| Rate-limit risk | Block C is designed to reveal limits. A 429 stops the test early; no account penalty beyond the stop is known. |

## 11. Risks

1. **Unknown rate limit.** Block C could trigger a 429 or a temporary block on the account. The stop rule limits the damage to the test itself. The effect on other activity is unknown.
2. **Token expiry during the run.** The run takes about a minute. The token expires at 22:00 UTC. A 401 stops the run cleanly.
3. **Truncation misread as a complete window.** Block A checks the count against the expected bars for each window length. Without that check, truncation could look like a short window.
4. **Interval conflict in the documentation.** Block B tests each interval. A returned error does not establish the cause on its own.
5. **Result depends on the sample.** The three sample contracts are from recent expiries. Limits for older expiries may differ.

## 12. What the owner is asked to approve

1. The 35-request sequence in section 4, with the hard cap of 35.
2. The stop conditions in section 7.
3. The one-second pacing and zero-retry rule.
4. Use of the existing token only, with no refresh.
5. The output directory and the single-run limit.

Only after approval will the runner be written, tested offline with mocks, and executed once.

## 13. Governance

- No Upstox API call has been made for this specification.
- No token has been generated or refreshed.
- No strategy logic changed.
- No live service started. The paper-live job remains unloaded.
- Production remains NO-GO.
