# Options Strategy — Successor Specification (DRAFT, not frozen, not validated)

Status: draft. Strategy 11.4 remains frozen and unchanged (SHA-256 verified). This document describes a possible successor for a separate experimental research cycle. It is **not** approved for recommendations and has no historical evidence.

## 1. Scope

- Underlyings: NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX, BANKEX. A cycle may include only the indices whose data passes the trust checks in the research audit; the current trust state is in `OPTIONS_POST_COLLECTION_INVESTIGATION.md`.
- Instruments: long CE or long PE (buying only). No spreads or short options in this draft.
- Recommendation-only. No order is placed.

## 2. Signal (underlying)

Evaluated on the underlying index at the close of a completed bar:
- Trend: EMA 9 vs EMA 21 and close vs session VWAP, with the same definitions as Stock V2's TREND_RECLAIM.
- Confirmation (candidate): a pullback that touched EMA 21 within the lookback, then a close back through EMA 9 and VWAP.

Index 1-minute history is not in the repository for all six indices (see dependencies). Until it is, the signal cannot be backtested on the index.

## 3. Contract selection

- Expiry: nearest expiry with at least N sessions remaining (N to be set in research; default candidate 3), and an explicit expiry-day rule (no new entries on expiry day, candidate).
- Strike: the strike whose delta is closest to a target window (candidate ±0.5 for ATM, with the window tested). Deeper ITM as an alternative.
- Liquidity gates, all required: bid/ask spread at most a set percentage of premium (candidate 5%, matching Strategy 11.4's current ceiling for comparison); open interest and volume above minimums; quote fresh within the research threshold.

## 4. Entry and exit (measured, not formula-fixed)

- Entry: at the ask (or at the modelled ask proxy), at the next bar after the signal.
- Stop: a premium stop defined from the underlying structure, not from `|delta| × ATR`. Candidate: the underlying level that invalidates the signal (for example, the swing low below EMA 21), translated to premium through a documented delta-gamma approximation.
- Targets: a multiple of the realised stop distance, not a fixed multiple of the formula move. The reward-to-risk must be measured from these levels and must meet the minimum (candidate 1.5, consistent with Stock V2).
- Time exit: before a fixed session cut-off, and at a fixed time before expiry for any open position.

## 5. Risk

- Maximum planned loss per trade: a percentage of capital (candidate 1%), equal to premium paid × lots. Quantity is limited by capital.
- Lot size: from the contract master. Quantity is whole lots only.
- Daily loss limit and maximum concurrent recommendations: candidates to be set and documented.
- Correlated exposure: indices are correlated; the maximum count of simultaneous CE/PE recommendations across indices is a limit to be set.
- A stop does not guarantee a maximum loss. Gap and fill risk is stated in every output.

## 6. Costs

Brokerage, exchange charges, STT, stamp duty, SEBI and GST, using verified rates (not yet verified). Base, conservative (1.5× charges) and adverse slippage (0.2% premium) scenarios must all be reported.

## 7. Data requirements before any validation

- Contract-level historical premium with bid/ask and timestamps (not available; see dependencies).
- Index 1-minute history for the signal (not available for all indices).
- Event calendar and India VIX history (not available).

Without these, the successor can be tested only on logic, mapping, freshness, Greeks and risk fixtures.

## 8. Development and validation protocol

Pre-register the candidate set and selection rule before any result is seen, use chronological development and validation sets, and run validation once. A validation set must be independent of the development set; the existing research sessions cannot serve as both.
