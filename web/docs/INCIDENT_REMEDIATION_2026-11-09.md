# Incident remediation record: live Upstox requests from a dev server (2026-11-09)

Companion to `INCIDENT_LIVE_UPSTOX_REQUESTS_2026-11-09.md`, which must not be edited. Written for: the project owner.

## 1. Status at a glance

| Item | Status |
|---|---|
| Port 3123 free | **PASS**, verified by `lsof` and `netstat` (read-only, no request sent) |
| Stray `/tmp_unused` | **PASS**: the file does not exist, so no removal was needed |
| LaunchAgent `com.upstox.paperlive` | **Not loaded**. Plist still installed. **Decision needed** (section 4) |
| Central gate on every Upstox HTTP call in `src` | **PASS** for unit and regression tests (8 new tests) |
| Default provider set to mock in `.env.local` | **Done** (one line changed). Not yet verified by starting a server |
| Network-level isolation (OS firewall or proxy) | **BLOCKED**: needs root or a sandbox, and your approval (section 5) |
| Browser audit | **BLOCKED** until network isolation is proven |
| Offline backend validation | Partly done (see section 3) |

## 2. Root cause (as established)

- `.env.local` set `MARKET_DATA_PROVIDER=upstox`, so `next dev` ran in live mode by default.
- The only mock check lived in the snapshot path (`market.ts`). Other paths called Upstox directly whenever a token existed (stock service, research routes, auth health, option contracts, instrument-master download).
- The offline tests removed the token, so they passed without proving that no request was sent.

## 3. Changes made

### 3.1 Central gate
- **New:** `src/lib/services/upstoxNetworkGate.ts`. `assertUpstoxNetworkAllowed(endpoint)` throws unless `MARKET_DATA_PROVIDER` is exactly `upstox`. It logs `upstox_blocked` with the endpoint only. It never logs a token.
- **Called before every Upstox HTTP call in `src`:**
  - `src/lib/services/upstoxMarket.ts` (`get`, the shared quote, option and candle client).
  - `src/lib/services/futures.ts` (instrument-master download; this path needs no token, so the gate is essential).
  - `src/lib/adapters/upstoxHistoricalOptionsAdapter.ts` (`get` helper).
- **Not covered by this gate, by design:** news providers (`newsProvider.ts`, `rssNewsProvider.ts`). They are not Upstox hosts. They need their own provider setting; see section 6.

### 3.2 Regression tests
- **New:** `src/lib/services/upstoxNetworkGate.test.ts`, 8 tests. `fetch` is replaced with a recorder, and a token is deliberately present.
  - Gate refuses for unset, `mock`, and `UPSTOX` (wrong case).
  - Gate allows only `upstox`.
  - Market quote, historical candle and instrument-master paths each send **0** requests in mock mode.
  - The `upstox` path still reaches `fetch` (exactly one request), so the gate is not over-strict.

### 3.3 Existing tests updated (setup only, no assertions changed)
After the gate was added, 62 existing tests failed. They stub `fetch` to simulate Upstox responses and ran with the provider unset. They now set `MARKET_DATA_PROVIDER="upstox"` at the top of the file, with a comment. Files:

- `src/lib/phase30_4.test.ts`, `historicalProbeCodes.test.ts`, `runtimeTrust.test.ts`, `research/researchRunner.test.ts`, `services/candleFreshnessAttribution.test.ts`, `cacheBounds.test.ts`, `marketData.test.ts`, `futures.test.ts`, `breadthTimestamps.test.ts`, `breadth.test.ts`, `candleFreshnessPolicy.test.ts`, `contractFreshnessReconciliation.test.ts`, `provenanceLabels.test.ts`, `technical.test.ts`, `technicalFetchGate.test.ts`.
- `services/multiSessionPaperEvaluation.test.ts`: its `beforeEach` previously **deleted** `MARKET_DATA_PROVIDER`. It now sets `upstox`, because its S04 scenario depends on the live path. Its network guard still blocks any real outbound call.

**Limitation of this fix:** these tests still rely on fetch stubs. They do not prove network isolation. They prove that the gate is reached and that the stubs answer.

### 3.4 Development default
- `web/.env.local`: `MARKET_DATA_PROVIDER=upstox` changed to `MARKET_DATA_PROVIDER=mock`, with a comment. No other line was read or changed. Secret-bearing lines were not printed.
- Live use requires an explicit `export MARKET_DATA_PROVIDER=upstox` in the shell. Exported variables take precedence over `.env.local`.

## 4. LaunchAgent decision needed

`~/Library/LaunchAgents/com.upstox.paperlive.plist` is installed but not loaded. Once loaded (for example at login) it would:
- run `scripts/run-paper-supervisor.mjs` on weekdays at 09:10 local time;
- start `next start` on port 3123 if the port is free;
- start `scripts/paper-live.mjs`, a paper-trading runner;
- restart on failure after 60 seconds.

It sets no `MARKET_DATA_PROVIDER`. After section 3.4, `.env.local` makes it mock, but that is not a guarantee.

**Recommendation:** move it out of `~/Library/LaunchAgents` (keep a copy), unless you want unattended paper trading. This needs your approval. I have not changed it.

## 5. Network-level isolation: blocked, with options

Application-level gating is not proof of isolation. Proof requires an outbound block below the application. Options:

1. **`pf` firewall rule** that blocks outbound traffic from the dev-server user except to `127.0.0.1` and `::1`. Requires `sudo` and a rule file. **Needs your approval and password.**
2. **Local forward proxy** that refuses non-localhost hosts, with `HTTP_PROXY`/`HTTPS_PROXY` set. Node's built-in `fetch` ignores these variables unless configured, so this only works with a proxy-aware client or a wrapper. Not yet built.
3. **Container or VM** with no default network route. Not available in this environment.

I recommend option 1 for a single audit session, with the rule removed afterwards. I will not run `sudo` without your explicit instruction.

## 6. Open items

- **News providers** (NewsAPI, RSS) are external and are not gated by the Upstox gate. Under isolation they must be blocked by the network rule. Their own mock setting should also refuse them in mock mode. Not yet implemented.
- **Scripts** that call Upstox directly (`scripts/upstox-*.ts`, `options-research-inventory.ts`, `sync-constituents.mjs`, `backfill-intraday-bars.mjs`, and others) are outside the `src` gate. They are collectors and must not run without approval. Not gated yet.
- **Exact route per incident request** is still unconfirmed. It needs a controlled reproduction under isolation.

## 7. Test results

- `upstoxNetworkGate.test.ts`: 8 of 8 pass.
- Full offline suite (`npm test`): **2,411 of 2,411 pass**, 0 fail, 0 skipped. Previously 2,403.
- `npx tsc --noEmit`: no output (clean).
- These results are offline and stub-based. They are not evidence of network isolation.

## 8. Git note

Git status showed 336 entries before this work and 341 now. Three new files were created for this remediation: the gate module, its test, and this record (the incident record already existed). Other changes are modifications to tracked or already-untracked files. I did not take a snapshot before starting, so I cannot attribute the remaining difference exactly. Nothing was staged or committed.

## 9. Next steps (need approval)

1. Approve or decline the LaunchAgent change in section 4.
2. Choose a network-isolation method in section 5, and authorise any `sudo` step.
3. After isolation is in place: start the mock server, confirm the block, then run the browser audit at 1440, 768 and 390 pixels.
