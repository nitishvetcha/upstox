#!/usr/bin/env tsx
// Phase 4 — Statistical Validation & Walk-Forward Analysis CLI Runner
// Evaluates Out-of-Sample (OOS) degradation, volatility/trend regime breakdowns,
// and 95% bootstrap confidence intervals for certified historical datasets.

import { loadHistoricalCandles, loadManifest } from "../src/lib/services/historicalDataPipeline.ts";
import { runStatisticalValidation } from "../src/lib/services/walkForwardValidator.ts";
import type { UnderlyingId } from "../src/lib/types.ts";

async function main() {
  console.log("================================================================================");
  console.log("   UPSTOX ANALYZER — PHASE 4: STATISTICAL & WALK-FORWARD VALIDATION");
  console.log("   70/30 OOS Split · Volatility & Trend Regimes · 1,000 Monte Carlo Resamples");
  console.log("================================================================================\n");

  const manifest = loadManifest();
  if (manifest.datasets.length === 0) {
    console.log("No historical datasets found in manifest. Please run 'npm run data:ingest' first.");
    process.exit(1);
  }

  const targets: UnderlyingId[] = ["nifty", "crudeoil"];

  for (const underlying of targets) {
    const { candles, verified } = loadHistoricalCandles(underlying, "15m");
    if (candles.length === 0) continue;

    const report = runStatisticalValidation(
      candles,
      {
        underlying,
        timeframe: "15m",
        startingCapital: 100_000,
        lots: 1,
        brokerPlan: "BASIC",
      },
      { inSampleRatio: 0.70, bootstrapSamples: 1000 },
    );

    console.log(`--------------------------------------------------------------------------------`);
    console.log(`ASSET: ${underlying.toUpperCase()} | Dataset Verified: ${verified ? "YES" : "NO"} (${candles.length} bars)`);
    console.log(`WALK-FORWARD ANALYSIS (70% In-Sample / 30% Out-Of-Sample):`);
    console.log(`  • In-Sample Trades: ${report.walkForward.inSample.result.totalTrades} | Win Rate: ${report.walkForward.inSample.result.winRatePct}% | Net PnL: ₹${report.walkForward.inSample.result.netProfit.toLocaleString("en-IN")}`);
    console.log(`  • Out-of-Sample Trades: ${report.walkForward.outOfSample.result.totalTrades} | Win Rate: ${report.walkForward.outOfSample.result.winRatePct}% | Net PnL: ₹${report.walkForward.outOfSample.result.netProfit.toLocaleString("en-IN")}`);
    console.log(`  • Walk-Forward Efficiency (WFE): ${(report.walkForward.walkForwardEfficiency * 100).toFixed(0)}% | Gate Status: [${report.walkForward.gateStatus}]`);
    console.log(`  • Degradation: Win Rate Δ: ${report.walkForward.degradation.winRateDelta > 0 ? "+" : ""}${report.walkForward.degradation.winRateDelta}% | Profit Factor Δ: ${report.walkForward.degradation.profitFactorDelta}`);
    console.log(`REGIME BREAKDOWN:`);
    console.log(`  • Trending Markets: ${report.regimes.trendRegimes.trending.tradeCount} trades | Win Rate: ${report.regimes.trendRegimes.trending.winRatePct}% | Net PnL: ₹${report.regimes.trendRegimes.trending.netPnl.toLocaleString("en-IN")}`);
    console.log(`  • Ranging Markets:  ${report.regimes.trendRegimes.ranging.tradeCount} trades | Win Rate: ${report.regimes.trendRegimes.ranging.winRatePct}% | Net PnL: ₹${report.regimes.trendRegimes.ranging.netPnl.toLocaleString("en-IN")}`);
    console.log(`  • Morning Session:  ${report.regimes.sessionRegimes.morningSession.tradeCount} trades | Win Rate: ${report.regimes.sessionRegimes.morningSession.winRatePct}% | Net PnL: ₹${report.regimes.sessionRegimes.morningSession.netPnl.toLocaleString("en-IN")}`);
    console.log(`  • Evening Session:  ${report.regimes.sessionRegimes.eveningSession.tradeCount} trades | Win Rate: ${report.regimes.sessionRegimes.eveningSession.winRatePct}% | Net PnL: ₹${report.regimes.sessionRegimes.eveningSession.netPnl.toLocaleString("en-IN")}`);
    console.log(`BOOTSTRAP CONFIDENCE INTERVALS (1,000 Resamples with Replacement):`);
    console.log(`  • Mean Win Rate: ${report.bootstrap.winRate.mean}% [95% CI: ${report.bootstrap.winRate.ci95Lower}% – ${report.bootstrap.winRate.ci95Upper}%]`);
    console.log(`  • Expected Net PnL/Trade: ₹${report.bootstrap.expectedTradeNetPnl.mean} [95% CI: ₹${report.bootstrap.expectedTradeNetPnl.ci95Lower} – ₹${report.bootstrap.expectedTradeNetPnl.ci95Upper}]`);
    console.log(`  • 95th Percentile Max Drawdown: ₹${report.bootstrap.maxDrawdownP95.toLocaleString("en-IN")}`);
    console.log(`  • Probability of Net Loss: ${report.bootstrap.probabilityOfLoss}%`);
    console.log(`OVERALL ROBUSTNESS: [${report.robustnessGrade}]`);
    console.log(`Verdict: ${report.summaryVerdict}`);
    console.log(`--------------------------------------------------------------------------------\n`);
  }
}

main().catch((err) => {
  console.error("Fatal error during walk-forward validation:", err);
  process.exit(1);
});
