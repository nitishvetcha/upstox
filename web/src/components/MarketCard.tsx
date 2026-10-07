import type { Analysis } from "@/lib/types";
import { fmtDate } from "@/lib/time";
import { Badge, Card, Stat, num, signed } from "./ui";

const emaText = (e: NonNullable<NonNullable<Analysis["snapshot"]["technical"]>["emaStructure"]>) =>
  ({ STRONG_BULLISH: "9 > 21 > 50", BULLISH: "9 > 21", RANGE: "flat", BEARISH: "9 < 21", STRONG_BEARISH: "9 < 21 < 50" })[e];

export function MarketCard({ a }: { a: Analysis }) {
  const s = a.snapshot;
  const c = a.chain;
  const change = s.prevClose === null ? null : s.spot - s.prevClose;
  const trendF = a.factors.find((f) => f.key === "trend")!;
  const trendDir = trendF.direction;
  const na = "N/A";
  const t = s.technical;
  const ind = s.indicators;
  const techSrc = s.sources.technical.source;
  const fv = t?.futuresVwap ?? null;
  const futName = s.index === "nifty" ? "NIFTY" : "BANK NIFTY";
  // Real-candle trend when available; otherwise the engine's EMA factor (mock), else N/A.
  const trendLabel = t ? t.trend.state.replace("_", " ") : !trendF.available ? na : trendDir > 0.25 ? "Uptrend" : trendDir < -0.25 ? "Downtrend" : "Mixed";
  const trendDirection = t ? t.trend.direction : trendF.available ? trendDir : 0;
  const trendTone = trendDirection >= 0.2 ? "bull" : trendDirection <= -0.2 ? "bear" : undefined;
  const marketSrc = s.sources.market.source;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
            {s.name}
            <Badge tone={marketSrc === "LIVE" ? "neutral" : "warn"}>{marketSrc}</Badge>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold tabular-nums text-zinc-50">{num(s.spot)}</span>
            {change === null || !s.prevClose ? (
              <span className="font-mono text-sm text-zinc-500">change N/A</span>
            ) : (
              <span className={`font-mono text-sm tabular-nums ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {signed(change)} ({signed((change / s.prevClose) * 100)}%)
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-1">
            <Badge>{a.bias}</Badge>
            <Badge>{a.status}</Badge>
          </div>
          <span className="text-[11px] text-zinc-500">{a.regime}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Stat label={t ? `Trend (${t.timeframe})` : "Trend"} value={trendLabel} tone={trendTone} />
        <Stat label="OI support" value={num(c.support, 0)} />
        <Stat label="OI resistance" value={num(c.resistance, 0)} />
        <Stat label="OI PCR" value={c.pcrOi === null ? na : num(c.pcrOi)} />
        <Stat label="Max pain" value={num(c.maxPain, 0)} />
        <Stat label="ATM IV" value={c.atmIv.average === null ? na : `${num(c.atmIv.average, 1)}%`} />
        <Stat label="IV percentile" value={s.ivPercentile === null ? "Not available" : String(s.ivPercentile)} />
        <Stat label="Est. exp. move" value={c.expectedMove === null ? "Unavailable" : `±${num(c.expectedMove, 0)}`} />
        <Stat label="Nearest expiry" value={fmtDate(s.expiry)} />
        <Stat label="Volatility" value={a.volatilityRegime ? a.volatilityRegime.replace(" VOLATILITY", "").toLowerCase() : na} tone={a.volatilityRegime === "HIGH VOLATILITY" ? "warn" : undefined} />
        <Stat
          label={s.sources.news.source === "MOCK" ? "Sentiment (mock)" : `News ${s.news.status?.toLowerCase() ?? ""}`}
          value={s.sources.news.source === "UNAVAILABLE" ? na : `${signed(s.news.score)}${s.news.confidence !== undefined ? ` · ${Math.round(s.news.confidence * 100)}%` : ""}`}
          tone={s.news.status === "STALE" || s.sources.news.source === "UNAVAILABLE" ? "warn" : s.news.score > 0.15 ? "bull" : s.news.score < -0.15 ? "bear" : undefined}
        />
        <Stat label="Overall" value={`${a.total}/100`} />
      </div>

      <div className="mt-4 border-t border-zinc-800 pt-3">
        <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-zinc-500">
          <div className="flex items-center gap-2">
            Market Breadth
            <Badge tone={s.breadth?.status === "LIVE" ? "neutral" : s.breadth?.status === "PARTIAL" ? "neutral" : "warn"}>
              {s.breadth?.status ?? "UNAVAILABLE"}
            </Badge>
          </div>
          <span className="normal-case text-zinc-400">
            Prices: {s.sources.breadth?.provider ?? s.sources.market.provider ?? "UPSTOX"} ({s.sources.breadth?.source ?? "LIVE"}) · Universe: CONFIGURED
          </span>
        </div>
        {s.breadth && s.breadth.status !== "UNAVAILABLE" ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Stat label="Adv / Dec / Unch" value={`${s.breadth.advances} / ${s.breadth.declines} / ${s.breadth.unchanged}`} />
            <Stat label="A/D Ratio" value={s.breadth.advanceDeclineRatio.toFixed(2)} />
            <Stat label="Breadth %" value={`${signed(s.breadth.breadthPercent, 1)}%`} tone={s.breadth.breadthPercent > 10 ? "bull" : s.breadth.breadthPercent < -10 ? "bear" : undefined} />
            <Stat label="Classification" value={s.breadth.classification.replace("_", " ")} tone={s.breadth.classification.includes("BULLISH") ? "bull" : s.breadth.classification.includes("BEARISH") ? "bear" : undefined} />
            <Stat label="Price vs Breadth" value={s.breadth.priceBreadthState.replace("_", " ")} tone={s.breadth.priceBreadthState.includes("BULLISH_CONFIRMATION") ? "bull" : s.breadth.priceBreadthState.includes("BEARISH_CONFIRMATION") ? "bear" : s.breadth.priceBreadthState.includes("DIVERGENCE") ? "warn" : undefined} />
            <Stat label="Coverage" value={`${s.breadth.total}/${s.breadth.expected} (${s.breadth.coverage}%)`} />
          </div>
        ) : (
          <div className="text-xs text-zinc-500">Breadth data unavailable: {s.breadth?.reason ?? "No constituent quotes"}</div>
        )}
      </div>

      <div className="mt-4 border-t border-zinc-800 pt-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-zinc-500">
          Technicals {t ? `(${t.timeframe})` : ""}
          <Badge tone={techSrc === "LIVE" ? "neutral" : "warn"}>{techSrc === "UNAVAILABLE" ? "NOT AVAILABLE" : techSrc}</Badge>
          {t?.marketClosed && <Badge tone="warn">MARKET CLOSED · {t.sessionDate}</Badge>}
          {fv && (
            <span className="normal-case tracking-normal">
              Futures VWAP <Badge tone={fv.state === "UNAVAILABLE" ? "warn" : "neutral"}>{fv.state === "UNAVAILABLE" ? "N/A" : fv.source.source}</Badge>
              {fv.instrument && ` ${fv.instrument}`}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Stat label="Technical score" value={t?.technicalScore.score == null ? na : `${num(t.technicalScore.score, 1)}/15`} />
          <Stat label="EMA 9 / 21 / 50" value={ind ? `${num(ind.ema9, 0)} / ${num(ind.ema21, 0)} / ${num(ind.ema50, 0)}` : na} />
          <Stat label="EMA structure" value={t?.emaStructure ? emaText(t.emaStructure) : na} />
          <Stat label="EMA 200" value={ind?.ema200 == null ? na : num(ind.ema200, 0)} />
          <Stat label="RSI 14" value={ind ? `${num(ind.rsi, 1)}${t?.rsiState ? ` ${t.rsiState.toLowerCase()}` : ""}` : na} />
          {fv ? (
            <>
              <Stat label={`${futName} futures VWAP`} value={fv.vwap === null ? `N/A: ${fv.reason}` : num(fv.vwap, 1)} />
              <Stat label="Futures price" value={fv.price === null ? na : num(fv.price, 1)} />
              <Stat
                label="Futures vs VWAP"
                value={fv.state === "UNAVAILABLE" ? na : `${fv.state.replace(" VWAP", "").toLowerCase()} (${signed(fv.distance!, 1)})`}
                tone={fv.state === "ABOVE VWAP" ? "bull" : fv.state === "BELOW VWAP" ? "bear" : undefined}
              />
            </>
          ) : (
            <Stat label="VWAP" value={ind?.vwap == null ? (ind ? "N/A (no volume)" : na) : num(ind.vwap, 0)} tone={ind?.vwap == null ? undefined : s.spot > ind.vwap ? "bull" : "bear"} />
          )}
          <Stat label="MACD" value={t?.macdState ? `${t.macdState.toLowerCase()} (${signed(t.macdHistogram!, 1)})` : na} />
          <Stat label={`ATR ${t ? t.timeframe : ""} / daily`} value={t?.atr != null && ind ? `${num(t.atr, 1)} / ${num(ind.atr, 0)}` : ind ? num(ind.atr, 0) : na} />
          <Stat label="Prev day H / L" value={ind ? `${num(ind.pdh, 0)} / ${num(ind.pdl, 0)}` : na} />
          <Stat label="Prev day close" value={t?.previousDayClose == null ? na : num(t.previousDayClose, 0)} />
          <Stat label="Opening range" value={ind?.orHigh == null || ind.orLow == null ? "Not formed" : `${num(ind.orLow, 0)}–${num(ind.orHigh, 0)}${t?.openingRangeBreakout ? ` ${t.openingRangeBreakout.toLowerCase()}` : ""}`} />
          <Stat label="Price action" value={t?.priceAction ? t.priceAction.structure.toLowerCase() : na} />
        </div>
      </div>
    </Card>
  );
}
