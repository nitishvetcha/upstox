import { NextResponse } from "next/server";
import { BacktestEngine } from "@/lib/backtestEngine";
import { saveBacktestRun } from "@/lib/services/backtestStore";
import { backtestInputs } from "@/lib/services/backtestRequest";
import { backtestDisplayProvenance } from "@/lib/provenance/displayProvenance";

export async function POST(request: Request) {
  try {
    const i = await backtestInputs(request);
    if ("error" in i) return i.error;
    const result = new BacktestEngine().run(i.config, i.candles, i.daily, i.meta, i.ctx);
    saveBacktestRun(result);
    // Display labels only. `data` is the unchanged engine result; `displayProvenance` is derived from it and never feeds the engine.
    return NextResponse.json({
      status: "success",
      data: result,
      mode: "BACKTEST",
      displayProvenance: backtestDisplayProvenance(result.dataQuality as unknown as Record<string, unknown>),
    });
  } catch (err) {
    return NextResponse.json({ status: "error", message: (err as Error).message }, { status: 400 });
  }
}
