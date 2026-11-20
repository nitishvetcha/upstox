# Options Post-Collection Investigation — 2026-11-05

Read-only. No Upstox or NSE calls, no collection, no token activity, no changes to `.data/`, thresholds, Strategy 11.4 or safety flags. Strategy 11.4 hash and both `OPTION_QUOTE_*` flags were not touched by this work.

Sources: `web/.data/options-audit-research/report-research_2026-11-05_1793872116193.json` and `rounds-research.jsonl` (127 records). Protocol: `docs/options-data-audit.md`. Constants: `src/lib/optionsAudit.ts` (60 s freshness, 2% price tolerance, 5 sessions, 6 rounds, IV median ≤1.0 and P95 ≤3.0). Research logic: `src/lib/research/optionsAuditResearch.ts`.

## 1. Why 5 November does not count as a second qualifying session

**Direct cause:** 5 November has **5 distinct qualifying 40-minute slots** per index, but the session needs **6**.

| Slot | Time (IST) | Source | Counted |
|---|---|---|---|
| 1 | 10:34 | Manual burst (5 runs in ~40 s), not in the approved schedule | Yes (first clean run) |
| 4 | 11:55 | Approved | **No record** (gate bug) |
| 5 | 12:35 | Approved | **No record** (gate bug) |
| 6 | 13:15 | Approved | Yes |
| 7 | 13:55 | Approved | Yes |
| 8 | 14:35 | Approved | Yes |
| 9 | 15:15 | Approved | Yes |

Root cause of the shortfall: the 11:55 and 12:35 slots never wrote records because the scheduler's token gate had a syntax error (fixed at 12:49). Had those slots run, 5 November would have had at least 6 distinct slots.

**Rule in code** (`researchReport`, `optionsAuditResearch.ts`): a session qualifies for an index when `count(qualifying distinct slots) >= minRoundsPerSession` (= `MIN_ROUNDS_PER_SESSION` = 6). Live target is met when `qualifyingSessions >= minSessions` (= 5). The report's "1/5" is therefore **correct**: 27 Oct has no qualifying rounds (all CLOSED), 28 Oct qualifies (10 slots per index), 5 Nov does not (5 slots per index).

## 2. Qualification rules (as implemented)

Per round (`classifyRound`): all of the following, or the round is excluded with a recorded reason:
- No collection error; at least one sample.
- Market state OPEN at capture (holiday-aware clock).
- Exchange status NORMAL_OPEN.
- Contract mapping pass; sampled expiry equals contract-master expiry.
- Timing valid: `chainRequestedAt ≤ chainReceivedAt ≤ quotesReceivedAt`, `chainToQuoteMs ≤ 2000`, and `|quotesReceived − requested − chainToQuoteMs| ≤ 100 ms`.

Per index per 40-minute slot: the first qualifying round is kept; later ones are excluded as `duplicate in 40-min slot N`. This is correctly applied (see the 10:34 burst: 1 counted, 4 excluded as duplicates, 1 excluded for missing token).

Per session: count of kept slots per index ≥ 6.

**TARGET_WINDOW vs FALLBACK, and weekly vs monthly:** evaluated **only for metric buckets**, not for qualification. A session can qualify from FALLBACK/MONTHLY rounds alone. The protocol text does not require TARGET_WINDOW evidence, so this is consistent with the protocol as written, but it means qualification says nothing about the target horizon.

**Protocol gap (not enforced):** `docs/options-data-audit.md` requires "≥ 6 sampling rounds each, spread through the session". The code checks distinct slots, not spread. The 10:34 burst (5 runs in 40 s) therefore counts as one slot. Without it, 5 November would have 4 slots; the decision whether out-of-schedule runs count is a protocol question for you, not something I change here.

## 3. Data-quality findings per index

Protocol-faithful numbers: liquid samples only (LTP > 0, OI ≥ 50, volume ≥ 5, spread ≤ 12%), pooled over the 28 Oct and 5 Nov qualifying slots. Interim rates, not verdicts.

| Index | Liquid samples | B: fresh (≤60 s) | Indeterminate | Stale | C: price agree (≤2%) | D: IV median / P95 | Chain IV missing | Status vs protocol |
|---|---|---|---|---|---|---|---|---|
| NIFTY | 330 | 93.3% **FAIL** (≥95) | 6.7% | 0% | 80.8% **FAIL** | 0.25 / 0.58 PASS | 0% | Fails B and C |
| BANKNIFTY | 330 | 97.3% PASS | 0% | 2.7% | 96.3% PASS | 0.42 / 1.20 PASS | 0% | Passes A–D to date |
| FINNIFTY | 237 | 21.9% **FAIL** | 3.0% | 75.1% | 90.4% **FAIL** | 0.89 / 1.99 PASS (n=52) | 0% | Fails B and C |
| MIDCPNIFTY | 328 | 58.2% **FAIL** | 0% | 41.8% | 96.9% PASS | 0.55 / 1.41 PASS | 0% | Fails B |
| SENSEX | 322 | 89.1% **FAIL** | 0% | 10.9% | 88.5% **FAIL** | 0.31 / 0.93 PASS | 0% | Fails B and C |
| BANKEX | 25 | 8.0% **FAIL** | 0% | 92.0% | 100% (n=25) | n=2 | 56% of liquid | Insufficient evidence; fails B |

Per-index findings:
- **BANKEX** is the most problematic: 25 liquid samples out of 330, 92% stale, and chain IV missing in more than half of the liquid samples. Most of its contracts do not trade often enough. Treat as unusable for validation until liquidity changes.
- **FINNIFTY** is the second: 75% stale and monthly expiries (18–26 DTE only). Its failing samples have quote ages of ~7.5 s median.
- **MIDCPNIFTY**: 42% stale, mostly monthly contracts.
- **NIFTY** fails price agreement (80.8%) while its quotes are fresh (median quote age 0.5 s). The disagreements are 2–6% (median ~3%). With fresh quotes, the mismatch sits on the chain-price side, which has no exchange timestamp. This is an **inference**, not proven offline. Our implementation is not ruled out, but I found no defect in the comparison code.
- **SENSEX**: 11% stale, 89% price agreement. Most failing samples are 8.3-DTE, with one cluster on a single date (14% of 21 samples). Not explained by available fields.
- **BANKNIFTY** is the only index passing B, C and D to date.

Upstream versus implementation:
- **Upstream (likely):** illiquid contracts with old last-trade times (stale tails for BANKEX, FINNIFTY, MIDCPNIFTY); missing chain IV for BANKEX; chain-vs-quote disagreement on NIFTY and SENSEX.
- **Implementation (checked, not defective):** timing bound, duplicate handling, horizon/series bucketing, the 60 s and 2% thresholds (match the protocol constants).
- **Implementation (open):** the protocol "spread" requirement is not enforced; `comparableShare`, `indeterminateShare` and `staleShare` are computed independently, so a sample can fall in both indeterminate and stale and the shares can sum above 100%. Report-only; eligibility uses comparable only. Not changed, since changing it would alter reported numbers.

## 4. Weekly versus monthly

- **NIFTY and SENSEX** use weekly expiries at 4–8 DTE, so their rounds are TARGET_WINDOW (NIFTY 100%; SENSEX 1/3 of its qualifying rounds, the rest FALLBACK).
- **BANKNIFTY, FINNIFTY, MIDCPNIFTY, BANKEX** have only monthly expiries at 18–26 DTE in these sessions. Their rounds are all FALLBACK.

So **four of six indices have no TARGET_WINDOW evidence** in these sessions, and that is not a data-quality issue. The protocol does not require TARGET_WINDOW for qualification, but any strategy that targets 2–7 DTE cannot be validated on these four indices from this dataset.

Horizon-level results (report `liveValidation`, interim):
- TARGET_WINDOW / WEEKLY: comparable 93.3%, stale 1.6%, price agree 84.2%, IV median 0.34 / P95 0.75.
- FALLBACK / MONTHLY: comparable 61.5%, stale 37.7%, price agree 96.0%, IV median 0.55 / P95 1.35.
- FALLBACK / WEEKLY: comparable 87.2%, stale 12.8%, price agree 85.3%, IV median 0.19 / P95 0.97.

Monthly contracts are staler (illiquid strikes), and the TARGET_WINDOW price agreement is lower than the monthly figure. Both are measured, not explained.

## 5. Timing methodology — what it can and cannot prove

Observed on the 90 qualifying rounds:
- `chainToQuoteMs`: median 172 ms, P95 507 ms, max 1120 ms. All within the 2000 ms bound.
- `|spotDrift|`: median 0%, max 0.0115%.
- Quote `ageS` (liquid, per index): NIFTY median 0.7 s; BANKNIFTY 2.7 s; SENSEX 6.0 s; MIDCPNIFTY 33.7 s; FINNIFTY 185 s; BANKEX 1759 s.

**What the timestamps prove:**
- The quotes were requested and received within 2 s of the chain request, so the chain and quote requests happened close together in local time.
- Each contract's last trade time, and its age at quote receipt (`quoteLastTradeTime`).
- Spot drift between the chain's underlying price and the quote-time spot.

**What they cannot prove:**
- The exchange generation time of the chain snapshot. `/v2/option/chain` has no generation timestamp (warned in the report). `chainReceivedAt` is local receipt time.
- That the chain LTP and the quote LTP describe the same instant. The 2 s bound limits the gap, but does not guarantee the chain price reflects the same trade.
- The actual age of the chain snapshot. A chain response can be older than its receipt time.

So a 172 ms request-to-quote gap is evidence about the local request sequence, not about the snapshot's age. The price-agreement failures on NIFTY with fresh quotes are consistent with the chain side being older than its receipt time, but that is not established.

## 6. Root causes and unresolved limitations

Resolved:
- Scheduler token-gate `SyntaxError` (fixed 12:49; verified by reproduction and then by the four slots completing with exit 0).

Open, upstream:
- No chain-generation timestamp.
- Illiquid contracts with stale last trades (BANKEX, FINNIFTY, MIDCPNIFTY).
- Missing chain IV (BANKEX).
- Chain-vs-quote disagreement on NIFTY and SENSEX (cause not established).

Open, ours (decisions needed):
- Protocol "spread through the session" is not enforced; the 10:34 out-of-schedule burst counts as a slot.
- Overlapping stale/indeterminate shares in the report (report-only).
- Four of six indices have no TARGET_WINDOW evidence in current sessions.

## 7. Additional collection requirement

- Qualifying sessions per index so far: **1** (28 Oct). Required: **5**. **Additional qualifying sessions needed: 4 per index** (all six indices share the same session requirement, so 4 each).
- Each additional qualifying session needs ≥ 6 distinct 40-minute slots. Data must come from market-open, NORMAL_OPEN slots with a valid token.
- Earliest regular trading days after 5 Nov: **6 Nov (Fri), 9 Nov (Mon), 11 Nov (Wed), 12 Nov (Thu)**. The 10 Nov and 24 Nov holidays are excluded. 8 Nov (Sun) is a Muhurat session, 18:00–19:00 IST, too short for 6 slots; do not count it.
- Earliest possible completion of four qualifying sessions: **12 Nov**, if every session qualifies.

Recommended cadence (protocol-compatible, spread across the session, two spare slots per session against a lost slot):
- Slots at 10:35, 11:15, 11:55, 12:35, 13:15, 13:55, 14:35, 15:15 IST (8 per session, each 40 minutes apart).
- Six slots alone (11:55–15:15) is the bare minimum with no margin for a failed slot. Do not rely on it.
- Run each slot only through the repaired gate. No burst runs. Do not run missed slots late.

Expect these to remain limited by the upstream issues in §6. More sessions will raise the sample size but will not fix stale BANKEX/FINNIFTY/MIDCPNIFTY contracts or the NIFTY/SENSEX price disagreement.

## 8. Recommended next steps

1. **Decide** whether out-of-schedule runs count and whether "spread through the session" must be enforced in code. Do not change this without approval.
2. **Decide** the reporting fix for the overlapping shares (recommended: stale = not comparable and not indeterminate). Apply before the next report, so the numbers are consistent.
3. **Authorize** the next collection (4 sessions × 8 slots per index, from 6 Nov). Do not start until you authorize it.
4. **Investigate** the NIFTY price disagreement on the chain side. The chain LTP vs quote LTP per contract, and whether the chain price matches the quote's previous print, can be checked offline from existing samples.
5. **Consider** excluding BANKEX from validation until its liquidity changes, or recording it as "insufficient" in the final report.

## 9. GO / NO-GO

- **NO-GO** for any options validation verdict or any use of options recommendations. No index is DATA_TRUSTED. NIFTY, FINNIFTY, MIDCPNIFTY and SENSEX fail at least one protocol check to date, and BANKEX has insufficient evidence. The options engine is **not production-ready**.
- **GO** only to continue research collection, and only after you authorize the next slots (§8.3). Collection can be restarted only through the repaired gate.
- Paper execution: disabled. Broker execution: disabled.
