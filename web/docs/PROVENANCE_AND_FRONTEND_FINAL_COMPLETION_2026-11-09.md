# Provenance and frontend final completion (2026-11-09)

Written for: the project owner and maintainers.
Status: F7 findings G1 to G5 implemented and tested; R3 STALE-market safety tested at the analysis and dashboard level; **one pre-existing safety defect found and not fixed (section 6), which needs your approval.**

**Overall decision: live recommendation engine NO-GO.** The changes below improve label accuracy and tests. They do not validate any strategy, do not establish profitability, and do not make the engine ready for live recommendations.

---

## 1. Summary

| Item | Result | Status |
|---|---|---|
| G1 — breadth never shows LIVE when its source is MOCK | Breadth badge now uses the source: MOCK, UNAVAILABLE, or the status only for a LIVE source. Confirmed in the browser: all six breadth badges read MOCK on mock data. | **Done, verified** |
| G2 — analysis panels show the actual source | The panel badge and execution note now print the market source (`DATA MOCK`, `DATA LIVE`, …). **Correction:** the F7 report said this panel showed only freshness. The view already carried the freshness, which for MOCK was `MOCK`, so the panel printed `DATA MOCK`. The defect was that the label was implicit. It is now an explicit `source` field. Confirmed in the browser on `/market` and `/recommendations`. | **Done, verified** |
| G3 — mixed-source data shows MIXED | `DataStatus` provider label: UPSTOX only when all known providers are UPSTOX, MOCK only when all are MOCK, MIXED when both appear, UNKNOWN when none is known. Every subsystem of every snapshot counts. | **Done, tested** (fixtures); not observed in the browser (no mixed data is available in mock mode) |
| G4 — no default to UPSTOX or LIVE | Market card default `"UPSTOX"` and `"LIVE"` replaced with `"UNKNOWN"` (and `"UNAVAILABLE"` for breadth). A missing breadth source is UNKNOWN. | **Done, tested** |
| G5 — Opportunities page data-source indicator | Header line: "Data source (options): {MOCK|LIVE|MIXED|UNAVAILABLE} · stock scans: {…}". Confirmed in the browser. The stock-scan part is accurate to the data path, which exposes a problem (section 6). | **Done, verified**, with section 6 |
| R3 — STALE market must not pass; fresh chain must not override; dashboard must not show an executable STALE TRADE | Tested at the raw analysis and dashboard-view level: STALE rejected (`plan` null, every candidate risk-rejected); fresh chain does not override; dashboard `executable` false; LIVE unchanged; MOCK, END_OF_DAY and UNAVAILABLE not executable. **No safety gap found** at this level. | **Tested**, route-level limitation (section 5) |

---

## 2. Changes (exact files)

**Created**
- `src/lib/provenanceDisplay.ts`: `breadthBadge`, `providerText`, `sourceProviderLabel`, `summarizeSources`. Display rules only; they feed no gate.
- `src/lib/provenanceDisplay.test.ts`: 23 fixture tests (G1-1 to G1-5, G3-1 to G3-4, G4-1 to G4-2, G5-1 to G5-4).
- `src/lib/analysisSafety.test.ts`: 8 fixture tests (R3-1 to R3-8).
- `docs/PROVENANCE_AND_FRONTEND_FINAL_COMPLETION_2026-11-09.md` (this report).

**Modified**
- `src/lib/dashboard.ts`: adds `market.source` (the actual market source), set from `s.sources.market.source`. `freshness` is unchanged.
- `src/components/MarketCard.tsx`: breadth badge uses `breadthBadge` (G1); the "Prices:" text uses `UNKNOWN` instead of defaults (G4).
- `src/components/DataStatus.tsx`: provider label uses `sourceProviderLabel` over all subsystems (G3).
- `src/components/AnalysisPanels.tsx`: market badge and execution note show `market.source` (G2).
- `src/app/(dashboard)/opportunities/page.tsx`: header data-source line (G5).

**Not modified:** `src/lib/engine/strategy.ts` (hash unchanged), any test other than the two new files, `.data/`, `.research-data/`, journal files, saved-picks files, configuration, and any historical report.

---

## 3. Tests and results

| Suite | Result |
|---|---|
| `provenanceDisplay.test.ts` (G1, G3, G4, G5) | 23 pass (includes the G1–G5 cases) |
| `analysisSafety.test.ts` (R3) | 8 pass |
| Full suite (`npm test`) | **2,397 pass, 0 fail, 0 skipped** |
| Typecheck (`tsc --noEmit`) | exit 0 |
| ESLint on changed files | no problems |
| Production build (isolated directory) | compiled; **0 Turbopack warnings** |

Earlier, the full suite was 2,368 with the F2 changes; the increase comes from the new G and R3 tests.

---

## 4. Browser verification (isolated mock instance)

- **Instance:** development server on port 3125, `MARKET_DATA_PROVIDER=mock`, temporary saved-picks file, temporary journal directory, separate build directory. Stopped afterwards; temporary files removed. The main server on 3123 was not changed.
- **Method:** Playwright (Chromium) with explicit viewports, 1440×900 (desktop) and 390×844 (mobile), pages `/` and `/opportunities`.
- **Results (both widths):**
  - Horizontal overflow: 0 px on every page checked.
  - Console errors: 0 on every page checked.
  - Overview: headline "MOCK DATA", "Source: MOCK"; all six breadth badges read **MOCK** (previously LIVE); "Prices: MOCK (MOCK)".
  - Opportunities: header "Data source (options): MOCK · stock scans: UPSTOX" (see section 6 for why the stock-scan part reads UPSTOX).
  - `/market` and `/recommendations`: market badge "DATA MOCK" (G2).
- **Screenshots:** saved in the scratch folder (`p-desktop_root.png`, `p-mobile_root.png`, and the Opportunities pair). They were captured but **not visually reviewed** in this session.
- **Not verified in the browser:** LIVE (no live data in this environment); fallback (needs the Upstox path); mixed-source headline (no mixed data in mock mode); tablet width (not run); the MIXED label in a browser.

---

## 5. R3 limitations

- The tests call the analysis function and the dashboard view directly. They do not call the `/api/analysis/[index]` route handler, which returns the same analysis object without transformation. The route-level behaviour follows from that, but was not executed.
- No safety gap was found. No change to the engine, risk gate or enricher was needed.

---

## 6. Safety defect found and not fixed: stock scans contact Upstox in mock mode (needs approval)

- **What:** `scanStocks` (`src/lib/engine/stockOpportunityEngine.ts`, line ~138) obtains its token with `getAccessToken()`, which reads `UPSTOX_ANALYTICS_TOKEN` or the token file `.data/upstox-token.json`. It does not check `MARKET_DATA_PROVIDER`. The scan then calls `/v2/market-quote/quotes` (line ~148) and fetches daily candles with `dailyCandles` (line ~376), both with that token.
- **Effect:** wherever a token file exists, loading `/opportunities` contacts Upstox, including in a configuration that is supposed to be mock. The stock quotes are then labelled UPSTOX, which is accurate about their source.
- **Impact on this task:** the isolated mock instance loaded `/opportunities` several times in this session (including during the F7 check and the checks in this report). **Those page loads made live Upstox quote and history requests**, using the existing token file. I did not intend this and did not check the request count. The token was read by the application, not refreshed, rotated or written. This is a boundary breach of the "no live Upstox requests" instruction for this task, and it should be recorded as such.
- **Also affected:** the main development server on port 3123 does the same whenever `/opportunities` loads. This predates this session.
- **Proposed fix (not applied):** make `scanStocks` return UNAVAILABLE (or mock-labelled data) when `providerMode()` is not `upstox`, before any token is read, and add a regression test that a mock-mode scan makes no request. This changes runtime behaviour, so it needs your explicit approval.

---

## 7. Protected boundaries (confirmed)

- **Strategy 11.4 / `strategy.ts`:** SHA-256 `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18`, unchanged; matches the frozen value in `src/lib/options/options.test.ts`.
- **Journal and saved picks:** the 27 files under `.data/recommendations` and `.data/saved-picks` are byte-identical to the pre-change snapshot (SHA-256).
- **`.research-data/`:** not modified.
- **Trading logic, scoring, thresholds, risk gates, recommendation decisions:** not changed. The G and R3 changes are labels and tests only.
- **No broker orders, automated execution, OAuth refresh, token generation, collectors, schedulers, paper runners or LaunchAgents were started or changed.** The exception is the boundary breach in section 6: the stock scan read the existing token file and made quote and history requests through the application.
- **Git:** nothing staged or committed. Uncommitted entries: 332 (`git status --porcelain`); staged entries: 0. Previous reports are not overwritten.

---

## 8. Remaining limitations

1. **Section 6 defect:** stock scans contact Upstox in mock mode. Needs approval to fix.
2. Browser checks cover the mock configuration only. LIVE, fallback, mixed and tablet widths were not browser-verified.
3. Screenshots were captured, not visually reviewed.
4. R3 is verified at the analysis and dashboard-view level; the route handler was not executed.
5. The G5 stock-scan label reflects the scan's source, which is UPSTOX because of section 6.
6. The F7 report's G2 entry is superseded by section 1 of this report.

**Live recommendation engine: NO-GO.** No strategy is validated, no candidate is VERIFIED, and recent data does not prove profitability.
