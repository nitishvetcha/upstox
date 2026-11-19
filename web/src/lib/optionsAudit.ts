// Phase 4 options data audit (docs/options-data-audit.md, options-audit-1). Pure: no I/O.
import type { OptionRow } from "./types.ts";
import { bs } from "./services/mock.ts";
import { FILTERS } from "./engine/opportunityEngine.ts";

export const AUDIT_VERSION_LEGACY = "options-audit-1";
export const AUDIT_VERSION = "options-audit-1a";
export const LIVE_MAX_AGE_S = 60;
export const PRICE_TOL = 0.02;
export const MIN_SESSIONS = 5, MIN_ROUNDS_PER_SESSION = 6, PASS_SHARE = 0.95;
export const IV_MEDIAN_MAX = 1.0, IV_P95_MAX = 3.0;
export const MAX_FAILED_ROUND_SHARE = 0.05; // errored/skipped rounds beyond this → cannot judge

// Years to 15:30 IST on the expiry date.
export function yearsToExpiry(expiry: string, now: Date): number {
  return (new Date(`${expiry}T15:30:00+05:30`).getTime() - now.getTime()) / (365 * 86_400_000);
}

// IV in percent from a price, by bisection on the app's Black-Scholes (same risk-free rate). null if not solvable.
export function impliedVolPct(price: number, S: number, K: number, T: number, type: "CE" | "PE"): number | null {
  if (!(price > 0 && S > 0 && K > 0 && T > 0)) return null;
  const f = (v: number) => (type === "CE" ? bs(S, K, T, v).call : bs(S, K, T, v).put) - price;
  let lo = 0.001, hi = 5;
  if (f(lo) > 0 || f(hi) < 0) return null; // below intrinsic or absurd
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) hi = mid; else lo = mid; }
  return ((lo + hi) / 2) * 100;
}

// ── A. Mapping ────────────────────────────────────────────────────────────────
export interface RawContract { instrument_key?: string; strike_price?: number; instrument_type?: string; expiry?: string; lot_size?: number }

export function mappingCheck(contracts: RawContract[], rows: OptionRow[], quotedTokens: Set<string>, sampleKeys: string[], today: string) {
  const issues: string[] = [];
  if (!contracts.length) issues.push("no option contracts listed");
  const expiries = [...new Set(contracts.map((c) => c.expiry).filter(Boolean) as string[])].sort();
  if (expiries.some((e) => e < today)) issues.push(`past expiry listed: ${expiries.filter((e) => e < today).join(",")}`);
  if (!contracts.some((c) => (c.lot_size ?? 0) > 0)) issues.push("no positive lot size");
  const master = new Map(contracts.map((c) => [c.instrument_key, c]));
  for (const key of sampleKeys) {
    const m = master.get(key);
    const row = rows.find((r) => r.call.instrumentKey === key || r.put.instrumentKey === key);
    if (!m) { issues.push(`${key}: in chain but not in contract master`); continue; }
    const type = row?.call.instrumentKey === key ? "CE" : "PE";
    if (row && (m.strike_price !== row.strike || m.instrument_type !== type)) issues.push(`${key}: chain ${row.strike}${type} vs master ${m.strike_price}${m.instrument_type}`);
    if (!quotedTokens.has(key)) issues.push(`${key}: quote did not return this instrument`);
  }
  return { pass: issues.length === 0, nearestExpiry: expiries[0] ?? null, expiries: expiries.length, issues };
}

// ── B/C/D. One sampling round ─────────────────────────────────────────────────
export interface QuoteEntry { last_price?: number; last_trade_time?: number | string }
export interface Sample {
  key: string; strike: number; type: "CE" | "PE"; liquid: boolean;
  ageS: number | null; live: boolean;
  chainLtp: number; quoteLtp: number | null; priceDiffPct: number | null;
  chainIv: number | null; recomputedIv: number | null; ivDiff: number | null;
}

export function sampleRound(rows: OptionRow[], quotes: Map<string, QuoteEntry>, spot: number, expiry: string, fetchedAt: Date, strikesEachSide = 5): Sample[] {
  const sorted = [...rows].sort((a, b) => a.strike - b.strike);
  if (!sorted.length) return [];
  const atm = sorted.reduce((b, r) => (Math.abs(r.strike - spot) < Math.abs(b.strike - spot) ? r : b), sorted[0]);
  const i0 = sorted.indexOf(atm);
  const T = yearsToExpiry(expiry, fetchedAt);
  const out: Sample[] = [];
  for (const row of sorted.slice(Math.max(0, i0 - strikesEachSide), i0 + strikesEachSide + 1)) {
    for (const [type, side] of [["CE", row.call], ["PE", row.put]] as const) {
      if (!side.instrumentKey) continue;
      const q = quotes.get(side.instrumentKey);
      const ltt = Number(q?.last_trade_time);
      const ageS = Number.isFinite(ltt) && ltt > 1_577_836_800_000 ? (fetchedAt.getTime() - ltt) / 1000 : null;
      const quoteLtp = q?.last_price && q.last_price > 0 ? q.last_price : null;
      const recomputedIv = quoteLtp !== null ? impliedVolPct(quoteLtp, spot, row.strike, T, type) : null;
      const chainIv = side.iv && side.iv > 0 ? side.iv : null;
      out.push({
        key: side.instrumentKey, strike: row.strike, type,
        liquid: side.ltp > 0 && side.oi >= FILTERS.minOi && side.volume >= FILTERS.minVolume &&
          (side.bid === null || side.ask === null || ((side.ask - side.bid) / side.ltp) * 100 <= FILTERS.maxSpreadPct),
        ageS, live: ageS !== null && ageS <= LIVE_MAX_AGE_S,
        chainLtp: side.ltp, quoteLtp,
        priceDiffPct: quoteLtp !== null && side.ltp > 0 ? Math.abs(side.ltp - quoteLtp) / quoteLtp : null,
        chainIv, recomputedIv, ivDiff: chainIv !== null && recomputedIv !== null ? Math.abs(chainIv - recomputedIv) : null,
      });
    }
  }
  return out;
}

// ── Verdict per index ─────────────────────────────────────────────────────────
export interface Round { index: string; session: string; samples?: Sample[]; mappingPass?: boolean; error?: string; skipped?: string }

const pct = (xs: number[], p: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

// All attempted rounds are passed in, including errored/skipped ones, so failures cannot silently drop out.
// Mapping must pass in every sampled round (expiries roll). Percentages use qualifying sessions only.
export function indexVerdict(attempted: Round[], mappingPass: boolean | null) {
  const ok = attempted.filter((r) => r.samples);
  const failedShare = attempted.length ? (attempted.length - ok.length) / attempted.length : 0;
  const perSession = new Map<string, number>();
  for (const r of ok) perSession.set(r.session, (perSession.get(r.session) ?? 0) + 1);
  const qualifying = new Set([...perSession].filter(([, n]) => n >= MIN_ROUNDS_PER_SESSION).map(([d]) => d));
  const rounds = ok.filter((r) => qualifying.has(r.session));
  const roundMapping = ok.every((r) => r.mappingPass !== false);
  const mapOk = mappingPass !== false && roundMapping;
  const liquid = rounds.flatMap((r) => r.samples!.filter((s) => s.liquid));
  const liveShare = liquid.length ? liquid.filter((s) => s.live).length / liquid.length : null;
  const priced = liquid.filter((s) => s.priceDiffPct !== null);
  const priceShare = priced.length ? priced.filter((s) => s.priceDiffPct! <= PRICE_TOL).length / priced.length : null;
  const ivd = liquid.map((s) => s.ivDiff).filter((x): x is number => x !== null);
  const ivMedian = pct(ivd, 0.5), ivP95 = pct(ivd, 0.95);
  const B = liveShare !== null && liveShare >= PASS_SHARE;
  const C = priceShare !== null && priceShare >= PASS_SHARE;
  const D = ivMedian !== null && ivP95 !== null && ivMedian <= IV_MEDIAN_MAX && ivP95 <= IV_P95_MAX;
  const enough = qualifying.size >= MIN_SESSIONS && failedShare <= MAX_FAILED_ROUND_SHARE;
  // In-house IV/Greeks are not implemented or validated yet, so a failed D cannot be waved through as DATA_TRUSTED.
  const verdict = !mapOk ? "DATA_NOT_TRUSTED"
    : !enough ? "INSUFFICIENT"
    : !(B && C) ? "DATA_NOT_TRUSTED"
    : D ? "DATA_TRUSTED"
    : "PRICES_TRUSTED_IV_UNVERIFIED";
  return {
    verdict, mappingPass: mapOk, sessions: perSession.size, sessionsWithEnoughRounds: qualifying.size,
    roundsAttempted: attempted.length, roundsUsed: rounds.length, failedRoundShare: failedShare,
    liquidSamples: liquid.length, liveShare, priceAgreeShare: priceShare, ivMedianDiff: ivMedian, ivP95Diff: ivP95,
    checks: { B_fresh: B, C_priceAgree: C, D_chainIvUsable: D },
    ivPolicy: D ? "chain IV agrees with fresh prices" : "chain IV/Greeks unverified — must not be used; in-house IV needs its own validation",
  };
}
