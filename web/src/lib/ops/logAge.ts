// Age classification for runner and server log files shown on System Health.
// A log is CURRENT only if it was written within the last 24 hours. Older files are STALE and must not be read as current state.
import fs from "node:fs";

export const LOG_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const ISO_TS = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;

export interface LogAgeInfo {
  writtenAt: string;
  ageHours: number;
  latestRecordAt: string | null;
  status: "CURRENT" | "STALE";
}

export function classifyLogAge(writtenAtMs: number, lines: string[], now = Date.now()): LogAgeInfo {
  const ageMs = Math.max(0, now - writtenAtMs);
  const stamps = [...lines.join("\n").matchAll(ISO_TS)].map((m) => m[0]);
  return {
    writtenAt: new Date(writtenAtMs).toISOString(),
    ageHours: Math.round((ageMs / 3600000) * 10) / 10,
    latestRecordAt: stamps.length ? stamps[stamps.length - 1] : null,
    status: ageMs > LOG_STALE_AFTER_MS ? "STALE" : "CURRENT",
  };
}

export function logAgeInfo(file: string, lines: string[], now = Date.now()): LogAgeInfo | null {
  if (!fs.existsSync(file)) return null;
  return classifyLogAge(fs.statSync(file).mtime.getTime(), lines, now);
}
