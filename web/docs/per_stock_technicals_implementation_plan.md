# Per-Stock Technical Analysis — Authoritative Design

**Date:** 2026-11-03  
**Status:** DESIGN ONLY; NOT IMPLEMENTED OR WIRED INTO LIVE/PAPER TRADING  
**Protection:** This overlay is separate from frozen Strategy 11.4 and must not change its scoring, signals, thresholds, or decisions.

## 1. Source-code authority and scope

`src/lib/services/technicalAnalysis.ts` is the authority for indicator algorithms. It seeds EMA with an SMA, computes RSI/ATR with Wilder smoothing, and computes MACD from EMA-12, EMA-26, signal EMA-9, plus a previous-signal/histogram guard. `src/lib/engine/stockOpportunityEngine.ts` does not currently fetch or apply this proposed per-stock overlay. This document specifies a future, separately authorized module and production boundary.

The proposed overlay uses EMA-20, EMA-50, RSI-14, session VWAP, ATR-14, and MACD (12/26/9). Missing inputs remain `null`; no indicator value may be fabricated. Score adjustment stays outside Strategy 11.4.

## 2. Preprocessing and strict validation

Validation occurs before normalization, sorting, deduplication, session filtering, or indicators.

### 2.1 Relevant candle fields

The complete identity/equality set is: normalized UTC timestamp, `open`, `high`, `low`, `close`, and `volume`. If the runtime `Candle` type later adds a field used by any indicator or session rule, that field joins this set before implementation.

For each candle:

- `open`, `high`, `low`, and `close` must be JavaScript numbers for which `Number.isFinite(value)` is true. Coercive global `isFinite()` is forbidden.
- Require `high >= low`, `high >= max(open, close)`, `low <= min(open, close)`, and positive prices. Reject the entire candle on failure and record a diagnostic.
- Volume must be either a finite number `>= 0` or, if the upstream type explicitly represents missing volume as `null`, `null`. Strings, `NaN`, infinities, and negative values are invalid.
- An invalid non-null volume rejects the entire candle. A valid candle with `volume: null` remains eligible for price-only indicators but is ineligible for VWAP. Zero volume is valid but contributes zero weight.
- Timestamp must be a non-empty string with an explicit `Z` or numeric UTC offset, parse to a finite epoch, round-trip through `new Date(value).toISOString()`, and fall within the approved sanity range (proposed 2000-01-01 through 2100-01-01 exclusive). Local/no-offset timestamps are rejected.
- Normalize accepted timestamps to UTC `toISOString()` **before** comparison, sorting, deduplication, and session filtering.

Diagnostics must state symbol, normalized timestamp when available, rule, and rejection/deduplication outcome without logging credentials or raw provider responses.

### 2.2 Deterministic duplicate handling

Group candles by normalized UTC timestamp. Within a group:

- If all relevant fields (`open`, `high`, `low`, `close`, `volume`) are exactly identical under `Object.is`-equivalent numeric semantics after validation, keep one and record an identical-duplicate diagnostic.
- If any relevant field differs, reject the **entire timestamp group** and record a conflicting-duplicate diagnostic containing the differing field names.
- Never select “first,” “last,” highest close, or highest volume. API response order cannot affect output.

After group resolution, sort the surviving candles by UTC epoch ascending. Reversed duplicate input order must produce byte-equivalent technical output and equivalent diagnostics.

## 3. Session behavior

- Normal NSE cash session is 09:15 inclusive to 15:30 exclusive IST (03:45–10:00 UTC while IST remains UTC+05:30). Convert normalized UTC instants to the `Asia/Kolkata` calendar/session before filtering.
- Exclude Saturday and Sunday.
- A fixed weekday/window rule cannot identify NSE holidays, unscheduled closures, shortened sessions, or Muhurat trading. Production session filtering therefore requires an authoritative exchange calendar/session descriptor supplied by the market-data layer.
- Without that descriptor, a special-session candle set is `UNAVAILABLE` for session indicators rather than guessed. Muhurat trading must not be forced into the normal window.
- Partial normal sessions are allowed for VWAP only through the last complete accepted candle and must carry `partialSession: true`; history-dependent indicators independently report availability.
- Missing candle input returns provenance `UNAVAILABLE`, all indicators `null`, and no overlay. Insufficient history leaves only the affected indicator `null`; it never fabricates a value.
- Staleness is evaluated per candle set. Intraday VWAP can be unavailable because the session set is stale while daily/history indicators remain available from their own accepted set.

## 4. Indicator-specific availability

There is no single computation guard. The existing overlay policy may still bypass score adjustment when fewer than 15 accepted history candles exist, but computation and availability remain independent.

| Indicator | Accepted input required | Availability rule |
|---|---|---|
| EMA-20 | Close history | At least 20 accepted closes. |
| EMA-50 | Close history | At least 50 accepted closes. |
| RSI-14 | Close history | At least 15 accepted closes (14 changes). |
| VWAP | Accepted candles in the relevant valid session | At least one candle with non-null volume and total positive volume; any null-volume candle is excluded with warning, all-zero/no usable volume gives `null`. |
| ATR-14 | Ordered OHLC history | At least 15 accepted candles (14 true ranges). |
| MACD 12/26/9 | Close history | **At least 35 accepted closes.** EMA-26 first exists on close 26; signal EMA-9 first exists after nine defined MACD points (close 34); the existing previous-signal/histogram guard requires close 35. |

These counts are derived from the actual functions in `technicalAnalysis.ts`. A future algorithm change requires re-derivation and tests before documentation changes.

## 5. Provenance

Each result and each indicator must carry one of:

- `LIVE`: derived solely from accepted provider candles obtained by the production market-data path;
- `SYNTHETIC_TEST`: derived from deterministic test fixtures only;
- `UNAVAILABLE`: no trustworthy result.

If indicators use different sets, provenance is per indicator (`historySource` for EMA/RSI/ATR/MACD and `sessionSource` for VWAP), with an aggregate source of `LIVE` only when every non-null score-contributing indicator is `LIVE`. Mixing `LIVE` with `SYNTHETIC_TEST` is forbidden and returns `UNAVAILABLE`/invariant failure. A production API route must reject any `SYNTHETIC_TEST` result with an internal-error response; paper/live opportunity engines must also reject it before scoring or persistence.

## 6. Proposed output and isolated overlay

The future `StockTechnicals` result contains nullable EMA-20, EMA-50, RSI-14, VWAP, ATR-14, MACD values; independent availability/reason and provenance for each; accepted/rejected candle counts; last accepted timestamp; partial-session flag; and diagnostics.

The proposed overlay remains a separate pure function. Existing proposed weights are EMA-20 ±8, VWAP ±7, RSI ±5, and MACD ±5, with symmetric bullish/bearish treatment and a final clamp to `[0, 100]`. EMA-50 and ATR are context unless separately approved. A `<15` accepted-history guard bypasses the **whole overlay**, so 14 candles do not create a partial RSI overlay even though individual availability is still reported. This policy and weights require owner approval before integration.

Symmetry rules:

- Above EMA/VWAP helps bullish by the same magnitude that below helps bearish; the opposite condition penalizes equally.
- Overbought penalizes bullish and helps bearish; oversold helps bullish and penalizes bearish by the same magnitude.
- Positive MACD helps bullish and penalizes bearish; negative MACD does the reverse.
- Contradictions produce diagnostics but no hidden asymmetric adjustment.

## 7. Authoritative offline test matrix

All fixtures are deterministic, use `SYNTHETIC_TEST`, use no network, and never touch `.data/`.

| ID | Test | Expected result |
|---|---|---|
| PT01 | 14 accepted candles | Independent values follow minima, but global overlay is bypassed; no fabricated values. |
| PT02 | EMA-20 with 19/20 candles | `null` at 19; non-null at 20. |
| PT03 | EMA-50 with 49/50 candles | `null` at 49; non-null at 50. |
| PT04 | RSI-14 with 14/15 candles | `null` at 14; non-null at 15, including exact 40/60 zone boundaries. |
| PT05 | VWAP mixed valid, zero, and null volume | Zero contributes no weight; null excluded/warned; positive total computes. |
| PT06 | VWAP all zero/no usable volume | `null`, unavailable reason recorded. |
| PT07 | Invalid OHLC/type/finiteness | Candle rejected and diagnostic recorded. |
| PT08 | Invalid volume: string, NaN, infinity, negative | Candle rejected; no coercion. |
| PT09 | Invalid/no-offset/out-of-range timestamp | Candle rejected. |
| PT10 | Offset timestamp normalization | Same instant normalizes to identical UTC `Z` value and correct order/session. |
| PT11 | Identical duplicates in reversed order | One retained; output and diagnostics order-independent. |
| PT12 | Conflicting duplicates in both input orders | Entire timestamp group rejected identically. |
| PT13 | MACD with 34/35 candles | `null` at 34; non-null at 35 and previous histogram is finite. |
| PT14 | ATR-14 with 14/15 candles | `null` at 14; non-null at 15. |
| PT15 | Bullish/bearish overlay symmetry | Mirrored inputs produce equal-magnitude adjustments. |
| PT16 | Exact lower clamp | Construct all −25 adjustments and base 5; exact result 0; MACD fixture has ≥35 candles. |
| PT17 | Exact upper clamp | Construct all +25 adjustments and base 95; exact result 100; MACD fixture has ≥35 candles. |
| PT18 | Synthetic provenance at production route and engine boundaries | Rejected; never serialized/persisted as live. |
| PT19 | Unavailable candle data | All values `null`, aggregate `UNAVAILABLE`, overlay unchanged. |
| PT20 | Weekend/holiday without valid session descriptor | Session indicator unavailable; no normal-session guess. |
| PT21 | Partial normal session | VWAP computed through last complete bar and marked partial. |
| PT22 | Muhurat/special session without authoritative descriptor | Unavailable, limitation explicit. |
| PT23 | Different history/session sources | Per-indicator provenance retained; aggregate follows strict rule. |

## 8. Gates and implementation sequence

Offline engineering may implement the pure validator, normalizer, duplicate resolver, indicators, provenance model, overlay, and PT01–PT23 only in a separately authorized code phase. Live fetch/cache integration requires explicit approval, valid authentication, an authoritative session calendar, a request budget, and production-boundary tests. It must not be activated in Strategy 11.4 or paper/live trading merely because unit tests pass.
