# Next.js security upgrade: proposal (not applied)

Date: 2026-11-06 (IST). Written for: the project owner. **Status: APPLIED on 2026-11-06 after approval. Outcome in `MASTER_ENGINEERING_AUDIT.md` §15.10.** The original proposal text is kept below as the record of what was approved.

## 1. Current state

| Package | Declared (`web/package.json`) | Installed (`package-lock.json`) |
|---|---|---|
| `next` | `16.3.8` (exact pin) | 16.3.8 |
| `eslint-config-next` | `16.3.8` | 16.3.8 |
| `react`, `react-dom` | `19.2.8` | 19.2.8 |
| `@playwright/test` | `^1.64.1` (dev) | — |
| Node (local) | — | 22.16.0 |

## 2. Advisories (`npm audit --json`, run this session)

`npm audit` reports 10 vulnerable packages: 1 critical (`next`), 1 high (`zod`), and 8 moderate (lint tooling). `next` carries three advisories: two critical and one high.

### 2.1 `next` (the security problem)

| Advisory | Severity | Affected range | Summary |
|---|---|---|---|
| GHSA-2464-fhr4-w9xw | **critical** | `>=16.0.0 <=16.4.0` | Unauthenticated remote code execution in the Image Optimization API when SVG files are used |
| GHSA-673q-mjm6-r5xr | **critical** | `>=16.0.0 <=16.4.0` | Unauthenticated remote code execution in `use cache` functions returning typed arrays |
| GHSA-p3m5-59mp-jv5r | high | `>=16.0.0 <=16.4.0` | Denial of service in the App Router using Server Actions |

The installed 16.3.8 is inside the affected range for all three.

**Exposure in this codebase (grep, this session).** The app does not use `next/image`, SVG images, `use cache` or Server Actions: each search returned zero files. That lowers the practical exposure, but the framework itself is still vulnerable, and the default endpoints are not necessarily absent. Treat the upgrade as required before any deployment beyond this local machine. The exact conditions in each advisory text should be checked when the upgrade is applied.

### 2.2 `zod` (high, transitive, lint tooling only)

- Advisory GHSA-mrhx-c7xc-m3w5: memory exhaustion when validating oversized constrained collections. Affected `<4.6.6`.
- Path: `eslint-config-next@16.3.8` → `eslint-plugin-react-hooks@7.1.1` → `zod@4.6.5`.
- The application source does not import `zod` (grep: zero files). It is not in the runtime path.
- Fix: a current `eslint-config-next` brings in a newer `eslint-plugin-react-hooks`, which depends on `zod` `^3.25.0 || ^4.0.0`. The latest `zod` is `4.6.6`, which is outside the advisory.

### 2.3 Moderate (lint tooling)

`eslint-config-next`, `typescript-eslint`, `@typescript-eslint/*`, `minimatch`. These are fixed by upgrading `eslint-config-next` to the same version as `next`.

**Do not follow `npm audit fix` blindly.** The audit suggests `eslint-config-next@15.5.29`, which is a semver-major *downgrade* from 16.x. It would break the lint setup. The correct fix is `eslint-config-next@16.4.5`.

## 3. Proposed versions

| Package | From | To | Why |
|---|---|---|---|
| `next` | 16.3.8 | **16.4.5** | The version `npm audit` recommends, and the latest 16.4.x on the registry. 16.4.1 is also outside the affected range, but later patch releases are preferred. A minor bump within 16, so no major-version migration. |
| `eslint-config-next` | 16.3.8 | **16.4.5** | Same release line as `next`. Removes the lint-tooling advisories and the `zod` path. |

Registry metadata, read-only (`npm view`, nothing installed):

- `next@16.4.5`: `engines.node >=20.9.0` (local Node 22.16.0 satisfies it). Peer dependencies `react` and `react-dom` `^18.2.0 || ^19.0.0` (we have 19.2.8). `@playwright/test` `^1.51.1`, optional. `sass`, `@opentelemetry/api`, `babel-plugin-react-compiler`, all optional.
- `next@16.4.5` runtime dependencies: `postcss 8.5.23`, `@next/env 16.4.5`, `styled-jsx 5.1.6`, `@swc/helpers 0.5.23`, `caniuse-lite`, `baseline-browser-mapping`.
- `eslint-config-next@16.4.5` dependencies: `@next/eslint-plugin-next 16.4.5`, `typescript-eslint ^8.56.0`, `eslint-plugin-react-hooks ^7.1.0`, and others.

## 4. Lockfile and manifest changes

Expected changes, to be produced by the package manager, not edited by hand:

1. `web/package.json`: `"next": "16.4.5"` and `"eslint-config-next": "16.4.5"`. Keep the exact pin for `next`, as the project does now.
2. `web/package-lock.json`: the `node_modules/next` entry (version, `resolved`, `integrity`), the `@next/*` entries (`@next/env`, `@next/swc-*`, `@next/eslint-plugin-next`), `eslint-config-next` and its subtree (`typescript-eslint`, `eslint-plugin-react-hooks`, `zod`, `zod-validation-error`, `minimatch`). Expect `zod` to move from `4.6.5` to `4.6.6` or later.
3. No application source change is expected from the package change alone. Any code change needed by the 16.4 release is a separate, reviewed commit.

**Command when approved** (needs the network and about 1 GiB of free space; see the disk inventory):

```
cd web
npm install --save-exact next@16.4.5 eslint-config-next@16.4.5
```

Do not run `npm audit fix --force`, because it would apply the major downgrade.

## 5. Breaking-change review (required before the lockfile is committed)

The project's agent guidance (`web/AGENTS.md`) says this Next.js version has breaking changes and that the bundled docs in `node_modules/next/dist/docs/` must be read before writing code. After the install:

- Read the 16.4 section of `node_modules/next/dist/docs/` and the release notes for 16.3.9 through 16.4.5.
- Check the route handler typing used by the app: `RouteContext<"/api/…">` in `src/app/api/**/route.ts`. Confirm it still compiles under the new types.
- Check `next.config.ts` for any option that changed or was removed.
- Check the middleware or proxy file, if any, and the `dynamic = "force-dynamic"` exports used in several routes.
- Check the `(dashboard)` and `(research)` route groups and the `app/error.tsx` boundary.
- Check whether the build's Turbopack cache location (`NEXT_DIST_DIR=.next-prod-verify`) still works.

## 6. Regression tests required (all must pass before the change is accepted)

| # | Gate | Pass condition |
|---|---|---|
| 1 | `npm test` | All tests pass. Baseline is recorded in the tracker at the time of the upgrade. |
| 2 | `npx tsc --noEmit` | Exit 0 |
| 3 | `npx eslint` on changed files | 0 errors. Warnings do not increase |
| 4 | Production build, `NEXT_DIST_DIR=.next-prod-verify` | Exit 0 |
| 5 | Offline news verification (`scripts/verify-mock-news-offline.mjs`) | 7 of 7 routes 200, MOCK-only, zero external hosts |
| 6 | Route smoke test (59 GET routes, mock mode) | No 500s; no token or secret in any body |
| 7 | Invalid-input check on the 28 parameterised GET routes | All 404; no 500; no leaked content |
| 8 | Browser check, 9 routes × 3 viewports | Status 200, no horizontal overflow, no console errors, no external request |
| 9 | Client fault injection (loading, 500, malformed, aborted) | Same results as before the upgrade |
| 10 | Load run (about 3,500 requests) | No error responses; memory in the same band as before (262–391 MB) |
| 11 | Strategy 11.4 SHA-256 | `d0170b40…3eb3f18`, unchanged |
| 12 | `src/lib/engine/analysis.ts` | Zero diff against HEAD |
| 13 | Protected data | No file under `.data/` or `.research-data/` modified, other than the already-documented items |
| 14 | `npm audit` | No critical or high advisory on `next`, and none on `zod` |

Gates 5 and 8 need the production server to run in mock mode with all credentials blank. That is the same configuration used for the earlier verification runs.

## 7. Risks and rollback

- **Risk:** the 16.4 line may change rendering or caching behaviour. Mitigated by gates 8 and 9, and by the browser check in §6.
- **Risk:** the typed route-context signature may change. Mitigated by gate 2.
- **Rollback:** the project is in git. `git checkout -- web/package.json web/package-lock.json` restores the pinned 16.3.8 manifest and lockfile. Do not run it without approval, because the working tree has other uncommitted changes that must be kept.

## 8. Dependencies on other work

- **Disk space.** The install and build need about 1 GiB of headroom. Use the approved cleanup in `DISK_SPACE_INVENTORY.md` first.
- **Network.** `npm install` needs the registry. Browser checks need Chromium, which the Tier 1 cleanup removes. Reinstall it with `npx playwright install chromium` after the upgrade if it was removed.

## 9. Decision requested

1. Approve the two version changes (`next` and `eslint-config-next` to 16.4.5).
2. Approve the network access for `npm install` on the approved disk cleanup.
3. Confirm that, after the upgrade, the verification in §6 is sufficient for this stage, or name any additional gate you require.
