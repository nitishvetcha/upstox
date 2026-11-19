# Phase 9B — NSE and BSE holiday calendar: source status

**Status: CALENDAR RECORDS LOCATED AND BSE COPIES RETAINED; DATE-SPECIFIC PILOT CHECK STILL REQUIRED.** The previously missing BSE 2026, BSE 2025 Muhurat, and NSE/BSE 2024 records have been identified by exchange notice/circular number. Full-page PDF copies and the original HTML responses for the three required BSE notices are retained under `docs/phase0/evidence/bse/`. Special sessions remain excluded from normal-session evidence. No dates are inferred from generic third-party holiday calendars.

Date checked: 2026-11-12, under the Phase 9B Stage 3 approval for official exchange documents.

## Official records obtained

| Exchange / scope | Document | Issue date | Official source | Applicable dates / special sessions |
|---|---|---:|---|---|
| NSE F&O, 2025 | Trading holidays for the calendar year 2025, NSE/FAOP/65588, circular 161/2024 | 2024-12-13 | https://nsearchives.nseindia.com/content/circulars/FAOP65588.pdf | 2025-02-26, 03-14, 03-31, 04-10, 04-14, 04-18, 05-01, 08-15, 08-27, 10-02, 10-21, 10-22, 11-05, 12-25. It flags Muhurat trading on 2025-10-21. |
| NSE capital market, 2025 special session | Muhurat Trading session on account of Diwali, NSE/CMTR/70319, circular 124/2025 | 2025-09-22 | https://nsearchives.nseindia.com/content/circulars/CMTR70319.pdf | 2025-10-21: pre-open 13:30–13:45 IST; normal market 13:45–14:45 IST. This is not a full session and must not be evaluated against 09:15–15:30 criteria. |
| NSE F&O, 2026 | Trading holidays for the calendar year 2026, NSE/FAOP/71777, circular 212/2025 | 2025-12-12 | https://nsearchives.nseindia.com/content/circulars/FAOP71777.pdf | 2026-01-26, 03-03, 03-26, 03-31, 04-03, 04-14, 05-01, 05-28, 06-26, 09-14, 10-02, 10-20, 11-10, 11-24, 12-25. |
| NSE capital market, 2026 corroboration | Trading holidays for the calendar year 2026, NSE/CMTR/71775, circular 172/2025 | 2025-12-12 | https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf | Same 15 dates as the NSE F&O circular. No conflict found between these NSE segments. |
| BSE equity, 2025 | Equity Segment Master Circular, section 2.2 Trading Holidays | 2025-04-29 | https://www.bseindia.com/markets/MarketInfo/DownloadAttach.aspx?attachedId=8a7fec3a-95bc-4bd2-82de-76e2a84e2915&id=20250429-51 | Same 14 holiday dates as NSE F&O 2025. It flags Muhurat trading on 2025-10-21, but does not give the special-session timing. |
| BSE equity and equity derivatives, 2026 | Trading Holidays for the Calendar Year 2026 for Equity and Equity Derivatives Segments, notice 20251212-8 | 2025-12-12 | https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=20251212-8 | Same 15 weekday closures as the NSE 2026 records. It also identifies Muhurat trading on Sunday 2026-11-08, with timing to be notified separately. |
| BSE equity and equity derivatives, 2025 special session | Muhurat Trading Session notices 20250922-21 (equity) and 20250922-22 (equity derivatives) | 2025-09-22 | https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=20250922-21 and https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=20250922-22 | 2025-10-21: equity pre-open order entry 13:30–13:38, matching 13:38–13:45; equity and equity-derivatives continuous trading 13:45–14:45 IST; equity closing 14:45–14:55. This is not a full normal session. |
| NSE F&O, 2024 | Trading holidays for the calendar year 2024, NSE/FAOP/59723, circular 188/2023 | 2023-12-12 | https://archives.nseindia.com/content/circulars/FAOP59723.pdf | 14 weekday closures in the original annual circular; Muhurat trading flagged for 2024-11-01. Subsequent election closures must also be applied. |
| NSE capital market, 2024 | Trading holidays for the calendar year 2024, NSE/CMTR/59722, circular 154/2023 | 2023-12-12 | https://archives.nseindia.com/content/circulars/CMTR59722.pdf | Same original 14 weekday closures as NSE F&O and BSE; Muhurat trading flagged for 2024-11-01. |
| BSE equity, equity derivatives and SLB, 2024 | Trading Holidays for the Calendar Year 2024, notice 20231212-40 | 2023-12-12 | https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=20231212-40 | Same original 14 weekday closures; Muhurat trading flagged for 2024-11-01. BSE notices 20240408-25 and 20241108-19 subsequently added election closures on 2024-05-20 and 2024-11-20. |
| NSE capital market, 2024 special session | Muhurat Trading session on account of Diwali, NSE/CMTR/64628, circular 147/2024 | 2024-10-19 | https://nsearchives.nseindia.com/content/circulars/CMTR64628.pdf | 2024-11-01: pre-open 17:45–18:00 and normal market 18:00–19:00 IST. This is not a full normal session. |

## Unresolved records and conflicts

| Item | Result | Required treatment |
|---|---|---|
| BSE canonical evidence retention | Direct HTTPS retrieval returned the complete official BSE notice pages for 20251212-8, 20250922-21 and 20250922-22. The original HTML responses and visually verified full-page PDFs are retained under `docs/phase0/evidence/bse/`. | Retention requirement is complete for these three notices. Keep the files unchanged and include them in the repository review. |
| 2026 Muhurat timing | Both exchanges identify 2026-11-08 as Muhurat trading, but the timing is still to be notified separately. | 2026-11-08 remains HOLD and is ineligible for the normal-session pilot. |
| 2024 election amendments | The original annual lists do not include the later Mumbai election closures on 2024-05-20 and 2024-11-20. | Any 2024 calendar implementation must apply the later NSE/BSE amendment circulars in addition to the annual lists. |

## Calendar comparison

- NSE F&O and BSE equity holiday dates agree for the 14 listed 2025 weekday closures.
- NSE F&O and NSE capital-market circulars agree for all 15 listed 2026 closures.
- The original NSE and BSE annual lists agree for the 14 listed 2024 weekday closures. Later election amendments add 2024-05-20 and 2024-11-20 and must not be omitted.
- NSE and BSE annual lists agree for all 15 listed 2026 weekday closures.
- No unknown date may be promoted from `HOLD` based on weekend logic or a third-party calendar.

## Effect on evidence collection

- `calendarKnown` may be true only when the specific date, segment, and actual session window are covered by the official records above.
- A combined six-index session requires both NSE and BSE confirmation for the exact selected date. The annual 2026 calendars are now available, but the selected date must still be checked against subsequent exchange amendments before it can leave `HOLD`.
- Holiday dates are not collection sessions. Special/modified sessions must use their confirmed actual window and are excluded from full-session criteria unless a separate rule is approved.
