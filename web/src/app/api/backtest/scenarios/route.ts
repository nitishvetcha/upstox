import { NextResponse } from "next/server";
import { saveBacktestRun } from "@/lib/services/backtestStore";
import { runCapitalScenarios } from "@/lib/services/backtestScenarios";
import { backtestInputs } from "@/lib/services/backtestRequest";

// POST /api/backtest/scenarios — same strategy/config/candles at ₹1L, 2L, 5L, 10L, 25L, 50L (descriptive only).
export async function POST(request: Request) {
  try {
    const i = await backtestInputs(request);
    if ("error" in i) return i.error;
    const s = runCapitalScenarios(i.config, i.candles, i.daily, i.meta, i.ctx);
    s.runs.forEach(saveBacktestRun);
    return NextResponse.json({ status: "success", mode: "BACKTEST", data: { note: s.note, coverage: i.meta.coverage, feasibility: s.feasibility, rows: s.rows } });
  } catch (err) {
    return NextResponse.json({ status: "error", message: (err as Error).message }, { status: 400 });
  }
}
