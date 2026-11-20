# Issue 2 — B1: Diagnostic Classification of Unavailable Factors (Fix Report)

Date: 2026-11-06 (IST). Written for: the project owner and reviewers.

Scope: fix B1 from `docs/ISSUE2_STALE_CLASSIFICATION_INVESTIGATION.md` (§9). Only the diagnostic's blocker classification changed. B2–B7 were not started.

## 1. Summary

The diagnostic reported every unavailable factor as `INSUFFICIENT_TECHNICAL_DATA`. A stale or missing option chain therefore appeared as a technical-data problem. After this change, each unavailable factor is classified by its own category:

- Market trend, Price action, Technical indicators → `INSUFFICIENT_TECHNICAL_DATA` (unchanged)
- Option chain / OI, Volatility / IV → `INSUFFICIENT_OPTION_CHAIN` (was technical)
- News sentiment, Breadth / confirmation → `INSUFFICIENT_FRESHNESS` (was technical)
- "Full confirmation requires live news data" → `INSUFFICIENT_FRESHNESS` (was technical)

No engine decision, candidate, factor availability, threshold or eligibility outcome changed. A side-by-side run of nine scenarios confirms this (§5).

## 2. The problem before the fix

Reproduced with the real frozen engine on deterministic mock snapshots relabelled as live, using a scratch harness kept outside the repository. Baseline codes before the change:

| Scenario (unavailable) | Blocker codes before |
|---|---|
| Technical only | `INSUFFICIENT_TECHNICAL_DATA`, `NO_VALID_STRATEGY` |
| **Option chain only** | `INSUFFICIENT_TECHNICAL_DATA`, `NO_VALID_STRATEGY` ← mislabel |
| Technical + option chain | `INSUFFICIENT_TECHNICAL_DATA`, `NO_VALID_STRATEGY` ← chain part hidden |
| News only | `INSUFFICIENT_TECHNICAL_DATA` ×2, `NO_VALID_STRATEGY` ← mislabel |
| Breadth only | `INSUFFICIENT_TECHNICAL_DATA`, `NO_VALID_STRATEGY` ← mislabel |
| All four categories | `INSUFFICIENT_TECHNICAL_DATA` ×2, `NO_VALID_STRATEGY` |

Cause: `classifyEngineBlocker` in `web/src/lib/recommendationDiagnostic.ts` matched the text `not enough comparable data` (and `requires live news`) and returned `INSUFFICIENT_TECHNICAL_DATA` without reading the factor names. The engine text is `Not enough comparable data to trade: <factor labels> unavailable` (`web/src/lib/engine/strategy.ts:257`).

## 3. Changed files

| File | Change |
|---|---|
| `web/src/lib/recommendationDiagnostic.ts` | Added factor-label → category map (`UNAVAILABLE_FACTOR_CODE`); added `comparableDataParts` (internal) and `classifyEngineBlockers` (new export); `classifyEngineBlocker` now uses the factor names; `diagnose` emits one blocker per category |
| `web/src/lib/phase13.test.ts` | One expectation changed: the news-only case in the classifier table now expects `INSUFFICIENT_FRESHNESS` (it asserted the old mislabel). Two cases added for option-chain and technical text |
| `web/src/lib/recommendationDiagnostic.classification.test.ts` | **New.** 19 offline tests (§4) |
| `docs/ISSUE2_B1_DIAGNOSTIC_CLASSIFICATION_FIX_REPORT.md` | This report |

Not changed: `engine/strategy.ts`, `engine/analysis.ts`, `services/*`, any threshold, any test expectation other than the one noted above.

### 3.1 Mapping and why

| Factor label (`analysis.ts` rows) | Subsystem | Code | Reason |
|---|---|---|---|
| Market trend | technical | `INSUFFICIENT_TECHNICAL_DATA` | Derived from candles |
| Price action | technical | `INSUFFICIENT_TECHNICAL_DATA` | Derived from candles |
| Technical indicators | technical | `INSUFFICIENT_TECHNICAL_DATA` | Derived from candles |
| Option chain / OI | optionChain | `INSUFFICIENT_OPTION_CHAIN` | The existing code for chain problems (used by gate 3 and by RECOMMEND-05) |
| Volatility / IV | optionChain | `INSUFFICIENT_OPTION_CHAIN` | Same chain source |
| News sentiment | news | `INSUFFICIENT_FRESHNESS` | Unavailable because its source differs from the market source |
| Breadth / confirmation | breadth | `INSUFFICIENT_FRESHNESS` | Same source-mismatch rule |

**Decisions for you to confirm:**
- **No new blocker codes were added.** The chain factors use the existing `INSUFFICIENT_OPTION_CHAIN`. News and breadth use the existing `INSUFFICIENT_FRESHNESS`. The alternative is `UNCLASSIFIED`, which is less informative. A dedicated code would be a public API change, which the brief asked to avoid.
- **News and breadth are coded as freshness.** A factor is unavailable when its source does not match the market source. That is a freshness-basis mismatch, so `INSUFFICIENT_FRESHNESS` fits. For breadth with no constituents at all (not a freshness problem), the title "Insufficient freshness" is slightly imprecise.

### 3.2 Mixed texts

One engine text can name several categories. `classifyEngineBlockers(text)` returns one part per category, and each part's message keeps only that category's factor names:

```
Not enough comparable data to trade: Market trend, Option chain / OI unavailable
→ INSUFFICIENT_TECHNICAL_DATA : "Not enough comparable data to trade: Market trend unavailable"
→ INSUFFICIENT_OPTION_CHAIN   : "Not enough comparable data to trade: Option chain / OI unavailable"
```

Unknown labels become `UNCLASSIFIED`, never dropped. Non-comparable texts return exactly the previous code and the original message.

### 3.3 API note

- `classifyEngineBlocker(text): BlockerCode` keeps its signature. For a combined comparable text it returns the first category. Its doc comment says so.
- `classifyEngineBlockers(text)` is new. It is the only path that reports every category, and `diagnose` uses it.
- `candidateCodes` still calls `classifyEngineBlocker` on candidate rejections. Those texts never contain the combined comparable text, so behaviour there is unchanged.

## 4. Tests

### 4.1 New tests (`recommendationDiagnostic.classification.test.ts`, 19)

Classifier:
1. Technical-only text → technical.
2. Option-chain-only text → option chain (not technical).
3. Mixed technical + option-chain text → two parts, each naming only its own factors.
4. News-only and breadth-only text → freshness.
5. "Full confirmation requires live news data" → freshness.
6. All seven labels together → three parts, every factor present, none dropped.
7. Unknown label → `UNCLASSIFIED`.
8. Drift guard: every factor label the engine produces maps to a real category (uses the live engine's own `factors`).
9. Non-comparable texts unchanged.

Diagnostic, real engine:
10. No unavailable factors → TRADE, no blockers.
11. Technical-only → technical code; no chain code.
12. Option-chain-only → chain code; stage 3 BLOCKED, stage 4 PASS.
13. Mixed → both categories, each with its own factors.
14. News-only → freshness; no technical or chain code.
15. Breadth-only → freshness; no technical code.
16. All four → each category reported; `NO_VALID_STRATEGY` still present.
17. Existing stale diagnostic unchanged (stale spot → `STALE_MARKET_DATA`, not TRADE).
18. Existing no-valid-strategy diagnostic unchanged.
19. Engine decisions and candidate counts match baseline values.

The existing `RECOMMEND-04`, `RECOMMEND-05` and `RECOMMEND-12` tests in `phase13.test.ts` pass unmodified.

### 4.2 Results

| Check | Before | After |
|---|---|---|
| `npm test` | 1962 pass, 0 fail | **1983 pass, 0 fail** (+19 new, +2 table cases) |
| `npx tsc --noEmit` | not re-run before | exit 0 |
| `npx eslint` on the 3 changed files | — | exit 0 |
| Targeted run (new file + phase13) | — | 108 pass, 0 fail |

## 5. Verification that decisions did not change

A scratch harness (outside the repo) ran nine scenarios, once before and once after the change, and diffed the output:

- **Engine output** (`analyze`: regime, score, status, candidates, factor availability, engine blockers): **0 differences across all nine scenarios.**
- **Diagnostic `engineDecision`, `finalDecision`, `eligible`, candidate list: no differences.**
- **Diagnostic blocker codes:** changed only where a comparable-data blocker was present (table below).
- **Checks (stages):** changed only at stages 3 and 4, as described below.

| Scenario | Codes before | Codes after |
|---|---|---|
| Option chain only | TECH, NO_VALID | **CHAIN**, NO_VALID |
| Technical + option chain | TECH, NO_VALID | TECH, **CHAIN**, NO_VALID |
| News only | TECH ×2, NO_VALID | **FRESHNESS** ×2, NO_VALID |
| Breadth only | TECH, NO_VALID | **FRESHNESS**, NO_VALID |
| All four | TECH ×2, NO_VALID | FRESHNESS, TECH, CHAIN, FRESHNESS, NO_VALID |
| Technical only, live OK, stale spot, no candidates | unchanged | unchanged |

Stage changes:
- Option chain only: stage 3 "Live option chain" PASS → **BLOCKED**; stage 4 "Technical warmup" BLOCKED → **PASS**. This is the intended correction.
- Technical + option chain and all four: stage 3 PASS → **BLOCKED**.

Summary strings list the codes, so they change in the same way. Eligibility did not change: any blocker still makes a recommendation ineligible.

## 6. Consumers inspected

- **UI** (`RecommendationDiagnosticPanel.tsx`, `RecommendationCard.tsx`, `RecommendationWidget.tsx`, `SectionViews.tsx`): renders `code`, `title` and `message` generically. No code-specific branching. Titles are unchanged.
- **`postLogin.ts:37`**: collects blocker codes into a list. No keying on specific codes.
- **`backtestEngine.ts:86`**: matches the text prefix `not enough comparable data` → `MISSING_INPUTS`. Engine text is unchanged, so this still works.
- **Tests:** only `phase13.test.ts` and `marketData.test.ts:292` reference the text. `marketData.test.ts` checks the engine text, which is unchanged.
- **Scripts and docs:** no references to the changed codes outside the investigation report.

No public type was removed or renamed. `BlockerCode` is unchanged, so no new code needed to be handled by consumers.

## 7. Known issues left in place (outside B1)

1. **Stage 4 "Technical warmup" still shows BLOCKED for news-only and breadth-only.** The gate lists `INSUFFICIENT_FRESHNESS`, which those factors now share with technical-freshness messages. The reason text names the right factor, but the stage label is coarse. Fixing it needs either a separate code or a change to gate membership. Neither is in B1's scope.
2. **A candidate rejection text is classified `UNCLASSIFIED`.** "Market or option chain data is unavailable or stale" (`Long Call: …`, `Bull Call Spread: …`) appears in the stale-spot scenario. It is classified `UNCLASSIFIED` on the engine path and `STALE_MARKET_DATA` on the candidate path, so the same message gets two codes. This is pre-existing and not part of the comparable-data mapping. Not changed.
3. **Duplicate stale messages in the stale-spot scenario** (`STALE_MARKET_DATA` listed twice): a pre-existing effect of the engine and candidate paths both reporting staleness. Not changed.

## 8. Restrictions — confirmation

- **Strategy 11.4 not changed.** `web/src/lib/engine/strategy.ts` has zero diff against HEAD, and its SHA-256 is still `d0170b40…3eb3f18`.
- **Candidate generation not changed.** `strategy.ts` and `analysis.ts` have zero diff against HEAD.
- **Factor availability not changed.** No edit to `analysis.ts`.
- **Freshness thresholds not changed.** No edit to `time.ts` or the freshness rules.
- **Option-chain verification not changed.** No edit to `optionPriceVerification.ts`. Tick tolerance untouched.
- **Breadth and candle handling not changed.** No edit to `breadthService.ts` or `upstoxMarket.ts`.
- **Risk controls not changed.** No edit to risk modules.
- **No Upstox or NSE request.** All tests and the scenario harness use deterministic mock snapshots. Nothing called a network service.
- **No backtests or collectors run.**
- **`.data/` and `.research-data/` not modified.** `web/.research-data/` mtimes are from 4–5 November, before this change, and the change did not write to them.
- **Unrelated dirty Git changes preserved.** Nothing was staged, committed, reset or cleaned. The working tree already contained uncommitted changes before this task, including two hunks in `recommendationDiagnostic.ts` (the `underlying` type and `underlying: s.index.toUpperCase()`). I did not modify them.
- **Scope held.** B2–B7 not started.

## 9. How to reproduce

```
cd web
node --test --experimental-strip-types src/lib/recommendationDiagnostic.classification.test.ts src/lib/phase13.test.ts
npm test
npx tsc --noEmit
```

The scenario comparison used a scratch script outside the repository; it is not committed.
