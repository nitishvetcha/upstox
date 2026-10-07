/**
 * Phase 12 — Historical options dataset validation, versioning, and fingerprinting.
 *
 * Validates raw observations from a provider before they enter the canonical dataset.
 * NEVER modifies strategy logic. NEVER upgrades MODEL_DERIVED to REAL_HISTORICAL.
 */
import type { HistoricalOptionObservation, FieldQuality, DatasetMode, Phase12Decision } from "./historicalOptionsProvider.ts";
import type { ProviderCapabilityReport } from "./historicalOptionsProvider.ts";

// ── FNV-1a 32-bit hash (same algorithm as Phase 11.6 datasetHash) ─────────────

function fnv32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (Math.imul(h, 16777619)) >>> 0;
  }
  return h;
}

export function datasetHash(observations: HistoricalOptionObservation[]): string {
  const repr = observations
    .map((o) => `${o.timestamp}|${o.instrumentKey}|${o.open}|${o.high}|${o.low}|${o.close}`)
    .sort()
    .join("\n");
  return fnv32(repr).toString(16).padStart(8, "0");
}

// ── Validation result ─────────────────────────────────────────────────────────

export type ValidationFailReason =
  | "INVALID_TIMESTAMP"
  | "INVALID_OHLC"
  | "NEGATIVE_PRICE"
  | "NEGATIVE_VOLUME"
  | "NEGATIVE_OI"
  | "INVALID_BID_ASK"
  | "MISSING_INSTRUMENT_KEY"
  | "INVALID_INSTRUMENT_KEY"
  | "MISSING_EXPIRY"
  | "INVALID_OPTION_TYPE"
  | "MISSING_STRIKE"
  | "DUPLICATE";

export interface ValidationResult {
  valid: HistoricalOptionObservation[];
  rejected: { observation: HistoricalOptionObservation; reason: ValidationFailReason }[];
  duplicatesRemoved: number;
  totalInput: number;
}

// ── Individual record validation ──────────────────────────────────────────────

export function validateObservation(o: HistoricalOptionObservation): ValidationFailReason | null {
  if (!o.timestamp || isNaN(Date.parse(o.timestamp))) return "INVALID_TIMESTAMP";
  if (!o.instrumentKey || o.instrumentKey.trim() === "") return "MISSING_INSTRUMENT_KEY";
  if (!o.expiry || !/^\d{4}-\d{2}-\d{2}$/.test(o.expiry)) return "MISSING_EXPIRY";
  if (!o.optionType || (o.optionType !== "CE" && o.optionType !== "PE")) return "INVALID_OPTION_TYPE";
  if (!o.strike || o.strike <= 0) return "MISSING_STRIKE";

  // OHLC constraints
  if (o.open <= 0 || o.high <= 0 || o.low <= 0 || o.close <= 0) return "NEGATIVE_PRICE";
  if (o.high < o.open || o.high < o.close || o.high < o.low) return "INVALID_OHLC";
  if (o.low > o.open || o.low > o.close || o.low > o.high) return "INVALID_OHLC";

  if (o.volume !== undefined && o.volume < 0) return "NEGATIVE_VOLUME";
  if (o.openInterest !== undefined && o.openInterest < 0) return "NEGATIVE_OI";
  if (o.bid !== undefined && o.bid < 0) return "INVALID_BID_ASK";
  if (o.ask !== undefined && o.bid !== undefined && o.ask < o.bid) return "INVALID_BID_ASK";

  return null;
}

export function validateDataset(raw: HistoricalOptionObservation[]): ValidationResult {
  const seen = new Set<string>();
  const valid: HistoricalOptionObservation[] = [];
  const rejected: ValidationResult["rejected"] = [];
  let duplicatesRemoved = 0;

  for (const o of raw) {
    const fail = validateObservation(o);
    if (fail) {
      rejected.push({ observation: o, reason: fail });
      continue;
    }
    const key = `${o.instrumentKey}|${o.timestamp}`;
    if (seen.has(key)) {
      duplicatesRemoved++;
      continue;
    }
    seen.add(key);
    valid.push(o);
  }

  return { valid, rejected, duplicatesRemoved, totalInput: raw.length };
}

// ── Dataset metadata ──────────────────────────────────────────────────────────

export interface DatasetMetadata {
  datasetId: string;
  provider: string;
  providerApiVersion: string;
  retrievedAt: string;
  fromDate: string;
  toDate: string;
  instruments: string[];
  expiries: string[];
  observations: number;
  uniqueContracts: number;
  uniqueExpiries: number;
  sessions: number;
  bars: number;
  rejectedRecords: number;
  duplicatesRemoved: number;
  missingIntervals: string[];
  datasetMode: DatasetMode;
  hash: string;
}

export function buildDatasetMetadata(
  observations: HistoricalOptionObservation[],
  validation: ValidationResult,
  provider: string,
  providerApiVersion: string,
): DatasetMetadata {
  const valid = validation.valid;
  const instruments = [...new Set(valid.map((o) => o.instrumentKey))].sort();
  const expiries = [...new Set(valid.map((o) => o.expiry))].sort();
  const sessions = [...new Set(valid.map((o) => o.timestamp.slice(0, 10)))].sort();
  const timestamps = valid.map((o) => o.timestamp).sort();
  const fromDate = timestamps[0]?.slice(0, 10) ?? "";
  const toDate = timestamps[timestamps.length - 1]?.slice(0, 10) ?? "";
  const hash = datasetHash(valid);
  const datasetId = `real_options_${provider}_${fromDate}_${toDate}_${hash}`;

  return {
    datasetId,
    provider,
    providerApiVersion,
    retrievedAt: new Date().toISOString(),
    fromDate,
    toDate,
    instruments,
    expiries,
    observations: valid.length,
    uniqueContracts: instruments.length,
    uniqueExpiries: expiries.length,
    sessions: sessions.length,
    bars: valid.length,
    rejectedRecords: validation.rejected.length,
    duplicatesRemoved: validation.duplicatesRemoved,
    missingIntervals: [],
    datasetMode: "REAL_HISTORICAL",
    hash,
  };
}

// ── Field quality map ─────────────────────────────────────────────────────────

export interface FieldQualityMap {
  ohlc: FieldQuality;
  volume: FieldQuality;
  openInterest: FieldQuality;
  iv: FieldQuality;
  greeks: FieldQuality;
  bidAsk: FieldQuality;
  instrumentKey: FieldQuality;
  expiry: FieldQuality;
  lotSize: FieldQuality;
}

export function assessFieldQuality(
  observations: HistoricalOptionObservation[],
  providerReport: ProviderCapabilityReport,
): FieldQualityMap {
  const cap = providerReport.capabilities;
  const n = observations.length;

  const hasField = (f: (o: HistoricalOptionObservation) => unknown) =>
    n > 0 && observations.some((o) => f(o) !== undefined);

  const ohlcReal = n > 0 && cap.optionOHLC === "AVAILABLE";
  const volReal = hasField((o) => o.volume) && cap.optionVolume === "AVAILABLE";
  const oiReal = hasField((o) => o.openInterest) && cap.optionOI === "AVAILABLE";
  const ivReal = hasField((o) => o.iv) && cap.optionIV === "AVAILABLE";
  const greeksReal = hasField((o) => o.delta) && cap.optionGreeks === "AVAILABLE";
  const bidAskReal = hasField((o) => o.bid) && cap.optionBid === "AVAILABLE";
  const keyReal = n > 0 && cap.historicalInstrumentIdentity === "AVAILABLE";
  const expiryReal = n > 0 && cap.historicalExpiry === "AVAILABLE";

  return {
    ohlc: ohlcReal ? "REAL_HISTORICAL" : "NOT_AVAILABLE",
    volume: volReal ? "REAL_HISTORICAL" : "NOT_AVAILABLE",
    openInterest: oiReal ? "REAL_HISTORICAL" : "NOT_AVAILABLE",
    iv: ivReal ? "REAL_HISTORICAL" : "NOT_AVAILABLE",
    greeks: greeksReal ? "REAL_HISTORICAL" : "NOT_AVAILABLE",
    bidAsk: bidAskReal ? "REAL_HISTORICAL" : "NOT_AVAILABLE",
    instrumentKey: keyReal ? "REAL_HISTORICAL" : "NOT_AVAILABLE",
    expiry: expiryReal ? "REAL_HISTORICAL" : "NOT_AVAILABLE",
    lotSize: cap.historicalLotSize === "AVAILABLE" ? "REAL_HISTORICAL" : "NOT_AVAILABLE",
  };
}

// ── Phase 12 data quality report (for the API) ────────────────────────────────

export interface Phase12DataQualityReport {
  generatedAt: string;
  phase12Decision: Phase12Decision;
  provider: string;
  datasetMode: DatasetMode | "NONE";
  datasetId: string | null;
  coverage: {
    fromDate: string | null;
    toDate: string | null;
    tradingSessions: number;
  };
  contracts: {
    total: number;
    uniqueExpiries: number;
  };
  fields: FieldQualityMap | null;
  missingData: {
    ohlc: boolean;
    oi: boolean;
    volume: boolean;
    iv: boolean;
    greeks: boolean;
    bidAsk: boolean;
  };
  duplicates: number;
  rejectedRecords: number;
  instrumentIdentity: FieldQuality;
  expiryQuality: FieldQuality;
  lotSizeQuality: "REAL_HISTORICAL" | "CURRENT_FALLBACK" | "NOT_AVAILABLE";
  lookAhead: "PASS" | "NOT_CHECKED";
  hash: string | null;
  providerCapabilityReport: ProviderCapabilityReport;
  blockerCode?: string;
  blockerMessage?: string;
  notes: string[];
}

export function buildPhase12Report(
  providerReport: ProviderCapabilityReport,
  observations: HistoricalOptionObservation[],
  validation: ValidationResult | null,
): Phase12DataQualityReport {
  const now = new Date().toISOString();
  const isBlocked = providerReport.accessStatus === "PROVIDER_BLOCKED"
    || providerReport.accessStatus === "AUTH_REQUIRED";

  let decision: Phase12Decision;
  if (providerReport.accessStatus === "AUTH_REQUIRED") {
    decision = "PROVIDER_BLOCKED";
  } else if (isBlocked) {
    decision = "PROVIDER_BLOCKED";
  } else if (observations.length === 0) {
    decision = "PROVIDER_BLOCKED";
  } else if (validation && validation.rejected.length > validation.valid.length) {
    decision = "DATA_INTEGRATION_FAILED";
  } else {
    const fields = assessFieldQuality(observations, providerReport);
    const hasCore = fields.ohlc === "REAL_HISTORICAL";
    decision = hasCore ? "REAL_DATA_AVAILABLE" : "PARTIAL_REAL_DATA";
  }

  const fields = validation && validation.valid.length > 0
    ? assessFieldQuality(validation.valid, providerReport)
    : null;

  const meta = validation && validation.valid.length > 0
    ? buildDatasetMetadata(observations, validation, providerReport.provider, providerReport.apiVersion)
    : null;

  return {
    generatedAt: now,
    phase12Decision: decision,
    provider: providerReport.provider,
    datasetMode: decision === "REAL_DATA_AVAILABLE" ? "REAL_HISTORICAL"
      : decision === "PARTIAL_REAL_DATA" ? "PARTIAL_REAL"
      : "NONE",
    datasetId: meta?.datasetId ?? null,
    coverage: {
      fromDate: meta?.fromDate ?? null,
      toDate: meta?.toDate ?? null,
      tradingSessions: meta?.sessions ?? 0,
    },
    contracts: {
      total: meta?.uniqueContracts ?? 0,
      uniqueExpiries: meta?.uniqueExpiries ?? 0,
    },
    fields,
    missingData: {
      ohlc: fields?.ohlc !== "REAL_HISTORICAL",
      oi: fields?.openInterest !== "REAL_HISTORICAL",
      volume: fields?.volume !== "REAL_HISTORICAL",
      iv: fields?.iv !== "REAL_HISTORICAL",
      greeks: fields?.greeks !== "REAL_HISTORICAL",
      bidAsk: fields?.bidAsk !== "REAL_HISTORICAL",
    },
    duplicates: validation?.duplicatesRemoved ?? 0,
    rejectedRecords: validation?.rejected.length ?? 0,
    instrumentIdentity: fields?.instrumentKey ?? "NOT_AVAILABLE",
    expiryQuality: fields?.expiry ?? "NOT_AVAILABLE",
    lotSizeQuality: "NOT_AVAILABLE",
    lookAhead: "NOT_CHECKED",
    hash: meta?.hash ?? null,
    providerCapabilityReport: providerReport,
    blockerCode: providerReport.blockerCode,
    blockerMessage: providerReport.blockerMessage,
    notes: [
      ...providerReport.notes,
      isBlocked
        ? "UPSTOX_HISTORICAL_OPTIONS: UNAVAILABLE_WITH_CURRENT_ACCOUNT"
        : "Provider accessible.",
    ],
  };
}
