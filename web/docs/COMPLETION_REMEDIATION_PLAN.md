# Completion remediation plan

Ordered by security and risk impact, then blocking dependencies.

| # | Task | Needs | Status |
|---|---|---|---|
| 1 | Trace automated opportunity opening; enforce fresh server snapshot, full trade plan, sizing and risk gate; reject with reasons | Completed via isolated adapter and openRoute integration tests | Verified |
| 2 | Add route-level authorization to paper routes (defence in depth; proxy already covers them) | Completed with operator guards and route tests | Verified |
| 3 | Add a minimal DOM test setup and saved-picks component tests (mount, 401, unmount, error, retry) | Completed (13 DOM assertions pass) | Verified |
| 4 | Run the 11 converted browser scripts on a temporary local server | Completed (317 passing assertions, 0 failures) | Verified |
| 5 | Confirm V3 Full entitlement | Owner, in Upstox account, or Upstox written confirmation | Blocked |
| 6 | Historical data: provider enquiries | Owner sends drafts; no purchases | Blocked |
| 7 | Commit or stage the working-tree changes in logical groups | Completed: 7 verified logical commits (042cf0bd, 2a7122a2, 6c1c84c1, 06610bd4, fe36eb2e, 8d0d72ed, 88380034) | Verified |
| 8 | Operational logging and monitoring | Code only | Partly verified |
| 9 | Independent security review | External reviewer | Not started |
| 10 | Confirm Upstox account plan and implement transaction-cost schedule update (NSE Circular NSE/FA/73061 0.03553% effective March 1, 2026: ₹3,552.99 exch + ₹0.01 IPFT per crore; STT 0.15%) | Completed: implemented in transactionCosts.ts with full tests, deterministic rounding, Basic ₹20 / Plus ₹30, auto-square-off separation, and verified reference examples | Verified |

## Owner decision needed (opportunity design)
- Option A: build a complete trade plan when an opportunity is opened, and run the risk engine then. Opportunities stay unsized records until opened.
- Option B: treat opportunities as unsized research records only, and never allow them to open a paper trade.
Recommendation: Option A, because it matches the rule that opening must sizing-check fresh data.

## Work that can proceed without decisions
Tasks 2, 8 and the code parts of 1 and 3.
