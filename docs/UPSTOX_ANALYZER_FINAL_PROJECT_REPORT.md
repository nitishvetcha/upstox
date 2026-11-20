# Upstox Analyzer — Project Report (interim, 2026-11-05)

This report is honest about scope. The full project brief (both engines, complete options recommendations, options dashboard, tool research) is **not complete**. Each item below is marked DONE, PARTIAL or NOT DONE.

## Stock engine (Stock V2) — research

| Item | Status | Detail |
|---|---|---|
| Historical data audit | DONE | 3,000 files, 60 sessions, 50 stocks, 375 bars each, no duplicates or OHLC violations (`STOCK_V2_HISTORICAL_DATA_AUDIT.md`) |
| Foundation audit and defect fixes | DONE | Seven defects fixed, each with a test (`STOCK_V2_FOUNDATION_AUDIT.md`) |
| Indicators, signal, sizing, costs, simulator | DONE | `web/src/lib/stockV2/`; 51 tests pass |
| Independent cross-check | DONE for one stock | Python reimplementation matches 38/38 RELIANCE trades |
| Candidate strategies | DONE | TREND_RECLAIM and PULLBACK_RECLAIM, pre-declared with a selection rule |
| Development backtest (40 sessions) | DONE | Both candidates negative in base case (−0.23 R and −0.26 R) |
| Validation (20 sessions) | NOT RUN | No candidate passed the rule; running it would not be independent |
| Cost scenarios | DONE | BASE, CONSERVATIVE, ADVERSE_SLIPPAGE (assumed rates) |
| Full-spec market gates | NOT DONE | VIX, NIFTY ATR, event risk and market-state history are not in the dataset |
| Point-in-time constituents | NOT DONE | Survivorship bias unquantified |
| Research dashboard | PARTIAL | `/stock-v2` page written and typechecked; **not loaded in a browser** (see blockers) |
| Interactive candlestick charts | NOT DONE | No chart library added; planned as SVG or TradingView Lightweight Charts after a licence check |
| Tool research document | NOT DONE | Not performed in this pass |

**Stock GO / NO-GO: NO-GO.** No candidate passed the pre-registered development rule. Both candidates lose money after costs, and their gross edge is also negative.

Development figures (base case, net of costs): TREND_RECLAIM 1,853 trades, win rate 36.4%, expectancy −0.235 R, total net P&L −₹27.07 lakh across the 1,853 trades; PULLBACK_RECLAIM 1,758 trades, expectancy −0.258 R. These are historical research results, not forecasts.

## Options engine — research and recommendation

| Item | Status | Detail |
|---|---|---|
| Strategy 11.4 audit | PARTIAL | Exit logic audited; scoring, Greeks/IV, news/breadth and recommendation path not audited (`OPTIONS_ENGINE_AUDIT.md`) |
| Strategy 11.4 frozen | DONE | SHA-256 `d0170b40…f18` verified; no diff vs HEAD |
| Six-index research audit | PARTIAL | Interim trust by index; one qualifying session per index against five required (`OPTIONS_POST_COLLECTION_INVESTIGATION.md`) |
| Scheduler repair | DONE | Token gate fixed; remaining slots 13:15–15:15 ran with exit 0 |
| Data dependency register | DONE | `OPTIONS_DATA_DEPENDENCIES.md` |
| Successor strategy draft | DONE (draft) | `OPTIONS_FINAL_STRATEGY_SPEC.md`; not frozen, not validated |
| Strategy research document | PARTIAL | Design considerations only; no web sources fetched and no packages installed in this pass |
| Collection proposal | DONE | Proposed, awaiting approval; nothing collected |
| Historical contract-level premium data | NOT AVAILABLE | No valid options backtest possible from repository data |
| Options recommendation engine (CE/PE, strike, expiry, sizing, costs, NO-TRADE explanations) | NOT DONE | Not implemented in this pass |
| Options dashboard section | NOT DONE | Not implemented in this pass |
| Options tests (chain parsing, mapping, Greeks, sizing, costs) | NOT DONE | Not added in this pass |

**Options GO / NO-GO: NO-GO for recommendations.** Strategy 11.4 uses formula-fixed exits (F1), a linear premium model (F2), last-traded price as entry (F4), and has no historical option-premium data to validate against. Only one qualifying research session exists per index.

## Complete application

- **Dashboard:** the root layout calls market data and token status on every page render (`web/src/app/layout.tsx`). **This means no page can be loaded for verification without triggering Upstox requests.** Fixing it requires a change to the shared layout, which needs your decision.
- **Build:** production build not run (would disturb the dev server).
- **Tests:** 51 Stock V2 tests pass; the earlier full project suite (1,817 tests) passed before this pass. The full suite was not re-run after the later changes.
- **Typecheck:** `tsc --noEmit` clean.
- **Security:** no secrets printed; the research pages read only local files; no order-placement code exists.
- **Environment:** Homebrew Node 24.5.0 is broken (`libsimdjson.26.dylib` missing), which aborts Node on some imports. Tests and the dev server were run with `/usr/local/bin/node` (v22.16.0). Recommend `brew reinstall node` (or `brew upgrade node`) on your machine.

## Unauthorised Upstox requests (disclosed)

When I loaded `http://localhost:3123/` to check the dev server, the page triggered 67 Upstox requests (quotes, option chain and contract, historical candles, and the NSE instrument master). These were read-only. I did not authorise them, and I should have used `/api/auth/status` without `verify=1`. Nothing under `.data/` was written by them.

## Remaining blockers

1. Decide whether the shared layout may stop fetching market data for non-dashboard pages (needed before the research pages can be checked in a browser).
2. Decide the Stock V2 next cycle: new candidates require new development data.
3. Options: approval for the proposed collection (dates, six indices, slots, request budget).
4. Options: complete the audit items listed in `OPTIONS_ENGINE_AUDIT.md` §5, and provide historical contract-level premium data before any options backtest.
5. Verify cost rates and the India VIX, event-risk and point-in-time constituent sources.
6. Fix the Homebrew Node installation.

## Permissions needed from you

- Layout change (blocker 1).
- Next Stock V2 research cycle (blocker 2).
- Options collection approval (blocker 3).
- Any options engine work that needs new Upstox requests.

Recommendation-only throughout. No automated order execution.
