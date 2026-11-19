// Runs docs/INTRADAY_PROTOCOL_I1_TREND_CONTINUATION.md exactly. Writes to a NEW directory and refuses to overwrite one.
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { simulateSymbol, summarise, SCENARIOS, type HBar, type ITrade } from "../src/lib/research/intradayHourly.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const CLEAN = path.join(ROOT, ".research-data", "upstox-clean-2026-11-06-v1");
const OUT = path.join(ROOT, ".research-data", "intraday-i1-protocol-2026-11-06");
const SPLITS = {
  development: ["2022-01-03", "2023-12-31"],
  validation: ["2024-01-01", "2025-06-30"],
  holdout: ["2025-07-01", "2026-11-05"],
} as const;
const MIN_TRADES = 100;

interface Doc<T> { summary: { symbol: string }; bars: T[] }

function loadUniverse() {
  const out: { symbol: string; key: string; bars: HBar[]; flagged: Set<string> }[] = [];
  for (const f of fs.readdirSync(CLEAN).sort()) {
    if (!f.startsWith("NSE_EQ_") || !f.endsWith("__1h.json")) continue;
    const hourly = JSON.parse(fs.readFileSync(path.join(CLEAN, f), "utf8")) as Doc<{ t: string; o: number; h: number; l: number; c: number; v: number }>;
    const daily = JSON.parse(fs.readFileSync(path.join(CLEAN, f.replace("__1h.json", "__1d.json")), "utf8")) as Doc<{ t: string; o: number; c: number }>;
    const flagged = new Set<string>();
    for (let i = 1; i < daily.bars.length; i++) {
      if (Math.abs(daily.bars[i].o / daily.bars[i - 1].c - 1) > 0.35) flagged.add(daily.bars[i].t.slice(0, 10));
    }
    const bars: HBar[] = hourly.bars.map((b) => ({ t: b.t, date: b.t.slice(0, 10), time: b.t.slice(11, 16), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
    out.push({ symbol: hourly.summary.symbol, key: f, bars, flagged });
  }
  return out;
}

function runSet(universe: ReturnType<typeof loadUniverse>, scenario: keyof typeof SCENARIOS, range: readonly [string, string]) {
  const trades: ITrade[] = [];
  let excludedFlagged = 0, noEntry = 0;
  for (const u of universe) {
    const r = simulateSymbol(u.symbol, u.bars, SCENARIOS[scenario], range[0], range[1], u.flagged);
    trades.push(...r.trades);
    excludedFlagged += r.excludedFlagged;
    noEntry += r.noEntry;
  }
  trades.sort((a, b) => a.entryAt.localeCompare(b.entryAt) || a.symbol.localeCompare(b.symbol));
  const byYear: Record<string, number> = {};
  for (const t of trades) {
    const y = t.session.slice(0, 4);
    byYear[y] = (byYear[y] ?? 0) + 1;
  }
  return { summary: summarise(trades), excludedFlagged, noEntry, tradesByYear: byYear };
}

const round = (x: number | null) => (x === null ? null : Math.round(x * 10000) / 10000);

function main() {
  if (fs.existsSync(OUT)) throw new Error(`${OUT} exists: a protocol run is written once and is not overwritten`);
  fs.mkdirSync(OUT, { recursive: true });
  const universe = loadUniverse();
  const h = crypto.createHash("sha256");
  for (const f of fs.readdirSync(CLEAN).sort()) if (f.startsWith("NSE_EQ_") && f.endsWith("__1h.json")) h.update(f).update(fs.readFileSync(path.join(CLEAN, f)));
  fs.writeFileSync(path.join(OUT, "protocol-provenance.json"), JSON.stringify({
    protocol: "docs/INTRADAY_PROTOCOL_I1_TREND_CONTINUATION.md",
    inputDirectory: path.relative(ROOT, CLEAN), inputSha256: h.digest("hex"), equities: universe.length,
    splits: SPLITS, survivorship: "Today's constituents: an upper bound.", createdAt: new Date().toISOString(),
  }, null, 2));

  const dev = { BASE: runSet(universe, "BASE", SPLITS.development), CONSERVATIVE: runSet(universe, "CONSERVATIVE", SPLITS.development) };
  fs.writeFileSync(path.join(OUT, "development.json"), JSON.stringify({ range: SPLITS.development, BASE: { ...dev.BASE.summary, excludedFlagged: dev.BASE.excludedFlagged, noEntry: dev.BASE.noEntry, tradesByYear: dev.BASE.tradesByYear }, CONSERVATIVE: { ...dev.CONSERVATIVE.summary, excludedFlagged: dev.CONSERVATIVE.excludedFlagged, noEntry: dev.CONSERVATIVE.noEntry, tradesByYear: dev.CONSERVATIVE.tradesByYear } }, null, 2));
  console.log(JSON.stringify({ development: { BASE: { trades: dev.BASE.summary.trades, expR: round(dev.BASE.summary.expectancyR) }, CONSERVATIVE: { trades: dev.CONSERVATIVE.summary.trades, expR: round(dev.CONSERVATIVE.summary.expectancyR), pf: round(dev.CONSERVATIVE.summary.profitFactor) } } }));

  const val = { BASE: runSet(universe, "BASE", SPLITS.validation), CONSERVATIVE: runSet(universe, "CONSERVATIVE", SPLITS.validation) };
  const valPass = val.CONSERVATIVE.summary.trades >= MIN_TRADES && (val.CONSERVATIVE.summary.expectancyR ?? -Infinity) > 0;
  fs.writeFileSync(path.join(OUT, "validation.json"), JSON.stringify({ range: SPLITS.validation, BASE: { ...val.BASE.summary, excludedFlagged: val.BASE.excludedFlagged, tradesByYear: val.BASE.tradesByYear }, CONSERVATIVE: { ...val.CONSERVATIVE.summary, excludedFlagged: val.CONSERVATIVE.excludedFlagged, tradesByYear: val.CONSERVATIVE.tradesByYear }, pass: valPass }, null, 2));
  console.log(JSON.stringify({ validation: { BASE: { trades: val.BASE.summary.trades, expR: round(val.BASE.summary.expectancyR) }, CONSERVATIVE: { trades: val.CONSERVATIVE.summary.trades, expR: round(val.CONSERVATIVE.summary.expectancyR) }, pass: valPass } }));

  if (!valPass) {
    fs.writeFileSync(path.join(OUT, "holdout.json"), JSON.stringify({ status: "NOT OPENED", reason: "validation failed" }, null, 2));
    console.log("I-1 REJECTED at validation: holdout not opened.");
    return;
  }
  const hold = { BASE: runSet(universe, "BASE", SPLITS.holdout), CONSERVATIVE: runSet(universe, "CONSERVATIVE", SPLITS.holdout) };
  const holdPass = hold.CONSERVATIVE.summary.trades >= MIN_TRADES && (hold.CONSERVATIVE.summary.expectancyR ?? -Infinity) > 0;
  fs.writeFileSync(path.join(OUT, "holdout.json"), JSON.stringify({ range: SPLITS.holdout, BASE: { ...hold.BASE.summary, excludedFlagged: hold.BASE.excludedFlagged, tradesByYear: hold.BASE.tradesByYear }, CONSERVATIVE: { ...hold.CONSERVATIVE.summary, excludedFlagged: hold.CONSERVATIVE.excludedFlagged, tradesByYear: hold.CONSERVATIVE.tradesByYear }, pass: holdPass }, null, 2));
  console.log(JSON.stringify({ holdout: { BASE: { trades: hold.BASE.summary.trades, expR: round(hold.BASE.summary.expectancyR) }, CONSERVATIVE: { trades: hold.CONSERVATIVE.summary.trades, expR: round(hold.CONSERVATIVE.summary.expectancyR) }, pass: holdPass } }));
  console.log(holdPass ? "I-1 ACCEPTED under the protocol." : "I-1 REJECTED at holdout.");
}

main();
