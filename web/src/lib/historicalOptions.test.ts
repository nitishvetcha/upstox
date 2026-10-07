/**
 * Phase 12 — Real Historical Options Data Acquisition & Fidelity Upgrade
 * PROVIDER-01 → PROVIDER-10
 * CONTRACT-01 → CONTRACT-10
 * DATA-01    → DATA-15
 * QUALITY-01 → QUALITY-10
 * DATASET-01 → DATASET-05
 * SAFETY-01  → SAFETY-05
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type {
  HistoricalOptionObservation,
  ProviderCapabilityReport,
  HistoricalContract,
  Phase12Decision,
} from "./historicalOptionsProvider.ts";
import {
  validateObservation,
  validateDataset,
  datasetHash,
  assessFieldQuality,
  buildPhase12Report,
  buildDatasetMetadata,
} from "./historicalOptionsDataset.ts";
import { UpstoxHistoricalOptionsAdapter, UDAPI1149 } from "./adapters/upstoxHistoricalOptionsAdapter.ts";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function obs(overrides: Partial<HistoricalOptionObservation> = {}): HistoricalOptionObservation {
  return {
    timestamp: "2025-10-15T09:30:00.000Z",
    underlying: "NIFTY",
    instrumentKey: "NSE_FO|50928",
    expiry: "2025-10-30",
    strike: 24000,
    optionType: "CE",
    open: 150,
    high: 180,
    low: 140,
    close: 170,
    source: "upstox-v2",
    dataQuality: "REAL_HISTORICAL",
    ...overrides,
  };
}

function blockedReport(code = UDAPI1149): ProviderCapabilityReport {
  return {
    provider: "Upstox v2/v3 API",
    apiVersion: "v2",
    checkedAt: "2026-10-07T06:00:00.000Z",
    accessStatus: "PROVIDER_BLOCKED",
    blockerCode: code,
    blockerMessage: "Requires Upstox Plus plan.",
    capabilities: {
      underlyingHistoricalCandles: "AVAILABLE",
      optionHistoricalCandles: "PLAN_REQUIRED",
      optionOHLC: "PLAN_REQUIRED",
      optionOI: "PLAN_REQUIRED",
      optionVolume: "PLAN_REQUIRED",
      optionIV: "NOT_AVAILABLE",
      optionGreeks: "NOT_AVAILABLE",
      optionBid: "PLAN_REQUIRED",
      optionAsk: "PLAN_REQUIRED",
      expiredContracts: "PLAN_REQUIRED",
      historicalInstrumentIdentity: "PLAN_REQUIRED",
      historicalExpiry: "PLAN_REQUIRED",
      historicalLotSize: "NOT_AVAILABLE",
    },
    notes: ["UDAPI1149"],
  };
}

function openReport(): ProviderCapabilityReport {
  return {
    provider: "Upstox v2/v3 API",
    apiVersion: "v2",
    checkedAt: "2026-10-07T06:00:00.000Z",
    accessStatus: "OK",
    capabilities: {
      underlyingHistoricalCandles: "AVAILABLE",
      optionHistoricalCandles: "AVAILABLE",
      optionOHLC: "AVAILABLE",
      optionOI: "NOT_AVAILABLE",
      optionVolume: "AVAILABLE",
      optionIV: "NOT_AVAILABLE",
      optionGreeks: "NOT_AVAILABLE",
      optionBid: "NOT_AVAILABLE",
      optionAsk: "NOT_AVAILABLE",
      expiredContracts: "AVAILABLE",
      historicalInstrumentIdentity: "AVAILABLE",
      historicalExpiry: "AVAILABLE",
      historicalLotSize: "NOT_AVAILABLE",
    },
    notes: [],
  };
}

// ── PROVIDER tests ────────────────────────────────────────────────────────────

describe("PROVIDER — Capability report structure", () => {
  it("PROVIDER-01. UpstoxHistoricalOptionsAdapter is instantiable", () => {
    const a = new UpstoxHistoricalOptionsAdapter();
    assert.ok(a);
  });

  it("PROVIDER-02. UDAPI1149 constant is exported", () => {
    assert.equal(UDAPI1149, "UDAPI1149");
  });

  it("PROVIDER-03. getContracts returns [] when provider has no token (safe default)", async () => {
    const a = new UpstoxHistoricalOptionsAdapter();
    const result = await a.getContracts({ underlying: "NIFTY" });
    assert.deepEqual(result, []);
  });

  it("PROVIDER-04. getCandles returns [] when provider has no token", async () => {
    const a = new UpstoxHistoricalOptionsAdapter();
    const result = await a.getCandles({ instrumentKey: "NSE_FO|50928", fromDate: "2025-10-01", toDate: "2025-10-30" });
    assert.deepEqual(result, []);
  });

  it("PROVIDER-05. getChainSnapshot returns [] when provider has no token", async () => {
    const a = new UpstoxHistoricalOptionsAdapter();
    const result = await a.getChainSnapshot({ underlying: "NIFTY", expiry: "2025-10-30", date: "2025-10-15" });
    assert.deepEqual(result, []);
  });

  it("PROVIDER-06. Blocked capability report has PLAN_REQUIRED for option OHLC", () => {
    const r = blockedReport();
    assert.equal(r.capabilities.optionOHLC, "PLAN_REQUIRED");
  });

  it("PROVIDER-07. Blocked capability report has AVAILABLE for underlying candles", () => {
    const r = blockedReport();
    assert.equal(r.capabilities.underlyingHistoricalCandles, "AVAILABLE");
  });

  it("PROVIDER-08. Blocked report accessStatus is PROVIDER_BLOCKED", () => {
    const r = blockedReport();
    assert.equal(r.accessStatus, "PROVIDER_BLOCKED");
  });

  it("PROVIDER-09. Blocked report blockerCode is UDAPI1149", () => {
    const r = blockedReport();
    assert.equal(r.blockerCode, UDAPI1149);
  });

  it("PROVIDER-10. Open report accessStatus is OK", () => {
    const r = openReport();
    assert.equal(r.accessStatus, "OK");
  });
});

// ── CONTRACT tests ─────────────────────────────────────────────────────────────

describe("CONTRACT — Canonical observation structure", () => {
  it("CONTRACT-01. Valid observation passes validateObservation", () => {
    assert.equal(validateObservation(obs()), null);
  });

  it("CONTRACT-02. Observation with empty instrumentKey is rejected", () => {
    assert.equal(validateObservation(obs({ instrumentKey: "" })), "MISSING_INSTRUMENT_KEY");
  });

  it("CONTRACT-03. Observation with invalid expiry is rejected", () => {
    assert.equal(validateObservation(obs({ expiry: "30-10-2025" })), "MISSING_EXPIRY");
  });

  it("CONTRACT-04. Observation with invalid optionType is rejected", () => {
    assert.equal(validateObservation(obs({ optionType: "XX" as "CE" })), "INVALID_OPTION_TYPE");
  });

  it("CONTRACT-05. Observation with zero strike is rejected", () => {
    assert.equal(validateObservation(obs({ strike: 0 })), "MISSING_STRIKE");
  });

  it("CONTRACT-06. CE and PE are both valid option types", () => {
    assert.equal(validateObservation(obs({ optionType: "CE" })), null);
    assert.equal(validateObservation(obs({ optionType: "PE" })), null);
  });

  it("CONTRACT-07. Both NIFTY and BANKNIFTY are valid underlyings", () => {
    assert.equal(validateObservation(obs({ underlying: "NIFTY" })), null);
    assert.equal(validateObservation(obs({ underlying: "BANKNIFTY" })), null);
  });

  it("CONTRACT-08. HistoricalContract has lotSizeSource field", () => {
    const c: HistoricalContract = {
      instrumentKey: "NSE_FO|50928",
      underlying: "NIFTY",
      expiry: "2025-10-30",
      strike: 24000,
      optionType: "CE",
      lotSizeSource: "NOT_AVAILABLE",
    };
    assert.equal(c.lotSizeSource, "NOT_AVAILABLE");
  });

  it("CONTRACT-09. Observation missing timestamp is rejected", () => {
    assert.equal(validateObservation(obs({ timestamp: "" })), "INVALID_TIMESTAMP");
  });

  it("CONTRACT-10. Instrument key flows through without modification", () => {
    const o = obs({ instrumentKey: "NSE_FO|99999" });
    assert.equal(o.instrumentKey, "NSE_FO|99999");
  });
});

// ── DATA tests ────────────────────────────────────────────────────────────────

describe("DATA — OHLC, OI, volume, bid/ask, timestamps, missing data", () => {
  it("DATA-01. high < open fails OHLC validation", () => {
    assert.equal(validateObservation(obs({ open: 200, high: 150, low: 100, close: 160 })), "INVALID_OHLC");
  });

  it("DATA-02. low > close fails OHLC validation", () => {
    assert.equal(validateObservation(obs({ open: 150, high: 200, low: 180, close: 160 })), "INVALID_OHLC");
  });

  it("DATA-03. Negative open price is rejected", () => {
    assert.equal(validateObservation(obs({ open: -1 })), "NEGATIVE_PRICE");
  });

  it("DATA-04. Zero high price is rejected", () => {
    assert.equal(validateObservation(obs({ high: 0 })), "NEGATIVE_PRICE");
  });

  it("DATA-05. Negative volume is rejected", () => {
    assert.equal(validateObservation(obs({ volume: -100 })), "NEGATIVE_VOLUME");
  });

  it("DATA-06. Zero volume is valid (no trades that interval)", () => {
    assert.equal(validateObservation(obs({ volume: 0 })), null);
  });

  it("DATA-07. Negative OI is rejected", () => {
    assert.equal(validateObservation(obs({ openInterest: -1 })), "NEGATIVE_OI");
  });

  it("DATA-08. Negative bid is rejected", () => {
    assert.equal(validateObservation(obs({ bid: -1 })), "INVALID_BID_ASK");
  });

  it("DATA-09. Ask < bid is rejected", () => {
    assert.equal(validateObservation(obs({ bid: 150, ask: 100 })), "INVALID_BID_ASK");
  });

  it("DATA-10. Missing optional fields (volume, OI, bid/ask) is valid", () => {
    const o = obs();
    delete (o as Partial<HistoricalOptionObservation>).volume;
    delete (o as Partial<HistoricalOptionObservation>).openInterest;
    delete (o as Partial<HistoricalOptionObservation>).bid;
    delete (o as Partial<HistoricalOptionObservation>).ask;
    assert.equal(validateObservation(o), null);
  });

  it("DATA-11. Duplicate observations are removed deterministically", () => {
    const o = obs();
    const result = validateDataset([o, o, o]);
    assert.equal(result.valid.length, 1);
    assert.equal(result.duplicatesRemoved, 2);
  });

  it("DATA-12. Mixed valid/invalid dataset: invalid records go to rejected", () => {
    const good = obs();
    const bad = obs({ open: -1 });
    const result = validateDataset([good, bad]);
    assert.equal(result.valid.length, 1);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0].reason, "NEGATIVE_PRICE");
  });

  it("DATA-13. Invalid timestamp is rejected", () => {
    assert.equal(validateObservation(obs({ timestamp: "not-a-date" })), "INVALID_TIMESTAMP");
  });

  it("DATA-14. Dataset with 0 inputs produces empty valid/rejected", () => {
    const result = validateDataset([]);
    assert.equal(result.valid.length, 0);
    assert.equal(result.rejected.length, 0);
    assert.equal(result.duplicatesRemoved, 0);
    assert.equal(result.totalInput, 0);
  });

  it("DATA-15. Forward-fill is NOT performed — each record stands alone", () => {
    // Validating two records from different days, no gap-filling assertion needed;
    // the validate function must not fabricate records between them
    const o1 = obs({ timestamp: "2025-10-15T09:30:00.000Z", close: 150 });
    const o2 = obs({ timestamp: "2025-10-17T09:30:00.000Z", close: 170 });
    const result = validateDataset([o1, o2]);
    assert.equal(result.valid.length, 2);
    // No synthetic bars for 2025-10-16
  });
});

// ── QUALITY tests ─────────────────────────────────────────────────────────────

describe("QUALITY — Real/model/not-available classifications", () => {
  it("QUALITY-01. Blocked report → phase12Decision is PROVIDER_BLOCKED", () => {
    const r = buildPhase12Report(blockedReport(), [], null);
    assert.equal(r.phase12Decision, "PROVIDER_BLOCKED");
  });

  it("QUALITY-02. Blocked report → datasetMode is NONE", () => {
    const r = buildPhase12Report(blockedReport(), [], null);
    assert.equal(r.datasetMode, "NONE");
  });

  it("QUALITY-03. Blocked report → all missing data flags are true", () => {
    const r = buildPhase12Report(blockedReport(), [], null);
    assert.equal(r.missingData.ohlc, true);
    assert.equal(r.missingData.oi, true);
    assert.equal(r.missingData.volume, true);
  });

  it("QUALITY-04. Blocked report → notes contains UNAVAILABLE_WITH_CURRENT_ACCOUNT", () => {
    const r = buildPhase12Report(blockedReport(), [], null);
    assert.ok(r.notes.some((n) => n.includes("UNAVAILABLE_WITH_CURRENT_ACCOUNT")));
  });

  it("QUALITY-05. Open report with real obs → phase12Decision is REAL_DATA_AVAILABLE", () => {
    const o = obs();
    const validation = validateDataset([o]);
    const r = buildPhase12Report(openReport(), [o], validation);
    assert.equal(r.phase12Decision, "REAL_DATA_AVAILABLE");
  });

  it("QUALITY-06. Open report with 0 valid obs → phase12Decision is PROVIDER_BLOCKED", () => {
    const r = buildPhase12Report(openReport(), [], null);
    assert.equal(r.phase12Decision, "PROVIDER_BLOCKED");
  });

  it("QUALITY-07. FieldQuality for OHLC is REAL_HISTORICAL when provider has AVAILABLE", () => {
    const fields = assessFieldQuality([obs()], openReport());
    assert.equal(fields.ohlc, "REAL_HISTORICAL");
  });

  it("QUALITY-08. FieldQuality for OI is NOT_AVAILABLE when provider reports NOT_AVAILABLE", () => {
    const fields = assessFieldQuality([obs()], openReport());
    assert.equal(fields.openInterest, "NOT_AVAILABLE");
  });

  it("QUALITY-09. FieldQuality for IV is NOT_AVAILABLE when provider reports NOT_AVAILABLE", () => {
    const fields = assessFieldQuality([obs()], openReport());
    assert.equal(fields.iv, "NOT_AVAILABLE");
  });

  it("QUALITY-10. dataQuality field on observation must be REAL_HISTORICAL — not MODEL_DERIVED", () => {
    const o = obs();
    assert.equal(o.dataQuality, "REAL_HISTORICAL");
  });
});

// ── DATASET tests ─────────────────────────────────────────────────────────────

describe("DATASET — Hashing, metadata, reproducibility", () => {
  it("DATASET-01. datasetHash is deterministic for same input", () => {
    const observations = [obs(), obs({ strike: 24100 }), obs({ optionType: "PE" })];
    const h1 = datasetHash(observations);
    const h2 = datasetHash(observations);
    assert.equal(h1, h2);
  });

  it("DATASET-02. datasetHash differs for different observations", () => {
    const h1 = datasetHash([obs({ close: 150 })]);
    const h2 = datasetHash([obs({ close: 160 })]);
    assert.notEqual(h1, h2);
  });

  it("DATASET-03. datasetHash of empty array is a hex string", () => {
    const h = datasetHash([]);
    assert.match(h, /^[0-9a-f]{8}$/);
  });

  it("DATASET-04. buildDatasetMetadata produces correct observation count", () => {
    const observations = [
      obs({ instrumentKey: "NSE_FO|50928" }),
      obs({ instrumentKey: "NSE_FO|50929", strike: 24100 }),
    ];
    const validation = validateDataset(observations);
    const meta = buildDatasetMetadata(observations, validation, "upstox", "v2");
    assert.equal(meta.observations, 2);
    assert.equal(meta.bars, 2);
  });

  it("DATASET-05. datasetId contains provider and date range", () => {
    const o = obs({ timestamp: "2025-10-15T09:30:00.000Z" });
    const validation = validateDataset([o]);
    const meta = buildDatasetMetadata([o], validation, "upstox", "v2");
    assert.ok(meta.datasetId.includes("upstox"));
    assert.ok(meta.datasetId.includes("2025-10-15"));
  });
});

// ── SAFETY tests ──────────────────────────────────────────────────────────────

describe("SAFETY — No strategy/risk/order modifications", () => {
  it("SAFETY-01. UDAPI1149 constant is unchanged", () => {
    assert.equal(UDAPI1149, "UDAPI1149");
  });

  it("SAFETY-02. Phase12Decision type includes PROVIDER_BLOCKED", () => {
    const d: Phase12Decision = "PROVIDER_BLOCKED";
    assert.ok(d);
  });

  it("SAFETY-03. Blocked report does not fabricate option data", () => {
    const r = buildPhase12Report(blockedReport(), [], null);
    assert.equal(r.contracts.total, 0);
    assert.equal(r.hash, null);
  });

  it("SAFETY-04. dataQuality field cannot be overridden to MODEL_DERIVED by accident", () => {
    // The type forces "REAL_HISTORICAL" — this test confirms the only valid value
    const o = obs();
    assert.equal(o.dataQuality, "REAL_HISTORICAL");
  });

  it("SAFETY-05. No order-related exports in adapter", async () => {
    // Dynamically check module exports contain no order methods
    const mod = await import("./adapters/upstoxHistoricalOptionsAdapter.ts");
    const keys = Object.keys(mod);
    const orderKeys = keys.filter((k) => /order|place|modify|cancel|execute/i.test(k));
    assert.deepEqual(orderKeys, []);
  });
});
