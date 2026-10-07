/**
 * Phase 12 — Real Historical Options Data Acquisition & Fidelity Upgrade
 *
 * Provider interface and canonical types. The strategy engine is NOT touched.
 * Data flows: Provider → Adapter → HistoricalOptionObservation → existing snapshot builder.
 */

// ── Field-level quality ────────────────────────────────────────────────────────

export type FieldQuality =
  | "REAL_HISTORICAL"       // actual provider measurement
  | "HISTORICAL_RECONSTRUCTED" // derived from actual historical measurements (e.g. VIX proxy IV)
  | "MODEL_DERIVED"         // calculated from a model (e.g. Black-Scholes)
  | "NOT_AVAILABLE";        // no valid data for this field

// ── Dataset mode ───────────────────────────────────────────────────────────────

export type DatasetMode =
  | "REAL_HISTORICAL"
  | "PARTIAL_REAL"
  | "MODEL_DERIVED"
  | "SYNTHETIC";

// ── Canonical observation ──────────────────────────────────────────────────────

export interface HistoricalOptionObservation {
  timestamp: string;         // ISO 8601, IST timezone ("Z" offset means UTC; callers must convert)
  underlying: "NIFTY" | "BANKNIFTY";

  instrumentKey: string;     // provider's canonical key, never constructed manually
  exchangeToken?: string;

  expiry: string;            // YYYY-MM-DD, actual historical expiry from provider
  strike: number;
  optionType: "CE" | "PE";

  open: number;
  high: number;
  low: number;
  close: number;

  volume?: number;           // only if provider supplies it
  openInterest?: number;     // only if provider supplies it

  bid?: number;              // only if provider supplies real bid
  ask?: number;              // only if provider supplies real ask

  iv?: number;               // provider-supplied IV only; never model-derived here
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;

  source: string;            // provider identifier e.g. "upstox-v2"
  dataQuality: "REAL_HISTORICAL"; // ONLY set when the above came from the provider
}

// ── Query types ────────────────────────────────────────────────────────────────

export interface ContractQuery {
  underlying: "NIFTY" | "BANKNIFTY";
  expiry?: string;           // YYYY-MM-DD; absent = all available expiries
  strikeMin?: number;
  strikeMax?: number;
  optionType?: "CE" | "PE";
}

export interface HistoricalOptionQuery {
  instrumentKey: string;     // provider canonical key
  fromDate: string;          // YYYY-MM-DD
  toDate: string;            // YYYY-MM-DD
  interval?: "1minute" | "15minute" | "30minute" | "1hour" | "1day";
}

export interface HistoricalChainQuery {
  underlying: "NIFTY" | "BANKNIFTY";
  expiry: string;            // YYYY-MM-DD
  date: string;              // YYYY-MM-DD (the day to reconstruct the chain for)
}

// ── Provider capability report ─────────────────────────────────────────────────

export type CapabilityStatus =
  | "AVAILABLE"
  | "PLAN_REQUIRED"
  | "NOT_AVAILABLE"
  | "UNKNOWN"
  | "ERROR";

export interface CapabilityMatrix {
  underlyingHistoricalCandles: CapabilityStatus;
  optionHistoricalCandles: CapabilityStatus;
  optionOHLC: CapabilityStatus;
  optionOI: CapabilityStatus;
  optionVolume: CapabilityStatus;
  optionIV: CapabilityStatus;
  optionGreeks: CapabilityStatus;
  optionBid: CapabilityStatus;
  optionAsk: CapabilityStatus;
  expiredContracts: CapabilityStatus;
  historicalInstrumentIdentity: CapabilityStatus;
  historicalExpiry: CapabilityStatus;
  historicalLotSize: CapabilityStatus;
}

export interface ProviderCapabilityReport {
  provider: string;
  apiVersion: string;
  checkedAt: string;         // ISO timestamp of this audit
  accessStatus: "OK" | "PROVIDER_BLOCKED" | "AUTH_REQUIRED" | "PARTIAL" | "ERROR";
  blockerCode?: string;      // e.g. "UDAPI1149"
  blockerMessage?: string;
  capabilities: CapabilityMatrix;
  notes: string[];
}

// ── Historical contract ────────────────────────────────────────────────────────

export interface HistoricalContract {
  instrumentKey: string;
  exchangeToken?: string;
  underlying: "NIFTY" | "BANKNIFTY";
  expiry: string;
  strike: number;
  optionType: "CE" | "PE";
  lotSize?: number;          // only when provider supplies historical lot size
  lotSizeSource: "REAL_HISTORICAL" | "CURRENT_FALLBACK" | "NOT_AVAILABLE";
}

// ── Provider interface ─────────────────────────────────────────────────────────

export interface HistoricalOptionsProvider {
  /** List contracts matching the query. Returns [] when provider is blocked. */
  getContracts(params: ContractQuery): Promise<HistoricalContract[]>;

  /** Fetch OHLCV candles for a single option contract. */
  getCandles(params: HistoricalOptionQuery): Promise<HistoricalOptionObservation[]>;

  /** Reconstruct a chain snapshot from individual candles (if available). */
  getChainSnapshot(params: HistoricalChainQuery): Promise<HistoricalOptionObservation[]>;

  /** Check what this provider can actually deliver with the current account. */
  getAvailability(): Promise<ProviderCapabilityReport>;
}

// ── Phase 12 final decision ────────────────────────────────────────────────────

export type Phase12Decision =
  | "REAL_DATA_AVAILABLE"
  | "PROVIDER_BLOCKED"
  | "PARTIAL_REAL_DATA"
  | "DATA_INTEGRATION_FAILED";
