# Options Analyzer (web)

Decision-support and paper-trading dashboard for NIFTY 50 and BANK NIFTY options.
Not a profit guarantee; it never places real orders.

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # engine checks (Node 24, no extra deps)
```

Runs on clearly labelled **mock data** until the Upstox service exists (phase 2).

## Layout

| Path | What |
| --- | --- |
| `src/lib/engine/analysis.ts` | Option-chain metrics (PCR, max pain, support/resistance, expected move), 7-factor score, market regime |
| `src/lib/engine/strategy.ts` | Strategy candidates by regime, exits, liquidity/RR filters, TRADE / WAIT / NO TRADE, recommendation of the day |
| `src/lib/services/market.ts` | The only data entry point for UI and API. Swap mock → Upstox here |
| `src/lib/services/mock.ts` | Mock snapshots; option chain priced with Black-Scholes |
| `src/app/api/analysis/[index]` | `GET /api/analysis/nifty`, `/api/analysis/banknifty` |
| `src/app/api/recommendations/today` | `GET` recommendation of the day |
| `src/lib/services/upstoxAuth.ts` | OAuth: authorize URL, code exchange, token store and expiry |

## Upstox login

Open http://localhost:3123/api/auth/login, sign in on Upstox, and you land back on the dashboard.
The token is stored server-side in `.data/upstox-token.json` (gitignored, mode 600) and expires at 03:30 IST.
`GET /api/auth/status` shows the connection; `POST /api/auth/logout` clears it.

Secrets live in `.env.local` (see `.env.example`) and are read only on the server.
