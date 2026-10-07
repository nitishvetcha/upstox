import { NextResponse } from "next/server";
import { BacktestEngine } from "@/lib/backtestEngine";
import { saveBacktestRun } from "@/lib/services/backtestStore";
import { backtestInputs } from "@/lib/services/backtestRequest";

export async function POST(request: Request) {
  try {
    const i = await backtestInputs(request);
    if ("error" in i) return i.error;
    const result = new BacktestEngine().run(i.config, i.candles, i.daily, i.meta, i.ctx);
    saveBacktestRun(result);
    return NextResponse.json({ status: "success", data: result, mode: "BACKTEST" });
  } catch (err) {
    return NextResponse.json({ status: "error", message: (err as Error).message }, { status: 400 });
  }
}
