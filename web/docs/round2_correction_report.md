# Round 2 Correction Report

**Date:** 2026-11-03  
**Scope:** Corrections to Round 2 documents. No code changed. No production data touched.

---

## 1. Corrections Applied

### 1.1 Completion tracker: `POST /api/risk/assess` downgraded

**Error:** `POST /api/risk/assess` was listed as **Complete**.  
**Evidence:** `apiIntegration.test.ts` tests the service layer with fully-populated fixtures; the route handler itself has no body shape validation. A caller omitting required fields (e.g. `maxLoss`) triggers a runtime type error, not a structured 400 response.  
**Correction:** Status changed to **Partially Complete** — risk assessment logic complete; route handler lacks input validation.  
**File:** `docs/full_application_completion_tracker.md`, API Routes table.

### 1.2 Completion tracker: long-term engine moved to Blocked

**Error:** Long-term engine was listed as **Partially Complete**.  
**Evidence:** A "Partially Complete" status implies progress toward completion. The engine returns `fundamentalDataAvailable: false` for every call — it is entirely non-functional for its primary purpose. No provider has been selected, approved, or verified. This is a hard block, not a partial completion.  
**Correction:** Status changed to **Blocked** — two candidates identified (FMP, Twelve Data) but none selected, approved, or API-keyed.  
**File:** `docs/full_application_completion_tracker.md`, Strategy Engine table.

### 1.3 Completion tracker: summary counts recalculated

**Error:** Summary showed Complete: 94, Partially Complete: 5, Blocked: 3.  
**Correction (as stated at time):** Complete: 92 (−2), Partially Complete: 6 (+1), Blocked: 4 (+1).  

**Subsequent correction (2026-11-03 final audit):** The "−2 Complete" above contains an arithmetic error. Two reclassifications occurred: (1) risk/assess Complete→PC = C: −1, PC: +1; (2) long-term engine PC→Blocked = PC: −1, B: +1. Net: **Complete −1, Partially Complete ±0, Blocked +1**. The correct post-Round-2 corrected values (starting from the 94/5/3 baseline) are Complete: 93, PC: 5, Blocked: 4.

Additionally, the "94 Complete / 135 total" baseline was itself stale — the tracker grew to 204 rows through Phase 2.3.16 additions. A full row-by-row recount (see `docs/round2_final_consistency_audit.md` §1) gives the authoritative current counts: Complete=159, PC=5, RLA=32, Blocked=5, NI=3, Total=204.

**File:** `docs/full_application_completion_tracker.md`, Summary Counts.

### 1.4 Completion tracker: strategy git-tag removed

**Error:** "Strategy git-tag `strategy-11.4-frozen`" appeared in Remaining Blocked Items and Remaining Offline-Completable Work.  
**Evidence:** Owner explicitly confirmed no permanent tag is required.  
**Correction:** Entry removed from both lists. Strategy baseline integrity row updated to remove "git-tag pending" language.  
**File:** `docs/full_application_completion_tracker.md`.

### 1.5 Remaining gaps report: false "provider selected and approved" claim

**Error:** Blocker B4 stated "Fundamental data provider — provider selected and approved; API key obtained".  
**Evidence:** No provider selection, approval, or API key procurement occurred. This was a prospective description of what should happen, incorrectly written in the past tense.  
**Correction:** B4 rewritten as: "Nothing selected, approved, or licensed; no API key. Comparison doc done. Integration blocked until provider passes all 6 gates."  
**File:** `docs/round2_remaining_gaps_report.md`, §8.

### 1.6 Remaining gaps report: Option History clarified

**Error:** Skipped E2E test for Option History stated only "Upstox Plus only" as the reason.  
**Evidence:** Upstox Plus plan removes the data restriction, but a valid OAuth session is also required to authenticate API calls. Both are necessary.  
**Correction:** Reason updated to: "requires Upstox Plus plan **and** valid OAuth session."  
**File:** `docs/round2_remaining_gaps_report.md`, §1.2.

### 1.7 Remaining gaps report: disk crash recovery prerequisite count corrected

**Error:** §5 stated "6 prerequisites remain unresolved."  
**Evidence:** The implementation plan (§10) now documents 14 prerequisite decisions (D1–D11 plus items 1–3 from the specification).  
**Correction:** Updated to "14 prerequisite decisions remain unresolved."  
**File:** `docs/round2_remaining_gaps_report.md`, §5.

---

## 2. Per-Stock Technicals Design Corrections

**File:** `docs/per_stock_technicals_implementation_plan.md`

### 2.1 RSI scoring symmetry

**Error:** Bearish OVERSOLD case was missing. A BEARISH trade in oversold territory is a contra-signal (don't short into a bounce).  
**Correction:** Added symmetric cases: `BEARISH + OVERSOLD → adj -= 5` (penalty); `BEARISH + OVERBOUGHT → adj += 5` (confirmation).

### 2.2 RSI threshold boundary ambiguity

**Error:** Zones were described as `<40`, `40-60`, `>60` without specifying which side of the boundary 40 and 60 belong to.  
**Correction:** Strict inequality: `OVERSOLD: rsi < 40`, `NEUTRAL: 40 ≤ rsi ≤ 60`, `OVERBOUGHT: rsi > 60`.

### 2.3 Contradictory signal handling

**Error:** No guidance on what happens when EMA says up but MACD says down and VWAP is below.  
**Correction:** Added explicit contradiction detection: when signals conflict, the additive overlay naturally reduces toward neutral; explicit contradiction reasons are appended to `reasons[]`.

### 2.4 Insufficient candle history

**Error:** No explicit guard when `candleCount < 15`.  
**Correction:** Added: if `source === "UNAVAILABLE"` or `candleCount < 15`, bypass overlay entirely. Do not compute partial results.

### 2.5 Zero-volume VWAP

**Error:** No handling for candles with `volume === 0` or `volume === null`.  
**Correction:** Added: filter `volume === null || volume === 0` before passing to `vwap()`.

### 2.6 Invalid OHLC candles

**Error:** No validation of candle integrity.  
**Correction:** Added `isValidCandle()` filter: `high >= low`, `close` within `[low, high]`, `open` within `[low, high]`.

### 2.7 Missing and stale candle data

**Error:** Not addressed.  
**Correction:** Stale check added: if last candle > 30 min behind `now`, mark intraday VWAP source as UNAVAILABLE. Gap handling documented: indicator functions tolerate gaps (they operate on the array as given); gap-filling by interpolation is explicitly prohibited.

### 2.8 Synthetic vs live provenance

**Error:** `source` type was `"LIVE" | "UNAVAILABLE"` — no way to distinguish test fixtures from live data.  
**Correction:** Added `"SYNTHETIC_TEST"` as a valid source. Production code must never set `"SYNTHETIC_TEST"`. Enforced via required `source` parameter on `computeStockTechnicals()`.

### 2.9 Math.random() removed from fixtures

**Error:** `syntheticDailyCandles()` used `Math.random() * 100_000` for volume.  
**Correction:** Volume replaced with constant `500_000`. All fixtures are now fully deterministic.

### 2.10 Test coverage expanded

**Error:** Original test cases covered only bullish-positive and unavailable scenarios.  
**Correction:** Added tests for: bearish confirmation (T9), bearish RSI contra-signal (T11), conflicting EMA/VWAP signals (T12), score bounds at 0 (T14) and 100 (T15), null-volume VWAP exclusion (T16), invalid OHLC filter (T6). Total: 16 test cases.

---

## 3. Disk Crash Recovery Decision Coverage

**File:** `docs/disk_crash_recovery_implementation_plan.md`

**Error:** Original plan listed 6 prerequisite decisions (4 from spec §7 + 2 from implementation). It missed 8 additional decision areas identified in the spec correction request.

**Correction:** Added decisions D1–D11 as explicit named decisions, each with a proposal and alternative:

| Decision | Topic | Status |
|----------|-------|--------|
| D1 | Pure vs mutating `applyEvent` | Proposal: pure. Requires owner decision. |
| D2 | Event schema versioning | Proposal: `schemaVersion: "1"` literal. Requires owner decision. |
| D3 | Legacy event migration + collision prevention | Proposal: deterministic SHA-256 `eventId` derivation. Requires owner decision. |
| D4 | `eventId` generation | Proposal: `crypto.randomUUID()`. Requires owner decision. |
| D5 | Sequence number ownership | Proposal: owned by `paperLedgerStore.ts`. Requires owner decision. |
| D6 | `appliedEventIds` compaction | Proposal: snapshot-and-truncate at 10,000 events. Requires owner decision. |
| D7 | Snapshot/event-log atomicity | Proposal: snapshot written first; log archived after. Requires owner decision. |
| D8 | Concurrent access + locking | Proposal: document single-writer assumption; add lock if concurrency introduced. Requires owner decision. |
| D9 | Corrupt + truncated event handling | Proposal: extends existing `readPersistedEvents()` skip behaviour. Requires owner decision. |
| D10 | Orphan tmp file handling | Proposal: delete unconditionally; never promote. Requires owner decision. |
| D11 | Recovery failure behaviour | Proposal: fall back to `.bak` snapshot; surface `RECOVERY_INCOMPLETE` in OpsPanel; do not crash. Requires owner decision. |

Prerequisites checklist updated: 15 items (was 7). **No code changes until all 14 decisions are resolved.**

---

## 4. Fundamental Provider Comparison Corrections

**File:** `docs/fundamental_provider_comparison.md`

**Error:** The Recommendation section described a sequential evaluation process without making the current state of each gate explicit. A reader could infer that a provider had been partly approved.

**Correction:** Added explicit status table with 6 binary gates per provider: Candidate / Selected / Approved / API key available / Coverage verified / Licensing verified. All non-candidate rows set to ☐ No. The status table makes the current state unambiguous — nothing has been selected, approved, or verified.

---

## 5. What Was Not Changed

- Strategy 11.4 source code: unchanged
- `paperEngine.ts`, `paperLedgerStore.ts`, `paperTypes.ts`: unchanged
- All test files: unchanged
- Production `.data/` directory: untouched
- All feature flags: unchanged (both false)
- LaunchAgent, runner, supervisor: remain disabled/stopped
- No new code written. No provider integrated. No API keys obtained.

---

## 6. Documents Updated

| Document | Changes |
|----------|---------|
| `docs/full_application_completion_tracker.md` | Risk assess → Partially Complete; long-term engine → Blocked; summary counts corrected; git-tag removed; Round 2 correction change log added |
| `docs/round2_remaining_gaps_report.md` | B4 false claim corrected; Option History clarified (Plus + auth); disk crash count corrected; git-tag removed from blockers |
| `docs/per_stock_technicals_implementation_plan.md` | Full rewrite addressing all 8 design issues; Math.random removed; 16 deterministic test cases; provenance source type corrected |
| `docs/disk_crash_recovery_implementation_plan.md` | D1–D11 decisions added; prerequisites checklist expanded to 15 items |
| `docs/fundamental_provider_comparison.md` | Provider status table added with 6 explicit gates; recommendation section replaced with gate-based evaluation sequence |
| `docs/round2_correction_report.md` | Created (this document) |
