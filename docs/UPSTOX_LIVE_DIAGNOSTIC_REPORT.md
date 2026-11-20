# Upstox Live Diagnostic Report

Date: 2026-11-06 (IST), market OPEN at the time of inspection (10:05 IST). Written for: the project owner and reviewers.

Scope: read-only diagnosis of the recommendation engines' STALE classification, `INSUFFICIENT_TECHNICAL_DATA`, `NO_VALID_STRATEGY`, unknown lot sizes, and the `UDAPI100011` provider error.

**How this was done.** Code paths, local files and the protected-data metadata only. No market-data request, no OAuth refresh, no token generation, no backtest, no collector, and no call to the diagnostic or health endpoints (each of those issues live Upstox requests). Nothing was written to `.data/` or `.research-data/`. No token value or secret was read or printed.

**Key limit.** The live values (ages, `last_trade_time`s, source flags) exist only in the running server's memory and in your browser. I could not read them without making a request, which the brief forbids. Where the report depends on a live value, it says so, and §9 lists the one artefact that settles each question.

## 1. Authentication status (metadata only)

| Credential | Where | State | Used for market data? |
|---|---|---|---|
| OAuth token | `web/.data/upstox-token.json` (protected) | Issued 2026-11-03 12:09 UTC; **expired** 2026-11-03 22:00 UTC; no invalidation recorded | No. It is shadowed (see below). |
| Analytics token | `UPSTOX_ANALYTICS_TOKEN` in `web/.env.local` (one entry; value not read) | Configured. Accepted at startup, per your report of `connected: true` (see below). | **Yes.** It takes priority over the OAuth token. |

**Why the server shows VALID.** `tokenStatus()` in `src/lib/services/upstoxAuth.ts` returns `VALID` for any non-empty `UPSTOX_ANALYTICS_TOKEN`, and skips the expiry check entirely. `getAccessToken()` returns the analytics token first. So the VALID status describes the analytics token, and the expired OAuth file is never consulted. The `?verify=1` check adds one real read-only quote call with that token, which is why the startup `connected` flag reflects an accepted request. The analytics token's own expiry is not checked anywhere in the code, and I cannot check it from here.

**Note on the OAuth file.** Its state is unchanged since the 2026-11-03 expiry, so no re-authorisation has been written to disk. Whatever you did after 11-03 went to the analytics token path, or to a file I have not found. Confirm which.

Process environment: I could not confirm from `ps` whether the server inherited the analytics variable, because Next.js loads `.env.local` after start-up. The VALID status and the code path are the evidence.

## 2. Market data status

| Item | Finding |
|---|---|
| Market clock | OPEN at 10:05 IST, Friday 2026-11-06 (session 09:15–15:30). So the 120-second live threshold applies to every quote. |
| Spot quotes | NIFTY and BANK NIFTY spot available (your report). |
| Option chains | Available. NIFTY 135 strikes, BANK NIFTY 154 strikes (your report). |
| Both diagnostics | `READY · data STALE`, `NO_TRADE`. |

## 3. Technical input freshness table

Rules are taken from code. The "live value" column is the one thing I cannot fill in: it is in the diagnostic's `freshness` object and in the running server.

| Input | Upstox source | Timestamp used | Freshness rule | Cache (TTL) | Live value | Available? |
|---|---|---|---|---|---|---|
| Spot quote (NIFTY, BANK NIFTY) | `/v2/market-quote/quotes`, underlying key | `last_trade_time` of the index quote | LIVE < 30 s; AGING 30–120 s; **STALE > 120 s**. **Missing timestamp during OPEN → STALE.** | 5 s | not observed | Yes (price) |
| Option chain | `/v2/option/chain` | max `last_trade_time` across contracts | Chain is LIVE only if the verifier passes (below); otherwise fallback to the same max-LTT rule | 15 s | not observed | Yes (rows) |
| Chain verifier | `/v3/market-quote/quotes` for the requested ATM-near contracts (up to seven strikes around ATM, `_maxStrikesAtm = 7`) | each contract's `last_trade_time`, plus LTP consistency with the chain | Each contract LIVE only if LTT ≤ 30 s and LTP consistent | per chain fetch | not observed | Partly |
| Intraday candles, 15m (spot) | `/v3/historical-candle/intraday/...` plus history `.../to/from` | candle timestamps; fetch time | Source is LIVE whenever the series is non-empty. **No age check on candle data.** Engine staleness check: fetch age > 300 s | intraday 60 s; history 1 h | not observed | Yes (per startup report; see §6) |
| Daily candles, 1d (spot) | `/v3/historical-candle/...` 1d | completed days | as above | 15 min | not observed | Yes (inferred) |
| Opening 15m candles | as 15m | first two bars of session | as 15m | as 15m | not observed | Yes (inferred) |
| Futures VWAP | futures contract candles | futures fetch | Excluded from `freshness` object; engine check if `UNAVAILABLE` | per futures plan | not observed | Not verified |
| IV percentile | none on the live path (`ivPercentile: null`) | — | Not a freshness input | — | null | **No** (note only, see below) |
| Breadth | constituent quotes (`/v2/market-quote/quotes`, 50 or 14 symbols) | constituent `last_trade_time` (falls back to fetch time when absent) | engine staleness check: fetch age > 150 s | 5 s | not observed | Yes |
| News | RSS feeds | article publish time | LIVE ≤ 6 h; AGING ≤ 24 h; STALE beyond. **Mapped to LIVE or UNAVAILABLE only in the snapshot, so news cannot make the overall label STALE.** | cached | — | Yes (sentiment) |

Notes:
- The diagnostic's `freshness` object reports the raw `source` of five inputs (spot, optionChain, technicals, news, breadth). The overall label is `STALE` if any raw source is `STALE`.
- Missing-IV-percentile is a scoring note, not a blocker. The volatility factor is still computed with direction zero.

## 4. Why both engines say "data STALE"

The overall label is set from the raw source of the spot quote, the chain, or breadth. Each of those can only be `STALE` in one of two ways:

1. **The timestamp is missing, and the market is OPEN.** The quote rule falls through to `STALE` when `last_trade_time` is absent during OPEN (`upstoxMarket.ts`, `liveQuoteSource`).
2. **The timestamp is older than 120 seconds.** The quote and chain both use the last-trade time.

For the chain there is a further route: the verifier needs every requested contract (up to seven strikes around ATM) to be LIVE and consistent. If any one is AGING, STALE or MISMATCH, the chain falls back to the rule above. Near-ATM strikes usually trade often. But the November research rounds showed that illiquid strikes often went minutes without a trade (44.8% of samples were STALE, p90 age 5,387 s). A single quiet contract among the requested ones is enough to flip the chain.

**Discriminating check (no new request needed).** The diagnostic JSON you already have contains `freshness.spot`, `freshness.optionChain`, `freshness.technicals`, `freshness.breadth`. Read them off:
- `spot` = `STALE` and `technicals` = `LIVE`: the index quote's timestamp is the cause. Likely the index quote has no `last_trade_time` (indices often do not trade). Confirm by reading the quote's raw `last_trade_time` field in your browser network log.
- `optionChain` = `STALE` only: a sampled contract is quiet, or the contract timestamps are absent.
- `breadth` = `STALE` only: constituent timestamps.

I cannot tell which of these is true from the repository alone. The first is the most likely, because the spot path has no fallback at all.

## 5. Why `INSUFFICIENT_TECHNICAL_DATA` and `NO_VALID_STRATEGY`

**Mechanism (confirmed from code).**
- A factor counts only if its source matches the market-data source (`analysis.ts`, `available = c !== null && src === base`).
- The three technical factors (market trend, price action, technical indicators) draw on the candle source, which is LIVE whenever candles exist. The market source is the spot quote.
- If the spot quote is `STALE` while the candles are `LIVE`, all three technical factors are marked unavailable.
- Any unavailable factor adds the blocker "Not enough comparable data to trade: … unavailable" (`strategy.ts`). That maps to `INSUFFICIENT_TECHNICAL_DATA` in the diagnostic.
- When `missing` is non-empty the strategy builds **no candidates** (`switch (missing.length ? null : regime)`), so `candidates` is empty and the diagnostic adds `NO_VALID_STRATEGY` ("Regime … produced no strategy candidate").

**What this means.** Both codes are consequences of the freshness mismatch above, not independent verdicts on the setup. `NO_VALID_STRATEGY` is not a strategy gate that rejected a valid setup. The strategy never evaluated one. I have not bypassed or changed any gate.

**Second-order.** If the market source is `LIVE` and the chain is `STALE`, the option-chain factors (open interest, IV) go unavailable instead. That does not block technicals, but it removes the chain-based direction.

## 6. Lot-size investigation

**Where lot size comes from.** Two places, first positive value wins:
1. `lot_size` on the option-chain rows (row level, or inside `call_options` / `put_options`) — `normalizeChain`.
2. `lot_size` on the option-contract list (`/v2/option/contract`) — `normalizeOptionContracts`.

`pos()` keeps only positive numbers. If neither yields a value, lot size is `null`.

**Why it is unknown.** Both paths expect the field name `lot_size`. The tests use that shape, so the normaliser works on fixtures. I found no live sample in the repository. The code does not persist raw responses, so I cannot see the real field layout. That leaves two possibilities: the field is absent from both responses, or it sits under a different name or path. The stored inventory (`.data/options-research/inventory_inv_20261024105400.json`) says `lotSizeHistory: unavailable, source: current contract master only`. It does not say whether the current contract master had it.

**Downstream effect (confirmed).** The risk service rejects every candidate with `UNKNOWN_LOT_SIZE` ("Lot size is unknown or unavailable from contract metadata"), and the diagnostic maps that to `LOT_SIZE_UNAVAILABLE`. So lot size is a **second, independent gate**, behind freshness. It will still block execution even after the freshness problem is fixed.

**Local cache.** `.data/instruments/` holds `NSE_EQ.json` only (equities). It has no F&O lot sizes.

**To settle it (no new request needed).** Paste one raw contract entry from the `/api/recommendations/diagnostic` JSON, or the `legs[].instrumentKey` plus the `contract` object if shown. Alternatively, one `lot_size` value from the browser network log of the option-chain response. Either shows whether the field is present.

## 7. Historical options provider: `UDAPI100011`

**Where the error is raised.** `probeHistoricalOptionAccess()` in `src/lib/adapters/upstoxHistoricalOptionsAdapter.ts`.
- Endpoint: `GET /v2/historical-candle/NSE_FO|50928/day/2025-11-06/2025-11-06`. This is a probe for an **expired** option contract (NIFTY 06NOV2025 CE 24000), labelled "probe only".
- Callers: `/api/auth/health` (per-index checks plus this probe), `/api/historical-options/data-quality`, and the `option-history` page. Any of them can trigger it at startup.

**What the code knows.**
- The code's only known code is `UDAPI1149`, meaning expired-contract history needs the Upstox Plus plan.
- The probe only recognises `1149`. Any other non-200 is classified as `blocked`, carrying whatever code came back. So `UDAPI100011` is **blocked, but not identified**.
- The diagnostic's warning text is **hard-coded** to "UDAPI1149 — expired-contract history needs the Plus plan" (`recommendationDiagnostic.ts`). It would show that text even if the real code were `UDAPI100011`. That is a mislabel to fix.
- The repository contains no documentation of `UDAPI100011`. I have not assigned it a meaning from memory.

**What the block prevents.** Historical option OHLC, open interest, volume and bid/ask for **expired** contracts. That limits backtest fidelity and any historical options validation (Phase 4). It does not block live recommendations, which the code says explicitly. The underlying historical candles are a separate endpoint and are not blocked by this error.

**To settle it.** Paste the `blockerMessage` text from the `historical` section of `/api/auth/health`, which holds the provider's own message. The code stores it there.

## 8. Existing candle cache coverage

**Were the startup requests saved? No.**
- Historical candle responses are cached in memory only: `cached()` in `src/lib/services/cache.ts`, on `globalThis`. Nothing writes them to disk.
- No file under `.data/` or `.research-data/` changed in the last three hours (checked by modification time: 0 files).
- The cache disappears when the server restarts.

**What the startup requested.** From `CANDLE_PLAN` (`candles.ts`), today 2026-11-06 IST:

| Series | Requested window | Cache lifetime |
|---|---|---|
| 15m spot, history | 2026-10-12 → 2026-11-05 (25 days, excludes today) | 1 h |
| 15m spot, intraday | today (2026-11-06) | 60 s |
| 1d spot, history | 2025-08-13 → 2026-11-06 (450 days) | 15 min |
| 15m opening candles | as 15m | as 15m |
| Futures candles | per the futures plan (not inspected) | — |

These are the windows requested. Whether the responses were non-empty is not recorded. The LIVE technical source in the diagnostic implies they were non-empty, which would mean the historical-candle endpoint accepted the analytics token. That is an inference, not a verified fact.

**Compared with Phase 2.** The Phase 2 inputs need 2025-09-22 to 2026-10-05 at 15m (plus VIX and constituents), and daily back to 2025-07-08. The startup cache covers 25 days at 15m, so it does not satisfy Phase 2. It also was not saved.

## 9. Phase 2 readiness

- **Current diagnostic data** (quotes, today's chain, 25 days of 15m, 450 days of daily) is live and in memory. It is not a dataset.
- **Historical dataset for Phase 2** (about a year at 15m for index, VIX, and constituents) has not been fetched or saved. The §8 windows are too short, and the response is not persisted.
- **Authorisation.** The OAuth token expired on 2026-11-03. The analytics token is accepted at startup. Whether the analytics token counts as "the existing valid Upstox authorisation" that the Phase 2 approval refers to is **your decision**. I have not used it for any fetch, and the approval stated that a fetch would stop on an invalid authorisation.
- **Verdict.** Phase 2 remains **BLOCKED** until (a) you confirm which credential is authorised for historical fetching, and (b) the Phase 2 fetch is run into the isolated directory with the validation in the audit's §5.

## 10. Remaining blockers and next actions

| # | Blocker | Owner | Action |
|---|---|---|---|
| 1 | STALE classification: spot quote timestamp (most likely) | Engineering, after confirmation | Read `freshness` from the existing diagnostic JSON; check the raw index-quote `last_trade_time` in your browser network log. Fix once the cause is confirmed. Do not relax the threshold to hide it. |
| 2 | `INSUFFICIENT_TECHNICAL_DATA` / `NO_VALID_STRATEGY` | follows #1 | Expected to clear when the market source is LIVE. Re-check then. |
| 3 | Lot size unknown (second gate) | Engineering | Paste one raw `lot_size`-bearing object from a live response (or confirm absence). Then decide between reading it from another field, or a validated contract master. |
| 4 | `UDAPI100011` unidentified; diagnostic text hard-coded to `UDAPI1149` | Engineering | Paste the provider's `blockerMessage`. Make the diagnostic show the actual code. |
| 5 | Authorisation for Phase 2 | **You** | Confirm whether the analytics token is the authorised credential, or re-authorise the OAuth flow yourself. |
| 6 | Phase 2 historical data | You, after #5 | Run the authorised fetch into the isolated directory. |
| 7 | IV percentile missing on the live path | Engineering (later) | Not a blocker. Affects strategy scoring. Record for the options work. |

**Recommended order:** #4 and #3 are cheap to answer with artefacts you already have. #1 needs one value from the JSON you already have. #5 is a decision only you can make. Phase 2 does not start until #5 is settled.

I stopped after the report, as the brief requires. Phases 3–5 were not started.
