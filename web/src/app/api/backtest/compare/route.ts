import { NextResponse } from "next/server";
import { saveBacktestRun } from "@/lib/services/backtestStore";
import { compareExecutionModels } from "@/lib/services/backtestScenarios";
import { backtestInputs } from "@/lib/services/backtestRequest";

// POST /api/backtest/compare — CLOSE_ONLY vs INTRABAR_MODEL_DERIVED; identical config/candles, execution differs only.
export async function POST(request: Request) {
  try {
    const i = await backtestInputs(request);
    if ("error" in i) return i.error;
    const c = compareExecutionModels(i.config, i.candles, i.daily, i.meta, i.ctx);
    saveBacktestRun(c.runs.close);
    saveBacktestRun(c.runs.intrabar);
    const { runs: _runs, ...rest } = c;
    void _runs;
    return NextResponse.json({ status: "success", mode: "BACKTEST", data: { ...rest, coverage: i.meta.coverage } });
  } catch (err) {
    return NextResponse.json({ status: "error", message: (err as Error).message }, { status: 400 });
  }
}
