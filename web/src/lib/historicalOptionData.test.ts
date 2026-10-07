// Phase 11.6 — Historical option data fidelity tests D1–D40.
// Since real historical option data is NOT AVAILABLE (Upstox UDAPI1149, Plus plan required),
// these tests verify the existing MODEL_DERIVED path is correctly labeled, no fake data is
// presented as real, quality states propagate correctly, and all structural invariants hold.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import {
  buildAuditReport,
  buildDataQualityScorecard,
  UPSTOX_INVESTIGATION,
  CURRENT_OPTION_DATA_QUALITY,
} from "./historicalOptionDataAudit.ts";
import {
  OPTIONS_HISTORY_FINDING,
  NEWS_HISTORY_FINDING,
  lookAheadViolations,
  datasetHash,
  fnv,
  type SnapshotTimes,
} from "./services/historicalContext.ts";
import {
  buildHistoricalOptionChain,
  priceOption,
  yearsToExpiry,
  BACKTEST_IV,
} from "./backtestSnapshot.ts";
import {
  planChunks,
  mergeAndValidate,
  tradingDays,
} from "./services/historicalCandles.ts";
import type { Candle } from "./types.ts";

console.info = () => {};

// ── Helper ────────────────────────────────────────────────────────────────────

function candle(ts: string, close = 22700): Candle {
  return { timestamp: ts, open: close, high: close + 10, low: close - 10, close, volume: 1000 };
}

// ── D1: Option record normalization (MODEL_DERIVED path) ───────────────────────

test("D1. buildHistoricalOptionChain produces normalized records with required fields", () => {
  const now = new Date("2026-10-06T09:30:00+05:30");
  const chain = buildHistoricalOptionChain(22700, 50, "2026-10-09", now);
  assert.ok(chain.length > 0);
  for (const row of chain) {
    assert.ok("strike" in row);
    assert.ok("call" in row);
    assert.ok("put" in row);
    assert.ok(typeof row.call.ltp === "number");
    assert.ok(typeof row.put.ltp === "number");
    assert.ok(row.call.ltp >= 0.05);
    assert.ok(row.put.ltp >= 0.05);
  }
});

// ── D2: Instrument key is null in backtest (not fabricated) ──────────────────

test("D2. backtest option chain has null instrumentKey — not fabricated", () => {
  const now = new Date("2026-10-06T09:30:00+05:30");
  const chain = buildHistoricalOptionChain(22700, 50, "2026-10-09", now);
  for (const row of chain) {
    assert.strictEqual(row.call.instrumentKey, null, "CE instrumentKey must be null (not fabricated)");
    assert.strictEqual(row.put.instrumentKey, null, "PE instrumentKey must be null (not fabricated)");
  }
});

// ── D3: Timestamp normalization — candle merge converts to IST ────────────────

test("D3. mergeAndValidate handles UTC timestamps and converts to IST for range check", () => {
  const candles = [
    candle("2026-10-06T03:45:00.000Z"), // 09:15 IST
    candle("2026-10-06T04:00:00.000Z"), // 09:30 IST
  ];
  const { coverage } = mergeAndValidate([candles], "2026-10-06", "2026-10-06", "15m", 1);
  assert.equal(coverage.barCount, 2);
});

// ── D4: Expiry correctness — yearsToExpiry positive before expiry ─────────────

test("D4. yearsToExpiry is positive before expiry date", () => {
  const tte = yearsToExpiry("2026-10-09", new Date("2026-10-06T09:30:00+05:30"));
  assert.ok(tte > 0);
  assert.ok(tte < 1);
});

test("D4b. yearsToExpiry is zero at or after expiry", () => {
  const tte = yearsToExpiry("2026-10-06", new Date("2026-10-06T16:00:00+05:30"));
  assert.equal(tte, 0);
});

// ── D5: Strike correctness ─────────────────────────────────────────────────────

test("D5. buildHistoricalOptionChain centers strikes on ATM rounded to step", () => {
  const now = new Date("2026-10-06T09:30:00+05:30");
  const chain = buildHistoricalOptionChain(22733, 50, "2026-10-09", now); // ATM rounds to 22750
  const atm = Math.round(22733 / 50) * 50;
  const strikes = chain.map((r) => r.strike);
  assert.ok(strikes.includes(atm), `chain must include ATM strike ${atm}`);
});

// ── D6: CE/PE correctness ──────────────────────────────────────────────────────

test("D6. call price > put price for deep ITM call (spot >> strike)", () => {
  // ATM call has higher value than ATM put when both near-expiry (put-call parity)
  const now = new Date("2026-10-06T09:30:00+05:30");
  const ce = priceOption("CE", 23000, 22000, "2026-10-09", now); // deep ITM call
  const pe = priceOption("PE", 23000, 22000, "2026-10-09", now); // OTM put
  assert.ok(ce > pe, "deep ITM call must be more expensive than OTM put");
});

// ── D7: OI is null/0 when not available ───────────────────────────────────────

test("D7. OI is 0 when oiAvailable=false — not invented", () => {
  const now = new Date("2026-10-06T09:30:00+05:30");
  const chain = buildHistoricalOptionChain(22700, 50, "2026-10-09", now, BACKTEST_IV, false);
  for (const row of chain) {
    assert.equal(row.call.oi, 0, "OI must be 0 when not available");
    assert.equal(row.put.oi, 0);
    assert.strictEqual(row.call.chgOi, null, "chgOi must be null when OI not available");
    assert.strictEqual(row.put.chgOi, null);
  }
});

// ── D8: IV source labeled correctly ──────────────────────────────────────────

test("D8. CURRENT_OPTION_DATA_QUALITY has IV as HISTORICAL_RECONSTRUCTED (VIX proxy)", () => {
  assert.equal(CURRENT_OPTION_DATA_QUALITY.iv, "HISTORICAL_RECONSTRUCTED");
});

test("D8b. scorecard with VIX available reports iv as HISTORICAL_RECONSTRUCTED", () => {
  const s = buildDataQualityScorecard(true, true, true);
  assert.equal(s.iv, "HISTORICAL_RECONSTRUCTED");
});

test("D8c. scorecard without VIX reports iv as MODEL_DERIVED", () => {
  const s = buildDataQualityScorecard(false, false, true);
  assert.equal(s.iv, "MODEL_DERIVED");
});

// ── D9: Volume is 0/null when not available ────────────────────────────────────

test("D9. CURRENT_OPTION_DATA_QUALITY has volume as NOT_AVAILABLE", () => {
  assert.equal(CURRENT_OPTION_DATA_QUALITY.volume, "NOT_AVAILABLE");
});

// ── D10: Bid/ask is MODEL_DERIVED (synthetic spread) ─────────────────────────

test("D10. CURRENT_OPTION_DATA_QUALITY has bidAsk as MODEL_DERIVED", () => {
  assert.equal(CURRENT_OPTION_DATA_QUALITY.bidAsk, "MODEL_DERIVED");
});

test("D10b. synthetic spread: ask > bid for all chain rows", () => {
  const now = new Date("2026-10-06T09:30:00+05:30");
  const chain = buildHistoricalOptionChain(22700, 50, "2026-10-09", now);
  for (const row of chain) {
    assert.ok((row.call.ask ?? 0) > (row.call.bid ?? 0), "ask must be > bid for CE");
    assert.ok((row.put.ask ?? 0) > (row.put.bid ?? 0), "ask must be > bid for PE");
  }
});

// ── D11: Missing fields handled — null not fabricated ─────────────────────────

test("D11. CURRENT_OPTION_DATA_QUALITY.instrumentKey is NOT_AVAILABLE", () => {
  assert.equal(CURRENT_OPTION_DATA_QUALITY.instrumentKey, "NOT_AVAILABLE");
});

// ── D12: Duplicate detection in mergeAndValidate ─────────────────────────────

test("D12. mergeAndValidate deduplicates bars with identical timestamps", () => {
  const c = candle("2026-10-06T03:45:00.000Z");
  const { coverage } = mergeAndValidate([[c, c, c]], "2026-10-06", "2026-10-06", "15m", 1);
  assert.equal(coverage.duplicateBars, 2);
  assert.equal(coverage.barCount, 1);
});

// ── D13: No forward fill across gaps ─────────────────────────────────────────

test("D13. missing bars remain absent — mergeAndValidate does not fill gaps", () => {
  // Only one bar of the expected 26 for a trading day
  const c = candle("2026-10-06T03:45:00.000Z");
  const { coverage } = mergeAndValidate([[c]], "2026-10-06", "2026-10-06", "15m", 1);
  // Should show partial coverage, not claim full
  assert.ok(coverage.coveragePercent < 100, "partial coverage must be < 100%");
});

// ── D14: No look-ahead ────────────────────────────────────────────────────────

test("D14. lookAheadViolations detects future observation timestamps", () => {
  const decision = new Date("2026-10-06T09:30:00.000Z");
  const times: SnapshotTimes = {
    underlying: "2026-10-06T09:30:00.000Z",
    option: "2026-10-06T09:45:00.000Z",  // 15 minutes after decision — VIOLATION
    oi: null,
    iv: "2026-10-06T09:30:00.000Z",
    news: null,
    breadth: "2026-10-06T09:30:00.000Z",
  };
  const violations = lookAheadViolations(times, decision);
  assert.equal(violations.length, 1);
  assert.ok(violations[0].includes("option"));
});

test("D14b. lookAheadViolations returns empty when all timestamps <= decision time", () => {
  const decision = new Date("2026-10-06T09:30:00.000Z");
  const times: SnapshotTimes = {
    underlying: "2026-10-06T09:30:00.000Z",
    option: "2026-10-06T09:15:00.000Z",
    oi: null,
    iv: "2026-10-06T09:15:00.000Z",
    news: null,
    breadth: "2026-10-06T09:15:00.000Z",
  };
  const violations = lookAheadViolations(times, decision);
  assert.equal(violations.length, 0);
});

// ── D15: Historical lot size uses current fallback ────────────────────────────

test("D15. CURRENT_OPTION_DATA_QUALITY.lotSize is MODEL_DERIVED (current fallback)", () => {
  assert.equal(CURRENT_OPTION_DATA_QUALITY.lotSize, "MODEL_DERIVED");
});

test("D15b. scorecard lotSize is CURRENT_FALLBACK", () => {
  const s = buildDataQualityScorecard(false, false, true);
  assert.equal(s.lotSize, "CURRENT_FALLBACK");
});

// ── D16: Expiry is current schedule, not historical ───────────────────────────

test("D16. scorecard expiry is CURRENT_SCHEDULE_ONLY", () => {
  const s = buildDataQualityScorecard(false, false, true);
  assert.equal(s.expiry, "CURRENT_SCHEDULE_ONLY");
});

// ── D17: Dataset quality labels present ───────────────────────────────────────

test("D17. CURRENT_OPTION_DATA_QUALITY mode is MODEL_DERIVED", () => {
  assert.equal(CURRENT_OPTION_DATA_QUALITY.mode, "MODEL_DERIVED");
});

test("D17b. audit report datasetMode is MODEL_DERIVED", () => {
  const report = buildAuditReport();
  assert.equal(report.datasetMode, "MODEL_DERIVED");
});

// ── D18: REAL vs MODEL_DERIVED separation ─────────────────────────────────────

test("D18. audit report: real dataset is NOT available", () => {
  const report = buildAuditReport();
  assert.equal(report.realDatasetAvailable, false);
  assert.ok(report.realDatasetBlocker.length > 0);
  assert.ok(report.realDatasetBlocker.includes("UDAPI1149") || report.realDatasetBlocker.includes("Plus plan"));
});

test("D18b. legacy (MODEL_DERIVED) dataset is available", () => {
  const report = buildAuditReport();
  assert.equal(report.legacyDatasetAvailable, true);
});

// ── D19: Synthetic fallback labeled correctly ─────────────────────────────────

test("D19. CURRENT_OPTION_DATA_QUALITY.ohlc is MODEL_DERIVED, not REAL_HISTORICAL", () => {
  assert.equal(CURRENT_OPTION_DATA_QUALITY.ohlc, "MODEL_DERIVED");
  assert.notEqual(CURRENT_OPTION_DATA_QUALITY.ohlc, "REAL_HISTORICAL");
});

// ── D20: Dataset hash is deterministic ───────────────────────────────────────

test("D20. datasetHash is deterministic for same candles", () => {
  const cs = [candle("2026-10-01T03:45:00.000Z"), candle("2026-10-01T04:00:00.000Z")];
  const h1 = datasetHash(cs, cs);
  const h2 = datasetHash(cs, cs);
  assert.equal(h1, h2);
});

test("D20b. datasetHash differs for different candles", () => {
  const cs1 = [candle("2026-10-01T03:45:00.000Z", 22700)];
  const cs2 = [candle("2026-10-01T03:45:00.000Z", 22701)];
  assert.notEqual(datasetHash(cs1, cs1), datasetHash(cs2, cs2));
});

// ── D21: Cache key determinism — same range same key ─────────────────────────

test("D21. FNV hash function is deterministic", () => {
  const h1 = fnv("test-key");
  const h2 = fnv("test-key");
  assert.equal(h1, h2);
});

test("D21b. FNV hash differs for different inputs", () => {
  assert.notEqual(fnv("key-a"), fnv("key-b"));
});

// ── D22: Provider failure handling — failed chunks reported, not silently dropped

test("D22. mergeAndValidate reports failedChunks in coverage", () => {
  const { coverage } = mergeAndValidate([], "2026-10-06", "2026-10-06", "15m", 1, [{ from: "2026-10-06", to: "2026-10-06" }]);
  assert.equal(coverage.failedChunks.length, 1);
  assert.notEqual(coverage.status, "FULL");
});

// ── D23: Chunk retry / rate-limit handling ────────────────────────────────────

test("D23. planChunks splits range into correctly-sized chunks", () => {
  const chunks = planChunks("2026-01-01", "2026-12-31", "15m");
  assert.ok(chunks.length > 1, "year range must be split into multiple chunks");
  for (const c of chunks) {
    // each chunk ≤ MAX_CHUNK_DAYS(28) calendar days
    const days = (Date.parse(c.to) - Date.parse(c.from)) / 86_400_000 + 1;
    assert.ok(days <= 28, `chunk [${c.from}–${c.to}] is ${days} days, must be ≤ 28`);
  }
});

// ── D24: Historical snapshot construction ────────────────────────────────────

test("D24. buildHistoricalOptionChain has exactly 21 strikes (ATM ±10)", () => {
  const now = new Date("2026-10-06T09:30:00+05:30");
  const chain = buildHistoricalOptionChain(22700, 50, "2026-10-09", now);
  assert.equal(chain.length, 21);
});

test("D24b. chain rows are ordered by strike ascending", () => {
  const now = new Date("2026-10-06T09:30:00+05:30");
  const chain = buildHistoricalOptionChain(22700, 50, "2026-10-09", now);
  for (let i = 1; i < chain.length; i++) {
    assert.ok(chain[i].strike > chain[i - 1].strike);
  }
});

// ── D25: Backtest adapter: DataQualityReport has datasetMode field ────────────

test("D25. DataQualityReport type has datasetMode field (TypeScript contract)", () => {
  const routePath = path.resolve(process.cwd(), "src/lib/backtestTypes.ts");
  const content = fs.readFileSync(routePath, "utf8");
  assert.ok(content.includes("datasetMode"), "DataQualityReport must include datasetMode field");
  assert.ok(content.includes("MODEL_DERIVED"), "datasetMode must include MODEL_DERIVED");
});

// ── D26: Legacy dataset remains available ────────────────────────────────────

test("D26. BACKTEST_IV constant is defined (legacy model-derived IV available)", () => {
  assert.ok(typeof BACKTEST_IV === "number");
  assert.ok(BACKTEST_IV > 0);
});

test("D26b. buildHistoricalOptionChain works with default IV (legacy path)", () => {
  const now = new Date("2026-10-06T09:30:00+05:30");
  const chain = buildHistoricalOptionChain(22700, 50, "2026-10-09", now, BACKTEST_IV);
  assert.ok(chain.length > 0);
});

// ── D27: Real dataset selection documents unavailability ─────────────────────

test("D27. Upstox investigation documents PLAN_REQUIRED for historical option OHLC", () => {
  assert.equal(UPSTOX_INVESTIGATION.historicalOptionOHLC, "PLAN_REQUIRED");
  assert.ok(UPSTOX_INVESTIGATION.planRequired!.includes("Plus"));
});

test("D27b. OPTIONS_HISTORY_FINDING mentions UDAPI1149", () => {
  assert.ok(OPTIONS_HISTORY_FINDING.includes("UDAPI1149"));
});

// ── D28: Mixed dataset would be labeled MIXED ─────────────────────────────────

test("D28. DatasetMode type includes MIXED (defined in audit types)", () => {
  const auditPath = path.resolve(process.cwd(), "src/lib/historicalOptionDataAudit.ts");
  const content = fs.readFileSync(auditPath, "utf8");
  assert.ok(content.includes('"MIXED"'), 'DatasetMode must include "MIXED"');
});

// ── D29: No fake historical bid/ask ──────────────────────────────────────────

test("D29. CURRENT_OPTION_DATA_QUALITY marks bid/ask as MODEL_DERIVED, not REAL_HISTORICAL", () => {
  assert.equal(CURRENT_OPTION_DATA_QUALITY.bidAsk, "MODEL_DERIVED");
  assert.notEqual(CURRENT_OPTION_DATA_QUALITY.bidAsk, "REAL_HISTORICAL");
});

// ── D30: No fake historical OI ────────────────────────────────────────────────

test("D30. CURRENT_OPTION_DATA_QUALITY marks OI as NOT_AVAILABLE", () => {
  assert.equal(CURRENT_OPTION_DATA_QUALITY.oi, "NOT_AVAILABLE");
  assert.notEqual(CURRENT_OPTION_DATA_QUALITY.oi, "REAL_HISTORICAL");
});

// ── D31: No fake historical IV ────────────────────────────────────────────────

test("D31. CURRENT_OPTION_DATA_QUALITY marks IV as HISTORICAL_RECONSTRUCTED, not REAL_HISTORICAL", () => {
  // India VIX is a proxy (index-level), not the option's actual implied volatility
  assert.equal(CURRENT_OPTION_DATA_QUALITY.iv, "HISTORICAL_RECONSTRUCTED");
  assert.notEqual(CURRENT_OPTION_DATA_QUALITY.iv, "REAL_HISTORICAL");
});

// ── D32: No fake historical volume ───────────────────────────────────────────

test("D32. CURRENT_OPTION_DATA_QUALITY marks volume as NOT_AVAILABLE", () => {
  assert.equal(CURRENT_OPTION_DATA_QUALITY.volume, "NOT_AVAILABLE");
});

// ── D33: NIFTY sample — chain at 50-point steps ──────────────────────────────

test("D33. NIFTY chain uses 50-point strike step", () => {
  const now = new Date("2026-10-06T09:30:00+05:30");
  const chain = buildHistoricalOptionChain(22700, 50, "2026-10-09", now);
  const atm = chain.find((r) => r.strike === 22700);
  assert.ok(atm, "ATM strike must exist");
  const steps = chain.map((r, i) => i > 0 ? r.strike - chain[i - 1].strike : 50);
  assert.ok(steps.every((s) => s === 50), "all steps must be 50 for NIFTY");
});

// ── D34: BANK NIFTY sample — chain at 100-point steps ────────────────────────

test("D34. BANKNIFTY chain uses 100-point strike step", () => {
  const now = new Date("2026-10-06T09:30:00+05:30");
  const chain = buildHistoricalOptionChain(51000, 100, "2026-10-29", now);
  const atm = chain.find((r) => r.strike === 51000);
  assert.ok(atm, "ATM strike must exist for BANKNIFTY");
  const steps = chain.map((r, i) => i > 0 ? r.strike - chain[i - 1].strike : 100);
  assert.ok(steps.every((s) => s === 100), "all steps must be 100 for BANKNIFTY");
});

// ── D35: Weekly expiry sample ────────────────────────────────────────────────

test("D35. short-dated option has higher theta (time decay) than longer-dated", () => {
  const now = new Date("2026-10-06T09:30:00+05:30");
  const shortChain = buildHistoricalOptionChain(22700, 50, "2026-10-09", now); // 3 days
  const longChain = buildHistoricalOptionChain(22700, 50, "2026-10-30", now);  // ~24 days
  const shortATM = shortChain.find((r) => r.strike === 22700)!;
  const longATM = longChain.find((r) => r.strike === 22700)!;
  // theta is negative; short-dated has more negative theta (faster decay)
  assert.ok((shortATM.call.theta ?? 0) < (longATM.call.theta ?? 0), "short-dated call must have more negative theta");
});

// ── D36: Monthly expiry ───────────────────────────────────────────────────────

test("D36. monthly expiry produces positive option prices", () => {
  const now = new Date("2026-10-06T09:30:00+05:30");
  const chain = buildHistoricalOptionChain(22700, 50, "2026-10-29", now);
  const atm = chain.find((r) => r.strike === 22700)!;
  assert.ok(atm.call.ltp > 0);
  assert.ok(atm.put.ltp > 0);
});

// ── D37: ATM call and put both priced ────────────────────────────────────────

test("D37. ATM call and put are both priced with Black-Scholes", () => {
  const now = new Date("2026-10-06T09:30:00+05:30");
  const ce = priceOption("CE", 22700, 22700, "2026-10-09", now);
  const pe = priceOption("PE", 22700, 22700, "2026-10-09", now);
  assert.ok(ce > 0);
  assert.ok(pe > 0);
  // ATM: put-call parity — CE ≈ PE + (F - K) discounted; for short-dated near ATM they should be close
  const diff = Math.abs(ce - pe);
  assert.ok(diff < 50, `ATM CE and PE should be close: CE=${ce}, PE=${pe}, diff=${diff}`);
});

// ── D38: OTM pricing ──────────────────────────────────────────────────────────

test("D38. OTM call is cheaper than ATM call", () => {
  const now = new Date("2026-10-06T09:30:00+05:30");
  const atm = priceOption("CE", 22700, 22700, "2026-10-09", now);
  const otm = priceOption("CE", 22700, 23000, "2026-10-09", now); // 300 OTM
  assert.ok(otm < atm, "OTM call must be cheaper than ATM call");
});

// ── D39: Real vs model comparison — documents that only model is available ────

test("D39. audit report notes absence of real data and provides recommendation", () => {
  const report = buildAuditReport();
  assert.ok(report.recommendation.length > 0);
  assert.ok(report.recommendation.includes("MODEL_DERIVED") || report.recommendation.includes("model-derived"));
  assert.ok(!report.realDatasetAvailable);
});

test("D39b. existing quality framework includes all expected types", () => {
  const report = buildAuditReport();
  const types = report.existingQualityFramework.typesPresent;
  assert.ok(types.includes("HISTORICAL_MEASURED"));
  assert.ok(types.includes("HISTORICAL_RECONSTRUCTED"));
  assert.ok(types.includes("MODEL_DERIVED"));
  assert.ok(types.includes("NOT_AVAILABLE"));
});

// ── D40: Order safety ────────────────────────────────────────────────────────

test("D40. no Upstox order placement/modification/cancellation endpoints", () => {
  const apiDir = path.resolve(process.cwd(), "src/app/api");
  function walk(dir: string): string[] {
    const results: string[] = [];
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) results.push(...walk(full));
      else if (f.endsWith(".ts")) results.push(full);
    }
    return results;
  }
  const ORDER_PATTERNS = [/upstox.*\/orders/i, /place.*order/i, /modify.*order/i, /cancel.*order/i, /\/v2\/order\b/i];
  const files = walk(apiDir);
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const pattern of ORDER_PATTERNS) {
      assert.ok(!pattern.test(content), `Order endpoint pattern "${pattern}" found in ${file}`);
    }
  }
});
