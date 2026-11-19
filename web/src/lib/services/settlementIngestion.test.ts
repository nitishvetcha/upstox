// Phase 2.3.13 — Isolated Settlement Ingestion Module & Test Suite Acceptance Tests
// Covers SIG-01 through SIG-10 and defensive security/edge case requirements.
// Pure offline execution: zero network calls, zero mutations outside temporary test directory.

import { describe, it, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as zlib from "node:zlib";
import {
  ingestSettlementArchive,
  getSettlementRecord,
  listSettlementRecords,
  hasSettlement,
  extractZipArchive,
  parseCsvRows,
  buildContractKey,
  sha256,
  type SettlementRecord,
  type IngestionOptions,
} from "./settlementIngestion.ts";

// ── Synthetic ZIP Generator Helper ────────────────────────────────────────────

function createSyntheticZip(filename: string, content: string): Buffer {
  const contentBuf = Buffer.from(content, "utf8");
  const deflated = zlib.deflateRawSync(contentBuf);
  const crc = zlib.crc32(contentBuf);
  const fnBuf = Buffer.from(filename, "utf8");

  // Local header (30 bytes + fnLen)
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); // local signature
  lh.writeUInt16LE(20, 4);         // version needed
  lh.writeUInt16LE(0, 6);          // flags
  lh.writeUInt16LE(8, 8);          // deflate
  lh.writeUInt16LE(0, 10);         // mtime
  lh.writeUInt16LE(0, 12);         // mdate
  lh.writeUInt32LE(crc, 14);       // crc32
  lh.writeUInt32LE(deflated.length, 18); // comp size
  lh.writeUInt32LE(contentBuf.length, 22); // uncomp size
  lh.writeUInt16LE(fnBuf.length, 26);
  lh.writeUInt16LE(0, 28);         // extra length

  const localOffset = 0;
  const localFile = Buffer.concat([lh, fnBuf, deflated]);

  // Central directory header (46 bytes + fnLen)
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0); // CD signature
  cd.writeUInt16LE(20, 4);         // version made by
  cd.writeUInt16LE(20, 6);         // version needed
  cd.writeUInt16LE(0, 8);          // flags
  cd.writeUInt16LE(8, 10);         // method
  cd.writeUInt16LE(0, 12);         // mtime
  cd.writeUInt16LE(0, 14);         // mdate
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(deflated.length, 20);
  cd.writeUInt32LE(contentBuf.length, 24);
  cd.writeUInt16LE(fnBuf.length, 28);
  cd.writeUInt16LE(0, 30);         // extra length
  cd.writeUInt16LE(0, 32);         // comment length
  cd.writeUInt16LE(0, 34);         // disk start
  cd.writeUInt16LE(0, 36);         // internal attrs
  cd.writeUInt32LE(0, 38);         // external attrs
  cd.writeUInt32LE(localOffset, 42); // relative offset of local header

  const cdBuf = Buffer.concat([cd, fnBuf]);

  // EOCD (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);        // disk num
  eocd.writeUInt16LE(0, 6);        // start disk
  eocd.writeUInt16LE(1, 8);        // entries on disk
  eocd.writeUInt16LE(1, 10);       // total entries
  eocd.writeUInt32LE(cdBuf.length, 12); // size of CD
  eocd.writeUInt32LE(localFile.length, 16); // offset of CD
  eocd.writeUInt16LE(0, 20);       // comment length

  return Buffer.concat([localFile, cdBuf, eocd]);
}

// Helper to create synthetic standard UDiFF CSV content
function createSyntheticCsv(rows: string[][], headers?: string[]): string {
  const headerCols = headers ?? [
    "TradDt", "BizDt", "FinInstrmTp", "TckrSymb", "XpryDt", "StrkPric", "OptnTp", "SttlmPric", "ClsPric", "OpnIntrst",
  ];
  const allRows = [headerCols, ...rows];
  return allRows.map((r) => r.join(",")).join("\r\n") + "\r\n";
}

// ── Test Environment Isolation ────────────────────────────────────────────────

const SCRATCH_BASE = path.join(os.tmpdir(), `settlement-test-${process.pid}`);

function cleanScratch() {
  try {
    if (fs.existsSync(SCRATCH_BASE)) {
      fs.rmSync(SCRATCH_BASE, { recursive: true, force: true });
    }
  } catch {}
}

describe("Phase 2.3.13 — Isolated Settlement Ingestion Module & Test Suite", () => {
  beforeEach(() => {
    cleanScratch();
    fs.mkdirSync(SCRATCH_BASE, { recursive: true });
  });

  afterEach(() => {
    cleanScratch();
  });

  after(() => {
    cleanScratch();
  });

  // ── Core SIG Scenarios ──────────────────────────────────────────────────────

  it("SIG-01: Valid archive and valid supported contract ingest successfully", () => {
    const csv = createSyntheticCsv([
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24500.00", "CE", "145.50", "144.00", "50000"],
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24500.00", "PE", "0.00", "0.05", "45000"],
      ["2026-10-29", "2026-10-29", "OPTIDX", "BANKNIFTY", "2026-10-29", "52000.00", "CE", "320.25", "318.00", "20000"],
    ]);
    const zip = createSyntheticZip("BhavCopy_NSE_FO_0_0_0_20261029_F_0000.csv", csv);

    const result = ingestSettlementArchive(zip, {
      storageDir: SCRATCH_BASE,
      expectedTradeDate: "2026-10-29",
    });

    assert.equal(result.status, "SUCCESS");
    assert.equal(result.tradeDate, "2026-10-29");
    assert.equal(result.records.length, 3);
    assert.equal(result.errors.length, 0);

    const niftyCall = result.records.find((r) => r.symbol === "NIFTY" && r.optionType === "CE");
    assert.ok(niftyCall);
    assert.equal(niftyCall.settlementPrice, 145.50);
    assert.equal(niftyCall.strikePrice, 24500);

    // Verify stored files in scratch directory
    assert.ok(fs.existsSync(path.join(SCRATCH_BASE, "settlement_2026-10-29.json")));
    assert.ok(fs.existsSync(path.join(SCRATCH_BASE, "meta_2026-10-29.json")));
  });

  it("SIG-02: Trade-date mismatch is rejected fail-closed", () => {
    const csv = createSyntheticCsv([
      ["2026-10-28", "2026-10-28", "OPTIDX", "NIFTY", "2026-10-28", "24500.00", "CE", "145.50", "144.00", "50000"],
    ]);
    const zip = createSyntheticZip("BhavCopy_NSE_FO_0_0_0_20261028_F_0000.csv", csv);

    const result = ingestSettlementArchive(zip, {
      storageDir: SCRATCH_BASE,
      expectedTradeDate: "2026-10-29", // Expected 29th, archive has 28th
    });

    assert.equal(result.status, "REJECTED");
    assert.ok(result.errors.some((e) => e.includes("Trade date mismatch")));
    assert.equal(result.records.length, 0);
    // Nothing stored
    assert.equal(fs.existsSync(path.join(SCRATCH_BASE, "settlement_2026-10-29.json")), false);
  });

  it("SIG-03: Corrupt ZIP, truncated archive, or missing required headers fails closed", () => {
    // 1. Corrupted ZIP buffer
    const badZip = Buffer.from("PK\x03\x04corrupted-archive-garbage-content");
    const res1 = ingestSettlementArchive(badZip, { storageDir: SCRATCH_BASE });
    assert.equal(res1.status, "REJECTED");
    assert.ok(res1.errors.some((e) => e.includes("ZIP extraction failed")));

    // 2. Missing required column 'SttlmPric'
    const csvMissingHeader = "TradDt,TckrSymb,XpryDt,StrkPric,OptnTp\r\n2026-10-29,NIFTY,2026-10-29,24500,CE\r\n";
    const zipMissingHeader = createSyntheticZip("test.csv", csvMissingHeader);
    const res2 = ingestSettlementArchive(zipMissingHeader, { storageDir: SCRATCH_BASE });
    assert.equal(res2.status, "REJECTED");
    assert.ok(res2.errors.some((e) => e.includes("Required column 'SttlmPric' is missing")));

    // 3. Truncated archive
    const zipValid = createSyntheticZip("test.csv", "TradDt,TckrSymb\r\n");
    const zipTruncated = zipValid.slice(0, 40);
    const res3 = ingestSettlementArchive(zipTruncated, { storageDir: SCRATCH_BASE });
    assert.equal(res3.status, "REJECTED");
  });

  it("SIG-04: Identical archive hash is an idempotent no-op", () => {
    const csv = createSyntheticCsv([
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24500.00", "CE", "100.00", "99.00", "50000"],
    ]);
    const zip = createSyntheticZip("BhavCopy.csv", csv);

    // First ingestion
    const res1 = ingestSettlementArchive(zip, { storageDir: SCRATCH_BASE });
    assert.equal(res1.status, "SUCCESS");
    assert.equal(res1.records.length, 1);

    // Second ingestion with identical archive
    const res2 = ingestSettlementArchive(zip, { storageDir: SCRATCH_BASE });
    assert.equal(res2.status, "IDEMPOTENT_NOOP");
    assert.equal(res2.archiveHash, res1.archiveHash);
    assert.equal(res2.csvHash, res1.csvHash);
  });

  it("SIG-05: Changed archive hash is detected as candidate revision without silently replacing active dataset", () => {
    const csv1 = createSyntheticCsv([
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24500.00", "CE", "100.00", "99.00", "50000"],
    ]);
    const zip1 = createSyntheticZip("BhavCopy.csv", csv1);

    const res1 = ingestSettlementArchive(zip1, { storageDir: SCRATCH_BASE });
    assert.equal(res1.status, "SUCCESS");

    // Second archive for same date with revised settlement price (different hash)
    const csv2 = createSyntheticCsv([
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24500.00", "CE", "105.00", "104.00", "50000"],
    ]);
    const zip2 = createSyntheticZip("BhavCopy_revised.csv", csv2);

    const res2 = ingestSettlementArchive(zip2, { storageDir: SCRATCH_BASE });
    assert.equal(res2.status, "CANDIDATE_REVISION");
    assert.equal(res2.metadata.isCandidateRevision, true);
    assert.ok(res2.warnings.some((w) => w.includes("Candidate revision detected") || w.includes("different hash")));

    // Active dataset on disk must NOT have been silently replaced!
    const activeRecords = listSettlementRecords("2026-10-29", { storageDir: SCRATCH_BASE });
    assert.equal(activeRecords.length, 1);
    assert.equal(activeRecords[0].settlementPrice, 100.00); // Original value preserved!
  });

  it("SIG-06: Invalid, missing, negative, non-finite, or malformed settlement values fail closed", () => {
    const csv = createSyntheticCsv([
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24500.00", "CE", "-15.00", "0", "0"], // Negative
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24600.00", "CE", "NaN", "0", "0"],    // Non-finite
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24700.00", "CE", "Infinity", "0", "0"], // Infinity
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24800.00", "CE", "", "0", "0"],         // Missing
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24900.00", "CE", "abc", "0", "0"],      // Malformed string
    ]);
    const zip = createSyntheticZip("BhavCopy.csv", csv);

    const res = ingestSettlementArchive(zip, { storageDir: SCRATCH_BASE });
    assert.equal(res.status, "REJECTED");
    assert.equal(res.records.length, 0);
    assert.ok(res.errors.length >= 5);
  });

  it("SIG-07: A valid zero settlement price is preserved as zero when supplied by the source", () => {
    // Zero settlement price (OTM option expiring worthless) must be explicitly preserved as 0.00
    const csv = createSyntheticCsv([
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "26000.00", "CE", "0.00", "0.05", "50000"],
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "22000.00", "PE", "0", "0.05", "45000"],
    ]);
    const zip = createSyntheticZip("BhavCopy.csv", csv);

    const res = ingestSettlementArchive(zip, { storageDir: SCRATCH_BASE });
    assert.equal(res.status, "SUCCESS");
    assert.equal(res.records.length, 2);

    for (const rec of res.records) {
      assert.equal(rec.settlementPrice, 0);
      assert.notEqual(rec.settlementPrice, null);
      assert.notEqual(rec.settlementPrice, undefined);
    }
  });

  it("SIG-08: A valid positive settlement price is preserved exactly as supplied, including when intrinsic comparison raises advisory discrepancy", () => {
    // Exchange says 50.00, but underlying spot is 24500 so intrinsic for 24400 CE is 100.00
    // Advisory discrepancy: |50.00 - 100.00| = 50.00 > 0.05
    // Exchange SttlmPric MUST be preserved as 50.00, NOT replaced by 100.00!
    const csv = createSyntheticCsv([
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24400.00", "CE", "50.00", "50.00", "50000"],
    ]);
    const zip = createSyntheticZip("BhavCopy.csv", csv);

    const res = ingestSettlementArchive(zip, {
      storageDir: SCRATCH_BASE,
      underlyingSettlementPrices: { NIFTY: 24500.00 },
    });

    assert.equal(res.status, "SUCCESS");
    assert.equal(res.records.length, 1);
    const rec = res.records[0];

    // Primary authority check: preserved raw from exchange!
    assert.equal(rec.settlementPrice, 50.00);

    // Advisory check: discrepancy flagged
    assert.equal(rec.underlyingSettlementPrice, 24500.00);
    assert.equal(rec.intrinsicValue, 100.00);
    assert.equal(rec.intrinsicDiscrepancy, 50.00);
    assert.equal(rec.discrepancyFlag, true);
    assert.ok(res.warnings.some((w) => w.includes("Advisory discrepancy")));
  });

  it("SIG-09: Multiple contracts are keyed and retrieved by their complete exact identity tuple", () => {
    const csv = createSyntheticCsv([
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24500.00", "CE", "150.00", "148.00", "1000"],
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24500.00", "PE", "25.00", "24.00", "1000"],
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24600.00", "CE", "80.00", "79.00", "1000"],
      ["2026-10-29", "2026-10-29", "OPTIDX", "BANKNIFTY", "2026-10-29", "52000.00", "CE", "350.00", "345.00", "1000"],
    ]);
    const zip = createSyntheticZip("BhavCopy.csv", csv);

    const ingestRes = ingestSettlementArchive(zip, { storageDir: SCRATCH_BASE });
    assert.equal(ingestRes.status, "SUCCESS");

    // Retrieve via exact tuple
    const rec1 = getSettlementRecord(
      { tradeDate: "2026-10-29", symbol: "NIFTY", expiryDate: "2026-10-29", strikePrice: 24500, optionType: "CE" },
      { storageDir: SCRATCH_BASE },
    );
    assert.ok(rec1);
    assert.equal(rec1.settlementPrice, 150.00);

    const rec2 = getSettlementRecord(
      { tradeDate: "2026-10-29", symbol: "NIFTY", expiryDate: "2026-10-29", strikePrice: 24500, optionType: "PE" },
      { storageDir: SCRATCH_BASE },
    );
    assert.ok(rec2);
    assert.equal(rec2.settlementPrice, 25.00);

    // Non-existent strike returns null (fail-closed, no fallback)
    const recMissing = getSettlementRecord(
      { tradeDate: "2026-10-29", symbol: "NIFTY", expiryDate: "2026-10-29", strikePrice: 24550, optionType: "CE" },
      { storageDir: SCRATCH_BASE },
    );
    assert.equal(recMissing, null);
  });

  it("SIG-10: Ordinary option quotes, LTP values, stale market prices, or synthetic intrinsic values cannot be accepted as official settlement data", () => {
    // 1. Non-Buffer inputs (strings, quote objects) are rejected with TypeError
    assert.throws(() => {
      // @ts-expect-error Testing invalid runtime input
      ingestSettlementArchive("ltp: 145.50");
    }, TypeError);
    assert.throws(() => {
      // @ts-expect-error Testing invalid runtime input
      ingestSettlementArchive({ ltp: 145.50, syntheticIntrinsic: 100 });
    }, TypeError);

    // 2. Buffer containing mock quote JSON or LTP text is rejected fail-closed as invalid ZIP
    const quotePayload = Buffer.from(JSON.stringify({ symbol: "NIFTY", ltp: 145.50, syntheticIntrinsic: 100 }));
    const quoteRes = ingestSettlementArchive(quotePayload, { storageDir: SCRATCH_BASE });
    assert.equal(quoteRes.status, "REJECTED");
    assert.equal(quoteRes.records.length, 0);

    // 3. Stored records are empty — quotes cannot become settlement
    assert.equal(hasSettlement("2026-10-29", { storageDir: SCRATCH_BASE }), false);
  });

  // ── Security, Edge Cases & Storage Boundaries ───────────────────────────────

  it("SEC-01: ZIP path traversal entries are rejected fail-closed", () => {
    const csv = "TradDt,TckrSymb\r\n";
    // Entry name with path traversal
    const maliciousZip = createSyntheticZip("../../evil_passwords.csv", csv);

    const res = ingestSettlementArchive(maliciousZip, { storageDir: SCRATCH_BASE });
    assert.equal(res.status, "REJECTED");
    assert.ok(res.errors.some((e) => e.includes("path traversal")));
  });

  it("SEC-02: Duplicate required headers in CSV fail closed", () => {
    const csv = "TradDt,TckrSymb,XpryDt,StrkPric,OptnTp,SttlmPric,SttlmPric\r\n2026-10-29,NIFTY,2026-10-29,24500,CE,100,200\r\n";
    const zip = createSyntheticZip("test.csv", csv);

    const res = ingestSettlementArchive(zip, { storageDir: SCRATCH_BASE });
    assert.equal(res.status, "REJECTED");
    assert.ok(res.errors.some((e) => e.includes("Duplicate header 'SttlmPric'")));
  });

  it("SEC-03: Conflicting duplicate contract rows trigger dataset quarantine", () => {
    // Same contract tuple with two conflicting settlement prices: 100.00 and 105.00
    const csv = createSyntheticCsv([
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24500.00", "CE", "100.00", "0", "0"],
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24500.00", "CE", "105.00", "0", "0"],
    ]);
    const zip = createSyntheticZip("test.csv", csv);

    const res = ingestSettlementArchive(zip, { storageDir: SCRATCH_BASE });
    assert.equal(res.status, "QUARANTINED");
    assert.ok(res.errors.some((e) => e.includes("CRITICAL INTEGRITY FAILURE") && e.includes("Conflicting duplicate rows")));
  });

  it("SEC-04: Identical duplicate contract rows are deduped safely with advisory warning", () => {
    const csv = createSyntheticCsv([
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24500.00", "CE", "100.00", "0", "0"],
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24500.00", "CE", "100.00", "0", "0"],
    ]);
    const zip = createSyntheticZip("test.csv", csv);

    const res = ingestSettlementArchive(zip, { storageDir: SCRATCH_BASE });
    assert.equal(res.status, "SUCCESS");
    assert.equal(res.records.length, 1);
    assert.ok(res.warnings.some((w) => w.includes("Duplicate identical row")));
  });

  it("SEC-05: Correctly quoted CSV values with embedded commas and quotes parse accurately", () => {
    const csv =
      'TradDt,BizDt,FinInstrmTp,TckrSymb,XpryDt,StrkPric,OptnTp,SttlmPric\r\n' +
      '"2026-10-29","2026-10-29","OPTIDX","NIFTY","2026-10-29","24500.00","CE","150.00"\r\n';
    const zip = createSyntheticZip("test.csv", csv);

    const res = ingestSettlementArchive(zip, { storageDir: SCRATCH_BASE });
    assert.equal(res.status, "SUCCESS");
    assert.equal(res.records.length, 1);
    assert.equal(res.records[0].settlementPrice, 150.00);
  });

  it("SEC-06: Unsupported symbols (stocks, commodities) and option types are safely skipped", () => {
    const csv = createSyntheticCsv([
      ["2026-10-29", "2026-10-29", "OPTSTK", "RELIANCE", "2026-10-29", "3000.00", "CE", "50.00", "0", "0"], // Stock option
      ["2026-10-29", "2026-10-29", "FUTIDX", "NIFTY", "2026-10-29", "0.00", "XX", "24550.00", "0", "0"],     // Futures
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24500.00", "CE", "150.00", "0", "0"],    // Valid NIFTY
    ]);
    const zip = createSyntheticZip("test.csv", csv);

    const res = ingestSettlementArchive(zip, { storageDir: SCRATCH_BASE });
    assert.equal(res.status, "SUCCESS");
    assert.equal(res.records.length, 1);
    assert.equal(res.records[0].symbol, "NIFTY");
  });

  it("SEC-07: Date parsing edge cases (invalid calendar dates like 2026-02-30) fail closed", () => {
    const csv = createSyntheticCsv([
      ["2026-02-30", "2026-02-30", "OPTIDX", "NIFTY", "2026-02-30", "24500.00", "CE", "100.00", "0", "0"],
    ]);
    const zip = createSyntheticZip("test.csv", csv);

    const res = ingestSettlementArchive(zip, { storageDir: SCRATCH_BASE });
    assert.equal(res.status, "REJECTED");
    assert.ok(res.errors.some((e) => e.includes("invalid trade date format")));
  });

  it("SEC-08: Oversized archive or zip bomb exceeds bounds and fails closed", () => {
    const zip = createSyntheticZip("test.csv", "TradDt,TckrSymb\r\n");
    // Pass tiny limit
    const res = ingestSettlementArchive(zip, {
      storageDir: SCRATCH_BASE,
      maxArchiveBytes: 50, // Smaller than zip length (~148 bytes)
    });
    assert.equal(res.status, "REJECTED");
    assert.ok(res.errors.some((e) => e.includes("exceeds maximum limit")));
  });

  it("SEC-09: Storage boundary enforcement: tests never write to production .data/ directory", () => {
    const prodSettlementDir = path.join(process.cwd(), ".data", "settlement");
    const hadProdDirBefore = fs.existsSync(prodSettlementDir);

    const csv = createSyntheticCsv([
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24500.00", "CE", "100.00", "0", "0"],
    ]);
    const zip = createSyntheticZip("test.csv", csv);

    // Ingest into isolated scratch directory
    ingestSettlementArchive(zip, { storageDir: SCRATCH_BASE });

    // Assert files written inside scratch directory
    assert.ok(fs.existsSync(path.join(SCRATCH_BASE, "settlement_2026-10-29.json")));

    // Assert production settlement directory was NOT created or modified by this test
    if (!hadProdDirBefore) {
      assert.equal(fs.existsSync(prodSettlementDir), false);
    }
  });

  it("SEC-10: Atomic write and backup recovery on persistent storage", () => {
    const csv1 = createSyntheticCsv([
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24500.00", "CE", "100.00", "0", "0"],
    ]);
    const zip1 = createSyntheticZip("test.csv", csv1);

    ingestSettlementArchive(zip1, { storageDir: SCRATCH_BASE });

    const recordsFile = path.join(SCRATCH_BASE, "settlement_2026-10-29.json");
    assert.ok(fs.existsSync(recordsFile));

    // Second write to same tradeDate with force revision
    const csv2 = createSyntheticCsv([
      ["2026-10-29", "2026-10-29", "OPTIDX", "NIFTY", "2026-10-29", "24500.00", "CE", "110.00", "0", "0"],
    ]);
    const zip2 = createSyntheticZip("test2.csv", csv2);

    // Candidate revision writes candidate file, does not overwrite active recordsFile
    ingestSettlementArchive(zip2, { storageDir: SCRATCH_BASE });

    const currentRecords = JSON.parse(fs.readFileSync(recordsFile, "utf8")) as SettlementRecord[];
    assert.equal(currentRecords[0].settlementPrice, 100.00); // Intact!
  });
});
