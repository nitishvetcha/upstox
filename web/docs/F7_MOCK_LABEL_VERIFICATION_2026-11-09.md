# F7 verification: MOCK and fallback labels in the frontend (2026-11-09)

Written for: the project owner and maintainers.
Status: **read-only verification.** No application source, test, configuration, strategy, data, journal or saved-pick file was modified. `strategy.ts` (frozen Strategy 11.4) was not modified and its hash was unchanged. No live Upstox request was made, no OAuth or analytics token was read or refreshed, and no collector, scheduler or paper runner was started.

**Overall decision: live recommendation engine NO-GO.** This verification checks labelling only. It does not establish strategy validity, profitability or live readiness.

---

## 1. Summary

| Question | Result |
|---|---|
| Can explicit MOCK data appear as LIVE? | **No.** Every fixture and browser case labelled it MOCK, and the headline and per-subsystem labels agreed. |
| Can fallback data (after a provider failure) appear as LIVE? | **No.** Fallback sets `fallbackReason`; the headline becomes "MOCK FALLBACK" and `hasMockInput` is true. |
| Does a genuine LIVE fixture keep its LIVE label? | **Yes.** The headline is "LIVE DATA" and freshness is LIVE. |
| Are MOCK and fallback blocked from the recommendation and journal? | **Yes.** MOCK input produces NO_TRADE with a `MOCK_DATA` blocker. The generate route does not journal it (verified earlier by a real route call). |
| Are there inconsistent or missing labels? | **Yes, three.** See section 4: (1) the breadth badge shows LIVE on MOCK breadth; (2) the analysis-panel "DATA" badge shows a freshness word, so MOCK market data reads "DATA STALE" with no MOCK text; (3) the data-status header reports "Source: UPSTOX" when the snapshots are mixed. Two latent defaults are also recorded. |

---

## 2. Trace: source metadata to the frontend

| Step | Location | What it carries |
|---|---|---|
| Provider | `src/lib/services/mock.ts:130` (mock source); `upstoxMarket.ts` (Upstox source) | `source` (MOCK, LIVE, END_OF_DAY, STALE, UNAVAILABLE) and `provider` |
| Fallback | `src/lib/services/market.ts` `withFallback` | `fallbackReason` (non-null after a provider failure) |
| Snapshot | `src/lib/types.ts` `Snapshot.sources`, `Snapshot.fallbackReason` | Per-subsystem `SourceInfo` |
| Headline label | `src/lib/dataStatus.ts` `dataLabel` | "MOCK FALLBACK" if any `fallbackReason`; "MOCK DATA" if all sources MOCK; "LIVE DATA" only if all sources LIVE, news current and breadth LIVE; otherwise "PARTIAL LIVE DATA" |
| Metadata for UI | `src/lib/services/market.ts` `sourceMeta` / `technicalMeta` | `source`, `provider`, `fetchedAt`, `lastTradeTime`, `freshness` |
| API routes | `/api/market/*`, `/api/option-chain/*`, `/api/technical/*`, `/api/breadth/*`, `/api/auth/status` (`marketDataProvider`) | JSON carrying the metadata above |
| Components and pages | See section 3 | Rendered labels |

---

## 3. Pages and components checked

| File | Component or section | Labels shown | Assessment |
|---|---|---|---|
| `src/components/DataStatus.tsx` | Top-of-page status bar | Headline (`dataLabel`), reason (`FALLBACK_LABELS`), note, "Source: {provider}" | Headline correct. **Gap (G3):** `provider` is `UPSTOX` if *any* snapshot's market provider is UPSTOX, so mixed data shows "Source: UPSTOX" beside "PARTIAL LIVE DATA". |
| `src/components/RecommendationCard.tsx` (line ~82) | "Recommendation of the day" | `dataLabel([s])` as a badge | Correct: MOCK shows "MOCK DATA" (warn tone). |
| `src/components/MarketCard.tsx` | Market card, source line | Per-subsystem freshness and "Sentiment (mock)" when news is MOCK | Mostly correct (see G1, G4). |
| `src/components/MarketCard.tsx` (lines ~75–83) | "Market Breadth" badge | `s.breadth?.status` | **Gap (G1), confirmed in browser:** the badge reads LIVE while the breadth source is MOCK. |
| `src/components/AnalysisPanels.tsx` (line ~41) | Market panel badge | `DATA ${freshnessDisplayLabel(m.freshness)}` | **Gap (G2):** freshness only. MOCK market data reads "DATA STALE" with no MOCK text. |
| `src/components/AnalysisPanels.tsx` (line ~156) | Static note | "values as delivered by Upstox (or labeled MOCK fallback)" | Static text; not a per-value label. |
| `src/components/DataTimestamps.tsx` | Per-subsystem badges | Raw source (`freshnessDisplayLabel`), last trade, fetched time | Correct: MOCK shows "MOCK". |
| `src/components/OpsPanel.tsx` | System health source list | `{k}: {freshnessDisplayLabel(x.source)}` | Correct: "market: MOCK" in browser. |
| `src/components/NewsPanel.tsx` (line ~106) | News block | "News: MOCK (shown only with mock market data; never scored with live prices)" | Correct. |
| `src/components/ui.tsx` (line ~15) | Tone helper | MOCK maps to warn tone | Correct. |
| `src/components/RecommendationDiagnosticPanel.tsx` (line ~31) | Diagnostic panel | "Data source: MOCK" | Correct. |
| `src/components/SectionViews.tsx` (line ~210) | Strategy table | "SYNTHETIC / …" | Correct for synthetic data. |
| `src/app/saved-picks/page.tsx` (line ~43) | Source selector | RESEARCH, LIVE, MOCK options | Labels preserved by the saved-picks status rule (verified earlier, 15/15). |
| `src/app/(dashboard)/opportunities/page.tsx` | Contract cards | Contract id `MOCK_FO|…`; IV and Greeks provenance "UNAVAILABLE" | Correct as far as shown. **Gap (G5):** the page header carries no data-source label. |

---

## 4. Findings

### G1 — MOCK breadth displayed as LIVE (inconsistent label, confirmed)
- **Where:** `src/components/MarketCard.tsx` lines ~75–83.
- **Evidence:** browser, mock mode, Overview and Opportunities pages: "MARKET BREADTH LIVE" next to "Prices: MOCK (MOCK)". The badge uses `s.breadth.status` (LIVE on the mock generator); the source is `s.sources.breadth.source` (MOCK).
- **Risk:** a reader sees LIVE beside MOCK. The engine's gates are not affected, because they use source labels; this is presentation only.
- **Severity:** medium (labelling accuracy).

### G2 — Analysis panel shows freshness, not source (missing MOCK label)
- **Where:** `src/components/AnalysisPanels.tsx` line ~41.
- **Evidence:** the badge is `DATA ${freshness}`. For MOCK market data `sourceMeta` gives freshness STALE (`sourceMeta` maps any non-LIVE source to STALE), so the badge reads "DATA STALE" and never says MOCK.
- **Risk:** MOCK data is not shown as MOCK in this panel. It is not shown as LIVE either.
- **Severity:** medium (missing MOCK text).

### G3 — Data-status header provider can disagree with the headline (mixed data)
- **Where:** `src/components/DataStatus.tsx` line ~20: `provider = snaps.some(s => s.sources.market.provider === "UPSTOX") ? "UPSTOX" : "MOCK"`.
- **Evidence (fixture scenario D, chain MOCK and the rest LIVE):** headline "PARTIAL LIVE DATA", header "Source: UPSTOX". The header shows the source of only one part of mixed data.
- **Severity:** low to medium. The headline itself is correct and "PARTIAL" is shown.

### G4 — Latent default labels in the market card
- **Where:** `src/components/MarketCard.tsx` line ~83: `breadth?.provider ?? market.provider ?? "UPSTOX"` and `breadth?.source ?? "LIVE"`.
- **Evidence:** fixture scenario F (breadth source UNAVAILABLE) shows "UPSTOX (UNAVAILABLE)", which is correct. The default `"LIVE"` is reached only if the breadth source object is missing, which the `Snapshot` type does not allow and no production path produces.
- **Risk:** latent. A future path that omitted the breadth source would show "UPSTOX (LIVE)" by default.
- **Severity:** low (latent; should be removed when G1 is fixed).

### G5 — Opportunities page has no data-source header
- **Where:** `src/app/(dashboard)/opportunities/page.tsx` header.
- **Evidence:** the browser text shows the title and "scanned … IST", with no MOCK or LIVE source label. The contract line `MOCK_FO|MOCK25200CE` identifies the mock contract only by its key.
- **Severity:** low to medium. Recommendation cards there show their own grade and provenance fields, but there is no page-level source label.

---

## 5. Fixture scenarios (read-only, run from the scratch folder)

The script imported the real functions (`mockSnapshot`, `dataLabel`, `sourceMeta`, `hasMockInput`, `buildRecommendationResponse`, `analyze`) and was not kept in the project.

| Scenario | Headline (`dataLabel`) | Market freshness (`sourceMeta`) | `hasMockInput` | Recommendation decision | MOCK blocker present |
|---|---|---|---|---|---|
| A. Explicit MOCK provider | MOCK DATA | STALE (not LIVE) | true | NO_TRADE | yes |
| B. Fallback after provider failure (`fallbackReason: UPSTOX_TIMEOUT`) | MOCK FALLBACK | STALE (not LIVE) | true | NO_TRADE | yes |
| C. Genuine LIVE fixture | LIVE DATA | LIVE | false | TRADE (engine output on fixture) | no |
| D. Mixed (chain MOCK, rest LIVE) | PARTIAL LIVE DATA | (not run) | true | NO_TRADE | yes |
| E. END_OF_DAY price sources | END OF DAY | END_OF_DAY | (not run) | NO_TRADE | no (market-closed blocker) |
| F. Breadth UNAVAILABLE | PARTIAL LIVE DATA | (not run) | (not run) | (not run) | (not run); market card shows "UPSTOX (UNAVAILABLE)" |

Scenario C's TRADE is the engine's raw output on a fixture; it is not a live recommendation and does not establish readiness.

---

## 6. Browser verification (isolated mock instance)

- **Instance:** a development server on port 3125 with `MARKET_DATA_PROVIDER=mock`, a temporary `SAVED_PICKS_FILE`, a temporary `RECOMMENDATION_STORE_DIR` and a separate build directory. The main development server on 3123 was not used for this check. No Upstox or broker request was possible in this mode.
- **Overview (`/`):** headline "MOCK DATA" with "Source: MOCK"; "System status: market OPEN"; per-index subsystems all "MOCK"; the recommendation card "MOCK DATA", decision NO TRADE; the data-quality box lists every subsystem as MOCK; "News: MOCK" text present. Console: no errors.
- **Opportunities (`/opportunities`):** contract `MOCK_FO|MOCK25200CE`; "IV provenance UNAVAILABLE"; grade REJECT. The page has no source header (G5). Console: no errors.
- **Market card, per index:** "Prices: MOCK (MOCK)" and "MARKET BREADTH LIVE" (G1 confirmed); "TECHNICALS MOCK"; "SENTIMENT (MOCK)".
- **Not run in the browser:** a LIVE snapshot (no live data is available here, and the LIVE case is covered by fixture scenario C); a fallback in the browser (a fallback needs the Upstox path, which the isolation rule excludes; scenario B covers it at fixture level).
- **Limitation:** the browser check used mock mode. It shows the MOCK labels as rendered, but it does not show a fallback or a LIVE label in the browser.

---

## 7. Recommendation and journal safeguards

- MOCK and fallback snapshots are NO_TRADE with a `MOCK_DATA` blocker (scenarios A, B, D; and the earlier real route call on the isolated MOCK server).
- The generate route journals only when `hasMockInput` is false (earlier real route call: `journaled: false`).
- The journal refresh route refuses MOCK (409) and non-LIVE chains (422) (earlier fixture tests and one real route call).
- The paper-trading engine rejects non-LIVE market data (`FRESHNESS_BLOCKED`) in production, where `allowMock` is false.
- These safeguards were not changed by this verification.

---

## 8. Remaining gaps

| Ref | Gap | Severity | Status |
|---|---|---|---|
| G1 | MOCK breadth displayed as LIVE (`MarketCard.tsx` ~75–83) | Medium | Confirmed in browser; not fixed (verification only) |
| G2 | Analysis panel "DATA …" shows freshness, not MOCK (`AnalysisPanels.tsx` ~41) | Medium | Confirmed by code; not fixed |
| G3 | Header "Source:" follows any UPSTOX snapshot in mixed data (`DataStatus.tsx` ~20) | Low–medium | Confirmed by fixture; not fixed |
| G4 | Latent `"UPSTOX"` / `"LIVE"` defaults in the market card (`MarketCard.tsx` ~83) | Low (latent) | Confirmed by reading; not reachable by a production path found |
| G5 | Opportunities page has no page-level source label | Low–medium | Confirmed in browser |
| — | Fallback is not checked in the browser (needs the Upstox path) | — | Not performed; fixture only |
| — | LIVE is not checked in the browser (no live data) | — | Not performed; fixture only |

Fixing G1–G5 changes presentation and needs a separate, explicitly approved step. This verification does not implement them.

---

## 9. Files inspected (read only)

- `src/lib/dataStatus.ts`
- `src/lib/services/market.ts` (`withFallback`, `sourceMeta`, `technicalMeta`)
- `src/lib/services/mock.ts`
- `src/lib/services/mockInputs.ts`
- `src/lib/fallback.ts`
- `src/lib/freshnessLabel.ts`
- `src/lib/recommendationEnricher.ts`
- `src/lib/types.ts`
- `src/components/DataStatus.tsx`
- `src/components/RecommendationCard.tsx`
- `src/components/MarketCard.tsx`
- `src/components/AnalysisPanels.tsx`
- `src/components/DataTimestamps.tsx`
- `src/components/OpsPanel.tsx`
- `src/components/NewsPanel.tsx`
- `src/components/ui.tsx`
- `src/components/RecommendationDiagnosticPanel.tsx`
- `src/components/SectionViews.tsx`
- `src/app/(dashboard)/opportunities/page.tsx`
- `src/app/saved-picks/page.tsx`
- `src/app/api/auth/status/route.ts`
- `src/app/api/market/[index]/route.ts`, `src/app/api/option-chain/[index]/route.ts`, `src/app/api/technical/[index]/route.ts`, `src/app/api/breadth/[index]/route.ts`, `src/app/api/recommendations/daily-summary/route.ts`, `src/app/api/paper-opportunities/route.ts`

Scratch script (outside the project, not kept): `scratchpad/f7_fixtures.mts`; results: `scratchpad/f7_results.json`.

---

## 10. Confirmation

- No application source, test, configuration, data, journal or saved-pick file was modified.
- The existing journal and saved-picks files were checked by SHA-256 against the pre-verification snapshot: **byte-identical (27 files).**
- `src/lib/engine/strategy.ts` SHA-256: unchanged (`d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18`), matching the frozen value in `src/lib/options/options.test.ts`.
- The isolated browser instance was stopped and its temporary directories were removed. The main development server on 3123 was not changed.
- `git status` now lists 327 entries. The increase since the last count comes from the new files created during the F1–F5 and closure work, not from this verification.

**Live recommendation engine: NO-GO.** No strategy is validated, no candidate is VERIFIED, and recent data does not prove profitability.
