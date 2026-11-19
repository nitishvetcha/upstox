# Holdout access audit (2026-11-11)

Question asked by the external review: has the 2022-onward holdout been accessed, and can it still serve as an independent holdout?

**Conclusion: the holdout is NOT confirmed as sealed.** The 2022–2025 window was used by intraday research runs on 2026-11-08. The repository records two different holdout definitions, and one of the runs cites a protocol file that does not exist in the repository. Under the review's rule, the project remains NO-GO until the owner decides how to handle this.

## What was checked (metadata and repository records only; no holdout data was opened)
| Check | Result |
|---|---|
| P1 record (`docs/strategy-research-next-phase-2026-11-09/P1_RESULTS_2026-11-09.md`) | States: data restricted to pre-2022; "the 2022+ rows were dropped by date only; no 2022+ price was read, tabulated or used". The record is a statement, not an access log. |
| File access times on the stored clean series (`.research-data/upstox-clean-2026-11-06-v1`) | NIFTY 50 series last accessed 2026-11-06 19:10. Most files last accessed 2026-11-06; five on 2026-11-08. No access recorded on 2026-11-09, the P1 date. This does not match a P1 run that read the file on 9 November, so the access record is incomplete or P1 read through another path. Access times cannot show which rows were read. |
| P1 script `scripts/predictive-g1.ts` | Development period 2022-01-03 to 2023-12-31 and validation period 2024-01-01 to 2025-06-30. The script parses the whole JSON file before filtering by date, so later rows are loaded into memory even when not tabulated. |
| Intraday G1 v2 runs (`.research-data/predictive-g1-1h-2026-11-08/`, `…15m-2026-11-08/`, created 2026-11-08) | Output covers 2022–2025 (development and validation). Decisions for both grids are all `pass: false`. These runs are not recorded in the continuation report, master audit or roadmap. |
| Protocol cited by the G1 v2 runs (`docs/PREDICTIVE_POWER_G1_PROTOCOL_V2.md`, SHA-256 `55f03a00…`) | **File not found in the repository.** The protocol hash cannot be verified. |
| Holdout definition in G1 v2 script (`scripts/predictive-g1-v2.ts` lines 4, 17, 317) | Holdout = dates after 2025-06-30, "never loaded" (`holdoutLoaded: false`). This conflicts with the P1 record (holdout = 2022 onward). |

## Findings
| ID | Severity | Status | Finding |
|---|---|---|---|
| H-01 | CRITICAL | FAIL | The 2022–2025 window was used for development and validation diagnostics on 2026-11-08 (G1 v2). This contradicts the sealed-holdout record. |
| H-02 | CRITICAL | FAIL | Two holdout definitions exist: 2022 onward (P1 record) and after 2025-06-30 (G1 v2 script). No single definition is in force. |
| H-03 | HIGH | FAIL | The G1 v2 protocol file cited in the runs is missing from the repository. The runs cannot be checked against their own protocol. |
| H-04 | HIGH | FAIL | The G1 v2 runs are not recorded in any project status document. |
| H-05 | HIGH | BLOCKED | The P1 claim of "no 2022+ price read" cannot be verified. The script loads whole files, and file access times do not match the P1 date. |
| H-06 | MEDIUM | FAIL | Access logs are incomplete. No per-run log of which date ranges were read exists. |
| H-07 | HIGH | Disclosure | During this audit the aggregate validation results of the G1 v2 runs (2024–2025) were printed to the audit log. No raw holdout prices were opened. The results are already in the output file, but this access must be counted as exposure to 2024–2025 results. |
| H-08 | — | PASS | No strategy parameter change in this audit. No holdout-based tuning was done in this session. |

## What this means
- 2022–2025 can no longer serve as an independent holdout for any strategy. Its results are visible to development work.
- Only data after the latest date used by any run (and after 2025-06-30 in the G1 definition, which has not been loaded) could still be independent. That data must be defined and frozen by the owner before use.
- All G1 v2 decisions failed their own pass criteria. Diagnostically, this is a negative result and is recorded as such.

## Decisions needed from the owner
1. Accept 2022–2025 as contaminated and define a new holdout, for example forward data after a frozen date. (Recommended.)
2. Or treat the G1 v2 runs as an exploratory run, record them in the status documents, and keep the holdout reserved from 2025-06-30 with the protocol file restored.
3. Restore or withdraw `PREDICTIVE_POWER_G1_PROTOCOL_V2.md`.
4. Confirm whether any other run read 2022 onward. This audit could not check the wider system beyond the repository.

## Correction (2026-11-11, after recovering the G1 protocol)
- **H-03 closed:** `docs/PREDICTIVE_POWER_G1_PROTOCOL_V2.md` exists (untracked, at the repository root). Its SHA-256 is `55f03a00de1fd405c7979c6f050645829d99674adddde9adb8d2a455d4d38fa1`, matching the runs. It was never committed to Git, so Git history cannot restore it; the on-disk copy verifies.
- **H-02 revised:** the G1 protocol's own holdout is 2025-07-01 onward. Its analysis window is 2022-01-03 to 2025-06-30. The conflict is with the P1 record's sealed 2022-onward holdout, not with the G1 protocol.
- **H-01 revised:** the 2022–2025-06 window was analysed by the G1 runs as their own protocol specifies. That window is still inside the P1 holdout, so the P1 holdout is exposed.
- **H-09 (new, CRITICAL):** the G1 v2 script reads each whole series file (`scripts/predictive-g1-v2.ts`, around line 72) and filters by date afterwards. Rows from 2025-07-01 onward were therefore loaded into memory. The protocol's statement "never loaded into memory" is false at that level. The same applies to P1 (`scripts/predictive-g1.ts`). The G1 results document reports only the holdout's start date, not any holdout values.
- **H-07 restated:** the aggregate 2024–2025 validation outputs were printed during this audit. This is recorded as exposure.
- **Conclusion:** neither the 2022-onward window nor the post-2025-07 window can be treated as an untouched holdout.
