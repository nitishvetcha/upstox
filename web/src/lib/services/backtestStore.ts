import fs from "node:fs";
import path from "node:path";
import type { BacktestResult } from "../backtestTypes.ts";

// The single source of truth for completed backtest runs. Kept on globalThis because Next can load this module once
// per route bundle; /api/backtest/* and /api/performance/* must share it. Persisted to .data/backtests/<runId>.json
// so completed runs (e.g. Phase 10 Runs A–D) survive a server restart. Run IDs are deterministic, so a re-run of the
// same inputs overwrites the same file.
const DIR = path.join(process.cwd(), ".data", "backtests");
const g = globalThis as typeof globalThis & { __backtestRuns?: Map<string, BacktestResult> };

function store(): Map<string, BacktestResult> {
  if (g.__backtestRuns) return g.__backtestRuns;
  const m = new Map<string, BacktestResult>();
  try {
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as BacktestResult;
        m.set(r.runId, r);
      } catch {
        // unreadable file: skipped, never fabricated
      }
    }
  } catch {
    // no directory yet
  }
  return (g.__backtestRuns = m);
}

export function saveBacktestRun(result: BacktestResult): void {
  store().set(result.runId, result);
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(path.join(DIR, `${result.runId.replace(/[^\w-]/g, "")}.json`), JSON.stringify(result));
  } catch {
    // persistence is best-effort; the in-memory run is still available
  }
}

export function getBacktestRun(runId: string): BacktestResult | undefined {
  return store().get(runId);
}

export function getAllBacktestRuns(): BacktestResult[] {
  return [...store().values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.runId.localeCompare(b.runId));
}
