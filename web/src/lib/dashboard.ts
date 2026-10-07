// The one frontend contract for the dashboard: backend Analysis → display fields. Pure formatting/selection only —
// no score, strategy, risk or recommendation is computed here (those come from the engine). Missing values stay
// null (rendered "N/A"), never 0.
import type { Analysis, DataSource, Snapshot, Subsystem } from "./types.ts";
import type { RiskConfig } from "./services/risk/riskConfig.ts";
import { marketStatus, type MarketStatus } from "./time.ts";

export type Freshness = "LIVE" | "END_OF_DAY" | "STALE" | "UNAVAILABLE" | "MOCK";

export interface DashboardView {
  index: Snapshot["index"];
  name: string;
  market: {
    spot: number | null;
    change: number | null;
    changePercent: number | null;
    status: MarketStatus;
    freshness: Freshness;
    fetchedAt: string | null;
    lastTradeTime: string | null;
    expiry: string;
  };
  analysis: {
    score: number;
    bias: string;
    regime: string;
    setup: string;
    trend: string | null;
    volatilityRegime: string | null;
    sentiment: { score: number; confidence: number | null; status: string | null; available: boolean };
  };
  technicals: {
    rsi: number | null; vwap: number | null; futuresVwap: number | null; atr15m: number | null; atrDaily: number | null;
    ema9: number | null; ema21: number | null; ema50: number | null; ema200: number | null; macdHist: number | null;
    pdh: number | null; pdl: number | null; pdc: number | null; orHigh: number | null; orLow: number | null;
  };
  options: {
    pcr: number | null; pcrVolume: number | null; maxPain: number | null; callOi: number | null; putOi: number | null;
    callOiChange: number | null; putOiChange: number | null; atmIv: number | null; ivPercentile: number | null;
    expectedMove: number | null; atmStrike: number | null; oiAvailable: boolean;
  };
  levels: { spot: number; support: number | null; resistance: number | null; supportByOiChange: number | null; resistanceByOiChange: number | null; pdh: number | null; pdl: number | null };
  recommendation: {
    status: Analysis["status"];
    strategy: string | null;
    confidence: number;
    entry: number | null; stopLoss: number | null; target1: number | null; target2: number | null;
    riskReward: number | null; maxLoss: number | null; maxProfit: number | null; breakevens: number[];
    reasons: string[]; // backend blockers, verbatim
    risks: string[];
    executable: boolean; // TRADE with a plan on LIVE data
    noPlanMessage: string | null;
  };
  factors: { key: string; label: string; score: number; max: number; available: boolean }[];
  risk: {
    approval: "RISK APPROVED" | "RISK BLOCKED" | "NOT EVALUATED";
    basis: string; // which plan the assessment belongs to
    reasons: string[];
    lots: number | null; quantity: number | null; totalRisk: number | null; riskPercent: number | null; capitalRequired: number | null;
    limits: RiskConfig;
  };
  dataQuality: Record<Subsystem, Freshness>;
  timestamps: { lastMarketData: string | null; analysisGeneratedAt: string };
}

const q = (s: DataSource): Freshness => s;
const sumBy = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function toDashboardView(a: Analysis, limits: RiskConfig, generatedAt: string, now = new Date(generatedAt)): DashboardView {
  const s = a.snapshot;
  const i = s.indicators;
  const t = s.technical;
  const m = a.chain;
  const oiAvailable = s.chain.some((r) => r.call.oi > 0 || r.put.oi > 0);
  const chgKnown = s.chain.some((r) => r.call.chgOi !== null || r.put.chgOi !== null);
  const change = s.prevClose === null ? null : s.spot - s.prevClose;
  const plan = a.plan;
  // Risk: the recommended plan's assessment, else the top candidate's (labeled), else not evaluated.
  const assessed = plan ?? a.candidates[0] ?? null;
  const r = assessed?.risk ?? null;
  const newsF = a.factors.find((f) => f.key === "news");
  return {
    index: s.index,
    name: s.name,
    market: {
      spot: s.spot,
      change,
      changePercent: change === null || !s.prevClose ? null : (change / s.prevClose) * 100,
      status: marketStatus(now),
      freshness: q(s.sources.market.source),
      fetchedAt: s.sources.market.fetchedAt,
      lastTradeTime: s.sources.market.lastTradeTime ?? null,
      expiry: s.expiry,
    },
    analysis: {
      score: a.total,
      bias: a.bias,
      regime: a.regime,
      setup: a.setup,
      trend: t?.trend?.state ?? null,
      volatilityRegime: a.volatilityRegime,
      sentiment: { score: s.news.score, confidence: s.news.confidence ?? null, status: s.news.status ?? null, available: newsF?.available ?? false },
    },
    technicals: {
      rsi: t?.rsi ?? i?.rsi ?? null,
      vwap: t?.vwap ?? i?.vwap ?? null,
      futuresVwap: t?.futuresVwap?.vwap ?? null,
      atr15m: t?.atr ?? null,
      atrDaily: t?.dailyAtr ?? i?.atr ?? null,
      ema9: t?.ema9 ?? i?.ema9 ?? null,
      ema21: t?.ema21 ?? i?.ema21 ?? null,
      ema50: t?.ema50 ?? i?.ema50 ?? null,
      ema200: t?.ema200 ?? i?.ema200 ?? null,
      macdHist: t?.macdHistogram ?? i?.macdHist ?? null,
      pdh: t?.previousDayHigh ?? i?.pdh ?? null,
      pdl: t?.previousDayLow ?? i?.pdl ?? null,
      pdc: t?.previousDayClose ?? s.prevClose ?? null,
      orHigh: t?.openingRangeHigh ?? i?.orHigh ?? null,
      orLow: t?.openingRangeLow ?? i?.orLow ?? null,
    },
    options: {
      pcr: oiAvailable ? m.pcrOi : null,
      pcrVolume: oiAvailable ? m.pcrVolume : null,
      maxPain: oiAvailable ? m.maxPain : null,
      callOi: oiAvailable ? sumBy(s.chain.map((x) => x.call.oi)) : null,
      putOi: oiAvailable ? sumBy(s.chain.map((x) => x.put.oi)) : null,
      callOiChange: chgKnown ? sumBy(s.chain.map((x) => x.call.chgOi ?? 0)) : null,
      putOiChange: chgKnown ? sumBy(s.chain.map((x) => x.put.chgOi ?? 0)) : null,
      atmIv: m.atmIv.average,
      ivPercentile: s.ivPercentile,
      expectedMove: m.expectedMove,
      atmStrike: m.atmStrike,
      oiAvailable,
    },
    levels: {
      spot: s.spot,
      support: oiAvailable ? m.support : null,
      resistance: oiAvailable ? m.resistance : null,
      supportByOiChange: m.supportByOiChange,
      resistanceByOiChange: m.resistanceByOiChange,
      pdh: i?.pdh ?? null,
      pdl: i?.pdl ?? null,
    },
    recommendation: {
      status: a.status,
      strategy: plan?.strategy ?? null,
      confidence: plan?.score ?? a.total,
      entry: plan?.entry ?? null,
      stopLoss: plan?.stop ?? null,
      target1: plan?.target1 ?? null,
      target2: plan?.target2 ?? null,
      riskReward: plan?.rr ?? null,
      maxLoss: plan?.maxLoss ?? null,
      maxProfit: plan?.maxProfit ?? null,
      breakevens: plan?.breakevens ?? [],
      reasons: a.blockers,
      risks: a.risks,
      executable: a.status === "TRADE" && !!plan && s.sources.market.source === "LIVE",
      noPlanMessage: plan ? null : "No executable trade plan is available.",
    },
    factors: a.factors.map((f) => ({ key: f.key, label: f.label, score: f.score, max: f.max, available: f.available })),
    risk: {
      approval: !r ? "NOT EVALUATED" : r.allowed ? "RISK APPROVED" : "RISK BLOCKED",
      basis: plan ? `Recommended plan (${plan.strategy})` : assessed ? `Top candidate (${assessed.strategy}), not recommended` : "No strategy candidate was built",
      reasons: r?.humanReasons ?? [],
      lots: r?.lots ?? null,
      quantity: r?.quantity ?? null,
      totalRisk: r?.totalRisk ?? null,
      riskPercent: r?.riskPercent ?? null,
      capitalRequired: r?.capitalRequired ?? null,
      limits,
    },
    dataQuality: {
      market: q(s.sources.market.source),
      optionChain: q(s.sources.optionChain.source),
      technical: q(s.sources.technical.source),
      news: q(s.sources.news.source),
      breadth: q(s.sources.breadth.source),
    },
    timestamps: { lastMarketData: s.sources.market.lastTradeTime ?? s.sources.market.fetchedAt, analysisGeneratedAt: generatedAt },
  };
}
