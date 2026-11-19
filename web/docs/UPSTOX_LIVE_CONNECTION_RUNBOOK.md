# Upstox live connection: runbook (prepared, not executed)

Written for: the project owner. Status: **prepared**. Nothing in this runbook has made a live request.

## What was checked (no network)
- `npm run dev:upstox` runs `scripts/dev-upstox.mjs`. It is guarded by `scripts/lib/collectionGuard.mjs`: it exits with code 2 unless `MARKET_DATA_PROVIDER=upstox` **and** `UPSTOX_COLLECTION_ENABLED=true` are both set.
- `UPSTOX_COLLECTION_ENABLED` is read only by that guard. It does not start any collector.
- Credential **names** present in `.env.local`: `UPSTOX_CLIENT_ID`, `UPSTOX_CLIENT_SECRET`, `UPSTOX_REDIRECT_URI`, `UPSTOX_ANALYTICS_TOKEN`, `MARKET_DATA_PROVIDER`, `NEWS_API_KEY`. Values were not read.
- The stored token in `.data/upstox-token.json` expired on **2026-11-03** (checked by its expiry field only). A fresh login is required before the app can reach Upstox.
- The script's port is `3123` (`PORT` overrides it). The mock test server used `3150`.
- Protected routes (backtest, paper trading) now require an operator session before any handler runs.

## Steps (to be run by the owner)
1. **Stop any running dev server** on port 3123 or 3150 (`lsof -nP -iTCP:3123 -sTCP:LISTEN`). Stop it with the process id shown.
2. **Set the environment for this terminal only:**
   ```
   export MARKET_DATA_PROVIDER=upstox
   export UPSTOX_COLLECTION_ENABLED=true
   ```
   Do not set these in `.env.local`. Otherwise every start is live.
3. **Start:** `npm run dev:upstox`
   - The app starts on port 3123.
   - If no valid token exists, the script opens the Upstox login page in your browser. Complete the login there. The token is written to `.data/upstox-token.json` (the real location; this replaces the expired token).
   - After login the script prints **one** live evaluation of NIFTY and BANK NIFTY. This is the only live request set made by the script. It is read-only: no orders.
4. **Stop:** press Ctrl+C in that terminal. Then confirm port 3123 is free.
5. **Return to mock mode:** close the terminal, or `unset MARKET_DATA_PROVIDER UPSTOX_COLLECTION_ENABLED`. Never commit these values.

## What this does not do
- No orders. No paper trades. The paper runner and collectors are not started by this command.
- The BSE SENSEX/BANKEX quote-key test is a separate step. It needs one more approval, and a valid token from step 3.

## Safety notes
- Keep `MARKET_DATA_PROVIDER=mock` in `.env.local` (its current value). Live mode is only for the session started above.
- If the login page does not open, use `npm run upstox:login` and then `npm run upstox:status`.
- If anything looks wrong (unexpected requests, unexpected labels), stop the server and report the output. Do not retry in a loop.

## Next, after a successful login
Reply with the one-line result of step 3 (connected or not). If connected, reply "approve BSE key request" to run the one approved quote-key check, which I will carry out and record.

## Correction: the analytics token (checked after the runbook was written)

- `.env.local` contains `UPSTOX_ANALYTICS_TOKEN` (set, not empty). It is a JWT whose expiry claim is **2027-11-03**, so it is not expired by its own date.
- **Priority:** `resolveCredential()` in `src/lib/services/upstoxAuth.ts` uses the analytics token **first**. The OAuth token in `.data/upstox-token.json` is used only when the analytics variable is empty.
- **Consequence:** a fresh OAuth login will not be used while the analytics variable is set. Step 3 of the runbook may not need a login at all.
- **Not yet verified:** whether Upstox accepts this token. Only a live verification request proves that, and it needs your approval.
- **Where it is used:** every Upstox market request through the app, and the collection scripts (`upstox-collect.ts`, `upstox-pilot-collect.ts`, `upstox-daily-universe-collect.ts`, `upstox-discovery.mjs`), which read it from `.env.local`.
- **To use the OAuth login instead:** the owner must remove or empty `UPSTOX_ANALYTICS_TOKEN` in `.env.local`. Do not do this without deciding which credential should be active.
- Its value was not printed or copied into any file.
