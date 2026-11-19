# Historical acquisition plan — planning only

**Status: PLAN. Not authorized for execution.** No Upstox API request is made by this document. Each step below needs separate approval. Production remains NO-GO. Strategy 11.4 is frozen.

Written for: the project owner, to review the request budget and decide whether to approve API access.

## 1. Purpose

Obtain enough historical option data to run a Strategy 11.4 backtest and a holdout-clean validation. The current dataset covers 14 days per contract for 52 legs. It is not enough.

## 2. Instruments and expiries

- **Indices:** NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY (NSE); SENSEX, BANKEX (BSE). Six in total.
- **Expiries:** every listed expired expiry per index, from the expiries endpoint. Listed counts: NIFTY 111, BANKNIFTY 31, FINNIFTY 32, MIDCPNIFTY 32, SENSEX 109, BANKEX 32. Total 347.
- **Contracts per expiry:** about 42 (ATM ±10 strikes, CE and PE). This is a planning figure. The strike grid and lot sizes must come from the contract list, not from this document.

## 3. Date range and intervals

- **Date range:** the span the expiries endpoint lists (about two years, per the probe). Not verified as complete.
- **Candle interval:** 30-minute for option candles, as used in the pilot. Daily candles for underlying spot, to determine ATM at expiry.
- **Known limit:** each candle request is limited by the endpoint. The maximum bars per request is not established; the probe used 14-day windows.

## 4. Request budget

| Step | Count (planning) |
|---|---|
| Expiries lists | 6 |
| Contract lists (one per expiry) | 347 |
| Underlying daily candles (per expiry) | 347 |
| Option candles (per contract, one window) | 14,574 (347 expiries × 42 contracts) |
| **Base estimated requests** | **15,274** |
| Additional requests from endpoint bar limits | **Unknown.** Set by the endpoint-limit test (section 5). |
| **Actual final budget** | **Revised 2026-11-13 from the 35-request test. The base 15,274 holds only if every contract's life fits in one 14-day window. See section 14.** |

The base figure assumes one window per contract. If the endpoint caps bars per request, the count rises by an amount that cannot be stated until the test returns. The rate limit is also unknown, so total duration is unknown.

## 5. Request batching and rate limits

1. **Rate-limit and endpoint-limit test first.** A small probe with a fixed budget of **at most 50 requests**. It measures response headers, bar caps per request, and rate-limit behaviour. It is **not yet authorized**. Its specification:
   - Maximum 50 API requests. Stop at 50.
   - No parallel requests. One request at a time.
   - No automatic retries of any kind.
   - No token refresh or generation without separate authorization.
   - Stop immediately on HTTP 401, HTTP 429, any 5xx, or any unexpected response shape or error code.
   - Record for every request: timestamp, endpoint, HTTP status, response headers, duration, and error code if any.
   - No full historical acquisition during the test. The test may fetch only the sample windows it needs to measure limits.
   - Results are reviewed before any acquisition budget is set.
2. **Batching:** requests run in expiry order. Within an expiry, one contract at a time. No parallel requests.
3. **Pacing:** a fixed delay between requests, set from the rate-limit test. The delay value is not chosen here.
4. **Resumability:** each request writes its outcome before the next request starts. Restart resumes from the first unresolved request. It never re-requests a completed request.

## 6. Storage

- Bars: 30-minute bars at roughly 100 bytes each, as CSV. Estimated 1 to 2 million bars for the full plan, about 100 to 300 MB, before compression. Estimate only; confirm after the rate-limit test.
- Raw responses: kept per request, with SHA-256, so the evidence can be re-read without a new request. Storage roughly equal to the bar data, plus overhead.
- Location: `.research-data/` (untracked, large). The manifest and request log go under `docs/phase0/`.

## 7. Missing-data and duplicate handling

- **Empty responses:** recorded as empty with HTTP status. Never filled or substituted.
- **Missing legs:** recorded with the reason (no contract, no strike, request failure).
- **Duplicates:** a request already in the manifest is never repeated. Duplicate bars (same contract, same timestamp) are kept once; the duplicate count is recorded.
- **Gaps inside a window:** recorded with the count of missing bars, following the method in the pilot report. Not filled.

## 8. Data integrity checks

Run offline on the stored data before any backtest:
- OHLC consistency (high ≥ open, close, low; low ≤ open, close).
- Non-negative volume and OI.
- Bar timestamps on the 30-minute grid, with exceptions recorded.
- Expiry date matches the contract's expiry field.
- Strike matches the listed strike.
- Each returned response's SHA-256 matches the stored copy.

## 9. Acquisition cost

- Plan access: Upstox Plus, already active.
- Per-request cost: not established. The Upstox documentation was not checked for pricing.
- Duration: unknown until the rate-limit test returns.

No cost figure is given here, because none has been verified.

## 10. Clean holdout selection and freezing

Choosing a period after acquisition does not by itself make it an independent holdout. Procedure, in order:
1. **Freeze and hash the exact Strategy 11.4 specification.** Record the hash before anything else.
2. **Select the holdout date range before examining any of its results.** Record the start and end dates and the selection rationale, dated and signed by the owner.
3. **Keep holdout results inaccessible** during development and exploratory analysis. Access is logged.
4. **Run the final validation once**, against the frozen specification, with no tuning on the results.
5. **Record the result** whatever it shows.

Previously compromised periods (2022 onward, and after 2025-07-01) remain excluded from independent validation.

The previously reserved holdouts (2022 onward, and after 2025-07-01) remain compromised.

## 11. Stop conditions

Stop the acquisition, and record the reason, on any of:
- HTTP 401 (token expired): owner must re-authenticate. No automatic retry.
- HTTP 429 (rate limit): stop, record the headers, and wait for owner review. No automatic retry.
- HTTP 5xx or network failure: record. Next request proceeds only if the failure is isolated and within a set limit (value to be set by owner).
- Unexpected response shape or error code: stop and record.
- Budget exhausted: stop.

## 12. What needs approval, in order

1. Approval for a rate-limit test (small fixed budget).
2. Review of the test result, the request budget and the storage estimate.
3. Approval for the full acquisition with the reviewed budget and stop limits.
4. Owner decision on the holdout period, before any validation run.

Nothing in this document authorizes any of these steps.

## 13. Governance

- No Upstox API call is authorized by this plan.
- No live WebSocket connection, token operation or scheduler is authorized.
- Strategy 11.4, its formulas, stop-loss and target rules, spread-width rules and the 1% risk limit are unchanged.
- Production remains NO-GO. Production approval is a separate decision.

## 14. Revision 2026-11-13: observed results from the 35-request test

Source: `.research-data/rate-limit-test/` (35 records, 35 bodies, `summary.json` SHA-256 `65f493508b9bc042594d0f9daf343362cbad94373d2f93ed3b359b5bbf2fcf47`). No further API calls were made for this revision. Owner review required before any acquisition.

### 14.1 Observed versus confirmed

| Item | Status |
|---|---|
| All 35 requests returned HTTP 200 with the documented shape | **Observed** |
| About 159 bars returned for 30-minute windows of 30 days or longer | **Observed.** Mechanism (count cap or date cap) **not confirmed.** |
| 1-minute, 5-minute, 15-minute and day intervals return data for expired options | **Observed** (one contract, one 14-day window) |
| No rate-limit or quota headers in any of 35 responses | **Observed.** Absence of headers does **not** show there is no limit. |
| No HTTP 429 at 5-second pacing for 20 repeats | **Observed.** The actual limit is **not** known. |
| The 159-bar figure is a documented API limit | **Not confirmed.** Treat as an observation only. |

### 14.2 Observed 30-minute coverage (14-day window, NIFTY 2026-11-09 ATM CE)

- 124 bars, from 2026-10-26 09:15 to 2026-11-09 15:15 IST.
- Breakdown: 8 full sessions × 13 bars = 104; 2026-10-29 had 11 bars; 2026-10-28 had 6 bars; 2026-11-08 (Sunday, Muhurat date) had 3 bars. Total 124.
- Bars at 14:20, 14:50 and 15:20 appear in this contract too, consistent with the earlier finding.

### 14.3 Observed 1-minute structure (14-day window, same contract)

- **Count:** 3,602 bars, no duplicates, one bar per minute.
- **Order:** the response is newest first (3,601 descending steps, 0 ascending). Any parser must sort by timestamp.
- **Session boundaries:** regular sessions run 09:15 to 15:30 IST (376 bars). Each full day also has 15:31 to 15:39 bars, which fall **after** the close. 99 bars sit in that window (9 per day on 11 dates).
- **Sunday Muhurat date:** 2026-11-08 has 80 bars inside 09:15 to 15:30. This is a Sunday special session with timing not yet confirmed. It remains **HOLD** and must be excluded from normal-session evidence.
- **Partial days:** 2026-10-28 has 161 bars and 2026-10-29 has 298 bars. Both are short of the 375 expected. Causes are not established.
- **Gaps:** 3,591 consecutive gaps of one minute. The ten gaps over 60 minutes are the overnight and weekend breaks between the eleven dates.
- **Off-grid minutes:** none at the one-minute level. The 30-minute off-grid stamps do not appear in the 1-minute series.

### 14.4 Supported intervals (observed)

| Interval | Observed bars, one 14-day window | Notes |
|---|---|---|
| 1minute | 3,602 | Largest response (about 218 KB). Post-close bars present. |
| 5minute | 723 | |
| 15minute | 247 | |
| 30minute | 124 | Baseline for the plan |
| day | 11 | Timestamped 00:00 IST |

3minute, week and month were not tested and are not supported by this evidence.

### 14.5 Revised request budget

The base 15,274 assumes one 14-day window per contract. The 14-day window covers the last 14 days of a contract's life. A contract that lived longer needs more windows. The contract list in the test did not return listing dates, so contract life is not known.

| Scenario | Windows per contract | Total requests (30-minute) |
|---|---|---|
| A. Every contract lives 14 days or less | 1 | **15,274** |
| B. Contracts live up to 28 days | 2 | 6 + 347 + 347 + 2 × 14,574 = **29,848** |
| C. Contracts live up to 42 days | 3 | 6 + 347 + 347 + 3 × 14,574 = **44,422** |

**Conclusion:** the 15,274 base is valid **only under scenario A**. It is not confirmed. The most likely real figure is between 15,274 and 44,422, depending on contract life. Life must be confirmed from listing data before a budget is approved.

The 159-bar figure, if it is a per-request cap, does not change the windows above. A 14-day window returns 124 bars, which is below it. Windows of more than about 16 calendar days would hit the cap.

**The 1-minute interval changes the budget.** A 14-day 1-minute window is about 3,600 bars. If the cap is count-based, that is more than 159 per request, and the 1-minute figure was returned in one request. Whether the 159 cap applies to 1-minute at all is **not known**. Choosing 1-minute could raise the request count substantially. Do not choose it without a separate test.

### 14.6 Duration (transparent assumptions)

Duration = requests × (pacing + average response time). Average response time observed: about 55 ms for 30-minute windows.

| Pacing | Scenario A (15,274) | Scenario C (44,422) |
|---|---|---|
| 0.5 s | about 2.35 h | about 6.9 h |
| 1 s | about 4.5 h | about 13 h |
| 5 s | about 21 h | about 62 h |

These figures assume no rate limit is hit. An unknown limit could require longer pauses or a multi-day run.

### 14.7 Storage (transparent assumptions)

- 30-minute raw responses: about 7.7 KB each (measured). Scenario A: 15,274 × 7.7 KB ≈ **118 MB**.
- Bars as CSV: about 60 bytes per bar (measured). Scenario A: about 1.8 M bars ≈ **110 MB**.
- Total with raw and CSV: about **230 MB** for scenario A, and about 670 MB for scenario C.
- 1-minute, if chosen: about 218 KB per window. 14,574 windows ≈ 3.2 GB raw, plus about 3.1 GB of CSV for about 52 M bars.

### 14.8 Remaining uncertainties that could materially change the budget

1. **Contract life.** The main driver. Needs listing or first-trade dates, which the contract list did not provide.
2. **Bars per request cap.** The 159 figure is observed for 30-minute only, and its mechanism is unknown. 1-minute returned 3,602 bars in one request.
3. **Rate limit.** No headers observed, and no 429 at 5 s pacing. The safe pacing for a full run is unknown.
4. **Partial and off-grid sessions.** 2026-10-28, 2026-10-29 and 2026-11-08 show incomplete or special-session data. The rules for these need deciding before acquisition.
5. **Interval choice.** 30-minute keeps the budget near scenario A. 1-minute could multiply it.
6. **Cost.** Per-request pricing not established.

### 14.9 Governance

- Strategy 11.4, its formulas, stop-loss and target rules, spread-width rules and the 1% risk limit are unchanged.
- The compromised holdouts (2022 onward, and after 2025-07-01) remain excluded from independent validation.
- The acquisition data is research data. It is not holdout evidence.
- No acquisition has started. No further API calls are authorized by this revision.
- Production remains NO-GO.

**Owner review required before any acquisition approval.**
