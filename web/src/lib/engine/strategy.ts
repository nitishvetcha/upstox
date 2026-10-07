import type { Analysis, Leg, OptionRow, Snapshot, StrategyName, TradePlan } from "../types.ts";
import { analyzeMarket } from "./analysis.ts";
import { freshnessOf, istMinutes } from "../time.ts";
import { evaluateTradeRisk } from "../services/risk/riskService.ts";

export const MIN_STRATEGY_SCORE = 65;
const MIN_RR_DEBIT = 1.2;
const MIN_RR_CREDIT = 0.4; // credit spreads trade reward/risk for win rate
const MAX_BID_ASK_PCT = 5;

const r2 = (n: number) => Math.round(n * 100) / 100;

function row(s: Snapshot, strike: number): OptionRow | undefined {
  return s.chain.find((r) => r.strike === strike);
}

// Width for spreads/condor wings: one daily ATR, rounded up to the strike step.
function wingWidth(s: Snapshot) {
  return Math.ceil(s.indicators!.atr / s.strikeStep) * s.strikeStep;
}

function nearestDelta(s: Snapshot, type: "CE" | "PE", target: number) {
  return s.chain.reduce((a, b) => {
    const da = Math.abs(((type === "CE" ? a.call.delta : a.put.delta) ?? Infinity) - target);
    const db = Math.abs(((type === "CE" ? b.call.delta : b.put.delta) ?? Infinity) - target);
    return db < da ? b : a;
  });
}

function quote(r: OptionRow, type: "CE" | "PE") {
  return type === "CE" ? r.call : r.put;
}

function plan(
  strategy: StrategyName,
  legs: Leg[],
  p: Omit<TradePlan, "strategy" | "legs" | "entryZone" | "rr" | "score" | "rejected">,
): TradePlan {
  const rr = p.credit ? (p.entry - p.target1) / (p.stop - p.entry) : (p.target1 - p.entry) / (p.entry - p.stop);
  return {
    strategy,
    legs,
    ...p,
    entry: r2(p.entry),
    stop: r2(p.stop),
    target1: r2(p.target1),
    target2: r2(p.target2),
    entryZone: [r2(p.entry * 0.97), r2(p.entry * 1.03)],
    rr: r2(rr),
    score: 0,
    rejected: null,
  };
}

function longOption(s: Snapshot, type: "CE" | "PE"): TradePlan | null {
  const r = nearestDelta(s, type, type === "CE" ? 0.5 : -0.5);
  const q = quote(r, type);
  if (!q.ltp || q.delta === null) return null;
  // Exits from the expected premium move for a fraction of daily ATR (premium ≈ |delta| × index move).
  // ponytail: delta-only estimate ignores gamma/theta; good enough for intraday sizing, revisit for multi-day holds.
  const move = Math.abs(q.delta) * s.indicators!.atr;
  return plan(type === "CE" ? "Long Call" : "Long Put", [{ side: "BUY", type, strike: r.strike, ltp: q.ltp }], {
    credit: false,
    entry: q.ltp,
    stop: Math.max(q.ltp - 0.35 * move, q.ltp * 0.5),
    target1: q.ltp + 0.5 * move,
    target2: q.ltp + 1.0 * move,
    maxLoss: q.ltp,
    maxProfit: null,
    breakevens: [type === "CE" ? r.strike + q.ltp : r.strike - q.ltp],
  });
}

function debitSpread(s: Snapshot, type: "CE" | "PE"): TradePlan | null {
  const long = nearestDelta(s, type, type === "CE" ? 0.5 : -0.5);
  const width = wingWidth(s);
  const short = row(s, type === "CE" ? long.strike + width : long.strike - width);
  if (!short) return null;
  const lq = quote(long, type), sq = quote(short, type);
  const debit = lq.ltp - sq.ltp;
  if (debit <= 0) return null;
  const maxProfit = width - debit;
  return plan(
    type === "CE" ? "Bull Call Spread" : "Bear Put Spread",
    [
      { side: "BUY", type, strike: long.strike, ltp: lq.ltp },
      { side: "SELL", type, strike: short.strike, ltp: sq.ltp },
    ],
    {
      credit: false,
      entry: debit,
      stop: debit * 0.5,
      target1: debit + 0.5 * maxProfit,
      target2: debit + 0.8 * maxProfit,
      maxLoss: r2(debit),
      maxProfit: r2(maxProfit),
      breakevens: [r2(type === "CE" ? long.strike + debit : long.strike - debit)],
    },
  );
}

// Entry is the TOTAL premium (call + put); every exit is computed from that total, never from one leg.
export function straddle(s: Snapshot, atmStrike: number): TradePlan | null {
  const r = row(s, atmStrike);
  if (!r || !r.call.ltp || !r.put.ltp) return null;
  const total = r.call.ltp + r.put.ltp;
  return plan(
    "ATM Straddle",
    [
      { side: "BUY", type: "CE", strike: r.strike, ltp: r.call.ltp },
      { side: "BUY", type: "PE", strike: r.strike, ltp: r.put.ltp },
    ],
    {
      credit: false,
      entry: total,
      stop: total * 0.8,
      target1: total * 1.25,
      target2: total * 1.5,
      maxLoss: r2(total),
      maxProfit: null,
      breakevens: [r2(r.strike - total), r2(r.strike + total)],
    },
  );
}

function ironCondor(s: Snapshot, support: number, resistance: number): TradePlan | null {
  const width = wingWidth(s);
  const sc = row(s, resistance), lc = row(s, resistance + width);
  const sp = row(s, support), lp = row(s, support - width);
  if (!sc || !lc || !sp || !lp || support >= resistance) return null;
  const credit = sc.call.ltp + sp.put.ltp - lc.call.ltp - lp.put.ltp;
  if (credit <= 0) return null;
  return plan(
    "Iron Condor",
    [
      { side: "SELL", type: "CE", strike: sc.strike, ltp: sc.call.ltp },
      { side: "BUY", type: "CE", strike: lc.strike, ltp: lc.call.ltp },
      { side: "SELL", type: "PE", strike: sp.strike, ltp: sp.put.ltp },
      { side: "BUY", type: "PE", strike: lp.strike, ltp: lp.put.ltp },
    ],
    {
      credit: true,
      entry: credit,
      stop: credit * 2, // buy back at 2× credit = loss of one credit
      target1: credit * 0.5,
      target2: credit * 0.2,
      maxLoss: r2(width - credit),
      maxProfit: r2(credit),
      breakevens: [r2(sp.strike - credit), r2(sc.strike + credit)],
    },
  );
}

function legRejection(s: Snapshot, p: TradePlan): string | null {
  for (const leg of p.legs) {
    const r = row(s, leg.strike);
    if (!r) return `${leg.strike} ${leg.type} not in option chain`;
    const q = quote(r, leg.type);
    if (!q.ltp || q.bid === null || q.ask === null) return `No two-sided quote on ${leg.strike} ${leg.type}`;
    const pct = ((q.ask - q.bid) / q.ltp) * 100;
    if (pct > MAX_BID_ASK_PCT) return `Bid-ask spread too wide on ${leg.strike} ${leg.type} (${pct.toFixed(1)}%)`;
  }
  const minRr = p.credit ? MIN_RR_CREDIT : MIN_RR_DEBIT;
  if (p.rr < minRr) return `Risk/reward 1:${p.rr} below minimum 1:${minRr}`;
  return null;
}

// Market and option chain go stale after 120 s, news after 60 min (freshnessOf thresholds × 30).
export function staleness(s: Snapshot, now: Date): string[] {
  const stale = (sub: keyof Snapshot["sources"], slow = 1) =>
    s.sources[sub].source !== "UNAVAILABLE" && freshnessOf(s.sources[sub].fetchedAt, now, slow).freshness === "STALE";
  const out: string[] = [];
  if (s.sources.market.source === "END_OF_DAY" || s.breadth?.status === "END_OF_DAY") {
    out.push("Market closed: quotes are end-of-day (END_OF_DAY)");
  }
  if (stale("market")) out.push("Market data is stale");
  if (stale("optionChain")) out.push("Option chain is stale");
  if (stale("news", 30)) out.push("News is stale");
  if (stale("technical", 2.5)) out.push("Technical data is stale"); // > 5 min
  if (stale("breadth", 1.25)) out.push("Market breadth is stale");
  if (s.news.status === "STALE") out.push(`News is stale${s.news.detail?.reason ? `: ${s.news.detail.reason}` : ""}`);
  const fv = s.technical?.futuresVwap;
  if (fv && fv.state !== "UNAVAILABLE" && freshnessOf(fv.source.fetchedAt, now, 2.5).freshness === "STALE") out.push("Futures VWAP data is stale");
  if (s.technical?.marketClosed && !out.some((x) => x.includes("END_OF_DAY"))) out.push(`Market closed: latest candles are from ${s.technical.sessionDate}`);
  return out;
}

import type { RiskConfig } from "../services/risk/riskConfig.ts";
import type { RiskInputs } from "../services/risk/riskTypes.ts";

export function analyze(
  s: Snapshot,
  now = new Date(),
  overrideRiskConfig?: Partial<RiskConfig>,
  riskInputs?: RiskInputs,
): Analysis {
  const m = analyzeMarket(s, now);
  // Every factor must be scored from the same kind of data; otherwise no strategy is built at all.
  const missing = m.factors.filter((f) => !f.available).map((f) => f.label);
  const ivp = s.ivPercentile ?? 50;
  const dirScore = m.total;
  // Range strategies need evidence of a range, not just conflicting signals.
  const i = s.indicators!;
  const rangeScore = missing.length ? 0 :
    (s.spot < i.pdh && s.spot > i.pdl ? 25 : 0) +
    (i.orHigh !== null && i.orLow !== null && s.spot < i.orHigh && s.spot > i.orLow ? 15 : 0) +
    (Math.abs(i.ema9 - i.ema21) < 0.1 * i.atr ? 20 : 0) +
    (i.rsi > 40 && i.rsi < 60 ? 15 : 0) +
    (Math.abs(m.direction) < 0.15 ? 25 : 0);

  const build: [() => TradePlan | null, number][] = [];
  const bull = m.direction >= 0;
  switch (missing.length ? null : m.regime) {
    case "STRONG BULLISH":
    case "BULLISH":
    case "STRONG BEARISH":
    case "BEARISH":
      build.push([() => longOption(s, bull ? "CE" : "PE"), dirScore - (ivp > 60 ? 10 : 0)]);
      build.push([() => debitSpread(s, bull ? "CE" : "PE"), dirScore + (ivp > 50 ? 5 : -3)]);
      break;
    case "HIGH VOLATILITY":
      build.push([() => debitSpread(s, bull ? "CE" : "PE"), dirScore]);
      break;
    case "RANGE":
      if (ivp >= 40) build.push([() => ironCondor(s, m.chain.support, m.chain.resistance), rangeScore]);
      break;
    case "EVENT RISK": {
      // Straddle only when past comparable events moved more than the premium paid.
      const st = straddle(s, m.chain.atmStrike);
      if (st && (s.news.eventMoveHistory ?? 0) > st.entry) build.push([() => st, 70]);
      break;
    }
  }

  const candidates: TradePlan[] = build
    .map(([make, score]) => {
      const p = make();
      if (!p) return null;
      const legRej = legRejection(s, p);
      const risk = evaluateTradeRisk(p, s, riskInputs, overrideRiskConfig, now);
      const rejected = legRej || (!risk.allowed ? (risk.humanReasons[0] ?? "Risk validation failed") : null);
      const plan: TradePlan = { ...p, score: Math.min(100, score), rejected, risk };
      return plan;
    })
    .filter((p): p is TradePlan => p !== null)
    .sort((a, b) => b.score - a.score);

  const stale = staleness(s, now);
  const best = candidates.find((c) => !c.rejected && c.risk?.allowed && c.score >= MIN_STRATEGY_SCORE) ?? null;
  const { minutes } = istMinutes(now);
  const openingWindow = minutes >= 555 && minutes < 570; // 09:15–09:30 IST
  const usable = candidates.filter((c) => !c.rejected);

  const blockers: string[] = [...stale];
  if (missing.includes("News sentiment") && s.sources.news.source !== s.sources.market.source)
    blockers.push("Full confirmation requires live news data");
  if (missing.length) blockers.push(`Not enough comparable data to trade: ${missing.join(", ")} unavailable`);
  if (openingWindow) blockers.push("Opening 15 minutes: waiting for market confirmation");
  if (!best && !missing.length) {
    if (m.regime === "EVENT RISK") blockers.push(`Event risk: ${s.news.eventRisk}`);
    else if (!candidates.length && m.regime === "RANGE") blockers.push("Range-bound with cheap IV: no defined-risk edge");
    for (const c of candidates) if (c.rejected) blockers.push(`${c.strategy}: ${c.rejected}`);
    if (usable.length) blockers.push(`Best strategy score ${usable[0].score} is below the ${MIN_STRATEGY_SCORE} threshold`);
    if (blockers.length === stale.length) blockers.push("Signals conflict: no strategy qualifies");
  }

  // News is confirmation only: a confident, strong news view against market + option-chain direction means WAIT.
  const newsF = m.factors.find((f) => f.key === "news")!;
  const marketFs = m.factors.filter((f) => f.available && ["trend", "oi", "price", "technical"].includes(f.key));
  const marketW = marketFs.reduce((t, f) => t + f.max, 0);
  const marketD = marketW ? marketFs.reduce((t, f) => t + f.max * f.direction, 0) / marketW : 0;
  const newsConf = s.news.confidence ?? 1;
  const conflict = newsF.available && newsConf >= 0.5 && Math.abs(s.news.score) >= 0.4 && Math.abs(marketD) >= 0.15 && Math.sign(marketD) !== Math.sign(s.news.score);
  if (conflict) blockers.push("News direction conflicts with market and option-chain signals.");

  const risks: string[] = [];
  const ev = s.news.detail?.eventRisk;
  if (ev && ev.level !== "NONE" && ev.level !== "LOW") risks.push(`${ev.level} event risk: ${ev.reason}`);
  if (conflict) risks.push("News contradicts the market/option-chain direction");

  let status: Analysis["status"];
  const isEod = s.sources.market.source === "END_OF_DAY" || s.breadth?.status === "END_OF_DAY";
  if (stale.length || missing.length) status = "NO TRADE";
  else if (best) status = openingWindow || conflict || isEod ? "WAIT" : "TRADE";
  else if (m.regime === "EVENT RISK" || isEod) status = "WAIT";
  else if (candidates.length && !usable.length) status = "NO TRADE"; // liquidity / risk-reward failed
  else status = m.total >= 50 ? "WAIT" : "NO TRADE";

  return { snapshot: s, ...m, candidates, plan: (status === "TRADE" || openingWindow) && !isEod ? best : null, status, blockers, stale, risks };
}

// One primary idea: the strongest TRADE, else the strongest WAIT, else the higher-scoring index.
export function recommendationOfTheDay(analyses: Analysis[]): Analysis {
  const rank = { TRADE: 2, WAIT: 1, "NO TRADE": 0 } as const;
  return [...analyses].sort(
    (a, b) => rank[b.status] - rank[a.status] || (b.plan?.score ?? b.total) - (a.plan?.score ?? a.total),
  )[0];
}
