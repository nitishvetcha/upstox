# Provider enquiry drafts

**Status: drafts only. Nothing has been sent.** The owner sends each enquiry. No account is created and no subscription or commitment is made by this document.

The same questions go to each provider, so the answers can be compared. Ask for written answers, and ask each provider to confirm in writing what it does not provide.

## Common questions (for every provider)

1. Historical bid/ask snapshots: are they available per timestamp? Give the snapshot interval, the depth (how many price levels), and the earliest date.
2. Full-chain historical open interest: are all strikes and both option types available at each timestamp? Give the earliest date.
3. Historical Greeks (delta, gamma, theta, vega, IV): are they supplied as observed values from the provider, or calculated? Name the model if calculated.
4. Historical option quotes and depth: is market depth available historically, and at what level?
5. Historical underlying and futures volume: is volume available for the index and its futures, at what interval?
6. Historical data coverage: earliest date per product, any gaps, and how gaps are reported.
7. API access and limits: requests per second, requests per day, and any bulk or file download options.
8. Pricing: subscription, per-download or per-request cost, and any additional exchange fees.
9. Research and backtesting licence: whether the data may be used for internal research and backtesting, and for how long.
10. Data retention and storage: whether the licence permits storing a copy locally, for how long, and whether storage must be encrypted or deleted on termination.

---

## Draft 1 — NSE Data & Analytics

To: marketdata@nse.co.in
Subject: Enquiry on historical F&O data products: bid/ask, full-chain OI, Greeks and pricing

Dear NSE Data & Analytics team,

I am evaluating historical F&O data for research into NIFTY and BANK NIFTY options, and the other NSE and BSE index options. Please confirm the following in writing for the End of Day Data and Historical Data products referenced in your F&O snapshot specifications:

[Insert common questions 1–10 here, with the NSE-specific note below.]

Specific to NSE: please confirm whether the Historical Data product includes historical bid/ask and market depth (Level 1 and Level 2) per timestamp, or whether those are real-time only. Please also confirm whether the Analytical Feed's Greeks have any historical equivalent.

Please send the current tariff and the technical specification for each product, and let me know if a research or non-commercial licence is available.

Thank you.
[Name, role, organisation, contact details — to be completed by the owner]

---

## Draft 2 — Fyers

To: the Fyers API support or sales contact (use the channel from the Fyers developer site)
Subject: Enquiry on expired F&O data: bid/ask, OI, Greeks, rate limits and research licence

Hello,

I am reviewing your expired F&O data API for historical research on index options. Please confirm in writing:

[Insert common questions 1–10 here.]

Specific to Fyers: please confirm whether the expired-F&O endpoint returns bid and ask, and whether it returns open interest for every strike at each timestamp or only for the selected contract. Please also confirm the Greeks source (observed or calculated) and the rate limits for each plan.

Thank you.
[Name, role, organisation, contact details — to be completed by the owner]

---

## Draft 3 — TrueData

To: TrueData sales or support (use the channel from truedata.in)
Subject: Enquiry on historical option data: bid/ask, full-chain OI, Greeks and licence

Hello,

I would like written confirmation of the historical data your platform provides for NSE and BSE index options, for research and backtesting. Please answer:

[Insert common questions 1–10 here.]

Specific to TrueData: your published materials describe streaming OHLC, bid/ask, volume and OI. Please confirm whether these are available historically, and if so for what date range and at what interval. Please state whether historical data is sold as a separate product from real-time streaming.

Thank you.
[Name, role, organisation, contact details — to be completed by the owner]

---

## Draft 4 — StockMojo

To: StockMojo contact (use the channel from stockmojo.in)
Subject: Enquiry on historical option-chain replay: bid/ask, OI, Greeks, coverage and licence

Hello,

I am evaluating your historical option-chain data for research. Please confirm in writing:

[Insert common questions 1–10 here.]

Specific to StockMojo: your materials describe minute-level replay with Greeks and IV. Please confirm whether bid/ask and full-chain OI are included, whether the Greeks are observed or calculated (and by what model), the coverage for NIFTY, BANK NIFTY, FINNIFTY, MIDCPNIFTY, SENSEX and BANKEX, and whether the data may be used for backtesting and stored locally.

Thank you.
[Name, role, organisation, contact details — to be completed by the owner]

---

## Notes for the owner

- Send each draft yourself. Do not reuse any reply's terms without checking the licence.
- Keep every answer in writing and file it with the date received.
- A verbal or web-page answer is not sufficient evidence for the data-source decision.
