// Writes trade-level records for the development phase so the research page can show them. Offline, read-only on data.
import * as fs from "node:fs";
import * as path from "node:path";
import { loadHistoricalDataset, chronologicalSplit } from "../src/lib/stockV2/dataset.ts";
import { runExperiment } from "../src/lib/stockV2/research.ts";
import { SCENARIOS } from "../src/lib/stockV2/risk.ts";
import { STRATEGIES } from "../src/lib/stockV2/signal.ts";

const ROOT = path.resolve(process.cwd());
const OUT_DIR = path.resolve(process.env.STOCK_V2_OUT_DIR ?? path.join(ROOT, ".research-data/stock-v2"));
const ds = loadHistoricalDataset(path.join(ROOT, ".research-data/intraday-bars-historical"));
const { development } = chronologicalSplit(ds.dates, 40, 20);
const out: Record<string, unknown> = {};
for (const strategy of STRATEGIES) {
  const r = runExperiment(ds, { name: `${strategy} BASE`, phase: "DEVELOPMENT", strategy, scenario: SCENARIOS.BASE, gateMode: "CORE", dates: development, excludePlaceholders: true });
  out[strategy] = r.trades;
}
fs.mkdirSync(OUT_DIR, { recursive: true });
const target = path.join(OUT_DIR, "trades-development-base.json");
fs.writeFileSync(target, JSON.stringify({ phase: "DEVELOPMENT", scenario: "BASE", gateMode: "CORE", trades: out }));
console.log(target);
