// Runs positional-v2 per docs/positional-v2-hypothesis.md. Each period runs ONCE; results are never overwritten.
//   node scripts/backtest-positional-v2.ts development
//   node scripts/backtest-positional-v2.ts validation   (only if development passed)
// Writes only to .data/positional-v2/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadHistory } from "../src/lib/marketHistory.ts";
import { upstoxHistoryFetcher } from "../src/lib/services/upstoxMarket.ts";
import { getAccessToken } from "../src/lib/services/upstoxAuth.ts";
import { NIFTY_50 } from "../src/lib/services/breadthConstituents.generated.ts";
import { runPositionalV2, type V2Result } from "../src/lib/engine/positionalV2.ts";
import { DEFAULT_COSTS } from "../src/lib/engine/positionalBacktest.ts";
import type { Candle } from "../src/lib/types.ts";

const PERIODS = {
  development: { tradeFrom: "2022-01-01", tradeTo: "2024-12-31" },
  validation: { tradeFrom: "2025-01-01", tradeTo: "2026-10-22" },
} as const;
const mode = process.argv[2] as keyof typeof PERIODS;
if (!(mode in PERIODS)) throw new Error("usage: development | validation");

const dir = path.join(process.cwd(), ".data", "positional-v2");
mkdirSync(dir, { recursive: true });
const out = path.join(dir, `${mode.toUpperCase()}_result.json`);
if (existsSync(out)) throw new Error(`${mode} has already been run (${out}). Rules allow one run per period.`);
if (mode === "validation") {
  const devFile = path.join(dir, "DEVELOPMENT_result.json");
  if (!existsSync(devFile) || !JSON.parse(readFileSync(devFile, "utf8")).gates.passed) throw new Error("validation requires a passed development run");
}

const { tradeFrom, tradeTo } = PERIODS[mode];
const warmupFrom = `${Number(tradeFrom.slice(0, 4)) - 1}-01-01`;
const keep = (cs: Candle[]) => cs.filter((c) => c.timestamp.slice(0, 10) >= warmupFrom && c.timestamp.slice(0, 10) <= tradeTo);

const token = await getAccessToken();
if (!token) throw new Error("Upstox not connected — log in via the app first");
const f = upstoxHistoryFetcher(token);
const bench = keep((await loadHistory("NSE_INDEX|Nifty 50", "1d", "MAX", f)).candles);
const data: Record<string, Candle[]> = {};
for (const s of NIFTY_50) {
  const cs = keep((await loadHistory(s.instrumentKey, "1d", "MAX", f)).candles);
  if (cs.length) data[s.symbol] = cs;
}

const cfg = { capital: 1_000_000, maxPositions: 5, atrMult: 3, costs: DEFAULT_COSTS, tradeFrom, tradeTo };
const r: V2Result = runPositionalV2(data, bench, cfg);
const s = r.stats;

const gates = mode === "development"
  ? {
      beatsNifty: s.netReturnPct > s.benchmarkReturnPct,
      profitFactorAtLeast1_2: s.profitFactor !== null && s.profitFactor >= 1.2,
      drawdownWithin1_5xNifty: s.maxDrawdownPct <= 1.5 * s.benchmarkMaxDrawdownPct,
      atLeast30Trades: s.tradeCount >= 30,
    }
  : {
      positiveReturn: s.netReturnPct > 0,
      profitFactorAtLeast1_0: s.profitFactor !== null && s.profitFactor >= 1.0,
      drawdownWithin1_5xNifty: s.maxDrawdownPct <= 1.5 * s.benchmarkMaxDrawdownPct,
    };
const passed = Object.values(gates).every(Boolean);

writeFileSync(out, JSON.stringify({
  mode, ranAt: new Date().toISOString(), config: cfg, stocksLoaded: Object.keys(data).length,
  caveats: ["Survivorship bias (today's NIFTY 50 throughout).", "Dividends excluded on both sides.", "Approximate delivery costs + 0.05% slippage per side."],
  gates: { ...gates, passed }, ...r,
}, null, 2));

console.log(`\npositional-v2 ${mode}: ${r.from} → ${r.to}   (${Object.keys(data).length} stocks)  file: ${out}`);
console.log(`                 v2        NIFTY`);
console.log(`Net return       ${s.netReturnPct}%    ${s.benchmarkReturnPct}%`);
console.log(`Max drawdown     ${s.maxDrawdownPct}%    ${s.benchmarkMaxDrawdownPct}%`);
console.log(`trades ${s.tradeCount}  win ${s.winRate}  PF ${s.profitFactor}  costs ₹${s.totalCosts}  avg hold ${s.avgHoldSessions} sessions`);
console.log("gates:", gates, "→", passed ? "PASSED" : "FAILED");
