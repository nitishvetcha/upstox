# Isolated audit verification and gap record (2026-11-09)

Written for: the project owner. Companion to `INCIDENT_LIVE_UPSTOX_REQUESTS_2026-11-09.md` and `INCIDENT_REMEDIATION_2026-11-09.md`. Those two are not edited here.

## 1. Network isolation: what was verified

| Check | Result | Evidence |
|---|---|---|
| Docker, Podman, Colima, OrbStack, Lima present | **None present**. No container isolation available without installing software. | `command -v` for each |
| Process-level sandbox (`sandbox-exec`, no sudo, no firewall change) | **Available and verified** | See probe below |
| Probe: loopback connect (127.0.0.1:9) inside sandbox | `ECONNREFUSED`, so the connection was allowed through the sandbox and reached the stack | `netprobe.cjs` |
| Probe: external connect (192.0.2.1:443, TEST-NET, non-routable) inside sandbox | `EPERM`, denied by the sandbox before any packet left | same |
| Control: same external target outside the sandbox | `TIMEOUT`, so the difference is the sandbox | same |
| Dev server started inside the sandbox on port 3150 (3123 not used) | Started; `GET /` returned HTTP 200 over loopback | `isolated-dev.log` |
| Outbound markers in the isolated server log after all audit traffic | **0** `upstox_request`, **0** `news_request`, **0** `EPERM`. 54 `upstox_blocked` events, all from the application gate | server log |
| Browser-level block of every non-localhost request during the audit | **0** external requests attempted by the browser | audit `report.externalBlockedCount` |

**Limit of this verification:** the sandbox probe used a TEST-NET address, not a real Upstox host, so that no request could reach an external service. The sandbox profile is `allow default`, then deny outbound except loopback and unix sockets. The browser was not run inside the sandbox; its isolation comes from Playwright request blocking, which is application-level, not OS-level. The server-side isolation is OS-level.

Profile used:
```
(version 1)(allow default)(deny network-outbound (remote ip "*:*"))(allow network-outbound (remote ip "localhost:*"))(allow network-outbound (remote unix-socket))
```

## 2. Browser audit (mock mode, isolated server on 127.0.0.1:3150)

42 route × viewport combinations: 14 routes at 1440×900, 768×1024 and 390×844. Screenshots: `scratchpad/shots2/` and `scratchpad/shots3/` (saved-picks recheck).

| Result | Count |
|---|---|
| HTTP 200 | 42 of 42 (after fix F1) |
| Console errors | 0 |
| Page errors | 0 |
| Failed local requests | 0 |
| Horizontal overflow | 0 (after fix F2) |

Before fixes: `/option-history` returned HTTP 500 at all three widths, and `/saved-picks` overflowed by 224px at 390px.

**Scope of "passed":** screenshots were captured and the mechanical checks above passed. I did not visually inspect each screenshot against a design, and I did not test interactions (forms, filters, modals, charts). Those remain NOT TESTED.

## 3. Fixes made in this round (all retested)

| ID | Problem | Root cause | Fix | Retest |
|---|---|---|---|---|
| F1 | `/option-history` HTTP 500 | Gate error thrown outside the adapter's try block; the probe crashed the page | Adapter returns a structured `PROVIDER_NOT_LIVE` result when the gate refuses. Regression test added | Page now 200 at 3 widths; test passes |
| F2 | `/saved-picks` mobile overflow 224px | Fixed three-column grid with intrinsic input widths | Responsive `auto-fit` grid with `minmax(min(100%,180px),1fr)`; table wrapped in an overflow container | 0px overflow at 3 widths |

## 4. Git discrepancy (336 → 341): resolved as far as read-only evidence allows

Five entries are new since the session snapshot, and each has a creation (birth) time from this session:

| Entry | Birth time |
|---|---|
| `web/docs/strategy-research-next-phase-2026-11-09/` | 2026-11-09 13:36 |
| `web/docs/INCIDENT_LIVE_UPSTOX_REQUESTS_2026-11-09.md` | 2026-11-09 15:44 |
| `web/src/lib/services/upstoxNetworkGate.ts` | 2026-11-09 15:46 |
| `web/src/lib/services/upstoxNetworkGate.test.ts` | 2026-11-09 15:47 |
| `web/docs/INCIDENT_REMEDIATION_2026-11-09.md` | 2026-11-09 16:08 |

Five new entries account for 336 → 341. Earlier I said two were unattributed; that was wrong, because I had counted only the three gate and remediation files. The P1 folder and the first incident record are the other two. The increase is consistent with these five. I have not proven it against the exact 336-entry snapshot, which was not saved. Nothing was staged, committed, reset, cleaned or discarded.

Also modified in this session (no new entries): the test files listed in the remediation record, `futures.ts`, `upstoxMarket.ts`, the adapter, `saved-picks/page.tsx`, and `.env.local` (git-ignored).

## 5. LaunchAgent: current state and proposed action (not changed)

Verified read-only:
- `launchctl print gui/<uid>/com.upstox.paperlive`: "Could not find service" (**not loaded**).
- Plist present at `~/Library/LaunchAgents/com.upstox.paperlive.plist`.
- No `run-paper-supervisor`, `paper-live` or `next` process is running.

**Proposed reversible action (requires your approval):**
1. `mkdir -p ~/Library/LaunchAgents.disabled && mv ~/Library/LaunchAgents/com.upstox.paperlive.plist ~/Library/LaunchAgents.disabled/`
   - Effect: launchd no longer finds the job at login. No service is loaded or started by this move.
   - Plist content is unchanged, so nothing is deleted.

**Rollback:** `mv ~/Library/LaunchAgents.disabled/com.upstox.paperlive.plist ~/Library/LaunchAgents/`. Load only if you want it, with `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.upstox.paperlive.plist`.

Scripts (`run-paper-supervisor.mjs`, `paper-live.mjs`) are not modified.

## 6. Outbound path classification

| Path | Class | Current gate | Status |
|---|---|---|---|
| Upstox quotes, candles, option chain, contracts (`upstoxMarket.get`) | Runtime, live-only | Gate in place | **Fail-closed** (tests) |
| Instrument-master download (`futures.ts`) | Runtime, live-only | Gate in place | **Fail-closed** (tests) |
| Historical-options probe (adapter) | Runtime, live-only | Gate in place, structured result | **Fail-closed** (test + browser) |
| `stockService.ts` direct `get` calls | Runtime | Reached via `upstoxMarket.get`, so gated | **Fail-closed** by inheritance; not separately tested |
| NewsAPI (`newsProvider.ts`) | Runtime, external | **No gate** | Observed 0 requests in mock run; **not fail-closed by code** |
| RSS news (`rssNewsProvider.ts`) | Runtime, external | **No gate** | Observed 0 requests in mock run; **not fail-closed by code** |
| `scripts/upstox-*.ts`, `options-research-inventory.ts`, `upstox-collect.ts` and similar | Collectors, live-only | **No gate** | **Open.** Not run in this work. Must be gated or disabled |
| `scripts/sync-constituents.mjs`, `nse-discovery-collect.ts`, NSE bhavcopy scripts | Offline research / collectors, external | **No gate** | **Open** |
| `scripts/paper-live.mjs`, `paper-cycle.mjs`, `paper-collect.mjs`, `paper-evaluate.mjs` | Scheduled (paper), calls localhost app | Calls local API only | **Open:** the app's routes are gated; these scripts must not run unattended |
| `scripts/backfill-intraday-bars.mjs`, `collect-intraday-bars.mjs`, `recover-intraday-bars.mjs` | Historical utilities, Upstox | **No gate** | **Open** |
| `scripts/validate-instruments.mjs` | Utility, external URL | **No gate** | **Open** |
| `scripts/verify-mock-news-offline.mjs` | Test helper (localhost) | Local only | Acceptable |
| Browser (`src/app/**` `fetch("/api/…")`) | Runtime, same-origin | Local only | Acceptable |

Fail-closed for news and scripts is **not done**. Doing it needs your approval for two things: which news provider should be enabled in mock mode (I recommend none), and whether unused collector scripts should be removed from the runnable set or simply gated.

## 7. Status

| Requirement | Status | Evidence |
|---|---|---|
| Container isolation | **NOT AVAILABLE** (no Docker or equivalent). Not installed | `command -v` |
| Process-level sandbox | **PASS** (verified with probes) | Section 1 |
| Dev server inside sandbox, mock mode | **PASS** (HTTP 200, 0 outbound markers) | Section 1 |
| Browser audit at 1440, 768, 390 | **PARTIAL**: mechanical checks pass; visual and interaction review NOT TESTED | Section 2 |
| Central Upstox gate | **PASS** (tests). Runtime proof under sandbox: 54 blocked attempts, 0 leaked | Section 1 |
| Fail-closed for news and scripts | **NOT DONE** (needs approval, section 6) | Section 6 |
| LaunchAgent unattended start disabled | **BLOCKED** on your approval (section 5) | Section 5 |
| Git discrepancy | **PASS** (5 new entries, all created this session) | Section 4 |
| Full offline suite | **PASS**: 2,412 of 2,412 | `npm test` |
| TypeScript | **PASS** (no errors) | `npx tsc --noEmit` |

Not tested in this round: backend endpoint validation against the sandboxed server, security review, dependency audit, database review, performance measurement, and frontend interaction tests. These remain open.

Live recommendation engine: **NO-GO**. P1: **rejected**. Strategy 11.4: **frozen**. Holdout: **sealed**. No live Upstox or NSE request was made in this round.
