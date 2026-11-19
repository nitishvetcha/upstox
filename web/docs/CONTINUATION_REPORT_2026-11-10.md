# Continuation report (2026-11-10): checkpoint, programme NOT complete

This is a checkpoint, not a final delivery. It exists so the next session resumes from the exact remaining task. Written for: the project owner.

## 1. Baseline (verified at the end of this step)
- Offline suite: **2,520 / 2,520 pass**, 0 fail, 0 skipped.
- TypeScript (`npx tsc --noEmit`): **clean**.
- Git entries: **372** (up from 368). Unknown-origin files preserved; nothing staged, committed, reset, cleaned, restored or deleted.
- Ports 3123 and 3150: free.

## 2. Files not modified in this step (unknown origin, preserved)
- `src/lib/services/risk/riskKnownAnswer.test.ts`
- `src/lib/services/a11yLabels.test.ts` (path: `src/lib/a11yLabels.test.ts`)
- `docs/TESTING_AND_VERIFICATION.md`
- `docs/IMPLEMENTATION_CHANGELOG.md`
- `docs/FINAL_PROJECT_STATUS.md`

These five were reported as changed on disk without this session's edits. Their origin is recorded as UNKNOWN. They were not overwritten. The eight deliverables are therefore **not reconciled** in this step; the reconciliation is listed as a remaining task below.

## 3. Completed in this session (evidence)
| Area | Result | Evidence |
|---|---|---|
| Indicators EMA, RSI, ATR, MACD, VWAP | PASS (hand-derived known answers) | `services/indicatorsKnownAnswer.test.ts` (18) |
| Breadth | PASS | `services/breadthKnownAnswer.test.ts` (8) |
| Risk, position sizing | PASS | `services/risk/riskKnownAnswer.test.ts` (10) |
| Option-chain metrics (PCR, max pain, support/resistance, IV, expected move) | PASS | `services/optionChainKnownAnswer.test.ts` (part of 25) |
| Expiry filtering | PASS | same file |
| Session boundaries (pre-open, open, close, Muhurat) | PASS | `sessionBoundaries.test.ts` (11) |
| Lot-size resolution and contract lot-size guards | PASS | `services/lotSizeKnownAnswer.test.ts` (9) |
| Market-status holiday consistency (fix F-FE5) | PASS | `services/liveSessionHoliday.test.ts` (5) |
| Saved-picks failure states (fix F-FE4) | PASS | `a11yLabels.test.ts`, browser E1/E2 |
| Home-page layout (fix F-FE6) | PASS | screenshots, 0 px overflow |

## 4. Not supported by the code (recorded, not tested)
- **Historical lot-size changes:** the code takes lot size from the current contract master only. No lot-size history store exists, so no historical test can be written. Status: **BLOCKED (data)**.
- **Timezone boundaries for contracts across DST or calendar changes:** IST has no DST; the session and expiry boundaries are tested above. Contract-level timezone integration: **NOT TESTED**.

## 5. Remaining tasks, in order (exact next action first)
1. **Next action:** write the remaining option-contract integration cases (contract selection by expiry and strike, missing contracts, invalid contract data) as synthetic fixtures.
2. Incomplete-session behaviour: data arriving mid-session and partial candles (the candle-freshness and completed-candle logic).
3. Frontend: filters, search, tabs, charts, refresh and stale states, and visual inspection of every relevant route at 1440, 768 and 390 px.
4. Backend: authorization, provider failures and timeouts; remaining safe write handlers with disposable stores.
5. Integration: instrument mapping, expiry mapping, API-to-UI tracing, cross-index synthetic fixtures.
6. Data: cross-store relationships and timestamp consistency (read-only).
7. Security: session handling, CORS, CSRF, XSS, error leakage, rate limiting, sensitive-data exposure (no dependency changes).
8. Performance: measured rendering, bundle, API and memory figures in the isolated environment.
9. Deployment: build and runtime configuration, environment variables, health checks, checklist.
10. Research: authoritative technical references with URLs and access dates; no live market-data requests.
11. Reconcile the eight deliverables, only where edits cannot overwrite unknown-origin content (see section 2).

## 6. Decisions (final, not re-asked)
- ESLint upgrade declined; 8 moderate dev-only findings deferred.
- Unknown-origin Git files preserved.
- `.data` read-only inspection approved; `.research-data` protected.
- Online technical research allowed; no live Upstox/NSE requests; no paper-trading, backtest, broker, credential or deployment actions.
- P1 rejected; Strategy 11.4 frozen; holdout sealed; recommendation engine NO-GO.

## 7. Readiness (current)
- Application: **not ready** for production; **staging not yet supported** by the evidence (frontend interactions, backend authorization and failure paths, integration tracing and performance remain open).
- Local mock-mode development: usable within the areas tested above.
- Recommendation engine: **NO-GO**.

## 8. Checkpoint update (later the same day)
- **Completed:** option-contract integration on synthetic fixtures, 23 tests, all pass (`services/optionContractIntegration.test.ts`). Covers instrument mapping (known, unknown, wrong case, BSE segment), expiry normalisation, contract mapping (CE and PE, dropped malformed rows, string strikes), lot size (agreement, disagreement, absence), coverage (duplicate keys, missing keys, incomplete coverage, mismatched strike, underlying, expiry and type) and error mapping (401, 404, 429, bad response).
- **Suite:** 2,543 / 2,543 pass. TypeScript clean. Git entries 374.
- **Next exact action:** incomplete-session testing (partial candles, mid-session data, and the completed-candle rule), then frontend filters, search, tabs and charts.
- **Still open:** everything listed in section 5 except items 1 (done).

## 9. Checkpoint update (incomplete sessions)
- **Completed:** incomplete-session validation (28 tests, all pass): completion boundary, missing and delayed final candle (inclusive 17 min limit, 5 min 7 min interval-specific grace), STALE_FETCH, early closure, holiday, daily candles, interrupted and partial sessions, pre-open, no candles, malformed and future-dated newest rows, UTC/IST day grouping, insufficient history for RSI, EMA and MACD, and nearest-expiry selection on synthetic lists. File: `src/lib/services/incompleteSessions.test.ts`.
- **Not verified by these tests:** the frontend rendering of these states; the API layer's use of these functions end to end.
- **Next exact action:** frontend filters, search, tabs, charts and refresh/stale/error states (browser, isolated mock server), then visual inspection at 1440, 768 and 390 px.

## 10. Security checkpoint (live probes on the isolated mock server)
- Added `src/proxy.ts` (Next 16 proxy convention) with helper `src/lib/securityHeaders.ts`: X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy. Tests: `src/lib/securityHeaders.test.ts` (5). Verified on a live page response.
- Findings NOT fixed:
  - No Content-Security-Policy. Needs a nonce or hash design and browser testing; not attempted.
  - `X-Powered-By: Next.js` still sent. Removing it needs `poweredByHeader: false` in `next.config.ts`, which is an unknown-origin tracked file, so it is preserved. Blocked by the preservation rule.
  - No rate limiting. 30 rapid GETs all returned 200. Not implemented; needs a design decision (per-IP limits behind a proxy).
  - CORS: no Access-Control headers on API responses for a foreign origin. This means no cross-origin read is granted. PASS for the probe, not a full CORS policy review.
  - Error leakage: a malformed JSON body returns only `{"error":"invalid JSON"}`. PASS for this probe.
  - Auth: `/api/options-canary` without a bearer returns 500 because its secret is unset (fail closed, documented). Authorization on other routes was not reviewed.
- Not performed in this checkpoint: CSRF and XSS testing, sessions (the app has no session model beyond logout), performance, deployment review, technical research, frontend interaction testing, visual inspection, backend authorization and provider-failure tests, end-to-end tracing, cross-store checks, and the eight-document reconciliation.
- Suite after this checkpoint: see the verification line below.

## 11. Checkpoint (CSP/rate-limit design, timestamp check)
- **Read-only `.data` timestamp and id check (aggregate only):** recommendations 26, paper-opportunities 455, opportunity-tracking 210, saved-picks 0 records. Unparsable timestamps 0, future-dated 0, duplicate ids 0.
- **Rate limiter:** `src/lib/rateLimit.ts` (fixed window, bounded memory, trusted-client key). Tests `src/lib/rateLimit.test.ts`: 9 pass. Not wired into any route.
- **CSP:** design only in `SECURITY_CSP_AND_RATE_LIMIT_DESIGN_2026-11-10.md`. Nothing enforced; no report-only header yet.
- **Blocked, with reason:** removing `X-Powered-By` needs `next.config.ts` (unknown-origin, preserved). CSP enforcement needs browser violation data and a report-collection decision. Rate-limit enablement needs a reverse-proxy decision and staging traffic data.
- **Still open:** frontend interaction and visual work; backend authorization and failure-path tests; end-to-end tracing; CSRF/XSS testing; performance measurement; deployment checklist; technical research with dated sources; deliverable reconciliation.

## 12. Checkpoint (CSP measurement, receiver, deployment inspection)
- **Deployment inspection (read-only):** no reverse proxy configured in the repository (no Dockerfile, nginx, Caddy or platform config found). Trusted-proxy handling stays disabled. `ecosystem.config.cjs` (pre-existing, unknown origin, preserved) runs `next start` with autorestart and one instance; it was not started.
- **Rate limiter:** `src/lib/rateLimit.ts`, 9 tests pass. Not wired into any route; not enabled.
- **CSP receiver:** `src/app/api/csp-report/route.ts` plus `src/lib/cspReport.ts`. Local-only, 8 KB bound, aggregate counts only. 12 tests pass.
- **CSP measurement:** strict report-only run recorded 45 inline-script and 45 eval violations, 0 style. Enforcement is NOT enabled. Details in `SECURITY_CSP_AND_RATE_LIMIT_DESIGN_2026-11-10.md` section 5.
- **Suite:** 2,600 / 2,600 pass; TypeScript clean (after widening one helper type).
- **Blocked:** removing `X-Powered-By` (needs `next.config.ts`, preserved). CSP enforcement (needs a nonce strategy and a production-build measurement). Rate-limit enablement (needs staging traffic data).
- **Still open:** frontend interaction and visual work; backend authorization and failure-path tests; end-to-end trace; CSRF/XSS testing; performance measurement; deployment checklist; dated technical research; deliverable reconciliation.

## 13. Checkpoint (font self-hosting attempt, CSP attribution, style policy)
- **Step 1, self-host Geist: BLOCKED on font provenance.** Only four WOFF2 files exist locally, inside Next's own dev-overlay package (`node_modules/next/dist/next-devtools/server/font/`): latin and latin-ext for Geist and Geist Mono. They are static fonts. I could not read their weight class (no font-parsing tool installed), so I cannot confirm they cover the weights the app uses. Substituting them could change visible typography. Not swapped. Needed from you: the full Geist WOFF2 files (regular and bold at minimum), or approval to fetch them once from the official Geist source outside the build sandbox.
- **Production build:** still blocked by the same font dependency. Not run.
- **CSP style attribution (dev, nonce mode, 8 routes):**
  - style-src-elem 264: Next dev-overlay chunk (dev-only tooling).
  - style-src-elem 4: shared runtime chunk, source not resolved.
  - style-src-attr 75 before the allowance: React `style={}` props on /opportunities (60), / (7), /saved-picks (6), /stock-v2 (2).
- **Style-attribute allowance:** applied to the nonce report-only policy (`style-src-attr 'unsafe-inline'`). Re-measured: style-src-attr violations 0. Script policy stays nonce-only. Test added (12 header tests pass).
- **Enforcement: NOT enabled.** Remaining violations are dev-overlay styles, and no production measurement exists.
- **Not started in this block:** frontend browser interaction and responsive checks.
- **Suite:** see the verification line of the checkpoint that accompanies this section.

## 14. Checkpoint (self-hosted fonts, production build, production CSP)
- **Fonts:** official Vercel Geist release v1.9.2 (`https://github.com/vercel/geist-font/releases/download/v1.9.2/geist-font-v1.9.2.zip`, sha256 `15f066d58dcb99fb10014a49913009fdaf41e464cfb8851a44b44e593c95d3d8`). Used `Geist[wght].woff2` (sha256 `3626eba5…b1687e`) and `GeistMono[wght].woff2` (sha256 `5d93ee62…e600d4`), both variable, family names verified, `wOF2` signature. OFL 1.1 license copied to `src/app/fonts/OFL-Geist.txt` (sha256 `021caa74…fffc17`). The four Next dev-overlay files were not used.
- **App change (minimal):** `src/app/layout.tsx` replaces the Google Fonts import with `next/font/local` (same CSS variables, weight 100–900), and adds `export const dynamic = "force-dynamic"` so nonces can be applied. Other typography unchanged.
- **Production build:** succeeds inside the no-outbound sandbox (`Compiled successfully`, no network exception). Before the dynamic change, `/saved-picks` and `/strategy-evidence` were the only static routes.
- **Production CSP (report-only, nonce, 15 routes):** inline scripts without nonce: 0. Script violations: 0. Remaining: 2 style-element violations from one runtime chunk (source not yet resolved). Enforcement: NOT enabled.
- **Proxy fix found in this block:** the policy must also be set on the request for Next to attach nonces (Next 16 CSP guide). Applied.
- **Blockers / open:** resolve the 2 chunk style violations; rate limiter remains unwired; `X-Powered-By` remains blocked on `next.config.ts`.
- **Product priority next (per latest direction):** verify the recommendation output end to end (contract selection, entry/stop/targets, quantity, NO TRADE paths), then frontend interaction checks at 1440/768/390.

## 15. Recommendation pipeline verification (checkpoint)
- **Verified (15 tests, 14 pass, 1 skipped as a finding):** `src/lib/recommendationPipeline.test.ts`. Uses LIVE-labelled `mockSnapshot` base at 12:30 IST. Checks: selected leg is BUY, direction matches CE/PE, strike and premium match the chain row; stop, target1 and target2 match the documented formula recomputed from chain delta and ATR (to 0.005 rounding); reported R:R equals the recomputed value; quantity = lots × lot size; allowed plans do not exceed the per-trade risk budget; unknown lot size is never TRADE; stale market, end-of-day market and news conflict are never TRADE; every NO TRADE carries a blocker or risk; opening window is never TRADE; dashboard status and TRADE levels equal the analysis.
- **Fix in presentation (not frozen logic):** `src/lib/dashboard.ts` shows entry, stop, targets and R:R only when status is TRADE. Previously a WAIT status during the opening window displayed price levels. Regression tests added.
- **Finding F-R1 (strategy, frozen, owner decision):** with EMA 200 unavailable, the engine returns TRADE and records no blocker or risk note. Test skipped, not enshrined. Strategy 11.4 NOT modified.
- **Finding F-R2 (strategy, frozen):** `analyze()` still returns a plan with status WAIT during the opening window. The dashboard now hides its levels. The raw `/api/analysis` payload still carries that plan; owner decision whether to remove it at the source.
- **Frozen hash verified:** `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18`.
- **Suite:** 2,619 tests, 2,618 pass, 1 skipped (F-R1). TypeScript clean. Git entries 386 (new this block: font directory, fonts, pipeline test, probe removed).
- **Not yet done:** frontend browser checks at 1440/768/390; backend authorization and failure-path tests; the 2 chunk style violations; rate limiter remains unwired.

## 16. F-R1 / F-R2 decisions applied
- **F-R1 (missing EMA 200), BLOCKING strategy defect:** the engine returns TRADE with EMA 200 unavailable and records no blocker or risk note. Test skipped and kept visible. Strategy 11.4 NOT modified. The recommendation engine remains NO-GO until this is separately reviewed and resolved by an authorised strategy change.
- **F-R2 (WAIT plan through the API), fixed outside the frozen strategy:**
  - `src/lib/analysisResponse.ts`: `toApiAnalysis` removes the plan unless status is TRADE; every candidate is reduced to name, score, rejection reason, and risk gate outcome, with no entry, stop, targets, legs, quantity or risk/reward. The internal `Analysis` is unchanged.
  - `src/app/api/analysis/[index]/route.ts`: now returns `toApiAnalysis(...)`; switched to relative imports so it is testable.
  - `src/lib/recommendationEnricher.ts` (`buildRecommendationResponse`): `entryDetail` only for TRADE; `contract` keeps identity but loses ltp, bid and ask outside TRADE.
  - `src/lib/dashboard.ts`: entry, stop, targets and risk/reward only for TRADE (earlier fix).
  - Tests: `src/lib/apiPresentationBoundary.test.ts` (5 pass) plus the pipeline tests.
- **Suite:** 2,624 tests; 2,623 pass; 1 skipped (F-R1). TypeScript clean. Frozen strategy hash `d0170b40…3f18` verified.
- **Git entries:** 389 (+3 since section 15: the analysis response helper, its test, and the boundary test). All changes this session are listed in this report; unknown-origin entries untouched.
- **Not done in this checkpoint:** frontend interaction and responsive checks at 1440/768/390; backend authorization and failure-path tests; the two CSP style violations; the rate-limiter decision; per-file review of all Git entries.

## 17. Checkpoint (Git review, CSP source, rate-limit decision, backend auth probe)
- **Git review (read-only, 389 entries):** 253 untracked, 127 modified, 9 deleted. Areas: `src/lib` (136 untracked, 76 modified), `src/app` (10 untracked, 18 modified, 9 deleted), `src/components` (4 untracked, 16 modified), `scripts/` (modified: upstox and paper runner scripts, which carry my guards and the paper runners' unchanged bodies), root config (`package.json`, `package-lock.json`, `next.config.ts`, `eslint.config.mjs`, `AGENTS.md`, `.env.example`, `.gitignore`, `tsconfig.json`: all modified before or outside this programme, not touched by it).
  - **Protected files:** `next.config.ts` (modified, preserved), `ecosystem.config.cjs` (untracked, preserved), `src/lib/services/risk/riskConfig.ts` (modified 2026-11-06, before this programme; the diff adds cost and slippage fields and leaves the limit values unchanged; not touched here). `src/lib/engine/strategy.ts` hash matches the frozen value.
  - **Unexplained:** a large set of untracked `src/lib` and `src/app` files predates this programme (e.g. timestamps from 2026-10-23 to 2026-11-08). Their origin is UNKNOWN. Nothing was staged, committed, reset, cleaned, restored, deleted or overwritten.
- **CSP style-element violations (production):** source identified. Chunk `1ol6ayz8zfgn2.js` is `lightweight-charts` 5.2.1 (TradingView), which injects a `<style>` element for its attribution logo. Used by `src/components/research/CandleChart.tsx` and `LineChart.tsx`. Assessment: a compatibility issue (enforced `style-src-elem` without `'unsafe-inline'` would stop the library's styling), with low security impact (CSS injection, not script). Recommended: accept `style-src-elem 'unsafe-inline'` at enforcement time, or pin the library to a nonce-capable version. Enforcement remains OFF.
- **Rate limiting decision: DEFER.** The app is a single-operator, mock-by-default tool with no internet exposure configured and no reverse proxy. Per-route limits would not reduce a real threat in this architecture. The more important gap is missing authorisation on write routes (below). Limiter stays unwired.
- **Backend authorisation probe: BLOCKED (not completed).** The probe list included backtest and paper-trading write routes, which the programme restrictions prohibit even against sandbox data. The command was denied by the permission check before it ran; no server was left running. Re-run should target only saved-picks, risk/assess and auth/logout, and must not call backtest or paper-trading routes.
- **Known authorisation gap (from source inspection, not yet probed):** most API routes have no authentication. Only `/api/options-canary` checks a bearer secret. Write routes (saved-picks, opportunities, recommendations, paper and backtest routes) are reachable by anyone who can reach the server. Acceptable only while the server is local-only; must be fixed before any non-local deployment.
- **Not done in this checkpoint:** frontend browser workflow pass (dashboard, instrument and expiry selection, option chain, charts, breadth, WAIT/NO TRADE presentation, saved opportunities) at 1440/768/390; search, filters, tabs and state checks.

## 18. Checkpoint (restricted backend probe, loopback frontend smoke)
- **Backend authorisation probe (approved scope only: saved-picks, risk/assess, auth/logout; isolated mock server bound to 127.0.0.1):**
  - Authorisation: **FAIL (deployment blocker).** No authentication on any probed route. `GET /api/saved-picks` lists picks, `POST` creates, `DELETE` removes, and `POST /api/auth/logout` works, all without credentials.
  - Input validation: PASS. Empty body 422 with named fields; malformed JSON 400; wrong instrument type 422; invalid plan 400; unknown index 404; missing delete id 400; missing record 404; wrong method 405.
  - Error exposure: PASS. No stack traces or filesystem paths in any response body or server log line checked.
  - Write side effects: a valid pick was written only to the scratch store and then removed by the probe's own cleanup.
  - Server stopped afterwards (port 3150 verified free).
- **Deployment decision (approved):** local-only. Bind 127.0.0.1. Open write APIs are a **deployment blocker**: authentication and authorisation must be implemented and independently verified before any non-local deployment.
- **Frontend loopback smoke (14 routes x 3 widths = 42 checks):** HTTP 200, no horizontal overflow, no console or page errors. **PARTIAL.** This is mechanical only. Instrument and expiry selection, option-chain interaction, search, filters, tabs, refresh, and loading, stale and error states were NOT exercised in this pass. Screenshots were not visually reviewed.
- **CSP:** lightweight-charts style injection documented as a known compatibility requirement (see section 17). Enforcement remains OFF.
- **Phase 1 status:** not complete. Open: authentication and authorisation for write routes, interaction workflow tests, F-R1 (recorded blocker, recommendation engine NO-GO).

## 19. Checkpoint (authentication and authorisation)
- **Finding before the change:** `POST /api/auth/logout` clears the Upstox token file, and was reachable without credentials. My approved probe called it, but with `UPSTOX_TOKEN_FILE` pointed at a test path, so the real token file was not touched (its mtime is still 2026-11-03).
- **Design (local-only, minimum appropriate):** operator token from `OPERATOR_TOKEN` (>= 32 characters). `POST /api/auth/login` exchanges it for a random session id (HttpOnly, SameSite=Strict, 8 h, held only on the server, bounded to 50 sessions). Protected routes accept a valid session cookie or `Authorization: Bearer <OPERATOR_TOKEN>`, compared in constant time. Logout revokes the server-side session, clears the cookie, and clears the Upstox token (for authorised operators only). Fail closed: token unset or under 32 characters gives 503 on protected routes.
- **Protected:** saved-picks (GET, POST, DELETE), risk/assess (POST), auth/logout, auth/login (requires JSON), opportunities/track (POST), opportunities/outcomes (GET, PATCH), recommendations/generate (POST), recommendations/[id]/refresh (POST).
- **Not touched (per instruction):** backtest and paper-trading routes. They remain unprotected and are a deployment blocker.
- **Tests:** `src/lib/operatorAuth.test.ts`, 22 pass. Positive: bearer access, create and delete, login cookie, session access, logout invalidates the session. Negative: 401 on all nine protected handlers without credentials, wrong bearer, wrong login token, forged cookie, non-JSON login, generic 401 body, 503 when unconfigured or too short, and the unauthenticated logout refused with the Upstox token file unchanged.
- **Existing tests updated (authentication only, no assertion changed):** saved-picks route, savedPickMapping, generate route, writeRouteValidation, savedPicks.duplicates. They now send the test operator token.
- **Suite:** 2,646 tests, 2,645 pass, 1 skipped (F-R1). TypeScript clean. Strategy hash `d0170b40…3f18` verified.
- **Functional gap (not yet fixed):** there is no login screen. Browser widgets that call protected routes (saved picks, recommendation generate, journal refresh) will show errors until a login form is added. Next functional task.
- **Not yet done:** the frontend interaction workflow pass; CSP and rate limiting unchanged (enforcement off, limiter unwired).
- **Servers:** none running (3150 and 3123 free).

## 20. Checkpoint (/login page, redirect-back, session gate, logout)
- **Implemented:**
  - `/login` page (server wrapper `src/app/login/page.tsx`, client form `src/components/LoginForm.tsx`). Password-type token field, no storage of the token (state only, cleared immediately after submit), submit disabled while processing, generic 401 and 503 messages, network error message.
  - Global sign-out control (`src/components/AppChrome.tsx`, mounted in the root layout; hidden on /login). It replaces the earlier top-bar copy.
  - Page gate: `src/lib/pageGate.ts` (pure decision, tested) used by `src/proxy.ts`. Unauthenticated page requests redirect to `/login?next=<same-origin path>`. API routes are not redirected and keep their own 401s.
  - Open-redirect protection: `src/lib/redirectSafety.ts` (same-origin paths only; refuses external URLs, protocol-relative paths, backslashes, control characters, /login, /api, and over-long values).
  - Session store moved to `globalThis`. Finding: Next.js loaded the proxy and the route handlers as separate module instances, so a login issued a session the proxy could not see. Fixed. Single-process only; a multi-instance deployment needs a shared store.
- **Unit tests:** redirect safety 7 pass; page gate 8 pass; operator authentication 22 pass.
- **Browser (isolated, loopback 127.0.0.1, synthetic test token, Chromium), 17 of 17 pass:**
  1. Protected page redirects to /login with the destination preserved (including query string).
  2. Wrong token shows "Invalid operator token."; field cleared; nothing in localStorage or sessionStorage.
  3. Correct token redirects back to the original destination; no token stored client-side; session cookie is HttpOnly and SameSite=Strict.
  4. Session persists across refresh.
  5. Sign out returns to /login; the old session cookie is then rejected (server-side invalidation).
  6. Forged cookie redirects to /login.
  7. External `next` values are never followed after login.
  8. Submit button disabled while the request is in flight.
  - Responsive: no horizontal overflow at 768 and 390 pixels.
  - No page errors during the login flows.
- **Visual review:** login screenshots at 1440 and 390 pixels inspected. Card centred, readable, no clipping. The Sign in button is correctly disabled while the token field is empty.
- **Suite:** 2,661 tests, 2,660 pass, 1 skipped (F-R1). TypeScript clean. Strategy hash `d0170b40…3f18` verified.
- **Deployment blockers still open:** backtest and paper-trading routes are unprotected and remain excluded per instruction; the session store is single-process; the operator token is the only credential (no per-user accounts). Server remains local-only, bound to 127.0.0.1.
- **Not yet done:** the broader frontend interaction pass (instrument and expiry selection, option chain, charts, breadth, BUY, WAIT and NO TRADE presentation, saved opportunities, search, filters, refresh and error states across 1440, 768 and 390 pixels). Recommendation generate and journal refresh widgets will show an authorisation error until the operator signs in; the login redirect now covers that case for page visits.

## 21. Checkpoint (widget authentication, dashboard browser pass, risk-panel gating)
- **Widget authentication (Priority 2):** recommendation generate and journal refresh now send a refused (401) user to `/login` with the current page as the return destination (`src/lib/loginRedirect.ts`, tested). Nothing is retried automatically, so a generate request is never repeated without the user pressing the button again. Paper-trading enter is untouched (prohibited route).
- **Browser pass (isolated, loopback, synthetic token), dashboard:**
  - A: unauthenticated dashboard → `/login?next=%2F`. PASS.
  - B: login returns to the dashboard. PASS.
  - C: instrument selector present (NIFTY, BANK NIFTY). PASS.
  - C2: switching to BANK NIFTY leaves no error. The first run reported a false failure from Next's empty route-announcer alert. Screenshot confirmed the widget switched and showed no error. Treated as PASS on inspection.
  - D: no entry or stop levels shown while status is NO TRADE. PASS.
  - E: no horizontal overflow at 1440, 768 and 390. PASS. Dashboard screenshots at all three widths inspected.
  - F: no page errors. PASS.
- **Defect found and fixed:** the dashboard risk panel showed lot count, quantity, total risk, risk percent and capital for a "not recommended" candidate while status was NO TRADE (screenshot: "5 lots (5)", stop risk, under RISK BLOCKED). Now shown only for a recommended TRADE. Approval status, reasons and limits remain visible. Regression test in `apiPresentationBoundary.test.ts`.
- **Suite:** see the verification line in the run that accompanies this section. Strategy hash `d0170b40…3f18` verified.
- **Not yet done (Priority 1 remainder and Priority 3):** option-chain interaction and contract selection, charts and indicators, market breadth and structure, saved opportunities, search, filters and tabs, loading, stale, unavailable, empty and error states, and the end-to-end workflow comparison against backend values. Phase 1 is not complete.

## 22. Checkpoint (option chain: attempted, blocked by a safety check)
- **Started:** option-chain browser verification (NIFTY and BANK NIFTY chains, expiry, strike, CE and PE, ATM and ITM/OTM labelling, premium and metrics, selected contract, lot size, missing and stale states). The isolated server was started on 127.0.0.1:3150 and an authenticated page load was prepared.
- **Blocked:** the browser-check command was refused by an automated safety check ("could not be checked for dangerous rm operations"). The check was not a real removal, and no files were deleted. The command was not retried or re-routed. The check script was never written, so **no option-chain result has been verified**.
- **Server:** the test server was stopped by process ID. Port 3150 is verified free. Nothing is listening on 3123.
- **Still open:** every item in the Phase 1 list in section 21 and this section: option chain and contract selection, charts and indicators, breadth and structure, saved opportunities, search, filters and tabs, loading and failure states, and the end-to-end workflow. Phase 1 is not complete.
- **Decision needed from you:** the browser tooling is now being blocked by an automated check when commands reference scratch-folder paths. Either approve a permission rule for the browser test commands, or confirm that I should keep test scripts inside the project folder instead.

## 23. Browser verification resumed (option chain), with defects fixed
- **Scripts location:** `web/tests/browser/option-chain.check.cjs` (new, inside the project). Checked first: no `tests/` directory existed, so nothing was overwritten. Server scratch data is in `web/.test-data/browser-run/` (created for this run). Backend JSON snapshot saved to `web/tests/browser/backend-option-chain-nifty.json`.
- **Server:** started on 127.0.0.1:3150 in the sandbox with a synthetic operator token; stopped by its recorded PID (55465); port 3150 verified free.
- **Blocked earlier command:** the original blocked command was not re-run. The new script was written with the file tool, and the server was started with literal paths.
- **Results, option chain (NIFTY), desktop/tablet/mobile:**
  - Page renders after login: PASS (31 strike rows at each width).
  - No horizontal overflow at 1440, 768 and 390 px: PASS.
  - No page errors: PASS.
  - Headers CE OI, CE ΔOI, CE IV, CE LTP, Strike, PE LTP, PE IV, PE ΔOI, PE OI: PASS.
  - ATM row marked: PASS. Screenshot shows ATM 25,100 for spot 25,118.40, which is correct.
  - ITM and OTM labels: PASS after fix (15 CE ITM and 15 CE OTM rows, plus 1 ATM).
  - Provenance label MOCK shown: PASS.
  - Backend comparison: ATM row values on the page (CE LTP 197.40, PE LTP 148.10, CE IV 12.5) equal the backend response for atmStrike 25100. Spot 25,118.40, expiry 2026-11-17 and source MOCK also match.
- **Defects found and fixed:**
  1. Sign-out control overlapped the top-bar ticker text (screenshot). Moved to bottom-right (`src/components/AppChrome.tsx`). Post-move screenshot not re-inspected.
  2. Option chain had no moneyness labels, only ATM highlighting. Added ITM/OTM labels under each strike (`src/components/SectionViews.tsx`). Verified in the browser.
- **Observation (not a defect):** the page shows the full snapshot chain (31 strikes, ±15 around ATM). The API `/api/option-chain/nifty` returns a 10-strike window by default (21 strikes). Shared strikes match. The window difference is documented, not hidden.
- **Not yet tested in this section:** expiry selection, strike click and contract details, lot-size display and validation, missing, stale, unavailable and invalid contract states, BANK NIFTY chain, and the BANKNIFTY tab. These remain open.
- **Typecheck:** clean. **Full suite:** not re-run after the UI changes in this section.
- **Phase 1:** NOT complete. Remaining items from sections 21 and 23 include charts and indicators, breadth and structure, saved opportunities, search, filters and tabs, failure states, and the end-to-end workflow.

## 24. Checkpoint (regression run and the 31-versus-21 row investigation)
- **Full suite after the UI changes:** 2,664 tests; 2,663 pass; 0 fail; 1 skipped (F-R1). TypeScript clean. Log written to `web/full-run-after-ui.log` (a new file I created; not deleted, to avoid a removal command, can be deleted on approval).
- **31-row UI versus 21-row API, investigated (code, not assumed):**
  - The option-chain page renders `snapshot.chain`, which is built in `src/lib/services/market.ts` from the same `chain.rows` as the API.
  - `GET /api/option-chain/[index]` returns `sliceAroundAtm(rows, spot, range)` with range defaulting to 10 (1–50 allowed).
  - So both views read one provider source. The 21 API strikes (ATM ±10) are a subset of the page's 31 (ATM ±15). Shared strikes matched on the ATM row.
  - Status: **consistent, same source**. Not a defect. Not yet verified for every row or for BANK NIFTY.
- **Not done in this checkpoint (remaining Phase 1 work, unchanged from section 23):** NIFTY expiry, strike click, CE/PE contract details and lot-size validation in the browser; missing, stale, unavailable and invalid contract states; the BANK NIFTY chain; the sign-out position recheck at desktop and mobile; charts and indicators; breadth and structure; saved opportunities; search, filters and tabs; loading and error states; the end-to-end workflow.
- **Phase 1 status:** OPEN. Standing restrictions unchanged; server not running (none started in this checkpoint).

## 25. Checkpoint (option-chain selection probe)
- **Probe:** `web/tests/browser/chain-selection.probe.cjs` (new). Loopback, synthetic token, mock data. Server pid 56631, stopped; port 3150 free.
- **Result (NIFTY option-chain page, 31 rows):**
  - Expiry selector: **NOT IMPLEMENTED.** The expiry (2026-11-17) is displayed as text only; there is no control to choose another expiry.
  - Strike or contract selection: **NOT IMPLEMENTED.** No row contains a button, link or radio control, and no row has a click handler.
  - Contract details panel (selected contract, lot size): **NOT IMPLEMENTED.** No such text is present on the page.
  - Symbol tabs: present on the page (NIFTY, BANKNIFTY and others).
- **Status:** NIFTY expiry selection, strike selection, CE/PE selection and contract details are **FAILED (not implemented)**. Lot-size display in the chain page is **NOT TESTED** because no lot-size element exists. Missing, stale, unavailable and invalid contract states: **NOT TESTED** for the same reason.
- **Impact:** the intended output requires an exact option contract. The backend recommendation carries a contract, but a user cannot choose or inspect one from the chain page. This is a product gap, not a test-harness problem.
- **Decision needed:** build a minimal contract-selection feature (expiry control; clickable strike rows; a contract details panel showing instrument key, strike, type, expiry, premium and lot size from the same backend response). This is new UI behaviour inside product scope, so it is listed here rather than started.
- **Not done in this checkpoint:** BANK NIFTY chain, charts and indicators, breadth and structure, saved opportunities, search and filters, failure states, and the end-to-end workflow. Phase 1 remains OPEN.

## 26. Minimal option contract selection (approved; implemented)

**Scope:** informational selection on the option-chain page only. No order, no paper trade, no recommendation trigger, no change to `strategy.ts`.

**Files**
- `src/lib/optionContractSelection.ts` (new): pure rules. `resolveSelection` returns NONE / MISSING / INVALID / OK. Quantity = lots × lot size only when lot size is a positive integer; otherwise null with a note. Zero premium is shown as no traded price, not as 0. Missing canonical key is shown as "Not provided". Lots limited to whole numbers 1–100.
- `src/lib/optionContractSelection.test.ts` (new): 11 known-answer tests. All pass.
- `src/components/OptionContractPicker.tsx` (new, client): expiry selector limited to backend-supplied expiries; 31-row table with CE and PE premium buttons (independent, `aria-pressed`); contract-details panel; lots input; explicit NONE / MISSING / INVALID / OK states. Changing expiry clears the selection and refetches `/api/option-chain/[index]?expiry=…&range=15`. Lots input stays visible when invalid so the value can be corrected.
- `src/components/SectionViews.tsx`: `OptionChainView` now fetches the expiry list via `withFallback(p => p.getExpiries(index))` and passes the server-rendered chain to the picker, keyed by index so switching symbol remounts it and drops any selection.
- `tests/browser/contract-selection.check.cjs` (new): browser check.

**Data facts found while inspecting**
- `/api/option-chain/[index]` returns per-side `ltp, bid, ask, volume, oi, changeOi, iv, delta, gamma, theta, vega`. It does **not** return `instrumentKey` or `lotSize`. The UI therefore shows instrument key as "Not provided" and lot size as "Unavailable", and never infers them. Quantity is shown as unavailable.
- The default page chain carries `instrumentKey` and `lotSize` on the server snapshot; in mock data these were absent, so the quantity path has not been exercised in a browser run.

**Verification (mock provider, 127.0.0.1:3150, sandboxed dev server, throwaway generated token)**
- `tsc --noEmit`: clean.
- `optionContractSelection.test.ts`: 11/11 pass.
- Browser `contract-selection.check.cjs`: **54 pass, 0 fail** at 1440, 768, 390 for NIFTY and BANK NIFTY. Checks: 31 rows; no default selection; CE and PE selection at two strikes; only one active; invalid lots (0) rejected and input stays editable; lot-size-unavailable shown without quantity; no horizontal overflow; no page errors.
- Backend comparison: UI CE LTP at 24850 = 369.85 and PE = 71.00, matching `/api/option-chain/nifty?range=15` (369.85 / 71).
- Full suite (`npm test`): 2,675 tests, 2,674 pass, 0 fail, 1 skipped (F-R1, the intended blocker).

**Not exercised (say so)**
- Expiry change reset: mock has one expiry per index, so the reset path was not browser-tested. Covered only by reading the code.
- Quantity calculation in the browser: lot size absent in mock data.
- Stale / unavailable provenance states for the picker: rendered from `fallbackMessage` only; no live or stale fixture was run.
- Screenshots written to `.test-data/browser-run/shots/`.

**Bug found and fixed during verification:** the lots input sat inside the OK branch, so entering 0 hid the input and the user could not correct it. Moved outside the branch.

**Server:** dev server on 127.0.0.1:3150 stopped (PID 58647, verified no listener). Operator token file `.test-data/browser-run/token.txt` is a throwaway generated value.

**Phase status:** Phase 1 still OPEN. F-R1 blocker unchanged. Recommendation engine NO-GO unchanged. Backtest and paper-trading routes untouched.

## 27. Contract metadata investigation and the three outstanding selection scenarios

**Metadata finding (root cause, now fixed)**
- The provider chain does carry `lotSize` (`OptionChain.lotSize`) and per-side `instrumentKey` (`Quote.instrumentKey`). The Upstox path sets both from source data.
- `/api/option-chain/[index]` was dropping both: `side()` omitted `instrumentKey`, and the top-level body had no `lotSize`. The picker therefore showed "Not provided" and "Unavailable" for data the backend had.
- Fix: response mapping moved to `src/lib/optionChainPayload.ts` (pure). Route now returns `lotSize` (only a positive whole number, else null) and per-side `instrumentKey` (provider value, else null; never constructed). Picker takes both from the response on expiry change.
- Mock: `mockMarket.ts` now passes the snapshot lot size through (NIFTY 65, BANK NIFTY 30, MOCK-labelled) and offers a second synthetic weekly expiry (+7 days) so the expiry switch can be exercised. Rows for that expiry are the same synthetic chain relabelled, source remains MOCK.

**Tests**
- `src/lib/optionChainPayload.test.ts` (new): 5 tests. Key pass-through; missing key stays null; lot size only when positive whole number; ATM nearest spot and empty-chain null; ATM ± range window with per-side premium and key.
- `npx tsc --noEmit`: clean.
- Full suite: 2,680 tests, 2,679 pass, 0 fail, 1 skipped (F-R1).

**Browser scenarios** (`tests/browser/contract-scenarios.check.cjs`, new): **26 pass, 0 fail** at 1440 and 390.
- Metadata: lot size 65 and instrument key `MOCK_FO|…` shown from backend data.
- Quantity: 3 lots × 65 = 195.
- Expiry change: selection cleared, no pressed state, 31 rows, then a new selection shows the new expiry.
- Stale: a fallback message from the backend is displayed. **Note:** this case, and the error case below, change only the browser's copy of the response (`route.fulfill`). They test UI handling, not real provenance.
- Error: HTTP 500 for the next expiry shows "Could not load expiry … Nothing is selected", and the previous chain stays on screen.
- No horizontal overflow; no page errors.

**Backend comparison:** `/api/option-chain/nifty?range=15` returns lotSize 65, CE key `MOCK_FO|MOCK24850CE`, CE LTP 360.8, matching the UI.

**Not covered**
- **Missing-contract (MISSING) state is not reachable through the UI.** Changing expiry clears the selection, and the chain for a given expiry does not change while selected, so a selected strike cannot disappear. The state exists in the rules and tests (`resolveSelection` → MISSING) but there is no browser path to it. Left as is.
- Quantity and key on the real Upstox path: not run (no live requests permitted). Verified by code and unit tests only.

**Status of the recommended next steps:** the six Phase 1 items (charts and indicators; breadth and structure; saved opportunities; search, filters and tabs; loading, stale, empty and error states; full login-to-logout workflow) were **not started** in this session. Each needs its own inspection and browser verification. Starting point: charts and indicators.

**Server:** dev server on 127.0.0.1:3150 stopped; port verified free.

**Standing restrictions unchanged:** Strategy 11.4 frozen; F-R1 unresolved; holdout sealed; recommendation engine NO-GO; Phase 1 open; backtest and paper-trading routes untouched; no live Upstox or NSE requests.

**Selection remains informational:** a selected contract is not an executable trade specification. Instrument key and lot size are shown as provided; no entry, stop, target, or risk figures are derived from a selection.

## 28. Charts and technical indicators (in progress; mock consistency resolved)

**Status: not marked complete.** Chart and card values agree in mock. Live-provider verification is not possible under the current restrictions, and remaining Phase 1 items are not started.

**Before this section**
- Dashboard price chart (`src/components/PriceChart.tsx`) drew close, EMA 9/21 and VWAP from `/api/technical/[index]`. It showed only a raw source label, no status badge, and no indicator values beyond the chart lines.
- Technicals cards (`MarketCard`, `dashboard.ts`) read `analysis ?? snapshot.indicators`.
- Mock provider `getTechnicals` returned `analysis: null`, so the chart route returned no indicators in mock while the cards showed snapshot values. This was the inconsistency.
- Snapshot `indicators.atr` is **daily** ATR (per the `Indicators` type). The cards map it to `atrDaily`.

**Implemented**
- `src/lib/technicalDisplay.ts` (new, pure): null → "N/A" (never 0); status badge mapping (LIVE / STALE / END OF DAY / UNAVAILABLE; mock with no freshness → "MOCK DATA · NOT LIVE"; never LIVE); indicator groups from the response only: EMA 9/21/50/200, RSI 14 with state, MACD / signal / histogram, ATR 14 (candles), ATR %, daily ATR, spot VWAP (with index-has-no-volume note), futures VWAP / price / distance, previous-day levels, opening range.
- `PriceChart.tsx`: header shows index, timeframe and status badge; footer shows source, last candle time and fetch time; indicator grid under the chart with null shown as N/A.
- `src/lib/services/mockMarket.ts`: `mockTechnicalAnalysis()` derives the chart analysis **only** from the same snapshot indicators the cards read. Timeframe 15m only (the snapshot is 15m). Snapshot `atr` → `dailyAtr`, not 15m ATR. Values the snapshot lacks (MACD signal, 15m ATR, candles, trend, price action, spot VWAP) stay null. Snapshot spot-VWAP `vwap` is **not** relabelled as spot VWAP (see limitations).
- `src/lib/services/market.ts` `buildSnapshot`: `snapshot.technical` stays **null for mock** so the recommendation engine input is unchanged (`analysis.ts` and `strategy.ts` read `snapshot.technical`). Live provider behaviour is unchanged.
- `src/components/MarketCard.tsx`: null-safe trend read (`t?.trend`), falling back to the engine factor as before. Needed because the chart analysis carries no trend in mock.

**Tests**
- `src/lib/technicalDisplay.test.ts`: 9 tests (null vs 0, digits, EMA 200 N/A, VWAP notes, futures rows, status labels, mock never LIVE, unknown never LIVE, hasAnyIndicator).
- `src/lib/services/mockTechnicals.test.ts`: 5 tests (NIFTY values carried, daily ATR mapping, unsupplied values null, BANK NIFTY separate, non-15m null).
- `npx tsc --noEmit`: clean.
- Full suite: **2,694 tests, 2,693 pass, 0 fail, 1 skipped** (F-R1).
- One failure appeared on an earlier run (test 21 in `technical.test.ts`) because snapshot.technical became non-null in mock. Fixed by keeping snapshot.technical null for mock; test 21 passes unchanged.

**Browser verification** (`tests/browser/technical-chart.check.cjs`, new): **99 pass, 0 fail** at 1440, 768 and 390 px.
- Mock, no fixture: header shows MOCK DATA · NOT LIVE; price line shows "Technical data: NOT AVAILABLE" (no candles, by design).
- Mock NIFTY: chart EMA 9 = 25,090.00, EMA 200 = 24,610.00, RSI 14 = 61.4, MACD histogram = 6.20, daily ATR = 182.00, ATR 14 (candles) = N/A, previous-day high = 25,064, MACD signal = N/A. Cards show the same EMA 9/21 (25,090 / 25,045).
- Mock BANK NIFTY (switched): chart EMA 9 = 56,280.00, RSI 14 = 47.2; cards show 56,280 / 56,310; still MOCK, never LIVE.
- Fixture-driven (test fixtures served in the browser only, labelled in the script): LIVE rendering, STALE badge, HTTP 500 → "Request failed" with no numbers, loading state, BANK NIFTY request for `timeframe=15m` and its own values, no horizontal overflow, no page errors.
- Real mock API response checked with curl: `/api/technical/nifty?timeframe=15m` returns the values above, and the UI matches.

**Value comparisons**
- Chart indicator grid vs mock snapshot vs cards: EMA 9/21/50/200, RSI 14, MACD histogram, daily ATR, previous-day high all match for NIFTY and BANK NIFTY (mock).
- LIVE values were compared against test fixtures, **not** against a live backend. Live comparison is not possible under the restrictions.

**Known limitations**
- **Spot VWAP:** the cards show "VWAP 25,071" from the snapshot `vwap`. Real index analysis has no spot VWAP (no volume), so the chart shows "N/A — index carries no volume". The card value cannot be confirmed as spot or futures from the snapshot alone. Recommend relabelling or removing it. Not changed in this pass.
- **Mock price line:** mock has no candles (by design, no fabricated history), so the price chart is "not available" in mock. Only the indicator grid shows values in mock.
- **Mock timeframe:** mock indicators exist for 15m only; other timeframes show N/A.
- **Trend:** the chart analysis has no trend in mock. The card keeps its engine-factor fallback.
- **Live path:** not run (no live requests). The live status logic and candle classification are unchanged.

**Remaining Phase 1 work (not started):** market breadth and structure; saved opportunities; search, filters and tabs; loading, stale, empty and error states across the app; full login-to-logout workflow and frontend/backend consistency; resolution of the spot-VWAP label question above.

**Server:** dev server on 127.0.0.1:3150 stopped; port verified free.

**Standing restrictions unchanged:** Strategy 11.4 frozen; F-R1 unresolved; P1 rejected; holdout sealed; recommendation engine NO-GO; no live Upstox/NSE requests; no orders, paper trading, backtests or deployment.

## 29. Final VWAP clarification and feature close

**Trace of the snapshot `indicators.vwap` value**
- **Mock:** `src/lib/services/mock.ts` holds literal numbers (NIFTY `vwap: 25071`, BANK NIFTY `vwap: 56300`). No instrument, no candles, no calculation. **Provenance: none.** It is not futures VWAP.
- **Live (Upstox):** `indicators` come from `toIndicators(analysis)` (`src/lib/services/technicalMapping.ts`), which copies `analysis.vwap`. `analysis.vwap` is session VWAP from candle volume (`technicalAnalysis.ts` `vwap()`), which returns null when volume is missing. Index candles carry no volume, so **live index `vwap` is always null by construction**. Futures VWAP is a separate object (`futuresVwap`) and is labelled as futures.

**Verdict:** the mock literal could not be verified, so it is no longer shown as VWAP. Spot VWAP for index data is unavailable, as the live code path confirms.

**Changes (display only)**
- `src/components/MarketCard.tsx`: the VWAP stat is now "Spot VWAP", taken from the analysis only. It shows "N/A (index has no volume)" when null. The snapshot literal is not read here any more.
- `src/lib/dashboard.ts`: `technicals.vwap = t?.vwap ?? null` (the snapshot fallback is removed). Dashboard view only.
- Futures VWAP labels were already explicit and are unchanged.
- No value was invented or recalculated. Mock and live chart output are unchanged.

**Engine input, not changed (open item)**
- `src/lib/engine/analysis.ts` (lines 99–104) still reads `snapshot.indicators.vwap`. In mock mode it scores "Price above/below VWAP" from the mock literal. Live is unaffected: the value is null, so the engine uses the futures-VWAP state or "VWAP unavailable".
- Per your instruction the engine input is not changed. **Decision needed:** remove the mock vwap literal (changes mock recommendation output) or keep it and accept the mock-only scoring. Recommended: remove it in a separate, reviewed change, then re-verify mock recommendations.

**Tests**
- `src/lib/dashboard.vwap.test.ts` (new): 2 tests. NIFTY and BANK NIFTY dashboard views show spot VWAP as null even though the mock snapshot holds a literal.
- `npx tsc --noEmit`: clean.
- Full suite: **2,696 tests, 2,695 pass, 0 fail, 1 skipped** (F-R1).

**Browser verification**
- Mock dashboard: `25,071` and `56,300` do not appear. "Spot VWAP — Index candles carry no volume — N/A" is shown.
- Chart check (`tests/browser/technical-chart.check.cjs`): **99 pass, 0 fail** at 1440, 768 and 390 px. Unchanged by this step.

**Charts and indicators feature: closed for display and provenance**
- Chart, cards and API agree in mock for EMA 9/21/50/200, RSI 14, MACD histogram, daily ATR and levels. Spot VWAP is N/A for indices. Futures VWAP is labelled futures. Mock is labelled MOCK, never LIVE.
- Still open and outside this feature: the engine's use of the mock vwap literal (above). Live provider values were not verified against a live backend, as live requests are not permitted.

**Server:** dev server on 127.0.0.1:3150 stopped; port verified free.

**Standing restrictions unchanged:** Strategy 11.4 frozen; F-R1 unresolved; P1 rejected; holdout sealed; recommendation engine NO-GO; no live calls, orders, paper trading, backtests or deployment.

## 30. Removal of the unsupported mock VWAP engine input (approved, separate change)

**Change (exact)**
- `src/lib/services/mock.ts`: NIFTY `vwap: 25071` → `vwap: null`; BANK NIFTY `vwap: 56300` → `vwap: null`. A comment states that spot VWAP is unavailable for index candles and the former literal had no provenance. Every other mock indicator is unchanged.
- No change to `src/lib/engine/analysis.ts`. It already excludes a null VWAP: `vwapD` is null, the direction averages RSI and MACD only, and the note has sign 0. No change to `strategy.ts` (frozen). Its SHA-256 is printed in the verification step below. No threshold, weight or decision rule was touched.
- `src/lib/dashboard.vwap.test.ts` updated: it previously asserted the literal existed; it now asserts null (the stale assertion was the only failure in the first run).

**Before and after (mock, full analysis object diffed)** — `analyze(mockSnapshot(...))`, captured to `scratchpad/analysis-before.json` and `analysis-after.json`; the diff is 60 lines and contains only the changes below.

| Output | NIFTY before → after | BANK NIFTY before → after |
|---|---|---|
| `snapshot.indicators.vwap` | 25071 → null | 56300 → null |
| Technical factor direction | 0.920 → 0.880 | −0.729 → −0.593 |
| Technical factor score | 14.4 → 14.1 | 13 → 12 |
| VWAP note | "Price above VWAP", sign +1 → "VWAP unavailable…", sign 0 | "Price below VWAP", sign +1 → "VWAP unavailable…", sign 0 |
| Market direction | 0.741 → 0.734 | −0.225 → −0.202 |
| Market total | 86 → 86 | 63 → 62 |
| Status | TRADE → TRADE | WAIT → WAIT |
| Long Call / Long Put score | 86 → 86 | 63 → 62 |
| Bull / Bear Put Spread score | 83 → 83 | 60 → 59 |
| Blockers | 0 → 0 | 3 → 3 |
| Message | — | "Best strategy score 60 is below the 65 threshold" → "…59…" |

- **Caused specifically by removing the input:** every change above. Nothing else in the output differs.
- **BANK NIFTY still does not reach TRADE** (WAIT, three blockers, below the 65 threshold both before and after).
- **NIFTY remains TRADE** with its existing risk-blocked candidates, as before. Its total score is unchanged because the factor change rounds to the same total.

**Note-sign explanation (not a defect):** `analysis.ts` flips each note's sign toward the dominant side (`sideSign`). For the bearish BANK NIFTY call, "price below VWAP" therefore carries +1, meaning it supports the call. This was already the case before the change.

**Tests**
- `src/lib/engine/vwapNullInput.test.ts` (new, 5 tests): null VWAP gives the direction of RSI and MACD only (exact expected value for mock NIFTY); null is not zero (a numeric 0 changes the result); the null note has sign 0 and says unavailable; a present VWAP still scores; futures state does not substitute for null spot VWAP. **Limit:** the last test uses null futures state on both sides, so it is weaker than its name suggests. The engine does use the futures state as a separate, labelled input when it exists, which is existing live design and is not spot substitution.
- `src/lib/dashboard.vwap.test.ts` (updated, 2 tests).
- `npx tsc --noEmit`: exit 0.
- Full suite: **2,701 tests, 2,700 pass, 0 fail, 1 skipped** (F-R1).

**Live path**
- No live request was made. The live analysis path is covered by existing fixtures and unit tests in the full suite, which all pass. Live index VWAP was already null by construction (no index volume), so the live output is unchanged by this edit.

**Display**
- Mock dashboard after the change: `25,071` and `56,300` absent; "Spot VWAP — Index candles carry no volume — N/A" shown; futures VWAP N/A in mock.
- Chart check (`tests/browser/technical-chart.check.cjs`): **99 pass, 0 fail** at 1440, 768 and 390 px.

**Frozen strategy**
- `src/lib/engine/strategy.ts` unchanged; SHA-256 recorded in the verification step (must equal the value recorded at the start of the project: `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18`).

**Restrictions:** F-R1 unresolved; P1 rejected; holdout sealed; recommendation engine NO-GO; no live requests, orders, paper trades, backtests or deployment. Dev server on 127.0.0.1:3150 stopped; port verified free.

## 31. Market breadth and structure (in progress; decision pending)

**Inspected**
- `src/lib/services/breadthService.ts`: `calculateBreadth` uses a strict ±0.05% neutral band, a coverage floor of 80%, and per-quote freshness (150 s window). Rules checked; no change needed.
- `GET /api/breadth/[index]` returns the snapshot breadth with a fallback label. The card (`MarketCard.tsx`) shows advances/declines/unchanged, A/D ratio, breadth %, classification, price-versus-breadth state and coverage. The badge uses the source, so mock shows MOCK.

**Defect found (provenance)**
- `calculateBreadth` sets `status = "LIVE"` for MOCK sources whenever coverage is 100%. The API therefore returns `status: "LIVE"` with `source: "MOCK"` for both indices. Observed on the mock server: NIFTY 34/14/2 of 50, BANK NIFTY 4/10/0 of 14, both `status: LIVE`, `source: MOCK`.
- The UI badge is correct, so this is an API-level contradiction of the "MOCK never LIVE" rule.

**Engine coupling (why this needs a decision)**
- `src/lib/engine/analysis.ts` (line 161) counts breadth as evidence only when `status` is LIVE or PARTIAL. In mock mode, synthetic breadth therefore feeds the mock recommendation. Changing the status changes mock recommendation output.

**Options**
- **A (favourite): report mock breadth as status `MOCK`.** Add a MOCK status value, so the API matches the rule. Mock breadth then drops out of the engine (mock output changes; documented with a before/after diff as in section 30). Live LIVE/PARTIAL paths are untouched.
- **B: keep `LIVE` for the engine and only change the API label.** Keeps mock output unchanged but leaves an internal inconsistency that the engine still relies on.
- **C: leave as is and document it.** No code change; the defect stays visible in the API.

**Decision needed:** reply "proceed A", "proceed B" or "proceed C". I will not change the engine input until you choose.

**Restrictions:** no live requests; strategy 11.4 frozen; F-R1 unresolved; P1 rejected; holdout sealed; recommendation engine NO-GO. Dev server stopped; port 3150 verified free.

## 32. Market breadth: option A applied (mock breadth labelled MOCK)

**Decision applied:** option A (you approved "proceed A"). Mock breadth is reported as status `MOCK`, never `LIVE` or `PARTIAL`.

**Change, scoped to the mock provider**
- `src/lib/types.ts`: `MarketBreadth.status` gains `"MOCK"`.
- `src/lib/services/breadthService.ts`: new `asMockBreadth(b)`. LIVE or PARTIAL becomes MOCK with the reason "Mock constituent quotes (not live market data)". UNAVAILABLE is not relabelled. `calculateBreadth` itself is unchanged.
- `src/lib/services/mock.ts`: both mock breadth calls (NIFTY, BANK NIFTY) wrap their result in `asMockBreadth`.
- **Why scoped this way:** my first version changed `calculateBreadth`, which also feeds `backtestSnapshot.ts`. Every backtest labels its breadth source MOCK, even when it is rebuilt from real historical bars, so that version would have changed backtest results. It was reverted before the suite was run. Backtest output is unchanged.

**Test updates (test code only)**
- `src/lib/testFixtures/mockSnapshotLegacyBreadth.ts` (new, test-only): reproduces the pre-change LIVE breadth (reason null, source still MOCK) so engine tests keep their meaning.
- 17 test files import it under the existing name (`mockSnapshotLegacyBreadth as mockSnapshot`).
- `src/lib/services/multiSessionPaperEvaluation.test.ts`: one fallback analysis uses the same legacy breadth shape (helper `legacyBreadth`).
- `src/lib/services/breadthMockStatus.test.ts` (new, 6 tests): mock labelling at full and partial coverage; UNAVAILABLE not relabelled; `calculateBreadth` unchanged for MOCK-labelled calls (backtest-compatible); mock snapshots MOCK for both indices; engine breadth factor unavailable for MOCK.

**Effect on mock recommendations (the cost of option A, documented)**
- The engine counts breadth only when it is LIVE or PARTIAL. Mock breadth is now excluded, so the engine reports "Breadth / confirmation unavailable" and builds no candidates.

| Mock output | Before (after VWAP removal) | After |
|---|---|---|
| NIFTY status / total | TRADE / 86 | NO TRADE / 79 |
| BANK NIFTY status / total | WAIT / 62 | NO TRADE / 52 |
| Breadth factor | available | unavailable |

- Blocker text: NIFTY "Not enough comparable data to trade: Breadth / confirmation unavailable"; BANK NIFTY the same plus the news-conflict blocker.
- The full analysis object was diffed and captured in the scratchpad (`analysis-pre-breadth.json` and `analysis-final.json`). Outputs are identical to the earlier post-change run.
- Strategy 11.4 (`strategy.ts`) was not edited.

**Verification**
- Breadth API on the mock server: NIFTY `status: MOCK`, `source: MOCK`, 34 / 14 advances and declines (reason set). BANK NIFTY `status: MOCK`, 4 / 10.
- Dashboard card: "MARKET BREADTH | MOCK | Prices: MOCK (MOCK)", no LIVE label, no page errors.
- `npx tsc --noEmit`: exit 0.
- Full suite: **2,706 tests, 2,706 pass, 0 fail, 1 skipped** (F-R1).

**Not done / open decision**
- **Backtest breadth labelling (decision needed).** `backtestSnapshot.ts` labels reconstructed breadth from real historical bars with source `MOCK`, so it still reports LIVE status and feeds the backtest engine. This is an existing labelling inconsistency, not part of option A. Options: (1) leave as is and document; (2) label backtest breadth from its real origin (historical) and keep it counted; (3) label it MOCK and accept changed backtest outputs. **My favourite: (2)**, because the data is real historical bars. It changes research labels, so I have not made the change.
- The 17-file test fixture is a maintenance cost; it can be retired when the mock snapshot gets a proper test helper.

**Restrictions:** no live requests; strategy 11.4 frozen; F-R1 unresolved; P1 rejected; holdout sealed; recommendation engine NO-GO. Dev server stopped; port 3150 verified free.

## 33. Backtest breadth labelling (option 2): investigated, not applied

**Finding:** `src/lib/backtestSnapshot.ts` labels every subsystem of a historical snapshot MOCK (market, option chain, technical, news, breadth). Its own comment says this is deliberate, so the engine scores them together. The breadth fed to the engine comes from real historical constituent bars when present (`hist.breadthQuotes`); the synthetic fallback applies only without history.

**Why option 2 is not a label-only change**
- `DataSource` (`src/lib/types.ts`) has no historical value (`LIVE | MOCK | END_OF_DAY | STALE | UNAVAILABLE`).
- Passing a non-MOCK label into `calculateBreadth` takes the freshness path. Historical quotes would be classified STALE or END_OF_DAY, and the engine would then drop breadth from every backtest. That changes research output.
- Keeping breadth counted therefore needs a status the engine accepts. Relabelling the status as HISTORICAL requires an engine rule change (`analysis.ts` counts LIVE and PARTIAL only). That is an analysis-logic change, so it needs your approval.
- A label-only change (source HISTORICAL, status still LIVE) would leave a LIVE status on historical data. I'm not doing that.

**Options (revised)**
- **2a (favourite): add HISTORICAL as a source and status; let the engine count HISTORICAL breadth only when the input is real historical bars.** Live and mock behaviour are unchanged. Backtest outputs are unchanged (verified by a before-and-after run). Touches `types.ts`, `breadthService.ts`, `backtestSnapshot.ts`, `analysis.ts` (one gate), and the provenance labels.
- **2b:** keep the current MOCK label for backtests and document it as a known limitation.
- **2c:** label backtest breadth MOCK and accept the changed backtest output. This is the most honest about the source but changes research results.

**Decision needed:** reply "proceed 2a", "proceed 2b" or "proceed 2c". Nothing in code has changed for this item.

**Restrictions:** no live requests; strategy 11.4 frozen; F-R1 unresolved; P1 rejected; holdout sealed; recommendation engine NO-GO.

## 34. Option 2a attempted and reverted; state after reversal

**What was tried:** a HISTORICAL source and status for backtest breadth built from real bars, with the engine counting it.

**Why it failed:** `src/lib/engine/analysis.ts` (around line 211) counts a factor only when its source equals the market-data source (`src === base`). This is deliberate: live prices are never scored with other kinds of data. With breadth HISTORICAL and market MOCK, the breadth factor was excluded, and five backtest tests failed (no trades from the fixture). An isolation experiment confirmed the source label was the cause: reverting only the label made the test pass.

**Consequence:** 2a cannot change breadth alone. It requires relabelling every backtest subsystem (market, option chain, technical, news, breadth) as HISTORICAL, which changes the mock-input guard and how backtest data is treated elsewhere. That is a broader decision.

**Reverted:** all 2a edits (types, ranking, dashboard cast, breadth service, engine gate, backtest snapshot). Verified: `tsc --noEmit` exit 0; full suite **2,707 tests, 2,706 pass, 0 fail, 1 skipped** (F-R1).

**Options now**
- **2b (recommended):** keep backtest labels as MOCK and document the limitation. Backtests are research only and do not reach the recommendation path.
- **2a-full:** relabel all backtest subsystems HISTORICAL, add the engine rule, and re-verify research outputs. Larger change; decide when research is reopened.

**Restrictions:** no live requests; strategy 11.4 frozen; F-R1 unresolved; P1 rejected; holdout sealed; recommendation engine NO-GO.

## 35. Option 2b applied: backtest breadth labelling documented as a known limitation

**Decision:** 2b. Backtest snapshots keep the MOCK source label on every subsystem, including breadth rebuilt from real historical bars. No code change.

**Why:** the engine counts a factor only when its source matches the market source (`analysis.ts`). Relabelling breadth alone excludes it; relabelling everything (2a-full) changes how backtest data is treated. Backtests are research only and do not reach the recommendation path.

**Limitation to carry forward:** research reports that describe backtest breadth must say it is reconstructed from real historical constituent bars, labelled MOCK in the snapshot. Do not present backtest breadth as live. The comment at `src/lib/backtestSnapshot.ts` already states that every subsystem shares the label.

**Verification:** no code changed in this step. Full suite last run: **2,707 tests, 2,706 pass, 0 fail, 1 skipped** (F-R1).

**Restrictions:** no live requests; strategy 11.4 frozen; F-R1 unresolved; P1 rejected; holdout sealed; recommendation engine NO-GO.

## 36. Estimate to make the application work

Estimates are in working sessions and assume you answer decisions promptly.

| Stage | Work | Sessions |
|---|---|---|
| A. Local mock app works end to end | Saved opportunities; search, filters and tabs; loading, stale, empty and error sweep; login-to-logout check; retire the legacy test fixture | 4–5 |
| B. Live data works (read-only) | BSE quote key (needs your approval for one live request); verify the live Upstox path against fixtures and, with approval, one controlled request | 2–3 |
| C. Safe to expose beyond localhost | Protect backtest and paper-trading routes; durable session store and per-user operator access; validate and enforce CSP; remove `X-Powered-By` (needs authorisation) | 3–4 |
| D. Recommendations you can trust | F-R1 strategy review (needs your explicit authorisation); validated evidence for a GO decision | Not estimable; depends on evidence, not coding |

- **Local app working: about 4–5 sessions.**
- **Live read-only data: about 6–8 sessions in total.**
- **Safe to expose: about 9–12 sessions in total.**
- **Recommendation engine GO:** cannot be scheduled. It needs a strategy review and validated out-of-sample evidence, and the project's protocols currently show no validated edge. Until that exists, the app should stay a decision-support tool showing NO TRADE for most conditions.

**My recommendation:** finish stage A first. It gives you a complete, honest local product, and it needs no live access or approvals. Next, decide stage B approvals.

Reply "proceed A" to start the saved opportunities work.

## 37. Stage A progress: saved picks completed; other stage A items open

**Completed**
- `src/lib/savedPickFilter.ts` (new, pure): text search over instrument and note; type, source and validation filters (AND); newest-first sort; distinct values for filter menus. Filtering only hides rows and never changes a pick's status or source. Tests: `src/lib/savedPickFilter.test.ts`, 6 tests, all pass.
- `src/app/saved-picks/page.tsx` rebuilt on the helper: loading state, empty state, no-match state, load-failure alert, filter bar with clear, count line, per-row delete labels, table in a positioned scroll box. Same API calls and the same error wording as the protected test `a11yLabels.test.ts` (that file was not edited).
- Layout defect fixed: at 390 px the page was 257 px wider than the viewport. Cause: the screen-reader-only "Actions" label is absolutely positioned and had no positioned ancestor, so it measured against the page. Fix: the scroll wrapper is `relative`.
- Browser check `tests/browser/saved-picks.check.cjs` (new): **39 pass, 0 fail** at 1440, 768 and 390 px, on an isolated server (scratch picks file, port 3125, since removed). Covers empty state, save of stock, MOCK and LIVE picks, MOCK labelled NOT VALIDATED, search, type filter, no-match state, clear filters, load failure, delete and persistence after reload, no horizontal overflow, no page errors. Chrome was driven from the installed Google Chrome (`CHROME_PATH`) because the Playwright browser cache was empty; no download was made.
- Full suite: **2,713 tests, 2,712 pass, 0 fail, 1 skipped** (F-R1). `tsc --noEmit`: exit 0.

**Still open in stage A (not started)**
1. Search, filters and tabs across the other list views (opportunities and journal tabs).
2. Loading, stale, empty and error state sweep across the dashboard pages (the saved-picks page is done).
3. Full login-to-logout workflow check and frontend/backend consistency.
4. Retire the legacy mock-breadth test fixture (`src/lib/testFixtures/mockSnapshotLegacyBreadth.ts`, used by 17 test files) once those tests use proper LIVE fixtures.

**Restrictions:** no live requests; strategy 11.4 frozen; F-R1 unresolved; P1 rejected; holdout sealed; recommendation engine NO-GO. Backtest and paper-trading routes untouched. Isolated server stopped; port 3125 verified free.

## 38. Stage B (blocked) and Stage C step 1 (protected routes)

**Stage B: blocked, approved request not used.** The stored Upstox token expired on 2026-11-03 (checked by expiry field only; no secret printed). A live request now would return an authorisation error and would not resolve the BSE SENSEX/BANKEX quote key. Refreshing the token needs an interactive login, which the rules reserve for the owner. The approved request is therefore not spent. Next step for the owner: generate a fresh token with the existing login script, then approve the one request again.

**Stage C step 1: protected backtest and paper-trading APIs (approved).**
- `src/lib/protectedApi.ts` (new): matcher for `/api/backtest/*`, `/api/paper-opportunities/*`, `/api/paper-trading/*`, and `/api/recommendations/<id>/paper-trade`. Login, logout, status, health and ordinary routes stay open.
- `src/proxy.ts`: one gate in front of these paths using the existing `requireOperator` check (operator session cookie or bearer token). Unauthenticated requests get HTTP 401 before any handler runs. Handlers are unchanged.
- Tests: `src/lib/protectedApi.test.ts` (3 tests) pass.
- Live check (mock server, GET only, read-only): `/api/backtest/runs`, `/api/paper-trading/portfolio` and `/api/paper-opportunities` return 401 without auth and 200 with the bearer token. `/api/auth/status` and `/api/breadth/nifty` stay 200 without auth.
- Login-to-logout browser check still 34 of 34 pass.
- Full suite: **2,716 tests, 2,715 pass, 0 fail, 1 skipped** (F-R1). Type-check exit 0.

**Remaining stage C items:** durable sessions and per-user operator access; CSP validation and enforcement; `X-Powered-By` removal (needs separate authorisation for `next.config.ts`). Not started in this step.

**Token and data safety:** the real `.data/upstox-token.json` is unchanged (502 bytes, same timestamp). The test server is stopped; port 3150 verified free.

## 39. Operator PIN sign-in, refresh button, Upstox verification

**Upstox verification (one approved live check):** `UPSTOX_CONNECTED`, credential source OAUTH, token valid until 2026-11-11 22:00 UTC. The "Not Verified" banner was from before this check.

**Stale data explained:** the NIFTY option chain was fetched at 09:59 UTC today (15:29 IST). It is marked STALE because the Upstox chain response carries no trade timestamp, and the freshness rule treats a missing timestamp as stale. The rule was not changed. "20 October / 30 October" dates come from stored collection files, not live feeds.

**News UNAVAILABLE:** external news is disabled by configuration (`NEWS_EXTERNAL_ENABLED` not set). Enabling it makes external requests and needs owner approval.

**Changes**
- PIN sign-in: `src/lib/operatorPin.ts` (salted scrypt hash, 6 digits, 5 failures lock for 15 minutes). Setup: `node --experimental-strip-types scripts/operator-pin.ts` (one time, refuses to overwrite). Change PIN: `/change-pin` page and `POST /api/auth/change-pin` (needs a signed-in session and the current PIN).
- Sign-in form takes the PIN. Tests: `operatorPin.test.ts` (11 pass).
- Session-first gate: `requireOperator` accepts a valid signed-in session without needing `OPERATOR_TOKEN`. This fixed a 503 on logout and on protected routes after the PIN change. Bearer scripts still work when `OPERATOR_TOKEN` is set.
- Upstox OAuth start: `GET /api/auth/upstox/start` (the login script previously opened the operator endpoint, which returns 405 in a browser).
- `npm run dev:upstox` reads `.env.upstox` (two keys only) before the collection guard, so no extra exports are needed. The guard still runs.
- Refresh button: "Refresh data" in the data status banner re-runs the dashboard data loading (prices, option chain, technicals, breadth, news).
- Tests: full suite **2,726 pass, 0 fail, 1 skipped**. Browser: login 34/34, refresh 6/6 on the test server.

**Open decisions**
1. **Sign-out deletes the Upstox login file** (`clearToken()` in the logout route). Every sign-out therefore removes your Upstox connection. Recommended: sign-out clears only the app session. Needs your approval.
2. **News**: enable external news only with approval.
3. **Option-chain STALE label**: recommended to keep, and to add a per-trade timestamp mapping only after checking the Upstox response fields.

**Action for you:** restart `npm run dev:upstox` (the running server predates these changes), and set your PIN once with `node --experimental-strip-types scripts/operator-pin.ts`.

## 40. Approved follow-ups: sign-out, news, BSE probe, durable sessions

- **Sign-out:** ends only the app session. `POST /api/auth/logout` no longer calls `clearToken()`, so the Upstox login is kept. Response is `{ ok: true }`.
- **News:** `NEWS_EXTERNAL_ENABLED=true` is set in `.env.upstox` (applies to `npm run dev:upstox` only). External news still requires a restart of `dev:upstox` to take effect.
- **BSE SENSEX quote key (one approved request used):** the alternative form `BSE_INDEX|Sensex` returned HTTP 200 with no invalid-key error, but **no quote data** for the key. The key is not confirmed. Index quotes for BSE may not be available on this endpoint; stored historical bars remain the source for SENSEX/BANKEX. No further request was made.
- **Verification:** Upstox connected via OAuth (checked earlier); token file has `invalidatedAt: null`. The "Not Verified" banner comes from the unverified state after login, cleared by the next live verification.
- **Strategy:** `src/lib/engine/strategy.ts` SHA-256 matches the recorded hash (`d0170b40…`). F-R1 test remains skipped (blocker unchanged).
- **Durable sessions:** operator sessions are stored in `.data/operator-sessions.json` (owner-only permissions), with only a SHA-256 hash of each session id. Verified: signed in, restarted the test server, and the session still returned HTTP 200. Auth tests use a temporary session file; none is left in `.data`.
- **Tests:** full suite **2,727 tests, 2,726 pass, 0 fail, 1 skipped** (F-R1). Type-check exit 0. Operator auth tests 22/22.

**Still open (stage C):**
- Content-Security-Policy enforcement: report-only measurement exists; enforcement needs a complete validated policy (style violations from the chart library are documented). Not enforced.
- Removing `X-Powered-By`: still needs your separate authorisation for `next.config.ts`.

## 41. Recommendations taken

- **Option-chain freshness rule:** kept as is. The Upstox chain has no per-trade timestamp, so chains show STALE. Unchanged.
- **Live verification (one approved check):** `VERIFIED_CONNECTED`, connection `UPSTOX_CONNECTED`, credential source OAUTH, valid until 2026-11-11 22:00 UTC.
- **Content security policy:** enforcement stays OFF. Next step is measurement in report-only mode only, not enforcement.
- **Recommendation engine:** NO-GO unchanged. Needs F-R1 authorisation and validated evidence.

## 42. Content security policy measurement (production build, report-only)

- Dev-mode measurement is not valid: development injects its own inline styles (297 style events on every page, including sign-in). Discarded.
- Production build (`NEXT_DIST_DIR=.next-csp-prod`, built offline), served with the report-only nonce policy, 13 pages checked: `/`, `/saved-picks`, `/option-chain` (NIFTY and BANK NIFTY), `/recommendations`, `/strategies`, `/change-pin`, `/opportunities`, `/stock-v2`, `/options-research`, `/market-history`, `/strategy-evidence`, `/performance`.
- Result: **script violations 0**. **Style violations 2**, both on `/stock-v2`, `style-src-elem | inline`, from the chart library's injected logo style (known since the earlier session).
- Recommendation for enforcement (owner decision): enforce the policy with `style-src-elem 'unsafe-inline'` only, keeping scripts nonce-only. Alternative: remove the chart's logo style. Enforcement is still OFF until you decide.

## 43. Configuration-driven values (frontend and backend)

**Done**
- `src/lib/uiConfig.ts` (new): index options from the instrument registry; chart timeframes; history intervals; backtest defaults (capital and risk from the risk configuration; slippage 1%); default date range = last 12 months ending today.
- Price chart and backtest form use the registry index list and shared timeframes. The backtest form's dates are computed, not typed in.
- `src/lib/services/upstoxEndpoints.ts` (new): one definition of the Upstox API host. Used by the auth module, market adapter, historical options adapter, and three collection scripts. Not an environment setting, so a wrong variable cannot redirect requests to another host.
- Safety test SAFETY-03 now recognises the shared constant. Its rule is unchanged: only the OAuth exchange may POST to Upstox.

**Verified**
- Type-check exit 0. Full suite **2,727 tests, 2,726 pass, 0 fail, 1 skipped** (F-R1).
- Browser (test server): backtest form lists six indices, four timeframes, date range from today, capital 100,000; chart index buttons present; no page errors.

**Left as they are (and why)**
- Shell script `scripts/run-paper-supervisor.sh` and the launch agent `scripts/com.upstox.paperlive.plist` still write port 3123. The shell script and launch agent cannot read the TypeScript modules, and the launch agent is in the protected set. Changing them needs your authorisation.
- `scripts/upstox-discovery.mjs` and `scripts/options-research-inventory.ts` still write the Upstox host literally (same value). Can be switched to the shared constant on request.
- Mock market data, frozen strategy constants, and label text are unchanged by design.

**Stage work in parallel:** the content security policy measurement (production build, 13 pages) is recorded in section 42. Enforcement stays off until you decide.

## 44. Stages B, C and D: owner recommendations applied

- **Stage B (live read-only):** BSE SENSEX/BANKEX quote key skipped by decision; SENSEX and BANKEX use stored historical data. Upstox connected via OAuth and verified earlier. Option-chain STALE label kept by decision.
- **Stage C (exposure safety):** content security policy **enforced** (production build, 19 pages load, 0 violations on 13 measured pages). Policy allows inline styles for styles only (`style-src-elem 'unsafe-inline'`); scripts remain nonce-only. `X-Powered-By` removed (`poweredByHeader: false` in `next.config.ts`, owner-authorised). Sign-in check 34/34 under enforcement.
- **Stage D (recommendations):** F-R1 review written (`docs/F-R1_REVIEW_2026-11-11.md`), with options and a favourite. No change to the frozen strategy. Recommendation engine remains **NO-GO** until a separate change is approved and validated evidence exists under a new protocol.
- **Full suite:** see the run recorded alongside this section.

## 45. Live option-chain check and GO protocol draft (approved)

- **Option-chain verification (live, market closed at check time, 17:18 IST):** the chain correctly reports END OF DAY. The per-contract summary showed 262 contracts requested, 231 stale, 31 with no price, 0 live. The rule requires every checked contract to be live and consistent, so one illiquid strike marks the whole chain STALE. This needs a market-hours check (9:15–15:30 IST) before any rule change.
- **Diagnostic added:** the option-chain API now returns `optionPriceVerification` (counts and states only). Read-only addition.
- **Protocol:** `docs/protocols/GO_DECISION_PROTOCOL_DRAFT_2026-11-11.md` drafted for owner review. No data accessed. Not registered or approved.
- **Recommendation engine:** remains NO-GO until the protocol is approved, run, and the owner decides.

## 46. Header verification and collection age (fixed)

- **Header "Upstox Not Verified":** the dashboard layout now uses `verifyCurrentCredentialCached()`. A successful verification is reused for 10 minutes; a failure for 1 minute. The cache key is the credential source and expiry only (no secret), so a new login re-verifies at once. At most one live verification request per 10 minutes.
- **"Last stock collection 30 Oct":** shows the age of the last stored collection run, and labels anything older than 24 hours STALE (stored run, not current prices).
- **Tests:** `src/lib/upstoxVerifiedCache.test.ts` (4 tests, all pass).
- **Still not fixable by code:** Upstox access tokens expire daily (03:30 IST), so a fresh OAuth login is needed each day. The option-chain STALE labelling during market hours needs the market-hours check before any rule change.
