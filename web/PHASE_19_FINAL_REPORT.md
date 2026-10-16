# PHASE 19 FINAL REPORT — Opportunity Engine & Live Recommendation Redesign

## 1. Phase Status

```
PASS
```

Opportunity engine built and tested. 990/990 tests. TypeScript 0 errors. Build PASS.

---

## 2. What Was Built

### Core Engines

**`src/lib/engine/opportunityEngine.ts`** — OPTIONS_INTRADAY_ENGINE (P1)
- Version: `OPPORTUNITY_ENGINE_VERSION = "19.0"` (independent of `11.4-frozen`)
- Evaluates all liquid option contracts within ±7 strikes of ATM
- 5-component opportunity score: direction base (35) + liquidity (25) + delta quality (15) + IV attractiveness (15) + proximity to ATM (5) − event risk penalty (0–20)
- Direction derived from existing `analyzeMarket()` — no strategy changes
- Hard filters: minOI=50, minVolume=5, maxSpread=12%, minDelta=0.10, maxDelta=0.80, minR:R=1.0
- EVENT_RISK: **penalty** (12–20 pts), not automatic WAIT — contracts still returned, user decides
- Returns top 3 ranked contracts with full entry/stop/target1/target2/R:R/breakeven
- MOCK/EOD/STALE data: engine runs but `source` field reflects data quality

**`src/lib/engine/stockOpportunityEngine.ts`** — STOCK_INTRADAY_ENGINE (P2) + STOCK_SWING_ENGINE (P3)
- Version: `STOCK_OPPORTUNITY_VERSION = "19.0"`
- Single batch API call for all NIFTY 50 stocks (`/v2/market-quote/quotes` comma-separated keys)
- Intraday scoring: momentum (change%), HOD/LOD position, volume
- Swing scoring: daily change magnitude + closing position vs day range
- Returns top 3 per engine with entry/stop/target/R:R
- Graceful UNAVAILABLE handling (Upstox not connected)

---

## 3. API Routes Created

| Route | Engine | Priority |
|---|---|---|
| `GET /api/opportunities/options?underlying=nifty` | OPTIONS_INTRADAY_ENGINE | P1 |
| `GET /api/opportunities/options?underlying=banknifty` | OPTIONS_INTRADAY_ENGINE | P1 |
| `GET /api/opportunities/stocks/intraday` | STOCK_INTRADAY_ENGINE | P2 |
| `GET /api/opportunities/stocks/swing` | STOCK_SWING_ENGINE | P3 |
| `GET /api/opportunities/stocks/long-term` | LONG_TERM_ENGINE (data pending) | P4 |
| `GET /api/opportunities/top` | Aggregator: all 4 engines, best pick | — |

All routes: `export const dynamic = "force-dynamic"`.

---

## 4. Priority Design

### Options (P1)
- Full options chain evaluation with contract ranking
- Opportunity score 0–100 independent from 11.4-frozen strategy score
- EVENT_RISK is a score penalty (−12 HIGH, −20 EXTREME) — not a hard block
- `analyzeMarket()` reused, no strategy changes

### Stock Intraday (P2) + Swing (P3)
- Single batch API call for all 50 NIFTY 50 stocks
- Basic scoring from OHLC quote data (no per-stock technicals — would require 50 API calls)
- Graceful degradation when market is CLOSED or Upstox disconnected

### Long-Term (P4)
- Returns data-availability metadata (CONNECTED_NO_HISTORY / UNAVAILABLE)
- Pending historical candle pipeline confirmation for full NIFTY 50

### Top Aggregator
- Runs all 4 engines in parallel via `Promise.all`
- Options get +10 priority bonus
- Returns best single opportunity with cross-engine summary

---

## 5. Event Risk Behaviour (Key Difference from 11.4-frozen)

| System | EVENT_RISK behaviour |
|---|---|
| 11.4-frozen strategy | **Hard block** — WAIT decision, no trade returned |
| Opportunity Engine v19.0 | **Penalty** — score reduced by 12–20 pts, contracts still returned |

This is intentional: the opportunity engine answers "what's available" not "should I trade now". The 11.4-frozen strategy retains its protective behaviour.

---

## 6. Score Architecture

```
Opportunity Score (0–100):
  Direction base:     up to 35 pts  (from analyzeMarket() total, scaled)
  Liquidity:          up to 25 pts  (OI + volume + spread)
  Delta quality:      up to 15 pts  (sweet spot 0.35–0.55)
  IV attractiveness:  up to 15 pts  (lower IV percentile = better for buying)
  ATM proximity:      up to  5 pts  (closer = better)
  Event risk:         −0 to −20 pts (NONE/MEDIUM/HIGH/EXTREME)
```

Separate from 11.4-frozen strategy score. Uses same underlying `analyzeMarket()` factor computation.

---

## 7. Tests

```
New Phase 19 tests:    36
Prior suite:          954
Full suite:           990 / 990 PASS
TypeScript:           0 errors
Production build:     PASS (1 pre-existing filesystem warning)
```

Test groups:
- OE (3): engine versioning, independence from 11.4-frozen
- OO (9): options opportunity evaluation, ranking, direction, R:R
- ER (5): event risk penalty (NONE/HIGH/EXTREME), non-blocking behaviour
- CF (5): contract filtering (zero LTP, low OI, empty chain, MOCK source, max 3)
- SP (4): score properties (range, confidence, entryLow/entryHigh, maxLoss)
- SO (5): stock engine source safety, UNAVAILABLE handling
- SI19 (5): strategy integrity, no order endpoints, route existence

---

## 8. Security

```
Order endpoints:             0 (unchanged)
OPPORTUNITY_ENGINE_VERSION:  19.0 (independent)
STRATEGY_VERSION:            11.4-frozen (UNCHANGED)
MIN_STRATEGY_SCORE:          65 (UNCHANGED)
Mock → Trade:                IMPOSSIBLE
No strategy logic changed:   CONFIRMED
```

---

## 9. Limitations

1. **Stock scoring is BASIC** — intraday/swing scoring uses OHLC quote data only. Per-stock EMA/RSI/VWAP scoring requires ~50 individual API calls (high latency); add when parallelism budget allows.
2. **Long-term engine pending** — historical candle data pipeline not confirmed for full NIFTY 50 universe. Returns metadata only.
3. **No frontend opportunity section** — routes are available; frontend integration skipped as spec noted this was secondary to engine quality.
4. **No live validation** — market closed at time of development. API routes will return LIVE data when called during NSE session.

---

## 10. Final Conclusion

```
PHASE 19: PASS
```

Opportunity engine (v19.0) built on top of existing analysis layer. Five new API routes registered. 990/990 tests pass. 0 TypeScript errors. Build PASS. Event risk treated as penalty not blocker. Strategy frozen at 11.4-frozen. No order endpoints introduced.
