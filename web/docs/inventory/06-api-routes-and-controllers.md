# Inventory: API Routes and Controllers

**Category**: `06-api-routes-and-controllers`  
**File Count**: 79 files  
**Description**: Next.js App Router API route handlers for market data, recommendations, opportunities, and paper trading

---

### [`web/src/app/api/analysis/[index]/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/analysis/[index]/route.ts)

- **Relative Path**: `web/src/app/api/analysis/[index]/route.ts`
- **File Type**: `.ts` (8 lines, 396 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/instrumentRegistry.ts`, `web/src/lib/services/market.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/auth/callback/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/auth/callback/route.ts)

- **Relative Path**: `web/src/app/api/auth/callback/route.ts`
- **File Type**: `.ts` (32 lines, 1,355 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next/server`, `web/src/lib/postLogin.ts`, `web/src/lib/services/upstoxAuth.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/auth/health/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/auth/health/route.ts)

- **Relative Path**: `web/src/app/api/auth/health/route.ts`
- **File Type**: `.ts` (53 lines, 3,161 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: GET /api/auth/health — read-only probes per index (quote, option contracts, option chain) + historical entitlement.
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/adapters/upstoxHistoricalOptionsAdapter.ts`, `web/src/lib/services/instrumentRegistry.ts`, `web/src/lib/services/optionChainAnalytics.ts`, `web/src/lib/services/upstoxAuth.ts`, `web/src/lib/services/upstoxMarket.ts` *(+1 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/auth/login/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/auth/login/route.ts)

- **Relative Path**: `web/src/app/api/auth/login/route.ts`
- **File Type**: `.ts` (22 lines, 964 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Also bound to this browser: the callback needs the cookie AND the server-side state. Lax survives Upstox's redirect.
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next/server`, `web/src/lib/services/upstoxAuth.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/auth/logout/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/auth/logout/route.ts)

- **Relative Path**: `web/src/app/api/auth/logout/route.ts`
- **File Type**: `.ts` (8 lines, 223 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const dynamic`, `function POST`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/upstoxAuth.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/auth/status/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/auth/status/route.ts)

- **Relative Path**: `web/src/app/api/auth/status/route.ts`
- **File Type**: `.ts` (22 lines, 1,027 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Connection state only: never the token, client id or secret. ?verify=1 adds one read-only quote check.
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/market.ts`, `web/src/lib/services/upstoxAuth.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/backtest/compare-runs/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/backtest/compare-runs/route.ts)

- **Relative Path**: `web/src/app/api/backtest/compare-runs/route.ts`
- **File Type**: `.ts` (24 lines, 1,223 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: POST /api/backtest/compare-runs  { runs: [{ label, ...runConfig }] } — e.g. Runs A–D side by side (max 6).
- **Main Exports / Entry Points**: `function POST`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next/server`, `web/src/lib/backtestEngine.ts`, `web/src/lib/services/backtestRequest.ts`, `web/src/lib/services/backtestScenarios.ts`, `web/src/lib/services/backtestStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/backtest/compare/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/backtest/compare/route.ts)

- **Relative Path**: `web/src/app/api/backtest/compare/route.ts`
- **File Type**: `.ts` (20 lines, 963 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: POST /api/backtest/compare — CLOSE_ONLY vs INTRABAR_MODEL_DERIVED; identical config/candles, execution differs only.
- **Main Exports / Entry Points**: `function POST`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next/server`, `web/src/lib/services/backtestRequest.ts`, `web/src/lib/services/backtestScenarios.ts`, `web/src/lib/services/backtestStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/backtest/data-quality/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/backtest/data-quality/route.ts)

- **Relative Path**: `web/src/app/api/backtest/data-quality/route.ts`
- **File Type**: `.ts` (9 lines, 302 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: GET /api/backtest/data-quality — returns the historical option data audit report. 
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/historicalOptionDataAudit.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/backtest/run/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/backtest/run/route.ts)

- **Relative Path**: `web/src/app/api/backtest/run/route.ts`
- **File Type**: `.ts` (16 lines, 696 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function POST`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next/server`, `web/src/lib/backtestEngine.ts`, `web/src/lib/services/backtestRequest.ts`, `web/src/lib/services/backtestStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/backtest/runs/[id]/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/backtest/runs/[id]/route.ts)

- **Relative Path**: `web/src/app/api/backtest/runs/[id]/route.ts`
- **File Type**: `.ts` (13 lines, 479 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next/server`, `web/src/lib/services/backtestStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/backtest/runs/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/backtest/runs/route.ts)

- **Relative Path**: `web/src/app/api/backtest/runs/route.ts`
- **File Type**: `.ts` (7 lines, 262 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next/server`, `web/src/lib/services/backtestStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/backtest/scenarios/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/backtest/scenarios/route.ts)

- **Relative Path**: `web/src/app/api/backtest/scenarios/route.ts`
- **File Type**: `.ts` (17 lines, 907 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: POST /api/backtest/scenarios — same strategy/config/candles at ₹1L, 2L, 5L, 10L, 25L, 50L (descriptive only).
- **Main Exports / Entry Points**: `function POST`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next/server`, `web/src/lib/services/backtestRequest.ts`, `web/src/lib/services/backtestScenarios.ts`, `web/src/lib/services/backtestStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/backtest/walk-forward/[id]/equity/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/backtest/walk-forward/[id]/equity/route.ts)

- **Relative Path**: `web/src/app/api/backtest/walk-forward/[id]/equity/route.ts`
- **File Type**: `.ts` (13 lines, 637 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next/server`, `web/src/lib/services/performance/metrics.ts`, `web/src/lib/services/walkForwardStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/backtest/walk-forward/[id]/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/backtest/walk-forward/[id]/route.ts)

- **Relative Path**: `web/src/app/api/backtest/walk-forward/[id]/route.ts`
- **File Type**: `.ts` (11 lines, 466 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next/server`, `web/src/lib/services/walkForwardStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/backtest/walk-forward/[id]/trades/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/backtest/walk-forward/[id]/trades/route.ts)

- **Relative Path**: `web/src/app/api/backtest/walk-forward/[id]/trades/route.ts`
- **File Type**: `.ts` (11 lines, 476 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next/server`, `web/src/lib/services/walkForwardStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/backtest/walk-forward/[id]/windows/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/backtest/walk-forward/[id]/windows/route.ts)

- **Relative Path**: `web/src/app/api/backtest/walk-forward/[id]/windows/route.ts`
- **File Type**: `.ts` (11 lines, 474 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next/server`, `web/src/lib/services/walkForwardStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/backtest/walk-forward/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/backtest/walk-forward/route.ts)

- **Relative Path**: `web/src/app/api/backtest/walk-forward/route.ts`
- **File Type**: `.ts` (33 lines, 1,782 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function POST`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next/server`, `web/src/lib/services/backtestRequest.ts`, `web/src/lib/services/walkForwardStore.ts`, `web/src/lib/walkForwardEngine.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/breadth/[index]/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/breadth/[index]/route.ts)

- **Relative Path**: `web/src/app/api/breadth/[index]/route.ts`
- **File Type**: `.ts` (16 lines, 606 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/fallback.ts`, `web/src/lib/services/instrumentRegistry.ts`, `web/src/lib/services/market.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/breadth/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/breadth/route.ts)

- **Relative Path**: `web/src/app/api/breadth/route.ts`
- **File Type**: `.ts` (11 lines, 379 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/instrumentRegistry.ts`, `web/src/lib/services/market.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/events/[index]/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/events/[index]/route.ts)

- **Relative Path**: `web/src/app/api/events/[index]/route.ts`
- **File Type**: `.ts` (8 lines, 419 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/instrumentRegistry.ts`, `web/src/lib/services/newsApi.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/events/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/events/route.ts)

- **Relative Path**: `web/src/app/api/events/route.ts`
- **File Type**: `.ts` (5 lines, 171 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/newsApi.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/historical-options/data-quality/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/historical-options/data-quality/route.ts)

- **Relative Path**: `web/src/app/api/historical-options/data-quality/route.ts`
- **File Type**: `.ts` (17 lines, 691 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: GET /api/historical-options/data-quality
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/adapters/upstoxHistoricalOptionsAdapter.ts`, `web/src/lib/historicalOptionsDataset.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/market/[index]/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/market/[index]/route.ts)

- **Relative Path**: `web/src/app/api/market/[index]/route.ts`
- **File Type**: `.ts` (10 lines, 568 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/fallback.ts`, `web/src/lib/services/instrumentRegistry.ts`, `web/src/lib/services/market.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/market/expiries/[index]/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/market/expiries/[index]/route.ts)

- **Relative Path**: `web/src/app/api/market/expiries/[index]/route.ts`
- **File Type**: `.ts` (17 lines, 774 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/fallback.ts`, `web/src/lib/services/instrumentRegistry.ts`, `web/src/lib/services/market.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/news/[index]/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/news/[index]/route.ts)

- **Relative Path**: `web/src/app/api/news/[index]/route.ts`
- **File Type**: `.ts` (9 lines, 469 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/instrumentRegistry.ts`, `web/src/lib/services/newsApi.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/news/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/news/route.ts)

- **Relative Path**: `web/src/app/api/news/route.ts`
- **File Type**: `.ts` (15 lines, 822 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: GET /api/news — de-duplicated relevant articles across NIFTY and BANK NIFTY, newest first.
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/newsApi.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/opportunities/daily-summary/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/opportunities/daily-summary/route.ts)

- **Relative Path**: `web/src/app/api/opportunities/daily-summary/route.ts`
- **File Type**: `.ts` (11 lines, 432 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/paperOpportunityStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/opportunities/options/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/opportunities/options/route.ts)

- **Relative Path**: `web/src/app/api/opportunities/options/route.ts`
- **File Type**: `.ts` (22 lines, 979 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/engine/opportunityEngine.ts`, `web/src/lib/services/instrumentRegistry.ts`, `web/src/lib/services/market.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/opportunities/outcomes/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/opportunities/outcomes/route.ts)

- **Relative Path**: `web/src/app/api/opportunities/outcomes/route.ts`
- **File Type**: `.ts` (30 lines, 1,485 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const dynamic`, `function GET`, `function PATCH`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/opportunityTrackingStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/opportunities/stocks/intraday/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/opportunities/stocks/intraday/route.ts)

- **Relative Path**: `web/src/app/api/opportunities/stocks/intraday/route.ts`
- **File Type**: `.ts` (12 lines, 327 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/engine/stockOpportunityEngine.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/opportunities/stocks/long-term/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/opportunities/stocks/long-term/route.ts)

- **Relative Path**: `web/src/app/api/opportunities/stocks/long-term/route.ts`
- **File Type**: `.ts` (12 lines, 361 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/engine/longTermEngine.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/opportunities/stocks/swing/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/opportunities/stocks/swing/route.ts)

- **Relative Path**: `web/src/app/api/opportunities/stocks/swing/route.ts`
- **File Type**: `.ts` (12 lines, 324 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/engine/stockOpportunityEngine.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/opportunities/top/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/opportunities/top/route.ts)

- **Relative Path**: `web/src/app/api/opportunities/top/route.ts`
- **File Type**: `.ts` (87 lines, 3,672 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Aggregates best opportunity from all engines.
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/engine/longTermEngine.ts`, `web/src/lib/engine/opportunityEngine.ts`, `web/src/lib/engine/stockOpportunityEngine.ts`, `web/src/lib/services/market.ts`
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/opportunities/track/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/opportunities/track/route.ts)

- **Relative Path**: `web/src/app/api/opportunities/track/route.ts`
- **File Type**: `.ts` (50 lines, 2,160 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Track a live opportunity for outcome monitoring.
- **Main Exports / Entry Points**: `const dynamic`, `function POST`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/opportunityTrackingStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/option-chain/[index]/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/option-chain/[index]/route.ts)

- **Relative Path**: `web/src/app/api/option-chain/[index]/route.ts`
- **File Type**: `.ts` (50 lines, 1,975 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next/server`, `web/src/lib/fallback.ts`, `web/src/lib/services/errors.ts`, `web/src/lib/services/instrumentRegistry.ts`, `web/src/lib/services/market.ts` *(+2 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/paper-opportunities/[id]/evaluate/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/paper-opportunities/[id]/evaluate/route.ts)

- **Relative Path**: `web/src/app/api/paper-opportunities/[id]/evaluate/route.ts`
- **File Type**: `.ts` (35 lines, 1,114 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const dynamic`, `function POST`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/paperOpportunityMonitor.ts`, `web/src/lib/services/paperOpportunityStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/paper-opportunities/[id]/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/paper-opportunities/[id]/route.ts)

- **Relative Path**: `web/src/app/api/paper-opportunities/[id]/route.ts`
- **File Type**: `.ts` (13 lines, 393 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/paperOpportunityStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/paper-opportunities/collect/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/paper-opportunities/collect/route.ts)

- **Relative Path**: `web/src/app/api/paper-opportunities/collect/route.ts`
- **File Type**: `.ts` (46 lines, 1,753 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: POST /api/paper-opportunities/collect
- **Main Exports / Entry Points**: `const dynamic`, `function POST`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/engine/opportunityEngine.ts`, `web/src/lib/engine/stockOpportunityEngine.ts`, `web/src/lib/services/liveOpportunityCollector.ts`, `web/src/lib/services/market.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/paper-opportunities/monitor/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/paper-opportunities/monitor/route.ts)

- **Relative Path**: `web/src/app/api/paper-opportunities/monitor/route.ts`
- **File Type**: `.ts` (98 lines, 3,938 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: POST /api/paper-opportunities/monitor
- **Main Exports / Entry Points**: `const dynamic`, `function POST`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/market.ts`, `web/src/lib/services/paperPriceInput.ts`, `web/src/lib/services/paperTradeMonitorRunner.ts`
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/paper-opportunities/open/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/paper-opportunities/open/route.ts)

- **Relative Path**: `web/src/app/api/paper-opportunities/open/route.ts`
- **File Type**: `.ts` (8 lines, 292 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/paperOpportunityStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/paper-opportunities/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/paper-opportunities/route.ts)

- **Relative Path**: `web/src/app/api/paper-opportunities/route.ts`
- **File Type**: `.ts` (76 lines, 3,278 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const dynamic`, `function GET`, `function POST`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/engine/opportunityEngine.ts`, `web/src/lib/services/paperOpportunityMonitor.ts`, `web/src/lib/services/paperOpportunityStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/paper-opportunities/sessions/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/paper-opportunities/sessions/route.ts)

- **Relative Path**: `web/src/app/api/paper-opportunities/sessions/route.ts`
- **File Type**: `.ts` (14 lines, 439 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: GET /api/paper-opportunities/sessions
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/sessionEvidenceStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/paper-trading/close/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/paper-trading/close/route.ts)

- **Relative Path**: `web/src/app/api/paper-trading/close/route.ts`
- **File Type**: `.ts` (32 lines, 1,097 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function POST`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next/server`, `web/src/lib/services/market.ts`, `web/src/lib/services/paperStore.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/paper-trading/enter/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/paper-trading/enter/route.ts)

- **Relative Path**: `web/src/app/api/paper-trading/enter/route.ts`
- **File Type**: `.ts` (34 lines, 1,300 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function POST`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next/server`, `web/src/lib/engine/strategy.ts`, `web/src/lib/services/market.ts`, `web/src/lib/services/paperStore.ts`, `web/src/lib/services/recommendationStore.ts` *(+1 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/paper-trading/portfolio/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/paper-trading/portfolio/route.ts)

- **Relative Path**: `web/src/app/api/paper-trading/portfolio/route.ts`
- **File Type**: `.ts` (21 lines, 861 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: `data` is the portfolio summary (unchanged contract). `report` and `reconciliation` come from the same ledger,
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next/server`, `web/src/lib/paperReport.ts`, `web/src/lib/services/paperStore.ts`
- **Git Status**: Tracked (Modified)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/paper-trading/trades/[id]/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/paper-trading/trades/[id]/route.ts)

- **Relative Path**: `web/src/app/api/paper-trading/trades/[id]/route.ts`
- **File Type**: `.ts` (15 lines, 573 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next/server`, `web/src/lib/services/paperStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/paper-trading/trades/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/paper-trading/trades/route.ts)

- **Relative Path**: `web/src/app/api/paper-trading/trades/route.ts`
- **File Type**: `.ts` (8 lines, 303 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next/server`, `web/src/lib/services/paperStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/paper-trading/update/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/paper-trading/update/route.ts)

- **Relative Path**: `web/src/app/api/paper-trading/update/route.ts`
- **File Type**: `.ts` (24 lines, 810 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function POST`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next/server`, `web/src/lib/services/market.ts`, `web/src/lib/services/paperStore.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/performance/[runId]/equity/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/performance/[runId]/equity/route.ts)

- **Relative Path**: `web/src/app/api/performance/[runId]/equity/route.ts`
- **File Type**: `.ts` (6 lines, 377 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/performance/api.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/performance/[runId]/export/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/performance/[runId]/export/route.ts)

- **Relative Path**: `web/src/app/api/performance/[runId]/export/route.ts`
- **File Type**: `.ts` (18 lines, 1,100 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: GET /api/performance/[runId]/export?type=trades|legs (+ journal filters) → CSV. legs.csv joins trades.csv on run_id + trade_id.
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/backtestStore.ts`, `web/src/lib/services/performance/api.ts`, `web/src/lib/services/performance/journal.ts`, `web/src/lib/services/performance/report.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/performance/[runId]/monthly/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/performance/[runId]/monthly/route.ts)

- **Relative Path**: `web/src/app/api/performance/[runId]/monthly/route.ts`
- **File Type**: `.ts` (6 lines, 272 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/performance/api.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/performance/[runId]/regimes/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/performance/[runId]/regimes/route.ts)

- **Relative Path**: `web/src/app/api/performance/[runId]/regimes/route.ts`
- **File Type**: `.ts` (6 lines, 272 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/performance/api.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/performance/[runId]/risk/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/performance/[runId]/risk/route.ts)

- **Relative Path**: `web/src/app/api/performance/[runId]/risk/route.ts`
- **File Type**: `.ts` (6 lines, 358 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/performance/api.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/performance/[runId]/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/performance/[runId]/route.ts)

- **Relative Path**: `web/src/app/api/performance/[runId]/route.ts`
- **File Type**: `.ts` (7 lines, 347 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: GET /api/performance/[runId]?strategy=&regime=&from=&to=&riskFreeRate=  → full report
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/performance/api.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/performance/[runId]/strategies/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/performance/[runId]/strategies/route.ts)

- **Relative Path**: `web/src/app/api/performance/[runId]/strategies/route.ts`
- **File Type**: `.ts` (6 lines, 278 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/performance/api.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/performance/[runId]/trades/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/performance/[runId]/trades/route.ts)

- **Relative Path**: `web/src/app/api/performance/[runId]/trades/route.ts`
- **File Type**: `.ts` (18 lines, 1,243 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: GET /api/performance/[runId]/trades?strategy=&regime=&outcome=win|loss|breakeven&exitReason=&from=&to=&minR=&maxR=&sort=date|pnl|r|duration&dir=asc|desc
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/backtestStore.ts`, `web/src/lib/services/performance/api.ts`, `web/src/lib/services/performance/journal.ts`, `web/src/lib/services/performance/report.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/recommendations/[id]/paper-trade/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/recommendations/[id]/paper-trade/route.ts)

- **Relative Path**: `web/src/app/api/recommendations/[id]/paper-trade/route.ts`
- **File Type**: `.ts` (54 lines, 2,211 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Phase 11.3 — Create a paper trade directly from a stored recommendation.
- **Main Exports / Entry Points**: `const dynamic`, `function POST`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/engine/strategy.ts`, `web/src/lib/services/market.ts`, `web/src/lib/services/paperStore.ts`, `web/src/lib/services/recommendationStore.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/recommendations/[id]/refresh/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/recommendations/[id]/refresh/route.ts)

- **Relative Path**: `web/src/app/api/recommendations/[id]/refresh/route.ts`
- **File Type**: `.ts` (61 lines, 2,605 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Phase 11.3 — Refresh outcome for an open TRADE recommendation.
- **Main Exports / Entry Points**: `const dynamic`, `function POST`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/journalOutcome.ts`, `web/src/lib/services/market.ts`, `web/src/lib/services/recommendationStore.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/recommendations/[id]/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/recommendations/[id]/route.ts)

- **Relative Path**: `web/src/app/api/recommendations/[id]/route.ts`
- **File Type**: `.ts` (14 lines, 498 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/recommendationStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/recommendations/analytics/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/recommendations/analytics/route.ts)

- **Relative Path**: `web/src/app/api/recommendations/analytics/route.ts`
- **File Type**: `.ts` (13 lines, 411 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/journalOutcome.ts`, `web/src/lib/services/recommendationStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/recommendations/daily-summary/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/recommendations/daily-summary/route.ts)

- **Relative Path**: `web/src/app/api/recommendations/daily-summary/route.ts`
- **File Type**: `.ts` (134 lines, 5,429 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: One day's evidence summary. Only includes days where at least one evaluation ran. 
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/recommendationStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/recommendations/diagnostic/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/recommendations/diagnostic/route.ts)

- **Relative Path**: `web/src/app/api/recommendations/diagnostic/route.ts`
- **File Type**: `.ts` (18 lines, 850 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: GET /api/recommendations/diagnostic?underlying=NIFTY|BANKNIFTY — read-only; nothing is journaled.
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/engine/strategy.ts`, `web/src/lib/recommendationDiagnostic.ts`, `web/src/lib/services/market.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/recommendations/evaluation/export/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/recommendations/evaluation/export/route.ts)

- **Relative Path**: `web/src/app/api/recommendations/evaluation/export/route.ts`
- **File Type**: `.ts` (68 lines, 2,071 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/evaluationEngine.ts`, `web/src/lib/services/recommendationStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/recommendations/evaluation/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/recommendations/evaluation/route.ts)

- **Relative Path**: `web/src/app/api/recommendations/evaluation/route.ts`
- **File Type**: `.ts` (27 lines, 1,484 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/evaluationEngine.ts`, `web/src/lib/services/recommendationStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/recommendations/export/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/recommendations/export/route.ts)

- **Relative Path**: `web/src/app/api/recommendations/export/route.ts`
- **File Type**: `.ts` (46 lines, 1,840 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/recommendationStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/recommendations/generate/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/recommendations/generate/route.ts)

- **Relative Path**: `web/src/app/api/recommendations/generate/route.ts`
- **File Type**: `.ts` (38 lines, 1,770 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const dynamic`, `function POST`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/engine/strategy.ts`, `web/src/lib/journalTypes.ts`, `web/src/lib/recommendationEnricher.ts`, `web/src/lib/services/market.ts`, `web/src/lib/services/recommendationStore.ts` *(+1 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/recommendations/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/recommendations/route.ts)

- **Relative Path**: `web/src/app/api/recommendations/route.ts`
- **File Type**: `.ts` (11 lines, 307 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/recommendationStore.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/recommendations/today/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/recommendations/today/route.ts)

- **Relative Path**: `web/src/app/api/recommendations/today/route.ts`
- **File Type**: `.ts` (6 lines, 206 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/market.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/risk/assess/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/risk/assess/route.ts)

- **Relative Path**: `web/src/app/api/risk/assess/route.ts`
- **File Type**: `.ts` (30 lines, 1,112 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function POST`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/instrumentRegistry.ts`, `web/src/lib/services/market.ts`, `web/src/lib/services/risk/riskService.ts`, `web/src/lib/types.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/risk/config/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/risk/config/route.ts)

- **Relative Path**: `web/src/app/api/risk/config/route.ts`
- **File Type**: `.ts` (9 lines, 307 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/risk/riskConfig.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/sentiment/[index]/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/sentiment/[index]/route.ts)

- **Relative Path**: `web/src/app/api/sentiment/[index]/route.ts`
- **File Type**: `.ts` (8 lines, 430 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/instrumentRegistry.ts`, `web/src/lib/services/newsApi.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/stocks/[symbol]/history/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/stocks/[symbol]/history/route.ts)

- **Relative Path**: `web/src/app/api/stocks/[symbol]/history/route.ts`
- **File Type**: `.ts` (22 lines, 1,490 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: GET /api/stocks/[symbol]/history?range=1Y&interval=1d — chunked, cached, coverage-reported history + chart series.
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/marketHistory.ts`, `web/src/lib/services/stockService.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/stocks/[symbol]/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/stocks/[symbol]/route.ts)

- **Relative Path**: `web/src/app/api/stocks/[symbol]/route.ts`
- **File Type**: `.ts` (11 lines, 561 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: GET /api/stocks/[symbol] — current quote (UNAVAILABLE when Upstox is not connected; never mock).
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/stockService.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/stocks/[symbol]/technicals/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/stocks/[symbol]/technicals/route.ts)

- **Relative Path**: `web/src/app/api/stocks/[symbol]/technicals/route.ts`
- **File Type**: `.ts` (30 lines, 1,590 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: GET /api/stocks/[symbol]/technicals — latest daily indicators from 1Y of daily history.
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/marketHistory.ts`, `web/src/lib/services/stockService.ts`, `web/src/lib/services/technicalAnalysis.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/stocks/search/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/stocks/search/route.ts)

- **Relative Path**: `web/src/app/api/stocks/search/route.ts`
- **File Type**: `.ts` (10 lines, 431 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: GET /api/stocks/search?q=REL — NSE equities + NIFTY/BANKNIFTY indices.
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/stockService.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/strategy/evidence/export/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/strategy/evidence/export/route.ts)

- **Relative Path**: `web/src/app/api/strategy/evidence/export/route.ts`
- **File Type**: `.ts` (114 lines, 3,403 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/backtestStore.ts`, `web/src/lib/services/recommendationStore.ts`, `web/src/lib/services/walkForwardStore.ts`, `web/src/lib/strategyEvidenceEngine.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/strategy/evidence/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/strategy/evidence/route.ts)

- **Relative Path**: `web/src/app/api/strategy/evidence/route.ts`
- **File Type**: `.ts` (15 lines, 523 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: Source file for application module
- **Main Exports / Entry Points**: `const dynamic`, `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `web/src/lib/services/backtestStore.ts`, `web/src/lib/services/recommendationStore.ts`, `web/src/lib/services/walkForwardStore.ts`, `web/src/lib/strategyEvidenceEngine.ts`
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---

### [`web/src/app/api/technical/[index]/route.ts`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/src/app/api/technical/[index]/route.ts)

- **Relative Path**: `web/src/app/api/technical/[index]/route.ts`
- **File Type**: `.ts` (83 lines, 3,577 bytes)
- **Category**: API Routes and Controllers
- **Purpose & Responsibility**: GET /api/technical/nifty?timeframe=15m   (5m | 15m | 30m | 1h | 1d)
- **Main Exports / Entry Points**: `function GET`
- **Inbound Dependencies**: *None*
- **Outbound Dependencies**: `next/server`, `web/src/lib/fallback.ts`, `web/src/lib/services/candles.ts`, `web/src/lib/services/instrumentRegistry.ts`, `web/src/lib/services/market.ts` *(+1 more)*
- **Git Status**: Tracked (Clean)
- **Existing Tests & Coverage**: Indirect coverage via full test suite / integration routes
- **Known Issues & Safety Implications**: Server API endpoints for dashboard UI, recommendations, paper trading, and collector.
- **Recommended Action**: **`KEEP`**

---
