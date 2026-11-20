# Project Tooling and Licences

Status: records what is installed and why. **No new packages were installed in this pass.** Each candidate in the brief was assessed from what is verifiable locally; anything not verifiable is marked as such.

## 1. Runtime and environment

| Item | Version | Notes |
|---|---|---|
| Node (Homebrew) | 24.5.0 | **Broken on this machine**: links `libsimdjson.26.dylib`, which is missing. Aborts some imports (exit 134). Not changed in this pass. |
| Node (used for tests and dev server) | 22.16.0 at `/usr/local/bin/node` | Works. Use `PATH=/usr/local/bin:$PATH` for test, typecheck and dev commands. |
| npm / npx | from the Node install in use | Must run under the working Node. |
| Python | 3.9.6 (system) | `pandas`, `numpy`, `TA-Lib` **not installed** |

Recommended fix (user action): `brew reinstall node`, or pin the project to Node 22 with an `.nvmrc` file. Not done here because it changes the system installation.

## 2. Direct project dependencies

Added in this phase: `lightweight-charts` 5.2.1 (exact pin, Apache-2.0), see §3 for the licence check.

Existing:

| Package | Version | Licence | Use |
|---|---|---|---|
| next | 16.3.8 | MIT | Application framework |
| react / react-dom | 19.2.8 | MIT | UI |
| recharts | 3.10.1 | MIT | Existing charts |
| lucide-react | 1.52.0 | ISC | Icons |
| typescript | 5.9.3 (dev) | Apache-2.0 | Typecheck |
| eslint | 9.39.5 (dev) | MIT | Lint |

Licences are as reported in each package's own `package.json` in `node_modules`.

## 3. Candidates assessed (not installed)

| Candidate | Licence (to verify on the package page) | Decision | Reason |
|---|---|---|---|
| TradingView Lightweight Charts 5.2.1 (installed, exact version) | Apache-2.0, verified from the installed package's package.json and LICENSE file. No NOTICE file ships with the package. The library's attribution logo is kept on (`attributionLogo: true`, default). | INSTALLED | Candlestick, line/area charts on the Stock V2 explorer. Attribution footer on the research layout: 'Charts: TradingView Lightweight Charts™ (Apache-2.0), © TradingView'. |
| Apache ECharts | Apache-2.0 | Not installed | Recharts already covers the current charts. Adding a second chart library needs a clear reason. |
| QuantStats | Apache-2.0 (per repository; verify) | Not installed | Python package. Would only be used as an independent check of metrics, not in the app. |
| TA-Lib | C library and Python wrapper; BSD-style licences (verify) | Not installed | The C library needs a native build. Indicators are already implemented and independently checked against a Python reimplementation. |
| pandas, numpy | BSD-3-Clause | Not installed | Not needed for the current independent check, which is plain Python. |
| QuantLib | BSD-style (verify) | Not installed | Heavy native dependency. Black-Scholes is implemented in-house with documented assumptions. |
| backtesting.py / VectorBT | AGPL / commercial-clause terms must be checked before use | Not installed | The simulator is in-house and tested. Licence terms need checking before any dependency is added. |

Licence text was not fetched in this pass. Items marked "verify" must be checked against each package's licence file before installation.

## 4. Internal tooling

- Tests: Node's built-in `node:test` runner with `--experimental-strip-types`. No test framework dependency.
- Route isolation: a static import-graph test (`src/app/route-isolation.test.ts`), no dependency.
- Research scripts: `scripts/stock-v2-research.ts`, `scripts/stock-v2-export-trades.ts`, `scripts/check-research-token.ts`.

## 5. Security notes

- No secrets are printed by the research scripts or pages. The token gate prints only a status word.
- Research pages make no broker or market-data request (verified by route-isolation tests and by request counts in the dev-server log).
- No order-placement endpoint or code exists; a test asserts this for the options engine and research routes.
