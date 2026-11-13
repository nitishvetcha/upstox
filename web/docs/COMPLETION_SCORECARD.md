# Completion scorecard

Status values:
- Verified = 1.0 (deterministic test suite + automated runner verification)
- Implemented / partly tested = 0.5 (code complete, partial test harness or isolated validation)
- Partial = 0.25 (incomplete coverage, dependency on unverified components or missing provider features)
- Blocked / not implemented = 0.0 (unmet external dependency, blocked provider access, or unwritten code)

Each row score is `Weight × Multiplier`. The category score is the sum of row scores divided by the total category weight (100).

---

## A. Application engineering (Weight: 100)

| Area | Weight | Status | Multiplier | Score | Evidence |
|---|---|---|---|---|---|
| Authentication and operator sessions | 8 | Verified | 1.0 | 8.0 | Operator PIN/token validation, lockout, session cookies, auth audit pass |
| Protected route coverage | 6 | Verified | 1.0 | 6.0 | Route-level `requireOperator` on all write routes + Next.js proxy |
| Market-data integration (Upstox) | 10 | Implemented / partly tested | 0.5 | 5.0 | Live REST verified; no live WebSocket |
| Data provenance labels | 8 | Implemented / partly tested | 0.5 | 4.0 | Server provenance, MOCK vs LIVE display badges verified |
| Indicators (EMA, RSI, ATR, MACD) | 6 | Verified | 1.0 | 6.0 | Hand-derived known-answer reference tests pass |
| Strategy engine functionality | 6 | Implemented / partly tested | 0.5 | 3.0 | Scoring, regimes, trade plan generation pass deterministic tests |
| Breadth and news | 4 | Partial | 0.25 | 1.0 | Constituents sync and news sentiment work with fallback |
| Risk management | 8 | Verified | 1.0 | 8.0 | 1% risk limit, sizing capacity, zero-lot rejection, open-risk cap pass |
| Paper trading | 8 | Implemented / partly tested | 0.5 | 4.0 | Opening workflow & ledger rollback pass via isolated adapter |
| Backtesting | 6 | Implemented / partly tested | 0.5 | 3.0 | Next-bar execution model and walk-forward engines run |
| Storage and integrity | 8 | Partial | 0.25 | 2.0 | Active JSON store verified; SQLite isolated only |
| Automated testing | 6 | Verified | 1.0 | 6.0 | 2,876 regression + 13 DOM + 13 integration + 317 browser assertions pass |
| Lint and code quality | 3 | Implemented / partly tested | 0.5 | 1.5 | 0 project errors; 86 Next.js/TS unused-parameter warnings |
| Frontend workflows | 5 | Verified | 1.0 | 5.0 | 11 browser test scripts pass across desktop, tablet, and mobile |
| Error handling and recovery | 5 | Implemented / partly tested | 0.5 | 2.5 | Atomic write failure rollback, fallback provider gates pass |
| Operational logging and monitoring | 3 | Implemented / partly tested | 0.5 | 1.5 | Redacted structured logging active; startup/shutdown logged |
| **Total Engineering Score** | **100** | — | — | **66.5%** | *(Sum of row scores: 66.5 / 100)* |

---

## B. Strategy validation (Weight: 100)

| Area | Weight | Status | Multiplier | Score | Evidence / Limitation |
|---|---|---|---|---|---|
| Historical data availability and quality | 15 | Implemented / partly tested | 0.5 | 7.5 | Expired-option candles available; no bid/ask or full-chain OI |
| Strategy input completeness | 15 | Partial | 0.25 | 3.75 | Intraday order book, historical Greeks, and VWAP unavailable |
| Indicator correctness | 5 | Verified | 1.0 | 5.0 | Verified against standard formulas and hand references |
| Entry and exit validation | 10 | Partial | 0.25 | 2.5 | No historical bid/ask to verify realistic fill execution |
| Options execution assumptions | 10 | Blocked | 0.0 | 0.0 | Cannot simulate realistic fill queues or slippage historically |
| Position sizing and risk | 10 | Implemented / partly tested | 0.5 | 5.0 | Formulas verified mathematically; unverified in live market |
| Historical backtesting | 10 | Partial | 0.25 | 2.5 | Model-derived backtest complete, but input data is synthetic |
| Out-of-sample testing | 10 | Blocked | 0.0 | 0.0 | Prior holdout data was compromised; no frozen holdout exists |
| Sensitivity and robustness | 5 | Blocked | 0.0 | 0.0 | Full parameter perturbation not conducted on live data |
| Research evidence quality | 10 | Partial | 0.25 | 2.5 | Pilot analysis only; unconfirmed statistical edge |
| **Total Strategy Validation** | **100** | — | — | **28.75%** | *(Sum of row scores: 28.75 / 100)* |

---

## C. Production readiness (Weight: 100)

| Area | Weight | Status | Multiplier | Score | Evidence / Blocker |
|---|---|---|---|---|---|
| Security audit | 20 | Partial | 0.25 | 5.0 | Internal token/PIN security implemented; no 3rd-party audit |
| Provider entitlement and licensing | 20 | Blocked | 0.0 | 0.0 | Upstox V3 Full-mode entitlement unconfirmed in writing |
| Reliability and recovery | 15 | Partial | 0.25 | 3.75 | Fallback logic and persistence failure recoveries pass |
| Monitoring and operational controls | 10 | Blocked | 0.0 | 0.0 | No external alerting (PagerDuty, Prometheus, or health pings) |
| Deployment readiness | 10 | Blocked | 0.0 | 0.0 | No production deployment pipeline; local execution only |
| Backup and rollback | 10 | Partial | 0.25 | 2.5 | Manual file-copy backup tested; no automated snapshots |
| Independent final verification | 15 | Blocked | 0.0 | 0.0 | Strategy edge unproven; live-order execution disabled |
| **Total Production Readiness** | **100** | — | — | **11.25%** | *(Sum of row scores: 11.25 / 100 — HARD NO-GO)* |

---

## 3. Overall score
Not reported. Combining the three areas would obscure critical blockers in strategy validation and production readiness.

## 4. Primary Blockers Remaining
1. Upstox V3 Full market data entitlement unconfirmed with the broker.
2. Historical option bid/ask spreads, full-chain open interest, and observed Greeks are unavailable from the broker REST API.
3. No frozen out-of-sample holdout dataset exists (prior holdout compromised).
4. Independent external security review not yet conducted.
5. Account-plan live execution confirmation (default remains UNKNOWN / OWNER_CONFIRMATION_REQUIRED; Plus fees active as conservative research fallback).

## 5. Engineering Closeout Completed
- Approved transaction-cost model implemented and verified (NSE Circular NSE/FA/73061 0.03553% effective March 1, 2026: ₹3,552.99 exch + ₹0.01 IPFT/cr; STT 0.15%; Basic ₹20 / Plus ₹30; auto-square-off separation).
- Verified G1–G6 changes committed across 7 logical units with clean index and protected archives intact.
- Production readiness remains strictly HARD NO-GO until strategy validation and operational blockers are resolved.



