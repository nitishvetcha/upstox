// Stock V2 isolated research comparison: closing placeholders kept (as stored) versus excluded before indicators.
// DEVELOPMENT sessions only. The held-out validation sessions are not loaded into any experiment, and the
// pre-registered protocol (scripts/stock-v2-research.ts) is neither re-run nor overwritten.
// Writes one new file to a new directory. Refuses to overwrite an existing comparison.
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { loadHistoricalDataset, chronologicalSplit } from "../src/lib/stockV2/dataset.ts";
import { runExperiment, selectCandidate, SCENARIO_SET, type ExperimentResult } from "../src/lib/stockV2/research.ts";
import { STRATEGIES, type StrategyId } from "../src/lib/stockV2/signal.ts";

const ROOT = path.resolve(process.cwd());
const DATA_DIR = path.join(ROOT, ".research-data/intraday-bars-historical");
const OUT_DIR = path.join(ROOT, ".research-data/stock-v2-placeholder-comparison");
const OUT_FILE = path.join(OUT_DIR, "comparison.json");
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

const r6 = (x: number | null) => (x === null ? null : Math.round(x * 1e6) / 1e6);

function brief(r: ExperimentResult) {
  const m = r.metrics;
  return {
    trades: m.trades,
    winRate: r6(m.winRate),
    expectancyR: r6(m.expectancyR),
    netPnl: r6(m.netPnl),
    profitFactor: r6(m.profitFactor),
    maxDrawdownR: r6(m.maxDrawdownR),
    sessionStatus: r.sessionStatus,
    sessionsCovered: r.sessionsCovered,
    missingMinutes: r.missingMinutes,
    rejectionCounts: r.rejectionCounts,
  };
}

function main() {
  if (fs.existsSync(OUT_FILE)) throw new Error(`${OUT_FILE} already exists: a comparison is written once and is not overwritten`);
  const dataset = loadHistoricalDataset(DATA_DIR);
  const { development, validation } = chronologicalSplit(dataset.dates, DEV_SESSIONS, VAL_SESSIONS);

  const rows: Record<string, unknown>[] = [];
  const perStrategy: Record<string, { base: { off: ExperimentResult; on: ExperimentResult }; conservative: { off: ExperimentResult; on: ExperimentResult } }> = {};

  for (const strategy of STRATEGIES as StrategyId[]) {
    const pair: Record<string, { off: ExperimentResult; on: ExperimentResult }> = {};
    for (const scenario of SCENARIO_SET) {
      const spec = { name: `${strategy} ${scenario.name}`, phase: "DEVELOPMENT" as const, strategy, scenario, gateMode: "CORE" as const, dates: development };
      const off = runExperiment(dataset, { ...spec, excludePlaceholders: false });
      const on = runExperiment(dataset, { ...spec, excludePlaceholders: true });
      pair[scenario.name] = { off, on };
      const a = brief(off), b = brief(on);
      const offNet = off.metrics.netPnl, onNet = on.metrics.netPnl;
      rows.push({
        strategy,
        scenario: scenario.name,
        placeholdersKept: a,
        placeholdersExcluded: b,
        delta: {
          trades: b.trades - a.trades,
          expectancyR: b.expectancyR === null || a.expectancyR === null ? null : r6(b.expectancyR - a.expectancyR),
          netPnl: r6(onNet - offNet),
        },
      });
    }
    perStrategy[strategy] = { base: pair["BASE"] as never, conservative: pair["CONSERVATIVE"] as never };
  }

  // Informational only: the pre-registered selection rule is applied to the protocol's own run, not to this comparison.
  const selectionKept = selectCandidate(
    (STRATEGIES as StrategyId[]).map((s) => ({ strategy: s, base: perStrategy[s].base.off, conservative: perStrategy[s].conservative.off })),
  );
  const selectionExcluded = selectCandidate(
    (STRATEGIES as StrategyId[]).map((s) => ({ strategy: s, base: perStrategy[s].base.on, conservative: perStrategy[s].conservative.on })),
  );

  const out = {
    label: "RESEARCH COMPARISON — development sessions only. Not a validation result. Not a selection under the pre-registered protocol.",
    provenance: {
      codeSha256: codeHash(),
      dataDir: ".research-data/intraday-bars-historical",
      sessionsLoaded: dataset.dates.length,
      symbols: dataset.symbols.length,
      skippedFiles: dataset.issues.length,
      closingPlaceholderBars: dataset.closingPlaceholderBars,
      developmentDates: [development[0], development.at(-1)],
      validationDatesNotLoaded: [validation[0], validation.at(-1)],
      gateMode: "CORE",
      scenariosRun: SCENARIO_SET.map((s) => s.name),
      generatedAt: new Date().toISOString(),
    },
    method: {
      placeholdersKept: "Stored bars as loaded; closing placeholders feed the EMAs (which run across sessions) and warm-up counts.",
      placeholdersExcluded: "Placeholder bars (15:15–15:29, flat, zero volume, labelled) removed before any indicator. Stored records unchanged. Volume-weighted VWAP is numerically unaffected because placeholder volume is zero; the effect is through the EMAs.",
    },
    rows,
    informationalSelection: {
      placeholdersKept: selectionKept,
      placeholdersExcluded: selectionExcluded,
      note: "Shown for transparency. A selection changed by this comparison would need a new pre-registered protocol run before any validation.",
    },
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`wrote ${path.relative(ROOT, OUT_FILE)}`);
  for (const row of rows) console.log(JSON.stringify(row));
}

main();
