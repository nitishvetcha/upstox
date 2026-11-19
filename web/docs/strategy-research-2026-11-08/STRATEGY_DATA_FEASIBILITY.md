# Strategy data feasibility (2026-11-08)

Written for: the research team. This states what the existing project data can and cannot test. It was built from the dataset files themselves, not from memory.

## Existing datasets

### Daily equity universe (Upstox, verified)
- Source: `web/.research-data/upstox-daily-universe-verified-2026-11-08/`.
- Verification file: 9,588 expected files, 9,588 present, 9,588 valid, 0 missing, 0 invalid, 0 extra, 0 manifest failures.
- Calendar: 6,629 sessions from 2000-01-03 to 2026-11-05 (`calendar.json`).
- Per-series coverage records include `firstDaily`, `listingStart`, expected sessions, bars with data, missing, partial and extra sessions, and cleaned hashes.

### NSE F&O bhavcopy (new host, 2024-06-03 to 2026-11-05)
- 603 sessions, 22,472,487 contract rows. Index options 3,197,854; stock options 18,895,267; stock futures 370,144; index futures 9,222.
- Fields: open, high, low, close, settlement, volume, open interest, expiry, strike, option type.
- **Absent:** bid, ask, bid and ask quantity, implied volatility, Delta, Gamma, Theta, Vega.
- 321 invalid futures OHLC rows (see the invalid-OHLC diagnostic); 0 invalid option rows.
- The 2010–2024-06 history is not available from this source (legacy host refused; new host returns 404 for earlier dates).

### Other project data
- `.data/history` (about 2.3 GB) holds historical candles. Its coverage was not re-audited for this assessment.
- Intraday research (I1–I8) and paper-session data exist under `.data/`; they are not used here.
- Index daily data for the six indices is not yet confirmed against the verified dataset in this document.

## Stocks

| Requirement | Status | Limitation |
|---|---|---|
| Daily adjusted prices | Verified daily Upstox series, per symbol | Adjustment basis is the data provider's; corporate-action handling was checked only in the earlier A2/A4 work. |
| Corporate actions | Partly verified (earlier corporate-actions evidence for a subset of symbols) | Not verified for the full universe. |
| Listing and delisting dates | `listingStart` and `firstDaily` present | Delisted names are not in the universe (see survivorship). |
| Point-in-time index membership | **Not available** | No historical constituent lists for Nifty 200 or Nifty 200 Momentum 30 were loaded. |
| Liquidity and traded value | Derivable from daily volume where present | Traded value is not stored as a verified field. |
| Survivorship | **Unresolved** | The universe is the set of equities listed on the collection date. Companies that were delisted before 2026-11-08 are absent, which biases results upward. |
| Symbol and ISIN mapping | Present (ISIN in instrument keys) | ISIN reuse and symbol changes not separately audited. |

**Conclusion for S1 (momentum):** a faithful replication needs point-in-time index membership and a survivorship-free universe. Neither exists in the current data. S1 cannot be tested faithfully until both are provided.

**Conclusion for S2 (time-series momentum on indices):** the daily data may support a trend test on the indices, but only if index series for NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX and BANKEX are verified in the same way. Their verification status was not confirmed in this document. Futures (rather than index levels) would need roll rules, and the bhavcopy futures history starts only in 2024-06.

**Conclusion for S3 (crash-risk regimes):** needs the same stock universe as S1 plus a verified market-volatility and breadth series. Breadth is not verified here.

## Options

| Requirement | Status | Limitation |
|---|---|---|
| Expired contract OHLC | Available from 2024-06-03 only | Earlier history not available from this source. |
| Bid and ask | **Not available** | Fills cannot be modelled from bid and ask. |
| Volume and open interest | Available | Reliable at the day level only. |
| Implied volatility and Greeks | **Not available** | Must not be inferred from OHLC and presented as observed. |
| Expiry and settlement | Expiry date present; settlement price present | Settlement method documented only by convention, not confirmed here. |
| Lot-size changes | Not verified in this document | Required for accurate position sizing. |
| Corporate actions on options | Not verified | Required for stock options. |
| Transaction costs | Statutory charges partly confirmed in earlier work; SEBI, STT, stamp and GST treatment unresolved | Cost model incomplete. |
| Executable fills | Not available | Only daily prints. |

**Conclusion for O1–O2 (debit spreads):** the bhavcopy can show what contracts traded and at what daily prices, but cannot show whether a spread could have been executed at those prices. A test on daily prints would be an upper bound on fill quality, not a realistic result. The period is also only about 2.4 years, and includes no major sustained bear market in the index.

**Conclusion for O3 (covered calls and collars):** requires stock prices (available, daily) and option prices for the same stock (available from 2024-06 only, with the same fill limitation). Covered-call replication needs the stock and call on the same day with the same expiry rules; this is feasible only for the 2024-06 onward window, with the fill caveat.

## Summary of what can and cannot be tested now
- **Can be tested with existing data, with caveats:** a daily time-series momentum test on index series, once the six index series are verified (S2); a daily covered-call replication on stock prices over 2024-06 onward, with daily fill assumptions (O3). Both are exploratory until the caveats are resolved.
- **Cannot be tested faithfully now:** cross-sectional momentum (S1, S3) without point-in-time membership and survivorship-free data; any options strategy requiring bid, ask, IV or Greeks; any test before 2024-06 for options.
- **Requires new data:** point-in-time index constituents; survivorship-free equity history; option bid and ask or intraday quotes; historical option chains with IV. Acquiring any of these is outside this task's restrictions and needs separate approval.
