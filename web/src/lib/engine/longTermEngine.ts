// Phase 20 — Long-Term Opportunity Engine.
// Fundamental data provider interface.
// IMPORTANT: If fundamental data is unavailable, we say so explicitly.
// We never fabricate P/E, EPS, ROE, or any other fundamental metric.
import { STOCK_OPPORTUNITY_VERSION } from "./stockOpportunityEngine.ts";

export const LONG_TERM_ENGINE_VERSION = STOCK_OPPORTUNITY_VERSION; // "20.0"

// ── Fundamental provider interface ───────────────────────────────────────────
// Implement this interface when a real fundamental data source is available.
// Fields optional because providers may not supply all metrics.
export interface FundamentalData {
  symbol: string;
  // Growth
  revenueGrowthYoy?: number;    // %
  profitGrowthYoy?: number;     // %
  epsGrowthYoy?: number;        // %
  // Quality
  roe?: number;                 // Return on equity %
  roce?: number;                // Return on capital employed %
  operatingMargin?: number;     // %
  freeCashFlowYield?: number;   // %
  // Balance sheet
  debtToEquity?: number;        // <1 preferred
  // Valuation
  pe?: number;                  // P/E ratio
  pb?: number;                  // P/B ratio
  evEbitda?: number;            // EV/EBITDA
  dividendYield?: number;       // %
  // Metadata
  source: string;
  asOf: string; // ISO date
}

export interface FundamentalProvider {
  name: string;
  available: boolean;
  reason: string; // if unavailable, explains why
  get(symbol: string): Promise<FundamentalData | null>;
}

// ── No-op provider (current state) ───────────────────────────────────────────
// Returned until a real fundamental data provider is integrated.
export const NO_FUNDAMENTAL_PROVIDER: FundamentalProvider = {
  name: "NONE",
  available: false,
  reason: "No fundamental data provider configured. Integrate Screener.in, Tickertape, or a direct NSE filing parser to enable long-term scoring.",
  async get() { return null; },
};

// ── Long-term result ──────────────────────────────────────────────────────────

export type LongTermRating = "ACCUMULATE" | "WATCH" | "AVOID" | "INSUFFICIENT_DATA";

export interface LongTermOpportunity {
  symbol: string;
  name: string;
  rating: LongTermRating;
  fundamentalScore: number | null;  // null when unavailable
  technicalTrend: "UPTREND" | "DOWNTREND" | "SIDEWAYS" | "UNAVAILABLE";
  thesis: string;
  accumulationZone: string | null;
  riskFactors: string[];
}

export interface LongTermResult {
  timestamp: string;
  engineVersion: string;
  fundamentalProvider: string;
  fundamentalDataAvailable: boolean;
  dataAvailabilityMessage: string;
  universe: string;
  topOpportunities: LongTermOpportunity[];
  noOpportunityReason: string;
}

export async function scanLongTerm(
  _provider: FundamentalProvider = NO_FUNDAMENTAL_PROVIDER,
): Promise<LongTermResult> {
  const now = new Date();

  if (!_provider.available) {
    return {
      timestamp: now.toISOString(),
      engineVersion: LONG_TERM_ENGINE_VERSION,
      fundamentalProvider: _provider.name,
      fundamentalDataAvailable: false,
      dataAvailabilityMessage: _provider.reason,
      universe: "NIFTY_50",
      topOpportunities: [],
      noOpportunityReason: "Long-term engine requires a fundamental data provider. " + _provider.reason,
    };
  }

  // Future: fetch fundamentals + candle history per stock, combine with technical trend
  return {
    timestamp: now.toISOString(),
    engineVersion: LONG_TERM_ENGINE_VERSION,
    fundamentalProvider: _provider.name,
    fundamentalDataAvailable: true,
    dataAvailabilityMessage: "Provider connected. Scoring not yet implemented.",
    universe: "NIFTY_50",
    topOpportunities: [],
    noOpportunityReason: "Long-term scoring implementation pending provider integration.",
  };
}
