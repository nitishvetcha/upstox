# Phase 0 — Data reliability and provenance audit (2026-11-11)

Scope: what the code does with data, offline. Live Upstox behaviour is BLOCKED for this audit (no live requests in this phase).

| ID | Severity | Status | Finding |
|---|---|---|---|
| D-01 | — | PASS | Token handling: expiry, invalidation and source selection. `upstoxAuth.ts` (`resolveCredential`, `classifyToken`); tests in `operatorAuth.test.ts` and `upstoxVerifiedCache.test.ts` (4/4). Upstox tokens expire daily at 03:30 IST: operational limit, not a code defect. |
| D-02 | — | PASS | Candle completeness: a candle counts only when its start plus interval is at or before now. `candleFreshnessPolicy.test.ts` 21/21, `incompleteSessions.test.ts` 28/28. |
| D-03 | — | PASS | Index candles carry zero volume, so spot VWAP is null. Futures VWAP is kept separate and labelled. `technical.test.ts` 23/23; `vwapNullInput.test.ts` 5/5. |
| D-04 | MEDIUM | BLOCKED | The option chain (`/v2/option/chain`) has no generation timestamp (stored audit report, `.data/options-audit-research/`). Chains are labelled STALE by rule. Per-contract verification (`optionPriceVerification`) requires every checked contract to be live; one stale strike marks the chain STALE. Needs a market-hours check (9:15–15:30 IST). |
| D-05 | MEDIUM | PASS (tests) | Per-contract trade time is read from `market_data.last_trade_time` or the side object, with a minimum-epoch sanity check (`upstoxMarket.ts` lines 102–104, 184–185). Whether Upstox sends it for index chains is BLOCKED (needs one live sample). |
| D-06 | — | PASS | Breadth: strict ±0.05% neutral band, 80% coverage floor, per-quote freshness (150 s). `breadth.test.ts` 12/12, `breadthTimestamps.test.ts` 16/16. |
| D-07 | HIGH | FAIL (design) | Breadth constituents are a static list (`breadthConfig.ts` `INDEX_CONSTITUENTS`). This is today's membership, not point-in-time history. Survivorship bias for any historical use. |
| D-08 | — | PASS | News freshness: stale or unverifiable news is not counted (`analysis.ts` news block). `news.test.ts` 25/25, `rss.test.ts` 17/17. Consequence: S-07. |
| D-09 | — | PASS | Instrument identity: canonical option rows validated against contract metadata; a lot-size disagreement resolves to null, not a guess (`upstoxMarket.ts` `resolveLotSize`). Tests in the option-window and contract-integrity suites. |
| D-10 | — | PASS | Upstox error classification: documented codes only; no message-text matching. `upstoxErrorClassification.test.ts` 10/10. |
| D-11 | HIGH | BLOCKED | Historical dataset (H1 concerns): flat placeholder bars, duplicate days, non-calendar dates, unverified BSE calendar (`docs/INDEX_SERIES_FEASIBILITY_2026-11-08.md`). Not resolved. Blocks any historical evidence. |
| D-12 | MEDIUM | FAIL (evidence) | Cost rates are configured defaults, stated as "verify before use" (`transactionCosts.ts` header; version `nse-options-2024-10`). Not verified against current schedules. |
| D-13 | — | PASS | Fail-closed on data: unknown lot size, stale market, mock input and missing factors each block trades. Tests `staleMarketGate.test.ts` 9/9, `analysisSafety.test.ts` 8/8, `mockExecutionGuard.test.ts`. |
| D-14 | LOW | PASS | Mock data is labelled MOCK and never LIVE (`mockTechnicals.test.ts` 5/5; breadth labelling `breadthMockStatus.test.ts` 6/6). |

Summary: the code handles freshness, completeness, identity and failure correctly, and tests confirm it. Open: the option-chain timestamp question (D-04, D-05), survivorship (D-07), the historical dataset (D-11) and the cost-rate verification (D-12).
