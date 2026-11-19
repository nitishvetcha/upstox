# Data feasibility assessment (2026-11-09)

Written for: the research team. Built only from the project's existing reports and dataset summaries. No data was collected, no API or NSE request was made, and nothing was opened from any holdout.

## 1. Datasets already held (per project records)

| Dataset | Coverage | Known limitations |
|---|---|---|
| Daily equity universe (Upstox, verified) | 9,588 expected files, all present and valid; calendar of 6,629 sessions from 2000-01-03 to 2026-11-05; about 2,397 instruments | Universe is the current listing set; delisted names are absent (survivorship bias); corporate-action adjustment verified only for a subset |
| Intraday bars (Upstox) | From 2022 | Short window; survivorship as above |
| Index daily series (clean, 2026-11-06 v1) | NIFTY and SENSEX from 2000-01-03; BANKNIFTY from 2000-01-01; FINNIFTY from 2004; BANKEX from 2002; MIDCPNIFTY from 2022-01-10 | Flat placeholder years (BANKNIFTY 2000–2004 and part of 2005; FINNIFTY 2004–2011 and part of 2012; BANKEX 2002 and part of 2003); duplicate sessions in 2015; about 46 non-calendar dates per series; BSE calendar not stored; zero index volume |
| NSE F&O bhavcopy (new host) | 603 sessions, 2024-06-03 to 2026-11-05; 22,472,487 contract rows | Contains OHLC, settlement, volume and open interest. **No bid, ask, IV or Greeks.** 321 invalid futures OHLC rows (excluded from range-based work); settlement-price definition not confirmed |
| NSE bhavcopy before 2024-06 | Not held | Legacy archive refused access; not retried; no earlier history from the accessible host |
| Options expired-contract history (Upstox) | Not held | Account plan restriction (UDAPI1149); 0 completed expiries retrievable |
| Historical option chain snapshots | Not held | No historical snapshot endpoint |
| Point-in-time index membership | Not held | Survivorship cannot be controlled |
| Lot-size history | Not held | Current contract master only |
| Transaction-cost verification | Partly estimated | Statutory items (SEBI, STT, stamp, GST, CDSL) not fully verified; see section 5 |

## 2. Candidate-by-candidate feasibility

| Candidate | Required data | Already held | Missing | Quality limits | Credible historical test possible? | Reject for data? |
|---|---|---|---|---|---|---|
| Cross-sectional momentum (6/12 m) | Daily adjusted prices, point-in-time constituents, delisted names, corporate actions | Daily prices (current universe) | Point-in-time membership; delisted histories | Survivorship bias (flatters results, typically strongly for losers); corporate-action coverage partial | **No**, not faithfully | No; **data blocked** |
| Volatility-adjusted momentum (index methodology) | As above, plus index rules | As above | As above | As above | **No** | No; data blocked |
| Momentum crash controls and volatility regimes | Momentum portfolio series plus market volatility and breadth | Daily prices; partial breadth | Verified breadth series; PIT membership | As above | **No** for the cross-section; a market-level version is possible only with verified index series | No; data blocked for the cross-section |
| Time-series momentum on indices | Daily index series; futures or index levels; roll rules if futures | NIFTY, SENSEX (2000+), BANKNIFTY and FINNIFTY from usable dates, BANKEX from 2004, MIDCPNIFTY from 2022 | Verified futures history before 2024 (bhavcopy only from 2024-06); BSE calendar; resolution of 2015 duplicates | Placeholder years must be excluded; non-calendar dates unresolved; index level, not tradable without futures or ETF costs | **Yes, for an index-level test on NIFTY and SENSEX from 2000**, subject to calendar checks | No; **testable with exclusions** |
| Trend-following and pullback (stock) | Daily prices, intraday for pullback timing | Daily prices; intraday from 2022 | PIT membership | Survivorship; intraday window short | Partly; cross-section blocked | Partly; data blocked for cross-section |
| Mean reversion (long horizon) | Multi-year prices, PIT membership, delistings | As above | As above | Survivorship strongly affects losers; disappearing losers hide the reversal | **No** | Yes for now; data blocked |
| Mean reversion (intraday) | Intraday bars | Intraday from 2022 | Bid/ask | Overlaps rejected I-series; costs | Not proposed | **Reject** (overlap) |
| Index debit spreads (bull call, bear put) | Daily index levels; option prices with bid/ask, OI and volume over expiries | Index levels; option daily prints from 2024-06 only (no bid/ask) | Option prices before 2024-06; bid/ask; lot-size history; expiry calendar | Fills unknown; prints are not executable; sample 2024-06 to 2026-11 is short | **No** for a faithful test; a daily-print test would be an upper bound only | **Data blocked** |
| Index calendar and diagonal spreads (Slivka-type) | Near-the-money option prices across expiries | As above | Option prices before 2024-06 | As above | **No** | **Data blocked** |
| Volatility-regime defined-risk (straddles, long vol) | Option prices with IV or chain data | As above | IV and Greeks (not in bhavcopy) | IV must not be inferred and presented as observed | **No** | **Data blocked** |
| Short strangles and weekly selling (undefined risk) | Option prices with bid/ask, margin | As above | As above | Undefined risk; tail risk | Not appropriate for this phase | **Reject** |
| Stock defined-risk directional spreads | Stock option prices with bid/ask and volume | Stock options in bhavcopy from 2024-06 (18.9 million rows) | Pre-2024 option history; bid/ask; corporate actions on options | Fills unknown; liquidity thin in many names | **No** for a faithful test | **Data blocked** |
| Momentum-based stock options | As above, plus momentum ranking | As above | As above, plus PIT membership | As above | **No** | **Data blocked** |
| Covered calls (stock overlay) | Stock daily prices (held); call prices with bid/ask | Stock prices (current universe); call prints from 2024-06 | Pre-2024 call prices; bid/ask; dividend and corporate-action treatment | Survivorship in stock prices; fill and dividend assumptions | **Partly**, a daily-print test from 2024-06 only, as an upper bound | **Data blocked** for a credible test |
| Protective collars | As covered calls, plus put prices | As above | As above | As above | **No** | **Data blocked** |

## 3. Survivorship and look-ahead risks

- **Survivorship:** the equity universe is current listings. Companies that failed, merged or were delisted before 2026-11-08 are absent. Any cross-sectional result inflates losers' absence and so inflates long-only or long-short returns. This cannot be corrected without point-in-time membership and delisting histories.
- **Look-ahead:** constituent lists used as-of a later date leak future membership into earlier periods. The index-membership snapshot used by the project is dated 2026-11-04 and must not be applied to earlier sessions.
- **Index placeholder bars:** flat zero-volume years would produce false zero returns and false volatility lows if used. They are excluded in this phase.
- **Corporate actions:** verified for a subset only. Unadjusted splits or bonuses would create false returns.

## 4. Regime and sample considerations
- The index series covers 2000 onward, which includes several market regimes. Cross-sectional momentum evidence (A1–A4) covers earlier Indian samples (1995–2013 in the snippets).
- The option sample (2024-06 to 2026-11) covers one short window and no sustained bear market in the index; any option result would be regime-specific.
- Intraday data is from 2022 only.

## 5. Cost data status
- Project cost model (delivery, from earlier sessions): brokerage ₹20 per order; STT 0.1% each side; exchange 0.00297%; SEBI 0.0001%; stamp 0.015% on buy; GST 18%; DP ₹18.5 per sell; slippage 0.05% per side. **These are estimates, not broker-confirmed charges.**
- Project cost model (intraday, from earlier sessions): STT 0.025% on sell; stamp 0.003% on buy; brokerage ₹20 or 0.1% per order, whichever is lower. **Estimates; not checked against a contract note.**
- F&O statutory items: NSE charge schedule confirmed in an earlier session; SEBI fee, STT, stamp, GST base and entry treatment and CDSL DP tariff remain unresolved.
- Option spreads and bid/ask costs: **not measurable** from the bhavcopy. Any option cost assumption must be marked as an assumption.
- Market impact and liquidity: not measurable from daily data except through volume and open interest (available for options from 2024-06, zero index volume).

No cost value in this document is verified. Any proposal must state its cost model as an assumption and carry a sensitivity test.

## 6. Summary of feasibility
- **Testable now, with exclusions:** time-series momentum on index-level daily series (NIFTY, SENSEX from 2000).
- **Not testable faithfully now:** every cross-sectional equity strategy (point-in-time membership missing); every option strategy requiring bid/ask or pre-2024 option prices; any stock-option or covered-call test requiring historical call prices.
- **Requires new data (not requested in this phase):** point-in-time NSE index membership with delistings; verified corporate actions for the full universe; historical option chains with bid/ask before 2024-06; lot-size history; verified cost schedules.

Acquiring any of these needs separate approval, and no new NSE or Upstox request is made by this document.
