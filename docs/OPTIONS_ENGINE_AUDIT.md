# Options Engine Audit — Strategy 11.4 (frozen) and its data path

Read-only. Date: 2026-11-05. Strategy 11.4 was not modified. Its SHA-256 is verified before and after this audit in the session log.

Scope of this pass: code inventory and the exit/plan logic of `src/lib/engine/strategy.ts`, plus the findings already established in `docs/OPTIONS_POST_COLLECTION_INVESTIGATION.md` and the research audit. The full scoring function (`analyze`), the signal-to-recommendation path in `opportunityEngine.ts`, news/RSS and breadth integration, and the Greeks/IV computation were **not fully audited in this pass**. They are listed in §6 as open.

## 1. What Strategy 11.4 contains (verified in code)

- Four structures: long CE/PE (`longOption`), debit spread (`debitSpread`), straddle (`straddle`), iron condor (`ironCondor`).
- Score floor `MIN_STRATEGY_SCORE = 65`.
- Debit reward-to-risk floor `MIN_RR_DEBIT = 1.2`. Credit floor `MIN_RR_CREDIT = 0.4`.
- Bid/ask ceiling `MAX_BID_ASK_PCT = 5`.
- Staleness rules (`staleness`) for market, option chain, news, technicals, breadth and futures VWAP. Market-closed states are reported.

## 2. Findings

### F1 — Long-option reward-to-risk is fixed by formula, not by the market (structural)
`longOption` sets `move = |delta| × indicators.atr` (index ATR), then:
- stop = `max(ltp − 0.35 × move, ltp × 0.5)`
- target1 = `ltp + 0.5 × move`; target2 = `ltp + 1.0 × move`

The reward-to-risk for target1 is therefore `0.5 / 0.35 ≈ 1.43` whenever the 0.5 floor does not bind — a constant, independent of premium, spread, time to expiry or volatility. The code's own comment says the estimate is "delta-only … ignores gamma/theta". This is the same class of issue the Stock V2 investigation found: the ratio is produced by the exit formula rather than measured from the structure. **Impact:** the 1.2 minimum is always met for long options, so the RR gate does not filter anything for this structure. Recommend a successor with explicit, measured exits (see `docs/OPTIONS_FINAL_STRATEGY_SPEC.md`).

### F2 — Premium exit model ignores theta and gamma (model assumption)
The premium move is approximated linearly as `|delta| × index move`. For near-expiry options and large index moves, gamma changes delta materially within one session, and theta erodes premium with time. The approximation is therefore biased, most strongly for short-dated contracts. It is disclosed in the code. **Impact:** target and stop levels on options are not a calibrated estimate of premium outcomes.

### F3 — Long-option `maxLoss` equals premium, but the stop is not a guarantee
`maxLoss: q.ltp` is correct for a bought option (the maximum loss is the premium paid, ignoring costs). The stop is a price trigger: in a gap or illiquid book the fill can be far below it. The plan does not model gap or fill slippage. **Impact:** stop-based risk statements must not be presented as maximum-loss guarantees (see the options spec).

### F4 — Entry premium is the sampled LTP, not a bid/ask fill
`entry: q.ltp` uses the last traded price. The spread gate (`MAX_BID_ASK_PCT = 5`) limits width but a buyer pays the ask. Execution cost is not included in `rr` or in the plan. **Impact:** reward-to-risk and expectancy are overstated by at least half the spread on every trade.

### F5 — Inconsistent minimum reward-to-risk between engines
Options debit minimum is 1.2; Stock V2 minimum is 1.5. Neither has been justified against the other, and the options figure is the one that the formula trivially satisfies (F1). **Impact:** the two engines do not share a risk standard.

### F6 — Chain-level freshness is not a snapshot timestamp (carried forward)
Confirmed in the post-collection investigation and in code: `/v2/option/chain` supplies no generation timestamp, so the option-chain source label falls back to a last-trade-time heuristic. `chainReceivedAt` is local receipt time. **Impact:** a "fresh" chain label is not evidence of an exchange snapshot time.

### F7 — Data-audit reporting (from the research audit, verified)
- The stale and indeterminate shares are computed independently and can overlap (sum above 100% in principle).
- The protocol's "spread through the session" requirement is not enforced; an out-of-schedule burst counts as one slot.
- Session qualification counts distinct slots across TARGET_WINDOW and FALLBACK horizons and across weekly and monthly series together. Horizon and series are only buckets for metrics.
- Percentile method: nearest-rank, no interpolation. With fewer than 20 samples the P95 is the maximum.
- Records do not store the audit protocol version beyond the research version string; no separate directory per protocol version exists.

These are reporting-layer findings. They do not change strategy signals.

### F8 — No historical option-premium dataset exists for backtesting (verified)
The repository contains research samples (`rounds-research.jsonl`: 127 records over 2026-10-27 to 2026-11-05, six indices) and the Phase 8 options audit records. Those are quote samples at collection times, not a contract-level historical premium series with bid/ask and OI over time. **Impact:** a valid historical options backtest of Strategy 11.4 cannot be run from existing data. See `docs/OPTIONS_DATA_DEPENDENCIES.md`.

## 3. Things verified as correct in this pass

- Long-option max loss equals the premium paid.
- Reward-to-risk for debit structures is computed as target distance over risk distance (formula check only).
- Staleness rules label END_OF_DAY and market-closed states rather than LIVE.

## 4. Summary verdict on Strategy 11.4

- Not suitable for recommendation as a validated strategy. Its exits are formula-determined (F1), its premium model is linear (F2), its entry ignores spread cost (F4), and no valid historical options backtest exists (F8).
- It remains frozen. Limitations are documented here; no change is made to it.

## 5. What this audit did not cover (open)

- `analyze()` scoring weights and their inputs; whether each input is valid when used.
- Greeks and IV computation (source of delta/gamma/theta/vega, Black-Scholes assumptions, time-to-expiry convention).
- Expiry and strike selection code paths and their contract-master mapping tests.
- News/RSS and breadth integration and their look-ahead properties.
- `opportunityEngine.ts` gating and the recommendation-of-the-day selection.
- Dashboard API integration for options.

These are required before any options engine claim of correctness beyond the findings above.

## 6. Recommended next steps (no action taken)

1. Complete the open items in §5 as a separate audit cycle.
2. Propose a successor options strategy with measured, not formula-fixed, exits and an execution-cost model (see the spec draft).
3. Obtain a historical contract-level premium source with bid/ask before any options backtest.
