import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { loadHistoricalDataset, chronologicalSplit } from "../src/lib/stockV2/dataset.ts";
import { runStockV3Simulation } from "../src/lib/stockV2/stockV3.ts";
import { SCENARIOS } from "../src/lib/stockV2/risk.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const dataDir = path.resolve(__dirname, "../.research-data/intraday-bars-historical");
  console.log(`Loading dataset from ${dataDir}...`);
  const dataset = loadHistoricalDataset(dataDir);
  console.log(`Loaded ${dataset.dates.length} dates, ${dataset.symbols.length} symbols.`);

  const split = chronologicalSplit(dataset.dates, 40, 20);
  const devDates = split.development;
  console.log(`Development sessions (40): ${devDates[0]} to ${devDates[devDates.length - 1]}`);

  console.log("\n=======================================================");
  console.log(" RUNNING STOCK-V3 SIMULATION (₹10,000 CAPITAL ACCOUNT)");
  console.log("=======================================================");

  console.log("\n--- Scenario: BASE (0.05% slippage, 1x costs) ---");
  const baseResult = runStockV3Simulation(dataset, devDates, SCENARIOS.BASE);
  const bm = baseResult.metrics;
  console.log(`Trades: ${bm.trades} (Wins: ${bm.wins}, Losses: ${bm.losses})`);
  console.log(`Win Rate: ${((bm.winRate ?? 0) * 100).toFixed(2)}%`);
  console.log(`Profit Factor: ${(bm.profitFactor ?? 0).toFixed(3)}`);
  console.log(`Expectancy (R): ${bm.expectancyR?.toFixed(3) ?? "n/a"} R`);
  console.log(`Gross PnL: ₹${Math.round(bm.grossPnl)}`);
  console.log(`Charges: ₹${Math.round(bm.charges)}`);
  console.log(`Net PnL: ₹${Math.round(bm.netPnl)}`);
  console.log(`Max Drawdown: ₹${Math.round(bm.maxDrawdownPnl)} (${bm.maxDrawdownR?.toFixed(2) ?? "n/a"} R)`);
  console.log(`Exits:`, bm.exits);

  console.log("\n--- Scenario: CONSERVATIVE (0.10% slippage, 1.5x costs) ---");
  const consResult = runStockV3Simulation(dataset, devDates, SCENARIOS.CONSERVATIVE);
  const cm = consResult.metrics;
  console.log(`Trades: ${cm.trades} (Wins: ${cm.wins}, Losses: ${cm.losses})`);
  console.log(`Win Rate: ${((cm.winRate ?? 0) * 100).toFixed(2)}%`);
  console.log(`Profit Factor: ${(cm.profitFactor ?? 0).toFixed(3)}`);
  console.log(`Expectancy (R): ${cm.expectancyR?.toFixed(3) ?? "n/a"} R`);
  console.log(`Gross PnL: ₹${Math.round(cm.grossPnl)}`);
  console.log(`Charges: ₹${Math.round(cm.charges)}`);
  console.log(`Net PnL: ₹${Math.round(cm.netPnl)}`);
  console.log(`Max Drawdown: ₹${Math.round(cm.maxDrawdownPnl)} (${cm.maxDrawdownR?.toFixed(2) ?? "n/a"} R)`);
  console.log(`Exits:`, cm.exits);
}

main().catch((err) => {
  console.error("Backtest failed:", err);
  process.exit(1);
});
