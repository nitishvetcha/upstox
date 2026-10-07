// Pure option-chain maths, shared by mock and live data. No I/O.
import type { ChainMetrics, OptionRow } from "../types.ts";
import { istMinutes, istToday } from "../time.ts";

const ratio = (a: number, b: number) => (b > 0 ? a / b : null); // never Infinity/NaN

export function atmStrike(rows: OptionRow[], spot: number): number {
  if (!rows.length) throw new Error("empty option chain");
  return rows.reduce((a, b) => (Math.abs(b.strike - spot) < Math.abs(a.strike - spot) ? b : a)).strike;
}

// Strike interval near the money (far strikes are often wider, e.g. NIFTY 50 near ATM, 100 further out).
export function strikeStep(rows: OptionRow[], spot: number): number {
  const strikes = [...new Set(rows.map((r) => r.strike))].sort((a, b) => a - b);
  const near = strikes.sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot)).slice(0, 11).sort((a, b) => a - b);
  const gaps = near.slice(1).map((s, i) => s - near[i]).filter((g) => g > 0);
  return gaps.length ? Math.min(...gaps) : 0;
}

// `range` strikes either side of ATM.
export function sliceAroundAtm(rows: OptionRow[], spot: number, range: number): OptionRow[] {
  const sorted = [...rows].sort((a, b) => a.strike - b.strike);
  const i = sorted.findIndex((r) => r.strike === atmStrike(sorted, spot));
  return sorted.slice(Math.max(0, i - range), i + range + 1);
}

// Nearest expiry on or after today's IST trading date; today's expiry is over after 15:30 IST.
export function validExpiries(expiries: string[], now: Date): string[] {
  const today = istToday(now);
  const closed = istMinutes(now).minutes >= 15 * 60 + 30;
  return [...new Set(expiries)]
    .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e) && (e > today || (e === today && !closed)))
    .sort();
}

export function chainMetrics(
  s: { spot: number; expiry: string; chain: OptionRow[] },
  now = new Date(),
): ChainMetrics {
  const rows = s.chain;
  const sum = (f: (r: OptionRow) => number) => rows.reduce((t, r) => t + f(r), 0);
  const atm = rows.find((r) => r.strike === atmStrike(rows, s.spot))!;

  // Max pain: the settlement strike where option writers pay out the least.
  let maxPain = atm.strike;
  let least = Infinity;
  for (const settle of rows) {
    const pain = sum(
      (r) => r.call.oi * Math.max(0, settle.strike - r.strike) + r.put.oi * Math.max(0, r.strike - settle.strike),
    );
    if (pain < least) [least, maxPain] = [pain, settle.strike];
  }

  const below = rows.filter((r) => r.strike <= s.spot);
  const above = rows.filter((r) => r.strike >= s.spot);
  const maxBy = (xs: OptionRow[], f: (r: OptionRow) => number) => (xs.length ? xs.reduce((a, b) => (f(b) > f(a) ? b : a)) : null);
  const freshPuts = maxBy(below, (r) => r.put.chgOi ?? -Infinity);
  const freshCalls = maxBy(above, (r) => r.call.chgOi ?? -Infinity);

  const ivs = [atm.call.iv, atm.put.iv].filter((v): v is number => v !== null);
  const average = ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : null;
  // 1σ move to expiry close (15:30 IST = 10:00 UTC): spot × IV × √(years left).
  const years = Math.max(new Date(s.expiry + "T10:00:00Z").getTime() - now.getTime(), 3_600_000) / (365 * 86_400_000);

  return {
    pcrOi: ratio(sum((r) => r.put.oi), sum((r) => r.call.oi)),
    pcrVolume: ratio(sum((r) => r.put.volume), sum((r) => r.call.volume)),
    maxPain,
    maxPainDistance: Math.round((s.spot - maxPain) * 100) / 100,
    support: maxBy(below, (r) => r.put.oi)?.strike ?? atm.strike,
    resistance: maxBy(above, (r) => r.call.oi)?.strike ?? atm.strike,
    supportByOiChange: freshPuts && (freshPuts.put.chgOi ?? 0) > 0 ? freshPuts.strike : null,
    resistanceByOiChange: freshCalls && (freshCalls.call.chgOi ?? 0) > 0 ? freshCalls.strike : null,
    atmStrike: atm.strike,
    atmIv: { call: atm.call.iv, put: atm.put.iv, average },
    expectedMove: average === null ? null : Math.round(s.spot * (average / 100) * Math.sqrt(years)),
  };
}
