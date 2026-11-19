// European Black-Scholes pricing and Greeks for index options. Assumptions (documented in docs/OPTIONS_SUCCESSOR_ENGINE.md):
// no dividends, constant volatility over the contract's life, continuous compounding of the risk-free rate, time in years
// on an ACT/365 basis. Indian index options are European-exercise; this model is an approximation near expiry and events.
// Greeks are model outputs, not market observations. Callers must label them as such.

export type OptionType = "CE" | "PE";

export interface BsInput {
  spot: number;
  strike: number;
  tYears: number; // time to expiry in years, > 0
  rate: number; // annual continuously compounded, e.g. 0.065
  vol: number; // annual volatility as a fraction, e.g. 0.14
  type: OptionType;
}

export interface Greeks {
  price: number;
  delta: number;
  gamma: number;
  vega: number; // per 1 vol point (0.01 change in volatility)
  theta: number; // per calendar day
}

// Abramowitz & Stegun 26.2.17 approximation of the standard normal CDF; absolute error < 7.5e-8.
export function normCdf(x: number): number {
  const b1 = 0.31938153, b2 = -0.356563782, b3 = 1.781477937, b4 = -1.821255978, b5 = 1.330274429;
  const p = 0.2316419;
  const t = 1 / (1 + p * Math.abs(x));
  const poly = t * (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
  const pdf = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  const cdfPos = 1 - pdf * poly;
  return x >= 0 ? cdfPos : 1 - cdfPos;
}

export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export function greeks(i: BsInput): Greeks {
  const { spot: S, strike: K, tYears: T, rate: r, vol: sigma, type } = i;
  if (!(S > 0) || !(K > 0) || !(T > 0) || !(sigma > 0)) throw new Error("invalid Black-Scholes input");
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const disc = Math.exp(-r * T);
  const pdf1 = normPdf(d1);
  const isCall = type === "CE";
  const price = isCall ? S * normCdf(d1) - K * disc * normCdf(d2) : K * disc * normCdf(-d2) - S * normCdf(-d1);
  const delta = isCall ? normCdf(d1) : normCdf(d1) - 1;
  const gamma = pdf1 / (S * sigma * sqrtT);
  const vega = (S * pdf1 * sqrtT) / 100;
  const thetaYear = isCall
    ? -(S * pdf1 * sigma) / (2 * sqrtT) - r * K * disc * normCdf(d2)
    : -(S * pdf1 * sigma) / (2 * sqrtT) + r * K * disc * normCdf(-d2);
  return { price, delta, gamma, vega, theta: thetaYear / 365 };
}

// Implied volatility by bisection on price. Returns null when the target price is outside the no-arbitrage bounds.
export function impliedVol(targetPrice: number, base: Omit<BsInput, "vol">): number | null {
  const { spot: S, strike: K, tYears: T, rate: r, type } = base;
  const intrinsic = Math.max(0, type === "CE" ? S - K * Math.exp(-r * T) : K * Math.exp(-r * T) - S);
  if (!(targetPrice > intrinsic) || targetPrice >= (type === "CE" ? S : K)) return null;
  let lo = 1e-4, hi = 5;
  for (let n = 0; n < 200; n++) {
    const mid = (lo + hi) / 2;
    const p = greeks({ ...base, vol: mid }).price;
    if (Math.abs(p - targetPrice) < 1e-7) return mid;
    if (p > targetPrice) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export function yearsBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / (365 * 24 * 3600 * 1000);
}
