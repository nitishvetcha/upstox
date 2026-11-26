import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  simulateSwingV1,
  SWING_CONFIG_DEFAULTS,
  type DailyBar,
  type SwingConfig,
  type SwingMetrics,
} from "../src/lib/stockV2/swingV1.ts";
import { ALL_LIQUID_CONSTITUENTS } from "../src/lib/services/breadthConstituents.generated.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

interface RawIndexBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

type RawStockBar = [string, number, number, number, number, number];

async function main() {
  console.log("==================================================================");
  console.log("  SWING-V1.1 MODE B (₹10,000 / 1 POSITION) COMPARISON TEST");
  console.log("==================================================================");

  // 1. Load NIFTY 50 benchmark
  const niftyFile = path.join(ROOT, ".research-data", "upstox-clean-2026-11-06-v1", "NSE_INDEX_Nifty_50__1d.json");
  if (!fs.existsSync(niftyFile)) {
    throw new Error(`Nifty benchmark file not found at ${niftyFile}`);
  }
  const niftyJson = JSON.parse(fs.readFileSync(niftyFile, "utf8")) as { bars: RawIndexBar[] };
  const niftyBars: DailyBar[] = niftyJson.bars.map((b) => ({
    date: b.t.slice(0, 10),
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: b.v,
  }));

  // 2. Load Calendar sessions for the 6-month evaluation window
  const calFile = path.join(ROOT, ".research-data", "upstox-daily-universe-verified-2026-11-08", "calendar.json");
  const calJson = JSON.parse(fs.readFileSync(calFile, "utf8")) as { sessions: string[] };
  const evalStart = "2026-05-04";
  const evalEnd = "2026-11-05";
  const calendarDates = calJson.sessions.filter((s) => s >= evalStart && s <= evalEnd);
  console.log(`Evaluation Window: ${evalStart} to ${evalEnd} (${calendarDates.length} trading days)`);

  // 3. Load Liquid Equity Universe (Nifty 50 + Nifty Next 50)
  const seriesDir = path.join(ROOT, ".research-data", "upstox-daily-universe-verified-2026-11-08", "series");
  const stockData = new Map<string, DailyBar[]>();

  let loadedCount = 0;
  for (const constituent of ALL_LIQUID_CONSTITUENTS) {
    const fileName = `${constituent.instrumentKey.replace(/[^A-Za-z0-9]+/g, "_")}__1d.json`;
    const filePath = path.join(seriesDir, fileName);
    if (!fs.existsSync(filePath)) continue;

    try {
      const doc = JSON.parse(fs.readFileSync(filePath, "utf8")) as { bars: RawStockBar[] };
      // Include 1 year prior history (from 2025-05-01) for EMA warmup
      const bars: DailyBar[] = doc.bars
        .map((r) => ({
          date: r[0].slice(0, 10),
          open: r[1],
          high: r[2],
          low: r[3],
          close: r[4],
          volume: r[5],
        }))
        .filter((b) => b.date >= "2025-05-01" && b.date <= evalEnd)
        .sort((a, b) => a.date.localeCompare(b.date));

      if (bars.length >= 100) {
        stockData.set(constituent.symbol, bars);
        loadedCount++;
      }
    } catch {}
  }

  console.log(`Loaded ${loadedCount} liquid stocks with complete daily history.`);

  // 4. Run Backtests for Swing-V1.1 Mode B under Conservative Slippage (0.15%)
  const runs: { name: string; variant: string; brokerage: string; metrics: SwingMetrics }[] = [
    {
      name: "Baseline Mode B (15-Day Cap) [Upstox Costs]",
      variant: "Baseline (15d hold)",
      brokerage: "Upstox (₹20/ord)",
      metrics: simulateSwingV1(stockData, niftyBars, calendarDates, {
        ...SWING_CONFIG_DEFAULTS.MODE_B_10K,
        slippagePct: 0.0015,
        maxHoldingDays: 15,
      }).metrics,
    },
    {
      name: "Variant 1: Trail-20EMA (Max 45d, No Target Cap) [Upstox Costs]",
      variant: "Variant 1 (Trail-20EMA)",
      brokerage: "Upstox (₹20/ord)",
      metrics: simulateSwingV1(stockData, niftyBars, calendarDates, {
        ...SWING_CONFIG_DEFAULTS.MODE_B_10K,
        slippagePct: 0.0015,
        maxHoldingDays: 45,
        targetMultiplier: Infinity,
        trail20EmaAfter15R: true,
        zeroBrokerage: false,
      }).metrics,
    },
    {
      name: "Variant 1: Trail-20EMA (Max 45d, No Target Cap) [Zero Brokerage]",
      variant: "Variant 1 (Trail-20EMA)",
      brokerage: "Zero Brokerage",
      metrics: simulateSwingV1(stockData, niftyBars, calendarDates, {
        ...SWING_CONFIG_DEFAULTS.MODE_B_10K,
        slippagePct: 0.0015,
        maxHoldingDays: 45,
        targetMultiplier: Infinity,
        trail20EmaAfter15R: true,
        zeroBrokerage: true,
      }).metrics,
    },
    {
      name: "Variant 2: 30-Day Hold (2.5x Target) [Upstox Costs]",
      variant: "Variant 2 (30-Day Hold)",
      brokerage: "Upstox (₹20/ord)",
      metrics: simulateSwingV1(stockData, niftyBars, calendarDates, {
        ...SWING_CONFIG_DEFAULTS.MODE_B_10K,
        slippagePct: 0.0015,
        maxHoldingDays: 30,
        targetMultiplier: 2.5,
        trail20EmaAfter15R: false,
        zeroBrokerage: false,
      }).metrics,
    },
    {
      name: "Variant 2: 30-Day Hold (2.5x Target) [Zero Brokerage]",
      variant: "Variant 2 (30-Day Hold)",
      brokerage: "Zero Brokerage",
      metrics: simulateSwingV1(stockData, niftyBars, calendarDates, {
        ...SWING_CONFIG_DEFAULTS.MODE_B_10K,
        slippagePct: 0.0015,
        maxHoldingDays: 30,
        targetMultiplier: 2.5,
        trail20EmaAfter15R: false,
        zeroBrokerage: true,
      }).metrics,
    },
  ];

  console.log("\n======================================================================================================================");
  console.log("                                  SWING-V1.1 MODE B COMPARISON MATRIX (CONSERVATIVE 0.15% SLIPPAGE)                   ");
  console.log("======================================================================================================================\n");

  for (const r of runs) {
    const m = r.metrics;
    console.log(`>>> ${r.name}`);
    console.log(`    Trades:             ${m.trades} (W: ${m.wins}, L: ${m.losses}, BE: ${m.breakevens})`);
    console.log(`    Win Rate:           ${(m.winRate * 100).toFixed(2)}%`);
    console.log(`    Avg Hold Days:      ${m.avgHoldingDays.toFixed(1)} days`);
    console.log(`    Profit Factor:      ${m.profitFactor.toFixed(3)}`);
    console.log(`    Expectancy:         ${m.expectancyR.toFixed(3)} R`);
    console.log(`    Gross P&L:          ₹${Math.round(m.grossPnl)}`);
    console.log(`    Total Charges:      ₹${Math.round(m.totalCharges)} (DP: ₹${Math.round(m.dpChargesTotal)}, Brokerage: ₹${Math.round(m.brokerageTotal)})`);
    console.log(`    Fee Drag:           ${m.feeDragPct.toFixed(2)}% of Gross P&L`);
    console.log(`    Net P&L:            ₹${Math.round(m.netPnl)} (${((m.netPnl / 10000) * 100).toFixed(2)}% on ₹10k)`);
    console.log(`    Max Drawdown:       ₹${Math.round(m.maxDrawdownPnl)} (${m.maxDrawdownR.toFixed(2)} R)`);
    console.log(`    Exits Breakdown:    Tgt: ${m.exits.TARGET}, Stop: ${m.exits.STOP}, BE: ${m.exits.BREAKEVEN}, Trail-EMA: ${m.exits.TRAIL_EMA}, Time: ${m.exits.TIME}`);
    console.log("");
  }
}

main().catch((err) => {
  console.error("Backtest failed:", err);
  process.exit(1);
});
