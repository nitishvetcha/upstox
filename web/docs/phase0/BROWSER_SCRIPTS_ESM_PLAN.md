# Browser-check scripts: inspection and ESM conversion plan

Status: **inspection and plan only.** No script was executed, no server started, no file changed.

## 1. Inventory (all 11 under `tests/browser/`, verified by reading)

| Script | Default BASE | Arguments (positional) | Env used | Other requires |
|---|---|---|---|---|
| chain-selection.probe.cjs | `http://127.0.0.1:3150` | BASE, TOKEN | none | playwright |
| contract-scenarios.check.cjs | 3150 | BASE, TOKEN, SHOTS | none | playwright |
| contract-selection.check.cjs | 3150 | BASE, TOKEN, SHOTS | none | playwright |
| csp-measure.check.cjs | 3150 | BASE, PIN, SHOTS | `CHROME_PATH` | playwright |
| journal-filters.check.cjs | 3150 | BASE, TOKEN | `CHROME_PATH` | playwright |
| login-logout.check.cjs | 3150 | BASE, TOKEN, SHOTS | `CHROME_PATH` | playwright |
| option-chain.check.cjs | 3150 | BASE, TOKEN, SHOTS | none | playwright |
| refresh.check.cjs | 3150 | BASE, PIN | `CHROME_PATH` | playwright |
| saved-picks.check.cjs | **3125** | BASE, TOKEN, SHOTS | `SAVED_PICKS_SCRATCH`, `CHROME_PATH` | playwright, fs |
| state-sweep.check.cjs | 3150 | BASE, TOKEN, SHOTS | `CHROME_PATH` | playwright |
| technical-chart.check.cjs | 3150 | BASE, TOKEN, SHOTS | `CHROME_PATH` | playwright |

Observations:
- Every script takes BASE as the first positional argument, with a loopback default. Some use `input[name=pin]`, others `input[name=token]`. Login UI has changed since some scripts were written, so some may fail for that reason alone. This needs checking when they run.
- Every script blocks non-BASE requests with a route handler, so they make no external calls. The `data:` exception is kept.
- `chromium.launch` uses `CHROME_PATH` when set, otherwise Playwright's bundled browser.
- Scripts write screenshots to `SHOTS` (default `.`). Writing to the project root is a side effect to avoid.

## 2. Conversion plan (ESM, behaviour preserved)

1. Rename each `*.cjs` to `*.mjs`, or keep `.cjs` and add `"type"` handling. Owner's preference: rename to `.mjs` to match `scripts/` (which already uses `.mjs`).
2. Replace `const { chromium } = require("playwright")` with `import { chromium } from "playwright"`. Replace `require("fs")` with `import fs from "node:fs"`.
3. Replace `module.exports` (if any) with `export`. None was found in this inspection; confirm per file.
4. Keep `process.argv` handling, defaults, env names and output unchanged.
5. `__dirname`, if used, becomes `import.meta.dirname` (checked per file).
6. Add no lint suppressions.

## 3. Verification plan (requires separate approval; not run)

For each converted script, in order:
1. `node --check <file>` (syntax only, no server).
2. Lint: `npx eslint tests/browser/` after conversion.
3. Execute with its normal invocation against a local dev server on 127.0.0.1 only. Commands are in section 4. Requires approval, because it starts a server and opens a browser.

## 4. Setup and test commands (for approval; not executed)

```
# 1. Start the local app on loopback only (dashboard, mock market data only if MARKET_DATA_PROVIDER=mock)
npm run dev -- -p 3150        # uses NEXT dev server on 127.0.0.1:3150

# 2. Run one script, e.g.
node tests/browser/login-logout.check.cjs http://127.0.0.1:3150 "<operator token>" /tmp-screens
```

External effects to approve:
- Starts a local Next.js dev server (not a production process; not a LaunchAgent).
- Launches a headless browser (Chromium via Playwright). Uses `CHROME_PATH` if set.
- Writes screenshots to the directory passed as SHOTS.
- The `TOKEN` / `PIN` arguments are operator credentials for the local app only. They must not be recorded in shell history or committed.
- No Upstox API call is made by these scripts when MARKET_DATA_PROVIDER=mock. With MARKET_DATA_PROVIDER=upstox, the app would call Upstox, so the mock setting must be confirmed first.

## 5. Preconditions for approval

- Confirm `.env.local` sets MARKET_DATA_PROVIDER=mock for this run (or document why not).
- Confirm the operator PIN or token to use, supplied by the owner at run time.
- Confirm the dev server is not the one that runs the paper-live job.
