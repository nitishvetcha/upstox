# Paper-trading HTTP routes: risk and authorization trace (read-only)

Date: 2026-11-13. Method: static reading of each route file and the paths it calls. No route was executed and no code was changed.

## 1. Authorization

- **Layer 1 (verified):** `src/proxy.ts` calls `isProtectedApiPath` (`src/lib/protectedApi.ts`). It protects `/api/backtest`, `/api/paper-opportunities`, `/api/paper-trading`, and `/api/recommendations/<id>/paper-trade`. Requests without an operator session or bearer token are refused before any handler runs.
- **Layer 2:** most paper-trading handlers have no `requireOperator` call of their own. Their protection is the proxy layer only. This is verified by reading. Whether the proxy matcher covers every path variant is **not verified** here.
- `recommendations/[id]/refresh` and `recommendations/generate` have per-handler `requireOperator` calls (verified).

## 2. Route-by-route

| Route | Auth at route | Creates a paper trade? | Path to a trade | Risk check on that path |
|---|---|---|---|---|
| `paper-trading/enter` | none (proxy) | Yes | `getPaperTradingEngine().processRecommendation(analysis)` | Freshness gate, then position limits, then `evaluateTradeRisk` (paperEngine ~line 348). Rejected entries return `created: false`. |
| `paper-trading/update` | none (proxy) | Updates open trades | `evaluateOpenTrades` | Not an entry path. |
| `paper-trading/close` | none (proxy) | Closes trades | `closeTrade` | Not an entry path. |
| `paper-trading/portfolio`, `trades`, `trades/[id]` | none (proxy) | No | Read-only | Not applicable. |
| `paper-opportunities/collect` | none (proxy) | Records opportunities, not trades | Collection | Not an entry path (verified by grep: no engine call). |
| `paper-opportunities/monitor`, `open`, `sessions`, `[id]`, `[id]/evaluate` | none (proxy) | Opens recorded opportunities as paper trades (`open`, to verify) | Not traced line by line | **Not verified.** |
| `paper-opportunities` (root) | none (proxy) | Calls the paper engine twice, and the risk check once | Verified by grep | Risk call present; the entry path was not traced line by line. |
| `recommendations/[id]/paper-trade` | proxy (protected path) | Yes | Recommendation to paper trade | Risk call present (grep). Entry path not traced line by line. |

## 3. Alternate paths that might create a trade without risk approval

1. **`paper-opportunities/open`** (not traced). If it writes trades without calling `evaluateTradeRisk`, it is an alternate path. **Must be traced before this is closed.**
2. **`recommendations/[id]/paper-trade`** (grep only). Confirm the entry call goes through `processRecommendation`, not a direct write.
3. **Direct ledger writes:** `setTrades` (paperEngine ~line 214) accepts a trade list. Its callers were not traced. A caller that bypasses `processRecommendation` would bypass the risk gate.

## 4. Frontend bypass

Not verified. The server checks above are enforced on the server, but the frontend cannot be tested here without running the app.

## 5. Result

- The main entry path (`paper-trading/enter`) is risk-gated on the server, verified line by line through the engine.
- Three possible alternate paths remain open (section 3). None is confirmed as a bypass; each needs tracing before the risk-gate claim is complete.

## 6. Completed trace (2026-11-13, read-only)

| Route | Path | Risk gate on that path | Rejection handling |
|---|---|---|---|
| `paper-opportunities/open` (GET) | Read-only list of OPEN opportunities | Not applicable (no creation) | n/a |
| `recommendations/[id]/paper-trade` (POST) | `getPaperTradingEngine().processRecommendation(analysis)` | Yes: freshness gate, position limits, `evaluateTradeRisk` | `if (!result.created \|\| !result.trade)` returns the reason. Verified in the handler. |
| `paper-trading/enter` (POST) | Same engine path | Yes | Returns `status: rejected` with the reason |
| `paper-opportunities` (POST) | `createPaperOpportunity` then `savePaperOpportunity`. **Not an engine path.** | **No risk assessment.** Checks only that all data sources are `LIVE`, then requires entry, stop and target1. | Returns 422 for non-LIVE sources. Returns 400 for missing levels. |

### Finding A — paper-opportunity POST has no risk gate (open)
A paper opportunity is a recorded hypothetical with entry, stop and target, but it is not a ledger trade and it is not sized. The route does not call `evaluateTradeRisk`, so an opportunity can be created without the 1% check. Whether this is acceptable depends on whether opportunities can later be opened as trades. Those paths were not fully traced (see Finding B).

### Finding B — the source check trusts client-supplied labels (open, important)
The POST reads `body.dataQuality` from the request and refuses unless every value is `LIVE`. The server does not check those labels against its own market snapshot. A client can therefore send `LIVE` labels for mock data and the record is created. This is a provenance bypass on that route. It should be fixed by deriving the labels on the server from the snapshot.

### Finding C — `paper-opportunities/[id]/evaluate` and `monitor` (not traced to the line)
Not confirmed whether they open ledger trades. To be traced before the risk-gate claim is complete.

## 7. Authorization coverage (verified)

- `src/proxy.ts` has `matcher: "/((?!_next/static|_next/image|favicon.ico).*)"`. Every `/api` path passes through `isProtectedApiPath`.
- Protected regexes (`src/lib/protectedApi.ts`): `/api/backtest`, `/api/paper-opportunities`, `/api/paper-trading`, and `/api/recommendations/<id>/paper-trade`, each matching the path and its subpaths.
- `recommendations/[id]/refresh` and `recommendations/generate` have their own `requireOperator` call.
- `recommendations/daily-summary` and `recommendations/export` are read-only summaries (verified by reading).

## 8. Update (2026-11-13): paper-opportunity provenance fixed

- **Finding B (fixed):** `POST /api/paper-opportunities` no longer reads `body.dataQuality`. It accepts only OPTION opportunities on a known index, loads the server snapshot with `getSnapshot`, and derives labels with `serverProvenance` (`src/lib/services/paperOpportunityProvenance.ts`). Any input that is not verified LIVE, including MOCK, STALE, END_OF_DAY, UNAVAILABLE, or a missing snapshot, returns 422 with server labels and reasons.
- **Stock opportunities:** now refused with 422, because the route cannot verify them against the index snapshot. This is a behaviour change, and it fails closed.
- **Opening = creation:** an opportunity is created already in status OPEN. `evaluate` and `monitor` change only existing records (close and target handling), and they do not open paper trades. So the creation gate is the opening gate.
- **Finding A (open, decision needed):** opportunities are not sized, so `evaluateTradeRisk` (the full 1% check) does not run on them. Options: (1) build a TradePlan at creation and run the risk assessment, so opportunities carry a risk verdict; or (2) keep opportunities as unsized records and state that they are not trades and carry no risk approval. Owner choice.
- **Tests:** `src/lib/services/paperOpportunityProvenance.test.ts` (7 tests). The route wiring is not covered by an automated test, because Next route handlers need a runtime.

### 8a. Correction (2026-11-13): the POST route is the manual UI path
My earlier change made the POST require a server-verified LIVE snapshot. That broke the manual sandbox feature, which the existing tests protect (MO-01, MO-04, MO-07, PO30-01). The POST route sets `provenance: "MANUAL_UI"` on every record it creates, so it is the manual entry path, and automated LIVE opportunities come from the collector instead.

The change that is kept:
- Client `dataQuality` labels can reject a record (422), as before. They can never grant LIVE.
- Stored manual records use `dataSource: "UNAVAILABLE"`, so a client LIVE label can no longer make a manual record look like live evidence.
- The server-side provenance helper (`paperOpportunityProvenance.ts`) is kept for the automated opening path. It is not wired into the manual route.

Finding B is therefore reclassified: the vulnerability was a client LIVE label reaching the stored `dataSource`, and that is closed. Verified-live opening of automated opportunities still needs the server-side check on that path, which is not yet traced.
