// Runs docs/INTRADAY_PROTOCOLS_I2_TO_I8.md: each hypothesis separately. Development → validation (acceptance, once) →
// holdout only if validation passes. Writes to a NEW directory; refuses to overwrite it.
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { simulateSymbol, summarise, SCENARIOS, standardGrid, type HBar, type ITrade } from "../src/lib/research/intradayHourly.ts";
import { flagsFor, relativeStrengthLeaders } from "../src/lib/research/intradayHypotheses.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const CLEAN = path.join(ROOT, ".research-data", "upstox-clean-2026-11-06-v1");
const OUT = path.join(ROOT, ".research-data", "intraday-hyp-2026-11-06");
const SPLITS = {
  development: ["2022-01-03", "2023-12-31"],
  validation: ["2024-01-01", "2025-06-30"],
  holdout: ["2025-07-01", "2026-11-05"],
} as const;
const MIN_TRADES = 100;
const HYPOTHESES = [
  { id: "I2", name: "BREAKOUT_VOLUME" },
  { id: "I3", name: "MOMENTUM_PULLBACK" },
  { id: "I4", name: "RELATIVE_STRENGTH" },
  { id: "I5", name: "OPENING_RANGE_BREAKOUT" },
  { id: "I6", name: "VWAP_RECLAIM" },
  { id: "I7", name: "MEAN_REVERSION_SIDEWAYS" },
  { id: "I8", name: "FAILED_BREAKDOWN_REVERSAL" },
] as const;

interface Doc<T> { summary: { symbol: string }; bars: T[] }

function loadUniverse() {
  const out: { symbol: string; raw: HBar[]; std: HBar[]; flagged: Set<string> }[] = [];
  for (const f of fs.readdirSync(CLEAN).sort()) {
    if (!f.startsWith("NSE_EQ_") || !f.endsWith("__1h.json")) continue;
    const hourly = JSON.parse(fs.readFileSync(path.join(CLEAN, f), "utf8")) as Doc<{ t: string; o: number; h: number; l: number; c: number; v: number }>;
    const daily = JSON.parse(fs.readFileSync(path.join(CLEAN, f.replace("__1h.json", "__1d.json")), "utf8")) as Doc<{ t: string; o: number; c: number }>;
    const flagged = new Set<string>();
    for (let i = 1; i < daily.bars.length; i++) if (Math.abs(daily.bars[i].o / daily.bars[i - 1].c - 1) > 0.35) flagged.add(daily.bars[i].t.slice(0, 10));
    const raw: HBar[] = hourly.bars.map((b) => ({ t: b.t, date: b.t.slice(0, 10), time: b.t.slice(11, 16), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
    out.push({ symbol: hourly.summary.symbol, raw, std: standardGrid(raw).bars, flagged });
  }
  return out;
}

function runSet(universe: ReturnType<typeof loadUniverse>, flagsBySymbol: Map<string, boolean[]>, scenario: keyof typeof SCENARIOS, range: readonly [string, string]) {
  const trades: ITrade[] = [];
  let excludedFlagged = 0, noEntry = 0;
  for (const u of universe) {
    const r = simulateSymbol(u.symbol, u.raw, SCENARIOS[scenario], range[0], range[1], u.flagged, flagsBySymbol.get(u.symbol));
    trades.push(...r.trades);
    excludedFlagged += r.excludedFlagged;
    noEntry += r.noEntry;
  }
  trades.sort((a, b) => a.entryAt.localeCompare(b.entryAt) || a.symbol.localeCompare(b.symbol));
  return { summary: summarise(trades), excludedFlagged, noEntry };
}

const round = (x: number | null) => (x === null ? null : Math.round(x * 10000) / 10000);
const pack = (r: ReturnType<typeof runSet>) => ({ ...r.summary, excludedFlagged: r.excludedFlagged, noEntry: r.noEntry });

function main() {
  if (fs.existsSync(OUT)) throw new Error(`${OUT} exists: protocol runs are written once and are not overwritten`);
  fs.mkdirSync(OUT, { recursive: true });
  const universe = loadUniverse();
  const h = crypto.createHash("sha256");
  for (const f of fs.readdirSync(CLEAN).sort()) if (f.startsWith("NSE_EQ_") && f.endsWith("__1h.json")) h.update(f).update(fs.readFileSync(path.join(CLEAN, f)));
  fs.writeFileSync(path.join(OUT, "protocol-provenance.json"), JSON.stringify({
    protocol: "docs/INTRADAY_PROTOCOLS_I2_TO_I8.md", inputSha256: h.digest("hex"), equities: universe.length,
    splits: SPLITS, multiplicity: `${HYPOTHESES.length} hypotheses, tested separately; all holdouts reported if more than one passes validation`,
    survivorship: "Today's constituents: an upper bound.", createdAt: new Date().toISOString(),
  }, null, 2));

  const leaders = relativeStrengthLeaders(new Map(universe.map((u) => [u.symbol, u.std])));
  const summaryRows: Record<string, unknown>[] = [];
  for (const hyp of HYPOTHESES) {
    const dir = path.join(OUT, hyp.id);
    fs.mkdirSync(dir, { recursive: true });
    const flags = new Map<string, boolean[]>();
    // Flags are computed on the standard grid; the engine re-derives the same grid, so indices line up.
    for (const u of universe) flags.set(u.symbol, flagsFor(hyp.id, u.std, leaders, u.symbol));
    // The engine uses raw bars and filters to the standard grid itself, so flags must be aligned to that grid.
    const aligned = new Map<string, boolean[]>();
    for (const u of universe) aligned.set(u.symbol, flags.get(u.symbol)!);
    const dev = { BASE: runSet(universe, aligned, "BASE", SPLITS.development), CONSERVATIVE: runSet(universe, aligned, "CONSERVATIVE", SPLITS.development) };
    fs.writeFileSync(path.join(dir, "development.json"), JSON.stringify({ hypothesis: hyp.name, range: SPLITS.development, BASE: pack(dev.BASE), CONSERVATIVE: pack(dev.CONSERVATIVE) }, null, 2));
    const val = { BASE: runSet(universe, aligned, "BASE", SPLITS.validation), CONSERVATIVE: runSet(universe, aligned, "CONSERVATIVE", SPLITS.validation) };
    const valPass = val.CONSERVATIVE.summary.trades >= MIN_TRADES && (val.CONSERVATIVE.summary.expectancyR ?? -Infinity) > 0;
    fs.writeFileSync(path.join(dir, "validation.json"), JSON.stringify({ hypothesis: hyp.name, range: SPLITS.validation, BASE: pack(val.BASE), CONSERVATIVE: pack(val.CONSERVATIVE), pass: valPass }, null, 2));
    let holdPass: boolean | null = null;
    let holdCons: number | null = null;
    if (valPass) {
      const hold = { BASE: runSet(universe, aligned, "BASE", SPLITS.holdout), CONSERVATIVE: runSet(universe, aligned, "CONSERVATIVE", SPLITS.holdout) };
      holdCons = hold.CONSERVATIVE.summary.expectancyR;
      holdPass = hold.CONSERVATIVE.summary.trades >= MIN_TRADES && (hold.CONSERVATIVE.summary.expectancyR ?? -Infinity) > 0;
      fs.writeFileSync(path.join(dir, "holdout.json"), JSON.stringify({ hypothesis: hyp.name, range: SPLITS.holdout, BASE: pack(hold.BASE), CONSERVATIVE: pack(hold.CONSERVATIVE), pass: holdPass }, null, 2));
    } else {
      fs.writeFileSync(path.join(dir, "holdout.json"), JSON.stringify({ status: "NOT OPENED", reason: "validation failed" }, null, 2));
    }
    const row = {
      id: hyp.id, name: hyp.name,
      dev: { trades: dev.CONSERVATIVE.summary.trades, baseExpR: round(dev.BASE.summary.expectancyR), consExpR: round(dev.CONSERVATIVE.summary.expectancyR) },
      val: { trades: val.CONSERVATIVE.summary.trades, baseExpR: round(val.BASE.summary.expectancyR), consExpR: round(val.CONSERVATIVE.summary.expectancyR), pass: valPass },
      holdout: holdPass === null ? "NOT OPENED" : { consExpR: round(holdCons), pass: holdPass },
    };
    summaryRows.push(row);
    console.log(JSON.stringify(row));
  }
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ createdAt: new Date().toISOString(), rows: summaryRows }, null, 2));
  console.log("summary written");
}

main();
