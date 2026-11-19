# End-to-end provenance audit (2026-11-09)

Written for: the project owner and the maintainers of the market-data and recommendation code.
Scope: read-only static inspection plus the existing stored journal (read only). No code, test, data, journal or saved-pick changes were made. No live Upstox or broker request was made, and no token was used.

Finding status: **Confirmed** = traced in code and, where stated, observed. **Suspected** = traced in code, runtime effect not demonstrated. **Unverified** = not checked in this audit.

---

## 1. Executive summary

- The core safeguards hold. MOCK input cannot be journaled by the generate route. Stored journal records contain no MOCK or fallback sources. The top-level source is the worst label across subsystems, so a mixed snapshot cannot be labelled LIVE. The option chain is labelled LIVE only after each contract's exchange last-trade time is verified. The journal refresh route refuses MOCK, STALE, END_OF_DAY and UNAVAILABLE chains.
- **One high-severity gap (confirmed in code):** neither the strategy engine's staleness check nor the risk service checks whether the **market quote's** label is STALE. A quote whose last trade is old is labelled STALE, but its `fetchedAt` is the current time, so the freshness test on `fetchedAt` passes. The engine can therefore reach TRADE with a STALE market quote. The runtime effect has not been demonstrated.
- **Medium:** outside market hours, END_OF_DAY is displayed as "STALE" (observed on the Overview at 18:35 IST, with the market closed and the last trade at 16:00). The journal records fetch times, not exchange last-trade times, so the age of the prices is lost once a recommendation is saved.
- **Medium:** the Options Engine shows stored research rows with a "RECOMMENDATION" badge, next to a "STORED RESEARCH · NOT LIVE" heading.
- The engine is **not ready for live recommendations**. This audit establishes provenance labelling, not trading validity. NO-GO stands.

---

## 2. Provenance architecture and canonical types

### 2.1 Canonical labels
| Type | Defined in | Permitted values |
|---|---|---|
| `DataSource` | `src/lib/types.ts:4` | `LIVE`, `MOCK`, `END_OF_DAY`, `STALE`, `UNAVAILABLE` |
| `Freshness` | `src/lib/types.ts:5` | `LIVE`, `AGING`, `END_OF_DAY`, `STALE` |
| Worst-of rank (snapshot) | `src/lib/dataQuality.ts:3-9` | LIVE 0 < END_OF_DAY 1 < STALE 2 < MOCK 3 < UNAVAILABLE 4 |
| Worst-of rank (metadata) | `src/lib/services/market.ts:168` | LIVE 0 < END_OF_DAY 1 < STALE 2 < MOCK 3 < UNAVAILABLE 4 (same order) |
| Research data class | `src/lib/research/optionsInventory.ts` | `MODEL_DERIVED_SYNTHETIC`, `LIVE_SNAPSHOT`, `GENUINE_HISTORICAL` (used on the Options Research Lab) |
| Fallback reason | `src/lib/types.ts` (`FallbackReason`) | `UPSTOX_AUTH_EXPIRED`, `UPSTOX_NOT_CONNECTED`, timeouts, API errors, and so on |
| Journal guard | `src/lib/services/mockInputs.ts` | `hasMockInput(s)` = any subsystem MOCK **or** `fallbackReason !== null` |

### 2.2 Where labels are assigned
- **Quotes:** `upstoxMarket.ts` `liveQuoteSource` (line ~243) classifies by the exchange last-trade time (`tradeFreshnessOf`). With no last-trade time, it returns END_OF_DAY when the market is closed and STALE when open.
- **Option chain:** `upstoxMarket.ts` (line ~505) labels LIVE only when `verifyEvaluationOptionPrices` returns `CONTRACT_PRICE_LIVE` and `CHAIN_ANALYTICS_VERIFIED_BOUNDED`. Otherwise the chain falls back to `liveQuoteSource`.
- **News:** `market.ts` `newsFeed` (line ~74): mock provider → MOCK; otherwise LIVE or UNAVAILABLE.
- **Breadth:** `market.ts` (line ~102): taken from the breadth source, then the quote source, else UNAVAILABLE.
- **Snapshot fallback:** `market.ts` `withFallback` (lines ~50-68): in mock mode returns mock data with `fallbackReason: null`. On an Upstox failure it returns mock data with a non-null `fallbackReason`.
- **Mock provider:** `services/mock.ts:130` sets `source: "MOCK"`.

### 2.3 Where labels are read
- Strategy engine: `src/lib/engine/strategy.ts` (`staleness`, lines ~165-186; decision gate, lines ~278-290).
- Risk service: `src/lib/services/risk/riskService.ts` (lines ~214-225).
- Recommendation enricher: `src/lib/recommendationEnricher.ts` (lines ~239, 334-343).
- Journal guard: `src/app/api/recommendations/generate/route.ts` (line ~40).
- Refresh: `src/lib/services/journalRefreshService.ts`.
- Frontend metadata: `src/lib/services/market.ts` `sourceMeta` / `technicalMeta` (lines ~146-164, 175-205).

---

## 3. Flow diagrams

Each arrow shows the label after the transformation. "fetchedAt" is the time the payload was fetched.

### 3.1 LIVE
```
Upstox quote (last_trade_time) ──tradeFreshnessOf──> source LIVE (fresh LTT)      fetchedAt = now
Upstox option chain + per-contract LTT verified ──> chain source LIVE (CONTRACT_PRICE_LIVE)
  ──> snapshot.sources (per subsystem) ──> engine staleness (fetchedAt-based) ──> analysis
  ──> enricher dataQuality (per subsystem) + top source (worst-of) ──> journal (fetchedAt timestamps)
  ──> frontend badge from sourceMeta
```
Loss: the journal keeps `fetchedAt`, not the exchange last-trade time (see F3).

### 3.2 END_OF_DAY
```
Upstox quote, market CLOSED, last trade present ──> tradeFreshnessOf -> END_OF_DAY
  ──> snapshot.sources.market = END_OF_DAY
  ──> engine: "Market closed" blocker (stale list non-empty) => NO TRADE; isEod => WAIT
  ──> frontend sourceMeta: END_OF_DAY shown as STALE (see F2)
  ──> journal dataQuality.market = END_OF_DAY (label kept)
```

### 3.3 MOCK
```
mock provider ─> sources MOCK ─> hasMockInput true
  ──> engine MOCK_DATA blocker; recommendation NOT executable
  ──> generate route: journaled = false (verified on a real route call)
  ──> refresh route: 409 MOCK_INPUT, no write (fixture-verified)
```
Fallback path: Upstox failure → `withFallback` returns mock data with `fallbackReason` set → `hasMockInput` true (covers the case where the sources would otherwise look LIVE).

### 3.4 RESEARCH
```
stored research round (options audit / stored snapshot) ──> Options Engine page only
  ──> badge "RECOMMENDATION" (see F7), heading "STORED RESEARCH · NOT LIVE"
generate route ──> getSnapshot (live provider), never reads stored research
```

### 3.5 STALE
```
quote LTT older than threshold ──> source STALE (label)
  ──> engine staleness: NOT detected for market (see F1); detected for chain via source label in risk service
  ──> refresh route: chain STALE refused 422 CHAIN_NOT_LIVE
```

### 3.6 UNAVAILABLE
```
news/breadth/quote with no data ──> source UNAVAILABLE
  ──> engine: stale() skips UNAVAILABLE; `missing` list adds "unavailable" => NO TRADE
  ──> refresh route: chain UNAVAILABLE refused 422
```

---

## 4. Route-by-route findings

| Route | Provenance handling | Finding |
|---|---|---|
| `POST /api/recommendations/generate` | `getSnapshot` → `analyze` → enriched → journaled unless `hasMockInput` | Guard correct (verified by real call). See F1, F3. |
| `POST /api/recommendations/[id]/refresh` | Refuses MOCK (409), non-LIVE chain (422), missing contract/price (422); writes only status and outcome | Correct per service tests. Market quote label not checked (not needed for the option price). See F4. |
| `POST /api/recommendations/[id]/paper-trade` | Links an existing entry to a paper trade | Does not write outcomes. No provenance change. |
| `POST /api/paper-trading/enter` | Updates `paperTradeId` on an entry | No provenance change. |
| `GET /api/recommendations*`, `/export`, `/analytics`, `/evaluation` | Reads journal | Read-only. Entries retain labels. |
| `GET /api/strategy/evidence*` | Reads journal | Read-only. |
| `POST /api/risk/assess` | `riskService` | Same market-quote gap as F1. |
| Options Engine page (`/options-engine`) | Stored research rounds | See F7. |

---

## 5. Frontend display findings

| Finding | Evidence | Status |
|---|---|---|
| END_OF_DAY displayed as "STALE" outside market hours | Overview at 18:35 IST, market closed, showed `market: STALE` with last trade 16:00:00 (browser text, earlier session). Code: `sourceMeta` lines ~161-163. | **Confirmed (observed).** See F2. |
| LIVE / STALE / UNAVAILABLE labels on Overview | Observed in the browser text (market open at 10:01 IST: `market LIVE`, `optionChain STALE`, `breadth LIVE`) | **Confirmed (observed).** |
| Stored research labelled "RECOMMENDATION" | Options Engine page line ~100 badge text, next to the "STORED RESEARCH · NOT LIVE" heading | **Confirmed in code.** See F7. |
| MOCK label on frontend | Not observed in live mode. In the isolated MOCK server the labels were not checked. | **Unverified.** |
| Chart source label | Chart shows "Source UPSTOX (LIVE)" with 120 candles (observed, earlier session) | Confirmed (observed). |
| Saved picks labels | "NOT VALIDATED", "MOCK DATA: NOT VALIDATED" (Playwright, 15/15, earlier session) | Confirmed (test run). |

---

## 6. Journal safety findings

| Check | Result | Evidence |
|---|---|---|
| MOCK cannot enter the journal via generate | Correct | Real route call: `journaled: false`, scratch journal 0 files |
| Other journal writers | None found. `saveJournalEntry` is called only in the generate route (grep of `src/`). | **Confirmed by search** |
| Stored records contain MOCK or fallback provenance | None. 26 records scanned (read only): `dataQuality` labels LIVE/END_OF_DAY only; 2 END_OF_DAY/NO_TRADE, 24 LIVE/WAIT | **Confirmed (read-only scan)** |
| Journal keeps per-subsystem labels | Yes: `snapshot.dataQuality` per subsystem; `source` = worst-of | **Confirmed** |
| Journal keeps the exchange last-trade time | **No.** `marketSnapshotTimestamp` and `optionChainTimestamp` are `fetchedAt` (enricher lines ~342-343). | **Confirmed in code.** See F3. |
| Journal refresh rejects MOCK, STALE, END_OF_DAY, UNAVAILABLE chains | Yes (422/409). Verified by 15 service tests (fixtures) and one real route call for MOCK. | Confirmed. The 422 paths are not exercised on a live route (no non-MOCK data). |
| Generate journals NO TRADE and WAIT entries | Yes, by design ("journal every generated recommendation"). Status is preserved. | Confirmed. Not a defect; noted so the journal is not read as a list of trades. |

---

## 7. Confirmed defects and unresolved risks

### F1 — Engine and risk service do not gate on a STALE market quote (HIGH)
- **Files:** `src/lib/engine/strategy.ts` `staleness` (lines ~169-171); `src/lib/services/risk/riskService.ts` (line ~216).
- **Source provenance:** quote last trade is old → `tradeFreshnessOf` → source `STALE`; `fetchedAt` = now.
- **Transformation:** `staleness` tests `freshnessOf(fetchedAt)`, which is LIVE because `fetchedAt` is current. The `source` label is never checked for the market subsystem. `riskService` checks `source === UNAVAILABLE || END_OF_DAY` and `freshnessOf(fetchedAt)` for the market, and `source === STALE` only for the chain.
- **Expected:** a market quote labelled STALE produces a "stale" blocker and NO TRADE, as the chain does in `riskService`.
- **Actual (static):** no blocker is added for a market source of STALE. The engine's TRADE branch (`status = best ? ... TRADE`) does not depend on the market label.
- **Relevant test:** none found that covers a STALE market label (search of `*.test.ts` for market STALE).
- **Status:** **Confirmed in code. Runtime effect suspected, not demonstrated.** Whether a TRADE can actually be produced depends on the rest of the pipeline, which was not executed here.

### F2 — END_OF_DAY is displayed as STALE outside market hours (MEDIUM)
- **Files:** `src/lib/services/market.ts` `sourceMeta` (line ~161: END_OF_DAY → STALE) and line ~163 (non-LIVE → STALE).
- **Observed:** Overview at 18:35 IST, market closed, `market: STALE`, last trade 16:00:00.
- **Expected:** a label distinguishing "closed, end-of-day" from "stale during market hours".
- **Actual:** both are displayed as STALE. The engine text still says "Market closed", but the badge does not.
- **Status:** **Confirmed (code and observation).** Labelling only; the engine's decision is correct (NO TRADE / WAIT).

### F3 — Journal keeps fetch time, not exchange last-trade time (MEDIUM)
- **File:** `src/lib/recommendationEnricher.ts` lines ~342-343 (`marketSnapshotTimestamp: s.sources.market.fetchedAt`, `optionChainTimestamp: s.sources.optionChain.fetchedAt`).
- **Expected:** the journal records how old the prices were, not only when the request was made.
- **Actual:** the journal records `fetchedAt`, so a saved recommendation looks current even when the prices behind it were old.
- **Status:** **Confirmed in code.**

### F4 — Refresh does not check the market quote label (LOW)
- **File:** `src/lib/services/journalRefreshService.ts`.
- **Reasoning:** the refresh price comes from the option chain, which is required to be LIVE (per-contract verified). The market quote is not used for the price, so this is acceptable. Recorded so the decision is explicit.
- **Status:** **Confirmed by reading.** Not a defect.

### F5 — Stored research labelled as a recommendation badge (MEDIUM)
- **File:** `src/app/(research)/options-engine/page.tsx` line ~100: `d.status === "RECOMMENDATION" ? "RECOMMENDATION" : "NO TRADE"`.
- **Expected:** stored research is never presented as a live recommendation.
- **Actual:** the badge reads "RECOMMENDATION" when a stored round has that status. The heading and the paragraph say "stored… not live", but the badge does not.
- **Status:** **Confirmed in code.** Stored rows observed were NO TRADE (earlier session), so the badge was not observed showing RECOMMENDATION.

### F6 — Fallback cannot inherit LIVE (CONFIRMED SAFE)
- `withFallback` returns mock data, whose sources are MOCK, and sets `fallbackReason`. `hasMockInput` catches either. The risk of a mixed snapshot (one LIVE subsystem) is covered by the worst-of rule (`aggregateRequiredSource`, `dataQuality.ts:12-18`).
- **Status:** **Confirmed by reading.**

### F7 — Frontend MOCK label not checked in live mode (UNVERIFIED)
- No live MOCK display was observed in this audit.

### Unresolved risks (not defects, not tested here)
- **U1:** the chain's LIVE label relies on `verifyEvaluationOptionPrices`; the verification itself was not re-tested in this audit.
- **U2:** `freshnessOf` thresholds (120 s market and chain, AGING from 30 s) are fixed constants. They are not tied to market hours.
- **U3:** the chain label uses `lastTradeTime` from the verified rows, which is the most recent row time, not the oldest. An old contract within a fresh chain may not be flagged. Not verified.

---

## 8. Recommended fixes, ranked by severity (not implemented)

1. **(High, F1)** In `strategy.ts` `staleness`, add a blocker when `s.sources.market.source === "STALE"` (and a matching check in `riskService.ts` line ~216). Add a regression test with a snapshot whose market source is STALE but whose `fetchedAt` is current. Expected: NO TRADE.
2. **(Medium, F3)** Store the exchange last-trade time (`lastTradeTime`) next to `fetchedAt` in the journal timestamps. Add a regression test that a journaled entry keeps both.
3. **(Medium, F2)** Give END_OF_DAY its own display label in `sourceMeta` instead of STALE, and add a test for the label.
4. **(Medium, F5)** Replace the "RECOMMENDATION" badge on stored research with "STORED RESEARCH" text, or hide the badge for stored rows. Add a test.
5. **(Low, F4)** Document in the refresh route that only the chain is checked, and why.
6. **(Low, U2/U3)** Review the freshness thresholds against market hours, and check the oldest contract's last-trade time in the chain label.

Each fix changes behaviour and needs a separate instruction, and the trading thresholds are out of scope for this audit.

---

## 9. Verification evidence and limitations

### Evidence used
- Static inspection of the files listed above (grep and read).
- Read-only scan of `.data/recommendations/*.json` (26 files): labels, decisions, and the presence of MOCK or fallback provenance. No file was modified.
- Browser text captured earlier in this session (Overview, Options Engine, System Health).
- Real route call on the isolated MOCK server (earlier session): generate → `journaled: false`; refresh → 409, fixture journal unchanged.
- Existing tests were **not re-run** for this audit (no code changed). Tests referenced: `mockExecutionGuard.test.ts` (MX-1 to MX-3), `journalRefresh.test.ts` (JR-1 to JR-9), `journalRefreshService.test.ts` (RS-1 to RS-15).

### Limitations
- No live Upstox or broker data. The 422 paths and the valid-price route write are not exercised on live data.
- F1's trading effect is not demonstrated: the full pipeline was not executed with a STALE market label.
- The frontend was observed only in live mode (market open and closed, earlier) and on the isolated MOCK server without label checks.
- No new test was written for F1, F2, F3 or F5, as the brief required.

---

## 10. Updated GO/NO-GO

- **Live recommendation engine: NO-GO.**
- Reasons: F1 (high) is confirmed in code and not yet fixed, so a stale market quote may pass the gate. F2, F3 and F5 weaken provenance display and records. No validated strategy exists, and no candidate is VERIFIED. Recent data does not prove profitability.
- The audit's positive findings (MOCK exclusion at the journal, worst-of aggregation, LIVE chain verification, refresh refusals) reduce the risk of MOCK or stale data being presented as LIVE in the journal. They do not make the engine ready.
