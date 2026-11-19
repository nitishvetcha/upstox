// Pure selection helpers for the historical coverage probe (no network, no I/O).
// Used by scripts/historical-coverage-probe.ts and covered by historicalCoverageSelect.test.ts.

// Upstox candle: [timestamp, open, high, low, close, volume, oi]
export type Candle = [string, number, number, number, number, number, number?];

// Latest candle on or before the expiry date, chosen by timestamp (not by array position).
export function pickSpotCandle(candles: Candle[], expiry: string): { candle: Candle; date: string } | null {
  const eligible = candles.filter(
    (c) => Array.isArray(c) && typeof c[0] === "string" && c[0].slice(0, 10) <= expiry && typeof c[4] === "number",
  );
  if (!eligible.length) return null;
  const latest = eligible.reduce((best, c) => (Date.parse(c[0]) > Date.parse(best[0]) ? c : best));
  return { candle: latest, date: latest[0].slice(0, 10) };
}

// Listed strike nearest to the spot.
export function nearestStrike(strikes: number[], spot: number): number | null {
  if (!strikes.length) return null;
  return strikes.reduce((best, s) => (Math.abs(s - spot) < Math.abs(best - spot) ? s : best));
}

// Strike interval on each side of the ATM strike. If the two sides disagree, the grid is irregular at ATM
// and the caller must not guess ITM/OTM strikes from it.
export function localStep(strikes: number[], atm: number) {
  const i = strikes.indexOf(atm);
  if (i < 0) return null;
  const above = i + 1 < strikes.length ? strikes[i + 1] - atm : null;
  const below = i - 1 >= 0 ? atm - strikes[i - 1] : null;
  const used = above ?? below;
  if (used === null || used <= 0) return null;
  const agree = above !== null && below !== null ? above === below : null;
  return { step: used, basis: above !== null ? ("above" as const) : ("below" as const), above, below, agree };
}

// Checks a listed contract row against the exact expiry, type and strike it is meant to represent.
// Returns null when it matches, otherwise the reason it must not be used.
export function verifyContract(
  row: { instrument_type?: string; expiry?: unknown; strike_price?: number; instrument_key?: unknown },
  expiry: string,
  type: "CE" | "PE",
  strike: number,
): string | null {
  if (row.instrument_type !== type) return "instrument type mismatch";
  if (String(row.expiry ?? "").slice(0, 10) !== expiry) return "expiry mismatch";
  if (row.strike_price !== strike) return "strike mismatch";
  if (typeof row.instrument_key !== "string" || !row.instrument_key) return "missing instrument key";
  return null;
}

// Listed contract of a type nearest to a target strike.
export function nearestListed<T extends { instrument_type?: string; strike_price?: number; instrument_key?: unknown }>(
  rows: T[],
  type: "CE" | "PE",
  target: number,
): T | null {
  const cand = rows.filter((r) => r.instrument_type === type && typeof r.instrument_key === "string" && typeof r.strike_price === "number");
  if (!cand.length) return null;
  return cand.reduce((best, r) => (Math.abs((r.strike_price as number) - target) < Math.abs((best.strike_price as number) - target) ? r : best));
}
