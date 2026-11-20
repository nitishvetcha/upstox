// Development-only replication on the verified broad NSE equity store.
// This is deliberately NOT a validation or live-trading runner: the universe contains
// only securities present at collection time, so it has survivorship bias.
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { CANDIDATES, SCENARIOS, simulateSymbol, summarise, type DBar, type Candidate, type Trade } from "../src/lib/research/dailyEquity.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, ".research-data", "upstox-daily-universe-verified-2026-11-08");
const OUT = path.join(ROOT, ".research-data", "daily-equity-verified-development-2026-11-20");
const RANGE = ["2000-01-01", "2015-12-31"] as const;

type SourceBar = [string, number, number, number, number, number];
type SourceSeries = { key: string; symbol: string; interval: "1d"; bars: SourceBar[] };

function fileName(key: string) { return `${key.replace(/[^A-Za-z0-9]+/g, "_")}__1d.json`; }

function toBars(source: SourceSeries, calendar: Set<string>): DBar[] {
  const seen = new Set<string>();
  const bars: DBar[] = [];
  for (const row of source.bars) {
    const [t, o, h, l, c, v] = row;
    const date = t?.slice(0, 10);
    if (!date || !calendar.has(date)) continue; // pre-verified NSE session set; remove non-session prints.
    if (seen.has(date)) throw new Error(`${source.symbol}: duplicate calendar date ${date}`);
    if (![o, h, l, c, v].every(Number.isFinite) || o <= 0 || h <= 0 || l <= 0 || c <= 0 || v < 0 || h < Math.max(o, c, l) || l > Math.min(o, c, h)) {
      throw new Error(`${source.symbol}: invalid OHLCV on ${date}`);
    }
    seen.add(date);
    bars.push({ t, date, o, h, l, c, v });
  }
  for (let i = 1; i < bars.length; i++) if (bars[i].date <= bars[i - 1].date) throw new Error(`${source.symbol}: non-increasing dates`);
  return bars;
}

function runSet(universe: { symbol: string; bars: DBar[] }[], cand: Candidate, scenario: keyof typeof SCENARIOS) {
  const trades: Trade[] = [];
  let excludedJump = 0, truncated = 0;
  for (const u of universe) {
    const r = simulateSymbol(u.symbol, u.bars, cand, SCENARIOS[scenario], RANGE[0], RANGE[1]);
    trades.push(...r.trades); excludedJump += r.excludedJump; truncated += r.truncated;
  }
  trades.sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.symbol.localeCompare(b.symbol));
  return { ...summarise(trades), excludedByJump: excludedJump, truncated };
}

function main() {
  if (fs.existsSync(OUT)) throw new Error(`${OUT} already exists; this development run is immutable`);
  const verification = JSON.parse(fs.readFileSync(path.join(SOURCE, "verification.json"), "utf8")) as Record<string, unknown>;
  if (verification.validFiles !== verification.expectedFiles || verification.missingFiles instanceof Array && verification.missingFiles.length) throw new Error("verified source is incomplete");
  const coverage = JSON.parse(fs.readFileSync(path.join(SOURCE, "coverage.json"), "utf8")) as { series: { key: string; symbol: string }[] };
  const calendar = new Set((JSON.parse(fs.readFileSync(path.join(SOURCE, "calendar.json"), "utf8")) as { sessions: string[] }).sessions);
  const digest = crypto.createHash("sha256");
  const universe: { symbol: string; bars: DBar[] }[] = [];
  let skippedShortHistory = 0, skippedInvalidSeries = 0;
  for (const item of coverage.series) {
    const sourceFile = path.join(SOURCE, "series", fileName(item.key));
    const raw = fs.readFileSync(sourceFile);
    digest.update(item.key).update(raw);
    const doc = JSON.parse(raw.toString("utf8")) as SourceSeries;
    if (doc.key !== item.key || doc.symbol !== item.symbol || doc.interval !== "1d") throw new Error(`metadata mismatch in ${sourceFile}`);
    let bars: DBar[];
    try {
      bars = toBars(doc, calendar);
    } catch {
      // Do not deduplicate or repair a provider record. Excluding it is the only
      // causal choice until the source manifest itself is corrected.
      skippedInvalidSeries++;
      continue;
    }
    // 200 SMA + ATR/Donchian warmup require substantial prior history; no interpolation is allowed.
    if (bars.filter((b) => b.date <= RANGE[1]).length < 252) { skippedShortHistory++; continue; }
    universe.push({ symbol: item.symbol, bars });
  }
  fs.mkdirSync(OUT, { recursive: true });
  const result = {
    status: "EXPLORATORY_DEVELOPMENT_ONLY",
    scope: "Replicates pre-existing daily candidates on the verified broad current-equity universe. Validation and holdout are intentionally not opened by this script.",
    data: {
      source: path.relative(ROOT, SOURCE), sourceSha256: digest.digest("hex"), sourceVerification: {
        expectedFiles: verification.expectedFiles, validFiles: verification.validFiles, rawCandlesTotal: verification.rawCandlesTotal, calendar: verification.calendar,
      },
      calendarSessionsUsed: calendar.size, equitiesInCoverage: coverage.series.length, eligibleEquities: universe.length, skippedShortHistory, skippedInvalidSeries,
      survivorshipWarning: "Current listed names only; delisted names and point-in-time membership are unavailable. Results cannot validate a deployable stock-selection strategy.",
    },
    range: RANGE,
    candidates: CANDIDATES.map((candidate) => ({ candidate: candidate.id, BASE: runSet(universe, candidate, "BASE"), CONSERVATIVE: runSet(universe, candidate, "CONSERVATIVE") })),
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUT, "development.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, eligibleEquities: universe.length, candidates: result.candidates.map((x) => ({ candidate: x.candidate, conservativeExpectancyR: x.CONSERVATIVE.expectancyR, conservativeTrades: x.CONSERVATIVE.trades })) }, null, 2));
}

main();
