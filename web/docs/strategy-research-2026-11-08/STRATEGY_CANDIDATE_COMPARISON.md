# Strategy candidate comparison (2026-11-08)

Written for: the research team. Classifications follow the Phase 11 rules: VERIFIED, SUPPORTED BUT NOT REPLICATED, INSUFFICIENT EVIDENCE, REJECTED. No candidate is VERIFIED: none has been reproduced on the intended Indian dataset in this project.

## Comparison with existing project work

| Project item | What it is (from project records) | Relationship to candidates |
|---|---|---|
| Strategy 11.4 | Frozen strategy; not modified. | Not re-audited. Overlap with S2 depends on its entry and exit rules, which were not reviewed here. |
| H1 | Cross-sectional daily ranking (from `docs/protocols/PROTOCOL_H1_v1.0.md`); contaminated v1.0 result preserved. | Closest to S1. Must be compared line by line before any claim that S1 differs. |
| H2–H5 | Other registered daily hypotheses; results unchanged. | Not compared in detail; the candidates here do not reproduce them. |
| A2 | Price-artefact sensitivity rerun (20% rule). | Relevant to S1 and S3 data quality; the artefact problem is a reason to require point-in-time data. |
| A3 | H1 position-level concentration audit. | Relevant to S1: concentration in few names. Any new momentum test needs concentration controls. |
| Donchian (daily) | Breakout rule, previously rejected. | Overlaps with trend following (S2) in spirit. Not revived. S2 is a different rule (12-month return sign) and is not a re-test. |
| I1–I8 (intraday) | Intraday hypotheses, rejected. | No overlap with the daily candidates here. Not revived. |
| G-1 V2 | Predictive diagnostics; no signal passed. | Relevant as a reminder that predictive significance does not imply executable profit. |

## Candidate table

| Candidate | Published evidence (source IDs) | Indian-market evidence | Data feasibility | Classification |
|---|---|---|---|---|
| S1 volatility-adjusted 6/12-month momentum | Official index methodology (R3–R5); US academic momentum literature (R1) | Index exists with rules; performance not established in sources read | Blocked: no point-in-time membership, survivorship bias | SUPPORTED BUT NOT REPLICATED (rules exist; replication blocked) |
| S2 time-series momentum on Indian indices | Moskowitz et al. (R2), US and multi-asset | BSE stock-level study (R18); no NIFTY index-futures study found | Partly feasible on index daily data once verified; futures history short | INSUFFICIENT EVIDENCE for Indian indices |
| S3 momentum crash and volatility regimes | Daniel and Moskowitz (R1) | None found | Blocked as for S1 | INSUFFICIENT EVIDENCE |
| O1 bull call debit spread | Nifty monthly spread study, 2007–2018 (R14), secondary summary | Yes, one study | Only daily prints from 2024-06; no bid, ask or IV | INSUFFICIENT EVIDENCE (one secondary source; fills unknown) |
| O2 bear put debit spread | Same Nifty study: loss-making (R14) | Yes, one study, unfavourable | As for O1 | REJECTED for priority; not rejected for future study, because the evidence is one secondary summary |
| O3 covered call | Nifty covered-call studies (R9, R10, R13), sector indices (R12), NSE stocks (R11), US (R15) | Several Indian studies, full texts not read | Feasible at daily level from 2024-06 with fill caveat | SUPPORTED BUT NOT REPLICATED |
| O3 protective collar | US benchmark evidence (R16, R17); Indian collar evidence not found | None found | As for covered call | INSUFFICIENT EVIDENCE for India |

## Ranking summary (see `STRATEGY_RESEARCH_PRIORITY.md`)
- Strongest external evidence: O3 covered call (several studies), S1 (official rules, US academic base).
- Most testable with existing data: O3 covered call at daily level (limited window, fill caveat); S2 on index series (once verified).
- Most blocked: S1 and S3 (survivorship and point-in-time membership), any option test needing bid, ask or IV.

## Protected items
Strategy 11.4, H1–H5, A2, A3, Donchian and I1–I8 are not modified and not re-run by this document. No result from these is restated or re-interpreted.
