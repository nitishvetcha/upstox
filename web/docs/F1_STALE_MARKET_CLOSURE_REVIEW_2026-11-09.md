# F1 closure review: STALE market quotes and every recommendation path (2026-11-09)

Written for: the project owner and maintainers.
Scope: read-only static inspection of production code, plus the existing stored journal (read only). No code, test, data, journal entry or saved pick was changed. No live Upstox or broker request was made, no token was read, and `strategy.ts` (frozen Strategy 11.4) was not modified.

Classification used:
- **PROTECTED**: the path cannot expose or act on a STALE market quote as executable.
- **POTENTIAL BYPASS**: a route is structurally able to reach a TRADE from a STALE quote, but a separate control stops it, and that control is not itself verified here.
- **CONFIRMED BYPASS**: a route exposes an executable TRADE from a STALE market quote. None found.
- **NOT VERIFIED**: could not be traced to a conclusion in this review.

Two distinct things are protected, and this review keeps them apart:
1. **Internal engine analysis** (`analyze()` in the frozen `strategy.ts`). It calls `evaluateTradeRisk` (`strategy.ts:240`). Its `best` plan requires `risk.allowed` (`strategy.ts:246`). Since F1, the risk service rejects a STALE market quote, so the engine cannot select a plan for it. The engine's own `staleness()` function is unchanged and does **not** name the STALE market label.
2. **Final application recommendation** (`buildRecommendationResponse`, `recommendationEnricher.ts`). Since F1 it sets `decision` to `NO_TRADE` and adds a `STALE_MARKET` blocker whenever `sources.market.source === "STALE"`, regardless of what the engine computed.

---

## 1. Summary

| Path | Classification | Protection that applies |
|---|---|---|
| `POST /api/recommendations/generate` | **PROTECTED** | Enricher `STALE_MARKET` blocker + internal risk gate |
| `GET /api/recommendations/diagnostic` | **PROTECTED** | `diagnose` uses the enricher's decision |
| `postLogin.evaluateIndex` (post-login diagnostic) | **PROTECTED** | `diagnose` uses the enricher's decision |
| `GET /api/analysis/[index]`, `getAnalysis`, dashboard `SectionViews` / `MarketCard` | **PROTECTED** (indirect) | Engine-internal risk gate only; no enricher blocker on this raw path |
| `POST /api/recommendations/[id]/paper-trade` | **PROTECTED** | `processRecommendation` rejects STALE market (`FRESHNESS_BLOCKED`) |
| `POST /api/paper-trading/enter` | **PROTECTED** | Same as above |
| `POST /api/risk/assess` | **PROTECTED** | Independent risk gate (`STALE_PRICE`), not bypassed by a fresh chain |
| `POST /api/recommendations/[id]/refresh` | **PROTECTED** | Refuses non-LIVE chain; market label not needed for the option price |
| `backtestEngine.ts` (historical replay) | **NOT VERIFIED** (not a live exposure) | Not traced to its outputs |
| Confirmed bypasses | **None found** | |

---

## 2. Every caller of the analysis function

`analyze()` is called at:

| File:line | Caller | Output reaches |
|---|---|---|
| `src/app/api/recommendations/generate/route.ts:24` | generate route | `buildRecommendationResponse` → API response, journal |
| `src/app/api/recommendations/diagnostic/route.ts:16` | diagnostic route | `diagnose(analysis)` → API response |
| `src/app/api/recommendations/[id]/paper-trade/route.ts:32` | paper-trade route | `paperEngine.processRecommendation(analysis)` |
| `src/app/api/paper-trading/enter/route.ts:15` | paper-enter route | `paperEngine.processRecommendation(analysis)` |
| `src/lib/postLogin.ts:26` | `evaluateIndex` | `diagnose(analysis)` → post-login result |
| `src/lib/backtestEngine.ts:517` | backtest | historical snapshots |
| `src/lib/services/market.ts:132` | `getAnalysis` (cached) | `/api/analysis/[index]`; `SectionViews.tsx` (lines 21, 49, 51) |

`buildRecommendationResponse` is called at `generate/route.ts:25`, `recommendationDiagnostic.ts:230` (inside `diagnose`), and nowhere else in production.

`evaluateTradeRisk` is called at `src/app/api/risk/assess/route.ts:24`, `src/lib/paperEngine.ts:348`, `src/lib/engine/strategy.ts:240` (inside `analyze`), and `src/lib/backtestEngine.ts:520, 536`.

---

## 3. Path-by-path findings

### 3.1 `POST /api/recommendations/generate` — **PROTECTED**
- Flow: `getSnapshot` → `analyze(snapshot)` (`generate/route.ts:24`) → `buildRecommendationResponse` (`:25`) → journal (`:40-41`) → response (`:43`).
- Enricher: `recommendationEnricher.ts:261-268`: `staleMarketBlocker` → `effectiveDecision = "NO_TRADE"`. The blocker is appended to `effectiveBlockers` (line ~272), which feeds both `reasons` (line ~330) and `blockers` (line ~331).
- The enricher's `decision` (line ~310) is what the route returns and what the journal stores (`rec` is the snapshot, `generate/route.ts:43`).
- **Survival of the blocker:** `effectiveBlockers` → `reasons`/`blockers` → API response → journal snapshot (the journal stores the full `RecommendationResponse`; verified by the stored-record structure in the provenance audit). No later transformation drops it in this path.
- **Fresh chain cannot override:** the enricher checks `sources.market.source` only (`:262`); the chain is irrelevant to this check.
- Internal risk gate also rejects (see 4.2), so `analysis.status` cannot be TRADE for this snapshot.
- **Evidence:** `src/lib/engine/staleMarketGate.test.ts` SM-1 (STALE with current `fetchedAt` → `NO_TRADE`, blocker present), SM-5 (fresh chain does not override).

### 3.2 `GET /api/recommendations/diagnostic` — **PROTECTED**
- `diagnostic/route.ts:16-17`: `analyze` → `diagnose(analysis, now)`.
- `recommendationDiagnostic.ts:230`: `rec = buildRecommendationResponse(a, now)`; line 231: `engineDecision = rec.decision` (the enricher's decision, including the STALE blocker); line 290: `finalDecision = mkt === "CLOSED" || hasMockInput ? "NO_TRADE" : engineDecision`. The raw `a.status` is not used for the final decision.
- **Result:** the diagnostic's final decision is `NO_TRADE` for a STALE market.
- **Caveat (not a bypass):** `diagnose` lists gates by stage (lines ~315-320). The STALE market is not a named gate there; it appears through the enricher's blockers. Not verified whether the UI shows that blocker text.

### 3.3 `postLogin.evaluateIndex` — **PROTECTED**
- `postLogin.ts:26`: `diagnose(analyze(s, now), now)`. The result includes `analysis: "READY"` and `spotSource`/`optionChainSource` labels (from the snapshot). It does not expose a trade decision in the lines read.
- Protection flows from `diagnose` (as 3.2).

### 3.4 `GET /api/analysis/[index]` and the dashboard (`getAnalysis`, `SectionViews.tsx`, `MarketCard`) — **PROTECTED (indirect)**
- **This is the one raw path.** `getAnalysis` (`market.ts:132`) returns the engine's `Analysis` object directly (`/api/analysis/[index]/route.ts:7`). It does **not** pass through `buildRecommendationResponse`, so the enricher's `STALE_MARKET` blocker does not appear here.
- For a STALE market quote, protection comes from the **engine-internal risk gate**:
  - `strategy.ts:240`: each candidate's `risk = evaluateTradeRisk(...)`.
  - `riskService.ts:216-221`: `isMarketStale` includes `mSrc.source === "STALE"` → `reasons.push("STALE_PRICE")` → `allowed = false`.
  - `strategy.ts:246`: `best` requires `!c.rejected && c.risk?.allowed`. With every candidate rejected, `best` is `null`.
  - `strategy.ts` (plan assignment): `plan` is `best`, so it is `null`. `status` cannot be TRADE: with candidates but none usable it becomes `NO TRADE`; with no candidates it becomes `WAIT` or `NO TRADE`.
- `SectionViews.tsx:107`: `c.rejected ?? (a.plan?.strategy === c.strategy ? "RECOMMENDED" : ...)`. For a STALE market, `a.plan` is null, so no candidate is labelled "RECOMMENDED".
- **Limitation:** the raw `stale` array does not name the market STALE label. The raw output's rejection reason is the risk service's human text ("Market or option chain data is unavailable or stale"). The protection depends on `riskService` staying in place. If that check were removed, this raw path would be the first to expose a TRADE. Recorded as a dependency, not a bypass.
- **Evidence:** RG-1, RG-4 (`staleMarketGate.test.ts`): the risk gate rejects STALE independently. SM-1 covers the decision that depends on the same inputs.

### 3.5 `POST /api/recommendations/[id]/paper-trade` — **PROTECTED**
- `paper-trade/route.ts:32-35`: `analyze(snapshot)` → `engine.processRecommendation(analysis)`. The raw analysis is used here, not the enricher's output.
- `paperEngine.ts:256-272`: `processRecommendation` rejects any market source that is not `LIVE` (`sourceAcceptable`, lines 219-221: `LIVE`, or `MOCK` only if `allowMock`). STALE → `FRESHNESS_BLOCKED: Market data source is STALE`. This runs before any plan is used.
- **Production engine:** `paperStore.ts:13-14` constructs the production engine with `allowMock: false`. The default `allowMock = true` (`paperEngine.ts:195`) applies only to other constructions (tests; `paperEngine.ts` default). No production path constructs an engine with the default.
- **Status:** PROTECTED for STALE. Recorded so the MOCK question is explicit: the production engine rejects MOCK too (`allowMock: false`).

### 3.6 `POST /api/paper-trading/enter` — **PROTECTED**
- `enter/route.ts:15-18`: same flow as 3.5, with the same `processRecommendation` freshness rejection. `updateJournalEntry` runs only when `result.created` (`:21-23`).

### 3.7 `POST /api/risk/assess` — **PROTECTED**
- `risk/assess/route.ts:24`: `evaluateTradeRisk(plan, s, inputs, overrideConfig)`, where `s = await getSnapshot(index)` (line 22).
- The client supplies the plan, but the market data comes from the live snapshot. A STALE market gives `STALE_PRICE` and `allowed: false`, regardless of the plan.
- The client can pass `overrideConfig` and `inputs`. Neither can clear `STALE_PRICE`: the check is in `riskService.ts:216-221`, which reads only the snapshot and `now`.
- **Fresh chain cannot override:** `isMarketStale` (`riskService.ts:216`) reads `mSrc` only.
- **Evidence:** RG-1 (STALE → `STALE_PRICE`), RG-4 (fresh chain does not override).

### 3.8 `POST /api/recommendations/[id]/refresh` — **PROTECTED**
- Writes an outcome only from a LIVE option chain (`journalRefreshService.ts`). A STALE market quote is not used for the price. The refresh route does not produce a recommendation, so the STALE market label is outside its scope.
- **Evidence:** RS-6 (STALE chain refused), RS-9 (no entry-price substitution).

### 3.9 `backtestEngine.ts` — **NOT VERIFIED**
- Calls `analyze` (`:517`) and `evaluateTradeRisk` (`:520`, `:536`) on historical snapshots. Not on the live routes. Whether backtest output reaches a live surface, or the journal, was not traced in this review.

---

## 4. Specific checks requested

### 4.1 Does the enricher's `STALE_MARKET` blocker survive to the API response?
- **Yes, for the generate route.** Assignment at `recommendationEnricher.ts:261-268`; included in `effectiveBlockers` (line ~272); returned as `reasons` and `blockers` (lines ~330-331); the route returns the enricher's object (`generate/route.ts:43`). The journal stores the same object.
- **Diagnostic:** the enricher's decision is used (3.2), but the blocker text is not necessarily shown (noted as a caveat).

### 4.2 Can a STALE quote produce an executable TRADE without the risk service rejecting it?
- **No.** `best` requires `risk.allowed` inside the engine (`strategy.ts:246`), and `riskService.ts:216-221` rejects STALE for every candidate. Separately, the enricher forces `NO_TRADE` for STALE, and the paper engine rejects STALE by source.

### 4.3 Can a fresh option chain override a STALE market quote?
- **No, in every path reviewed.** The market check reads the market label only (`riskService.ts:216`; `recommendationEnricher.ts:262`). The paper engine checks both sources, and the market source is rejected on its own (`paperEngine.ts:270`).

### 4.4 Any path using the raw engine decision before enrichment?
- **Yes: `/api/analysis/[index]`, the dashboard (`getAnalysis`, `SectionViews`), and the paper routes** (which use the raw analysis by design: `processRecommendation(analysis)`). For a STALE market each is protected by the engine's internal risk gate or by `processRecommendation`'s freshness check, not by the enricher. Classified PROTECTED (3.4, 3.5, 3.6).

---

## 5. Residual risks and dependencies (not bypasses)

- **R1 (dependency):** the raw analysis path (3.4) depends on `riskService.ts` rejecting STALE. Removing or weakening that check would expose TRADE through `/api/analysis`, the dashboard and the engine's own `best` plan. The enricher's blocker would not cover this path.
- **R2 (labelling):** the raw analysis output does not carry a named `STALE_MARKET` reason. Its explanations come from risk-service text, which is less specific.
- **R3 (test coverage):** the tests for F1 check the enricher decision and the risk gate. No test checks the raw `/api/analysis` JSON or the dashboard rendering for a STALE market.
- **R4 (historical journal):** no stored journal entry has a STALE market source (scan of 26 records in the provenance audit: `dataQuality` labels LIVE and END_OF_DAY only). So no pre-fix entry needs reclassification.
- **R5 (backtest):** not traced to live output (3.9).
- **R6 (diagnostic display):** the diagnostic's gate list does not name the market STALE state (3.2 caveat).

---

## 6. Evidence and limitations

### Evidence used
- Static inspection (grep and read) of every file named above.
- Existing tests, referenced by name: `src/lib/engine/staleMarketGate.test.ts` (SM-1 to SM-5, RG-1 to RG-4), `src/lib/services/risk/riskService.test.ts` (RK-11), `src/lib/services/mockExecutionGuard.test.ts` (MX-1 to MX-3), `src/lib/options/options.test.ts` (frozen hash of `strategy.ts`).
- The F1 fix suite passed in the previous step: full suite 2,351 pass, 0 fail (the frozen-hash test passes against the unchanged `strategy.ts`).
- Read-only scan of the stored journal (26 records, from the provenance audit).

### Limitations
- No test was run as part of this review (read-only). Protection statements rely on the test results from the previous step and on static reading.
- The raw analysis output (3.4) and the dashboard were not rendered or executed. Their protection is inferred from `analyze()` logic.
- The live routes were not exercised with a STALE market; no live data exists in this environment.
- Backtest outputs (3.9) were not traced.

---

## 7. Conclusion

- **Confirmed bypasses: none.** No production path found in which a STALE market quote yields an executable TRADE.
- **Potential bypasses: none classified.** Each path has a control that holds; the one that does not depend on the enricher (3.4) depends on the engine's risk gate, which is recorded as dependency R1.
- **NOT VERIFIED: backtest outputs (3.9).**

**Live recommendation engine: NO-GO.** This review confirms that the F1 stale-market protection is reachable from every production route that can expose or act on a recommendation. It does not establish that the engine is ready: no validated strategy exists, no candidate is VERIFIED, and recent data does not prove profitability.
