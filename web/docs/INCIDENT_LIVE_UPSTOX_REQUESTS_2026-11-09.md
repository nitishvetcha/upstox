# Incident: unintended live Upstox and external requests from a local dev server (2026-11-09)

Classification: **security and operational reliability finding.** Severity: **High** (live market-data requests were made with a live OAuth token, without the owner's approval, while the session was believed to be in mock mode). No order endpoint appears in the evidence. Market-data and instrument requests only.

Written for: the project owner.

## 1. Summary

- A `next dev` server already listening on `localhost:3123` answered one `GET /` request sent by the assistant during this session.
- The server then made **67 successful Upstox requests** and **8 external news requests** (ET, Mint, BusinessLine, BS, NewsAPI), as recorded in its own log.
- Count correction: an earlier estimate in this session said "about 75". The exact count from the preserved log is 67 Upstox requests.
- The assistant's own attempt to start a server on the same port failed with `EADDRINUSE`. That attempt sent no Upstox request.
- The assistant then tried to stop the existing process. The operating-system permission check denied the stop, so the assistant did not stop it.
- Later, the port was verified **free** by read-only checks (section 4). Who stopped the process, and when, is not known to the assistant.

## 2. Evidence (preserved, not modified)

| Item | Location | SHA-256 |
|---|---|---|
| Server log from the incident, including the failed start line | `scratchpad/devserver.log` (session scratchpad) | `3bafad3ba9be57f1459374685d6509bf8b698e97a570b80000a8ffe22977a08e` |

Log contents (counted with `grep -a`):

| Event | Count |
|---|---|
| `upstox_request` (all `ok: true`, all `status: 200`) | 67 |
| `news_request` | 8 |

Upstox requests by family:

| Endpoint family | Count |
|---|---|
| `/v2/market-quote/quotes` | 18 |
| `/v3/market-quote/quotes` | 6 |
| `/v3/historical-candle/…` (index, F&O and BSE variants, intraday and day) | 26 |
| `/v2/option/contract` | 6 |
| `/v2/option/chain` | 6 |
| `instruments/NSE.json.gz` (instrument master download) | 1 |
| **Total** | **67** |

Log lines show `"expiry": "2026-11-17"` etc. for option chains, and the server was logging `Environments: .env.local` in its startup block in the earlier run.

The log also records a failed `EADDRINUSE` line from the assistant's own start attempt, which is part of the same file. The log contains NUL bytes, so it must be read with `grep -a`. It was not edited.

Also preserved, unrelated to this incident but relevant to the pattern: `logs/dev-server.log` (dated 2026-11-05), which shows an earlier `next dev` run on port 3123 with live Upstox requests and the same `Environments: .env.local` startup block.

## 3. Origin of the process

- **Not started by the assistant.** The assistant's start attempt failed because the port was already in use.
- **Configuration that made it live:** `web/.env.local` contains `MARKET_DATA_PROVIDER=upstox`. Next.js loads `.env.local` for `next dev`, so a plain `npm run dev` runs in **live** mode. The server that caused this incident was therefore most likely started with the default developer configuration, which is live, not mock.
- **Unknown:** the exact start command, start time and owner of the process. The process no longer appears in `ps` or `lsof`, and its environment cannot be read now. The shell history did not contain a matching `next dev` or `npm run dev` command. The assistant did not inspect other history beyond that check.
- **Not conclusive:** whether the owner started it deliberately. The log's startup block and the earlier Nov 5 log suggest a developer session, not an automated process.

## 4. Port state (verified without sending any request)

Checked with `lsof -nP -iTCP:3123` and `netstat -an -p tcp`, both read-only. Both returned **no entries** for port 3123. The port was therefore free at the time of the check.

No request was sent to `localhost:3123` for this check. The assistant did not stop the process. The process is not listed by `ps` now.

## 5. Persistent process configuration (risk)

File: `~/Library/LaunchAgents/com.upstox.paperlive.plist`.

- Runs `scripts/run-paper-supervisor.mjs` under `/opt/homebrew/bin/node`.
- Sets `PORT=3123` and `NODE_ENV=production`.
- The supervisor starts `next start -p 3123` if the port is not in use, then starts `scripts/paper-live.mjs`, which is a paper-trading runner.
- `StartCalendarInterval`: Monday to Friday at 09:10 local time, with a comment saying 09:10 IST, which is 03:40 UTC.
- `KeepAlive` restarts it after a non-zero exit, with a 60-second throttle.

**Current status:** not loaded (`launchctl print` reports "Could not find service"). The plist is still installed. launchd will load it at the next login, which could start the supervisor and the paper runner on a weekday. **This is a persistence risk and needs the owner's decision.** The assistant has not modified or removed it.

Recommendation (requires approval): move the plist out of `~/Library/LaunchAgents`, or set it to disabled, unless the owner intends paper trading to run unattended. Paper trading and background processes are outside the approved scope.

## 6. Why mock mode did not prevent live requests (code analysis)

### 6.1 Confirmed gap: the mock gate is not global

- `src/lib/services/market.ts` defines `providerMode()`, which returns `upstox` only when `MARKET_DATA_PROVIDER === "upstox"`.
- The snapshot path (`market.ts` around line 53) checks `deps.mode === "mock"` and returns mock data without touching the network.
- **Other paths call the Upstox client directly and do not check `providerMode()`:**
  - `src/lib/services/stockService.ts` lines 150 and 161: `get(token, "/v2/market-quote/quotes", …)` and `upstoxHistoryFetcher(token)`.
  - `src/lib/services/optionContractLTT.ts` line 18: imports `get` from the Upstox client.
  - `src/lib/services/upstoxMarket.ts` is imported by `src/app/api/research/stock-candles/route.ts`, `src/app/api/research/stock-candles-range/route.ts`, `src/app/api/auth/health/route.ts` and `src/lib/services/backtestRequest.ts`.
  - `src/lib/services/futures.ts` line 76 downloads the instrument master (`instruments/NSE.json.gz`) with no provider gate in the file.
- `src/lib/engine/stockOpportunityEngine.ts` line 361 has a `providerMode()` guard, but only in `scanStocks`. Other functions in that file call Upstox without the guard.
- `src/lib/services/upstoxAuth.ts` supplies the token from `UPSTOX_ANALYTICS_TOKEN` or `.data/upstox-token.json` whenever a token exists. Nothing in that path checks the provider mode.

### 6.2 Root cause (most likely)

1. **Configuration:** `.env.local` sets `MARKET_DATA_PROVIDER=upstox`, so a plain `npm run dev` is live. A developer may believe they are in mock mode when they are not.
2. **Code:** the mock gate covers only the snapshot path. Stock, research, auth-health, option-contract and instrument paths reach Upstox directly whenever a token exists.

The exact route that produced each of the 67 requests has **not** been confirmed. That needs a controlled reproduction in an isolated environment with network-level blocking, which is not yet in place.

### 6.3 Why the offline tests did not catch this

- The offline test suite (`npm test`, 2,403 tests) sets `UPSTOX_TOKEN_FILE` to a nonexistent path and removes `UPSTOX_ANALYTICS_TOKEN`. With no token, the direct Upstox paths fail before any request is sent, so the tests pass.
- No test starts the real server, sends a request through the real routes, and asserts that zero Upstox hosts are contacted.
- **The passing offline tests are not evidence that live-request isolation works.**

## 7. Proposed fixes (not applied; need approval for anything touching trading logic or credentials)

1. **Single enforced gate:** route every Upstox HTTP call through one client that refuses to send when `providerMode() !== "upstox"`, and throws a typed error. Add a test that proves the refusal.
2. **Safe default:** make `.env.local` not enable live mode by default, or use a separate `.env.live` for live development. This changes configuration and needs the owner's approval.
3. **Network-level isolation for audits:** run audits with a proxy or firewall that blocks all non-localhost hosts, and log every blocked attempt. This is the only check that proves no live request was sent.
4. **Regression test:** start the app in mock mode behind the network block, request every API route, and assert zero blocked live hosts and zero `upstox_request` events.

## 8. Status of this incident

- Live requests: **occurred** (67 Upstox, 8 news), read-only market data and instruments, using the existing OAuth token. Token not modified.
- Process: **not listed and port 3123 free**, verified by read-only checks. Not stopped by the assistant. Cause of the stop: unknown.
- Persistent risk: **open**, the LaunchAgent plist is installed and needs the owner's decision.
- Code path: **partly confirmed** (gate gaps listed in 6.1). Exact route per request: **not yet confirmed**.
- Fixes: **proposed only**, awaiting approval.

## 9. Next steps (blocked on owner confirmation)

Browser audit and backend validation are blocked until the owner confirms that the port is free. The assistant has verified it, and asks the owner to confirm. After confirmation, the assistant will start an isolated mock-mode environment with network-level blocking of all non-localhost traffic, verify the block works, then run the browser audit.
