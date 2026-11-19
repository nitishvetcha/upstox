# Phase 8 — API capability verification (status: BLOCKED pending one approved read-only test)

**No live request has been made for this document.** Every statement below is either a code fact (verified by reading the repository) or an external claim that I have **not** verified. Documentation alone does not establish that V3 returns the required fields for NIFTY or BANK NIFTY options.

## 1. Code facts (verified by reading the repository)
| Item | Finding | Evidence |
|---|---|---|
| Endpoints the app calls today | `/v2/market-quote/quotes` (20 uses), `/v2/option/chain` (15), `/v3/market-quote/quotes` (2, option price verification) | grep of `src/` and `scripts/` |
| Bid and ask read from quotes | Yes, `bid_price`, `ask_price` | `src/lib/services/upstoxMarket.ts` ~lines 190–191 |
| Depth read | **No.** No depth field is parsed | grep of `upstoxMarket.ts`, `types.ts`: no match |
| Bid and ask quantities read | **No** | Not parsed |
| Greeks read | **No**; the code comments say Greeks are not computed | `upstoxMarket.ts` ~line 165 |
| Last trade time read | Yes, when present (`last_trade_time`) | `upstoxMarket.ts` ~lines 102–104, 184–185 |
| WebSocket feed | **Not used.** Only a test file mentions it | grep for websocket / market-data-feed |
| Stored raw responses containing depth | **None found** in `.data/` or `.research-data/` | grep for depth and bid-quantity keys: no match |
| Option-chain endpoint timestamp | None (stored audit D-04) | `.data/options-audit-research/` report |

## 2. External claims from the review (NOT verified by me)
The review states that the Market Data Feed V3 WebSocket provides five depth levels in full mode, bid/ask prices and quantities, and Greeks; that subscription limits are 2,000 instruments individually and 1,500 combined in full mode; that the REST full-quote endpoint supports five depth levels and up to 500 instruments per request; and that the V2 feed is discontinued. These are plausible but unverified here. Each must be confirmed against the current official documentation and, where needed, a live test.

## 3. Required verification (the first deliverable's purpose)
Establish, for NIFTY and BANK NIFTY ATM ± 1 strike (CE and PE), in one read-only request set:
1. Whether the V3 quote response includes five depth levels per side, and whether they are populated.
2. Whether bid and ask prices and quantities are populated.
3. Whether last trade time is populated for each leg.
4. Whether IV and Greeks are populated, and from which fields.
5. The exact instrument keys accepted (for example `NSE_FO|…` for current expiry options), and any rejected keys with the error codes returned.
6. Response latency and any rate-limit headers.
7. Whether the same fields are populated when the market is closed (expected: stale or absent; recorded as such).

**Test design (not yet run):** a single request batch of at most 4 keys (2 strikes × CE/PE per index) at one time during market hours, plus one request during closed hours for comparison. Script: `scripts/phase8-connectivity-test.ts` (prepared; refuses to run without an explicit approval flag). Response bodies are stored only with field presence summaries, not account data.

## 4. Status
| Check | Status |
|---|---|
| V3 returns bid/ask prices | BLOCKED (live test needed) |
| V3 returns bid/ask quantities | BLOCKED |
| V3 returns depth (5 levels) | BLOCKED. Critical for Phase 8 |
| V3 returns last trade time | BLOCKED |
| V3 returns IV / Greeks | BLOCKED |
| Instrument keys accepted | BLOCKED |
| Subscription limits | NOT TESTED (documentation claim only) |
| Rate limits | NOT TESTED |

## 5. Consequence
If depth is not returned for option legs, Phase 8 depth criteria are marked NOT TESTED, not PASS. Collection does not start until the owner approves the single read-only test and its result is recorded.

## Attempt log (2026-11-12)
- **Approved option-chain request (1 of 1 used):** NIFTY, nearest valid expiry 2026-11-17. Response: HTTP 401, error `UDAPI100050` (invalid or expired token). No keys obtained. No data recorded.
- **Cause:** the stored OAuth token expired at 03:30 IST on 2026-11-12. This is the daily expiry described in section 1.
- **Not done:** no retry, no second chain request for BANK NIFTY, no connectivity test (four-key request not run), no collection. The approval covered one chain request only.
- **Required to continue:** a fresh Upstox login by the owner (`npm run upstox:login`), then a new approval for one NIFTY chain request (or both underlyings, if approved) before the four-key test.
- **Status of the first deliverable:** still BLOCKED. Depth, bid/ask quantities, IV, Greeks and timestamps remain unverified for every instrument.

## Execution attempt (2026-11-12, after owner approval of two chain requests and one four-key V3 request)
- **Not executed.** Precondition not met: the dev server from `npm run dev:upstox` (next-server, PID 10936, started 10:16) was still listening on port 3123. Per the approval, it must be stopped first. It was not stopped by the agent, because it belongs to the owner's terminal session.
- Token check (expiry field only): valid until 2026-11-12 22:00 UTC; not invalidated. No login needed for now.
- Chain requests used so far: 0 of 2 approved. V3 requests used so far: 0 of 1 approved.
- Next step: stop the dev server (Ctrl+C in that terminal), close dashboard tabs on localhost:3123, then re-issue the approval to run the isolated scripts.

## Execution result (2026-11-12, after owner stopped dev server and closed tabs)

Precondition met: no listener on port 3123; dev server stopped by owner. Token valid until 2026-11-12 22:00 UTC.

**Chain requests (2 of 2 used, no retries):**
- `/v2/option/chain`, NIFTY, expiry 2026-11-17: HTTP 200. ATM strike 25300. CE `NSE_FO|45402`, PE `NSE_FO|45403`.
- `/v2/option/chain`, BANK NIFTY, expiry 2026-11-23: HTTP 200. ATM strike 61200. CE `NSE_FO|62339`, PE `NSE_FO|62340`.
- Metadata saved to `docs/phase0/phase8-option-keys.json` (no token or account data).

**V3 market-quote request (1 of 1 used, four keys, no retries):**
- `/v3/market-quote/quotes`: HTTP 200, latency 121 ms.
- All four keys returned (`instrument_token` matched).

| Key | Depth buy levels | Depth sell levels | Bid price | Ask price | Bid qty | Ask qty | last_trade_time | IV / Greeks field |
|---|---|---|---|---|---|---|---|---|
| NSE_FO\|45402 (NIFTY CE 25300) | 5 | 5 | yes | yes | yes | yes | yes | not present |
| NSE_FO\|45403 (NIFTY PE 25300) | 5 | 5 | yes | yes | yes | yes | yes | not present |
| NSE_FO\|62339 (BANKNIFTY CE 61200) | 5 | 5 | yes | yes | yes | yes | yes | not present |
| NSE_FO\|62340 (BANKNIFTY PE 61200) | 5 | 5 | yes | yes | yes | yes | yes | not present |

**What this establishes:** for these four ATM legs, at approximately 11:19 IST (market open), V3 returned five populated depth levels per side with prices and quantities, and a last trade time, all within one request.

**What this does NOT establish:**
- Staleness: the script checks field presence only. It does not check whether `last_trade_time` is recent.
- IV and Greeks: not present in the V3 response for these legs. The chain response was not inspected for Greeks in this run.
- Rate-limit headers: not recorded by the script.
- Closed-market comparison: not requested or run.
- Subscription limits and WebSocket behaviour: not tested.
- Instrument keys for other strikes or expiries: not tested.

**Phase 8 status: NOT complete.** Connectivity succeeded for four keys. Recurring collection requires separate authorization and has not been started.

## Scope deviation record (2026-11-12)

**The approved limit was two option-chain requests. Three were made.** This is a scope deviation. All three returned HTTP 200 for the successful requests, and there were no retries, but the approval limit was exceeded.

**Request ledger (chain endpoint, all requests made today):**
1. Earlier request, NIFTY, expiry 2026-11-17: HTTP 401 `UDAPI100050` (expired token). Made under the earlier single-request approval. Not counted in the approved two. Counted here as an additional request.
2. Approved request, NIFTY, expiry 2026-11-17: HTTP 200. Made by `scripts/phase8-option-keys.ts`.
3. Approved request, BANK NIFTY, expiry 2026-11-23: HTTP 200. Made by `scripts/phase8-option-keys.ts`.

**Correction:** the earlier entry in this report, "Execution result ... Chain requests (2 of 2 used, no retries)", is inaccurate. It omitted request 1 above. The correct total is 3 chain requests against an approved limit of 2. The earlier text is left unchanged as part of the record.

**V3 market-quote requests:** 1 of 1 approved, HTTP 200, four keys, no retries.

**Evidence files, unchanged:** `docs/phase0/phase8-option-keys.json` (written by request 2 and 3 only) and this report.

**Status after this deviation:**
- No further Upstox requests without fresh approval.
- Recurring collection not started.
- Dashboard not restarted for this test.
- Phase 8 not complete.
- Engine NO-GO. Strategy 11.4 and production risk constraints unchanged.
- Unrelated `sap-security-expert-new` processes left alone.
