import type { NextRequest } from "next/server";
import { sourceMeta, withFallback } from "@/lib/services/market";
import { INSTRUMENTS, isIndexId } from "@/lib/services/instrumentRegistry";
import { DEFAULT_TIMEFRAME, TIMEFRAMES, isTimeframe } from "@/lib/services/candles";
import { chartSeries } from "@/lib/services/technicalAnalysis";
import { FALLBACK_LABELS } from "@/lib/fallback";

// GET /api/technical/nifty?timeframe=15m   (5m | 15m | 30m | 1h | 1d)
export async function GET(req: NextRequest, ctx: RouteContext<"/api/technical/[index]">) {
  const { index } = await ctx.params;
  if (!isIndexId(index)) return Response.json({ error: `Unknown index: ${index}` }, { status: 404 });
  const tf = req.nextUrl.searchParams.get("timeframe") ?? DEFAULT_TIMEFRAME;
  if (!isTimeframe(tf)) return Response.json({ error: `timeframe must be one of ${TIMEFRAMES.join(", ")}` }, { status: 400 });

  const { data, fallbackReason } = await withFallback(async (p) => {
    const [tech, series] = await Promise.all([p.getTechnicals(index, tf), p.getCandles(index, tf)]);
    return { tech, series };
  });
  const t = data.tech.analysis;
  const meta = sourceMeta(data.tech.source, new Date(), 2.5);
  return Response.json({
    index: INSTRUMENTS[index].symbol,
    timeframe: tf,
    status: data.tech.source.source === "UNAVAILABLE" ? "UNAVAILABLE" : meta.freshness,
    unavailableReason: data.tech.unavailableReason ?? (t ? null : "Technical data not available"),
    price: t?.price ?? null,
    ema9: t?.ema9 ?? null,
    ema21: t?.ema21 ?? null,
    ema50: t?.ema50 ?? null,
    ema200: t?.ema200 ?? null,
    emaStructure: t?.emaStructure ?? null,
    rsi: t?.rsi ?? null,
    rsiState: t?.rsiState ?? null,
    vwap: t?.vwap ?? null, // spot VWAP: null for indices (no volume)
    vwapState: t?.vwapState ?? null,
    futuresVwap: (() => {
      const f = t?.futuresVwap;
      if (!f) return null;
      return {
        label: `${INSTRUMENTS[index].symbol} FUTURES VWAP`,
        instrument: f.instrument,
        instrumentKey: f.instrumentKey,
        expiry: f.expiry,
        timeframe: f.timeframe,
        price: f.price,
        vwap: f.vwap,
        distance: f.distance,
        distancePercent: f.distancePercent,
        state: f.state,
        reason: f.reason,
        sessionDate: f.sessionDate,
        candleCount: f.candleCount,
        status: f.state === "UNAVAILABLE" ? "UNAVAILABLE" : sourceMeta(f.source, new Date(), 2.5).freshness,
        ...sourceMeta(f.source, new Date(), 2.5),
      };
    })(),
    atr: t?.atr ?? null,
    atrPercent: t?.atrPercent ?? null,
    dailyAtr: t?.dailyAtr ?? null,
    macd: t?.macd ?? null,
    macdSignal: t?.macdSignal ?? null,
    macdHistogram: t?.macdHistogram ?? null,
    macdState: t?.macdState ?? null,
    previousDayHigh: t?.previousDayHigh ?? null,
    previousDayLow: t?.previousDayLow ?? null,
    previousDayClose: t?.previousDayClose ?? null,
    openingRangeHigh: t?.openingRangeHigh ?? null,
    openingRangeLow: t?.openingRangeLow ?? null,
    openingRangeBreakout: t?.openingRangeBreakout ?? null,
    trend: t?.trend ?? null,
    priceAction: t?.priceAction ?? null,
    volatilityRegime: t?.volatilityRegime ?? null,
    technicalScore: t?.technicalScore ?? null,
    sessionDate: t?.sessionDate ?? null,
    marketClosed: t?.marketClosed ?? null,
    candleCount: t?.candleCount ?? 0,
    lastCandleAt: t?.lastCandleAt ?? null,
    series: chartSeries(data.series.candles),
    ...meta,
    fallbackReason,
    fallbackMessage: fallbackReason && FALLBACK_LABELS[fallbackReason],
  });
}
