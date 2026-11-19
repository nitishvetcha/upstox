// Phase 2.3.13 — Isolated Settlement Ingestion Module
//
// Strictly offline module: parses and validates official NSE F&O settlement Bhavcopy data.
// No broker API calls, no network downloads, no strategy changes, no ledger mutations.
//
// Primary authority: raw official exchange SttlmPric.
// Intrinsic calculations are secondary advisory audits only, never overriding SttlmPric.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SupportedSettlementSymbol = "NIFTY" | "BANKNIFTY";
export type SupportedOptionType = "CE" | "PE";

export interface SettlementContractKey {
  tradeDate: string;  // YYYY-MM-DD
  symbol: SupportedSettlementSymbol;
  expiryDate: string; // YYYY-MM-DD
  strikePrice: number;
  optionType: SupportedOptionType;
}

export interface SettlementRecord extends SettlementContractKey {
  settlementPrice: number;            // Raw official SttlmPric from exchange
  sourceFile: string;                 // CSV filename inside archive
  archiveHash: string;                // SHA-256 of ZIP archive
  csvHash: string;                    // SHA-256 of extracted CSV
  ingestedAt: string;                 // ISO timestamp
  // Advisory consistency audit (never replaces settlementPrice)
  underlyingSettlementPrice?: number;
  intrinsicValue?: number;
  intrinsicDiscrepancy?: number;
  discrepancyFlag?: boolean;
}

export type IngestionStatus =
  | "SUCCESS"
  | "IDEMPOTENT_NOOP"
  | "CANDIDATE_REVISION"
  | "REJECTED"
  | "QUARANTINED";

export interface IngestionMetadata {
  tradeDate: string;
  sourceFilename: string;
  archiveHash: string;
  csvHash: string;
  ingestedAt: string;
  totalRowsRead: number;
  contractsParsed: number;
  contractsIngested: number;
  status: IngestionStatus;
  rejectionReason?: string;
  revisionNote?: string;
  isCandidateRevision?: boolean;
}

export interface IngestionResult {
  status: IngestionStatus;
  tradeDate: string;
  archiveHash: string;
  csvHash: string;
  records: SettlementRecord[];
  metadata: IngestionMetadata;
  errors: string[];
  warnings: string[];
}

export interface IngestionOptions {
  storageDir?: string;               // Storage directory (production: .data/settlement; tests use isolated temp)
  expectedTradeDate?: string;        // Enforce trade date match if provided (YYYY-MM-DD)
  underlyingSettlementPrices?: Partial<Record<SupportedSettlementSymbol, number>>; // For advisory consistency check
  maxArchiveBytes?: number;          // Default: 20 MB
  maxUncompressedCsvBytes?: number;  // Default: 50 MB
  persist?: boolean;                 // Default: true when storageDir is provided
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const DEFAULT_SETTLEMENT_DIR = path.join(process.cwd(), ".data", "settlement");
export const DEFAULT_MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;       // 20 MB
export const DEFAULT_MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;   // 50 MB
export const INTRINSIC_DISCREPANCY_THRESHOLD = 0.05;              // INR 0.05 discrepancy flag

export const REQUIRED_COLUMNS = [
  "TradDt",
  "TckrSymb",
  "XpryDt",
  "StrkPric",
  "OptnTp",
  "SttlmPric",
] as const;

export const SUPPORTED_SYMBOLS: readonly SupportedSettlementSymbol[] = ["NIFTY", "BANKNIFTY"] as const;
export const SUPPORTED_OPTION_TYPES: readonly SupportedOptionType[] = ["CE", "PE"] as const;

// ── Utilities ─────────────────────────────────────────────────────────────────

export function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function buildContractKey(k: SettlementContractKey): string {
  return `${k.tradeDate}|${k.symbol}|${k.expiryDate}|${k.strikePrice.toFixed(2)}|${k.optionType}`;
}

export function isValidDateFormat(str: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  // Verify round-trip to catch invalid days like 2026-02-30
  const iso = d.toISOString().slice(0, 10);
  return iso === str;
}

// ── In-Memory PKZIP Extractor (Pure Standard Library) ─────────────────────────

interface ZipEntry {
  filename: string;
  content: Buffer;
  uncompressedSize: number;
}

export function extractZipArchive(
  zipBuffer: Buffer,
  maxArchiveBytes = DEFAULT_MAX_ARCHIVE_BYTES,
  maxUncompressedBytes = DEFAULT_MAX_UNCOMPRESSED_BYTES,
): ZipEntry[] {
  if (zipBuffer.length > maxArchiveBytes) {
    throw new Error(`Archive size ${zipBuffer.length} bytes exceeds maximum limit of ${maxArchiveBytes} bytes`);
  }
  if (zipBuffer.length < 22) {
    throw new Error("Invalid archive: file too small to be a valid ZIP");
  }

  // Find End of Central Directory (EOCD) signature: 0x06054b50
  const EOCD_SIG = 0x06054b50;
  let eocdOffset = -1;
  const searchLimit = Math.max(0, zipBuffer.length - 65557); // Max comment length is 65535 + 22
  for (let i = zipBuffer.length - 22; i >= searchLimit; i--) {
    if (zipBuffer.readUInt32LE(i) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }

  const entries: ZipEntry[] = [];

  if (eocdOffset !== -1) {
    // Standard Central Directory traversal
    const totalEntries = zipBuffer.readUInt16LE(eocdOffset + 10);
    const cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16);

    if (cdOffset > zipBuffer.length) {
      throw new Error("Corrupt ZIP archive: central directory offset out of bounds");
    }

    let cur = cdOffset;
    for (let i = 0; i < totalEntries; i++) {
      if (cur + 46 > zipBuffer.length) {
        throw new Error("Corrupt ZIP archive: truncated central directory header");
      }
      if (zipBuffer.readUInt32LE(cur) !== 0x02014b50) {
        throw new Error(`Corrupt ZIP archive: invalid central directory signature at offset ${cur}`);
      }

      const method = zipBuffer.readUInt16LE(cur + 10);
      const crc = zipBuffer.readUInt32LE(cur + 16);
      const cSize = zipBuffer.readUInt32LE(cur + 20);
      const uSize = zipBuffer.readUInt32LE(cur + 24);
      const fnLen = zipBuffer.readUInt16LE(cur + 28);
      const exLen = zipBuffer.readUInt16LE(cur + 30);
      const commentLen = zipBuffer.readUInt16LE(cur + 32);
      const localOffset = zipBuffer.readUInt32LE(cur + 42);

      if (uSize > maxUncompressedBytes) {
        throw new Error(`Zip bomb detected: uncompressed size ${uSize} exceeds limit ${maxUncompressedBytes}`);
      }

      const fn = zipBuffer.slice(cur + 46, cur + 46 + fnLen).toString("utf8");

      // Path traversal security check
      if (fn.includes("..") || path.isAbsolute(fn) || fn.startsWith("/") || fn.startsWith("\\")) {
        throw new Error(`Security violation: zip path traversal detected in filename '${fn}'`);
      }

      // Check local file header
      if (localOffset + 30 > zipBuffer.length || zipBuffer.readUInt32LE(localOffset) !== 0x04034b50) {
        throw new Error(`Corrupt ZIP archive: invalid local file header at offset ${localOffset}`);
      }
      const locFnLen = zipBuffer.readUInt16LE(localOffset + 26);
      const locExLen = zipBuffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + locFnLen + locExLen;

      if (dataStart + cSize > zipBuffer.length) {
        throw new Error(`Corrupt ZIP archive: truncated compressed data for entry '${fn}'`);
      }

      const cData = zipBuffer.slice(dataStart, dataStart + cSize);
      let content: Buffer;

      if (method === 0) {
        // Stored (no compression)
        content = cData;
      } else if (method === 8) {
        // Deflated
        try {
          content = zlib.inflateRawSync(cData);
        } catch (err) {
          throw new Error(`Corrupt ZIP archive: deflate decompression failed for '${fn}': ${(err as Error).message}`);
        }
      } else {
        throw new Error(`Unsupported ZIP compression method ${method} for entry '${fn}'`);
      }

      if (content.length > maxUncompressedBytes) {
        throw new Error(`Zip bomb detected: decompressed content length ${content.length} exceeds limit ${maxUncompressedBytes}`);
      }

      // Verify CRC32 if populated
      if (crc !== 0) {
        const computedCrc = zlib.crc32(content);
        if (computedCrc !== crc) {
          throw new Error(`Corrupt ZIP archive: CRC32 mismatch for '${fn}' (expected ${crc}, got ${computedCrc})`);
        }
      }

      entries.push({ filename: fn, content, uncompressedSize: content.length });
      cur += 46 + fnLen + exLen + commentLen;
    }
  } else {
    // Fallback: direct local file header traversal (for archives without EOCD)
    let cur = 0;
    while (cur + 30 <= zipBuffer.length) {
      if (zipBuffer.readUInt32LE(cur) !== 0x04034b50) break;
      const method = zipBuffer.readUInt16LE(cur + 8);
      const flags = zipBuffer.readUInt16LE(cur + 6);
      if ((flags & 0x08) !== 0) {
        throw new Error("Corrupt ZIP archive: data descriptor flag present without EOCD");
      }
      const crc = zipBuffer.readUInt32LE(cur + 14);
      const cSize = zipBuffer.readUInt32LE(cur + 18);
      const uSize = zipBuffer.readUInt32LE(cur + 22);
      const fnLen = zipBuffer.readUInt16LE(cur + 26);
      const exLen = zipBuffer.readUInt16LE(cur + 28);
      const fn = zipBuffer.slice(cur + 30, cur + 30 + fnLen).toString("utf8");

      if (fn.includes("..") || path.isAbsolute(fn) || fn.startsWith("/") || fn.startsWith("\\")) {
        throw new Error(`Security violation: zip path traversal detected in filename '${fn}'`);
      }
      if (uSize > maxUncompressedBytes) {
        throw new Error(`Zip bomb detected: uncompressed size ${uSize} exceeds limit ${maxUncompressedBytes}`);
      }

      const dataStart = cur + 30 + fnLen + exLen;
      if (dataStart + cSize > zipBuffer.length) {
        throw new Error(`Corrupt ZIP archive: truncated compressed data for entry '${fn}'`);
      }

      const cData = zipBuffer.slice(dataStart, dataStart + cSize);
      let content: Buffer;
      if (method === 0) content = cData;
      else if (method === 8) {
        try {
          content = zlib.inflateRawSync(cData);
        } catch (err) {
          throw new Error(`Corrupt ZIP archive: decompression failed for '${fn}': ${(err as Error).message}`);
        }
      } else {
        throw new Error(`Unsupported ZIP compression method ${method}`);
      }

      if (crc !== 0 && zlib.crc32(content) !== crc) {
        throw new Error(`Corrupt ZIP archive: CRC32 mismatch for '${fn}'`);
      }

      entries.push({ filename: fn, content, uncompressedSize: content.length });
      cur = dataStart + cSize;
    }
  }

  if (entries.length === 0) {
    throw new Error("Corrupt or empty ZIP archive: no entries found");
  }

  return entries;
}

// ── RFC 4180 In-Memory CSV Parser ─────────────────────────────────────────────

export function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;
  const len = csvText.length;

  while (i < len) {
    const char = csvText[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && csvText[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ",") {
        currentRow.push(currentField);
        currentField = "";
        i++;
        continue;
      } else if (char === "\r") {
        if (i + 1 < len && csvText[i + 1] === "\n") i++;
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
        continue;
      } else if (char === "\n") {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  if (inQuotes) {
    throw new Error("Malformed CSV: unclosed quoted field at end of input");
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

// ── Main Ingestion Function ───────────────────────────────────────────────────

export function ingestSettlementArchive(
  archiveBuffer: Buffer,
  options: IngestionOptions = {},
): IngestionResult {
  if (!Buffer.isBuffer(archiveBuffer)) {
    throw new TypeError("Invalid argument: archiveBuffer must be a Buffer");
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const ingestedAt = new Date().toISOString();

  const maxArchiveBytes = options.maxArchiveBytes ?? DEFAULT_MAX_ARCHIVE_BYTES;
  const maxUncompressedBytes = options.maxUncompressedCsvBytes ?? DEFAULT_MAX_UNCOMPRESSED_BYTES;
  const storageDir = options.storageDir;

  // 1. Validate archive size and hash
  if (archiveBuffer.length > maxArchiveBytes) {
    const err = `Archive size ${archiveBuffer.length} bytes exceeds maximum limit of ${maxArchiveBytes} bytes`;
    return makeRejectionResult("UNKNOWN", sha256(archiveBuffer), "", err, ingestedAt);
  }

  const archiveHash = sha256(archiveBuffer);

  // 2. Extract ZIP archive
  let zipEntries: ZipEntry[];
  try {
    zipEntries = extractZipArchive(archiveBuffer, maxArchiveBytes, maxUncompressedBytes);
  } catch (err) {
    const msg = `ZIP extraction failed: ${(err as Error).message}`;
    return makeRejectionResult("UNKNOWN", archiveHash, "", msg, ingestedAt);
  }

  // Find Bhavcopy CSV entry
  const csvEntry = zipEntries.find((e) => e.filename.toLowerCase().endsWith(".csv"));
  if (!csvEntry) {
    const msg = "ZIP archive contains no CSV files";
    return makeRejectionResult("UNKNOWN", archiveHash, "", msg, ingestedAt);
  }

  const csvBuffer = csvEntry.content;
  const csvHash = sha256(csvBuffer);
  const csvText = csvBuffer.toString("utf8");

  // 3. Parse CSV rows
  let rows: string[][];
  try {
    rows = parseCsvRows(csvText);
  } catch (err) {
    const msg = `CSV syntax error: ${(err as Error).message}`;
    return makeRejectionResult("UNKNOWN", archiveHash, csvHash, msg, ingestedAt);
  }

  if (rows.length < 2) {
    const msg = "CSV file is empty or missing data rows";
    return makeRejectionResult("UNKNOWN", archiveHash, csvHash, msg, ingestedAt);
  }

  // 4. Validate headers
  const rawHeaders = rows[0].map((h) => h.trim());
  const headerMap = new Map<string, number>();

  for (let idx = 0; idx < rawHeaders.length; idx++) {
    const header = rawHeaders[idx];
    if (headerMap.has(header)) {
      const msg = `Duplicate header '${header}' found in CSV; failing closed`;
      return makeRejectionResult("UNKNOWN", archiveHash, csvHash, msg, ingestedAt);
    }
    headerMap.set(header, idx);
  }

  // Check required columns
  for (const reqCol of REQUIRED_COLUMNS) {
    if (!headerMap.has(reqCol)) {
      const msg = `Required column '${reqCol}' is missing from CSV headers`;
      return makeRejectionResult("UNKNOWN", archiveHash, csvHash, msg, ingestedAt);
    }
  }

  const tradDtIdx = headerMap.get("TradDt")!;
  const tckrSymbIdx = headerMap.get("TckrSymb")!;
  const xpryDtIdx = headerMap.get("XpryDt")!;
  const strkPricIdx = headerMap.get("StrkPric")!;
  const optnTpIdx = headerMap.get("OptnTp")!;
  const sttlmPricIdx = headerMap.get("SttlmPric")!;
  const finInstrmTpIdx = headerMap.get("FinInstrmTp"); // Optional column

  // 5. Parse contract rows
  const recordsMap = new Map<string, SettlementRecord>();
  let detectedTradeDate: string | null = null;
  let totalRowsRead = 0;
  let contractsParsed = 0;

  for (let rIdx = 1; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];
    if (row.length === 1 && row[0].trim() === "") continue; // skip blank trailing line
    totalRowsRead++;

    // Ensure row has sufficient columns
    if (row.length <= Math.max(tradDtIdx, tckrSymbIdx, xpryDtIdx, strkPricIdx, optnTpIdx, sttlmPricIdx)) {
      errors.push(`Row ${rIdx}: truncated column count (${row.length} fields)`);
      continue;
    }

    const rawTradDt = row[tradDtIdx].trim();
    const rawTckrSymb = row[tckrSymbIdx].trim().toUpperCase();
    const rawXpryDt = row[xpryDtIdx].trim();
    const rawStrkPric = row[strkPricIdx].trim();
    const rawOptnTp = row[optnTpIdx].trim().toUpperCase();
    const rawSttlmPric = row[sttlmPricIdx].trim();

    // Check financial instrument type if present: must be index option
    if (finInstrmTpIdx !== undefined && finInstrmTpIdx < row.length) {
      const rawFinInstrm = row[finInstrmTpIdx].trim().toUpperCase();
      if (rawFinInstrm && rawFinInstrm !== "OPTIDX") {
        // Skip stock options, futures, etc. cleanly without error
        continue;
      }
    }

    // Filter to supported symbols (NIFTY and BANKNIFTY)
    if (!SUPPORTED_SYMBOLS.includes(rawTckrSymb as SupportedSettlementSymbol)) {
      // Non-supported symbols (e.g. FINNIFTY, MIDCPNIFTY, equities) are safely skipped
      continue;
    }
    const symbol = rawTckrSymb as SupportedSettlementSymbol;

    // Validate trade date format
    if (!isValidDateFormat(rawTradDt)) {
      errors.push(`Row ${rIdx}: invalid trade date format '${rawTradDt}'`);
      continue;
    }
    if (detectedTradeDate === null) {
      detectedTradeDate = rawTradDt;
    } else if (detectedTradeDate !== rawTradDt) {
      const msg = `Conflicting trade dates in archive: expected '${detectedTradeDate}', found '${rawTradDt}' at row ${rIdx}`;
      return makeQuarantineResult(detectedTradeDate, archiveHash, csvHash, msg, ingestedAt, storageDir, options);
    }

    // Enforce expected trade date if caller specified one
    if (options.expectedTradeDate && rawTradDt !== options.expectedTradeDate) {
      const msg = `Trade date mismatch: archive contains '${rawTradDt}', but expected '${options.expectedTradeDate}'`;
      return makeRejectionResult(rawTradDt, archiveHash, csvHash, msg, ingestedAt);
    }

    // Validate expiry date format
    if (!isValidDateFormat(rawXpryDt)) {
      errors.push(`Row ${rIdx}: invalid expiry date format '${rawXpryDt}'`);
      continue;
    }

    // Rule 9: For expiry settlement, only contracts expiring ON the trade date are applicable
    if (rawXpryDt !== rawTradDt) {
      // Future expiry date: not expiring today, safely skip for expiry day settlement
      continue;
    }

    // Validate option type
    if (!SUPPORTED_OPTION_TYPES.includes(rawOptnTp as SupportedOptionType)) {
      errors.push(`Row ${rIdx}: unsupported option type '${rawOptnTp}' for contract ${symbol}`);
      continue;
    }
    const optionType = rawOptnTp as SupportedOptionType;

    // Validate strike price: must be finite positive number
    const strikePrice = parseFloat(rawStrkPric);
    if (!Number.isFinite(strikePrice) || strikePrice <= 0) {
      errors.push(`Row ${rIdx}: invalid strike price '${rawStrkPric}' for ${symbol} ${optionType}`);
      continue;
    }

    // Validate settlement price: must be finite non-negative number
    if (rawSttlmPric === "" || rawSttlmPric === null || rawSttlmPric === undefined) {
      errors.push(`Row ${rIdx}: missing settlement price for ${symbol} ${strikePrice} ${optionType}`);
      continue;
    }
    const settlementPrice = parseFloat(rawSttlmPric);
    if (!Number.isFinite(settlementPrice) || settlementPrice < 0) {
      errors.push(`Row ${rIdx}: invalid or negative settlement price '${rawSttlmPric}' for ${symbol} ${strikePrice} ${optionType}`);
      continue;
    }

    contractsParsed++;

    // Contract identity tuple
    const contractKey: SettlementContractKey = {
      tradeDate: rawTradDt,
      symbol,
      expiryDate: rawXpryDt,
      strikePrice,
      optionType,
    };
    const keyString = buildContractKey(contractKey);

    // Advisory Intrinsic Consistency Check (Secondary Audit Only)
    let underlyingSettlementPrice: number | undefined;
    let intrinsicValue: number | undefined;
    let intrinsicDiscrepancy: number | undefined;
    let discrepancyFlag: boolean | undefined;

    const underlyingSpot = options.underlyingSettlementPrices?.[symbol];
    if (typeof underlyingSpot === "number" && Number.isFinite(underlyingSpot) && underlyingSpot > 0) {
      underlyingSettlementPrice = underlyingSpot;
      intrinsicValue = optionType === "CE"
        ? Math.max(0, underlyingSpot - strikePrice)
        : Math.max(0, strikePrice - underlyingSpot);
      intrinsicValue = Math.round(intrinsicValue * 100) / 100;
      intrinsicDiscrepancy = Math.round(Math.abs(settlementPrice - intrinsicValue) * 100) / 100;

      if (intrinsicDiscrepancy > INTRINSIC_DISCREPANCY_THRESHOLD) {
        discrepancyFlag = true;
        warnings.push(
          `Advisory discrepancy for ${symbol} ${strikePrice} ${optionType}: exchange SttlmPric=${settlementPrice}, ` +
          `intrinsic=${intrinsicValue} (diff=${intrinsicDiscrepancy} > threshold ${INTRINSIC_DISCREPANCY_THRESHOLD})`,
        );
      } else {
        discrepancyFlag = false;
      }
    }

    const record: SettlementRecord = {
      ...contractKey,
      settlementPrice, // Preserved raw from exchange! Never overwritten!
      sourceFile: csvEntry.filename,
      archiveHash,
      csvHash,
      ingestedAt,
      underlyingSettlementPrice,
      intrinsicValue,
      intrinsicDiscrepancy,
      discrepancyFlag,
    };

    // Duplicate contract detection
    if (recordsMap.has(keyString)) {
      const existing = recordsMap.get(keyString)!;
      if (Math.abs(existing.settlementPrice - settlementPrice) > 0.0001) {
        // Conflicting duplicate settlement prices for the same exact contract! FAIL CLOSED!
        const msg = `Conflicting duplicate rows for exact contract '${keyString}': existing SttlmPric=${existing.settlementPrice}, new=${settlementPrice}`;
        return makeQuarantineResult(rawTradDt, archiveHash, csvHash, msg, ingestedAt, storageDir, options);
      }
      // Identical duplicate: deduped with advisory warning
      warnings.push(`Duplicate identical row for contract '${keyString}' ignored`);
      continue;
    }

    recordsMap.set(keyString, record);
  }

  const tradeDate = detectedTradeDate ?? options.expectedTradeDate ?? "UNKNOWN";

  if (recordsMap.size === 0) {
    const msg = `No applicable NIFTY or BANKNIFTY expiry contracts found in archive for trade date '${tradeDate}'`;
    return makeRejectionResult(tradeDate, archiveHash, csvHash, msg, ingestedAt, errors, warnings);
  }

  // 6. Idempotency & Revision Handling
  const records = Array.from(recordsMap.values());
  let status: IngestionStatus = "SUCCESS";
  let revisionNote: string | undefined;

  if (storageDir) {
    const existingMeta = loadMetadata(storageDir, tradeDate);
    if (existingMeta) {
      if (existingMeta.archiveHash === archiveHash && existingMeta.csvHash === csvHash) {
        status = "IDEMPOTENT_NOOP";
      } else {
        // Candidate revision detected!
        status = "CANDIDATE_REVISION";
        revisionNote = `New archive presented for date '${tradeDate}' with different hash (previous: ${existingMeta.archiveHash.slice(0, 12)}..., new: ${archiveHash.slice(0, 12)}...). Not automatically replacing active dataset.`;
        warnings.push(revisionNote);
      }
    }
  }

  const metadata: IngestionMetadata = {
    tradeDate,
    sourceFilename: csvEntry.filename,
    archiveHash,
    csvHash,
    ingestedAt,
    totalRowsRead,
    contractsParsed,
    contractsIngested: records.length,
    status,
    revisionNote,
    isCandidateRevision: status === "CANDIDATE_REVISION",
  };

  // 7. Atomic Persistence
  if (storageDir && options.persist !== false) {
    if (status === "SUCCESS") {
      saveSettlementDataset(storageDir, tradeDate, records, metadata);
    } else if (status === "CANDIDATE_REVISION") {
      saveRevisionCandidate(storageDir, tradeDate, records, metadata);
    }
  }

  return {
    status,
    tradeDate,
    archiveHash,
    csvHash,
    records,
    metadata,
    errors,
    warnings,
  };
}

// ── Persistence Helpers ───────────────────────────────────────────────────────

function makeRejectionResult(
  tradeDate: string,
  archiveHash: string,
  csvHash: string,
  reason: string,
  ingestedAt: string,
  errors: string[] = [],
  warnings: string[] = [],
): IngestionResult {
  return {
    status: "REJECTED",
    tradeDate,
    archiveHash,
    csvHash,
    records: [],
    metadata: {
      tradeDate,
      sourceFilename: "",
      archiveHash,
      csvHash,
      ingestedAt,
      totalRowsRead: 0,
      contractsParsed: 0,
      contractsIngested: 0,
      status: "REJECTED",
      rejectionReason: reason,
    },
    errors: [reason, ...errors],
    warnings,
  };
}

export const SETTLEMENT_PARSER_VERSION = "2.3.13-bhavcopy-v1";

export interface QuarantineRecord {
  tradeDate: string;
  archiveHash: string;
  csvHash: string;
  reason: string;
  quarantinedAt: string;
  parserVersion: string;
}

export function saveQuarantineRecord(
  storageDir: string,
  record: QuarantineRecord,
): void {
  fs.mkdirSync(storageDir, { recursive: true });
  const qFile = path.join(storageDir, "quarantine_log.jsonl");
  fs.appendFileSync(qFile, JSON.stringify(record) + "\n", "utf8");
}

export function listQuarantineRecords(storageDir = DEFAULT_SETTLEMENT_DIR): QuarantineRecord[] {
  const qFile = path.join(storageDir, "quarantine_log.jsonl");
  if (!fs.existsSync(qFile)) return [];
  try {
    return fs
      .readFileSync(qFile, "utf8")
      .trim()
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as QuarantineRecord);
  } catch {
    return [];
  }
}

function makeQuarantineResult(
  tradeDate: string,
  archiveHash: string,
  csvHash: string,
  reason: string,
  ingestedAt: string,
  storageDir?: string,
  options?: IngestionOptions,
): IngestionResult {
  // Quarantine log is written by default when storageDir is provided (persist !== false),
  // matching normal ingestion semantics. Callers that need no disk side-effects during
  // testing or dry-runs must pass persist: false explicitly.
  // A quarantined archive never creates settlement records (settlement_*.json / meta_*.json),
  // but it does create quarantine_log.jsonl so the rejection is durably auditable.
  if (storageDir && options?.persist !== false) {
    try {
      saveQuarantineRecord(storageDir, {
        tradeDate,
        archiveHash,
        csvHash,
        reason,
        quarantinedAt: ingestedAt,
        parserVersion: SETTLEMENT_PARSER_VERSION,
      });
    } catch {
      // ignore persistence error on quarantine write in read-only / test contexts
    }
  }

  return {
    status: "QUARANTINED",
    tradeDate,
    archiveHash,
    csvHash,
    records: [],
    metadata: {
      tradeDate,
      sourceFilename: "",
      archiveHash,
      csvHash,
      ingestedAt,
      totalRowsRead: 0,
      contractsParsed: 0,
      contractsIngested: 0,
      status: "QUARANTINED",
      rejectionReason: reason,
    },
    errors: [`CRITICAL INTEGRITY FAILURE — DATASET QUARANTINED: ${reason}`],
    warnings: [],
  };
}

export function loadMetadata(storageDir: string, tradeDate: string): IngestionMetadata | null {
  const metaPath = path.join(storageDir, `meta_${tradeDate}.json`);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8")) as IngestionMetadata;
  } catch {
    return null;
  }
}

export function saveSettlementDataset(
  storageDir: string,
  tradeDate: string,
  records: SettlementRecord[],
  metadata: IngestionMetadata,
): void {
  fs.mkdirSync(storageDir, { recursive: true });
  const recordsPath = path.join(storageDir, `settlement_${tradeDate}.json`);
  const metaPath = path.join(storageDir, `meta_${tradeDate}.json`);

  // Write atomically via tmp files
  const tmpRecords = `${recordsPath}.tmp-${process.pid}-${Date.now()}`;
  const tmpMeta = `${metaPath}.tmp-${process.pid}-${Date.now()}`;

  // Keep backup if existing
  if (fs.existsSync(recordsPath)) {
    fs.copyFileSync(recordsPath, `${recordsPath}.bak`);
  }
  if (fs.existsSync(metaPath)) {
    fs.copyFileSync(metaPath, `${metaPath}.bak`);
  }

  fs.writeFileSync(tmpRecords, JSON.stringify(records, null, 2), "utf8");
  fs.writeFileSync(tmpMeta, JSON.stringify(metadata, null, 2), "utf8");

  fs.renameSync(tmpRecords, recordsPath);
  fs.renameSync(tmpMeta, metaPath);
}

export function saveRevisionCandidate(
  storageDir: string,
  tradeDate: string,
  records: SettlementRecord[],
  metadata: IngestionMetadata,
): void {
  fs.mkdirSync(storageDir, { recursive: true });
  const revId = `${metadata.archiveHash.slice(0, 8)}_${Date.now()}`;
  const revRecordsPath = path.join(storageDir, `candidate_revision_${tradeDate}_${revId}.json`);
  const revMetaPath = path.join(storageDir, `candidate_meta_${tradeDate}_${revId}.json`);

  fs.writeFileSync(revRecordsPath, JSON.stringify(records, null, 2), "utf8");
  fs.writeFileSync(revMetaPath, JSON.stringify(metadata, null, 2), "utf8");
}

export interface CandidateRevisionSummary {
  tradeDate: string;
  revId: string;
  archiveHash: string;
  csvHash: string;
  ingestedAt: string;
  recordsFile: string;
  metaFile: string;
  metadata: IngestionMetadata;
}

export function listCandidateRevisions(
  storageDir: string,
  tradeDate: string,
): CandidateRevisionSummary[] {
  if (!fs.existsSync(storageDir)) return [];
  const files = fs.readdirSync(storageDir);
  const metaPrefix = `candidate_meta_${tradeDate}_`;
  const result: CandidateRevisionSummary[] = [];

  for (const f of files) {
    if (f.startsWith(metaPrefix) && f.endsWith(".json")) {
      const revId = f.slice(metaPrefix.length, -5);
      const metaPath = path.join(storageDir, f);
      const recordsPath = path.join(storageDir, `candidate_revision_${tradeDate}_${revId}.json`);
      if (fs.existsSync(recordsPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as IngestionMetadata;
          result.push({
            tradeDate,
            revId,
            archiveHash: meta.archiveHash,
            csvHash: meta.csvHash,
            ingestedAt: meta.ingestedAt,
            recordsFile: recordsPath,
            metaFile: metaPath,
            metadata: meta,
          });
        } catch {
          // ignore corrupted temp files
        }
      }
    }
  }
  return result;
}

export interface PromotionParams {
  tradeDate: string;
  candidateArchiveHash: string;
  expectedPreviousHash?: string;
  confirmed: boolean;
  operatorId: string;
  reason: string;
  now?: Date;
}

export interface PromotionResult {
  success: boolean;
  tradeDate: string;
  promotedArchiveHash?: string;
  previousArchiveHash?: string;
  alreadyActive?: boolean;
  error?: string;
}

export function promoteCandidateRevision(
  storageDir: string,
  params: PromotionParams,
): PromotionResult {
  const { tradeDate, candidateArchiveHash, expectedPreviousHash, confirmed, operatorId, reason } = params;
  const now = params.now ?? new Date();

  if (!confirmed) {
    return { success: false, tradeDate, error: "PROMOTION_NOT_CONFIRMED: Explicit confirmed=true is required" };
  }
  if (!operatorId || !reason) {
    return { success: false, tradeDate, error: "PROMOTION_METADATA_MISSING: operatorId and reason are required" };
  }

  const currentMeta = loadMetadata(storageDir, tradeDate);
  if (currentMeta && currentMeta.archiveHash === candidateArchiveHash) {
    return {
      success: true,
      tradeDate,
      promotedArchiveHash: candidateArchiveHash,
      previousArchiveHash: currentMeta.archiveHash,
      alreadyActive: true,
    };
  }

  if (expectedPreviousHash && currentMeta && currentMeta.archiveHash !== expectedPreviousHash) {
    return {
      success: false,
      tradeDate,
      error: `PREVIOUS_HASH_MISMATCH: Expected previous hash '${expectedPreviousHash}', but active hash is '${currentMeta.archiveHash}'`,
    };
  }

  const candidates = listCandidateRevisions(storageDir, tradeDate);
  const candidate = candidates.find((c) => c.archiveHash === candidateArchiveHash);
  if (!candidate) {
    return {
      success: false,
      tradeDate,
      error: `CANDIDATE_NOT_FOUND: No candidate revision found for date '${tradeDate}' with hash '${candidateArchiveHash}'`,
    };
  }

  let records: SettlementRecord[];
  try {
    records = JSON.parse(fs.readFileSync(candidate.recordsFile, "utf8")) as SettlementRecord[];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, tradeDate, error: `CORRUPT_CANDIDATE_FILE: ${msg}` };
  }

  const previousArchiveHash = currentMeta?.archiveHash ?? "NONE";

  // Append to audit log
  const auditPath = path.join(storageDir, "revisions_audit.jsonl");
  const auditEntry = {
    timestamp: now.toISOString(),
    tradeDate,
    previousArchiveHash,
    promotedArchiveHash: candidateArchiveHash,
    operatorId,
    reason,
  };
  fs.appendFileSync(auditPath, JSON.stringify(auditEntry) + "\n", "utf8");

  // Update metadata to SUCCESS with promotion details
  const updatedMeta: IngestionMetadata = {
    ...candidate.metadata,
    status: "SUCCESS",
    isCandidateRevision: false,
    revisionNote: `Promoted by ${operatorId} at ${now.toISOString()}: ${reason} (replaces ${previousArchiveHash.slice(0, 12)}...)`,
  };

  saveSettlementDataset(storageDir, tradeDate, records, updatedMeta);

  return {
    success: true,
    tradeDate,
    promotedArchiveHash: candidateArchiveHash,
    previousArchiveHash,
    alreadyActive: false,
  };
}

// ── Query & Retrieval API ─────────────────────────────────────────────────────

export function getSettlementRecord(
  key: SettlementContractKey,
  options: { storageDir?: string } = {},
): SettlementRecord | null {
  const storageDir = options.storageDir ?? DEFAULT_SETTLEMENT_DIR;
  const recordsPath = path.join(storageDir, `settlement_${key.tradeDate}.json`);
  if (!fs.existsSync(recordsPath)) return null;

  try {
    const records = JSON.parse(fs.readFileSync(recordsPath, "utf8")) as SettlementRecord[];
    const targetKey = buildContractKey(key);
    return records.find((r) => buildContractKey(r) === targetKey) ?? null;
  } catch {
    return null;
  }
}

export function listSettlementRecords(
  tradeDate: string,
  options: { storageDir?: string } = {},
): SettlementRecord[] {
  const storageDir = options.storageDir ?? DEFAULT_SETTLEMENT_DIR;
  const recordsPath = path.join(storageDir, `settlement_${tradeDate}.json`);
  if (!fs.existsSync(recordsPath)) return [];

  try {
    return JSON.parse(fs.readFileSync(recordsPath, "utf8")) as SettlementRecord[];
  } catch {
    return [];
  }
}

export function hasSettlement(
  tradeDate: string,
  options: { storageDir?: string } = {},
): boolean {
  const storageDir = options.storageDir ?? DEFAULT_SETTLEMENT_DIR;
  const recordsPath = path.join(storageDir, `settlement_${tradeDate}.json`);
  return fs.existsSync(recordsPath);
}
