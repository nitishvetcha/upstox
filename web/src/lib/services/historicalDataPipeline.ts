// Phase 2 — Free Historical Data Pipeline & Ingestion Store
// Stores and verifies historical underlying candles and Bhavcopy EOD datasets.
// Ensures datasets are immutable, cryptographically hashed, and verified for replay readiness.

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { Candle, UnderlyingId, Timeframe } from "../types.ts";
import { assessDataQuality, type DataQualityReport } from "./historicalDataQuality.ts";

export interface HistoricalManifestEntry {
  underlying: UnderlyingId;
  timeframe: Timeframe;
  filePath: string;
  barCount: number;
  startDate: string | null;
  endDate: string | null;
  sha256: string;
  qualityScore: number;
  isReplayReady: boolean;
  ingestedAt: string;
}

export interface HistoricalManifest {
  version: "1.0.0";
  lastUpdated: string;
  datasets: HistoricalManifestEntry[];
}

const defaultDataDir = () => process.env.HISTORICAL_DATA_DIR ?? path.join(process.cwd(), ".data", "historical-bars");

export function getHistoricalDataDir(): string {
  return defaultDataDir();
}

function getManifestPath(): string {
  return path.join(getHistoricalDataDir(), "manifest.json");
}

export function loadManifest(): HistoricalManifest {
  try {
    const p = getManifestPath();
    if (!fs.existsSync(p)) {
      return { version: "1.0.0", lastUpdated: new Date().toISOString(), datasets: [] };
    }
    return JSON.parse(fs.readFileSync(p, "utf8")) as HistoricalManifest;
  } catch {
    return { version: "1.0.0", lastUpdated: new Date().toISOString(), datasets: [] };
  }
}

export function saveManifest(manifest: HistoricalManifest): void {
  const dir = getHistoricalDataDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getManifestPath(), JSON.stringify(manifest, null, 2), "utf8");
}

/**
 * Saves a validated candle series with atomic write and SHA-256 fingerprinting.
 */
export function saveHistoricalCandles(
  underlying: UnderlyingId,
  timeframe: Timeframe,
  candles: Candle[],
): { manifestEntry: HistoricalManifestEntry; qualityReport: DataQualityReport } {
  const baseDir = getHistoricalDataDir();
  const underlyingDir = path.join(baseDir, underlying);
  fs.mkdirSync(underlyingDir, { recursive: true });

  const qualityReport = assessDataQuality(candles, underlying, timeframe);
  const jsonContent = JSON.stringify(candles, null, 2);
  const hash = crypto.createHash("sha256").update(jsonContent).digest("hex");

  const targetFile = path.join(underlyingDir, `${timeframe}.json`);
  const tempFile = path.join(underlyingDir, `${timeframe}.tmp.${Date.now()}`);

  fs.writeFileSync(tempFile, jsonContent, "utf8");
  fs.renameSync(tempFile, targetFile);

  const manifest = loadManifest();
  const entry: HistoricalManifestEntry = {
    underlying,
    timeframe,
    filePath: path.relative(baseDir, targetFile),
    barCount: candles.length,
    startDate: qualityReport.startDate,
    endDate: qualityReport.endDate,
    sha256: hash,
    qualityScore: qualityReport.qualityScore,
    isReplayReady: qualityReport.isReplayReady,
    ingestedAt: new Date().toISOString(),
  };

  // Replace or append entry in manifest
  const idx = manifest.datasets.findIndex((d) => d.underlying === underlying && d.timeframe === timeframe);
  if (idx >= 0) {
    manifest.datasets[idx] = entry;
  } else {
    manifest.datasets.push(entry);
  }
  manifest.lastUpdated = new Date().toISOString();
  saveManifest(manifest);

  return { manifestEntry: entry, qualityReport };
}

/**
 * Loads historical candles from disk and verifies SHA-256 checksum against manifest.
 */
export function loadHistoricalCandles(
  underlying: UnderlyingId,
  timeframe: Timeframe,
): { candles: Candle[]; verified: boolean } {
  const baseDir = getHistoricalDataDir();
  const targetFile = path.join(baseDir, underlying, `${timeframe}.json`);

  if (!fs.existsSync(targetFile)) {
    return { candles: [], verified: false };
  }

  const content = fs.readFileSync(targetFile, "utf8");
  const actualHash = crypto.createHash("sha256").update(content).digest("hex");

  const manifest = loadManifest();
  const entry = manifest.datasets.find((d) => d.underlying === underlying && d.timeframe === timeframe);

  const verified = entry ? entry.sha256 === actualHash : false;
  const candles = JSON.parse(content) as Candle[];

  return { candles, verified };
}
