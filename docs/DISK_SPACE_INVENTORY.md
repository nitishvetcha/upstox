# Disk space inventory (read-only)

**Status (2026-11-06): Tier 1 executed.** `~/Library/Caches/ms-playwright` removed (3.19 GiB), as approved. Nothing else was removed. Chromium reinstalled afterwards. See `MASTER_ENGINEERING_AUDIT.md` §15.10.

Date: 2026-11-06 (IST). Written for: the project owner. **Nothing has been deleted, truncated, moved or cleaned.**
This inventory is the basis for an approval request. Every removal below waits for your explicit approval of the exact path.

## Volume

`df -h /` reported: 228 GiB volume (`/dev/disk3s1s1`), **3.2 GiB available, 79% capacity**. The production build writes into `web/.next-prod-verify` and grows its Turbopack cache on each run. Free space fell by roughly 1 GiB across the last build-and-test cycles.

## Classification

- **Protected**: user data, research records, or historical data. Excluded from any cleanup.
- **Tracked**: in git. Never removed by this process.
- **Ignored**: listed in `.gitignore`. Generated or local.
- **Generated**: created by a tool and recreatable by re-running that tool.
- **Tool cache**: outside the project, recreatable by a tool, usually over the network.
- **User data / other tools**: not this project's to clean.

## A. Project (`/Users/webanatomy/Desktop/upstox_analyzer (2)`)

| Path | Size | Class | Notes |
|---|---|---|---|
| `web/.data/` | 2.33 GiB (2,447,352 KB) | **Protected** | Recommendations, instruments, research and collection records. **Excluded.** |
| `.git/` | 752 MB | Tracked (repo) | **Excluded.** |
| `venv/` | 958 MiB (980,920 KB) | Ignored (`.gitignore:2`) | Python 3 virtualenv for "legacy scripts". Recreatable with `pip` over the network. Your Python tooling depends on it. **Owner decision.** |
| `venv311/` | 908 MiB (929,396 KB) | Ignored (`.gitignore:3`) | Python 3.11 virtualenv, same status. **Owner decision.** |
| `web/node_modules/` | 574 MiB (587,920 KB) | Ignored, needed for build | Recreatable only with `npm ci`, which needs the network. **Not recommended now.** |
| `web/.next-prod-verify/` | 421 MiB (431,072 KB) | Generated, build output | Includes `cache/turbopack` at 324 MiB. **Excluded by instruction.** |
| `web/.research-data/` | 221 MiB (225,876 KB) | **Protected** | Research records. **Excluded.** |
| `web/.next/` | 186 MiB (190,892 KB) | Generated | **Excluded by instruction.** |
| `web/logs/` | 13 MiB (13,404 KB) | Operational | Launch-agent and audit logs. Evidence. **Kept.** |
| `web/.test-data/` | 12.2 MiB (12,520 KB) | Ignored (`web/.gitignore:46`), **generated** | Written by test runs (`recommendations/`, `news-mock-verify/`). Recreated by `npm test`. **Candidate.** |
| `web/playwright-report/` | 0.5 MiB (532 KB) | Generated, **untracked and not ignored** | HTML report. Shows as untracked in git. **Candidate, after confirming it is not yours.** |
| `web/tsconfig.tsbuildinfo` | 0.2 MiB (204 KB) | Ignored (`web/.gitignore:41`), generated | TypeScript incremental cache. Recreated by `tsc`. **Candidate.** |

## B. This session's scratch (`/private/tmp/claude-501/-Users-webanatomy-Desktop-upstox-analyzer--2-/b9d29b3b-5b35-4007-a2c7-b1acc3d2272e/scratchpad`)

| Path | Size | Class | Notes |
|---|---|---|---|
| `scratchpad/shots/` | 14 MiB (14,052 KB) | Generated screenshots | Browser-check PNGs. Re-creatable by re-running the browser check. The JSON evidence files in the same folder are **kept**. **Candidate.** |
| All other scratchpad files | about 23 MiB | Generated evidence | Verification outputs (test logs, JSON reports). **Kept as evidence.** |

## C. Tool caches (outside the project)

| Path | Size | Class | Notes |
|---|---|---|---|
| `~/Library/Caches/ms-playwright/` | **3.19 GiB** (3,340,748 KB) | Tool cache (Chromium builds) | Used only by our browser-check script. Re-installable with `npx playwright install chromium`, which needs the network. **Recommended first candidate.** |
| `~/Library/Caches/ms-playwright-go/` | 251 MiB | Tool cache | Not used by this project. Owner decision. |
| `~/.npm/` | 11.9 GiB (12,522,812 KB) | Tool cache (npm) | Recreatable over the network. **Not cleaned.** You asked for no npm cache cleanup. Owner-run only. |
| `~/Library/Caches/Google/` | 5.1 GiB (5,345,136 KB) | Browser cache, **your** Chrome data | **Owner decision.** Not recommended. |
| `~/Library/Caches/next-swc/`, `node-gyp/`, `Homebrew/` | about 0.5 GiB combined | Tool caches | Not needed for this build. Owner decision. |

## D. Other

| Path | Size | Class | Notes |
|---|---|---|---|
| `/private/tmp/claude-501/-Users-webanatomy-Desktop-sap-security-expert-new/` | 582 MiB | **Another project's session** | Not this project. **Owner decision only.** |
| `~/Desktop` (43 GiB), `~/Downloads` (23.8 GiB), `~/.gemini` (25.1 GiB), `~/Library` (22.7 GiB), `~/.gradle` (3.6 GiB), `~/.cache` (2.2 GiB), `~/.antigravity-ide` (2.0 GiB) | as stated | User data or other tools | **Excluded.** Not this project's to clean. |

## Recommendation: smallest safe cleanup

A production build needs roughly **1–1.5 GiB** of headroom, based on the observed growth. Two tiers:

**Tier 1 (recommended, one approval).** Remove the Playwright browser cache:

- `/Users/webanatomy/Library/Caches/ms-playwright` (3.19 GiB)

*Impact:* the browser checks (`scratchpad/browser-check.mjs` and the interaction scripts) stop working until Chromium is re-installed with `npx playwright install chromium` (network required). Nothing in the application, the tests, the build or the research records depends on it. This gives about 6.4 GiB of free space, enough for several builds.

**Tier 2 (optional, small, and not enough on its own).** The project-generated files:

- `/Users/webanatomy/Desktop/upstox_analyzer (2)/web/.test-data` (12.2 MiB; recreated by `npm test`)
- `/Users/webanatomy/Desktop/upstox_analyzer (2)/web/tsconfig.tsbuildinfo` (0.2 MiB; recreated by `tsc`)
- `/private/tmp/claude-501/-Users-webanatomy-Desktop-upstox-analyzer--2-/b9d29b3b-5b35-4007-a2c7-b1acc3d2272e/scratchpad/shots` (14 MiB; regenerable screenshots)

*Impact:* none on the build or the tests. About 27 MiB freed. Use this if you want to avoid touching the browser cache.

**Not recommended, or owner-only:** `venv/` and `venv311/` (1.9 GiB together, Python tooling), the Chrome cache (5.1 GiB), and the npm cache (11.9 GiB; you asked that it not be cleaned).

## Approval needed

To proceed, reply with the paths you approve. Suggested: Tier 1 only, or Tier 1 plus Tier 2. I will remove nothing until you confirm the exact list.
