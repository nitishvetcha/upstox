// Keeps only the newest `keep` run-log files for one kind of run (e.g. "run_" or "mon_"). Other files are never touched.
// Run files are named <prefix><ms timestamp>_<suffix>.json, so sorting by the timestamp is chronological.
import * as fs from "node:fs";
import * as path from "node:path";

// `keepNewestExtra` (optional) names one older file to keep beyond the newest `keep`: the first match, newest first.
export function pruneRunFiles(dir: string, prefix: string, keep = 200, keepNewestExtra?: (file: string) => boolean): void {
  const pattern = new RegExp(`^${prefix}(\\d+)_[A-Za-z0-9]+\\.json$`);
  let runs: { name: string; at: number }[];
  try {
    runs = fs.readdirSync(dir).flatMap((name) => {
      const m = pattern.exec(name);
      return m ? [{ name, at: Number(m[1]) }] : [];
    });
  } catch {
    return; // directory missing or unreadable: nothing to prune
  }
  if (runs.length <= keep) return;
  runs.sort((a, b) => b.at - a.at || (a.name < b.name ? 1 : -1)); // newest first, name breaks ties
  const older = runs.slice(keep);
  const extra = keepNewestExtra ? older.find((r) => keepNewestExtra(path.join(dir, r.name))) : undefined;
  for (const r of older) {
    if (r === extra) continue;
    try { fs.unlinkSync(path.join(dir, r.name)); } catch { /* retried on the next save */ }
  }
}
