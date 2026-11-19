# Protocol Amendment: options-audit-1a

**Version:** `options-audit-1a`  
**Dated:** 2026-10-26  
**Amends:** `options-audit-1` (docs/options-data-audit.md)  
**Status:** ACTIVE from 2026-10-26 onwards  

All thresholds, pass criteria, session minimums, and verdict definitions are unchanged.
This amendment corrects one implementation detail in Check D only.

---

## What changed

**Check D — IV recompute underlying price**

`options-audit-1` used `underlying_spot_price` from the `/v2/option/chain` response as the spot input
to Black-Scholes for the IV recompute. That field is embedded in the chain payload and is updated only
when the chain snapshot is refreshed by Upstox — which can lag the real index by several minutes
(observed: chain classified STALE for all six indices on 2026-10-26).

**Consequence observed (2026-10-26, pre-amendment rounds):** when the live index had risen since the
chain was fetched, the lagging spot caused recomputed IV to be biased high for calls (~32%) and low
for puts (~22%) at the same ATM strike — a ~10 percentage-point CE/PE split that does not reflect
actual market IV, only the age of the chain's spot field.

**Fix:** The audit script now fetches the fresh index quote (same `/v2/market-quote/quotes` call used
for the breadth and market-quote subsystems) immediately after the option quotes, and passes that
spot to `sampleRound`. This gives the correct BS IV recompute: CE and PE at the same strike should
produce nearly equal IVs when the market is fairly priced.

Nothing else changes:
- The comparison is still chain IV (from the chain payload) vs recomputed IV (from BS).
- The same thresholds apply: median diff ≤ 1.0, p95 diff ≤ 3.0.
- The same verdict hierarchy applies.
- Existing `rounds.jsonl` rows are not modified.

---

## Independent validation

The IV solver is tested in `src/lib/optionsAudit.test.ts`:
- "IV solver recovers the volatility used to price the option (CE and PE)": roundtrips BS price through
  `impliedVolPct` and asserts recovery within 0.01 percentage points.
- "IV edge cases": verifies null is returned for expired, zero, or invalid inputs.
- "pricing model satisfies known relationships": asserts put-call parity, delta bounds, and an
  independently computed reference value (S=100, K=100, T=1, σ=20%, r=6.5% → call ≈ 11.2639).

These tests use no Upstox calls and are deterministic.

---

## Pre-amendment record

Today's (2026-10-26) rounds collected under `options-audit-1` are preserved in
`.data/options-audit/rounds.jsonl` without modification. Any report generated from those rounds is
labelled `options-audit-1` (the `version` field on each record).

A snapshot of the pre-amendment audit report for 2026-10-26 is saved at:
`.data/options-audit/pre-amendment-1a_2026-10-26.json`

Future rounds collected from 2026-10-26 onwards use the corrected spot and are labelled
`options-audit-1a`. Both sets of records coexist in `rounds.jsonl`; the report function uses the
`version` field to distinguish them.

---

## No-op if chain is fresh

If the chain's embedded `underlying_spot_price` happens to equal the fresh index quote (i.e., the
chain was just refreshed), the amendment has no effect on the numeric output.

Options remain blocked until Check D passes under `options-audit-1a`.
