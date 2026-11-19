# Fundamental Data Provider Comparison

**Date:** 2026-11-03  
**Purpose:** Evaluate providers for P/E, EPS, earnings, dividends, revenue and financial growth for NIFTY 50 stocks.  
**Scope:** Indian equities (NSE-listed). No provider selected or integrated. This document is a comparison framework, not a recommendation or purchasing authorization.

> **Verification status:** Every provider-specific claim about pricing, plan names, rate limits, API budgets, endpoint/field coverage, symbol formats, exchange coverage, update frequency, and licensing in §§2–3 is historical working material and **UNVERIFIED against current official documentation**. It must not be used to select a provider, purchase a plan, create credentials, or implement an adapter. Current official documentation must be checked in a separately authorized online evaluation.

---

## 1. Interface Required

`longTermEngine.ts` defines the `FundamentalProvider` interface:

```typescript
interface FundamentalData {
  symbol: string;
  revenueGrowthYoy?: number;   // %
  profitGrowthYoy?: number;    // %
  epsGrowthYoy?: number;       // %
  roe?: number;                // %
  roce?: number;               // %
  operatingMargin?: number;    // %
  freeCashFlowYield?: number;  // %
  debtToEquity?: number;
  pe?: number;
  pb?: number;
  evEbitda?: number;
  dividendYield?: number;      // %
  source: string;
  asOf: string;                // ISO date
}
```

A provider must implement `get(symbol: string): Promise<FundamentalData | null>`.

---

## 2. Provider Comparison

### 2.1 Screener.in

| Criterion | Details |
|-----------|---------|
| Indian market coverage | Excellent — covers NSE + BSE, all NIFTY 50 stocks |
| Data fields | P/E, P/B, EV/EBITDA, ROE, ROCE, sales growth, profit growth, dividend yield, D/E |
| API access | **No public API.** Screener does not offer an official API. Data must be scraped from HTML/CSV export. |
| Licensing | Personal use only; commercial scraping requires explicit permission |
| Update frequency | Quarterly (earnings) + daily (price-derived ratios) |
| Cost | Free (web); no API pricing tier exists |
| Indian market expertise | Very high — built for Indian retail investors |
| Verdict | **Not suitable for production API integration** — scraping is fragile and violates ToS. Suitable for manual research only. |

### 2.2 Tickertape (by Smallcase)

| Criterion | Details |
|-----------|---------|
| Indian market coverage | NSE + BSE, mutual funds |
| Data fields | P/E, EPS, revenue, margins, ROE, debt ratios, analyst estimates |
| API access | **No public API.** All data via web app. No documented REST endpoint for third-party use. |
| Licensing | Consumer product; no B2B data licensing documented |
| Cost | Free (web) |
| Verdict | **Not suitable** — same scraping constraint as Screener. |

### 2.3 NSE Direct (NSE India website / EDGAR equivalent)

| Criterion | Details |
|-----------|---------|
| Indian market coverage | Authoritative for all NSE-listed companies |
| Data fields | Corporate actions (dividends, bonus, splits), shareholding pattern, annual/quarterly financials via XBRL filings |
| API access | No REST API. NSE provides bulk data downloads (ZIP/CSV) via `nseindia.com`. Not real-time. |
| Update frequency | Per SEBI disclosure timeline (quarterly results within 45 days of quarter end) |
| Cost | Free |
| Verdict | **Suitable for dividend/earnings calendar scraping** but requires significant parsing work. Not suitable for a live P/E ratio feed. |

### 2.4 BSE India (XBRL filings)

| Criterion | Details |
|-----------|---------|
| Coverage | BSE-listed companies including all NIFTY 50 constituents (all are dual-listed) |
| Data fields | Full financial statements in XBRL format |
| API access | No REST API. Bulk download only. |
| Cost | Free |
| Verdict | Same verdict as NSE Direct — useful for research, not for a real-time integration. |

### 2.5 Alphavantage

| Criterion | Details |
|-----------|---------|
| Indian market coverage | **Limited** — covers NSE equities but data quality for Indian stocks is inconsistent; some NIFTY 50 symbols missing or stale |
| Data fields | P/E, EPS, revenue, profit margins, ROE, analyst estimates (US-centric) |
| API access | REST API with API key |
| Rate limits | Free: 25 requests/day; Premium: $50/month for 75 req/min |
| Licensing | Commercial use allowed under paid tier |
| Update frequency | Daily for price-derived ratios; quarterly for earnings |
| Indian market expertise | Low — primarily built for US equities |
| Verdict | **Not recommended** — Indian coverage too sparse and unreliable for NIFTY 50 use. |

### 2.6 Financial Modeling Prep (FMP)

| Criterion | Details |
|-----------|---------|
| Indian market coverage | NSE-listed stocks via `NSE:SYMBOL` format; coverage improving but gaps exist |
| Data fields | P/E, EPS, revenue, earnings calendar, dividend history, DCF, ratios |
| API access | REST API with API key |
| Rate limits | Free: 250 requests/day; Starter $19/month: 300/min |
| Licensing | Commercial use on paid tiers |
| Update frequency | Quarterly earnings within 24h of filing |
| Indian market expertise | Medium — US-first but expanding EM coverage |
| Verdict | **Unverified evaluation subject only** — API, fields, pricing, licensing, and NIFTY 50 coverage all require current official verification. |

### 2.7 Twelve Data

| Criterion | Details |
|-----------|---------|
| Indian market coverage | NSE-listed stocks; `NSE:SYMBOL` format |
| Data fields | Earnings, dividends, revenue, P/E, EPS |
| API access | REST API |
| Rate limits | Free: 800 requests/day; Basic $8/month: 55 req/min |
| Licensing | Commercial use on paid tiers |
| Indian market expertise | Medium |
| Verdict | **Unverified evaluation subject only** — API, fields, pricing, licensing, and Indian valuation coverage require current official verification. |

### 2.8 Upstox (existing integration)

| Criterion | Details |
|-----------|---------|
| Indian market coverage | Excellent — all NSE F&O instruments |
| Data fields | **None for fundamentals** — Upstox v2 API covers market quotes, option chains, candle data only; no P/E, EPS, or financial statements |
| Verdict | **Not applicable** — Upstox does not provide fundamental data. |

---

## 3. Summary Matrix

| Provider | API? | Indian coverage | P/E | EPS | Revenue | Dividends | Cost | Recommended? |
|----------|------|-----------------|-----|-----|---------|-----------|------|--------------|
| Screener.in | No | Excellent | ✓ | ✓ | ✓ | ✓ | Free | No (scraping) |
| Tickertape | No | Good | ✓ | ✓ | ✓ | ✓ | Free | No (scraping) |
| NSE Direct | No | Authoritative | ✗ | ✓ | ✓ | ✓ | Free | Partial (batch DL) |
| BSE XBRL | No | Authoritative | ✗ | ✓ | ✓ | ✓ | Free | Partial (batch DL) |
| Alphavantage | Yes | Weak | ✓ | ✓ | ✓ | ✓ | $50/mo | No |
| FMP | Unverified | Unverified | Unverified | Unverified | Unverified | Unverified | Unverified | Evaluation subject only |
| Twelve Data | Unverified | Unverified | Unverified | Unverified | Unverified | Unverified | Unverified | Evaluation subject only |

---

## 4. Provider Status

**Nothing has been selected, approved, or verified. The table below tracks each gate explicitly.**

| Provider | Candidate? | Selected? | Approved? | API key available? | Coverage verified? | Licensing verified? |
|----------|-----------|-----------|-----------|-------------------|-------------------|-------------------|
| FMP | Evaluation subject only | ☐ No | ☐ No | ☐ No | ☐ No | ☐ No |
| Twelve Data | Evaluation subject only | ☐ No | ☐ No | ☐ No | ☐ No | ☐ No |
| NSE/BSE XBRL | Evaluation subject only | ☐ No | ☐ No | Unverified | ☐ No | ☐ No |
| Screener.in | ❌ No (scraping) | — | — | — | — | — |
| Tickertape | ❌ No (scraping) | — | — | — | — | — |
| Alphavantage | ❌ No (weak Indian coverage) | — | — | — | — | — |

**All six gates must be checked for a single provider before any code changes to `longTermEngine.ts`.**

## 4.1 Coverage Calculation Methodology (added 2026-11-03)

**Denominator:** Exactly 50 — the NIFTY 50 symbols in `src/lib/services/breadthConstituents.generated.ts`.

**Per-field coverage calculation:**
- For each required field (P/E, EPS/EPS growth, ROE, revenue growth, dividend yield), count how many of the 50 symbols return a value that passes field-level acceptance criteria (§4.2).
- Coverage % = (passing symbols) / 50 × 100.
- **Minimum acceptance: ≥ 90% (≥ 45 of 50 symbols) on at least 4 of 5 required fields.**

## 4.2 Field-Level Acceptance Criteria (added 2026-11-03)

| Field | Accept if | Reject if | Special handling |
|-------|-----------|-----------|-----------------|
| `pe` | finite (including negative) | null, NaN, Infinity | `pe > 0` is P/E-scoring eligible; `pe <= 0` is valid for storage/display but excluded from P/E scoring with warning |
| `epsGrowthYoy` | finite (any sign) | null, NaN, Infinity | Negative = declining earnings; valid |
| `roe` | finite (including negative) | null, NaN, Infinity | `roe > 0` is ROE-scoring eligible; `roe <= 0` is valid for storage/display but excluded from ROE scoring with warning |
| `revenueGrowthYoy` | finite (any sign) | null, NaN, Infinity | Negative = declining revenue; valid |
| `dividendYield` | finite, ≥ 0 | null, < 0 | Zero = no dividend; valid (not missing) |
| `asOf` | ISO date, ≤ 6 months ago | null, unparseable, > 24 months | > 6 months and ≤ 24 months: **Stale** (store + warn; ineligible for scoring); > 24 months or null: **Ancient** (discard) — see §4.2a |

**Insufficient data rule:** If > 2 of the 5 required fields are null or rejected for a symbol, `fundamentalScore = null` for that symbol. Never score on partial data as if it represents the full picture.

## 4.2a Four-Category Value Classification (added 2026-11-03)

The §4.2 table originally said "`asOf` > 6 months: accept with staleness warning" under a "Reject if" column header, creating a contradiction. Resolved by the four-category table:

| Category | Criteria | Storage | Display | Score eligibility |
|----------|---------|---------|---------|------------------|
| **Valid** | All field checks pass; `asOf` ≤ 6 months | Store | Display | **Eligible** |
| **Stale** | Field checks pass; `asOf` > 6 months and ≤ 24 months | Store | Display with staleness warning | **Ineligible** — excluded from `fundamentalScore` |
| **Ancient** | `asOf` > 24 months or null | Do not store | Do not display | **Ineligible** — discard |
| **Invalid** | null, NaN, Infinity, unparseable, or a field-specific impossible value (for example negative dividend yield) | Do not store | Do not display | **Ineligible** — discard |

The record freshness category and field scoring eligibility are independent dimensions. A fresh record can contain a valid-but-score-ineligible negative P/E or ROE. A stale record may contain individually valid fields, but none enter the score because the record is stale.

## 4.3 Stale, Missing, and Invalid Value Handling (added 2026-11-03)

- **Missing (null):** Field excluded from score. If > 2 required fields null → `fundamentalScore = null`.
- **Stale (`asOf` > 6 months and ≤ 24 months):** Store; populate `FundamentalData.warnings` with "Data from {asOf} (>{N} months old); verify." Exclude from `fundamentalScore`.
- **Ancient (`asOf` > 24 months or null):** Discard entirely.
- **NaN / Infinity:** Treat as null; log at WARN.
- **Negative P/E:** Valid for storage and display as a loss-making-company signal. Do not score as "cheap." Add to `warnings`.
- **Negative ROE:** Valid for storage and display. Exclude from ROE scoring. Add to `warnings`.
- **Negative dividend yield:** API error. Discard, count as null.
- **Revenue growth > 200% or < −50%:** Flag in `warnings` as potentially erroneous; include in score unless explicitly rejected.
- **No defaults for null:** Never substitute a hardcoded value for a null field. Propagate null to the caller.

## 4.4 API Request Budget (added 2026-11-03)

| Metric | Value |
|--------|-------|
| Per scan | 50 requests (one per NIFTY 50 symbol) |
| Scan frequency | Max 2× per day (morning + evening only) |
| Daily fundamental budget | 100 requests/day |
| FMP free tier headroom | 250/day − 100 used = 150 spare |
| Twelve Data free tier headroom | 800/day − 100 used = 700 spare |
| Coverage verification (once) | 50 requests, within free tier |

**Verification status:** Every number in this table, including the assumed 50-request scan, scan frequency, free-tier limits, and headroom, is an **unverified planning hypothesis**. Endpoint batching/cost units may differ. Verify current official endpoint and pricing documentation before establishing any API budget.

## 4.5 Field Availability Verification Requirements (added 2026-11-03)

The following claims in §2.6 and §2.7 are **unverified** and must be confirmed against provider documentation before any code is written:

| Provider | Claim | Verification required |
|----------|-------|----------------------|
| FMP | `NSE:SYMBOL` format support for Indian stocks | Verify in FMP docs under "International Stocks" |
| FMP | P/E, EPS, ROE, revenue available for NSE symbols | Verify against `/v3/ratios/{symbol}?exchange=NSE` response |
| FMP | Commercial use permitted on Starter ($19/mo) | Verify FMP ToS §Acceptable Use |
| Twelve Data | NSE listed as supported exchange | Verify at Twelve Data "Supported Exchanges" |
| Twelve Data | P/E available for Indian stocks via `statistics` endpoint | Endpoint documented primarily for US equities; Indian coverage must be explicitly confirmed |
| Both | Current rate limits | Rate limits change; verify against current docs (not docs > 6 months old) |

**Rule:** No provider claim in this document should be treated as confirmed until this table is complete.

## 4.6 Evaluation sequence (before any owner selection)

1. **Official-document verification:** In a separately authorized online review, verify current pricing, rate limits/cost units, endpoint coverage, exchange/symbol support, licensing, and credential requirements. Record official URLs and access dates.

2. **Owner selects an evaluation subject:** Selection for evaluation is not provider approval or purchase approval.

3. **Credential and coverage-test authorization:** Only after explicit approval may credentials be created and a bounded NIFTY 50 coverage test be run. Record passing values separately for storage, display, and scoring eligibility.

4. **Licensing review and result:** Confirm intended use and plan rights; present field coverage, freshness, request cost, and licence evidence to the owner.

5. **Separate integration approval:** Only then may the owner approve a provider and a later engineering phase implement an adapter. `NO_FUNDAMENTAL_PROVIDER` remains the default until that phase is accepted.

---

## 5. NSE/BSE Filing Parser Option

If no commercial API is approved, a BSE/NSE XBRL bulk-download parser is feasible:

- NSE publishes quarterly financial results as XBRL ZIP at `nseindia.com/companies-listing/corporate-filings-financial-results`
- A one-time batch import (4 times per year after each quarter) would populate a local SQLite store
- The `FundamentalProvider.get()` would then query local DB
- **Cost:** Zero. **Freshness:** Quarterly. **Latency:** Query local DB — fast.
- **Development effort:** Medium (XBRL namespace parsing, NSE file format mapping)

This option is independent of any third-party API and avoids licensing concerns.

---

## 6. Prerequisites Before Integration

1. Current official documentation verified and cited for every provider claim.
2. Owner approves one provider only for bounded evaluation.
3. Credential creation and coverage testing separately authorized.
4. Coverage verified across all 50 NIFTY symbols using the four-category model and separate scoring eligibility.
5. Licensing and current API budget verified for intended use.
6. Owner explicitly approves provider integration in a later phase.
