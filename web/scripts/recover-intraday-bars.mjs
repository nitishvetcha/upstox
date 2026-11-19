#!/usr/bin/env node
import { assertCollectionAuthorized } from "./lib/collectionGuard.mjs";
assertCollectionAuthorized("recover-intraday-bars.mjs", "upstox");

// Offline recovery: re-parses raw Upstox V3 candle arrays from PARTIAL records
// written by collect-intraday-bars.mjs before the normalizeCandle() fix.
//
// Source:      .research-data/intraday-bars/
// Destination: .research-data/intraday-bars-corrected/
//
// Safety:
//   - Zero network requests.
//   - Never modifies source files.
//   - Atomic writes to destination.
//   - Fails if any destination file already exists.

import * as fs from "node:fs";
import * as path from "node:path";

const SRC_DIR = path.resolve(process.cwd(), ".research-data/intraday-bars");
const DST_DIR = path.resolve(process.cwd(), ".research-data/intraday-bars-corrected");
const RECOVERY_DATE = "2026-11-04";

// ── candle normalization (V3 array → object) ──────────────────────────────
function normalizeCandle(raw) {
  if (!Array.isArray(raw) || raw.length < 6) return null;
  return {
    timestamp: raw[0],
    open: raw[1],
    high: raw[2],
    low: raw[3],
    close: raw[4],
    volume: raw[5],
    openInterest: raw[6] ?? 0,
  };
}

function normalizeCandles(rawCandles) {
  if (!Array.isArray(rawCandles)) return [];
  return rawCandles.map(normalizeCandle).filter((c) => c !== null);
}

// ── candle validation ──────────────────────────────────────────────────────
function validateCandles(candles) {
  if (!Array.isArray(candles) || candles.length === 0)
    return { ok: false, reason: "empty", issues: [], missingIntervals: 0, zeroVolumeCount: 0, candleCount: 0, duplicateCount: 0 };

  const issues = [];
  const seenTs = new Set();
  let missingIntervals = 0;
  let zeroVolumeCount = 0;
  let duplicateCount = 0;
  let prevTs = null;

  for (const c of candles) {
    if (!c.timestamp || c.open == null || c.high == null || c.low == null || c.close == null || c.volume == null) {
      issues.push("malformed candle: missing OHLCV fields");
      break;
    }
    if (c.high < c.low || c.open < 0 || c.close < 0) issues.push(`invalid prices at ${c.timestamp}`);
    if (c.volume < 0) issues.push(`negative volume at ${c.timestamp}`);
    if (c.volume === 0) zeroVolumeCount++;
    if (seenTs.has(c.timestamp)) { issues.push(`duplicate timestamp ${c.timestamp}`); duplicateCount++; }
    seenTs.add(c.timestamp);
    if (prevTs !== null) {
      const gap = (new Date(c.timestamp) - new Date(prevTs)) / 1000;
      if (gap > 120) missingIntervals++;
    }
    prevTs = c.timestamp;
  }

  return { ok: issues.length === 0, issues, missingIntervals, zeroVolumeCount, duplicateCount, candleCount: candles.length };
}

// ── atomic write ──────────────────────────────────────────────────────────
function atomicWrite(filePath, data) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

// ── main ───────────────────────────────────────────────────────────────────
function main() {
  console.log("\nrecover-intraday-bars  OFFLINE RECOVERY\n");
  console.log(`  source      : ${SRC_DIR}`);
  console.log(`  destination : ${DST_DIR}\n`);

  // find source files for the recovery date
  const srcFiles = fs.readdirSync(SRC_DIR)
    .filter((f) => f.startsWith(`${RECOVERY_DATE}-`) && f.endsWith(".json"))
    .sort()
    .map((f) => path.join(SRC_DIR, f));

  if (srcFiles.length === 0) {
    console.error(`ERROR: No source files found for ${RECOVERY_DATE} in ${SRC_DIR}`);
    process.exit(1);
  }

  console.log(`  Found ${srcFiles.length} source records for ${RECOVERY_DATE}\n`);

  // fail early if any destination file already exists
  if (fs.existsSync(DST_DIR)) {
    const existing = fs.readdirSync(DST_DIR).filter((f) => f.endsWith(".json"));
    if (existing.length > 0) {
      console.error(`ERROR: Destination already contains ${existing.length} record(s). Aborting to prevent overwrite.`);
      console.error(`  Remove or rename ${DST_DIR} and retry.`);
      process.exit(1);
    }
  }

  fs.mkdirSync(DST_DIR, { recursive: true });

  const recoveryTimestamp = new Date().toISOString();
  const summary = {
    recoveryTimestamp,
    recoveryDate: RECOVERY_DATE,
    source: SRC_DIR,
    destination: DST_DIR,
    originalRecordsFound: srcFiles.length,
    correctedRecordsWritten: 0,
    totalCandlesRecovered: 0,
    totalZeroVolumeCandles: 0,
    totalDuplicateTimestamps: 0,
    totalMissingIntervals: 0,
    stocksOk: 0,
    stocksPartial: 0,
    stocksFailed: 0,
    perStock: [],
  };

  for (const srcPath of srcFiles) {
    const fileName = path.basename(srcPath);
    const dstPath = path.join(DST_DIR, fileName);

    // read and parse original
    let original;
    try {
      original = JSON.parse(fs.readFileSync(srcPath, "utf8"));
    } catch (err) {
      console.error(`  FAIL  ${fileName}  could not read source: ${err.message}`);
      summary.stocksFailed++;
      summary.perStock.push({ file: fileName, status: "FAILED", reason: `read error: ${err.message}` });
      continue;
    }

    // verify source is unchanged (must still be PARTIAL from first collection)
    if (original.status !== "PARTIAL") {
      console.warn(`  SKIP  ${fileName}  source status is '${original.status}', expected PARTIAL`);
      summary.perStock.push({ file: fileName, status: "SKIPPED", reason: `unexpected source status: ${original.status}` });
      continue;
    }

    const rawCandles = original.candles ?? [];
    const originalRawCount = rawCandles.length;

    // normalize raw arrays → objects
    const candles = normalizeCandles(rawCandles);
    const normalizationDropped = originalRawCount - candles.length;

    // validate normalized candles
    const validation = validateCandles(candles);

    const corrected = {
      // original fields preserved
      date: original.date,
      symbol: original.symbol,
      instrumentKey: original.instrumentKey,
      interval: original.interval,
      collectedAt: original.collectedAt,
      provider: original.provider,
      // corrected fields
      candles,
      candleCount: candles.length,
      validation,
      missingIntervalCount: validation.missingIntervals,
      zeroVolumeCount: validation.zeroVolumeCount,
      status: validation.ok ? "OK" : candles.length > 0 ? "PARTIAL" : "EMPTY",
      // recovery metadata
      recovery: {
        recoveredAt: recoveryTimestamp,
        sourceFile: fileName,
        originalStatus: original.status,
        originalCandleCount: originalRawCount,
        normalizationDropped,
        note: "Offline re-parse of raw Upstox V3 candle arrays. Original file is unchanged.",
      },
    };

    atomicWrite(dstPath, corrected);

    // accumulate summary
    summary.correctedRecordsWritten++;
    summary.totalCandlesRecovered += candles.length;
    summary.totalZeroVolumeCandles += validation.zeroVolumeCount;
    summary.totalDuplicateTimestamps += validation.duplicateCount;
    summary.totalMissingIntervals += validation.missingIntervals;

    if (corrected.status === "OK") {
      summary.stocksOk++;
      console.log(`  ok     ${original.symbol.padEnd(14)} ${candles.length} candles  zero-vol=${validation.zeroVolumeCount}`);
    } else {
      summary.stocksPartial++;
      console.log(`  part   ${original.symbol.padEnd(14)} ${candles.length} candles  issues=${validation.issues.slice(0, 2).join("; ")}`);
    }

    summary.perStock.push({
      symbol: original.symbol,
      file: fileName,
      status: corrected.status,
      candleCount: candles.length,
      zeroVolumeCount: validation.zeroVolumeCount,
      missingIntervals: validation.missingIntervals,
      duplicateTimestamps: validation.duplicateCount,
      issues: validation.issues,
    });
  }

  // write recovery summary
  const summaryPath = path.join(DST_DIR, `recovery-summary-${RECOVERY_DATE}.json`);
  atomicWrite(summaryPath, summary);

  console.log(`\n── recovery summary ────────────────────────────────`);
  console.log(`  original records found   : ${summary.originalRecordsFound}`);
  console.log(`  corrected records written: ${summary.correctedRecordsWritten}`);
  console.log(`  total candles recovered  : ${summary.totalCandlesRecovered}`);
  console.log(`  stocks OK                : ${summary.stocksOk}`);
  console.log(`  stocks PARTIAL           : ${summary.stocksPartial}`);
  console.log(`  stocks FAILED            : ${summary.stocksFailed}`);
  console.log(`  zero-volume candles      : ${summary.totalZeroVolumeCandles}`);
  console.log(`  duplicate timestamps     : ${summary.totalDuplicateTimestamps}`);
  console.log(`  missing intervals        : ${summary.totalMissingIntervals}`);
  console.log(`  summary written to       : ${summaryPath}`);

  // verify originals unchanged
  let origIntact = true;
  for (const srcPath of srcFiles) {
    try {
      const d = JSON.parse(fs.readFileSync(srcPath, "utf8"));
      if (d.status !== "PARTIAL") { origIntact = false; console.error(`  INTEGRITY FAIL: ${path.basename(srcPath)} status changed`); }
    } catch { origIntact = false; }
  }
  console.log(`\n  originals intact         : ${origIntact ? "YES ✓" : "NO ✗ — INTEGRITY FAILURE"}`);

  if (!origIntact) { console.error("\nINTEGRITY FAILURE: source files were modified."); process.exit(1); }
  if (summary.stocksFailed > 0) process.exit(2);
}

main();
