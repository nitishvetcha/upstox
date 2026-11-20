# Git baseline audit (2026-11-08)

Audit only. Nothing was staged, committed, reset, cleaned, checked out, stashed, moved or deleted. Full status record: `docs/GIT_BASELINE_STATUS_2026-11-08.txt`. Per-file classification and proposed file lists: `docs/GIT_BASELINE_COMMIT_PLAN.txt`.

Branch: `main`. Last commit: `80f3eee stocks`.

## 1. Counts

| Status | Count |
|---|---|
| Untracked (`??`) | 182 (the brief said 181; the live count is 182) |
| Modified (` M`) | 110 |
| Deleted (` D`) | 9 |
| **Total entries** | **301** |

Untracked entries are directories expanded to files: 29,284 files under `web/.research-data/`, 3,331 build-artefact files, and about 430 source, test, script, doc and config files.

## 2. Classification

| Class | Entries | Disposition |
|---|---|---|
| Application routes (`web/src/app/**`, including `(dashboard)`, `(research)`, `api/`, `saved-picks/`) | 21 untracked + 12 modified + 9 deleted + 3 modified root-app files | One coherent commit only. The 9 deletions are of root pages that `(dashboard)` replaces. Committing the deletions without the replacements breaks the app. |
| Application source (`web/src/lib`, `web/src/components`) | 56 untracked + 60 modified | Split into domain groups (section 4). |
| Tests (`*.test.ts`, `web/e2e`) | 84 untracked + 23 modified | Commit with the code they test. |
| Research scripts (`web/scripts/`) | 41 untracked + 5 modified | Keep separate from app code. Includes the H1–H5 runner `crosssectional-daily-dev.py` and A2 runner `crosssectional-daily-a2.py`. |
| Protocols and registry (`docs/protocols/`, `docs/*.md`) | 67 entries (the whole `docs/` folder is untracked) | **High priority.** Contains the registry, the H1–H5 protocols, A2, A3 and the frozen hashes. None of it is in Git history. |
| Web reports (`web/docs/`) | 42 untracked | Commit as-is. Consolidation is deferred. |
| Raw and generated research data (`web/.research-data/`) | 29,284 files, about 1.9 GB | **Not for Git.** See section 3. |
| Runtime data (`web/.data/`) | ignored, 2.3 GB, not tracked | Correct as-is. See section 3. |
| Build and test artefacts (`web/.next*`, `web/.next-prod-verify`, `web/.next-saved-picks-verify`, `web/playwright-report`, `web/test-results`) | 3,331 files | Must be ignored. Not currently ignored. |
| Config and dependencies (`package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `.env.example`, `.gitignore`, `.nvmrc`, `ecosystem.config.cjs`, `playwright.config.ts`) | 7 modified + 3 untracked | Commit after review. `.env.example` values are placeholders (checked). |
| Environment files (`.env`, `web/.env.local`) | 2 files | Ignored by both `.gitignore` files. Correct. |
| Legacy Python system (root `main.py`, `fetch_options.py`, `upstox_api/`, `analyzer/`, `auth/`, `config/`, `sentiment_analysis/`, `tradingview_data/`) | none in status | Already tracked from earlier commits. Web app does not import it (checked). Do not move yet (deferred). |
| Virtualenvs (`venv/`, `venv311/`), `snscrape/`, `__pycache__/`, `*.pkl`, `*.log` | ignored | Correct. Note `venv` contains Windows binaries, so it is a leftover. |

## 3. Data directories (inspected, not ignored blindly)

**`web/.data/`** (2.3 GB, ignored by `/.data` in `web/.gitignore`). Contains backtests, options audits, paper sessions, opportunity tracking and `upstox-token.json`.
- Git tracking: 0 files tracked. History: no commit has ever included `.data/`. Correctly excluded.
- The token file holds keys `accessToken, expiresAt, invalidatedAt, issuedAt, provider, userId, userName`. I did not print the token value. It must never be committed. It is currently safe.
- Caveat: `.data/` is the only copy of paper-session and audit evidence. It needs an offline backup. It must not be in Git.

**`web/.research-data/`** (1.9 GB, 29,291 files, **NOT ignored**). This is the most important finding in the audit.
- Git tracking: none. Not ignored by any rule. History: none.
- A plain `git add .` would commit about 1.5 GB of JSON snapshots, sweeping in 29k files.
- Composition: 29,151 `.json` files (most are per-date raw snapshots, about 1.5 GB), 109 `.zip`, 10 `.jsonl` manifests, 3 `.csv`, 2 `.md` status files. Six files are over 2 MB, including `positions-and-exclusions.json` (A2 results) and `mii-active-contracts-2026-11-06.csv`.
- The research evidence that the registry hashes refer to lives here. Example: `crosssectional-dev-A2-after-2026-11-08/results.json`, and `a3-h1-audit-2026-11-08/h1-position-audit.json`.
- Recommendation: add `web/.research-data/**/*.json` raw-snapshot patterns to ignore, but keep committing the small result and manifest files. Exact patterns need approval (section 6). Back up the full folder to a free external disk.

**Root `logs/`, `web/logs/`, `*.log`**: ignored, not tracked. Correct.

## 4. Proposed logical commit plan (not executed)

Each commit is a group. Files for each group are listed in `docs/GIT_BASELINE_COMMIT_PLAN.txt`.

1. **`chore: ignore build artefacts, verification builds and raw research data`**. Edit `web/.gitignore` (add `.next-*/`, `playwright-report/`, `test-results/`, and the raw-data patterns in section 3). Must be first, so nothing else gets swept in.
2. **`chore: dependency and config baseline`**. `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `.env.example`, `.nvmrc`, `ecosystem.config.cjs`, `playwright.config.ts`.
3. **`feat(app): route shell and (dashboard)/(research) groups`**. All `web/src/app/**` entries, including the 9 deletions, as one commit. Verify the build passes after this commit.
4. **`feat(lib): recommendation, stock and options domain`**. Modified `engine/opportunityEngine.ts`, `engine/stockOpportunityEngine.ts`, `recommendationEnricher.ts`, `services/recommendationStore.ts`, and the untracked services and options code. **Review first** (section 5).
5. **`feat(saved-picks): save library and API`**. `savedPicks.ts`, its test, `api/saved-picks/`, `app/saved-picks/`.
6. **`feat(research): daily protocol and audit tooling`**. `web/scripts/crosssectional-*.py`, `daily-equity-protocol.ts`, `options-audit-research.ts`, and related scripts.
7. **`docs(protocols): registered H1–H5, amendments A1/A2, audits A3, and registry`**. All of `docs/protocols/` and the root `docs/*.md`. This is the research evidence trail.
8. **`docs(reports): web reports`**. `web/docs/` untracked reports. Commit as-is; consolidation deferred.
9. **`test: tests for the above`**. Each test may instead go in the commit for the code it tests. Decide on approval.

Plus: `web/.research-data/` **small** results and manifests only, in a separate commit after the ignore rules are in place.

## 5. Items to review before any commit

- `web/src/lib/engine/opportunityEngine.ts` and `recommendationEnricher.ts` are modified. Both feed recommendation output. The frozen strategy files (`engine/strategy.ts`, `engine/analysis.ts`, `journalTypes.ts`, `strategyEvidenceEngine.ts`) are **not** modified in Git. Confirm that the modified enricher does not change the frozen 11.4 output.
- The 9 deleted root pages need the `(dashboard)` replacements verified to match before commit.
- `web/src/app/route-isolation.test.ts` (untracked) suggests route isolation is a tested requirement. Run it after commit 3.

## 6. Decisions needed before any Git mutation

1. Approve the ignore additions in commit 1 (exact patterns in section 3).
2. Approve the commit grouping (section 4), including whether tests go with their code or separately.
3. Confirm that the 9 root-page deletions are intended.
4. Approve a backup of `web/.data/` and `web/.research-data/` to an external disk before any commit.

## 7. Risks

- **High:** `docs/protocols/` and `.research-data/` evidence exists only in the working tree. Losing the working tree loses the research proof.
- **High:** a naive `git add -A` would commit about 1.5 GB of raw data and 3,300 build files.
- **Medium:** 9 deletions and their replacements are uncommitted. A partial commit would break routes.
- **Low:** `venv/` (Windows binaries) sits in the repo. Ignored, but it is clutter.
