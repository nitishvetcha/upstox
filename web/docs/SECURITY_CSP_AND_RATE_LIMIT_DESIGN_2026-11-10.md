# CSP and rate-limit design (2026-11-10)

Status: **DESIGN ONLY, nothing enforced.** Written for: the project owner and the next engineering session.

## 1. Content-Security-Policy

### Current state
- No CSP is sent. Verified on the isolated server: the response headers contain no `Content-Security-Policy`.
- Baseline headers are sent by `src/proxy.ts` (X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP). These are verified live.

### Constraints found in the application
- Next.js injects inline bootstrap scripts (hydration and the router payload). A policy without `'unsafe-inline'` breaks hydration unless each inline script carries a per-request nonce.
- Nonces require dynamic rendering for every page. The app is already dynamic (`force-dynamic` on API routes; pages read live state), but static optimisation of any page would be affected. Verify per page before enforcing.
- Development mode uses eval-style features for hot reload. A development policy must differ from production or be report-only in development.

### Proposed rollout (not started)
1. **Report-only first.** Send `Content-Security-Policy-Report-Only` with `default-src 'self'; script-src 'self' 'nonce-…'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`, and a report endpoint or console-only collection. Run the browser audit with the full route set and record every violation.
2. **Validate nonces** in the isolated environment: confirm hydration works on all 14 routes with the nonce supplied through the proxy. Trade-off: nonce generation per request costs little, but it blocks full static caching of pages.
3. **Enforce** only after zero unexplained violations across the route set and the dev server.
4. **Style.** `'unsafe-inline'` for styles is likely needed for component style attributes; record it as an accepted trade-off unless the styles are refactored.

### Blockers for enforcement
- No browser violation data has been collected yet. Report-only validation is the next task.
- The design needs a decision on the report endpoint (none exists). Decision required from the owner: console-only collection, or a local-only report endpoint.

## 2. Rate limiting

### Current state
- None. Verified: 30 rapid GETs returned 200.
- Module added but **not wired**: `src/lib/rateLimit.ts` (fixed-window limiter, bounded memory, client key). Tests: `src/lib/rateLimit.test.ts` (9 pass).

### Trusted client identity
- Default: only the socket address is trusted. `X-Forwarded-For` is ignored, so a client cannot choose its own key.
- Behind a reverse proxy the operator controls, set `trustedProxy=true` and use the left-most forwarded address. Enabling this without such a proxy lets clients evade limits. **Decision required:** whether a proxy exists in the deployment target. None is configured in this repository.

### Endpoint classes (proposed, not enabled)
| Class | Examples | Proposed limit | Reason |
|---|---|---|---|
| Market data reads | GET `/api/market/*`, `/api/analysis/*` | generous, e.g. 120/min per client | protects the provider budget; mock reads are cheap |
| Write handlers | POST/PATCH/DELETE `/api/saved-picks`, `/api/opportunities/*` | 30/min | state changes |
| Expensive computation | `/api/backtest/*`, `/api/research/*` | 6/min | CPU-heavy; these routes are not run in this programme |
| Auth-adjacent | `/api/auth/*`, `/api/options-canary` | 10/min | brute-force surface |

Numbers are starting points, not tuned values. They must be checked against real usage in staging before enforcement.

### Trade-offs
- **Fixed window** is simple and cheap but allows a burst at a window boundary (up to 2× the limit). A sliding window or token bucket removes that at higher cost. Chosen for simplicity; acceptable for a single-instance internal tool.
- **In-process memory.** Limits are per process. Multiple instances would each enforce their own limit. Not suitable for a horizontally scaled deployment without a shared store.
- **Disruption risk.** A global limit can block the dashboard's own polling. Endpoint classes exist so that polling endpoints get generous limits.

### Rollout (not started)
1. Wire the limiter in report-only mode: count and log refusals without rejecting.
2. Measure real request rates from the browser audit's network log.
3. Enable per endpoint class, starting with the write handlers, then auth, then expensive computation.
4. Return HTTP 429 with `Retry-After` (the limiter already computes `retryAfterMs`).

## 3. Items requiring owner decisions
1. Whether a reverse proxy exists in the deployment target, which determines the trusted-proxy setting.
2. The CSP report collection method.
3. Approval to proceed to report-only CSP validation and report-only rate limiting in the isolated environment.

## 4. What is not done
- No CSP enforcement and no report-only header yet.
- Rate limiter not wired.
- `X-Powered-By` still sent (blocked by the rule that `next.config.ts` is preserved).

## 5. Measured results (report-only, isolated mock server, 15 routes, 2026-11-10)

- Local-only receiver `/api/csp-report`: refuses non-loopback Host (403), bounds body to 8 KB (413), keeps only directive, blocked scheme and host, and document path. No query strings, samples or cookies stored. Tests: `src/lib/cspReport.test.ts` (12).
- Run 1, `CSP_REPORT_ONLY=1` (allows unsafe-inline and unsafe-eval): **0 violations**. This is expected and says nothing about an enforced policy.
- Run 2, `CSP_REPORT_ONLY=strict` (no unsafe-inline or unsafe-eval for scripts): **90 violations**:
  - `script-src-elem | inline`: 45 (framework inline bootstrap scripts, all routes)
  - `script-src | eval`: 45 (evaluation calls; the dev server is the likely source, not yet confirmed against a production build)
  - style violations: 0. Styles can keep `'unsafe-inline'` as proposed.
- Conclusion: enforcing a script policy without nonces would break hydration on every route. A nonce strategy is required before enforcement.
- Not yet measured: a production build (`next build` then `next start`) under the strict policy, which decides whether `unsafe-eval` is needed at all in production. Not run in this step.
- **Enforcement status: NOT ENFORCED.** No blocking header is sent by default.

## 6. Nonce-based report-only measurement (2026-11-10)

Official basis (bundled Next 16 docs, `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`):
- Nonces are applied per request by the proxy, and the page must be dynamically rendered (static optimisation and CDN caching are disabled for nonce-protected pages; PPR is incompatible).
- `'unsafe-eval'` is needed in development for React debugging and is not required in production.

Application source check (non-test): no `eval(`, `new Function(`, `dangerouslySetInnerHTML` or literal `<script>` tags. The 45 inline-script and 45 eval violations seen earlier therefore come from the framework runtime and development tooling, not from application code.

Measured in isolated dev, `CSP_REPORT_ONLY=nonce`, 15 routes, 0 page errors:
- script-src violations: **0** (inline and eval both gone)
- style-src-attr inline: **82**; style-src-elem inline: **76**

Decisions and open points:
1. Style attributes (React `style={}`) cannot take a nonce. Options: (a) allow `style-src-attr 'unsafe-inline'`, a lower-risk allowance than script inline because it does not permit script execution; (b) refactor to classes. Recommended: (a) for the first enforced rollout, recorded as an accepted trade-off. Owner decision required.
2. The 76 style-element violations need attribution (framework-injected style tags in dev may lack the nonce). Not yet resolved.
3. Production evidence is still missing. `next build` fails inside the no-outbound sandbox because `next/font/google` downloads Geist at build time. Options: approve a font-fetch exception for the build only, or self-host the fonts (a source change, needs approval). Production CSP is BLOCKED until one is chosen.
4. Enforcement: NOT enabled. Enabling requires zero unexplained violations in production and an accepted decision on point 1.
