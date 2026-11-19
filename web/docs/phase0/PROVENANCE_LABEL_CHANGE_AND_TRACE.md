# Provenance: label change (Option A) and full-route trace

Date: 2026-11-13. Scope: display labels only. No engine status, evidence eligibility, calculation or strategy input changed.

## 1. Change made (Option A)

| File | Change |
|---|---|
| `src/lib/provenance/displayProvenance.ts` (new) | Pure label functions: `breadthDisplayLabel`, `dataQualityDisplayLabel`, `backtestDisplayProvenance`. Never imported by the engine. |
| `src/lib/provenance/displayProvenance.test.ts` (new) | 7 tests. Includes a check that the engine breadth status stays `LIVE` and its source stays `MOCK` with the label layer present. |
| `src/app/api/backtest/run/route.ts` | Adds one sibling field `displayProvenance` to the response. `data` (the engine result) is unchanged. |

Verified: the new tests pass (7 of 7). Type check on the changed files reports no errors. ESLint is clean on the changed files.

Not changed in this step: the dashboard components that display backtest breadth. The label is available in the API response, but wiring it into the UI is not done.

## 2. Provenance trace (read-only)

Where a status can be wrong, and what it currently says:

| Location | Behaviour | Risk | Status |
|---|---|---|---|
| `src/lib/backtestSnapshot.ts` lines ~122–131 | All backtest inputs use source `MOCK` (historical candles included) | Historical replay looks like mock data in raw results | Label added in the API response. Raw result unchanged, by design. |
| `src/lib/services/breadthService.ts` lines ~130–132 | Under a `MOCK` source with full coverage, the engine status is `LIVE` | Engine-internal. Its public `source` is `MOCK`. | Engine unchanged (owner decision). Display maps to MOCK. |
| `src/lib/services/market.ts` line ~118 | Technicals from a MOCK source are dropped from the snapshot (`null`) | Protective | Verified. |
| `src/lib/services/liveOpportunityCollector.ts` ~lines 132–137 | Records are hard-coded `source: "LIVE"` | Could be read as live | Gated: writes only when all data quality is `LIVE` (`isAllLive`, line 97) and not mock (line 379). Verified by reading. |
| `src/lib/services/candleFreshness.ts` line ~127 | Returns `LIVE` when candles are fresh | Mock candles could pass if fed in | Not verified: depends on the candle source reaching this function. |
| `src/lib/services/news.ts` line ~240 | News source `MOCK` when mock | Protective | Verified by grep. |

## 3. Paper trading never opens a trade on mock data

Verified: the production engine is constructed once, in `src/lib/services/paperStore.ts`, with `allowMock: false`. The engine's constructor default is `true`, but there is no other construction outside tests. The engine refuses any source that is not `LIVE` (`paperEngine.ts` line 220 and freshness gate lines 268–275).

## 4. Remaining provenance gaps

1. Dashboard components do not yet read `displayProvenance`. Backtest breadth may still appear as LIVE in any UI that reads `breadth.status` directly.
2. `candleFreshness` returns LIVE for any fresh candles. Whether mock candles can reach it is not confirmed.
3. The six dashboard and analysis pages have not been traced line by line.

## 5. Follow-up (2026-11-13, read-only)

- **candleFreshness (verified):** its only production importer is `src/lib/services/upstoxMarket.ts`, the live provider. Mock candles never pass through it. Result: mock candles cannot reach `candleFreshness`, so this path cannot produce a LIVE status from mock data.
- **paper-opportunities POST (finding, open):** trusts client-supplied `dataQuality` labels (see PAPER_ROUTE_RISK_TRACE.md, Finding B). This is the one place a mock-derived record could be labelled LIVE, through the client.
- **Dashboard (done):** the performance page's Breadth row now shows the data-quality label with its display label, for example `SYNTHETIC (MOCK)`.
