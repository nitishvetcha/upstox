# Strategy evidence review (2026-11-08)

Written for: the research team. Sources are listed in `STRATEGY_SOURCE_REGISTER.md` (R-numbers below). Most claims rest on snippets or secondary summaries, and that is stated for each. Nothing here is a backtest result produced by this project. No returns are claimed.

## Stock candidates

### S1. Volatility-adjusted six- and twelve-month cross-sectional momentum
- **Official methodology (R3):** the NSE Indices Nifty200 Momentum 30 index ranks Nifty 200 members on a Normalised Momentum Score based on six- and twelve-month price returns, adjusted for daily price volatility. It holds 30 stocks, rebalances semi-annually (June and December), and caps stock weights at the lower of 5% or 5× the free-float-cap weight. Launch 25 August 2020; base date 1 April 2005.
- **Published evidence:** the index is an official product with a published rule set (R3, R4, R5). Its rules are not evidence of profitability. Whether the index beats its benchmark after costs was not established from the sources read.
- **Gap:** the factsheet and whitepaper were not opened in full. The exact score formula, buffers and screening rules must be read from R4 or R5 before any replication.
- **Relationship to H1 (existing project hypothesis):** likely overlapping in family (cross-sectional momentum ranking, decile or top-N portfolios, periodic rebalance). The difference that matters is the volatility adjustment, the six- and twelve-month windows, the weight cap, and the semi-annual schedule. Whether that is materially different from H1 cannot be decided until H1's exact definition (in `docs/protocols/PROTOCOL_H1_v1.0.md`) is compared line by line with R3–R5. It must not be treated as a rename of H1, and H1's contaminated results are not reused.

### S2. Time-series momentum and trend following on Indian indices
- **Published evidence (R2):** Moskowitz, Ooi and Pedersen (2012) report that a time-series momentum signal, based on the past 12-month return, predicts future returns across a broad set of futures markets. This is a US-academic study covering many asset classes. It does not test NSE indices.
- **India-specific (R18):** a 2022 study of Indian equities (BSE, monthly data 1996–2020) reports an absolute momentum effect and a risk-managed variant. It is stock-level, not index-level, and the abstract was only partly available.
- **Gap:** no peer-reviewed study testing time-series momentum on NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX or BANKEX futures was found. Practitioner sources (blogs, TradingView scripts) show results on index close prices without costs or slippage, and are not evidence.
- **Relationship to previous work:** distinct from Donchian (a breakout rule, previously rejected) and from I1–I8 (intraday). Not a re-test of either. Whether it overlaps Strategy 11.4 depends on 11.4's entry and exit rules, which were not re-audited here.

### S3. Momentum crash risk and volatility regimes
- **Published evidence (R1):** Daniel and Moskowitz (NBER 2014; JFE 2016) document that momentum strategies suffer severe, concentrated losses ("crashes"), particularly in high-volatility rebounds after bear markets. The snippet available supports this at the level of the abstract; the paper's specific regime definitions and magnitudes were not read.
- **Indian evidence:** none found in this search.
- **Project relevance:** the project's A2 result (contamination from price artefacts) and A3 result (position concentration in H1) are both concentration and data-quality findings. A crash-risk filter could be relevant to the H1 family, but any filter must be specified before testing. The literature does not show that a volatility filter improves profitability; the Daniel and Moskowitz work is about the risk profile, not an improvement.

## Options candidates

### O1. Bull call debit spread
- **Published evidence (R14):** a study of Nifty monthly spreads, 2007–2018, reports bull call and bull put spreads profitable and bear call and bear put spreads loss-making, with bull call earning about 2.75× the bull put profit. The paper's sample is one rising-market period.
- **Gap:** the full paper was not located, so transaction costs, sample size, and the entry and exit rules are unknown. Results are in index points, not per-trade returns on capital.
- **Structural properties (from the definition, not from a study):** the maximum loss is the net debit; the maximum gain is the strike width less the debit; breakeven is the lower strike plus the debit. Premium decay and volatility sensitivity depend on the chain's bid, ask and implied volatility, which the bhavcopy does not contain.

### O2. Bear put debit spread
- **Published evidence:** the only Nifty study found (R14) reports bear put spreads loss-making over 2007–2018. The sample is one period and one study. No NSE-specific bear put spread study was found.
- **Assessment:** the evidence available points in the unfavourable direction. That is not a rejection, but it is a reason not to prioritise O2.

### O3. Covered calls and protective collars
- **Published evidence:**
  - Covered calls on Nifty (R9, R10): both report hedged portfolios with lower risk than the unhedged index, and covered calls with higher average return in the Misra and Dalmia sample. The Aggarwal study reports a 5% in-the-money covered call beating the index on standard measures (sample Oct 2005–Sep 2010).
  - Covered calls on NSE stocks (R11): protective puts outperformed covered calls overall; covered calls worked best for lower-return, higher-volatility stocks.
  - Covered calls on sector indices (R12) and on Nifty futures with VaR (R13): reported as effective hedges.
  - US evidence (R15, R16): the covered combination and covered call outperform long stock on a risk-adjusted basis; the collar and protective put underperform long stock regardless of the measure.
  - Benchmark indices (R17): the CBOE collar index defines a 95–110 collar; it is a benchmark, not evidence of profitability.
- **Gap:** no full text was read for any NSE covered-call study. Costs, dividends, expiry settlement and roll rules are not reported in the snippets.
- **Relevance to a stock portfolio:** these are overlay strategies for holders of stock. They cap upside and do not generate a standalone signal.

## Retail base rate (context, not a strategy)
- SEBI (R6, R7, R8): in FY22, most individual equity F&O traders lost money; the headline figure is 89% of individual traders, and 93% over FY22–FY24 in the follow-up. The figures are from press coverage and one SSRN abstract, which report different metrics. The primary SEBI document was not read. These figures argue for caution with any discretionary or retail-style options use; they do not evaluate any specific strategy.
