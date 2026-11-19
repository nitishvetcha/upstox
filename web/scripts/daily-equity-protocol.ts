// Runs docs/DAILY_EQUITY_PROTOCOL.md exactly. Development → selection → validation (selected only) → holdout (only if
// validation passes). Writes to a NEW directory and refuses to overwrite one. Reads the cleaned daily store only.
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { CANDIDATES, SCENARIOS, simulateSymbol, summarise, type DBar, type Trade, type Candidate } from "../src/lib/research/dailyEquity.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const CLEAN = path.join(ROOT, ".research-data", "upstox-clean-2026-11-06-v1");
const OUT = path.join(ROOT, ".research-data", "daily-equity-protocol-2026-11-06");
const SPLITS = {
  development: ["2000-01-01", "2015-12-31"],
  validation: ["2016-01-01", "2021-12-31"],
  holdout: ["2022-01-01", "2026-11-05"],
} as const;
const MIN_TRADES = 100;

function loadUniverse(): { symbol: string; bars: DBar[] }[] {
  const out: { symbol: string; bars: DBar[] }[] = [];
  for (const f of fs.readdirSync(CLEAN).sort()) {
    if (!f.startsWith("NSE_EQ_") || !f.endsWith("__1d.json")) continue;
    const doc = JSON.parse(fs.readFileSync(path.join(CLEAN, f), "utf8")) as { summary: { symbol: string }; bars: { t: string; o: number; h: number; l: number; c: number; v: number }[] };
    const bars: DBar[] = doc.bars.map((b) => ({ t: b.t, date: b.t.slice(0, 10), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
    out.push({ symbol: doc.summary.symbol, bars });
  }
  return out;
}

function runSet(universe: { symbol: string; bars: DBar[] }[], cand: Candidate, scenario: keyof typeof SCENARIOS, range: readonly [string, string]) {
  const trades: Trade[] = [];
  let excludedJump = 0, truncated = 0;
  for (const u of universe) {
    const r = simulateSymbol(u.symbol, u.bars, cand, SCENARIOS[scenario], range[0], range[1]);
    trades.push(...r.trades);
    excludedJump += r.excludedJump;
    truncated += r.truncated;
  }
  trades.sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.symbol.localeCompare(b.symbol));
  return { summary: summarise(trades), excludedByJump: excludedJump, truncated, trades };
}

function main() {
  if (fs.existsSync(OUT)) throw new Error(`${OUT} exists: a protocol run is written once and is not overwritten`);
  fs.mkdirSync(OUT, { recursive: true });
  const universe = loadUniverse();
  const inputHash = crypto.createHash("sha256");
  for (const f of fs.readdirSync(CLEAN).sort()) if (f.startsWith("NSE_EQ_")) inputHash.update(f).update(fs.readFileSync(path.join(CLEAN, f)));
  const provenance = {
    protocol: "docs/DAILY_EQUITY_PROTOCOL.md",
    inputDirectory: path.relative(ROOT, CLEAN),
    inputSha256: inputHash.digest("hex"),
    equities: universe.length,
    splits: SPLITS,
    selectionRule: `at least ${MIN_TRADES} development trades, positive CONSERVATIVE expectancy, then highest BASE expectancy`,
    survivorship: "Universe is today's constituents: upper bound, not point-in-time.",
    costs: "Statutory-rate assumptions (to verify). Brokerage: BASE ₹0 (assumption), CONSERVATIVE ₹20/order.",
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUT, "protocol-provenance.json"), JSON.stringify(provenance, null, 2));

  // ── development (exploration of all candidates) ───────────────────────────
  const dev: Record<string, unknown>[] = [];
  const devRes = new Map<string, Record<"BASE" | "CONSERVATIVE", ReturnType<typeof runSet>>>();
  for (const cand of CANDIDATES) {
    const base = runSet(universe, cand, "BASE", SPLITS.development);
    const cons = runSet(universe, cand, "CONSERVATIVE", SPLITS.development);
    devRes.set(cand.id, { BASE: base, CONSERVATIVE: cons });
    dev.push({ candidate: cand.id, BASE: { ...base.summary, excludedByJump: base.excludedByJump, truncated: base.truncated }, CONSERVATIVE: { ...cons.summary, excludedByJump: cons.excludedByJump, truncated: cons.truncated } });
  }
  const qualifying = CANDIDATES.filter((c) => {
    const r = devRes.get(c.id)!;
    return r.BASE.summary.trades >= MIN_TRADES && (r.CONSERVATIVE.summary.expectancyR ?? -Infinity) > 0;
  });
  const selected = qualifying.sort((a, b) => (devRes.get(b.id)!.BASE.summary.expectancyR ?? -Infinity) - (devRes.get(a.id)!.BASE.summary.expectancyR ?? -Infinity))[0] ?? null;
  fs.writeFileSync(path.join(OUT, "development.json"), JSON.stringify({ range: SPLITS.development, candidates: dev, qualifying: qualifying.map((c) => c.id), selected: selected?.id ?? null }, null, 2));
  console.log(JSON.stringify({ development: dev.map((d) => ({ c: d.candidate, base: (d.BASE as { trades: number; expectancyR: number | null }).trades, baseExpR: round((d.BASE as { expectancyR: number | null }).expectancyR), consExpR: round((d.CONSERVATIVE as { expectancyR: number | null }).expectancyR) })), selected: selected?.id ?? null }));
  if (!selected) {
    fs.writeFileSync(path.join(OUT, "validation.json"), JSON.stringify({ status: "NOT RUN", reason: "no candidate qualified on development (protocol: validation and holdout not opened)" }, null, 2));
    fs.writeFileSync(path.join(OUT, "holdout.json"), JSON.stringify({ status: "NOT OPENED", reason: "no candidate selected" }, null, 2));
    console.log("NO CANDIDATE SELECTED: validation and holdout not run.");
    return;
  }

  // ── validation (selected candidate only, once) ────────────────────────────
  const vBase = runSet(universe, selected, "BASE", SPLITS.validation);
  const vCons = runSet(universe, selected, "CONSERVATIVE", SPLITS.validation);
  const validationPass = (vCons.summary.expectancyR ?? -Infinity) > 0;
  fs.writeFileSync(path.join(OUT, "validation.json"), JSON.stringify({ range: SPLITS.validation, candidate: selected.id, BASE: { ...vBase.summary, excludedByJump: vBase.excludedByJump, truncated: vBase.truncated }, CONSERVATIVE: { ...vCons.summary, excludedByJump: vCons.excludedByJump, truncated: vCons.truncated }, pass: validationPass }, null, 2));
  console.log(JSON.stringify({ validation: selected.id, baseExpR: round(vBase.summary.expectancyR), consExpR: round(vCons.summary.expectancyR), pass: validationPass }));

  // ── holdout (only if validation passed) ───────────────────────────────────
  if (!validationPass) {
    fs.writeFileSync(path.join(OUT, "holdout.json"), JSON.stringify({ status: "NOT OPENED", reason: "validation failed (CONSERVATIVE expectancy not positive)" }, null, 2));
    console.log("validation failed: holdout not opened.");
    return;
  }
  const hBase = runSet(universe, selected, "BASE", SPLITS.holdout);
  const hCons = runSet(universe, selected, "CONSERVATIVE", SPLITS.holdout);
  const holdoutPass = (hCons.summary.expectancyR ?? -Infinity) > 0;
  fs.writeFileSync(path.join(OUT, "holdout.json"), JSON.stringify({ range: SPLITS.holdout, candidate: selected.id, BASE: { ...hBase.summary, excludedByJump: hBase.excludedByJump, truncated: hBase.truncated }, CONSERVATIVE: { ...hCons.summary, excludedByJump: hCons.excludedByJump, truncated: hCons.truncated }, pass: holdoutPass }, null, 2));
  console.log(JSON.stringify({ holdout: selected.id, baseExpR: round(hBase.summary.expectancyR), consExpR: round(hCons.summary.expectancyR), pass: holdoutPass }));
  console.log(holdoutPass ? "ACCEPTED under the protocol." : "REJECTED under the protocol: holdout CONSERVATIVE expectancy not positive.");
}

function round(x: number | null) { return x === null ? null : Math.round(x * 10000) / 10000; }

main();
