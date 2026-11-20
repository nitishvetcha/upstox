# B6, B2, B3 and B7 — Progress Report

Date: 2026-11-06 (IST). Written for: the project owner. Status per item is stated plainly.

## B6 — Engine and diagnostic freshness consistency: IN PROGRESS

**Fixed:**
- **Cache age confused with data age (dashboard).** `sourceMeta` labelled a LIVE source by how long ago it was *fetched*. A source with its own data timestamp (last trade time, or candle close) is now labelled by the age of that timestamp. A recent cache hit with old data is no longer shown LIVE, and an old fetch with fresh data is no longer shown STALE. Sources without a data timestamp keep the fetch-age fallback. Tests: `freshnessConsistency.test.ts` (7, passing); existing `runtimeTrust` and `marketData` tests pass.
- **Technical freshness on the dashboard and API** now comes from the candle classification (B5), not from fetch time. `technicalMeta` reports the candle's age.
- **Engine vs diagnostic:** both now read the same classification. The diagnostic's technical gate is explicit (B5), so eligibility no longer depends on engine wording.

**Remaining (not fixed here):**
- The frozen engine's technical rule (`strategy.ts:179`, fetch age > 300 s) can still produce "Technical data is stale" while the diagnostic reports the technical source as LIVE. It cannot fire on the 15m path, but it can on 1h. The file is frozen, so the mismatch is documented rather than changed.
- Option-chain and breadth freshness still use the fetch-age fallback where no data timestamp is available. These need a separate review under B3/B7 and the B4 policy.
- The stock intraday and swing paths still report freshness from the quote's own trade time, which is correct; no change needed.

## B2 — Tick-aware option-price consistency: COMPLETE (offline)

- **Old rule:** `|chain LTP − quote LTP| ≤ 2% of LTP`. On a ₹0.50 premium, 2% is ₹0.01, below one tick, so a one-tick difference failed.
- **New rule:** `|difference| ≤ max(2% of LTP, ₹0.05)`. The tick is the NSE premium step. A two-tick difference on a cheap option, or more than 2% on a dear one, is still a mismatch.
- **Implementation:** `web/src/lib/services/optionPriceVerification.ts` (`optionPriceTolerance`, `optionPricesConsistent`), used by the verifier.
- **Tests:** `optionPriceConsistency.test.ts` (8 tests) cover low premium (one tick passes, two fail), mid premium, the 2% boundary above the tick, dear premium, missing, zero and non-finite values, and exact equality. The existing 2% tests in `phase30_4.test.ts` still pass.
- **Assumption:** the premium tick is ₹0.05. Some contracts may trade at a larger tick; for those the rule is slightly stricter, which is the safe direction.

## B3 and B7 — Option-chain verification and freshness: INVESTIGATED, NOT IMPLEMENTED

**Confirmed in code:**
- `verifyEvaluationOptionPrices` requests **every** contract in the chain (`allContractKeys(rows)`), and the LIVE state requires all of them to be LIVE and consistent.
- The engine's candidate set is **ATM ± 7 strikes** (`FILTERS.maxStrikesAtm`, `opportunityEngine.ts:34, 437`; also `optionContractLTT.ts:104–115`, which describes itself as "matching the engine's candidate set").
- The verifier's `_maxStrikesAtm = 7` parameter is accepted and **never used** (`optionPriceVerification.ts`, ESLint warning).
- Consequence: one illiquid far-OTM contract outside the candidate set can block the whole chain's LIVE state, although no recommendation can ever use it.

**Decided approach (not yet implemented):**
1. Verify the ATM ± `maxStrikesAtm` window that the engine can actually select. Use the same strike-index rule as `optionContractLTT.ts`.
2. Keep the rule strict inside the window: every in-window contract must be LIVE and consistent.
3. Add a per-leg guard: any leg of a proposed trade whose contract is outside the verified window, or whose quote is not LIVE, must block that recommendation with an explicit reason.
4. Report the verified window size in the diagnostic, so the dashboard shows what was checked.

**Why not implemented yet:** this changes the verifier's output shape (which rows are verified) and needs the per-leg guard in the options engine, which I have not yet read in full. Shipping step 1 without step 3 would let an unverified leg through, which is the unsafe direction. The verifier's scope is not being reduced by this decision for any contract the engine can use.

**Open question for you:** should the verification window match the engine's `maxStrikesAtm` (7) exactly, or be wider for safety? I recommend matching it exactly, with the per-leg guard, since a wider window only adds contracts that can never be selected.

## Dependencies
- B3/B7 implementation depends on reading the options engine's leg selection in full (`opportunityEngine.ts`), which is part of the Options V2 audit (Stage 8).
