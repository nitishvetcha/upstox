import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  saveHistoricalCandles,
  loadHistoricalCandles,
  loadManifest,
} from "./historicalDataPipeline.ts";
import type { Candle } from "../types.ts";

test("HDP-STORE-1: Saves and loads historical candles with SHA-256 manifest verification", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hist-test-"));
  process.env.HISTORICAL_DATA_DIR = tmpDir;

  try {
    const candles: Candle[] = [
      { timestamp: "2026-11-25T04:00:00.000Z", open: 25000, high: 25050, low: 24980, close: 25020, volume: 5000 },
      { timestamp: "2026-11-25T04:15:00.000Z", open: 25020, high: 25080, low: 25010, close: 25070, volume: 6000 },
    ];

    const { manifestEntry, qualityReport } = saveHistoricalCandles("nifty", "15m", candles);
    assert.equal(manifestEntry.underlying, "nifty");
    assert.equal(manifestEntry.timeframe, "15m");
    assert.equal(manifestEntry.barCount, 2);
    assert.ok(manifestEntry.sha256.length === 64);
    assert.equal(qualityReport.totalBars, 2);

    // Verify manifest was saved
    const manifest = loadManifest();
    assert.equal(manifest.datasets.length, 1);
    assert.equal(manifest.datasets[0].sha256, manifestEntry.sha256);

    // Load and verify integrity
    const loaded = loadHistoricalCandles("nifty", "15m");
    assert.equal(loaded.verified, true);
    assert.equal(loaded.candles.length, 2);
    assert.equal(loaded.candles[0].open, 25000);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.HISTORICAL_DATA_DIR;
  }
});
