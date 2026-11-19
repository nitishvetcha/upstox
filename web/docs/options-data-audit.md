# Phase 4: options data trust audit

Status: **FROZEN 2026-10-24** (version `options-audit-1`). Criteria written before any audit data under this version was
collected. The two Phase 30.5 NIFTY audits (14–15 Oct) are background evidence only.
**Amended 2026-10-24, before any audit round existed** (`rounds.jsonl` was empty), to close fail-open gaps: see "Verdict
per index" and "Sampling integrity".

Purpose: decide, per index, whether option data is trustworthy enough to analyse. This audit does **not** enable
options, choose a strategy, or place orders. Until an index passes, its options stay blocked (fail closed).

Indices audited independently: NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX, BANKEX.

## Background (already known)
- `/v2/option/chain` returns no trade timestamp, so the app classifies every chain STALE. This is the current block.
- `/v2/market-quote/quotes` with option instrument keys returns a per-contract `last_trade_time`. That is the only exchange
  timestamp available.
- IV and Greeks come only from the chain and carry no timestamp of their own.

## Checks and pass criteria

**A. Instrument mapping and expiries (can run while the market is closed)**
- Option contract list per index is non-empty.
- Nearest expiry is today or later, and no listed expiry is in the past.
- Lot size is present and positive.
- For a sample of 20 contracts around ATM, a quote by `instrument_key` returns the same instrument (matched on
  `instrument_token`), and the chain row's strike and type agree with the contract master.
- **Pass:** all of the above for the index.

**B. Price freshness (live session only)**
- Sample: ATM ± 5 strikes, CE and PE (up to 22 contracts), only contracts passing the engine's liquidity filters.
- A sample is LIVE if its quote's `last_trade_time` is ≤ 60 s old at fetch time.
- **Pass:** ≥ 95% of liquid samples are LIVE, over ≥ 5 sessions with ≥ 6 sampling rounds each, spread through the session.

**C. Chain vs quote price agreement (live session only)**
- Chain LTP and quote LTP for the same contract, fetched within 2 s of each other.
- **Pass:** |chain − quote| ÷ quote ≤ 2% for ≥ 95% of liquid samples.

**D. IV / Greeks provenance (live session only)**
- IV is recomputed from the **fresh quote LTP** (Black-Scholes, same rate as the app, time to 15:30 IST on expiry day) and
  compared with the chain's IV.
- **Pass (chain IV usable):** median |difference| ≤ 1.0 vol point and 95th percentile ≤ 3.0 points.
- **If D fails:** chain IV and Greeks are treated as unverified. Any later options work must compute IV and Greeks
  in-house from fresh, timestamped quote prices.

## Verdict per index
| Verdict | Condition |
|---|---|
| DATA_TRUSTED | A, B, C and D all pass |
| PRICES_TRUSTED_IV_UNVERIFIED | A, B, C pass; D fails. Prices are usable, but chain IV and Greeks must not be. In-house IV/Greeks need their own separately validated implementation before any use |
| DATA_NOT_TRUSTED | A fails in any round, or B or C fails after the full sample |
| INSUFFICIENT | Fewer than 5 qualifying sessions (≥ 6 successful rounds each), or more than 5% of attempted rounds errored or were skipped |

**Sampling integrity**
- Every attempted round is recorded, including errors and skipped rounds (chain→quote gap > 2 s). None are dropped.
- Freshness and price-agreement percentages use only rounds from qualifying sessions.
- "Liquid" = the engine's own filters: LTP > 0, OI ≥ 50, volume ≥ 5, bid-ask spread ≤ 12% of LTP.
- A missing quote counts as not fresh.
- Check A runs again in every round, because expiries roll.
- While the audit is pending, option contracts are always graded REJECT if the chain is not verified LIVE
  (`opportunityEngine.ts`).

- A DATA_TRUSTED verdict only permits **research** (Phase 5: a pre-registered options hypothesis with historical
  validation). It never enables live trading.

## Safety
- Read-only Upstox calls only. No orders.
- Audit records go to `.data/options-audit/` (append-only). Existing records are untouched.
- `OPTION_QUOTE_LTT_ENABLED` stays false. Production gates are only made stricter during the audit (fail-closed option grading), never looser.
