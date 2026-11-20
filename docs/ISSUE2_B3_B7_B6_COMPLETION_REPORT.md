# B3 / B7 (option-chain verification) and B6 (freshness consistency) — Completion Report

Date: 2026-11-06 (IST). Written for: the project owner. Decisions were taken under delegated authority; each is recorded with its reason.

**Status.** B3/B7: implemented and tested offline, with one structural limit that needs your decision (§5). B6: remaining actionable items implemented; residual mismatches documented precisely (§4). Live behaviour is not verified; everything here is offline with stubbed upstream data.

## 1. Options flow, as traced

| Stage | Location | Behaviour |
|---|---|---|
| Chain fetch and per-contract verification | `upstoxMarket.ts` `getOptionChain` → `optionPriceVerification.ts` `verifyEvaluationOptionPrices` | Every contract is quoted and verified; the chain-level state requires all of them |
| Candidate selection (options engine) | `engine/opportunityEngine.ts` `evaluateOptionsOpportunity` | ATM ±`FILTERS.maxStrikesAtm` (7), capped at 15 rows; each candidate needs its own LIVE, consistent quote |
| Single-leg candidate guard | `opportunityEngine.ts` (per candidate) | Rejects non-LIVE, mismatched, stale, aging or unverified contracts; checks instrument identity |
| Frozen strategy plans (multi-leg) | `engine/strategy.ts` (read-only) | Long leg by delta; spread short leg at long ± ATR-based width; condor wings at OI support and resistance. **Legs can sit outside ATM ±7.** |
| Recommendation layer | `recommendationEnricher.ts` `buildRecommendationResponse` | Previously checked only the first BUY leg's contract; **short legs and condor wings were never checked** |
| Diagnostic | `recommendationDiagnostic.ts` | Reports the blocker and now the verification detail |

**Confirmed gap before this work:** a multi-leg TRADE could carry a short or wing leg whose quote was stale, mismatched or outside any verified scope, and the recommendation would still be a TRADE.

## 2. Decisions

| # | Decision | Reason |
|---|---|---|
| D1 | The candidate window is **exactly ATM ±7 listed strikes**, from one shared definition (`services/optionCandidateWindow.ts`) | The engine, verifier summary and guard must not disagree; no second ATM calculation |
| D2 | Every proposed leg must be **inside the window and individually LIVE, price-consistent, with an instrument key and a last-trade time** | The brief's per-leg rule; closes the short-leg gap |
| D3 | A failing leg **blocks the recommendation** as NO TRADE, with one `NO_VALID_OPTION` line per leg | Fail-closed; the reason names the leg, the strike and the cause |
| D4 | The guard runs only when the live chain's verification is present; mock and fixture snapshots are reported as not applicable | Keeps paper and fixture flows unchanged. The live path always attaches verification (even on error) |
| D5 | The **full-chain request scope is kept** (see §5) | PCR, OI and volume aggregate the whole chain and feed the frozen strategy |
| D6 | Window results are **reported separately** from the full-chain gate | Operators see what was verified for the candidate set, and what still blocks chain analytics |

## 3. What changed

| File | Change |
|---|---|
| `web/src/lib/services/optionCandidateWindow.ts` | **New.** Single definition of the candidate window. |
| `web/src/lib/services/optionLegGuard.ts` | **New.** Per-leg verification; returns verdicts and blockers. |
| `web/src/lib/engine/opportunityEngine.ts` | Candidate selection uses the shared window. Behaviour identical: the same strike set. |
| `web/src/lib/services/optionPriceVerification.ts` | Adds `OptionWindowSummary` (window ATM and strikes, verified, eligible and rejected counts, reasons, out-of-window count). The previously unused `_maxStrikesAtm` is now `maxStrikesAtm`, used for the window. Request scope unchanged. Adds `optionPriceTolerance` (B2). |
| `web/src/lib/recommendationEnricher.ts` | Applies the leg guard to TRADE plans; a failing leg makes the decision NO_TRADE and adds the blockers. `legVerification` (optional) on the response. |
| `web/src/lib/recommendationDiagnostic.ts` | `NO_VALID_OPTION` classification for leg blockers; `optionVerification` block (window, leg checks, applicability). |
| `web/src/lib/services/candleFreshness.ts`, `upstoxMarket.ts` | B6: the frozen engine's 300 s technical fetch limit is applied upstream as `STALE_FETCH`. |
| `web/src/lib/services/market.ts` (earlier batch), `freshnessConsistency.test.ts` | B6: source freshness follows the data timestamp. |

`strategy.ts` and `analysis.ts`: unchanged (SHA-256 verified; zero diff against HEAD).

## 4. B6 — what was done and what remains

**Done:**
- Source freshness uses the data's own timestamp when one exists; fetch time is only the fallback (earlier batch).
- Technical freshness comes from the candle classification (earlier batch).
- **Engine and diagnostic cannot contradict on technical freshness.** The frozen engine blocks technical data whose fetch is older than 300 s. The same limit is now applied upstream (`STALE_FETCH`), so a LIVE technical label cannot coexist with that engine block. Test FG-4 shows the engine and diagnostic both report NO TRADE with the freshness reason.

**Remaining, documented:**
1. **Option-chain freshness.** The chain is LIVE only when the full-chain verification passes, which uses each contract's own exchange timestamp. Without verification it is STALE (the chain snapshot has no timestamp of its own; this is intentional). No change.
2. **Breadth freshness.** Unchanged: the B4 policy (every constituent fresh within 150 s; any stale or undated constituent makes the set STALE) is preserved.
3. **Quote labels are classified at fetch time.** Spot and chain labels are computed when the response is fetched and cached for 5 s and 15 s. A label can be up to one TTL old at request time. This is bounded and reported, not changed.
4. **The engine's market and option-chain fetch-age rules (120 s)** cannot fire under the current quote and chain TTLs (5 s and 15 s), so they cannot contradict the labels today. They remain as a safety net in the frozen engine.

## 5. B3 / B7 — the structural limit (needs your decision)

The brief asked for the verifier's scope to match the engine's ATM ±7 window. I did **not** narrow the request scope, for this reason:

- The verifier's own comment states that PCR, OI and volume aggregate the **entire returned chain**, so verification must cover that same universe.
- The frozen strategy consumes those full-chain aggregates as factor inputs (`analysis.ts` → `chainMetrics`).
- Narrowing the request scope would leave full-chain OI and volume unverified. The chain-level analytics gate would then fail for every recommendation, which would suppress all options recommendations.
- Changing the aggregates to window-only would change Strategy 11.4's inputs. That is not permitted.

**What this means in practice:** the per-leg guard now enforces the window for every leg, and the window's verification is reported. But the chain-level analytics gate still requires every contract in the chain to pass. A single illiquid contract far outside the window can therefore still stop the options engine from producing actionable grades. This is the existing conservative behaviour, unchanged.

**Options for you:**
- (a) Keep as is (recommended for now): safe, but a far illiquid contract can block all options recommendations. Measurable only with live data.
- (b) Make the frozen strategy's aggregates window-scoped. This changes Strategy 11.4 behaviour and needs your explicit approval and a separate validation.
- (c) Make the options engine's own analytics window-scoped, leaving the frozen factor path unchanged. This changes which OI figures the options engine's grades use, so it changes recommendations and needs your approval.

I recommend (a) now and (c) as a later, separately approved step.

## 6. Tests

| File | Tests | Scope |
|---|---|---|
| `services/optionWindowLegs.test.ts` | 21 | Window definition (W-1..5: ATM ±7 boundaries, ATM equals the engine's, short chains, empty chain, engine candidates inside the window); window verification (V-1..4: all LIVE, in-window stale, out-of-window stale, in-window mismatch); per-leg guard (G-1..10: single leg, two-leg spread, spread with a far short leg, iron condor with two outer wings blocked, stale leg, failed independent check, missing key, strike not in chain, not-applicable without verification, multiple blockers); end-to-end with the real frozen engine (R-1: a TRADE with a far leg becomes NO TRADE with the diagnostic naming the leg; R-2: a TRADE with legs inside the window is unchanged) |
| `services/optionPriceConsistency.test.ts` | 8 | B2 tick-aware tolerance |
| `services/technicalFetchGate.test.ts` | 4 | B6: the 300 s limit matches the engine; boundary at 299 s and 301 s; cache hit with an old fetch becomes STALE through the real loader; engine and diagnostic agree |
| `services/freshnessConsistency.test.ts` | 7 | B6 (earlier batch) |

**Results:** full suite **2121 pass, 0 fail, 0 pending**. TypeScript exit 0. ESLint: 0 errors. Two warnings remain in `opportunityEngine.ts` (an unused import and an unused destructured name), both pre-existing and outside this change. Strategy 11.4 SHA-256 unchanged: `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18`.

## 7. Limits

- All verification is offline. The live behaviour of the window, the per-leg guard and the 300 s fetch gate is not verified.
- The window verification uses the same chain rows the engine uses. If the live chain changes shape between fetches, the window is recomputed for each fetch.
- Frozen-strategy legs outside ±7 are blocked, not re-planned. The frozen engine is not modified, so such plans will simply not be recommended.
