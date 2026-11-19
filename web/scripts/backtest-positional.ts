// Positional-engine backtest vs buy-and-hold NIFTY. Writes only to .data/positional-backtest/ (never paper records).
// Run: node scripts/backtest-positional.ts [range=5Y]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadHistory, type HistoryRange } from "../src/lib/marketHistory.ts";
import { upstoxHistoryFetcher } from "../src/lib/services/upstoxMarket.ts";
import { getAccessToken } from "../src/lib/services/upstoxAuth.ts";
import { NIFTY_50 } from "../src/lib/services/breadthConstituents.generated.ts";
import { runPositionalBacktest, DEFAULT_CONFIG } from "../src/lib/engine/positionalBacktest.ts";
import type { Candle } from "../src/lib/types.ts";

const range = (process.argv[2] ?? "5Y") as HistoryRange;
const token = await getAccessToken();
if (!token) throw new Error("Upstox not connected — log in via the app first");
const fetcher = upstoxHistoryFetcher(token);

const bench = (await loadHistory("NSE_INDEX|Nifty 50", "1d", range, fetcher)).candles;
const data: Record<string, Candle[]> = {};
for (const s of NIFTY_50) {
  const h = await loadHistory(s.instrumentKey, "1d", range, fetcher);
  if (h.candles.length) data[s.symbol] = h.candles;
}
console.error(`loaded ${Object.keys(data).length} stocks, ${bench.length} NIFTY bars`);

const r = runPositionalBacktest(data, bench, DEFAULT_CONFIG);
const out = path.join(process.cwd(), ".data", "positional-backtest");
mkdirSync(out, { recursive: true });
const file = path.join(out, `run_${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify({ config: DEFAULT_CONFIG, range, caveats: [
  "Survivorship bias: today's NIFTY 50 members applied to the whole history (flatters results).",
  "Benchmark is the NIFTY price index without dividends or costs; a NIFTY ETF would differ slightly.",
  "Costs are approximate Indian delivery charges plus 0.05% slippage per side.",
], ...r }, null, 2));

const { stats: s, benchmark: b } = r;
console.log(`\n${r.from} → ${r.to}   (file: ${file})`);
console.log(`                 Strategy   NIFTY`);
console.log(`Net return       ${s.netReturnPct}%     ${b.netReturnPct}%`);
console.log(`Max drawdown     ${s.maxDrawdownPct}%     ${b.maxDrawdownPct}%`);
console.log(`CAGR ${s.cagrPct}%  trades ${s.tradeCount}  win ${s.winRate}  expectancy ${s.expectancyR}R  PF ${s.profitFactor}  costs ₹${s.totalCosts}  exposure ${s.exposurePct}%`);
console.log(`exits:`, Object.entries(r.trades.reduce((m: Record<string, number>, t) => ((m[t.exitReason] = (m[t.exitReason] ?? 0) + 1), m), {})).map(([k, v]) => `${k} ${v}`).join(", "));
console.table(r.byYear);
console.table(r.byMarket);
