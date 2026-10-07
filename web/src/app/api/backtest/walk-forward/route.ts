import { NextResponse } from "next/server";
import { backtestInputs } from "@/lib/services/backtestRequest";
import { runWalkForward, type WalkForwardConfig } from "@/lib/walkForwardEngine";
import { saveWalkForwardRun } from "@/lib/services/walkForwardStore";

export async function POST(request: Request) {
  try {
    const body = await request.clone().json().catch(() => ({}));
    const inputs = await backtestInputs(request);
    if ("error" in inputs) return inputs.error;

    const wfConfig: WalkForwardConfig = {
      windowType: body.windowType === "EXPANDING" ? "EXPANDING" : "ROLLING",
      trainMonths: Number(body.trainMonths) || 6,
      testMonths: Number(body.testMonths) || 2,
      stepMonths: Number(body.stepMonths) || 2,
      initialCapital: Number(body.startingCapital) || 1_000_000,
      executionModel: body.executionModel === "INTRABAR_MODEL_DERIVED" ? "INTRABAR_MODEL_DERIVED" : "CLOSE_ONLY",
      compounding: body.compounding === true || body.compounding === "on",
      flattenOnDailyLossLimit: body.flattenOnDailyLossLimit === true || body.flattenOnDailyLossLimit === "on",
      slippagePercent: body.slippagePercent === 0 || body.slippagePercent === "0" ? 0 : Number(body.slippagePercent) || 1.0,
    };

    const dsHash = inputs.candles.length ? `ds_${inputs.candles[0].timestamp.slice(0, 10)}_${inputs.candles[inputs.candles.length - 1].timestamp.slice(0, 10)}` : "ds_empty";

    const wfResult = runWalkForward(inputs.config, inputs.candles, inputs.daily, wfConfig, inputs.ctx, dsHash);
    saveWalkForwardRun(wfResult);

    return NextResponse.json({ status: "success", data: wfResult, mode: "WALK_FORWARD" });
  } catch (err) {
    return NextResponse.json({ status: "error", message: (err as Error).message }, { status: 400 });
  }
}
