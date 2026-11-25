export const dynamic = "force-dynamic";

import { runContractReplayBacktest, type ReplayBacktestConfig } from "../../../../lib/services/contractReplayBacktester.ts";
import { loadHistoricalCandles } from "../../../../lib/services/historicalDataPipeline.ts";
import { isUnderlyingId, ALL_UNDERLYINGS } from "../../../../lib/services/instrumentRegistry.ts";
import type { Timeframe, UnderlyingId } from "../../../../lib/types.ts";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawUnderlying = (body.underlying ?? "nifty").toLowerCase();

    if (!isUnderlyingId(rawUnderlying)) {
      return Response.json(
        { error: `Unknown underlying "${rawUnderlying}". Expected one of: ${ALL_UNDERLYINGS.join(", ")}` },
        { status: 400 },
      );
    }

    const timeframe: Timeframe = body.timeframe ?? "15m";
    const { candles, verified } = loadHistoricalCandles(rawUnderlying as UnderlyingId, timeframe);

    if (candles.length === 0) {
      return Response.json(
        {
          error: `No certified historical dataset found for ${rawUnderlying} (${timeframe}). Run "npm run data:ingest" first.`,
        },
        { status: 404 },
      );
    }

    const config: ReplayBacktestConfig = {
      underlying: rawUnderlying as UnderlyingId,
      timeframe,
      startingCapital: body.startingCapital ?? 100_000,
      lots: body.lots ?? 1,
      strategyBias: body.strategyBias ?? "BOTH",
      brokerPlan: body.brokerPlan ?? "BASIC",
      targetGainPct: body.targetGainPct ?? 0.30,
      stopLossPct: body.stopLossPct ?? 0.20,
    };

    const result = runContractReplayBacktest(candles, config);

    return Response.json({
      success: true,
      datasetVerified: verified,
      result,
    });
  } catch (err) {
    return Response.json(
      { error: `Contract replay backtest failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
