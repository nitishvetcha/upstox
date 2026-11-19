# Phase 8 — historical research readiness (offline review, 2026-11-12)

Written for: the project owner, to decide whether historical research can start and what the next data acquisition must cover.

**Scope.** Offline analysis of the 102-request historical coverage probe (`docs/phase0/historical-coverage-probe.json`). No Upstox requests were made for this review. Not approved in this review: additional API requests, recurring live collection, any change to Strategy 11.4 or production formulas. Engine remains NO-GO.

## 1. Result of the 102-request probe

- Status COMPLETE. 102 of 102 calls used. 102 log entries, all HTTP 200, no retries, no stops.
- Per index: 3 expiries (latest, one nearest about six months back, oldest listed), 2 ATM legs each, plus 4 ITM/OTM legs on the latest expiry only. 18 expiries in total.
- Candle request window: 14 days ending on expiry (30-minute interval). **This is not two years of history.** Each sampled contract covers 14 days.
- 60 candle calls: 52 legs returned candles, 8 returned zero candles.
- 4,859 bars returned in total, all with 7 fields (timestamp, open, high, low, close, volume, OI).

## 2. Data readiness by index

| Index | Listed expiries | Span listed | Latest and mid expiry | Oldest sampled expiry | Readiness for OHLC/volume research |
|---|---|---|---|---|---|
| NIFTY | 111 | 2024-10-03 to 2026-11-09 | Candles present, all 6 latest legs and 2 mid legs | Candles present (128 to 130 bars per ATM leg) | Ready for a sample. OI is weak on the 2024 expiry (see §4). |
| BANKNIFTY | 31 | 2024-10-01 to 2026-10-27 | Candles present | **ATM CE and PE empty** | Partial. Oldest expiry missing. |
| FINNIFTY | 32 | 2024-10-01 to 2026-10-27 | Candles present | **ATM CE and PE empty** | Partial. Oldest expiry missing. |
| MIDCPNIFTY | 32 | 2024-09-30 to 2026-10-27 | Candles present | **ATM CE and PE empty** | Partial. Oldest expiry missing. |
| SENSEX | 109 | 2024-10-04 to 2026-11-05 | Candles present | Candles present (31 and 39 bars) | Ready for a sample. OI weak on the 2024 expiry. |
| BANKEX | 32 | 2024-09-30 to 2026-10-29 | Candles present (74 bars at latest ATM CE) | **ATM CE and PE empty** | Partial. Oldest expiry missing. |

"Ready" means only that the three sampled expiries returned data. It does not establish coverage of the full listed history.

## 3. Zero-candle contracts (8 legs)

All 8 are the ATM CE and ATM PE of the oldest sampled expiry for BANKNIFTY (2024-10-01), FINNIFTY (2024-10-01), MIDCPNIFTY (2024-09-30) and BANKEX (2024-09-30). Each returned HTTP 200 with an empty candle array.

**What the data rules out:**
- A global cut-off in early October 2024 is ruled out. NIFTY's 2024-10-03 contract returned candles back to 2024-09-19, which lies inside the same 14-day window the zero legs used.
- The zero result is not caused by a wrong instrument key or a request error. The keys follow the same format as the working legs, and every response was HTTP 200.

**What the data does not settle:**
- Whether the contract was not traded, not archived, or archived under another key. Only a targeted follow-up probe can show this.
- Whether the same gap exists for other strikes on those expiries.

Recommended follow-up (not run, needs approval): for each of the four affected indices, its single oldest expiry (BANKNIFTY and FINNIFTY 2024-10-01; MIDCPNIFTY and BANKEX 2024-09-30), take the neighbouring strikes at ATM ±1 and ±2 steps, both CE and PE, with the same 14-day window. That is 4 strikes × 2 types × 4 indices = 32 requests maximum.

## 4. Open interest distribution

- Across all 4,859 bars, OI is present on every bar and is non-zero on 96.7%.
- By expiry period: 2026 H1/2025 expiries 100% non-zero; 2026 H2 expiries 99.3% non-zero; **2024 expiries 59.1% non-zero** (328 bars).
- The weakest legs are NIFTY 2024-10-03 ATM CE (27% non-zero, 128 bars), SENSEX 2024-10-04 ATM CE (39%, 31 bars) and SENSEX 2024-10-04 ATM PE (85%).

**Interpretation.** A zero OI bar cannot yet be classed as genuine. On the 2026 data, OI is effectively always non-zero, so zeros there would be unusual. On the 2024 data, the share of zeros is high enough that it could be a data-availability problem rather than a true absence of open interest. The probe cannot separate the two. Settling it needs a comparison against a known-liquid contract in the same period, which is a follow-up probe, not an offline check.

## 5. Known data-quality problems

1. Eight contracts with zero candles (§3).
2. High share of zero-OI bars on 2024 expiries (§4).
3. Underlying spot identity not verified. The response does not echo the instrument key. The only check is that the spot fell inside the strike grid, which held for all 18 expiries.
4. Only 14 days per sampled contract. Full-history completeness is unknown.
5. Only one contract per leg was sampled. Every ATM, ITM and OTM leg is a single contract, so results do not generalise to other strikes.
6. Bid/ask and depth are not present in the candle response.
7. The documentation says the expiries list covers about six months, but the probe found about two years. The discrepancy is unexplained.

## 6. Historical acquisition requirements

**Common schema (one row per bar):**

| Field | Type | Notes |
|---|---|---|
| index_id | text | One of six. |
| underlying_key | text | As used in the request. |
| underlying_spot_close | number | Daily close on or before expiry, with its date. |
| expiry_date | date | From the expiries list. |
| expired_instrument_key | text | As returned by the contract list. |
| instrument_type | CE or PE | |
| strike | number | Listed strike. |
| strike_step | number | Interval used at ATM, with both neighbours. |
| lot_size | integer | From the contract list. |
| bar_timestamp_ist | timestamp | As returned. |
| interval | text | For example 30minute. |
| open, high, low, close | number | |
| volume | number | |
| oi | number | As returned. Keep raw value. |
| oi_flag | text | ZERO, NON_ZERO, MISSING. |
| source_endpoint | text | |
| request_seq | integer | Links to the request log. |
| retrieved_at | timestamp | Time of request. |
| quality_flags | text | For example WINDOW_EDGE, LOW_BAR_COUNT, ZERO_CANDLES. |

Keep the raw response for each request in a separate file, with no token. Keep the request log for every call.

**Acquisition plan (must be approved before any run):**
- Expiries: every listed expiry for all six indices, not a sample. The number is 111 + 31 + 32 + 32 + 109 + 32 = 347 expiries.
- Contracts per expiry: an ATM window of about ±10 strikes, both CE and PE, roughly 42 contracts per expiry. This is a planning figure.
- Estimated requests: about 14,500 at that depth, before any window splitting. The rate limit and the maximum bars per request are unknown and must be tested first.
- A rate-limit and window-size test is needed before the full plan. It should be a small, separately approved probe.
- The earlier time estimate (3 to 7 working days for acquisition) assumes the rate limit allows this volume. That is unverified and may be optimistic.

## 7. Research questions

**Can be answered with OHLC, volume and OI (subject to §5):**
- Market structure and direction at the index level.
- Option premium behaviour: close-to-close change, volume patterns, OI build-up and unwinding, around expiry.
- Relative behaviour of ITM, ATM and OTM legs on the same expiry (on the latest sample only).
- Whether the same patterns appear across all six indices.

**Cannot be answered from these data:**
- Bid/ask spread, quoted depth, realistic fill price, slippage, or any execution-cost assumption.
- Liquidity at a given order size.
- Intra-bar timing of entries and exits.
- Implied volatility or Greeks, unless computed with a pricing model, which is a modelling assumption and must be labelled as such.
- Whether Strategy 11.4 is profitable after costs. Historical OHLC does not establish this.

## 8. Remaining live-data requirements

These need live collection and cannot be replaced by historical data:
- Actual bid, ask and their quantities, with depth.
- Live quote freshness (`last_trade_time` compared with snapshot time).
- WebSocket reliability, reconnect behaviour and data-loss handling.
- Execution-cost evidence under real market conditions.
- The 60-session live evidence gate, unchanged.

## 9. Holdout and governance constraints

- The reserved holdouts (2022 onward, and after 2025-07-01) are recorded as compromised in the existing governance documents. Any historical data used for research must not be presented as holdout evidence.
- Any 11.4 comparison or alternative strategy developed on this data is research. It cannot be used to select or validate a production candidate. A new holdout is needed after a frozen specification.
- Historical research must not be used to tune Strategy 11.4 or its production formulas.

## 10. Recommendation

**Historical research can begin, but only on the scope it can support:**

1. Start with the research questions in §7 that OHLC, volume and OI can answer, on the three sampled expiries per index as a pilot. Label every result as historical coverage and market-structure research, not as strategy performance.
2. Do not use these data for a profitability or strategy-validation claim.
3. Before any full acquisition, approve two bounded probes, each with its own budget:
   - The zero-candle follow-up in §3 (32 requests maximum).
   - A rate-limit and window-size test for the acquisition plan in §6.
4. Full six-index acquisition waits for the results of step 3.
5. Keep the 60-session live gate and the NO-GO status unchanged. Strategy 11.4, production formulas and the 1% risk limit are unchanged.
