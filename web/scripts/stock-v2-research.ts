// Stock V2 pre-registered research protocol. Offline only: reads the historical files, writes research outputs.
// Development (40 sessions) selects a candidate by the rule in src/lib/stockV2/research.ts. Validation (20 sessions)
// runs once for the selected candidate and refuses to run again if its output already exists.
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { loadHistoricalDataset, chronologicalSplit } from "../src/lib/stockV2/dataset.ts";
import { runExperiment, selectCandidate, SELECTION_RULE, SCENARIO_SET, type ExperimentResult } from "../src/lib/stockV2/research.ts";
import { SCENARIOS } from "../src/lib/stockV2/risk.ts";
import { STRATEGIES, type StrategyId } from "../src/lib/stockV2/signal.ts";

const ROOT = path.resolve(process.cwd());
const DATA_DIR = path.join(ROOT, ".research-data/intraday-bars-historical");
// Legacy protocol output (run under an earlier code hash). Never overwritten: the restart writes to STOCK_V2_OUT_DIR.
const LEGACY_OUT_DIR = path.join(ROOT, ".research-data/stock-v2");
const OUT_DIR = path.resolve(process.env.STOCK_V2_OUT_DIR ?? LEGACY_OUT_DIR);
if (OUT_DIR === LEGACY_OUT_DIR) throw new Error("refusing to write the legacy protocol directory: set STOCK_V2_OUT_DIR to a new isolated directory");
// Settled methodology (docs/STOCK_V2_PROTOCOL_RESTART.md): closing placeholder bars are excluded before indicators.
const EXCLUDE_PLACEHOLDERS = true;
const PLACEHOLDER_METHOD = "excluded";
const DEV_SESSIONS = 40;
const VAL_SESSIONS = 20;

function codeHash(): string {
  const dir = path.join(ROOT, "src/lib/stockV2");
  const h = crypto.createHash("sha256");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts")).sort()) {
    h.update(f);
    h.update(fs.readFileSync(path.join(dir, f)));
  }
  return h.digest("hex");
}

function summarizeResult(r: ExperimentResult) {
  return {
    spec: r.spec,
    metrics: r.metrics,
    sessionStatus: r.sessionStatus,
    sessionsCovered: r.sessionsCovered,
    missingMinutes: r.missingMinutes,
    rejectionCounts: r.rejectionCounts,
    gatedReasonCounts: r.gatedReasonCounts,
    byStock: r.byStock,
    byMonth: r.byMonth,
    bySide: r.bySide,
  };
}

function write(name: string, data: unknown) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const p = path.join(OUT_DIR, name);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  return p;
}

function main() {
  const phase = process.argv[2] ?? "development";
  const dataset = loadHistoricalDataset(DATA_DIR);
  const { development, validation } = chronologicalSplit(dataset.dates, DEV_SESSIONS, VAL_SESSIONS);
  const provenance = {
    codeSha256: codeHash(),
    dataDir: ".research-data/intraday-bars-historical",
    sessionsLoaded: dataset.dates.length,
    symbols: dataset.symbols.length,
    skippedFiles: dataset.issues.length,
    skipped: dataset.issues.slice(0, 50),
    developmentDates: [development[0], development.at(-1)],
    validationDates: [validation[0], validation.at(-1)],
    gateMode: "CORE",
    placeholderMethod: PLACEHOLDER_METHOD,
    outputDirectory: path.relative(ROOT, OUT_DIR),
    gateNote: "CORE evaluates no market gates (market state, event risk, VIX, NIFTY ATR, verified stocks are not available in the dataset). Full-spec gates are not evaluated by this run.",
    selectionRule: SELECTION_RULE,
    generatedAt: new Date().toISOString(),
  };

  if (phase === "development") {
    const candidates = STRATEGIES.map((strategy: StrategyId) => {
      const run = (scenario: (typeof SCENARIOS)[keyof typeof SCENARIOS]) =>
        runExperiment(dataset, { name: `${strategy} ${scenario.name}`, phase: "DEVELOPMENT", strategy, scenario, gateMode: "CORE", dates: development, excludePlaceholders: EXCLUDE_PLACEHOLDERS });
      return { strategy, base: run(SCENARIOS.BASE), conservative: run(SCENARIOS.CONSERVATIVE), adverse: run(SCENARIOS.ADVERSE_SLIPPAGE) };
    });
    const decision = selectCandidate(candidates.map((c) => ({ strategy: c.strategy, base: c.base, conservative: c.conservative })));
    const out = {
      provenance,
      phase: "DEVELOPMENT",
      candidates: candidates.map((c) => ({ strategy: c.strategy, base: summarizeResult(c.base), conservative: summarizeResult(c.conservative), adverse: summarizeResult(c.adverse) })),
      selected: decision.selected,
      selectionReasons: decision.reasons,
    };
    console.log(`development: selected=${decision.selected ?? "NONE"}`);
    console.log(JSON.stringify(decision.reasons, null, 2));
    console.log(write("development.json", out));
    return;
  }

  if (phase === "validation") {
    const dev = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "development.json"), "utf8")) as { selected: StrategyId | null; provenance: { codeSha256: string } };
    if (!dev.selected) throw new Error("no candidate selected in development: validation not run (NO-GO)");
    const target = path.join(OUT_DIR, "validation.json");
    if (fs.existsSync(target)) throw new Error("validation.json already exists: validation is run once and is not repeated");
    if (dev.provenance.codeSha256 !== codeHash()) throw new Error("code changed since development: validation would not be independent. Restart the protocol.");
    const results = SCENARIO_SET.map((scenario) =>
      runExperiment(dataset, { name: `${dev.selected} ${scenario.name}`, phase: "VALIDATION", strategy: dev.selected!, scenario, gateMode: "CORE", dates: validation, excludePlaceholders: EXCLUDE_PLACEHOLDERS }),
    );
    const out = { provenance, phase: "VALIDATION", strategy: dev.selected, scenarios: results.map(summarizeResult) };
    console.log(`validation: ${dev.selected} trades(base)=${results[0].metrics.trades}`);
    console.log(write("validation.json", out));
    return;
  }

  throw new Error(`unknown phase: ${phase}`);
}

main();
