# Round 2 Final Safety Review — Remediated

**Date:** 2026-11-03  
**Result:** Documentation design is internally consistent; implementation remains blocked by owner decisions.

## Authority map

To prevent another divergence, this review does not restate normative protocols:

- Recovery state model, sentinel state machine, backup/promotion rules, quarantine protocol, verification, crash tests, and decision register: `docs/disk_crash_recovery_implementation_plan.md`.
- Candle validation, UTC normalization, duplicate policy, session limitations, indicator minima, provenance, overlay constraints, and test matrix: `docs/per_stock_technicals_implementation_plan.md`.
- Fundamental validity/freshness/storage/display/scoring rules and provider-verification gates: `docs/fundamental_provider_comparison.md`.
- Completion status/counts: `docs/full_application_completion_tracker.md`.

If a summary conflicts with an authority above, the authority wins.

## Safety findings resolved in design

| Area | Former defect | Remediated design |
|---|---|---|
| Sentinel | Absence was treated as first init even with legacy files; malformed/unreadable states incomplete | Complete six-row state machine; exclusive durable creation; concurrent/interrupted initialization fails closed |
| Recovery states | Alert acknowledgement could imply resume; permissions/transitions vague | Four precise states; acknowledgement never transitions; three reconciliation choices with origin/preconditions and audit record |
| Backups | `.bak` could be overwritten; recovered output could replace evidence | Separate recovered candidate; protected `.bak`; verified crash-safe promotion; rotation aborts when only one good copy exists |
| Quarantine | Active log could be overwritten in place; boundary behavior incomplete | Full-copy, suffix, prefix-temp, fsync/rename/directory-fsync protocol plus restart behavior at every boundary |
| Verification | Non-empty/first-line parsing was insufficient | Full schema, contiguity, event-ID, boundary, byte-length/hash, replay, and backup-presence verification |
| Crash tests | Sentinel, concurrency, promotion, and several quarantine boundaries missing | Authoritative R01–R27 matrix plus additional replay/promotion/audit cases |
| Decisions | D15 and counts diverged | Exactly 15 active decisions: D1–D11, D8a, D12–D14; D15 retired into D8a; all Pending |
| MACD | Some text claimed 27 candles | Actual code requires 35 because the previous signal/histogram guard needs a second signal value |
| Validation | Coercive finiteness and incomplete volume/timestamp/OHLC rules | Strict `Number.isFinite`, numeric OHLC constraints, explicit volume policy, offset-required timestamps, UTC normalization |
| Duplicates | “Last after sort” depended on API order | Identical complete values dedupe; any conflicting same-time group is entirely rejected with diagnostic |
| Sessions | Fixed window overclaimed holiday/special-session correctness | Normal session documented; authoritative calendar required for holidays/partial/special/Muhurat sessions |
| Availability | One global guard implied uniform availability | EMA-20 20, EMA-50 50, RSI/ATR 15, MACD 35, independent VWAP rule; overlay bypass is separate |
| Provenance | Aggregate source could obscure mixed candle sets | Per-indicator provenance; strict aggregate; synthetic rejected at production and engine boundaries |
| Fundamentals | Field validity and score eligibility could be conflated | Four freshness categories plus independent storage/display/scoring rules; negative P/E/ROE valid but not score-eligible |
| Provider claims | Historical price/rate/coverage numbers looked current | All such claims explicitly unverified pending current official documentation; no provider selected |

## Current source-code reality

- Strategy 11.4 remains protected and was not changed.
- The recovery design above is not implemented by current `paperLedgerStore.ts`; disk crash recovery stays Blocked.
- The per-stock overlay design is not wired into `stockOpportunityEngine.ts` or live/paper trading.
- No fundamental provider is selected, credentialed, purchased, or integrated.

## Outstanding owner decisions

All 15 recovery decisions in the authoritative register are pending. In addition, the owner must approve the per-stock top-N/live-fetch scope, overlay policy/weights, authoritative exchange-calendar source, and later production integration. Provider evaluation, credential creation, purchase, and integration each require separate approval after official-document verification.

No owner approval is inferred from this review.
