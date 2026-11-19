// Market Data Collector — Module 12: Deterministic Replay Engine for Research
// Implements WBS 4.4 / 1.5 and complies with COLLECTOR_ARCHITECTURE_SPECIFICATION.md.

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { DataGapRecord } from "./collectorTypes.ts";
import type { ParquetRowRecord } from "./storageManager.ts";

export interface ReplaySessionOptions {
  sessionDir: string;
  speedMultiplier?: number; // 0 = unthrottled, 1 = 1x real-time
}

export class ReplayEngine {
  private sessionDir: string;
  private rows: ParquetRowRecord[] = [];
  private gaps: DataGapRecord[] = [];

  constructor(sessionDir: string) {
    this.sessionDir = sessionDir;
    this.loadSession();
  }

  private loadSession(): void {
    const segments = ["options", "futures", "spot", "late"];
    const allRows: ParquetRowRecord[] = [];

    for (const seg of segments) {
      const segFile = path.join(this.sessionDir, `segment=${seg}`, "part-0000.data");
      if (fs.existsSync(segFile)) {
        const lines = fs.readFileSync(segFile, "utf8").trim().split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          allRows.push(JSON.parse(line));
        }
      }
    }

    // Sort deterministically by local_receipt_mono_ns (or local_receipt_utc_ms)
    allRows.sort((a, b) => {
      const aNs = BigInt(a.local_receipt_mono_ns);
      const bNs = BigInt(b.local_receipt_mono_ns);
      if (aNs < bNs) return -1;
      if (aNs > bNs) return 1;
      return a.event_id.localeCompare(b.event_id);
    });

    this.rows = allRows;

    // Load gaps
    const gapsPath = path.join(this.sessionDir, "GAPS.jsonl");
    if (fs.existsSync(gapsPath)) {
      const lines = fs.readFileSync(gapsPath, "utf8").trim().split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        this.gaps.push(JSON.parse(line));
      }
    }
  }

  public getRowCount(): number {
    return this.rows.length;
  }

  public getGaps(): ReadonlyArray<DataGapRecord> {
    return this.gaps;
  }

  /**
   * Replays all rows deterministically, computing an aggregate execution digest.
   */
  public replayAll(onEvent?: (row: ParquetRowRecord, idx: number) => void): {
    totalEvents: number;
    gapsCount: number;
    streamSha256: string;
  } {
    const hasher = createHash("sha256");
    let count = 0;

    for (const row of this.rows) {
      if (onEvent) onEvent(row, count);
      hasher.update(`${row.event_id}:${row.instrument_key}:${row.ltp ?? ""}:${row.local_receipt_mono_ns}\n`);
      count++;
    }

    return {
      totalEvents: count,
      gapsCount: this.gaps.length,
      streamSha256: hasher.digest("hex"),
    };
  }
}
