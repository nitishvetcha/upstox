import type { Analysis } from "@/lib/types";
import { fmtDate } from "@/lib/time";
import { INSTRUMENTS, getUnderlyingInstrument } from "@/lib/services/instrumentRegistry";
import type { IndexId } from "@/lib/types";
import { Badge, Card, Stat, num, signed } from "./ui";
import { breadthBadge } from "@/lib/provenanceDisplay";
import { getTradingViewChartUrl } from "@/lib/tradingView";
import { BarChart3, ExternalLink } from "lucide-react";

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
  const futName = getUnderlyingInstrument(s.index)?.symbol ?? String(s.index).toUpperCase();
  // Real-candle trend when available; otherwise the engine's EMA factor (mock), else N/A.
  // A null trend (mock analysis carries none) falls back to the engine factor, as before.
  const trendLabel = t?.trend ? t.trend.state.replace("_", " ") : !trendF.available ? na : trendDir > 0.25 ? "Uptrend" : trendDir < -0.25 ? "Downtrend" : "Mixed";
  const trendDirection = t?.trend ? t.trend.direction : trendF.available ? trendDir : 0;
  const trendTone = trendDirection >= 0.2 ? "bull" : trendDirection <= -0.2 ? "bear" : undefined;
  const marketSrc = s.sources.market.source;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
            {s.name}
            <Badge tone={marketSrc === "LIVE" ? "neutral" : "warn"}>{marketSrc}</Badge>
            <a
              href={getTradingViewChartUrl(s.name, "15")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 text-[11px] font-medium text-sky-400 hover:text-sky-300 hover:border-sky-500 transition-colors"
              title={`Open ${s.name} TradingView Chart`}
            >
              <BarChart3 size={11} />
              <span>Chart</span>
              <ExternalLink size={9} />
            </a>
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
        <Stat label={t ? `Trend (${t.timeframe})` : "Trend"} value={trendLabel} tone={trendTone} hint="Current market direction based on moving averages" sub={trendTone === "bull" ? "Upward Momentum" : trendTone === "bear" ? "Downward Pressure" : "Sideways / Range"} />
        <Stat label="OI support" value={num(c.support, 0)} hint="Open Interest Support: Strike price where option sellers provide a floor against falling" sub="Market Safety Floor" />
        <Stat label="OI resistance" value={num(c.resistance, 0)} hint="Open Interest Resistance: Strike price where heavy call writing acts as a ceiling" sub="Overhead Ceiling" />
        <Stat label="OI PCR" value={c.pcrOi === null ? na : num(c.pcrOi)} hint="Put-Call Ratio: >1.0 indicates bullish sentiment, <0.7 indicates bearish sentiment" sub={c.pcrOi !== null ? (c.pcrOi > 1.0 ? "Bullish Sentiment" : c.pcrOi < 0.7 ? "Bearish Sentiment" : "Neutral Balance") : undefined} />
        <Stat label="Max pain" value={num(c.maxPain, 0)} hint="Strike price where option buyers lose the most money on expiry day" sub="Expiry Magnet Level" />
        <Stat label="ATM IV" value={c.atmIv.average === null ? na : `${num(c.atmIv.average, 1)}%`} hint="Implied Volatility: Higher IV means options are more expensive; lower IV means options are cheap" sub={c.atmIv.average !== null ? (c.atmIv.average > 18 ? "High Premium Cost" : "Normal Premium") : undefined} />
        <Stat label="IV percentile" value={s.ivPercentile === null ? "Not available" : String(s.ivPercentile)} hint="Percentile ranking of current volatility compared to past 1 year" sub="Volatility Rank" />
        <Stat label="Est. exp. move" value={c.expectedMove === null ? "Unavailable" : `±${num(c.expectedMove, 0)}`} hint="Estimated Expected Move based on ATM straddle premium: statistical expected range for the session" sub="Expected Daily Range" />
        <Stat label="Nearest expiry" value={fmtDate(s.expiry)} hint="Contract settlement and expiration date" sub="Contract Expiry" />
        <Stat label="Volatility" value={a.volatilityRegime ? a.volatilityRegime.replace(" VOLATILITY", "").toLowerCase() : na} tone={a.volatilityRegime === "HIGH VOLATILITY" ? "warn" : undefined} hint="Current market turbulence level" sub="Market Swings" />
        <Stat
          label={s.sources.news.source === "MOCK" ? "Sentiment (mock)" : `News ${s.news.status?.toLowerCase() ?? ""}`}
          value={s.sources.news.source === "UNAVAILABLE" ? na : `${signed(s.news.score)}${s.news.confidence !== undefined ? ` · ${Math.round(s.news.confidence * 100)}%` : ""}`}
          tone={s.news.status === "STALE" || s.sources.news.source === "UNAVAILABLE" ? "warn" : s.news.score > 0.15 ? "bull" : s.news.score < -0.15 ? "bear" : undefined}
          hint="Algorithmic news sentiment score from financial articles"
          sub={s.news.score > 0.15 ? "Positive News Tone" : s.news.score < -0.15 ? "Negative News Tone" : "Neutral Headlines"}
        />
        <Stat label="Overall Score" value={`${a.total}/100`} hint="Weighted score across Trend, OI, Price Action, Indicators, and Sentiment" sub="Multi-Factor Edge" />
      </div>

      <div className="mt-4 border-t border-zinc-800 pt-3">
        <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-zinc-500">
          <div className="flex items-center gap-2">
            Market Breadth (Stock Participation)
            {/* G1: a MOCK or unavailable breadth source never shows LIVE. */}
            <Badge tone={breadthBadge(s.sources.breadth, s.breadth?.status).tone}>
              {breadthBadge(s.sources.breadth, s.breadth?.status).text}
            </Badge>
          </div>
          <span className="normal-case text-zinc-400">
            {/* G4: no default to UPSTOX or LIVE when the metadata is missing. */}
            Prices: {s.sources.breadth?.provider ?? s.sources.market.provider ?? "UNKNOWN"} ({s.sources.breadth?.source ?? "UNKNOWN"}) · Universe: CONFIGURED
          </span>
        </div>
        {s.breadth && s.breadth.status !== "UNAVAILABLE" ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Stat label="Adv / Dec / Unch" value={`${s.breadth.advances} / ${s.breadth.declines} / ${s.breadth.unchanged}`} hint="Advances (Rising) / Declines (Falling) / Unchanged stocks in this index" sub="Green vs Red Stocks" />
            <Stat label="A/D Ratio" value={s.breadth.advanceDeclineRatio.toFixed(2)} hint="Ratio of advancing stocks to declining stocks (>1.0 is healthy broad market participation)" sub={s.breadth.advanceDeclineRatio >= 1.0 ? "More Stocks Rising" : "More Stocks Falling"} />
            <Stat label="Breadth %" value={`${signed(s.breadth.breadthPercent, 1)}%`} tone={s.breadth.breadthPercent > 10 ? "bull" : s.breadth.breadthPercent < -10 ? "bear" : undefined} hint="Net percent of stocks advancing minus declining" sub="Participation Strength" />
            <Stat label="Classification" value={s.breadth.classification.replace("_", " ")} tone={s.breadth.classification.includes("BULLISH") ? "bull" : s.breadth.classification.includes("BEARISH") ? "bear" : undefined} hint="Overall market health across underlying index constituents" sub="Breadth Health" />
            <Stat label="Price vs Breadth" value={s.breadth.priceBreadthState.replace("_", " ")} tone={s.breadth.priceBreadthState.includes("BULLISH_CONFIRMATION") ? "bull" : s.breadth.priceBreadthState.includes("BEARISH_CONFIRMATION") ? "bear" : s.breadth.priceBreadthState.includes("DIVERGENCE") ? "warn" : undefined} hint="Whether index price movement is confirmed by its member stocks" sub="Signal Alignment" />
            <Stat label="Coverage" value={`${s.breadth.total}/${s.breadth.expected} (${s.breadth.coverage}%)`} hint="Percentage of index constituents successfully loaded from exchange feed" sub="Constituent Data" />
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
            <Stat label="Spot VWAP" value={t?.vwap != null ? num(t.vwap, 0) : "N/A (index has no volume)"} tone={t?.vwap != null ? (s.spot > t.vwap ? "bull" : "bear") : undefined} />
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
