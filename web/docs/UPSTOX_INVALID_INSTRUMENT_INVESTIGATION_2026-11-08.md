# UPSTOX_INVALID_INSTRUMENT: investigation (2026-11-08)

Written for: the project owner and the maintainers of the market-data layer.

## Scope and method
- Read-only. No Upstox requests were made and no token was read or printed.
- Searched the source for every place the label is produced.
- Searched `.data/` and `.research-data/` for stored records mentioning the label or the Upstox error code `UDAPI100060`.

## Where the label is produced
`web/src/lib/services/upstoxMarket.ts`:
1. `reasonFor()` (line 30): HTTP 400 whose message contains the word "instrument" returns `UPSTOX_INVALID_INSTRUMENT`.
2. `normalizeQuote()` (line 84): if the quote response has no entry matching the expected instrument key, it throws `UPSTOX_INVALID_INSTRUMENT` with the message "no quote for <key>".

## Root-cause finding
- **Case 2 is a mislabel.** A quote response that simply lacks the requested key (missing data, a key-format difference, or a partial response) is reported as an invalid instrument. The key-format handling already accepts both `NSE_INDEX|Nifty 50` and `NSE_INDEX:Nifty 50`, so a genuine mismatch is less likely than missing data. The label therefore overstates the cause and may hide the real problem.
- **Case 1 depends on message text.** Any 400 response whose message contains "instrument" is classified this way, regardless of the true error. This is a text match, not a documented error code.
- **Recorded example does not match the label.** The only stored Upstox error with this code family in `.research-data/upstox-discovery-2026-11-06/_summary.json` is a corporate-actions request for `NSE_EQ|INE002A01018` that returned HTTP 404 with code `UDAPI100060` ("Resource not Found"). Under the current mapping it would be `UPSTOX_API_ERROR`, not `UPSTOX_INVALID_INSTRUMENT`. That request is a corporate-action lookup, not a quote.

## What was not found
- No stored log entry in `.data/` contains `UPSTOX_INVALID_INSTRUMENT`, so the live endpoint and instrument key behind the reported errors cannot be identified from this environment.
- The `upstox_request` log lines are structured JSON with the endpoint, index and expiry. The live server's console output would show which endpoint produced them. That output was not available to this investigation.

## Fix applied (2026-11-08)
Source: `web/src/lib/services/upstoxMarket.ts`; types and labels in `web/src/lib/types.ts` and `web/src/lib/fallback.ts`.
1. A quote response without the requested key now raises `UPSTOX_QUOTE_MISSING`.
2. Errors are classified from HTTP status and the documented code only. The word match on the message is removed. `UDAPI100060` or a 404 raises `UPSTOX_NOT_FOUND`. Everything else that is not a documented case raises `UPSTOX_API_ERROR`.
3. `UPSTOX_INVALID_INSTRUMENT` is kept as a reason but is reached only through `DOCUMENTED_INVALID_INSTRUMENT_CODES`, which is **empty**: no invalid-instrument code has been verified. A code must be documented before it is added.
4. Failed requests log the endpoint, status, Upstox `errorCode` and instrument key (`instrumentKey`, when passed as a parameter). The token is never logged.
5. Regression tests: `web/src/lib/services/upstoxErrorClassification.test.ts`, 10 cases (EC-1 to EC-10): word-match removal, undocumented 400 codes, the empty documented list, not-found mapping, auth, rate-limit and server classes, missing key, malformed data, missing last price, and key matching in both forms. None makes a broker request.

Consequence: the reported `UPSTOX_INVALID_INSTRUMENT` label can no longer be produced by an HTTP response. Any future occurrence will show as `UPSTOX_API_ERROR`, `UPSTOX_NOT_FOUND` or `UPSTOX_QUOTE_MISSING`, depending on the cause. The live endpoint behind the earlier reports is still unidentified.

## Stale versus current
The stored evidence is dated 2026-11-06. No evidence in this environment shows the label occurring today.

## Exclusion of instruments
No instrument has been excluded. Failed requests are reported as failures and are not converted into market data.
