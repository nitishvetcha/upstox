# External-network gating and LaunchAgent change (2026-11-09)

Written for: the project owner. Companion to `ISOLATED_AUDIT_VERIFICATION_2026-11-09.md`.

Status: **PASS** for the items below. Not a claim of full application readiness.

## 1. LaunchAgent: disabled by move, with rollback

| Step | Result |
|---|---|
| Loaded before the change? | No (`launchctl print` reports the service not found) |
| Paper-trading process running? | No (`run-paper-supervisor`, `paper-live`, and `next start` on 3123 not present) |
| Port 3123 listening? | No |
| Needed for mock-mode development? | No. The paper runner is not part of frontend, backend or mock development |
| Action | `mv` from `~/Library/LaunchAgents/` to `~/Library/LaunchAgents.disabled/` |
| SHA-256 before and after | `ee8b3dbf3f907f653f8081d972dd2d034b3ccb0c21dc9c38ea0c05b3c7c78b87` (unchanged) |
| Plist still in LaunchAgents? | No |
| Loaded after the change? | No |

**Rollback:** `mv ~/Library/LaunchAgents.disabled/com.upstox.paperlive.plist ~/Library/LaunchAgents/`, then, only if you want it running again, `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.upstox.paperlive.plist`.

The paper-trading scripts were not modified, deleted or run.

**Other process observed (not this project):** a `next dev` process from `/Users/webanatomy/Desktop/SW landing` is running. It is outside this repository. It was not stopped or changed.

## 2. External news: fail-closed in mock mode

- **New gate:** `src/lib/services/newsNetworkGate.ts`. News is enabled only when **both** `NEWS_EXTERNAL_ENABLED=true` and `MARKET_DATA_PROVIDER=upstox` are set.
- **Gated:** NewsAPI (`newsProvider.ts`) and each RSS feed (`rssNewsProvider.ts`). A refusal is caught by the existing error handling and reported as unavailable news.
- **Preserved:** the authorised live configuration. Setting both flags restores the existing behaviour.
- **Tests:** `src/lib/services/newsNetworkGate.test.ts` (6 tests). In mock mode with an API key present, NewsAPI and RSS send zero requests. Either flag alone is not enough. The authorised path still makes a request.

## 3. Collector and utility scripts: fail-closed

- **Shared guard:** `scripts/lib/collectionGuard.mjs`. Two kinds:
  - `upstox`: requires `MARKET_DATA_PROVIDER=upstox` **and** `UPSTOX_COLLECTION_ENABLED=true`.
  - `external`: requires `EXTERNAL_COLLECTION_ENABLED=true`.
- **Guarded (17 entry points):** `backfill-intraday-bars`, `recover-intraday-bars`, `collect-intraday-bars`, `upstox-collect`, `upstox-daily-universe-collect`, `upstox-pilot-collect`, `upstox-discovery`, `options-research-inventory`, `options-audit-research`, `upstox-login`, `upstox-status`, `dev-upstox`, `nse-discovery-collect`, `sync-constituents`, `validate-instruments`, `nse-bhavcopy-sweep` and `nse-bhavcopy-sweep-v2` (Python).
- **Behaviour:** the guard is the first statement. When authorisation is missing it prints `[COLLECTION BLOCKED]`, states that no request was sent, and exits with code 2 before any network code.
- **Not deleted or rewritten:** each script has only a guard header added. The body is unchanged.
- **Excluded, with reasons (in the test):** paper runners (`paper-live`, `paper-cycle`, `paper-collect`, `paper-evaluate`, `run-paper-supervisor`), which call only the local app and must not be modified; `upstox-cli.mjs`, a localhost client library; the offline news helper; and the outbound recorder preload.
- **Tests:** `src/lib/collectionGuard.test.ts` (5 tests):
  1. Each guard appears before any network reference.
  2. Every network-capable script is either guarded or explicitly excluded, so a new unguarded collector fails the test.
  3. Each guarded script, run with the flags unset, exits 2 with the blocked message.
  4. An upstox collector is still blocked with only one flag set.
  5. An external collector is still blocked without its flag.
- **Test adjustment:** `researchRunner.test.ts` runs `options-audit-research.ts` against a stubbed `fetch`. It now sets the explicit flags in its child process. The stub still intercepts every request, and the assertions are unchanged.

## 4. Test results

- `npx tsc --noEmit`: no errors.
- `npm test`: **2,423 of 2,423 pass**, 0 fail, 0 skipped.
- Earlier failing count after the news gate: 16, all caused by the gate refusing stub-only tests. Each was fixed by setting the explicit authorisation flags in the test file. No assertion was weakened.

## 5. Not done in this round

- Frontend interaction tests (forms, filters, modals, tabs, keyboard, refresh, loading and error states) and the visual review of the screenshots.
- Backend endpoint validation against the isolated server.
- Database integrity review, security review, dependency audit, performance measurement and deployment-readiness review.
- Online research and the eight project deliverables.

These remain open. They are the next stages.
