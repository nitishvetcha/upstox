# Historical coverage probe — specification (prepared, not run)

Written for: the project owner, to approve or amend the exact request plan before any Upstox request is made.

**Status:** specification and script prepared. **No API request has been made for this probe.** Execution needs written approval of the request plan in section 5.

## 1. Purpose

Establish, for all six indices (NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX, BANKEX):
1. Historical depth: how far back expired-option contracts and candles are retrievable.
2. Expiry coverage: whether multiple historical expiries exist.
3. Strike coverage: ATM, ITM and OTM contracts, not only the median strike.
4. Call and put coverage.
5. Completeness of OHLC, volume and OI.
6. BANKEX: whether the earlier 15-candle result is isolated or general.

Historical data here means OHLC, volume and OI only. It does **not** establish bid/ask, depth or execution quality. Those remain live-research items.

## 2. Corrections to the earlier probe

- The previous probe used the **median strike of the contract list**. That is not ATM. For NIFTY it selected 23700 when the index was near 25,000. Its results cannot show ATM behaviour.
- The previous probe used a 5-day candle window. This probe uses 14 days, to test whether BANKEX's short result was a window limit.

## 3. Expiry selection (rules fixed before any request)

Per index, from the expiries list (one request):
- **Latest:** the most recent expired expiry (before today).
- **Mid:** the expired expiry nearest to today minus 182 days (about six months).
- **Oldest:** the earliest expiry in the list.

If fewer than three distinct expiries exist, the probe uses what exists and records the shortfall. It does not invent dates.

## 4. Strike selection (rules fixed before any request)

- **Spot on expiry:** daily close of the underlying index on the expiry date, from the V3 historical candle endpoint (one request per index per expiry).
- **Spot:** the latest underlying candle dated on or before expiry, chosen by timestamp (not array position).
- **ATM:** the listed strike nearest the spot close.
- **Step:** the interval between ATM and its neighbour above, with the interval below recorded. If the two differ, the grid is irregular at ATM: ITM and OTM legs are skipped and the reason is recorded. The step is never taken from the whole grid.
- **Contract checks:** each selected contract must match the expiry, instrument type and strike it represents. Mismatches are recorded and not used.
- **Depth limit:** history depth cannot exceed the expiries list. The output records the oldest and latest listed expiry per index. The probe does not request expiries outside that list.
- **ATM CE and PE** are requested for every expiry.
- **ITM and OTM** (ATM plus or minus 3 steps, nearest listed strike) are requested for the **latest expiry only**: ITM CE, OTM CE, ITM PE, OTM PE.

## 5. Request plan (maximum 102)

| Step | Per index | Count |
|---|---|---|
| Expiries list | 1 | 6 |
| Per expiry (×3): contract list | 1 | 18 |
| Per expiry (×3): underlying daily candle | 1 | 18 |
| Per expiry (×3): ATM CE candle | 1 | 18 |
| Per expiry (×3): ATM PE candle | 1 | 18 |
| Latest expiry only: ITM CE, OTM CE, ITM PE, OTM PE candles | 4 | 24 |
| **Total** | | **102** |

- Candle interval: 30 minutes, for expired options. Window: 14 days ending on the expiry date.
- Underlying candle: 1 day, 7-day window ending on the expiry date.
- The contract list returns both CE and PE, so PE selection needs no extra request.

## 6. Stop rules

- Stop the whole run on **any non-200 response**, including `UDAPI1149`, HTTP 401, HTTP 429, any 5xx and network errors.
- No retries. Requests beyond the budget of 102 are refused by the script.
- A missing strike (for example no listed ITM strike) is recorded as missing and does not use a request.

## 7. Output

- File: `docs/phase0/historical-coverage-probe.json` (new). The script refuses to overwrite it.
- Metadata only per request: HTTP status, latency, error code, candle count, field count, OI and volume presence, first and last timestamp, and the chosen strike and expiry. No token. No raw candles.
- The file is written even if the run stops early, with the stop reason and request count.

## 8. Decision this probe supports

- If depth, expiry and strike coverage are usable for most indices, historical OHLC, volume and OI research can start across all six, with the limits in section 1.
- If BANKEX or another index is thin, that index is excluded from historical research, and its timeline is set separately.
- Neither outcome changes the live-collection requirement, the NO-GO status, Strategy 11.4 or the production risk limits.

## 9. Approval requested

Approve the request plan in section 5 (102 requests maximum, read-only, Upstox Plus endpoints, with the stop rules in section 6). Execution will use:

`HISTORICAL_COVERAGE_APPROVED=yes MARKET_DATA_PROVIDER=upstox UPSTOX_COLLECTION_ENABLED=true node --experimental-strip-types scripts/historical-coverage-probe.ts`

Run once. Report the actual request count and the output file.
