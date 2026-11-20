# NSE F&O discovery: result (2026-11-08)

Request 0 (the first approved request): GET https://archives.nseindia.com/content/fo/fo_mktlots.csv -> HTTP 301, empty body.
Request 1 (approved, headers only): same URL, no redirect followed -> HTTP/2 301, server AkamaiGHost, content-length 0,
  location: https://nsearchives.nseindia.com/content/circulars/FAOP61157.pdf   (headers saved in request1-headers.txt)
Request 2 (approved, one request, Location is an official NSE host): GET that URL -> HTTP 200, application/pdf,
  101016 bytes, last-modified Fri, 15 Mar 2024, SHA-256 0cd65b415df4079108cea8fe0346b2c8e8599c6d2954c1d92c85368bfd31580b
  (saved as request2-FAOP61157.pdf, headers in request2-headers.txt). No further redirects followed.

Finding: the document is NSE F&O circular "Discontinuation of Quantity Freeze and Permitted Lot Size Report" (March 2024).
It states that fo_mktlots.csv and Qtyfreeze.csv were discontinued, and that the same information is in the MII contract
file NSE_FO_contract_ddmmyyyy.csv.gz, published at https://www.nseindia.com/all-reports-derivatives.
Consequence: fo_mktlots.csv is not a current source. The F&O universe must come from the MII contract file, which requires
a separate approval to fetch (not requested in this turn).
