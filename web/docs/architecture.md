# SYSTEM ARCHITECTURE & TECHNICAL SPECIFICATION

## Overview
Upstox Analyzer is an automated option and stock opportunity analysis, recommendation, paper trading, and multi-session evidence engine for Indian equity markets (NSE).

The system operates strictly in **PAPER-TRADING & AUDIT MODE**, featuring **0 real order endpoints**, **0 execution functions**, and **0 broker order placements**.

---

## 1. System Architecture Flow

```text
               Upstox OAuth (03:30 IST Daily Expiry)
                                │
                                ▼
                       Market Data Service
           (Live Index Spot, Option Chain & Technicals)
                                │
                                ▼
                   Strategy & Technical Engines
      (VWAP, EMA, Supertrend, ATR, Option Chain Analytics)
                                │
                                ▼
         Opportunity Engines (v20.1 Options & Stock Scanners)
      (Multi-factor scoring, Grade A/B/C, Risk/Reward Gates)
                                │
                                ▼
                 Accepted Opportunity Normalization
                                │
                                ▼
                     Paper Opportunity Store
                    (.data/paper-opportunities)
                                │
                                ▼
                    Paper Trade Monitor Runner
              (Idempotent price monitoring & triggers)
                                │
                                ▼
                 Lifecycle State Machine & Events
                (OPEN → T1_HIT / T2_HIT / STOP_HIT)
                                │
                                ▼
                Multi-Session Evidence Store & UI
         (.data/paper-sessions & /opportunity-journal)
```

---

## 2. Core Service Responsibilities

### Upstox Authentication (`src/lib/services/upstoxAuth.ts`)
- Implements OAuth 2.0 authorization-code flow.
- Token expires at 03:30 IST every morning.
- Server-side token storage in `.data/upstox-token.json`. Token and client secrets never exposed to browser client components.

### Market Data Layer (`src/lib/services/market.ts` & `upstoxMarket.ts`)
- Serves live index spot quotes, complete option chains, intraday/daily candles, market breadth, and news sentiment.
- Automatic fallback to mock provider when unauthenticated or during market closure.

### Opportunity Engines (`src/lib/engine/`)
- `opportunityEngine.ts` (v20.1): NIFTY / BANKNIFTY Options Opportunity Engine. Evaluates call/put options across strike selection, IV percentile, delta, OI build-up, and signal agreement.
- `stockOpportunityEngine.ts`: Intraday & Swing Stock Scanner. Scans NSE liquid stock universe for VWAP pullbacks, momentum breakouts, and trend continuations.
- `longTermEngine.ts`: Fundamental & Long-Term Stock Screener.

### Paper Trading & Lifecycle (`src/lib/services/`)
- `liveOpportunityCollector.ts`: Periodically runs during market open, validates `LIVE` data quality, deduplicates against existing open/terminal setups, and creates paper trades.
- `paperOpportunityStore.ts`: Manages paper trade persistence in `.data/paper-opportunities/popp_<id>.json`. Preserves immutable entry trade plan snapshot.
- `paperOpportunityMonitor.ts`: Idempotent state machine evaluating market prices against entry, T1, T2, stop, and expiry rules. Updates MFE (Max Favorable Excursion) and MAE (Max Adverse Excursion).
- `paperTradeMonitorRunner.ts`: Batch evaluation loop executing monitoring cycles over all OPEN paper opportunities.
- `sessionEvidenceStore.ts`: Tracks session-level evidence per IST date (`YYYY-MM-DD`). Deduplicates same-day reruns and calculates multi-session statistics (Win Rate, Avg R, Expectancy, Profit Factor, Max Drawdown).

---

## 3. Strategy & Engine Dual-Version Concepts

1. **Version 20.1 (Current Opportunity Engine)**:
   - Primary live option and stock scanner.
   - Dynamic scoring, contract selection, quality grades (A, B, C), and R:R filters.
2. **Version 11.4-frozen (Legacy Strategy Version)**:
   - Preserved for historical benchmark compatibility and walk-forward verification.
   - Scoring, rules, and risk constraints strictly frozen.

---

## 4. Primary API Endpoints

- `GET /api/auth/status` — Checks Upstox OAuth token validity.
- `POST /api/paper-opportunities/collect` — Triggers 1 live collection cycle.
- `POST /api/paper-opportunities/monitor` — Triggers 1 paper trade evaluation pass.
- `GET /api/paper-opportunities/sessions` — Surfacing multi-session evidence & session audit logs.
- `GET /api/opportunities/daily-summary` — Surfacing today's paper trade summary.

---

## 5. Operational Commands

```bash
# Check Upstox OAuth token status
npm run upstox:status

# Initiate Upstox OAuth login flow
npm run upstox:login

# Run 1 live opportunity collection cycle
npm run paper:collect

# Run 1 open paper trade evaluation pass
npm run paper:evaluate

# Run collect + evaluate + summary pass
npm run paper:cycle

# Run continuous live collection & evaluation loop during market hours
npm run paper:live
```

---

## 6. Safety & Paper-Only Guarantees

- **Order Placement API Endpoints**: 0
- **Order Execution Functions**: 0
- **Real Orders Placed**: 0
- **Automated Live Trading Calls**: 0
