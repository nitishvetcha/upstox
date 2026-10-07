// Shared request helpers for /api/performance/* (reads the one backtest run store; no second source of truth).
import { getBacktestRun } from "../backtestStore";
import { buildPerformanceReport, type TradeFilters } from "./report";
import type { BacktestTrade } from "../../backtestTypes";

export function filtersFrom(url: URL): TradeFilters {
  const p = url.searchParams;
  const num = (k: string) => (p.get(k) !== null && p.get(k) !== "" && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : undefined);
  const str = (k: string) => p.get(k) || undefined;
  const outcome = str("outcome");
  return {
    strategy: str("strategy"),
    regime: str("regime"),
    from: str("from"),
    to: str("to"),
    outcome: outcome === "win" || outcome === "loss" || outcome === "breakeven" ? outcome : undefined,
    exitReason: str("exitReason") as BacktestTrade["exitReason"] | undefined,
    minR: num("minR"),
    maxR: num("maxR"),
  };
}

export async function loadReport(req: Request, params: Promise<{ runId: string }>) {
  const { runId } = await params;
  const run = getBacktestRun(runId);
  if (!run) return { error: Response.json({ status: "error", message: `Backtest run ${runId} not found` }, { status: 404 }) } as const;
  const url = new URL(req.url);
  const rf = Number(url.searchParams.get("riskFreeRate"));
  const report = buildPerformanceReport(run, filtersFrom(url), { riskFreeRateAnnualPercent: Number.isFinite(rf) ? rf : 0 });
  return { run, report, url } as const;
}

export const json = (data: unknown) => Response.json({ status: "success", mode: "SIMULATED HISTORICAL PERFORMANCE", data });
