# Review of the cross-sectional daily proposal, v2 (2026-11-08)

Review and checklist. Nothing is registered or run. Companion to `DAILY_CROSS_SECTIONAL_RESEARCH_PROPOSAL_2026-11-08.md` (v2).

## Revision history

| Version | Date | Change |
|---|---|---|
| v1 | 2026-11-08 | Initial review of the 14 protocol items |
| v2 | 2026-11-08 | Applied the owner's decisions 1–11. Checklist updated. Statutory charges verified only in part |
| v2.3 | 2026-11-08 | Final bounded official-source attempt. Confirmed: NSE exchange and IPFT charges (circular read in browser), Upstox DP charge (official help article). Still UNRESOLVED: CDSL tariff (no extractable text), SEBI fee (no current circular reached), STT (income tax and India Code blocked), stamp duty (no source reached), GST entry (CBIC index read, annexure entry not read). Conservative sensitivity framework added |
| v2.2 | 2026-11-08 | Official cost verification: Upstox DP charge (help article, official), NSE circular confirmed. SEBI, STT, stamp duty, GST and CDSL tariff remain UNRESOLVED (primary sources not retrievable from the browser). See final cost schedule |
| v2.1 | 2026-11-08 | Exchange transaction charge verified from the official NSE circular NSE/FA/73061 (27 Feb 2026, effective 1 Mar 2026): ₹306.99 per crore per side (0.00307%), replacing 0.00297%. IPFT ₹0.01 per crore added. Remaining charges still unresolved |

## Checklist: the 14 protocol items

| # | Item | v1 status | v2 status | Resolution / open point |
|---|---|---|---|---|
| 1 | Minimum traded value | Open | **RESOLVED** | ₹1 crore median over the previous 60 sessions (valid sessions, at least 45); sensitivity ₹50 lakh and ₹2 crore reported, none selected |
| 2 | Eligibility lookback | Open | **RESOLVED** | At least 240 valid of the previous 252 sessions; valid = volume > 0, not excluded; no imputation |
| 3 | Price basis | Open (wrong) | **PARTIAL** | Prices not verified as adjusted. Ex-dates excluded; 35% rule kept; windows crossing unresolved events excluded. Per-event adjustment remains UNRESOLVED for the ambiguous events |
| 4 | Costs | Open | **PARTIAL** | Brokerage, slippage and cost structure fixed. Statutory values UNRESOLVED (see item 7) |
| 5 | Portfolio construction | Open | **RESOLVED** | Decile n = max(10, ceil(|E|/10)), skip if |E| < 100, equal weight, non-overlapping |
| 6 | Outcome measure | Open | **RESOLVED** | Open-to-open holding return, net and gross |
| 7 | Short leg | Open | **RESOLVED** | Long-only for all five hypotheses (owner decision). H5 is a predictive comparison only |
| 8 | Missing-data treatment | Open | **RESOLVED** | No imputation. Entry skipped and counted; exit delayed to next valid session, delay recorded |
| 9 | Delisting and suspension | Open | **RESOLVED** | Forced exit at last available price, flagged and reported separately |
| 10 | Splits and eligibility by year | Open | **RESOLVED** | 2010 start kept; eligible counts per year reported with the limited early sample disclosed |
| 11 | Null construction | Open | **RESOLVED** | Random same-size portfolios from the eligible set per date, 1,000 draws, seed 20261108, net of the same costs |
| 12 | Uncertainty method | Open | **RESOLVED** | Date-clustered cluster-robust variance on the daily series; 95% lower bound |
| 13 | Breadth threshold | Open | **RESOLVED** | 50% of eligible stocks above their 50-session average |
| 14 | Volatility regime | Open | **RESOLVED** | NIFTY 20-session realised volatility versus its trailing 252-session median, prior data only |

**Summary: 11 resolved, 2 partial (items 3 and 4). Item 4 is partly verified: the exchange charge is now official, and the GST base, STT, stamp duty, SEBI fee and DP charge remain UNRESOLVED.**

## Statutory charges: verification status

Checked by a web search (secondary sources, not the NSE primary table, which was identified but not retrieved in full):

| Charge | Proposed value | Finding | Status |
|---|---|---|---|
| STT delivery, buy and sell | 0.1% each side | Upstox help article only (official Finance Act source not retrieved) | **UNRESOLVED (official)** |
| Stamp duty, buy | 0.015% | Upstox help article only; varies by state; state-act source not retrieved | **UNRESOLVED (official)** |
| Exchange transaction charge | 0.00297% | **Official**: NSE circular NSE/FA/73061 (27 Feb 2026, effective 1 Mar 2026) sets ₹306.99 per crore per side (0.00307%); previously ₹297 (0.00297%). Updated | **VERIFIED (official), value updated** |
| SEBI fee | 0.0001% | Upstox help article shows ₹10 per crore. SEBI circular not retrieved (an older undated CSE sample also lists ₹10) | **UNRESOLVED (official)** |
| GST | 18% on brokerage, exchange and SEBI | Upstox's help article includes SEBI charges and DP charges in the base for delivery. No CBIC primary source retrieved | **UNRESOLVED (official)** |
| DP charge | ₹20 plus GST per sell | Upstox help article: CDSL ₹3.5 plus Upstox ₹16.5 (male), ₹3.25 plus ₹16.75 (female). CDSL official schedule not retrieved | **UNRESOLVED (official)** |

Consequence: no net-of-cost result from this protocol can be called final until the exchange charge, GST base and DP charge are confirmed from the NSE primary table and the broker's own schedule. Confirmation needs one primary-source lookup, which I can do with your approval if you want it; no further request has been made.

## Proposed revisions to the owner's list (applied)

- Eligibility rule replaced by 240 of 252 valid sessions plus the 60-session traded-value rule (item 5 of the review).
- Brokerage ₹20 per order and slippage 0.10% (BASE) and 0.25% (CONSERVATIVE) fixed (item 6).
- Statutory charges set with status recorded (item 7).
- Outcome, costs, turnover, drawdown and missing-data outputs listed (items 9–10).
- Holdout dates unchanged; not opened (item 11).

## Remaining decisions for you

1. Approve the primary-source confirmation of the exchange charge, GST base and DP charge (one lookup), or accept them as provisional with the unresolved flag.
2. Confirm the ₹1 crore primary threshold and the 45-valid-session median requirement.
3. Confirm that the pre-listing exclusion uses the master listing date for every stock.

After these, the proposal is ready for registration. Nothing has been run. NO TRADE remains the default.

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
