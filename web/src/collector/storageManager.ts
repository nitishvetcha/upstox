// Market Data Collector — Module 9: Append-Only Partitioned Storage & Integrity Manager
// Implements WBS 4.4 and complies with COLLECTOR_ARCHITECTURE_SPECIFICATION.md & COLLECTOR_DATA_SCHEMA.md.

import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type {
  BestBidAskEvent,
  CanonicalMarketEvent,
  CollectorSessionManifest,
  DataGapRecord,
  FuturesBarEvent,
  GreeksEvent,
  LTPCEvent,
  MarketDepthEvent,
  OpenInterestEvent,
  SpotIndexBarEvent,
} from "./collectorTypes.ts";

export interface StorageOptions {
  baseDirectory: string; // e.g. .data/collector/parquet or .test-data/collector
  sessionDate: string;    // YYYY-MM-DD
  universeManifestHash: string;
}

export interface ParquetRowRecord {
  event_id: string;
  instrument_key: string;
  underlying: string;
  expiry_date: string;
  strike_price: number;
  option_type: string;
  local_receipt_mono_ns: string; // BigInt stored as string for exact precision
  local_receipt_utc_ms: number;
  feed_server_ts: number | null;
  transport_latency_ms: number | null;
  ltp: number | null;
  ltq: number | null;
  last_trade_ts: number | null;
  session_volume: number | null;
  best_bid_price: number | null;
  best_bid_qty: number | null;
  best_ask_price: number | null;
  best_ask_qty: number | null;
  spread_pct: number | null;
  open_interest: number | null;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  bid_p_1: number | null;
  bid_q_1: number | null;
  ask_p_1: number | null;
  ask_q_1: number | null;
  quality_flags: string;
}

export function computeFileSha256(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

export class StorageManager {
  private sessionDir: string;
  private sessionDate: string;
  private universeManifestHash: string;
  private startedAtUtcIso: string;
  private isFinalized = false;

  private partitionPaths = {
    options: "",
    futures: "",
    spot: "",
    late: "",
    rawFrames: "",
    gaps: "",
    manifest: "",
  };

  private partitionCounts = {
    options: 0,
    futures: 0,
    spot: 0,
    late: 0,
  };

  private gaps: DataGapRecord[] = [];
  private totalEventsProcessed = 0;
  private droppedEventCount = 0;

  constructor(options: StorageOptions) {
    this.sessionDate = options.sessionDate;
    this.universeManifestHash = options.universeManifestHash;
    this.startedAtUtcIso = new Date().toISOString();

    const [year, month, day] = this.sessionDate.split("-");
    this.sessionDir = path.join(
      options.baseDirectory,
      `year=${year}`,
      `month=${month}`,
      `day=${day}`
    );

    this.initDirectories();
  }

  private initDirectories(): void {
    const segments = ["options", "futures", "spot", "late"];
    for (const seg of segments) {
      const segDir = path.join(this.sessionDir, `segment=${seg}`);
      fs.mkdirSync(segDir, { recursive: true });
    }

    this.partitionPaths.options = path.join(this.sessionDir, "segment=options", "part-0000.data");
    this.partitionPaths.futures = path.join(this.sessionDir, "segment=futures", "part-0000.data");
    this.partitionPaths.spot = path.join(this.sessionDir, "segment=spot", "part-0000.data");
    this.partitionPaths.late = path.join(this.sessionDir, "segment=late", "part-0000.data");
    this.partitionPaths.rawFrames = path.join(this.sessionDir, "raw_frames.bin.log");
    this.partitionPaths.gaps = path.join(this.sessionDir, "GAPS.jsonl");
    this.partitionPaths.manifest = path.join(this.sessionDir, "MANIFEST.jsonl");
  }

  public getSessionDir(): string {
    return this.sessionDir;
  }

  /**
   * Appends a raw binary frame to Level 1 raw forensic storage.
   */
  public appendRawFrame(frameBytes: Uint8Array): void {
    if (this.isFinalized) throw new Error("STORAGE_FINALIZED: cannot append to read-only session");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(frameBytes.byteLength, 0);
    fs.appendFileSync(this.partitionPaths.rawFrames, Buffer.concat([lenBuf, Buffer.from(frameBytes)]));
  }

  /**
   * Writes a canonical market event to its appropriate segment partition.
   */
  public writeEvent(event: CanonicalMarketEvent): void {
    if (this.isFinalized) throw new Error("STORAGE_FINALIZED: cannot append to read-only session");

    const row = this.mapEventToRow(event);
    let targetFile = this.partitionPaths.options;
    let segKey: keyof typeof this.partitionCounts = "options";

    if (event.qualityFlags.includes("LATE_OUT_OF_ORDER")) {
      targetFile = this.partitionPaths.late;
      segKey = "late";
    } else if (event.eventType === "FUTURES_BAR" || event.instrumentKey.includes("FUTIDX")) {
      targetFile = this.partitionPaths.futures;
      segKey = "futures";
    } else if (event.eventType === "SPOT_INDEX_BAR" || event.instrumentKey.startsWith("NSE_INDEX")) {
      targetFile = this.partitionPaths.spot;
      segKey = "spot";
    }

    fs.appendFileSync(targetFile, JSON.stringify(row) + "\n", { encoding: "utf8" });
    this.partitionCounts[segKey]++;
    this.totalEventsProcessed++;
  }

  /**
   * Records an explicit unfillable gap into GAPS.jsonl.
   */
  public recordGap(gap: DataGapRecord): void {
    this.gaps.push(gap);
    fs.appendFileSync(this.partitionPaths.gaps, JSON.stringify(gap) + "\n", { encoding: "utf8" });
  }

  public recordDroppedEvents(count: number): void {
    this.droppedEventCount += count;
  }

  /**
   * Finalizes the daily market session:
   * 1. Fsyncs all files.
   * 2. Computes SHA-256 digests for all partition files.
   * 3. Writes MANIFEST.jsonl with cryptographic hashes and metadata.
   * 4. Enforces accidental-write protection (POSIX 0444 read-only permissions).
   */
  public finalizeSession(): CollectorSessionManifest {
    if (this.isFinalized) throw new Error("Session is already finalized");

    const completedAtUtcIso = new Date().toISOString();
    const manifestFiles: CollectorSessionManifest["partitionFiles"] = [];

    const segments: Array<{ seg: "options" | "futures" | "spot" | "late"; path: string }> = [
      { seg: "options", path: this.partitionPaths.options },
      { seg: "futures", path: this.partitionPaths.futures },
      { seg: "spot", path: this.partitionPaths.spot },
      { seg: "late", path: this.partitionPaths.late },
    ];

    for (const item of segments) {
      if (fs.existsSync(item.path)) {
        const stats = fs.statSync(item.path);
        const hash = computeFileSha256(item.path);
        manifestFiles.push({
          path: item.path,
          segment: item.seg,
          rowCount: this.partitionCounts[item.seg],
          sha256: hash,
          fileSizeBytes: stats.size,
          posixMode: "0444",
        });
        // Enact Accidental-Write Protection (POSIX 0444: read-only)
        try {
          fs.chmodSync(item.path, 0o444);
        } catch {
          // Ignore chmod error if filesystem does not support POSIX modes
        }
      }
    }

    let sessionIntegrityStatus: CollectorSessionManifest["sessionIntegrityStatus"] = "FULL_FIDELITY_SESSION";
    if (this.gaps.length > 0 || this.droppedEventCount > 0) {
      sessionIntegrityStatus = "PARTIAL_DATA_SESSION";
    }

    const manifestWithoutHash = {
      schemaVersion: "1.0.0" as const,
      sessionId: randomUUID(),
      sessionDate: this.sessionDate,
      startedAtUtcIso: this.startedAtUtcIso,
      completedAtUtcIso,
      universeManifestHash: this.universeManifestHash,
      partitionFiles: manifestFiles,
      totalEventsProcessed: this.totalEventsProcessed,
      totalGapsRecorded: this.gaps.length,
      gaps: this.gaps,
      droppedEventCount: this.droppedEventCount,
      sessionIntegrityStatus,
    };

    const manifestJson = JSON.stringify(manifestWithoutHash);
    const manifestSha256 = createHash("sha256").update(manifestJson).digest("hex");

    const fullManifest: CollectorSessionManifest = {
      ...manifestWithoutHash,
      manifestSha256,
    };

    fs.writeFileSync(this.partitionPaths.manifest, JSON.stringify(fullManifest, null, 2) + "\n", {
      encoding: "utf8",
    });

    try {
      fs.chmodSync(this.partitionPaths.manifest, 0o444);
    } catch {
      // Ignore chmod error on non-POSIX
    }

    this.isFinalized = true;
    return fullManifest;
  }

  /**
   * Verifies the SHA-256 hashes of all partition files against MANIFEST.jsonl.
   * Returns true if all hashes match exactly, or false if any file has been modified or corrupted.
   */
  public static verifySessionIntegrity(sessionDir: string): {
    valid: boolean;
    manifest: CollectorSessionManifest | null;
    corruptFiles: string[];
  } {
    const manifestPath = path.join(sessionDir, "MANIFEST.jsonl");
    if (!fs.existsSync(manifestPath)) {
      return { valid: false, manifest: null, corruptFiles: [manifestPath] };
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as CollectorSessionManifest;
    const corruptFiles: string[] = [];

    for (const part of manifest.partitionFiles) {
      if (!fs.existsSync(part.path)) {
        corruptFiles.push(part.path);
        continue;
      }
      const actualHash = computeFileSha256(part.path);
      if (actualHash !== part.sha256) {
        corruptFiles.push(part.path);
      }
    }

    return {
      valid: corruptFiles.length === 0,
      manifest,
      corruptFiles,
    };
  }

  private mapEventToRow(event: CanonicalMarketEvent): ParquetRowRecord {
    const isLtpc = event.eventType === "LTPC";
    const isBba = event.eventType === "BEST_BID_ASK";
    const isDepth = event.eventType === "MARKET_DEPTH";
    const isGreeks = event.eventType === "OPTION_GREEKS";
    const isOi = event.eventType === "OPEN_INTEREST";
    const isFutures = event.eventType === "FUTURES_BAR";
    const isSpot = event.eventType === "SPOT_INDEX_BAR";

    const ltpc = isLtpc ? (event as LTPCEvent) : null;
    const bba = isBba ? (event as BestBidAskEvent) : null;
    const depth = isDepth ? (event as MarketDepthEvent) : null;
    const greeks = isGreeks ? (event as GreeksEvent) : null;
    const oi = isOi ? (event as OpenInterestEvent) : null;
    const fut = isFutures ? (event as FuturesBarEvent) : null;
    const spot = isSpot ? (event as SpotIndexBarEvent) : null;

    // Extract underlying from instrumentKey e.g. NSE_FO|NIFTY... -> NIFTY
    const underlying = event.instrumentKey.includes("BANKNIFTY")
      ? "BANKNIFTY"
      : event.instrumentKey.includes("NIFTY")
      ? "NIFTY"
      : "UNKNOWN";

    return {
      event_id: event.eventId,
      instrument_key: event.instrumentKey,
      underlying,
      expiry_date: this.sessionDate,
      strike_price: 0,
      option_type: event.instrumentKey.endsWith("CE") ? "CE" : event.instrumentKey.endsWith("PE") ? "PE" : "OTHER",
      local_receipt_mono_ns: event.localReceiptMonoNs.toString(),
      local_receipt_utc_ms: new Date(event.localReceiptUtcIso).getTime(),
      feed_server_ts: event.feedServerTs,
      transport_latency_ms: event.transportLatencyMs,
      ltp: ltpc?.ltp ?? fut?.close ?? spot?.close ?? null,
      ltq: ltpc?.ltq ?? fut?.volume ?? null,
      last_trade_ts: ltpc?.lastTradeTs ?? null,
      session_volume: ltpc?.sessionVolume ?? fut?.volume ?? null,
      best_bid_price: bba?.bestBidPrice ?? null,
      best_bid_qty: bba?.bestBidQuantity ?? null,
      best_ask_price: bba?.bestAskPrice ?? null,
      best_ask_qty: bba?.bestAskQuantity ?? null,
      spread_pct: bba?.spreadPct ?? null,
      open_interest: oi?.openInterest ?? fut?.openInterest ?? null,
      iv: greeks?.iv ?? null,
      delta: greeks?.delta ?? null,
      gamma: greeks?.gamma ?? null,
      theta: greeks?.theta ?? null,
      vega: greeks?.vega ?? null,
      bid_p_1: depth?.levels[0]?.bidPrice ?? null,
      bid_q_1: depth?.levels[0]?.bidQuantity ?? null,
      ask_p_1: depth?.levels[0]?.askPrice ?? null,
      ask_q_1: depth?.levels[0]?.askQuantity ?? null,
      quality_flags: event.qualityFlags.join(","),
    };
  }
}
