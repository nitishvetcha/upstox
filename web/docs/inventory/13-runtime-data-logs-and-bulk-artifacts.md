# Inventory: Runtime Data, Logs, and Bulk Artifacts

**Category**: `13-runtime-data-logs-and-bulk-artifacts`  
**Description**: Exhaustive audit of all persistent runtime directories, paper trading records, empirical research rounds, caches, and bulk build/dependency artifacts.

---

## 1. Summary of Bulk Artifact & Vendor Directories

| Directory Path | Classification | File Count | Disk Size (MB) | Tracked in Git | Description & Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [`web/node_modules`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/node_modules) | Dependencies / Vendor | 32,124 | 463.56 MB | Ignored (.gitignore) | NPM package dependencies for Next.js and tools |
| [`web/.next`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.next) | Build Artifacts / Cache | 3,390 | 1278.62 MB | Ignored (.gitignore) | Compiled production/dev Next.js assets and SSR cache |
| [`web/.test-data`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.test-data) | Generated Test Data | 1,352 | 4.09 MB | Ignored (.gitignore) | Temporary test runner execution data and fixtures |
| [`.git`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/.git) | VCS Metadata | 34,325 | 431.63 MB | Internal | Git object store, commit index, and references |
| [`venv`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/venv) | Dependencies / Vendor | 37,527 | 871.92 MB | Ignored (.gitignore) | Python 3 virtual environment for legacy scripts |
| [`venv311`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/venv311) | Dependencies / Vendor | 35,415 | 826.33 MB | Ignored (.gitignore) | Python 3.11 virtual environment for legacy scripts |
| [`__pycache__`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/__pycache__) | Python Cache | 19 | 0.04 MB | Ignored (.gitignore) | Bytecode cache for legacy Python files |
| [`web/logs`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/logs) | Runtime Logs | 4 | 12.50 MB | Ignored (.gitignore) | Active runtime output logs for Next.js dev server and background tasks |
| [`logs`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/logs) | Runtime Logs | 1 | 0.01 MB | Tracked (Clean) | Legacy Python execution logs |
| [`web/.data`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.data) | Runtime Stores | 14,104 | 2341.88 MB | Partially Tracked | Active runtime database for paper trades, opportunities, and options audit |

---

## 2. In-Depth Audit of Runtime Data Stores (`web/.data/`)

| Subdirectory / File | Records / Files | Disk Size | Date Range | Data Provenance | Status & Integrity | Checksum (if single file) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| [`web/.data/backtests`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.data/backtests) | 4 files | 7641.2 KB | Various | Model runs & cached calculations | **Clean**. Local cache/evidence. | N/A |
| [`web/.data/collection-logs`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.data/collection-logs) | 4931 files | 2037.0 KB | Various | Model runs & cached calculations | **Clean**. Local cache/evidence. | N/A |
| [`web/.data/history`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.data/history) | 3204 files | 2318.0 MB | Historical 1m/5m/1d candles | Upstox historical API candles | **Preserved**. Raw historical market cache. | N/A |
| [`web/.data/instruments`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.data/instruments) | 1 files | 325.7 KB | Various | Model runs & cached calculations | **Clean**. Local cache/evidence. | N/A |
| [`web/.data/intraday-evaluation`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.data/intraday-evaluation) | 1 files | 2.1 KB | Various | Model runs & cached calculations | **Clean**. Local cache/evidence. | N/A |
| [`web/.data/intraday-replay`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.data/intraday-replay) | 1 files | 7911.2 KB | Various | Model runs & cached calculations | **Clean**. Local cache/evidence. | N/A |
| [`web/.data/monitor-logs`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.data/monitor-logs) | 5219 files | 1920.3 KB | Various | Model runs & cached calculations | **Clean**. Local cache/evidence. | N/A |
| [`web/.data/opportunity-tracking`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.data/opportunity-tracking) | 210 files | 126.1 KB | Various | Model runs & cached calculations | **Clean**. Local cache/evidence. | N/A |
| [`web/.data/option-ltt-audits`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.data/option-ltt-audits) | 2 files | 28.9 KB | Various | Model runs & cached calculations | **Clean**. Local cache/evidence. | N/A |
| [`web/.data/options-audit`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.data/options-audit) | 8 files (174 rounds) | 932.4 KB | 2026-10-26 to 2026-10-28 | Live options data audit rounds | **Preserved**. Verified options-audit-1a protocol samples. | `350e85d67fe17342...` |
| [`web/.data/options-audit-research`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.data/options-audit-research) | 17 files (66 rounds) | 1492.8 KB | 2026-10-27 to 2026-10-28 | Live research-only options rounds | **Active**. Periodically appended by background loop PID 2277. | `2396b45839a9450b...` |
| [`web/.data/options-research`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.data/options-research) | 1 files | 12.4 KB | Various | Model runs & cached calculations | **Clean**. Local cache/evidence. | N/A |
| [`web/.data/paper-live.lock`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.data/paper-live.lock) | 1 file | 0.0 KB | Current session | Runtime lock / auth token / health | **Active**. Runtime system state. | `ad8fa913d25b3970...` |
| [`web/.data/paper-opportunities`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.data/paper-opportunities) | 455 records | 756.1 KB | 2026-10-08 to 2026-10-28 | Live stock scanner + Oct 8 fixtures | **Clean**. 123 genuine stocks, 332 legacy fixtures. 0 options trades open since Oct 15 due to timestamp check. | N/A |
| [`web/.data/paper-sessions`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.data/paper-sessions) | 17 files | 24.2 KB | Various | Model runs & cached calculations | **Clean**. Local cache/evidence. | N/A |
| [`web/.data/positional-backtest`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.data/positional-backtest) | 3 files | 1094.1 KB | Various | Model runs & cached calculations | **Clean**. Local cache/evidence. | N/A |
| [`web/.data/positional-v2`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.data/positional-v2) | 1 files | 110.3 KB | Various | Model runs & cached calculations | **Clean**. Local cache/evidence. | N/A |
| [`web/.data/recommendations`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.data/recommendations) | 26 files | 69.9 KB | Various | Model runs & cached calculations | **Clean**. Local cache/evidence. | N/A |
| [`web/.data/runner-health.jsonl`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.data/runner-health.jsonl) | 1 file | 1.3 KB | Current session | Runtime lock / auth token / health | **Active**. Runtime system state. | `4d215e2abb87a62d...` |
| [`web/.data/upstox-token.json`](file:////Users/webanatomy/Desktop/upstox_analyzer (2)/web/.data/upstox-token.json) | 1 file | 0.5 KB | Current session | Runtime lock / auth token / health | **Active**. Runtime system state. | `bada18fd2cbd9392...` |

### Audit Note on `.data/paper-trades/`
- **Directory Status**: Does not exist on disk yet. Represents a pristine, uncorrupted fresh options ledger state.
- **Verification**: When `PaperTradingEngine` boots, `loadPaperLedger()` initializes with an empty ledger (`trades = []`, `events = []`, `error = null`).
- **Safety Guarantee**: Hardened persistence logic writes `trades.json` atomically via temporary file rename and appends to `events.jsonl` only after event validation passes.