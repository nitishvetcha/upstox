// Automated Real Strategy & Software Performance Benchmark Runner.
// Connects to live Upstox API, retrieves pure historical candles,
// executes strategy validation, and computes quantitative performance scores.

import { getAccessToken, verifyCurrentCredential } from "../src/lib/services/upstoxAuth.ts";
import { get } from "../src/lib/services/upstoxMarket.ts";
import { normalizeCandles, mergeCandles } from "../src/lib/services/candles.ts";
import { validateHistoricalStrategy, type StrategyValidationReport } from "../src/lib/services/strategyHistoricalValidator.ts";
import type { Candle } from "../src/lib/types.ts";

const ASSETS = [
  { symbol: "NIFTY 50", key: "NSE_INDEX|Nifty 50", index: "nifty" as const },
  { symbol: "BANK NIFTY", key: "NSE_INDEX|Nifty Bank", index: "banknifty" as const },
  { symbol: "FIN NIFTY", key: "NSE_INDEX|Nifty Fin Service", index: "finnifty" as const },
  { symbol: "RELIANCE", key: "NSE_EQ|INE002A01018", index: "nifty" as const },
  { symbol: "HDFC BANK", key: "NSE_EQ|INE040A01034", index: "banknifty" as const },
  { symbol: "TCS", key: "NSE_EQ|INE467B01029", index: "nifty" as const },
];

async function fetchRealCandles(token: string, instrumentKey: string, indexId: "nifty" | "banknifty" | "finnifty", days = 60): Promise<Candle[]> {
  const chunks = [
    { to: "2026-11-20", from: "2026-10-25" },
    { to: "2026-10-24", from: "2026-09-28" },
  ];
  let accumulated: Candle[] = [];
  const encoded = encodeURIComponent(instrumentKey);

  for (const ch of chunks) {
    try {
      const endpoint = `/v3/historical-candle/${encoded}/minutes/15/${ch.to}/${ch.from}`;
      const rawData = await get(token, endpoint, {}, { index: indexId });
      const parsed = normalizeCandles(rawData);
      accumulated = mergeCandles(accumulated, parsed);
    } catch (e) {
      console.warn(`[WARN] Chunk failed for ${instrumentKey}: ${(e as Error).message}`);
    }
  }
  return accumulated;
}

async function main() {
  console.log("==================================================================");
  console.log("  REAL MARKET STRATEGY & SOFTWARE PERFORMANCE VALIDATION");
  console.log("==================================================================");

  // 1. Upstox Connectivity & Latency Benchmark
  const t0 = Date.now();
  const credCheck = await verifyCurrentCredential();
  const latencyMs = Date.now() - t0;

  console.log(`\n[UPSTOX LIVE GATEWAY]`);
  console.log(`Status: ${credCheck.status} (${credCheck.connection})`);
  console.log(`Source: ${credCheck.source}`);
  console.log(`Roundtrip Latency: ${latencyMs} ms`);

  if (credCheck.connection !== "UPSTOX_CONNECTED") {
    console.error("FATAL: Could not establish live Upstox connection.");
    process.exit(1);
  }

  const token = await getAccessToken();
  if (!token) {
    console.error("FATAL: Access token resolved to null.");
    process.exit(1);
  }

  console.log("\n[RUNNING QUANTITATIVE VALIDATION ON REAL NSE MARKET DATA (60 DAYS)]");
  console.log("------------------------------------------------------------------");

  const reports: { asset: string; report: StrategyValidationReport }[] = [];

  for (const asset of ASSETS) {
    process.stdout.write(`Fetching ${asset.symbol.padEnd(12)}... `);
    const fetchT0 = Date.now();
    const candles = await fetchRealCandles(token, asset.key, asset.index);
    const fetchDuration = Date.now() - fetchT0;

    if (candles.length < 20) {
      console.log(`[FAILED: Insufficient real candles (${candles.length})]`);
      continue;
    }

    const report = validateHistoricalStrategy(candles, {
      symbol: asset.symbol,
      timeframe: "15m",
      rrTarget1: 1.5,
      rrTarget2: 2.5,
      atrBuffer: 0.15,
    });

    reports.push({ asset: asset.symbol, report });
    console.log(`OK (${candles.length} real 15m bars in ${fetchDuration}ms) -> WR: ${report.metrics.winRatePct}% | PF: ${report.metrics.profitFactor} | Net: +${report.metrics.netR}R`);
  }

  // 2. Aggregate Quantitative Strategy Metrics
  console.log("\n==================================================================");
  console.log("  STRATEGY VALIDATION SCORECARD (PURE REAL DATA — ZERO MOCK)");
  console.log("==================================================================");

  let totalSimTrades = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let totalNetR = 0;
  let sumWinRate = 0;
  let sumProfitFactor = 0;

  for (const { asset, report } of reports) {
    const m = report.metrics;
    totalSimTrades += m.totalTrades;
    totalWins += m.winningTrades;
    totalLosses += m.losingTrades;
    totalNetR += m.netR;
    sumWinRate += m.winRatePct;
    sumProfitFactor += m.profitFactor;

    console.log(
      `${asset.padEnd(12)} | Trades: ${String(m.totalTrades).padStart(3)} | Win Rate: ${(m.winRatePct + "%").padStart(6)} | PF: ${m.profitFactor.toFixed(2).padStart(4)} | Net: ${(m.netR >= 0 ? "+" : "") + m.netR.toFixed(2)}R | MaxDD: -${m.maxDrawdownR.toFixed(2)}R`
    );
  }

  const avgWinRate = reports.length > 0 ? (sumWinRate / reports.length).toFixed(1) : "0";
  const avgProfitFactor = reports.length > 0 ? (sumProfitFactor / reports.length).toFixed(2) : "0";
  const overallWinRate = totalSimTrades > 0 ? ((totalWins / totalSimTrades) * 100).toFixed(1) : "0";

  console.log("------------------------------------------------------------------");
  console.log(`TOTAL SIMULATED TRADES : ${totalSimTrades}`);
  console.log(`OVERALL WIN RATE       : ${overallWinRate}% (Asset Average: ${avgWinRate}%)`);
  console.log(`AVERAGE PROFIT FACTOR  : ${avgProfitFactor}`);
  console.log(`TOTAL NET ALPHA RETURN : +${totalNetR.toFixed(2)} R`);
  console.log("==================================================================\n");
}

main().catch(console.error);
