# Issue 1: Upstox Authentication Investigation

Date: 2026-11-06 (IST). Written for: the project owner and reviewers.

Scope: how the application selects, validates and uses its Upstox credentials. Read-only. Nothing was changed, fixed or requested from Upstox. Line numbers are from the current working tree.

## 0. Summary

- The app has **two credential sources**: an OAuth token stored in a file, and a long-lived **analytics token** read from `UPSTOX_ANALYTICS_TOKEN`. When the analytics variable is set it wins, for every market-data request.
- `tokenStatus()` reports **VALID** whenever the analytics variable is non-empty. It does not check the token, its expiry, or whether it was accepted.
- The `connected` flag on the status endpoint is **true whenever the variable is set**, unless the caller asks for `verify=1`. So "connected" means "configured" by default.
- Expiry is checked only for the OAuth token. The analytics token's expiry is never checked, and the app has no record of it.
- The app cannot tell apart "configured", "accepted by an API call", "expiry verified" and "authorised for historical data". It has one label for all of them.
- The most serious side effect: when an analytics-token request returns 401, the app writes `invalidatedAt` into the **OAuth file in the protected `.data/` folder**, while the status still reads VALID.

## 1. Credential sources and where they are configured

| Source | Configured in | Read by | Notes |
|---|---|---|---|
| OAuth token file | `UPSTOX_TOKEN_FILE`, else `<cwd>/.data/upstox-token.json` (`upstoxAuth.ts:12–14`) | `readStored()` (`upstoxAuth.ts:118`) | Written by the login exchange only (`saveToken`, `:111`) and by `markTokenInvalid` (`:154`). |
| Analytics token | `UPSTOX_ANALYTICS_TOKEN` in `web/.env.local` (name only checked; value not read) | `tokenStatus()` (`:143`) and `getAccessToken()` (`:166`) | No file, no expiry, no record of acceptance. |
| OAuth client settings | `UPSTOX_CLIENT_ID`, `UPSTOX_CLIENT_SECRET`, `UPSTOX_REDIRECT_URI` in `.env.local` | `upstoxConfig()` (`upstoxAuth.ts:32`) | Used only for the OAuth flow. |

Environment loading: Next.js loads `web/.env.local` automatically for the server. The shell scripts load it with `node --env-file=.env.local` (`scripts/research-slot-runner.sh`, lines 21 and 28). Plain `node --test` (the test runner) does **not** load `.env.local`.

## 2. Current authentication flow

**Login (OAuth).**
1. `authorizeUrl()` builds the dialog URL with a random, single-use state (`upstoxAuth.ts:60`; state from `createAuthState`, `:45`; single use in `consumeAuthState`, `:53`).
2. `completeLogin()` (`:216`) consumes the state, exchanges the code (`exchangeCode`, `:78`), saves the token (`:111`), and verifies it with one quote call (`verifyConnection`, `:173`).
3. `exchangeCode` sets `expiresAt` to **03:30 IST the next morning** (`tokenExpiry`, `:71`).

**Token selection (runtime).** `getAccessToken()` (`:165`):
- returns `UPSTOX_ANALYTICS_TOKEN` if set (`:166–167`);
- otherwise returns the OAuth token **only if** `loadToken()` classifies it VALID (`:168`, `:148–151`).

**Status.** `tokenStatus()` (`:141`):
- returns `{ status: "VALID", expiresAt: null }` if the analytics variable is set (`:143`), without reading the file;
- otherwise reads the file and classifies it with `classifyToken()` (`:134`): MISSING, UNKNOWN (unreadable), INVALID (`invalidatedAt` set), VALID or EXPIRED (compared with `expiresAt`).

**Validation by a real request.** `verifyConnection()` (`:173`) makes one `GET /v2/market-quote/quotes` for `NSE_INDEX|Nifty 50` (`VERIFY_KEY`, `:10`) with the bearer token. It returns CONNECTED on 200, AUTH_EXPIRED on 401, and API_ERROR or NETWORK_ERROR otherwise. It proves quote access only.

**Market-data requests.** Every market request attaches `Authorization: Bearer <token>` (`upstoxMarket.ts:43`). The token comes from `getAccessToken()` through `withFallback()` (`market.ts:42–61`). On a 401 (`reasonFor`, `upstoxMarket.ts:25–26`), `withFallback` calls `onAuthExpired()` (`market.ts:59`), which is `markTokenInvalid()` (`market.ts:36`). Then it serves **mock** data with reason `UPSTOX_AUTH_EXPIRED`.

**Startup (`npm run dev:upstox`).** `scripts/dev-upstox.mjs` calls `/api/auth/status?verify=1`. That runs one verification quote call. If the status is connected, it prints a live summary.

**Health.** `/api/auth/health` (`src/app/api/auth/health/route.ts:15–16`) uses the same token. It runs per-index real calls (spot, option contracts, chain) and reports PASS or FAIL with the provider's message for each. It also probes historical entitlement (`:44`).

## 3. Every use of the credentials

| Location | Reads | Effect |
|---|---|---|
| `upstoxAuth.ts:143` `tokenStatus()` | analytics variable | VALID without any check |
| `upstoxAuth.ts:166` `getAccessToken()` | analytics variable | Returns it as the bearer token |
| `upstoxAuth.ts:168`, `:148–151` | OAuth file, via `loadToken()` | Used only when analytics is unset |
| `upstoxAuth.ts:154–157` `markTokenInvalid()` | OAuth file | **Writes `invalidatedAt` even when the failing token was the analytics token** |
| `upstoxMarket.ts:43` | bearer token | Every live market request |
| `market.ts:35–36, 42–61` | `getAccessToken`, `markTokenInvalid`, `tokenStatus` | Falls back to mock; invalidates on 401 |
| `app/api/auth/status/route.ts:8–12` | `tokenStatus`, `getAccessToken`, `verifyConnection` | `connected` true when VALID, unless `verify=1` shows otherwise |
| `app/api/auth/health/route.ts:15–16, 44` | both | Per-index real calls; historical entitlement probe |
| `app/api/paper-opportunities/collect/route.ts:16, 53` | `tokenStatus` | Blocks only on EXPIRED or INVALID; VALID passes |
| `services/liveOpportunityCollector.ts:390–391` | `tokenStatus` | Records session as CONNECTED when VALID |
| `services/paperTradeMonitorRunner.ts:172–173` | `tokenStatus` | Same |
| `services/optionQuoteCanary.ts:126–127` | `tokenStatus` | REJECTED_AUTH unless VALID (flag guard still blocks first) |
| `adapters/upstoxHistoricalOptionsAdapter.ts:89` | `getAccessToken` | Historical options probe (Plus-plan check) |
| `services/backtestRequest.ts:10` | `getAccessToken` | Backtest candle loader (`upstoxChunkFetcher(token)`) |
| `services/stockService.ts:139, 154`; `engine/stockOpportunityEngine.ts:138, 371` | `getAccessToken` | Stock candles and quotes |
| `app/api/research/stock-candles*/route.ts:25, 30` | `getAccessToken` | Research candle routes |
| `scripts/*.ts` (about 10 files, including `check-research-token.ts:5`) | `getAccessToken` | Research and audit scripts |
| `scripts/research-slot-runner.sh:21, 28` | `.env.local` via `--env-file` | Scheduled research runs (not running now) |

Every use above goes through `getAccessToken()` or `tokenStatus()`. No code path reads the analytics variable directly except those two functions.

## 4. Four states, and whether the app can tell them apart

| State | Meaning | How the app learns it | Can the app tell it apart? |
|---|---|---|---|
| **Configured** | A value exists (env var, or a file) | `tokenStatus()` for analytics; file read for OAuth | Only by presence. It says VALID. |
| **Accepted by an API request** | Upstox returned 200 for an authenticated call | `verifyConnection()` (`?verify=1`); a successful market request | Only when `verify=1` is passed, or a market call is made. Presence-only checks never run it. |
| **Expiry verified** | The token's expiry is known and in the future | OAuth file: `expiresAt` vs now (`classifyToken`). Analytics: **never** | OAuth only. Analytics has no expiry, so VALID is assumed. |
| **Authorised for historical collection** | Upstox allows the historical candle or option endpoints for this token and plan | Not modelled. Historical options have a separate probe (Plus plan), and the health note says entitlement is "independent of login". The candle endpoints use the same token with no separate check. | **No.** |

**Conclusion: the app cannot distinguish these states.** It has one VALID label, and VALID is produced by configuration alone when the analytics variable is set.

## 5. Why the VALID label is misleading

1. **It asserts validity without evidence.** `tokenStatus()` returns VALID for any non-empty analytics value (`upstoxAuth.ts:143`). A revoked, expired or mistyped analytics token still reads VALID.
2. **Status says "connected" with no request.** `connected = status === "VALID" && (connection === null || …)` (`status/route.ts:12`). Without `verify=1`, `connection` is null, so `connected` is true whenever the variable is set.
3. **Automated paths treat it as authenticated.** The collect route (`:53`), the live collector (`:391`) and the paper monitor (`:173`) record the session as CONNECTED. The canary's auth gate (`optionQuoteCanary.ts:127`) passes. The canary and the LTT path also have their own flag guards, which are off, so no collection happens today. But the provenance records would still say CONNECTED.
4. **It hides a dead OAuth file.** With analytics set, the expired OAuth file is never read. The operator sees VALID and has no sign the OAuth session has lapsed.
5. **It hides rejection.** If every market request returns 401, `tokenStatus()` still says VALID. The only signal is the `fallbackReason` on each response (`market.ts:51, 59`), and the health route's per-check FAIL rows.
6. **Expiry is absent, not unknown.** `expiresAt: null` is presented as "no expiry to show" (`upstoxAuth.ts` comment, `:142`). The repository gives no source for that claim.

## 6. Confirmed problems

| # | Problem | Evidence | Severity |
|---|---|---|---|
| P1 | VALID is presence-only for the analytics token | `upstoxAuth.ts:143` | High |
| P2 | `connected` is true without a request | `status/route.ts:10–12` | High |
| P3 | A 401 on the analytics token writes to the OAuth file in the protected folder | `market.ts:59` → `markTokenInvalid` `:154–157` → `saveToken` | High (protected data). Not triggered: the current file has `invalidatedAt: null`, and no write has been observed. |
| P4 | Automated provenance records CONNECTED from presence | `liveOpportunityCollector.ts:391`, `paperTradeMonitorRunner.ts:173`, collect route `:53` | Medium (no collector is running) |
| P5 | Analytics expiry is never checked, and `expiresAt` is null | `upstoxAuth.ts:143` | Medium (unknown until a request is made) |
| P6 | Analytics takes priority over the OAuth token, silently | `upstoxAuth.ts:166–167` | Medium |
| P7 | Historical authorisation is not modelled | §4 | High for Phase 2 |
| P8 | The test suite depends on the shell environment | `package.json:10` does not unset `UPSTOX_ANALYTICS_TOKEN`; `apiIntegration.test.ts:49–52` expects MISSING, which holds only if the variable is unset in the shell | Medium |
| P9 | Missing tests for the auth precedence and the invalidation side effect | §7 | Medium |

## 7. Existing tests

| Test | File | What it covers | Gap |
|---|---|---|---|
| Token expires at next 03:30 IST | `services/upstoxAuth.test.ts:10` | `tokenExpiry` | Not `classifyToken` |
| Authorize URL has client id, redirect and state, never the secret | `upstoxAuth.test.ts:19` | URL build | — |
| Code exchange success and failure, no secret in errors | `upstoxAuth.test.ts:28` | `exchangeCode` | — |
| MISSING when file absent | `apiIntegration.test.ts:49–52` | `tokenStatus()` default path | **Environment-dependent (P8).** |
| INVALID-labelled expired file (actually asserts EXPIRED) | `apiIntegration.test.ts:57–66` | `tokenStatus(now, file)` | Test name does not match its assertion |
| Canary route with injected `getAccessToken` | `options-canary/optionsCanaryRoute.test.ts:249, 266` | Injected dependency only | Does not exercise the real auth path |

No test covers: the analytics priority, analytics VALID without expiry, `classifyToken` branches (INVALID via `invalidatedAt`, UNKNOWN), `markTokenInvalid` (or its side effect when analytics is in use), `withFallback` on 401, or the status route's `connected` logic.

## 8. Historical-data endpoints and the analytics token

Yes. The analytics token is used for every historical path, because they all call `getAccessToken()`:
- historical candles for the backtest loader (`backtestRequest.ts:10`, then `upstoxChunkFetcher(token)`);
- the 15-minute and daily technical candles used by the recommendation engine (`upstoxMarket.ts`, through `getCandles`);
- research candle routes (`stock-candles*/route.ts`) and the research scripts;
- the historical options probe (`upstoxHistoricalOptionsAdapter.ts:89`), which reported the blocked response.

Whether the analytics token is **authorised** for those endpoints is not established by the code. It can be established only by an authenticated call, which this investigation did not make.

## 9. Unknowns that cannot be established offline

1. **Whether the analytics token is currently valid, and when it expires.** Needs one authenticated request.
2. **Whether it is authorised for historical candles and options.** Needs a request to a historical endpoint.
3. **Whether the running server had the variable in its environment.** Inferred from the VALID status and the code path. `ps` cannot show it, because Next.js loads `.env.local` after start.
4. **The analytics token's lifetime and scope under Upstox's own terms.** Not in the repository, and I have not asserted it.
5. **Whether any `invalidatedAt` write has already happened.** The current file shows `null`, so none is recorded. A write would appear only as a changed file, and the protected-file baseline is unchanged.
6. **What `verify=1` returns today.** Needs one request.

## 10. Recommended minimal fix (not implemented)

Four small changes, in order of safety:

1. **Stop presence-only `connected`.** In `status/route.ts:12`, require a verified connection: `connected = status === "VALID" && connection === "UPSTOX_CONNECTED"`. Make `verify=1` the default, or report the unverified state explicitly.
2. **Name the source.** In `upstoxAuth.ts:143`, return `source: "ANALYTICS"` (and `"OAUTH"` from the file path), so callers and the UI can tell them apart. Keep `status` as-is for backward compatibility, or add a separate `"CONFIGURED_UNVERIFIED"` value.
3. **Stop the protected-file write.** Make `getAccessToken()` return its source, and have `market.ts:59` call `markTokenInvalid()` **only** when the failing token came from the OAuth file. This removes P3 without changing any other behaviour.
4. **Make tests environment-independent.** In `package.json:10`, unset `UPSTOX_ANALYTICS_TOKEN` for the test run (for example `env -u UPSTOX_ANALYTICS_TOKEN`), so the MISSING test always means what it says.

Not recommended now: removing analytics priority (a product decision), or changing expiry handling for the analytics token before its lifetime is known.

## 11. Test plan

Each test uses a temporary token file and an injected `fetch`. None makes a network call.

| # | Test | Asserts |
|---|---|---|
| T1 | Analytics set, no file | status is not treated as connected without a verified call; source is ANALYTICS |
| T2 | Analytics set, injected 401 on `verifyConnection` | `connected` false; the OAuth file is byte-identical afterwards (P3) |
| T3 | Analytics unset, expired file | status EXPIRED; `getAccessToken()` returns null |
| T4 | Analytics unset, valid file | status VALID with the file's `expiresAt`; token is the file token |
| T5 | `classifyToken` with `invalidatedAt` set | INVALID |
| T6 | `classifyToken` with unreadable file | UNKNOWN |
| T7 | Both set | analytics token returned (documented precedence) |
| T8 | `withFallback` with 401 from the analytics token | fallback reason UPSTOX_AUTH_EXPIRED; `onAuthExpired` called with the source |
| T9 | Collect route gate with analytics and a rejected verification | provenance is not CONNECTED |
| T10 | Full test suite run with `UPSTOX_ANALYTICS_TOKEN` exported | suite still passes (guards P8) |

Existing tests to keep: the three in `upstoxAuth.test.ts` and the canary route tests. The `apiIntegration` status tests should keep their assertions, and their environment should be made explicit (fix 4).

## 12. Confirmation

- **No source file was modified.** The only file written is this report, `docs/ISSUE1_AUTHENTICATION_INVESTIGATION.md`.
- **No credential was changed or read as a value.** `.env.local` was checked for variable **names** only. No value was printed, copied, hashed, decoded or exposed. The OAuth file was read for its metadata fields (`issuedAt`, `expiresAt`, `invalidatedAt`, provider) and no token value was printed.
- **No OAuth refresh, no token generation, no Upstox request** was made.
- **No backtest, collector, runner, scheduler or canary** was run or started.
- **`.data/` and `.research-data/` were not modified** (checked against the Phase 2 baseline, see the verification below).
- **Strategy 11.4 was not changed** (`web/src/lib/engine/strategy.ts`, checked by SHA-256).
- **Existing dirty Git changes were preserved.** Nothing was staged, committed, reset or cleaned.

The investigation stops here. No fix has been implemented.
