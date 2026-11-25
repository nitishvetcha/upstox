#!/usr/bin/env tsx
// Phase 3 — Contract Replay Backtester CLI Runner
// Runs replay backtesting across all certified historical datasets for NSE indices and MCX commodities.

import { loadHistoricalCandles, loadManifest } from "../src/lib/services/historicalDataPipeline.ts";
import { runContractReplayBacktest } from "../src/lib/services/contractReplayBacktester.ts";
import type { UnderlyingId } from "../src/lib/types.ts";

async function main() {
  console.log("================================================================================");
  console.log("   UPSTOX ANALYZER — PHASE 3: CONTRACT REPLAY BACKTEST RUNNER");
  console.log("   Ask/Bid Fills · Tick Slippage · MCX CTT / NSE STT · Intraday Auto-Squareoff");
  console.log("================================================================================\n");

  const manifest = loadManifest();
  if (manifest.datasets.length === 0) {
    console.log("No historical datasets found in manifest. Please run 'npm run data:ingest' first.");
    process.exit(1);
  }

  const targets: UnderlyingId[] = ["nifty", "banknifty", "crudeoil", "naturalgas"];

  console.log("Executing contract replay backtests across active assets...\n");

  for (const underlying of targets) {
    const { candles, verified } = loadHistoricalCandles(underlying, "15m");
    if (candles.length === 0) {
      console.log(`[!] Skipped ${underlying.toUpperCase()}: no 15m dataset found.`);
      continue;
    }

    const result = runContractReplayBacktest(candles, {
      underlying,
      timeframe: "15m",
      startingCapital: 100_000,
      lots: 1,
      brokerPlan: "BASIC",
    });

    console.log(`--------------------------------------------------------------------------------`);
    console.log(`ASSET: ${result.contractSpec.name} (${result.contractSpec.symbol}) · ${result.contractSpec.exchange}`);
    console.log(`Lot Size: ${result.contractSpec.lotSize} | Tick Size: ₹${result.contractSpec.tickSize} | Cutoff: ${result.contractSpec.autoSquareOffTime} IST`);
    console.log(`Dataset Integrity: ${verified ? "VERIFIED (SHA-256 MATCH)" : "UNVERIFIED"}`);
    console.log(`Total Bars Replayed: ${result.totalCandles} | Data Quality: ${result.qualityScore}%`);
    console.log(`Total Trades: ${result.totalTrades} | Win Rate: ${result.winRatePct}% (${result.winningTrades}W / ${result.losingTrades}L)`);
    console.log(`Gross Profit: ₹${result.grossProfit.toLocaleString("en-IN")} | Gross Loss: ₹${result.grossLoss.toLocaleString("en-IN")}`);
    console.log(`Total Statutory & Brokerage Costs: ₹${result.totalStatutoryCosts.toLocaleString("en-IN")}`);
    console.log(`Net Profit / Loss: ₹${result.netProfit.toLocaleString("en-IN")}`);
    console.log(`Profit Factor: ${result.profitFactor} | Max Drawdown: ₹${result.maxDrawdown.toLocaleString("en-IN")} (${result.maxDrawdownPct.toFixed(1)}%)`);
    console.log(`Replay Certified: ${result.isCertified ? "YES" : "NO (INSUFFICIENT BARS/TRADES)"}`);
    console.log(`Input SHA-256: ${result.inputDataHash.slice(0, 16)}...`);
    console.log(`--------------------------------------------------------------------------------\n`);
  }
}

main().catch((err) => {
  console.error("Fatal error during contract replay:", err);
  process.exit(1);
});
