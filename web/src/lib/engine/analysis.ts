import type { Bias, ChainMetrics, Factor, Regime, Setup, Snapshot, Subsystem } from "../types.ts";
import { chainMetrics } from "../services/optionChainAnalytics.ts";
import { volatilityRegime } from "../services/technicalAnalysis.ts";

export { chainMetrics };

const clamp = (x: number, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, x));
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (n: number, d = 0) => n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d });
type Note = Factor["notes"][number];
type Computed = { direction: number; notes: Note[] } | null; // null = inputs missing

// Each check: [bullish?, text if true, text if false].
function binary(checks: [boolean, string, string][]) {
  return {
    direction: avg(checks.map(([c]) => (c ? 1 : -1))),
    notes: checks.map(([c, y, n]): Note => ({ text: c ? y : n, sign: c ? 1 : -1 })),
  };
}

function rawFactors(s: Snapshot, m: ChainMetrics) {
  const i = s.indicators;

  const trend: Computed = i
    ? binary([
        [i.ema9 > i.ema21, "EMA 9 above EMA 21", "EMA 9 below EMA 21"],
        [i.ema21 > i.ema50, "EMA 21 above EMA 50", "EMA 21 below EMA 50"],
        [s.spot > i.ema50, "Price above EMA 50", "Price below EMA 50"],
        ...(i.ema200 === null
          ? []
          : [[i.ema50 > i.ema200, "EMA 50 above EMA 200 (long-term uptrend)", "EMA 50 below EMA 200 (long-term downtrend)"] as [boolean, string, string]]),
      ])
    : null;

  const callAdd = s.chain.reduce((t, r) => t + (r.call.chgOi ?? 0), 0);
  const putAdd = s.chain.reduce((t, r) => t + (r.put.chgOi ?? 0), 0);
  const hasChg = s.chain.some((r) => r.call.chgOi !== null || r.put.chgOi !== null);
  const pcr = m.pcrOi;
  const pcrD = pcr === null ? 0 : clamp((pcr - 1) / 0.3);
  const oiD = hasChg ? (putAdd - callAdd) / (Math.abs(putAdd) + Math.abs(callAdd) || 1) : 0;
  const roomD = m.resistance > m.support ? clamp((m.resistance - s.spot - (s.spot - m.support)) / (m.resistance - m.support)) : 0;
  // No OI at all (e.g. historical backtests: observed OI not available) → no positioning information: neutral,
  // instead of reading support/resistance/PCR out of zeros.
  const oiKnown = s.chain.some((r) => r.call.oi > 0 || r.put.oi > 0);
  const optionChain: Computed = !oiKnown
    ? { direction: 0, notes: [{ text: "Open interest not available: option-chain positioning carries no direction", sign: 0 }] }
    : {
    direction: avg([pcrD, oiD, roomD]),
    notes: [
      {
        text:
          pcr === null
            ? "OI PCR unavailable (no call OI)"
            : `OI PCR ${pcr.toFixed(2)}${pcr > 1.1 ? ": put writing outweighs call writing" : pcr < 0.9 ? ": call writing outweighs put writing" : ": balanced positioning"}`,
        sign: pcr === null ? 0 : pcr > 1.1 ? 1 : pcr < 0.9 ? -1 : 0,
      },
      {
        text: hasChg
          ? `Today's OI change: puts ${putAdd >= 0 ? "+" : ""}${fmt(putAdd)}, calls ${callAdd >= 0 ? "+" : ""}${fmt(callAdd)}`
          : "Change in OI unavailable",
        sign: Math.sign(oiD) as Note["sign"],
      },
      {
        text: `OI support ${fmt(m.support)} (max put OI), OI resistance ${fmt(m.resistance)} (max call OI)`,
        sign: Math.abs(roomD) < 0.2 ? 0 : (Math.sign(roomD) as Note["sign"]),
      },
    ],
  };

  let priceAction: Computed = null;
  let technical: Computed = null;
  if (i) {
    const orFormed = i.orHigh !== null && i.orLow !== null;
    const orD = !orFormed ? 0 : s.spot > i.orHigh! ? 1 : s.spot < i.orLow! ? -1 : 0;
    const structure = s.technical?.priceAction?.structure;
    const structD = structure === "BULLISH STRUCTURE" ? 1 : structure === "BEARISH STRUCTURE" ? -1 : 0;
    const pdD = s.spot > i.pdh ? 1 : s.spot < i.pdl ? -1 : clamp((s.spot - (i.pdh + i.pdl) / 2) / ((i.pdh - i.pdl) / 2));
    const chg = s.prevClose === null ? 0 : s.spot - s.prevClose;
    const chgD = clamp(chg / (i.atr * 0.5));
    priceAction = {
      direction: avg(structure ? [orD, pdD, chgD, structD] : [orD, pdD, chgD]),
      notes: [
        {
          text: !orFormed ? "Opening range not formed yet" : orD > 0 ? "Above opening range high" : orD < 0 ? "Below opening range low" : "Inside the opening range",
          sign: orD,
        },
        ...(structure ? [{ text: `Recent candles: ${structure.toLowerCase()}`, sign: structD }] : []),
        {
          text: s.spot > i.pdh ? "Above previous day high" : s.spot < i.pdl ? "Below previous day low" : "Inside previous day's range",
          sign: s.spot > i.pdh ? 1 : s.spot < i.pdl ? -1 : 0,
        },
        { text: `${chg >= 0 ? "Up" : "Down"} ${fmt(Math.abs(chg), 1)} pts on the day`, sign: Math.abs(chgD) < 0.2 ? 0 : Math.sign(chgD) },
      ] as Note[],
    };

    const rsiD = clamp((i.rsi - 50) / 15);
    // Live: futures price vs FUTURES VWAP (a state, never spot vs futures). Mock: spot VWAP.
    const fv = i.futuresVwapState ?? null;
    const vwapD = fv ? (fv === "ABOVE VWAP" ? 1 : fv === "BELOW VWAP" ? -1 : 0) : i.vwap === null ? null : s.spot > i.vwap ? 1 : -1;
    const vwapNote: Note = fv
      ? { text: `Futures price ${fv === "AT VWAP" ? "at" : fv === "ABOVE VWAP" ? "above" : "below"} futures VWAP`, sign: vwapD as Note["sign"] }
      : i.vwap === null
        ? { text: s.technical?.futuresVwap ? `Futures VWAP unavailable: ${s.technical.futuresVwap.reason}` : "VWAP unavailable (index candles carry no volume)", sign: 0 }
        : { text: s.spot > i.vwap ? "Price above VWAP" : "Price below VWAP", sign: vwapD as Note["sign"] };
    technical = {
      direction: avg(vwapD === null ? [rsiD, Math.sign(i.macdHist)] : [vwapD, rsiD, Math.sign(i.macdHist)]),
      notes: [
        vwapNote,
        {
          text: `RSI ${i.rsi.toFixed(1)}${i.rsi > 55 ? " (bullish momentum)" : i.rsi < 45 ? " (bearish momentum)" : " (no clear momentum)"}`,
          sign: i.rsi > 55 ? 1 : i.rsi < 45 ? -1 : 0,
        },
        { text: i.macdHist >= 0 ? "MACD histogram positive" : "MACD histogram negative", sign: i.macdHist >= 0 ? 1 : -1 },
      ] as Note[],
    };
  }

  const ivp = s.ivPercentile;
  const atmIv = m.atmIv.average;
  const ivQ = ivp === null ? 0 : ivp < 30 ? 1 : ivp < 60 ? 0.5 : ivp < 80 ? -0.3 : -1;
  const volatility: Computed = {
    direction: ivQ,
    notes: [
      {
        text:
          (atmIv === null ? "ATM IV unavailable" : `ATM IV ${atmIv.toFixed(1)}%`) +
          (ivp === null
            ? "; IV percentile not available (no IV history yet)"
            : `, IV percentile ${ivp}${ivp < 30 ? ": premiums cheap" : ivp < 60 ? ": acceptable" : ivp < 80 ? ": elevated" : ": extreme"}`),
        sign: ivQ > 0 ? 1 : ivQ < 0 ? -1 : 0,
      },
    ],
  };

  const n = s.news;
  const d = n.detail;
  const newsCurrent = !n.status || n.status === "LIVE" || n.status === "AGING";
  const sgn = (x: number, t = 0.15): Note["sign"] => (x > t ? 1 : x < -t ? -1 : 0);
  // Real news counts as score × confidence (a confident +0.7 outweighs an uncertain +0.7); mock keeps its score.
  const news: Computed = !newsCurrent
    ? null
    : d
      ? {
          direction: clamp(n.score * (n.confidence ?? 0)),
          notes: [
            {
              text: `${d.bullishCount} relevant bullish, ${d.bearishCount} bearish of ${d.articleCount} articles (score ${n.score >= 0 ? "+" : ""}${n.score.toFixed(2)}, confidence ${Math.round((n.confidence ?? 0) * 100)}%)`,
              sign: sgn(n.score),
            },
            ...(d.sectorScore !== null && Math.abs(d.sectorScore) > 0.1
              ? [{ text: `Banking-sector sentiment ${d.sectorScore > 0 ? "positive" : "negative"} (${d.sectorScore > 0 ? "+" : ""}${d.sectorScore.toFixed(2)})`, sign: sgn(d.sectorScore, 0.1) }]
              : []),
          ],
        }
      : {
          direction: clamp(n.score),
          notes: [{ text: `News sentiment ${n.score >= 0 ? "+" : ""}${n.score.toFixed(2)} (${n.bullishPct}% bullish, ${n.bearishPct}% bearish)`, sign: sgn(n.score) }],
        };

  let breadth: Computed = null;
  if (s.breadth && (s.breadth.status === "LIVE" || s.breadth.status === "PARTIAL")) {
    const b = s.breadth;
    const d = b.signal;
    const sign = Math.abs(d) < 0.15 ? 0 : (Math.sign(d) as Note["sign"]);
    breadth = {
      direction: d,
      notes: [
        {
          text: `Breadth: ${b.advances} advancing, ${b.declines} declining, ${b.unchanged} unchanged (A/D ${b.advanceDeclineRatio.toFixed(2)}, ${b.breadthPercent >= 0 ? "+" : ""}${b.breadthPercent.toFixed(1)}%)`,
          sign,
        },
        { text: `Breadth classification: ${b.classification.replace("_", " ")}`, sign },
        {
          text: `Price vs Breadth: ${b.priceBreadthState.replace("_", " ").toLowerCase()}`,
          sign: b.priceBreadthState.includes("BULLISH") ? 1 : b.priceBreadthState.includes("BEARISH") ? -1 : 0,
        },
      ],
    };

    if (trend) {
      const bSign = Math.sign(d);
      const tSign = Math.sign(trend.direction);
      if (tSign !== 0 && bSign !== 0 && tSign === bSign) {
        trend.notes.push({
          text: `Market breadth confirms ${tSign > 0 ? "bullish" : "bearish"} market structure`,
          sign: tSign as Note["sign"],
        });
      } else if (tSign !== 0 && bSign !== 0 && tSign !== bSign) {
        trend.notes.push({
          text: `${bSign < 0 ? "Bearish" : "Bullish"} breadth divergence (${b.breadthPercent >= 0 ? "+" : ""}${b.breadthPercent.toFixed(1)}%) reduces structure confidence`,
          sign: (-tSign) as Note["sign"],
        });
        trend.direction = clamp(0.75 * trend.direction + 0.25 * d);
      }
    }
  }

  const rows: [string, string, number, Subsystem, Computed][] = [
    ["trend", "Market trend", 20, "technical", trend],
    ["oi", "Option chain / OI", 20, "optionChain", optionChain],
    ["price", "Price action", 15, "technical", priceAction],
    ["technical", "Technical indicators", 15, "technical", technical],
    ["iv", "Volatility / IV", 10, "optionChain", volatility],
    ["news", "News sentiment", 10, "news", news],
    ["breadth", "Breadth / confirmation", 10, "breadth", breadth],
  ];

  // A factor counts only when its inputs exist AND come from the same kind of source as the market data:
  // live prices are never scored together with mock indicators or mock news.
  const base = s.sources.market.source;
  return rows.map(([key, label, max, sub, c]) => {
    const src = s.sources[sub]?.source ?? "UNAVAILABLE";
    const available = c !== null && src === base;
    const why =
      key === "news" && c === null && src !== "UNAVAILABLE"
        ? `${(s.news.status ?? "").toLowerCase()}${s.news.detail?.reason ? ` (${s.news.detail.reason})` : ""}`
        : c === null || src === "UNAVAILABLE"
          ? sub === "news" && s.news.detail?.reason ? `unavailable (${s.news.detail.reason})` : "not available yet"
          : `${src.toLowerCase()} data while market data is ${base.toLowerCase()}`;
    return {
      key,
      label,
      max,
      available,
      direction: available ? c!.direction : 0,
      notes: available ? c!.notes : [{ text: `${label}: ${why}`, sign: 0 as const }],
    };
  });
}

const QUALITY = new Set(["iv"]); // not directional: scored on how good, not which way

export function analyzeMarket(s: Snapshot, now = new Date()) {
  const chain = chainMetrics(s, now);
  const raw = rawFactors(s, chain);
  const directional = raw.filter((f) => f.available && !QUALITY.has(f.key));
  const weight = directional.reduce((t, f) => t + f.max, 0);
  // Weighted direction across available factors: -1 all bearish .. +1 all bullish.
  const D = weight ? directional.reduce((t, f) => t + f.max * f.direction, 0) / weight : 0;
  const sideSign = D >= 0 ? 1 : -1;

  // Points for agreeing with the dominant side, so conflicting signals land near 50.
  // Note signs are flipped to mean "supports the call" (+1) / "argues against" (-1).
  const factors: Factor[] = raw.map((f) => {
    const s = QUALITY.has(f.key) ? 1 : sideSign;
    return {
      ...f,
      score: f.available ? Math.round(f.max * ((1 + s * f.direction) / 2) * 10) / 10 : 0,
      notes: f.notes.map((n) => ({ ...n, sign: (n.sign * s) as Note["sign"] })),
    };
  });
  const total = Math.round(factors.reduce((t, f) => t + f.score, 0));

  const bias: Bias = D > 0.15 ? "BULLISH" : D < -0.15 ? "BEARISH" : "NEUTRAL";
  // Event risk is protective: real news can raise it even when stale; mock news never can.
  const newsUsable = s.sources.news.source === s.sources.market.source;
  // Volatility comes from real daily ATR % and ATM IV; it outranks any technical trend (only event risk ranks higher).
  const atrPct = s.indicators ? (s.indicators.atr / s.spot) * 100 : null;
  const volRegime = volatilityRegime(atrPct, chain.atmIv.average);
  const regime: Regime = newsUsable && s.news.eventRisk
    ? "EVENT RISK"
    : (s.ivPercentile ?? 0) > 85 || volRegime === "HIGH VOLATILITY"
      ? "HIGH VOLATILITY"
      : D > 0.6
        ? "STRONG BULLISH"
        : D > 0.15
          ? "BULLISH"
          : D < -0.6
            ? "STRONG BEARISH"
            : D < -0.15
              ? "BEARISH"
              : "RANGE";
  const setup: Setup = total >= 80 ? "STRONG SETUP" : total >= 65 ? "VALID SETUP" : total >= 50 ? "WEAK SETUP" : "NO TRADE";

  return { chain, factors, total, bias, regime, setup, direction: D, volatilityRegime: volRegime };
}
