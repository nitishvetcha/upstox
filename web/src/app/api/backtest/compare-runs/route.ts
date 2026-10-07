import { NextResponse } from "next/server";
import { BacktestEngine } from "@/lib/backtestEngine";
import { saveBacktestRun } from "@/lib/services/backtestStore";
import { compareRuns } from "@/lib/services/backtestScenarios";
import { backtestInputs } from "@/lib/services/backtestRequest";

// POST /api/backtest/compare-runs  { runs: [{ label, ...runConfig }] } — e.g. Runs A–D side by side (max 6).
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { runs?: Record<string, unknown>[] };
    const runs = (body.runs ?? []).slice(0, 6);
    const out = [];
    for (const r of runs) {
      const i = await backtestInputs(new Request(request.url, { method: "POST", body: JSON.stringify(r) }));
      if ("error" in i) return i.error;
      const result = new BacktestEngine().run(i.config, i.candles, i.daily, i.meta, i.ctx);
      saveBacktestRun(result);
      out.push({ label: String(r.label ?? result.runId), result });
    }
    return NextResponse.json({ status: "success", mode: "BACKTEST", data: compareRuns(out) });
  } catch (err) {
    return NextResponse.json({ status: "error", message: (err as Error).message }, { status: 400 });
  }
}
