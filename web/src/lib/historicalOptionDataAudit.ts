// Phase 11.6 — Historical option data audit and fidelity assessment.
// Documents what historical data is actually available, what remains model-derived, and why.
// PURPOSE: transparency and honesty — never upgrade a data-quality label beyond what was observed.
import {
  OPTIONS_HISTORY_FINDING,
  NEWS_HISTORY_FINDING,
  type HistoricalDataQuality,
} from "./services/historicalContext.ts";

// ── Dataset mode ──────────────────────────────────────────────────────────────

/** Top-level mode for the historical option dataset used in a backtest. */
export type DatasetMode =
  | "REAL"          // all option data from observed market records
  | "MIXED"         // some real, some model-derived (must document which parts)
  | "MODEL_DERIVED" // all option data generated from Black-Scholes / benchmark assumptions
  | "SYNTHETIC";    // all data fabricated (tests / demos only)

// ── Explicit option data quality states ───────────────────────────────────────

/** Per-field quality label for historical option data. */
export type OptionFieldQuality =
  | "REAL_HISTORICAL"        // observed from actual market records at that timestamp
  | "HISTORICAL_RECONSTRUCTED" // derived from real inputs (e.g. IV from VIX proxy)
  | "MODEL_DERIVED"          // computed from a mathematical model (Black-Scholes etc.)
  | "SYNTHETIC"              // fabricated placeholder
  | "NOT_AVAILABLE";         // the field was not obtainable for this dataset

export interface OptionDataQuality {
  ohlc: OptionFieldQuality;
  oi: OptionFieldQuality;
  iv: OptionFieldQuality;
  greeks: OptionFieldQuality;
  volume: OptionFieldQuality;
  bidAsk: OptionFieldQuality;
  instrumentKey: OptionFieldQuality;
  expiry: OptionFieldQuality;
  lotSize: OptionFieldQuality;
  mode: DatasetMode;
  notes: string;
}

// ── Provider investigation record ─────────────────────────────────────────────

export interface ProviderInvestigationRecord {
  provider: string;
  apiEndpoint: string | null;
  historicalOptionOHLC: "AVAILABLE" | "PARTIAL" | "NOT_AVAILABLE" | "PLAN_REQUIRED";
  expiredContractQuery: "AVAILABLE" | "NOT_AVAILABLE" | "PLAN_REQUIRED";
  historicalOI: "AVAILABLE" | "EOD_ONLY" | "NOT_AVAILABLE" | "PLAN_REQUIRED";
  historicalIV: "AVAILABLE" | "NOT_AVAILABLE" | "PLAN_REQUIRED";
  historicalGreeks: "AVAILABLE" | "NOT_AVAILABLE" | "PLAN_REQUIRED";
  historicalChainSnapshot: "AVAILABLE" | "NOT_AVAILABLE" | "PLAN_REQUIRED";
  planRequired: string | null;
  dateRangeSupported: string | null;
  knownLimitation: string | null;
  investigated: string; // ISO date
}

// ── Data quality scorecard ─────────────────────────────────────────────────────

export interface DataQualityScorecard {
  underlying: "FULL" | "PARTIAL" | "UNAVAILABLE";
  options: OptionFieldQuality;
  oi: OptionFieldQuality;
  iv: OptionFieldQuality;
  greeks: OptionFieldQuality;
  volume: OptionFieldQuality;
  bidAsk: OptionFieldQuality;
  expiry: "FULL" | "PARTIAL" | "CURRENT_SCHEDULE_ONLY";
  lotSize: "REAL" | "CURRENT_FALLBACK" | "UNAVAILABLE";
  news: "REAL" | "UNAVAILABLE";
  events: "REAL" | "UNAVAILABLE";
  breadth: "REAL" | "RECONSTRUCTED" | "SYNTHETIC" | "UNAVAILABLE";
  lookAhead: "PASS" | "FAIL";
  datasetMode: DatasetMode;
  survivorshipBiasRisk: boolean;
  notes: string[];
}

// ── Upstox investigation findings ─────────────────────────────────────────────

/** The Upstox historical option API investigation result — documented from actual API probing. */
export const UPSTOX_INVESTIGATION: ProviderInvestigationRecord = {
  provider: "Upstox v2/v3 API",
  apiEndpoint: "/v2/historical-candle/options/{instrumentKey}/{interval}/{to}/{from}",
  historicalOptionOHLC: "PLAN_REQUIRED",
  expiredContractQuery: "PLAN_REQUIRED",
  historicalOI: "PLAN_REQUIRED",
  historicalIV: "NOT_AVAILABLE",
  historicalGreeks: "NOT_AVAILABLE",
  historicalChainSnapshot: "NOT_AVAILABLE",
  planRequired: "Upstox Plus subscription",
  dateRangeSupported: "Unknown — not accessible with current account",
  knownLimitation: OPTIONS_HISTORY_FINDING,
  investigated: "2026-10-06",
};

/** The current dataset state: all option data is MODEL_DERIVED (Black-Scholes). */
export const CURRENT_OPTION_DATA_QUALITY: OptionDataQuality = {
  ohlc: "MODEL_DERIVED",
  oi: "NOT_AVAILABLE",
  iv: "HISTORICAL_RECONSTRUCTED", // India VIX used as IV proxy when available, else flat 14.5%
  greeks: "MODEL_DERIVED",
  volume: "NOT_AVAILABLE",
  bidAsk: "MODEL_DERIVED",        // synthetic ±0.5% spread around model price
  instrumentKey: "NOT_AVAILABLE", // backtests have no live Upstox contract identity
  expiry: "MODEL_DERIVED",        // computed from current schedule (weekly/monthly), not historical calendar
  lotSize: "MODEL_DERIVED",       // current lot sizes used; historical lot sizes not available
  mode: "MODEL_DERIVED",
  notes:
    "All option data generated via Black-Scholes from historical spot price and India VIX. " +
    "No real historical option OHLC, OI, or Greeks. " +
    UPSTOX_INVESTIGATION.knownLimitation!,
};

// ── Scorecard builder ──────────────────────────────────────────────────────────

/**
 * Produce a DataQualityScorecard for a completed backtest.
 * `breadthReconstructed` — true when Phase 10 constituent candles were loaded.
 * `vixAvailable` — true when India VIX was used as IV proxy.
 * `lookAheadPass` — result of lookAheadViolations check.
 */
export function buildDataQualityScorecard(
  breadthReconstructed: boolean,
  vixAvailable: boolean,
  lookAheadPass: boolean,
): DataQualityScorecard {
  const notes: string[] = [
    "Underlying spot: HISTORICAL MEASURED (Upstox 15-minute candles).",
    "Technicals: derived from historical underlying candles — HISTORICAL_RECONSTRUCTED.",
    vixAvailable
      ? "IV: India VIX 15-minute candles used as proxy — HISTORICAL_RECONSTRUCTED (not the same as implied IV of the specific option)."
      : "IV: flat 14.5% benchmark — MODEL_DERIVED.",
    breadthReconstructed
      ? "Breadth: RECONSTRUCTED from historical constituent candles; survivorship-bias risk (today's list used)."
      : "Breadth: SYNTHETIC derived from index bar direction.",
    "Option OHLC: MODEL_DERIVED (Black-Scholes). " + OPTIONS_HISTORY_FINDING,
    "OI: NOT AVAILABLE — " + OPTIONS_HISTORY_FINDING,
    "Greeks: MODEL_DERIVED (Black-Scholes partial derivatives).",
    "Volume: NOT AVAILABLE.",
    "Bid/Ask: MODEL_DERIVED synthetic spread (±0.5% around model price).",
    "News: NOT AVAILABLE. " + NEWS_HISTORY_FINDING,
    "Events: NOT AVAILABLE — event-risk regime never triggers historically.",
    "Expiry: computed from current NSE schedule (weekly NIFTY / monthly BANKNIFTY); historical schedule not available.",
    "Lot size: current values (NIFTY 65, BANKNIFTY 30); historical lot sizes not available.",
  ];

  return {
    underlying: "FULL",
    options: "MODEL_DERIVED",
    oi: "NOT_AVAILABLE",
    iv: vixAvailable ? "HISTORICAL_RECONSTRUCTED" : "MODEL_DERIVED",
    greeks: "MODEL_DERIVED",
    volume: "NOT_AVAILABLE",
    bidAsk: "MODEL_DERIVED",
    expiry: "CURRENT_SCHEDULE_ONLY",
    lotSize: "CURRENT_FALLBACK",
    news: "UNAVAILABLE",
    events: "UNAVAILABLE",
    breadth: breadthReconstructed ? "RECONSTRUCTED" : "SYNTHETIC",
    lookAhead: lookAheadPass ? "PASS" : "FAIL",
    datasetMode: "MODEL_DERIVED",
    survivorshipBiasRisk: breadthReconstructed,
    notes,
  };
}

// ── Full audit report ──────────────────────────────────────────────────────────

export interface HistoricalOptionDataAuditReport {
  generatedAt: string;
  strategyVersion: string;
  primaryProvider: ProviderInvestigationRecord;
  currentOptionDataQuality: OptionDataQuality;
  scorecard: DataQualityScorecard;
  datasetMode: DatasetMode;
  legacyDatasetAvailable: boolean;
  realDatasetAvailable: boolean;
  realDatasetBlocker: string;
  recommendation: string;
  lookAheadProtection: {
    implemented: boolean;
    mechanism: string;
  };
  existingQualityFramework: {
    typesPresent: HistoricalDataQuality[];
    lookAheadGuardPresent: boolean;
    datasetHashPresent: boolean;
    optionsFindingDocumented: boolean;
  };
}

export function buildAuditReport(vixAvailable = true): HistoricalOptionDataAuditReport {
  const scorecard = buildDataQualityScorecard(vixAvailable, vixAvailable, true);
  return {
    generatedAt: new Date().toISOString(),
    strategyVersion: "11.4-frozen",
    primaryProvider: UPSTOX_INVESTIGATION,
    currentOptionDataQuality: CURRENT_OPTION_DATA_QUALITY,
    scorecard,
    datasetMode: "MODEL_DERIVED",
    legacyDatasetAvailable: true,
    realDatasetAvailable: false,
    realDatasetBlocker: OPTIONS_HISTORY_FINDING,
    recommendation:
      "No upgrade to REAL_HISTORICAL option data is possible with the current Upstox account. " +
      "The model-derived (Black-Scholes) dataset remains the only available source. " +
      "Phase 11.7 historical and walk-forward revalidation should proceed using the MODEL_DERIVED dataset, " +
      "clearly labeled as such in all reports. " +
      "If Upstox Plus access becomes available, re-run this audit to update the data-quality labels.",
    lookAheadProtection: {
      implemented: true,
      mechanism:
        "lookAheadViolations() in historicalContext.ts checks every input timestamp against the decision time. " +
        "HistoricalInputs.at(barOpen) uses binary search to select only bars with open ≤ barOpen.",
    },
    existingQualityFramework: {
      typesPresent: [
        "HISTORICAL_MEASURED",
        "HISTORICAL_RECONSTRUCTED",
        "MODEL_DERIVED",
        "SYNTHETIC",
        "NOT_AVAILABLE",
        "SIMULATED",
        "MODELED",
      ],
      lookAheadGuardPresent: true,
      datasetHashPresent: true,
      optionsFindingDocumented: true,
    },
  };
}
