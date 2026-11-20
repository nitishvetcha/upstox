# Pre-registration candidate: cross-sectional daily research, v2 (proposal, NOT registered, NOT run)

Written for: the project owner. This is a revised proposal awaiting final approval. Nothing is registered or run. No profitability is claimed. NO TRADE remains the default.

## Revision history

| Version | Date | Change |
|---|---|---|
| v1 | 2026-11-08 | Initial proposal |
| v2 | 2026-11-08 | Applies decisions 1–11 of the owner's review: liquidity threshold, long-only, pre-listing exclusion, eligibility rule (240 of 252 valid sessions plus 60-session traded value), numeric costs, explicit portfolio and outcome definitions, net and gross reporting |
| v2.3 | 2026-11-08 | Final bounded official-source attempt. Confirmed: NSE exchange and IPFT charges (circular read in browser), Upstox DP charge (official help article). Still UNRESOLVED: CDSL tariff (no extractable text), SEBI fee (no current circular reached), STT (income tax and India Code blocked), stamp duty (no source reached), GST entry (CBIC index read, annexure entry not read). Conservative sensitivity framework added |
| v2.2 | 2026-11-08 | Official cost verification: Upstox DP charge (help article, official), NSE circular confirmed. SEBI, STT, stamp duty, GST and CDSL tariff remain UNRESOLVED (primary sources not retrievable from the browser). See final cost schedule |
| v2.1 | 2026-11-08 | Exchange transaction charge updated from the official NSE circular NSE/FA/73061 (27 Feb 2026, effective 1 Mar 2026): ₹306.99 per crore per side (0.00307%), replacing ₹297 (0.00297%). IPFT contribution ₹0.01 per crore per side added. Other charges remain UNRESOLVED (Section 5) |

## 1. Data

- Source: `.research-data/upstox-daily-universe-verified-2026-11-08/` (verified: 9,588 of 9,588 files, 2,397 series).
- Prices: vendor daily prices, not verified as adjusted. Unadjusted treatment is assumed only where events are unresolved (see Section 4).
- Universe: today's listed NSE EQ set. Survivorship bias is an upper bound on all results.
- Turnover proxy: close × volume (shares). Vendor volume basis is not verified against exchange turnover.

## 2. Exclusions (applied before eligibility)

1. **Pre-listing bars.** Any bar dated before the verified master listing date is excluded. No bar is repaired or reassigned.
2. **Flagged daily moves.** Sessions where the open differs from the previous close by more than 35% are excluded for that stock.
3. **Corporate-action ex-dates.** The ex-date session of every split, bonus and face-value event for the stock is excluded (NSE corporate-action records, 2000–2026).
4. **Unresolved adjustment windows.** Any return window crossing an event whose adjustment status is unresolved (see Section 4) is excluded.
5. **Non-session bars.** Bars on dates outside the verified calendar are excluded (416 bars in the verified store).

## 3. Eligibility (frozen calculation)

A stock is eligible on date *t* (signal date, close of day *t*) if **both** hold:

- **Session rule:** at least 240 of the previous 252 calendar sessions (ending at *t*) are **valid**. A session is valid only if it has a bar with volume > 0 and is not excluded by Section 2. Missing sessions are never imputed.
- **Liquidity rule (primary):** the median of close × volume over the previous 60 calendar sessions, using valid sessions only, is at least ₹1 crore. The median requires at least 45 valid sessions in those 60; otherwise the stock is ineligible on that date.

Sensitivity thresholds (₹50 lakh and ₹2 crore) are reported alongside the primary result. The primary threshold is not chosen from performance.

Eligible counts per year are reported. The development period begins in 2010, and the limited early sample is disclosed.

## 4. Adjustment status

- Vendor adjustment is verified only where the ex-date price step matches the NSE factor. Other events are **unresolved**.
- Unresolved events: their ex-date session and any return window spanning them are excluded (Section 2, items 3–4).
- The 35% flagged-move exclusion is retained.

## 5. Costs and charges

**Primary cost scenarios (both as set by the owner):**
- Brokerage: ₹20 per executed order, both scenarios.
- Slippage: BASE 0.10% per side; CONSERVATIVE 0.25% per side, both applied to the execution price.

**Statutory charges (delivery, long-only), provisional:**

| Charge | Value used | Status |
|---|---|---|
| STT, delivery, buy and sell | 0.1% of turnover each side | Consistent across sources. Confirm against the official NSE page |
| Stamp duty, buy side | 0.015% of turnover | Consistent in sources. Varies by state. Confirm |
| Exchange transaction charge, cash segment, both sides | ₹306.99 per crore of traded value (0.00307%), effective 1 Mar 2026 | **VERIFIED, official**: NSE circular NSE/FA/73061, dated 27 Feb 2026 (table: revised outflow, cash market) |
| NSE IPFT contribution, both sides | ₹0.01 per crore of traded value | **VERIFIED, official**: same circular (previously ₹10 per crore) |
| SEBI fee, both sides | 0.0001% of turnover | Consistent in sources |
| GST | 18% on brokerage, exchange charge and SEBI fee | **UNRESOLVED.** Upstox's help article applies 18% to brokerage, transaction charges and SEBI charges (and DP charges for delivery). No government (CBIC) primary source was retrieved |
| DP charge, per sell order per scrip | ₹20 plus GST (Upstox help article) | **UNRESOLVED** for official confirmation. Upstox states CDSL ₹3.5 plus Upstox ₹16.5, total ₹20 plus GST (male), and ₹3.25 and ₹16.75 (female). CDSL's official schedule was not retrieved |

The NSE page `nseindia.com/static/invest/first-time-investor-sebi-turnover-fees-stt-other-levies` timed out and was not read. The NSE exchange-charge circular was read directly. Until the UNRESOLVED items are confirmed from official sources, every net-of-cost result is **provisional** and cannot support a profitability claim.

Calculation per round trip (per executed order): cost = brokerage + STT + exchange + SEBI + stamp (buy side) + GST, with DP on sell. Each component is computed on the executed value and documented in the output.

## 6. Portfolio construction and outcomes (long-only)

Reporting distinction (owner's final clarification):
- **H1 and H2:** executable hypothetical long-only portfolios, net of costs. Reported as executable net-of-cost results (still hypothetical, not a trading recommendation).
- **H3 and H4:** predictive regime comparisons only, reported separately, gross and net of an equal-weight hypothetical cost where stated.
- **H5:** predictive liquidity comparison only. Not an executable trading strategy.
- Predictive comparisons are never labelled as executable performance.
- Limitation retained: close × volume is a proxy. The vendor volume basis has not been verified against exchange turnover.

All positions are equal-weight, entered at the open of *t+1* (after signal date *t*), exited at the open after the holding period, and non-overlapping (a new rebalance begins only after the previous positions exit).

**H1 — 12-month relative strength, skip 1 month.** Rank eligible stocks by return over the 252 sessions ending 21 sessions before *t*. Hold the top decile, 21 sessions. Predictive comparison: top-decile average minus eligible-universe average.

**H2 — 1-month short-term reversal (long-only).** Rank eligible stocks by return over the previous 21 sessions. Hold the bottom decile, 5 sessions. Predictive comparison: bottom-decile average minus eligible-universe average.

Decile size: n = max(10, ceil(|E_t| / 10)). If |E_t| < 100, the date is skipped and counted.

**H3 — Breadth regime.** Breadth = share of eligible stocks with close above their 50-session simple moving average on day *t*. Regime HIGH if breadth ≥ 0.50, otherwise LOW. Outcome: equal-weight average 21-session forward return of the eligible universe, by regime. This is a predictive comparison, not a strategy.

**H4 — Volatility regime.** NIFTY 50 20-session realised volatility (annualised) on *t* against its trailing 252-session median (prior data only). HIGH if above the median. Outcome: equal-weight average 21-session forward return of the eligible universe, by regime. Predictive comparison only.

**H5 — Liquidity behaviour.** Quintiles by the 60-session median traded value on *t*. Outcome: 21-session forward return. Predictive comparison: Q5 minus Q1. Not an executable strategy (no short leg).

## 7. Decision framework (unchanged from the registered statistical framework)

- Development 2010-01-04 to 2017-12-31; validation 2018-01-01 to 2021-12-31; holdout 2022-01-03 to 2026-11-05 (opened only if validation passes).
- For each hypothesis, in validation: the mean predictive spread is positive, the date-clustered 95% lower bound is above zero, and the observed value beats a matched random-portfolio null at the 97.5 percentile. The null draws random portfolios of the same size from the eligible set on each date: 1,000 draws, fixed seed 20261108.
- Net-of-cost results are reported alongside the gross results. A passing predictive result justifies only a further protocol, not a trading claim.

## 8. Outputs (for every hypothesis and sensitivity)

Gross and net returns; turnover; costs by component; drawdowns; eligible stock counts by year; exclusions by reason; missing-data effects (skipped entries and delayed exits); results by cohort, regime and stock.

## 9. Missing-data and delisting

- No imputation.
- Entry skipped if the stock has no valid bar on the execution day; counted.
- Exit at the first valid session after the scheduled exit; delay recorded.
- If a stock stops trading while held, forced exit at its last available price, flagged as a delisting or suspension outcome and reported separately.

## 10. Status

Ready for final approval. After approval, the protocol is registered (versioned, hashed) before any run. Holdout not opened. NO TRADE remains the default.

## Final cost schedule (v2.2, for approval)

Retrieved 2026-11-08. Each row gives the status and the source. "UNRESOLVED" means the official primary source was not retrieved, so the value is not used as verified.

| Charge | Value used | Source and date | Status | Historical-rate assumption |
|---|---|---|---|---|
| Exchange transaction charge, cash, both sides | ₹306.99 per crore (0.00307%) | NSE circular NSE/FA/73061, dated 27 Feb 2026, effective 1 Mar 2026 | **VERIFIED (official, NSE)** | Before 1 Mar 2026: ₹297 per crore (0.00297%), the "existing outflow" in the same circular. Start date of ₹297 not verified |
| NSE IPFT contribution, both sides | ₹0.01 per crore | Same circular | **VERIFIED (official, NSE)** | Before 1 Mar 2026: ₹10 per crore, same circular |
| SEBI turnover fee, both sides | ₹10 per crore (0.0001%) | Not verified. The SEBI page retrieved (sebi.gov.in/commreport/feestructure.html) is an old consultation paper on a proposed fee structure, not the current circular | **UNRESOLVED** | Not established for any period |
| STT, delivery, buy and sell | 0.1% of turnover each side | Not verified from an official source. The Income Tax page (incometaxindia.gov.in) and India Code's Finance (No. 2) Act 2004 PDF are blocked to the browser. Secondary sources say 0.1% since 1 Jul 2012 | **UNRESOLVED (official)** | Before 1 Jul 2012: 0.125% each side (secondary source only, unverified) |
| Stamp duty, delivery, buy side | 0.015% | Not verified from an official source. Varies by state | **UNRESOLVED** | State-specific; not established |
| GST | 18% on brokerage, plus exchange and SEBI charges (and DP charges) | Not verified from CBIC. Notification 11/2017-CT(Rate) is cited by secondary sources only; the SAC code mapping for stock brokers is inconsistent across sources | **UNRESOLVED (official)** | Not established |
| DP charge, customer-facing (Upstox), per sell, per scrip, per day | ₹20 plus GST (male: CDSL ₹3.5 + Upstox ₹16.5; female: CDSL ₹3.25 + Upstox ₹16.75) | Upstox official help article, help.upstox.com/... 248667 / upstox.com/help-center/t-248667/. No effective date printed | **VERIFIED (official, Upstox), no effective date** | Assumed the same across 2010–2026. Not verified; flagged |
| DP charge, depository (CDSL) tariff | ₹3.5 male / ₹3.25 female (as split by Upstox) | CDSL official schedule not retrieved | **UNRESOLVED** | Not established |

Brokerage: ₹20 per executed order, both scenarios (owner decision). Slippage: 0.10% (BASE) and 0.25% (CONSERVATIVE) per side (owner decision). These are assumptions, not market data.

**Consequences for the research:**
- Net-of-cost results can be computed exactly for the NSE charges and the Upstox DP charge.
- STT, stamp duty, GST and SEBI charges are unverified, so any net-of-cost result must carry an explicit provisional flag.
- Results before 1 Mar 2026 use the ₹297 and ₹10 rates for the exchange and IPFT charges. This is an assumption, verified only for the circular's "existing outflow" wording.
- The 2010–2012 period needs a separate STT assumption (0.125%), which is unverified.

**Approval needed:** either accept the UNRESOLVED items as provisional with the flags above, or authorise a further primary-source retrieval from a domain the browser can read (CBIC, India Code, SEBI circulars archive, or CDSL). No further retrieval has been attempted beyond what is listed.

## Statutory-cost verification table (final bounded attempt, 2026-11-08)

Attempt limit reached. Inaccessible sources were not retried. Each row records what was reached.

| Component | Official source reached | Title, date, effective date | Rate established from primary source | Status |
|---|---|---|---|---|
| Exchange transaction charge, cash | NSE circular NSE/FA/73061 (nsearchives.nseindia.com/content/circulars/FA73061.pdf), read in browser | Revision in Transaction Charges, dated 27 Feb 2026, effective 1 Mar 2026 | ₹306.99 per crore per side (0.00307%); before 1 Mar 2026 ₹297 per crore (0.00297%) | **CONFIRMED (primary)** |
| NSE IPFT contribution, both sides | Same circular | Same | ₹0.01 per crore per side; before 1 Mar 2026 ₹10 per crore | **CONFIRMED (primary)** |
| DP charge, customer-facing (Upstox) | Upstox official help article (help.upstox.com/... 248667; upstox.com/help-center/t-248667/), read in browser | "What are Depository Participant (DP) Charges?", no effective date printed | ₹20 plus GST per scrip per sell day (male: CDSL ₹3.5 + Upstox ₹16.5; female: CDSL ₹3.25 + Upstox ₹16.75) | **CONFIRMED (broker official), no effective date** |
| DP charge, depository CDSL tariff | Found URL cdslindia.com/downloads/DP/HowToBecomeaDP/CDSL-DP-Tariff-structure-2025.pdf; the PDF has no extractable text in the browser | "CDSL DP Tariff structure 2025" (title from URL only) | Not established | **UNRESOLVED** |
| SEBI turnover fee | sebi.gov.in/commreport/feestructure.html, read | An old consultation paper on a proposed broker fee structure, not the current circular | Not established (old Table shows existing cash fee and proposed revisions only) | **UNRESOLVED** |
| STT, delivery | incometaxindia.gov.in/w/section-98-55: access denied in browser. India Code Finance (No. 2) Act 2004 PDF: screenshot denied | Not reached | Not established from primary. Secondary sources: 0.1% each side, delivery; 0.125% before 1 Jul 2012 | **UNRESOLVED** |
| GST on brokerage and service charges | CBIC Central Tax (Rate) notifications index (cbic-gst.gov.in/hindi/central-tax-rate.html), read | Notification 11/2017-CT(Rate), dated 28 Jun 2017 (rates for services, annexure); amendments include 15/2021 (18 Nov 2021) and 03/2022 (13 Jul 2022) amending 11/2017 | 18% is the general rate in secondary sources. The annexure entry for stock brokers was not read, and the SAC mapping is inconsistent across sources | **UNRESOLVED (entry text not read)** |
| Stamp duty, delivery buy | No official source reached in this attempt | Not reached | Not established. Secondary sources: 0.015% on buy side; state-specific | **UNRESOLVED** |

## Confirmed current rates
- Exchange transaction charge: ₹306.99 per crore per side (0.00307%), from 1 Mar 2026 (NSE circular).
- IPFT contribution: ₹0.01 per crore per side, from 1 Mar 2026 (NSE circular).
- Upstox DP charge (customer-facing): ₹20 plus GST per scrip per sell day (Upstox official, no effective date).

## Historical assumptions (documented, not verified as applied)
- Exchange and IPFT: ₹297 and ₹10 per crore before 1 Mar 2026 (existing outflow in the same circular). The start date of ₹297 was not established.
- DP charge: the 2026 Upstox figure is assumed to apply to earlier periods. Not verified.
- STT: 0.125% before 1 Jul 2012 (secondary source only). Not verified.
- No current rate has been applied to a historical period without this documented assumption.

## Components that remain provisional
SEBI turnover fee, STT (all periods), stamp duty (all periods), GST base and entry, CDSL DP tariff.

## Conservative sensitivity framework (labelled, not rates)
Used only until primary confirmation. These are bounds for stress-testing, not claimed rates:
- **Low cost case (BASE):** confirmed exchange and IPFT charges, Upstox DP charge, brokerage ₹20 per order, slippage 0.10% per side, STT 0.1% delivery, stamp 0.015% buy, GST 18% on brokerage and exchange charges only, SEBI ₹10 per crore.
- **High cost case (CONSERVATIVE):** confirmed exchange and IPFT charges, Upstox DP charge, brokerage ₹20 per order, slippage 0.25% per side, STT 0.1% delivery, stamp 0.015% buy, GST 18% on brokerage, exchange, SEBI and DP charges, SEBI ₹10 per crore.
- Both cases are reported as provisional. Results should be read as a range, not a point estimate.
