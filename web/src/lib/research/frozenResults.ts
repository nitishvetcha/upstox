// Read-only summaries of frozen research artifacts. Never recomputes or rewrites them.
import fs from "node:fs";
import path from "node:path";
import { dataRoot } from "../dataRoot.ts";

const cache = new Map<string, { mtime: number; value: unknown }>();
// Callers pass fully literal paths so the bundler does not trace the whole .data folder.
function readSummary<T>(file: string, pick: (d: Record<string, unknown>) => T): { value: T | null; file: string; error: string | null } {
  const rel = path.relative(process.cwd(), file);
  try {
    const mtime = fs.statSync(file).mtimeMs;
    const hit = cache.get(file);
    if (hit && hit.mtime === mtime) return { value: hit.value as T, file: rel, error: null };
    const value = pick(JSON.parse(fs.readFileSync(file, "utf8")));
    cache.set(file, { mtime, value });
    return { value, file: rel, error: null };
  } catch (e) {
    return { value: null, file: rel, error: (e as NodeJS.ErrnoException).code === "ENOENT" ? "not found" : "unreadable" };
  }
}

export interface GroupLike { trades: number; sessions: number; meanNetR: number | null; ci95: [number, number] | null; profitFactor: number | null; winRate: number | null; cumulativeR: number; maxDrawdownR: number; meanCostR: number | null; verdict: string }
export interface ReplayPeriod { from: string; to: string; combined: GroupLike; long: GroupLike; short: GroupLike; grossMeanR: number | null; exits: Record<string, number> }

export const intradayReplay = () => readSummary(path.join(dataRoot(), "intraday-replay", "RESULT_intraday-replay-1.json"), (d) => ({
  version: d.version as string, strategy: d.strategy as string, range: d.range as { FROM: string; TO: string },
  sessionsReplayed: d.sessionsReplayed as number, development: d.development as ReplayPeriod, validation: d.validation as ReplayPeriod,
  byYear: d.byYear as Record<string, { trades: number; sessions: number; meanNetR: number; meanGrossR: number }>,
  dataValidation: d.dataValidation as Record<string, unknown>,
}));

export const positionalV1 = () => readSummary(path.join(dataRoot(), "positional-backtest", "BASELINE_positional-v1_frozen.json"), (d) => ({
  from: d.from as string, to: d.to as string, stats: d.stats as Record<string, number | null>, benchmark: d.benchmark as Record<string, number>, caveats: d.caveats as string[],
}));

export const positionalV2Dev = () => readSummary(path.join(dataRoot(), "positional-v2", "DEVELOPMENT_result.json"), (d) => ({
  from: d.from as string, to: d.to as string, stats: d.stats as Record<string, number | null>, gates: d.gates as Record<string, boolean>, caveats: d.caveats as string[],
}));
