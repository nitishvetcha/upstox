# Issue 1: Authentication Hardening Fix Report

Date: 2026-11-06 (IST). Written for: the project owner and reviewers.

Implements the corrections identified in [ISSUE1_AUTHENTICATION_INVESTIGATION.md](ISSUE1_AUTHENTICATION_INVESTIGATION.md). Scope: source-aware credential tracking, the protected OAuth-file write, accurate status semantics, automated provenance, and deterministic tests. Issue 2 was not started.

## 1. Summary

- **Credential source is now tracked.** `resolveCredential()` returns `{ token, source }` with `ANALYTICS` or `OAUTH`. The priority is unchanged: analytics first, then a non-expired OAuth token.
- **An analytics-token 401 can no longer touch the OAuth file.** The market fallback invalidates the OAuth file only when the failed credential came from it. Tested byte-for-byte, and a mutation check confirmed the test catches the old behaviour.
- **`connected` now means a verification request succeeded.** A configured analytics token reports `CONFIGURED_UNVERIFIED` and `connected: false` until `?verify=1` makes one read-only quote request.
- **Provenance no longer treats presence as connection.** The collectors, the monitor, the journal and the collect route record `UNVERIFIED` for a configured-but-unverified credential. Only a successful verification is recorded as `CONNECTED`.
- **Tests are deterministic.** The test script unsets `UPSTOX_ANALYTICS_TOKEN`, and each status test controls the variable itself. The full suite passes with and without it exported in the shell.

## 2. Files changed

Core and status:
- `web/src/lib/services/upstoxAuth.ts`: new states, `CredentialSource`, `Credential`, `EvidenceAuthStatus`; `tokenStatus()` (no network) returns `CONFIGURED_UNVERIFIED` for the analytics token; `classifyToken()` returns `CONFIGURED_UNVERIFIED` for a valid OAuth file; new `resolveCredential()`, `verifyCurrentCredential()`, `stateAfterVerification()`, `evidenceAuthStatus()`. `getAccessToken()` keeps its signature and priority.
- `web/src/lib/services/market.ts`: `FallbackDeps.getCredential` (optional), `onAuthExpired(source)`, exported `defaultFallbackDeps()`. The OAuth file is invalidated only for `source === "OAUTH"`.
- `web/src/app/api/auth/status/route.ts`: rewritten. `connected` requires `VERIFIED_CONNECTED`. Imports are relative now, so the route is testable.
- `web/src/app/api/auth/health/route.ts`: uses `resolveCredential()` rather than comparing the status string.
- `web/src/app/api/paper-opportunities/collect/route.ts`: verifies a configured credential before collecting; blocks with `AUTH_UNVERIFIED` otherwise. Imports are relative now.

Provenance and gates:
- `web/src/lib/services/liveOpportunityCollector.ts`, `web/src/lib/services/paperTradeMonitorRunner.ts`, `web/src/app/(dashboard)/opportunity-journal/page.tsx`: provenance from `evidenceAuthStatus()`.
- `web/src/lib/services/optionQuoteCanary.ts`, `web/src/app/api/options-canary/route.ts`: require `VERIFIED_CONNECTED`; default check performs verification. The canary's own flag guard is unchanged and still off.

Display and ops:
- `web/src/components/TopBar.tsx`, `web/src/components/OpsPanel.tsx`, `web/src/lib/ops/opsStatus.ts`: new labels; the attention check requires `VERIFIED_CONNECTED`.

Runners (not run):
- `web/scripts/runner-lib.mjs`, `web/scripts/run-paper-supervisor.mjs`, `web/scripts/run-paper-supervisor.sh`, `web/scripts/paper-live.mjs`: readiness requires `VERIFIED_CONNECTED`; readiness checks request `?verify=1`.

Test script:
- `web/package.json`: `npm test` runs `env -u UPSTOX_ANALYTICS_TOKEN …`.

Tests:
- `web/src/lib/services/upstoxAuthSources.test.ts`: **new**, 18 tests.
- `web/src/lib/services/apiIntegration.test.ts`: status cases clear the analytics variable themselves; the misnamed "INVALID" test now says EXPIRED, matching its assertion.
- Fixtures updated to the new vocabulary, with no assertion weakened: `options-canary/optionsCanaryRoute.test.ts`, `phase14.test.ts` (VALID → CONFIGURED_UNVERIFIED for a valid file), `ops/ops.test.ts`, `services/multiSessionPaperEvaluation.test.ts` (same), `services/phase2315Integration.test.ts`.

Documentation: this report, and the investigation report (unchanged).

## 3. Behaviour before and after

| Situation | Before | After |
|---|---|---|
| Analytics configured, nothing else | `tokenStatus` VALID; `connected: true` (no request) | `CONFIGURED_UNVERIFIED`; `connected: false` until `?verify=1` |
| Analytics configured, `?verify=1` succeeds | VALID; connected | `VERIFIED_CONNECTED`; connected true; one quote request |
| Analytics configured, `?verify=1` rejected (401) | VALID label; connected false | `VERIFICATION_FAILED`; connected false; the failure is reported in `connection` |
| OAuth file valid, no verification | VALID; collectors recorded CONNECTED | `CONFIGURED_UNVERIFIED`; recorded UNVERIFIED |
| OAuth file expired | EXPIRED | EXPIRED (unchanged); no request |
| Analytics-token 401 during market data | Mock fallback; **OAuth file invalidated** | Mock fallback (same reason code); **OAuth file untouched** |
| OAuth-token 401 during market data | Mock fallback; OAuth file invalidated | Same (unchanged) |
| Collect POST, analytics configured | Collected; provenance VALID | Verifies first; collects only if `VERIFIED_CONNECTED`; otherwise `AUTH_UNVERIFIED` |
| Canary, analytics configured | Passed the VALID check | Requires a verified connection |
| Runner readiness | `connected` plus `VALID` | `connected` plus `VERIFIED_CONNECTED`, with an explicit verification request |

The priority rule is unchanged. The analytics token still wins for every request. No expiry is invented for it: its `expiresAt` is `null`.

## 4. The new states

| State | Meaning | Set by |
|---|---|---|
| `CONFIGURED_UNVERIFIED` | A credential exists and is not known to be expired. Nothing has checked it with Upstox. | `tokenStatus()` for analytics, or a valid OAuth file |
| `VERIFIED_CONNECTED` | A verification request succeeded | `verifyCurrentCredential()` (only on explicit request) |
| `VERIFICATION_FAILED` | A verification request was rejected or could not complete | `verifyCurrentCredential()` |
| `EXPIRED` | The OAuth file is past its expiry | file classification |
| `INVALID` | The OAuth file was invalidated by a 401 | file classification |
| `MISSING` | No credential | file classification |
| `UNKNOWN` | The OAuth file could not be read | file classification |

Evidence mapping (`evidenceAuthStatus`): `VERIFIED_CONNECTED` → `CONNECTED`; `CONFIGURED_UNVERIFIED` → `UNVERIFIED`; `EXPIRED`/`INVALID` → `EXPIRED`; `VERIFICATION_FAILED`/`MISSING` → `NOT_CONNECTED`; `UNKNOWN` → `UNKNOWN`. Presence never maps to `CONNECTED`.

The status response shows the credential source (`ANALYTICS` or `OAUTH`) and never the value. `verificationRequested` says whether a request was made.

## 5. Tests

### 5.1 New tests: `upstoxAuthSources.test.ts` (18 tests, all pass)

| Brief item | Test | Result |
|---|---|---|
| 1. Analytics configured, OAuth absent | A1 | pass |
| 2. Analytics configured, not verified | A2 (makes no request; asserts not verified) | pass |
| 3. Analytics verification success | A3 (one quote request) | pass |
| 4. Analytics verification failure | A4 (401, 500, network error) | pass |
| 5. OAuth expired | A5 (no request) | pass |
| 6. OAuth valid | A6 | pass |
| 7. Both configured, priority unchanged | A7 | pass |
| 8. Analytics 401 leaves OAuth file byte-identical | A8 (real default fallback deps, real invalidation path) | pass |
| 9. OAuth 401 invalidates, as before | A9 | pass |
| 10. Fallback reason codes preserved | A10 | pass |
| 11. Provenance not CONNECTED from presence | A11 | pass |
| 12. Same result with or without the shell variable | A12 | pass |
| Extra | A13 classifier branches; A14 `markTokenInvalid` writes once | pass |
| Extra (route) | A15 status: no request and not connected without verify; A16 verify success; A17 verify rejected | pass |
| Extra (route) | A18 collect: a rejected verification blocks collection with `AUTH_UNVERIFIED` | pass |

Each test uses temporary files, an injected or stubbed `fetch`, and explicit environment control. Some cases replace `fetch` with a function that throws, so an unexpected request fails the test.

### 5.2 Mutation check

To confirm A8 detects the bug it targets, I made the market fallback invalidate the OAuth file on any 401 and ran the suite. A8 failed (13 pass, 1 fail). I then restored `market.ts`, and its content is identical to before the check.

### 5.3 Full test results

| Run | Result |
|---|---|
| `npm test` | **1,962 pass, 0 fail, 0 skipped** (previously 1,944; 18 new) |
| `UPSTOX_ANALYTICS_TOKEN=<value> npm test` | **1,962 pass, 0 fail** (the script unsets it) |

## 6. Typecheck, lint and build

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint .` | 0 errors, 88 warnings: the same count as before, none in files this change touched |
| Production build (`NEXT_DIST_DIR=.next-prod-verify`) | exit 0; 33 tracing warnings, unchanged in count and categories |

The build was run with `UPSTOX_ANALYTICS_TOKEN` unset and `UPSTOX_TOKEN_FILE` pointing at a non-existent file. Market data then falls back to mock with no request, so no prerendering step could reach Upstox (`upstox_request` lines in the build log: 0). The build's output contains no value of either credential (counts: 0 in the build folder and the repository).

## 7. Confirmations

- **No real Upstox request occurred.** The nine market-request log lines in the full test run all come from test doubles: a "no network in test" stub, or fake 401 responses that reuse Upstox's wording. The previous full run had five such lines; the four extra are the two invalidation tests I added (A8, A9). The build made none (§6). I made no request during implementation. The live diagnostic and health endpoints were not called.
- **`.data/` and `.research-data/` unchanged.** All 18,018 protected files match the Phase 2 baseline (0 differences in size, modification time or path). The OAuth file's modification time is unchanged (2026-11-03 17:39).
- **Credential files unchanged.** `web/.env.local` modification time is unchanged (2026-11-03 17:38). No credential value was printed, copied or hashed.
- **Strategy 11.4 unchanged.** `web/src/lib/engine/strategy.ts` matches SHA-256 `d0170b40…3eb3f18`. It was not edited.
- **No runners or collectors started.** The only repository process is your running dev server. The `com.upstox.paperlive` LaunchAgent is not loaded. The runner and supervisor scripts were edited, but not executed.
- **Generated cache.** The production build created `web/.next-prod-verify/cache`, which was removed after checks. `web/.next/dev/cache` (created by your running dev server) is still present. I did not remove it, because that would mean stopping your server. Stop the dev server before sharing the project.

## 8. Git

No files were staged, committed, reset or cleaned. The changes listed in §2 are on top of the existing uncommitted work, which is preserved.

## 9. Remaining limitations and unresolved questions

1. **Historical authorisation is still not modelled (Issue 1 item P7).** Verification uses one quote request. A successful quote does not prove historical access, and the status response says so only by what it checks.
2. **The analytics token's expiry is unknown.** The app reports `expiresAt: null` and never assumes a lifetime. Only a verification request can show that it still works.
3. **Collectors record `UNVERIFIED` unless a verification is run.** The live collector, the paper monitor and the journal read `tokenStatus()` without verifying, so they will record `UNVERIFIED` for an analytics-only setup. This is honest, but it may look like a regression in the evidence history. Whether collectors should verify on each cycle is a decision for you; it adds one request per cycle.
4. **No control in the UI triggers verification.** The top bar shows "Upstox Not Verified" for an analytics-only setup. The only trigger is `GET /api/auth/status?verify=1`. Note that the top bar sits on the live dashboard shell, so I did not load it.
5. **Verification failures are reported, not persisted.** A verification 401 changes the reported state only. Market requests with the analytics token still fail individually (with mock fallback), and there is no back-off. This is unchanged behaviour.
6. **Runner readiness now performs one quote request** (`?verify=1`) before a supervisor or paper runner starts. That is intended, but it is a behaviour change to be aware of when the runners are eventually started.
7. **The health route still makes live requests on every GET.** This was already the case, and the health route is not an unverified-status path.
8. **Two routes changed their import style.** The status and collect routes now use relative imports, so the test runner can load them. Behaviour is unchanged.
9. **Earlier production builds were not guarded.** The previous builds ran with the analytics variable set, so I cannot rule out that they reached Upstox during prerendering. The build logs from those runs are no longer available. Only this build is confirmed to have made no request.
10. **Browser checks were not run on the dashboard routes**, because loading them makes live Upstox calls. The research routes do not use the changed components.
11. **`apiIntegration` and `phase14` keep some old names.** Two test titles still say INVALID or MISSING for cases that assert other states. I corrected the one that was misleading (§2) and left the rest, because renaming them is not part of this change.

## 10. Confirmation of scope

- Analytics-token priority: **unchanged**.
- Analytics-token expiry: **not invented or assumed**.
- OAuth refresh or token generation: **none**.
- `.env.local`, OAuth files and credentials: **not modified**.
- Upstox API requests: **none made by this work** (test doubles only).
- Live diagnostics and health endpoints: **not run**.
- Backtests and historical collection: **not run**.
- Collectors, schedulers, monitors, runners, canaries: **not started, not enabled**; their feature-flag guards are preserved.
- `.data/` and `.research-data/`: **not modified**.
- Strategy 11.4 and its SHA-256: **unchanged**.
- Trading logic, risk parameters, recommendation thresholds, UI unrelated to authentication: **not modified**.
- Git: **nothing staged, committed, reset or cleaned**.

Stopped after implementation and verification. Issue 2 was not started.
