// Phase 2 intraday evaluation (docs/intraday-evaluation-rules.md, frozen 2026-10-23). Pure: reads nothing, writes nothing.
import type { PaperOpportunity } from "./services/paperOpportunityStore.ts";

export const EVAL_VERSION = "intraday-eval-1";
export const EVAL_START = "2026-10-26"; // first session after the rules were frozen (IST date)
export const NOTIONAL = 100_000;        // ₹ per trade, used only to turn ₹ charges into R
export const MIN_TRADES = 150;
export const MAX_DD_R = 20;
export const MIN_PF = 1.2;
export const MIN_SESSIONS = 10; // fewer clusters than this → no interval, no verdict (bootstrap unreliable)

// Intraday equity charges, per executed order. ESTIMATE: verify against an Upstox contract note before relying on it.
export const COSTS = {
  brokerageMax: 20, brokeragePct: 0.1, // ₹20 or 0.1% of order value, whichever is lower
  sttSellPct: 0.025, exchangePct: 0.00297, sebiPct: 0.0001, stampBuyPct: 0.003, gstPct: 18,
  slippagePct: 0.05,                   // each side, against the trade
};

const ist = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);

export function orderCharges(value: number, side: "BUY" | "SELL"): number {
  const c = COSTS;
  const brokerage = Math.min(c.brokerageMax, (value * c.brokeragePct) / 100);
  const exch = (value * c.exchangePct) / 100, sebi = (value * c.sebiPct) / 100;
  return brokerage + exch + sebi + ((brokerage + exch + sebi) * c.gstPct) / 100
    + (side === "SELL" ? (value * c.sttSellPct) / 100 : 0) + (side === "BUY" ? (value * c.stampBuyPct) / 100 : 0);
}

export interface EvalTrade { id: string; session: string; side: "LONG" | "SHORT"; grossR: number; netR: number; costR: number }

// Net R for one completed trade: slippage on both fills + charges on both orders, over the original ₹ risk.
export function netTrade(o: PaperOpportunity): EvalTrade {
  const short = o.direction === "BEARISH";
  const qty = Math.max(1, Math.floor(NOTIONAL / o.entry));
  const s = COSTS.slippagePct / 100;
  const entry = short ? o.entry * (1 - s) : o.entry * (1 + s);
  const exit = short ? o.exitPrice! * (1 + s) : o.exitPrice! * (1 - s);
  const pnlPerUnit = short ? entry - exit : exit - entry;
  const charges = short
    ? orderCharges(entry * qty, "SELL") + orderCharges(exit * qty, "BUY")
    : orderCharges(entry * qty, "BUY") + orderCharges(exit * qty, "SELL");
  const risk = o.riskPerUnit * qty;
  const netR = (pnlPerUnit * qty - charges) / risk;
  const grossR = o.realizedR!;
  return { id: o.id, session: ist(o.createdAt), side: short ? "SHORT" : "LONG", grossR, netR, costR: grossR - netR };
}

export interface GroupStats {
  trades: number; sessions: number; meanNetR: number | null; ci95: [number, number] | null;
  profitFactor: number | null; winRate: number | null; cumulativeR: number; maxDrawdownR: number; meanCostR: number | null;
  verdict: "POSITIVE" | "NEGATIVE" | "INCONCLUSIVE" | "INSUFFICIENT_SAMPLE";
}

// Deterministic PRNG so the bootstrap is reproducible.
function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

// 95% interval for mean net R, resampling whole SESSIONS (trades on the same day are correlated).
export function sessionBootstrap(trades: EvalTrade[], n = 2000): [number, number] | null {
  const by = new Map<string, number[]>();
  for (const t of trades) by.set(t.session, [...(by.get(t.session) ?? []), t.netR]);
  const groups = [...by.values()];
  if (groups.length < MIN_SESSIONS) return null;
  const r = rng(42), means: number[] = [];
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let k = 0; k < groups.length; k++) { const g = groups[Math.floor(r() * groups.length)]; for (const x of g) { sum += x; cnt++; } }
    means.push(sum / cnt);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(n * 0.025)], means[Math.floor(n * 0.975)]];
}

export function groupStats(ts: EvalTrade[]): GroupStats {
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const net = ts.map((t) => t.netR);
  let cum = 0, peak = 0, dd = 0;
  for (const x of net) { cum += x; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); }
  const gp = net.filter((x) => x > 0).reduce((a, b) => a + b, 0), gl = -net.filter((x) => x < 0).reduce((a, b) => a + b, 0);
  const mean = ts.length ? net.reduce((a, b) => a + b, 0) / ts.length : null;
  const ci = sessionBootstrap(ts);
  const pf = gl > 0 ? gp / gl : null;
  let verdict: GroupStats["verdict"] = "INCONCLUSIVE";
  if (dd > MAX_DD_R || (ci && ci[1] < 0)) verdict = "NEGATIVE"; // risk breach or convincingly negative: reported at any sample size
  else if (ts.length < MIN_TRADES) verdict = "INSUFFICIENT_SAMPLE";
  else if (mean! > 0 && ci && ci[0] > 0 && pf !== null && pf >= MIN_PF) verdict = "POSITIVE";
  return {
    trades: ts.length, sessions: new Set(ts.map((t) => t.session)).size,
    meanNetR: mean === null ? null : r3(mean), ci95: ci && [r3(ci[0]), r3(ci[1])],
    profitFactor: pf === null ? null : r3(pf), winRate: ts.length ? r3(net.filter((x) => x > 0).length / ts.length) : null,
    cumulativeR: r3(cum), maxDrawdownR: r3(dd), meanCostR: ts.length ? r3(ts.reduce((a, t) => a + t.costR, 0) / ts.length) : null,
    verdict,
  };
}

export interface EvalReport {
  version: string; evalStart: string; eligible: number;
  excluded: Record<string, number>;
  combined: GroupStats; long: GroupStats; short: GroupStats;
}

// Eligible = genuine live-collector STOCK trades, created on/after EVAL_START, completed with a verified exit price.
export function evaluateIntraday(all: PaperOpportunity[], start = EVAL_START): EvalReport {
  const excluded: Record<string, number> = {};
  const skip = (why: string) => { excluded[why] = (excluded[why] ?? 0) + 1; };
  const ok: EvalTrade[] = [];
  for (const o of [...all].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (o.provenance !== "LIVE_COLLECTOR") { skip("not live-collector (fixture/legacy)"); continue; }
    if (ist(o.createdAt) < start) { skip("before evaluation start"); continue; }
    if (o.instrumentType !== "STOCK") { skip("not a stock trade"); continue; }
    if (o.status === "OPEN") { skip("still open"); continue; }
    if (o.status === "EOD_UNPRICED" || o.exitPrice == null || o.realizedR == null) { skip(`no verified exit price (${o.status})`); continue; }
    ok.push(netTrade(o));
  }
  return {
    version: EVAL_VERSION, evalStart: start, eligible: ok.length, excluded,
    combined: groupStats(ok), long: groupStats(ok.filter((t) => t.side === "LONG")), short: groupStats(ok.filter((t) => t.side === "SHORT")),
  };
}
