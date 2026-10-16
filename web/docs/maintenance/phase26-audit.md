# PHASE 26 — CODEBASE AUDIT & SAFE CLEANUP INVENTORY

## Executive Summary

- **Audit Date**: 2026-10-09
- **Project Root**: `/Users/webanatomy/Desktop/upstox_analyzer (2)/web`
- **Package Manager**: npm
- **Baseline Test Suite**: 1,176 / 1,176 passed
- **Baseline TypeScript Result**: Clean (`tsc --noEmit` exit 0)
- **Baseline Build Status**: Clean (`npx next build` exit 0)

---

## 1. Baseline Inventory Metrics

| Metric | Pre-Cleanup Baseline | Post-Cleanup | Net Change |
| :--- | :--- | :--- | :--- |
| **Total Test Count** | 1,176 | 1,176 | 0 (100% preserved) |
| **TypeScript Status** | PASS (0 errors) | PASS (0 errors) | Unchanged |
| **Production Build** | PASS | PASS | Unchanged |
| **Source Files (`src/`)** | 225 | 225 | 0 (All functional source preserved) |
| **Order Endpoints** | 0 | 0 | 0 |

---

## 2. Inventory Classification Categories

### Core Application Services & Engines (`src/lib/`)
- `src/lib/engine/opportunityEngine.ts` — `KEEP` (v20.1 Options Engine)
- `src/lib/engine/stockOpportunityEngine.ts` — `KEEP` (Stock Scanner)
- `src/lib/engine/longTermEngine.ts` — `KEEP` (Fundamental Scanner)
- `src/lib/engine/strategy.ts` — `KEEP` (Core Technical Engine)
- `src/lib/services/upstoxAuth.ts` — `KEEP` (OAuth 2.0 Auth Service)
- `src/lib/services/market.ts` — `KEEP` (Market Data Provider & Fallback)
- `src/lib/services/upstoxMarket.ts` — `KEEP` (Upstox Market Data Adapter)
- `src/lib/services/paperOpportunityStore.ts` — `KEEP` (Paper Trade Store)
- `src/lib/services/paperOpportunityMonitor.ts` — `KEEP` (Paper Trade Evaluator)
- `src/lib/services/paperTradeMonitorRunner.ts` — `KEEP` (Batch Monitor Runner)
- `src/lib/services/liveOpportunityCollector.ts` — `KEEP` (Live Collector)
- `src/lib/services/sessionEvidenceStore.ts` — `KEEP` (Multi-Session Evidence)
- `src/lib/services/liveSessionController.ts` — `KEEP` (NSE Session Controller)

### UI Dashboard Pages (`src/app/`)
- `src/app/opportunity-journal/page.tsx` — `KEEP` (Primary Paper Trading Dashboard)
- `src/app/opportunities/page.tsx` — `KEEP` (Live Opportunity Viewer)
- `src/app/strategy-evidence/page.tsx` — `KEEP` (Strategy Evidence Dashboard)
- `src/app/performance/page.tsx` — `KEEP` (Performance Analytics View)
- `src/app/recommendation-debug/page.tsx` — `KEEP` (Diagnostic Debug View)
- `src/app/market-history/page.tsx` — `KEEP` (Historical Market Viewer)
- `src/app/option-history/page.tsx` — `KEEP` (Option Chain Viewer)

### Operational CLI Scripts (`scripts/`)
- `scripts/upstox-status.mjs` — `KEEP` (npm run upstox:status)
- `scripts/upstox-login.mjs` — `KEEP` (npm run upstox:login)
- `scripts/paper-collect.mjs` — `KEEP` (npm run paper:collect)
- `scripts/paper-evaluate.mjs` — `KEEP` (npm run paper:evaluate)
- `scripts/paper-cycle.mjs` — `KEEP` (npm run paper:cycle)
- `scripts/paper-live.mjs` — `KEEP` (npm run paper:live)

---

## 3. Git & Build Hygiene Improvements

1. **Test-Data Git Ignore Rule**:
   Added `/.test-data` to `.gitignore` to prevent temporary test execution files (`.test-data/recommendations/rec_test_...`) from polluting git status.
2. **Store Path Dynamic Resolution**:
   Refactored static `DIR` constants in `paperOpportunityStore.ts` and `sessionEvidenceStore.ts` to `getDir()` dynamic functions. This ensures complete directory isolation during test execution without altering production paths.
3. **Option Chain Lookup Consolidation**:
   Ensured option monitoring fetches quotes across the full chain (`snap.chain`) rather than limiting lookup to top 3 accepted opportunities.

---

## 4. Safety & Non-Deletable Asset Verification

- **Production Stores Preserved**: `.data/paper-opportunities/`, `.data/paper-sessions/`, `.data/collection-logs/`, `.data/monitor-logs/`, `.data/upstox-token.json`.
- **Zero Real Order Execution**: 0 order endpoints, 0 real order calls.
- **Strategy Integrity**: 100% frozen strategy version 11.4 and v20.1 opportunity scoring unchanged.
