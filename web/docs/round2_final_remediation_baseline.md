# Round 2 Final Remediation — Safety Baseline

**Recorded:** 2026-11-03 (Asia/Kolkata)  
**Scope:** Documentation-only remediation. No production data or runtime activation.

## Repository state

- Branch: `main`
- Commit: `80f3eeeea990bf2b3b9a07d486bc9a934448b4d3`
- Upstream: `origin/main`
- Working tree: dirty before this session, with numerous tracked modifications and untracked files under `web/`. The complete pre-change inventory is the output of `git status --short --branch`; it was recorded before any session edit. Existing user changes were not cleaned, reset, or overwritten.
- Repository layout: the application and requested documents are under `web/`; paths in the task that begin with `src/` or `docs/` are relative to `web/`.

## Protected strategy baseline

- File: `web/src/lib/engine/strategy.ts`
- SHA-256 before remediation: `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18`
- Expected prefix: `d0170b40`
- Result: exact match. The file is out of scope for modification.

## Feature flags

Read-only searches, excluding `.data/`, found safe defaults in `ecosystem.config.cjs`, `.env.example`, and `playwright.config.ts`:

- `OPTION_QUOTE_LTT_ENABLED=false`
- `OPTION_QUOTE_CANARY_ENABLED=false`

The exported compile-time constant in `src/lib/services/optionContractLTT.ts` is also `false`. No environment values, credentials, or secrets were printed or changed.

## Runtime baseline

Read-only process, LaunchAgent, and listener checks reported:

- no paper runner or paper supervisor process matching the protected names;
- no option quote canary process matching the protected name;
- no loaded `com.upstox.paperlive` LaunchAgent;
- no listener on TCP port 3123.

No process was started or stopped by the baseline check.

## Production-data boundary

`.data/` was excluded from searches and was not listed, read, used as a fixture, migrated, repaired, or modified. All validation in this session must remain static or use synthetic fixtures in isolated temporary directories outside `.data/`.

## Baseline commands

```text
git status --short --branch
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
shasum -a 256 web/src/lib/engine/strategy.ts
rg -n --hidden --glob '!.git/**' --glob '!.data/**' --glob '!node_modules/**' 'OPTION_QUOTE_(LTT|CANARY)_ENABLED' web
ps aux | rg -i '[p]aper.*(runner|supervisor)|[c]anary|com\.upstox\.paperlive'
launchctl list | rg 'com\.upstox\.paperlive'
lsof -nP -iTCP:3123 -sTCP:LISTEN
```

These commands are read-only and made no network requests.
