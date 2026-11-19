# Phase 8 — Evidence readiness (no collection started; awaiting owner approval)

**Purpose:** establish what market evidence is missing, how it would be collected, and what counts as sufficient, before any further simulation. No live request has been made for this document. No production change. Engine NO-GO.

## 1. What the project has today
| Data | Status | Evidence |
|---|---|---|
| Option bid and ask per contract | Captured by the live quote path when online | `upstoxMarket.ts` lines ~190–191 (`bid_price`, `ask_price`) |
| Market depth (order book levels) | **Not captured** | No depth field in `upstoxMarket.ts` or `types.ts` |
| Option-chain history (snapshots over time) | **Not stored** | Chain is fetched on demand; only derived research tables exist |
| Implied volatility per contract | Captured when provided; Greeks **not computed** | `upstoxMarket.ts` comment (line ~165) |
| Last trade time per contract | Captured when provided; **not present** for the index chain endpoint | Stored audit report (D-04, D-05) |
| Historical option bid/ask | **None** in the repository | Bhavcopy has no bid/ask (see `RISK_ENGINE_AUDIT`, data audit) |
| Index and futures intraday bars | Stored for research; **index volume is zero** | Index feasibility report; technical audit D-03 |
| Verified exchange and broker costs by effective date | **Not verified** | `transactionCosts.ts` header |
| Holdout-safe data | **None** (both windows retired) | `HOLDOUT_GOVERNANCE_DECISION_2026-11-11.md` |

## 2. What is missing for Phase 8
1. Option quotes with bid, ask, bid size, ask size, and last trade time, for both legs of each candidate width, at fixed intervals during market hours.
2. Market depth (at least five levels per side) for the ATM and nearest legs.
3. Option IV and Greeks observed or derived from the same snapshot.
4. Index spot and futures at the same timestamps.
5. Expiry-day observations (separately labelled).
6. Dated official cost and charge schedules.
7. Fill evidence, if any future paper trading produces it (none exists now).

## 3. Proposed collection design (requires owner approval before any live request)
- **Mode:** read-only snapshot collector. No orders. Gated by the existing collection guard (`UPSTOX_COLLECTION_ENABLED`, `MARKET_DATA_PROVIDER=upstox`). Does not start the paper runner or any existing collector.
- **Instruments:** NIFTY and BANK NIFTY ATM ± 5 strikes, CE and PE, current weekly/monthly expiry only. Futures and index spot at the same timestamps.
- **Frequency and window:** every 5 minutes, 09:15–15:30 IST, weekdays. Expiry-day snapshots stored under their own label.
- **Storage:** append-only, one file per trading day, SHA-256 per file, raw response kept with timestamp.
- **Request volume to verify:** roughly 2 indices × 22 strikes × 2 sides × 76 snapshots ≈ 6,700 contract quotes per day. The batch size and rate limits must be checked against Upstox documentation before running.
- **Depth:** requires a request form that returns depth. Must be confirmed against the API before collection. If unavailable, depth stays NOT TESTED.
- **Failure handling:** token expiry (03:30 IST), rate limits and gaps are logged as gaps. Gaps are never filled.

## 4. Sufficiency criteria (proposed; to be fixed by the owner before collection starts)
| Criterion | Proposed minimum |
|---|---|
| Trading sessions with full coverage | At least 60, covering trending, sideways, volatile and expiry sessions |
| Snapshot coverage per session | At least 95% of scheduled snapshots present |
| Bid and ask present on both legs | At least 98% of snapshots for the legs of each candidate width |
| Depth present | At least 90% of ATM-leg snapshots, if depth is available; otherwise depth stays NOT TESTED |
| Timestamp gaps | No gap longer than 15 minutes inside the session, except logged outages |
| Regime coverage | Each regime in the expanded path taxonomy observed at least a set minimum number of times |
| Holdout separation | Phase 8 data is calibration data for execution assumptions only. It cannot serve as the holdout |

These thresholds are proposals. They must be approved before collection starts, so they cannot be adjusted after the data is seen.

## 5. What Phase 8 will not do
- Place orders, or any automatic execution.
- Use historical holdout data.
- Change production formulas, width rule, Strategy 11.4 or risk limits.
- Treat collected data as evidence of profitability.

## 6. Decisions needed from the owner
1. **Approve or decline** the read-only collection design in section 3, including the live request volume.
2. **Approve the sufficiency criteria** in section 4 (or amend them) before collection starts.
3. **Confirm** that Phase 8 data is calibration only and that the holdout will be defined after the freeze in Phase 9.
4. **Provide dated cost schedules** (or approve using the configured rates as labelled assumptions).

## 7. Readiness verdict
Phase 8 is ready to start once decisions 1 and 2 are made. Until then, evidence is missing and no simulation should be treated as execution evidence. The engine stays NO-GO.
