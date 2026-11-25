export const dynamic = "force-dynamic";

import { runStatisticalValidation } from "../../../../lib/services/walkForwardValidator.ts";
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

    const report = runStatisticalValidation(
      candles,
      {
        underlying: rawUnderlying as UnderlyingId,
        timeframe,
        startingCapital: body.startingCapital ?? 100_000,
        lots: body.lots ?? 1,
        brokerPlan: body.brokerPlan ?? "BASIC",
      },
      {
        inSampleRatio: body.inSampleRatio ?? 0.70,
        bootstrapSamples: body.bootstrapSamples ?? 1000,
      },
    );

    return Response.json({
      success: true,
      datasetVerified: verified,
      report,
    });
  } catch (err) {
    return Response.json(
      { error: `Statistical walk-forward validation failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
