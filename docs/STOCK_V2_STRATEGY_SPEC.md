# Stock Engine V2 — Strategy Specification

Status: **DRAFT — not approved for backtesting.** Recommendation-only. No broker orders. Stock Engine V1 is retired and is not modified by V2.

Data: `docs/STOCK_V2_HISTORICAL_DATA_AUDIT.md`. Blocking missing inputs are listed in §9.

## 1. Universe and data

- 50 NIFTY constituents from the 2026-11-04 snapshot. Not point-in-time (see audit §5).
- 1-minute OHLCV bars, IST, 09:15–15:29 (375 bars per regular session).
- Volume may be zero for some bars. A zero-volume bar is valid price information. VWAP over a window with zero total volume is undefined and produces no signal.

## 2. Indicators (computed causally)

All indicators use only bars at or before the decision bar.

- **EMA 9, 21, 50, 200.** Standard EMA on the continuous 1-minute close series for each stock, seeded with the SMA of the first `period` bars and carried across sessions in chronological order. A value is available once `period` bars have been seen. EMA 200 therefore first becomes available after 200 bars of history.
- **VWAP.** Session-anchored: `Σ(typical × volume) / Σ(volume)` from the session open to the decision bar, where `typical = (high + low + close) / 3`. Reset each session. Undefined while cumulative volume is zero.
- **ATR (for index-level gate only).** Wilder ATR over 14 bars of true range. Applies to NIFTY, which is not in the dataset (D1).

## 3. Signal rules

Decision bar `i` is the bar whose **close** is known. Signals are evaluated only on completed bars.

LONG at bar `i`, all true:
1. `EMA9[i] > EMA21[i]`
2. `close[i] > VWAP[i]`
3. `EMA200[i]` is available
4. Bar `i` time ∈ [09:30, 14:00) IST, and bar `i+1` exists.

SHORT at bar `i`: mirror of LONG (`EMA9 < EMA21`, `close < VWAP`).

At most one trade per stock per session: the first signal that passes every plan check (reward-to-risk, sizing) trades. Later signals that day are ignored.

## 4. Execution model

- **Entry:** open of bar `i+1` plus adverse slippage (§7). Never the close of bar `i`.
- **Stop-loss and target** use the V1 methodology adapted to bar data:
  - `dayRange[i] = HOD[i] − LOD[i]` (high and low of the session **through bar `i`**, not the full day).
  - `atrProxy = max(dayRange[i], close[i] × 0.008)` (V1 0.8% floor).
  - LONG: `stop = LOD[i] − atrProxy × 0.15`; `target = entry + atrProxy × 1.2`. SHORT mirrored.
  - The V1 "strong momentum" multiplier (1.75) requires NIFTY relative strength (D7). Not available, so 1.2 is used for every trade. This is a deliberate, recorded simplification.
  - Only target 1 is used. V1's target 2 is not used.
  - **Consequence (measured in tests):** with `atrProxy = max(dayRange, 0.8%)`, the stop sits at the session low and the target at `1.2 × atrProxy`. Once the stock has already moved, the reward-to-risk falls to about 1.0–1.1, below the 1.5 minimum. In practice only signals close to the session low pass the rule. This is a property of the V1 methodology under the 1.5 minimum, not a bug. It must be accepted or changed explicitly before any backtest.
- **Stop/target checks** start at bar `i+1`. If stop and target are both touched within one bar, the **stop is assumed first** (conservative).
- **Stop fills** at the stop price with adverse slippage. **Target fills** at the target price with no slippage.
- **Time exit:** close of the last bar before 15:15 IST, with adverse slippage.
- Positions do not carry overnight.

## 5. Risk and sizing

- Capital: parameter. **Default ₹10,00,000 is an assumption, not a user-supplied figure.**
- Risk per trade: 1% of capital. `qty = floor(capital × 0.01 × eventFactor / |entryFill − stop|)`. Reject if qty < 1.
- Event factor: 1.0 for NONE/LOW, 0.5 for MEDIUM, no trade for HIGH/EXTREME (D3).
- Minimum reward-to-risk: `|target − entryFill| / |entryFill − stop| ≥ 1.5`. Otherwise reject.
- No portfolio-level position cap is applied in this specification. This is a limitation: a real account would have a maximum open risk. Recorded, not decided.

## 6. Market-condition gates (fail-closed)

A gate with a missing input is **not passed**. The session is rejected with reason `MISSING_DEPENDENCY:<name>`. No value is substituted.

| Gate | Pass condition | Input |
|---|---|---|
| Market state | `NORMAL_OPEN` | D4 |
| Event risk | not HIGH or EXTREME (MEDIUM → 0.5 factor) | D3 |
| India VIX | ≤ 25 | D2 |
| NIFTY ATR % | ≤ 1.5% | D1 |
| Verified LIVE stocks | ≥ 20 | D5 (live only; historical data is not LIVE) |

## 7. Costs and slippage (assumptions — verify before quoting results)

Applied per side on turnover (price × qty). These are documented assumptions modelled on a typical discount broker intraday equity schedule. They are **not verified against a current tariff sheet**.

| Charge | Assumed rate |
|---|---|
| Brokerage | min(0.03% of turnover, ₹20) per order |
| Exchange transaction charge (NSE) | 0.00297% of turnover |
| SEBI fee | ₹10 per crore (0.0001%) |
| STT (intraday) | 0.025% on the sell side only |
| Stamp duty | 0.003% on the buy side |
| GST | 18% on brokerage + exchange + SEBI charges |
| Slippage | 0.05% adverse per fill (entry, stop, time exit). Target fills: none |

Slippage of 0.05% is an assumption chosen as a placeholder. It must be calibrated against observed spreads before any result is quoted. The dataset does not contain bid/ask, so spread cost cannot be measured from it.

## 8. Anti-leakage and bias controls

- Look-ahead test: changing any bar after `i` must not change the signal at `i` (tested).
- Same-candle execution is forbidden: entry is on `i+1` open (tested).
- Development and validation are chronological and disjoint (40 / 20 sessions).
- Duplicate trades: one per stock per session (tested).
- Survivorship bias: present, unquantified (audit §5). Results must carry this caveat.

## 9. Blocking dependencies

Do not run the backtest until each row is resolved. Recommended resolution per row:

| ID | Dependency | Recommended resolution |
|---|---|---|
| D1 | NIFTY 1-min candles | Supply the series, or approve a documented substitute (e.g. median constituent ATR %). A substitute changes the gate and must be recorded |
| D2 | India VIX history | Supply the series. There is no substitute |
| D3 | Event-risk history | Supply per-day levels. There is no historical source in the repo |
| D4 | Market-state history | Supply, or accept the session window as the state proxy (decision needed) |
| D5 | LIVE-stock count | Historical data cannot be LIVE. Gate can only apply live. Decision needed |
| D6 | V1 score (≥ 40) | Decide whether V2 uses V1's quote-based score or a new V2 score. The current spec does not define one |
| D7 | Strong-momentum flag | Requires D1. Simplified to 1.2× (§4) |
| D8 | Tariff verification | Check §7 against the broker's current schedule |

## 10. Status

- Implemented: indicators, signal rules, risk and sizing, gates, cost model, bar-level simulator, metrics (see `src/lib/stockV2/`), with offline tests.
- Not implemented: point-in-time constituents, portfolio risk caps, D1–D8 data sources.
- **No performance is claimed.** Unit-test success is not evidence of profitability.
