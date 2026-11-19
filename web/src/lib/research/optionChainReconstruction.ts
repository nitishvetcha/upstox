export type OptionType = "CE" | "PE";

export interface CanonicalOptionContract {
  instrument_key?: unknown;
  underlying_key?: unknown;
  expiry?: unknown;
  strike_price?: unknown;
  instrument_type?: unknown;
}

export interface ReconstructionReport {
  expiry: string;
  universe: { contracts: number; uniqueKeys: number; duplicateKeys: number; invalidMembers: number; calls: number; puts: number };
  coverage: { requested: number; covered: number; missing: number; unexpected: number; duplicateResponses: number; percent: number };
  validity: { valid: number; malformed: number; missingLtp: number; missingTimestamp: number; missingLtt: number; missingOi: number; missingPreviousOi: number; missingVolume: number; missingBid: number; missingAsk: number; missingDepth: number; invalidSpread: number };
  timestamps: { responseMin: string | null; responseMax: string | null; responseDispersionMs: number | null; lttMin: string | null; lttMax: string | null; lttDispersionMs: number | null; lttOlderThan60s: number; futureLtt: number };
  analytics: null | {
    totalCallOi: number; totalPutOi: number; oiPcr: number | null;
    previousCallOi: number; previousPutOi: number; previousOiPcr: number | null;
    callOiChange: number; putOiChange: number;
    callVolume: number; putVolume: number; volumePcr: number | null;
    callOiConcentration: number | null; putOiConcentration: number | null;
    highestCallOiStrike: number | null; highestPutOiStrike: number | null;
  };
  comparison: { priceComparable: number; oiComparable: number; ltpMismatchOver2Pct: number; maxLtpDifferencePct: number | null; oiMismatch: number; maxOiDifference: number | null; reconstructedOiPcr: number | null; chainOiPcr: number | null; pcrDifference: number | null };
}

type Obj = Record<string, unknown>;
const finite = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
const nonNegative = (v: unknown) => { const n = finite(v); return n !== null && n >= 0 ? n : null; };
const positive = (v: unknown) => { const n = finite(v); return n !== null && n > 0 ? n : null; };
const isoMs = (v: unknown): number | null => { const n = finite(v); if (n !== null && n > 1_577_836_800_000) return n; if (typeof v === "string") { const t = Date.parse(v); return Number.isFinite(t) ? t : null; } return null; };
const ratio = (a: number, b: number) => b > 0 ? a / b : null;
const round = (n: number | null, d = 6) => n === null ? null : Math.round(n * 10 ** d) / 10 ** d;

function chainByKey(chain: unknown): Map<string, { ltp: number | null; oi: number | null; type: OptionType; strike: number }> {
  const out = new Map<string, { ltp: number | null; oi: number | null; type: OptionType; strike: number }>();
  if (!Array.isArray(chain)) return out;
  for (const row of chain as Obj[]) {
    const strike = finite(row.strike_price);
    if (strike === null) continue;
    for (const [field, type] of [["call_options", "CE"], ["put_options", "PE"]] as const) {
      const side = row[field] as Obj | undefined;
      const key = side?.instrument_key;
      const md = side?.market_data as Obj | undefined;
      if (typeof key === "string" && key) out.set(key, { ltp: positive(md?.ltp), oi: nonNegative(md?.oi), type, strike });
    }
  }
  return out;
}

export function reconstructOptionSnapshot(args: {
  underlyingKey: string; expiry: string; contracts: CanonicalOptionContract[]; quotes: unknown; chain: unknown; now: Date;
}): ReconstructionReport {
  const members = args.contracts.filter((c) => c.expiry === args.expiry);
  const keyCounts = new Map<string, number>();
  let invalidMembers = 0, calls = 0, puts = 0;
  const meta = new Map<string, { strike: number; type: OptionType }>();
  for (const c of members) {
    const key = c.instrument_key, strike = positive(c.strike_price), type = c.instrument_type;
    const valid = typeof key === "string" && key.length > 0 && c.underlying_key === args.underlyingKey && strike !== null && (type === "CE" || type === "PE");
    if (!valid) { invalidMembers++; continue; }
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    meta.set(key, { strike, type });
    if (type === "CE") calls++; else puts++;
  }
  const expected = new Set(meta.keys());
  const responses = args.quotes && typeof args.quotes === "object" && !Array.isArray(args.quotes) ? Object.values(args.quotes as Obj) : [];
  const byToken = new Map<string, Obj>();
  let unexpected = 0, duplicateResponses = 0;
  for (const value of responses) {
    if (!value || typeof value !== "object" || Array.isArray(value)) { unexpected++; continue; }
    const q = value as Obj, token = q.instrument_token;
    if (typeof token !== "string" || !expected.has(token)) { unexpected++; continue; }
    if (byToken.has(token)) { duplicateResponses++; continue; }
    byToken.set(token, q);
  }

  let malformed = 0, missingLtp = 0, missingTimestamp = 0, missingLtt = 0, missingOi = 0, missingPreviousOi = 0, missingVolume = 0, missingBid = 0, missingAsk = 0, missingDepth = 0, invalidSpread = 0;
  const responseTimes: number[] = [], ltts: number[] = [];
  let older = 0, future = 0;
  const observed: { key: string; type: OptionType; strike: number; ltp: number | null; oi: number | null; previousOi: number | null; volume: number | null }[] = [];
  for (const [key, q] of byToken) {
    const ltp = positive(q.last_price), timestamp = isoMs(q.timestamp), ltt = isoMs(q.last_trade_time), oi = nonNegative(q.oi), previousOi = nonNegative(q.previous_oi), volume = nonNegative(q.volume);
    const depth = q.depth as Obj | undefined;
    const buys = Array.isArray(depth?.buy) ? depth.buy as Obj[] : [];
    const sells = Array.isArray(depth?.sell) ? depth.sell as Obj[] : [];
    const bid = buys.map((d) => positive(d.price)).find((n) => n !== null) ?? null;
    const ask = sells.map((d) => positive(d.price)).find((n) => n !== null) ?? null;
    if (!buys.length || !sells.length) missingDepth++;
    if (bid === null) missingBid++;
    if (ask === null) missingAsk++;
    if (bid !== null && ask !== null && ask < bid) invalidSpread++;
    if (ltp === null) missingLtp++;
    if (timestamp === null) missingTimestamp++; else responseTimes.push(timestamp);
    if (ltt === null) missingLtt++; else { ltts.push(ltt); if (args.now.getTime() - ltt > 60_000) older++; if (ltt - args.now.getTime() > 5_000) future++; }
    if (oi === null) missingOi++;
    if (previousOi === null) missingPreviousOi++;
    if (volume === null) missingVolume++;
    if (ltp === null || timestamp === null || ltt === null || oi === null || previousOi === null || volume === null) malformed++;
    observed.push({ key, ...meta.get(key)!, ltp, oi, previousOi, volume });
  }
  const missing = expected.size - byToken.size;
  const oiUsable = observed.filter((q): q is typeof q & { oi: number; previousOi: number; volume: number } => q.oi !== null && q.previousOi !== null && q.volume !== null);
  const analyticsComplete = missing === 0 && invalidMembers === 0 && duplicateResponses === 0 && oiUsable.length === expected.size;
  const side = (type: OptionType) => oiUsable.filter((q) => q.type === type);
  const sum = (xs: typeof oiUsable, field: "oi" | "previousOi" | "volume") => xs.reduce((t, q) => t + q[field], 0);
  const ce = side("CE"), pe = side("PE");
  const maxOi = (xs: typeof oiUsable) => xs.length ? xs.reduce((a, b) => b.oi > a.oi ? b : a) : null;
  const callOi = sum(ce, "oi"), putOi = sum(pe, "oi"), previousCallOi = sum(ce, "previousOi"), previousPutOi = sum(pe, "previousOi"), callVolume = sum(ce, "volume"), putVolume = sum(pe, "volume");
  const chain = chainByKey(args.chain);
  let priceComparable = 0, oiComparable = 0, ltpMismatchOver2Pct = 0, oiMismatch = 0, maxLtpDifferencePct: number | null = null, maxOiDifference: number | null = null;
  for (const q of observed) {
    const c = chain.get(q.key); if (!c) continue;
    if (c.ltp !== null && q.ltp !== null) { priceComparable++; const d = Math.abs(c.ltp - q.ltp) / q.ltp; if (d > 0.02) ltpMismatchOver2Pct++; maxLtpDifferencePct = Math.max(maxLtpDifferencePct ?? 0, d * 100); }
    if (c.oi !== null && q.oi !== null) { oiComparable++; const d = Math.abs(c.oi - q.oi); if (d !== 0) oiMismatch++; maxOiDifference = Math.max(maxOiDifference ?? 0, d); }
  }
  const chainCe = [...chain.values()].filter((q) => q.type === "CE" && q.oi !== null).reduce((t, q) => t + q.oi!, 0);
  const chainPe = [...chain.values()].filter((q) => q.type === "PE" && q.oi !== null).reduce((t, q) => t + q.oi!, 0);
  const oiPcr = analyticsComplete ? ratio(putOi, callOi) : null, chainOiPcr = chain.size ? ratio(chainPe, chainCe) : null;
  const span = (xs: number[]) => xs.length ? { min: new Date(Math.min(...xs)).toISOString(), max: new Date(Math.max(...xs)).toISOString(), dispersion: Math.max(...xs) - Math.min(...xs) } : { min: null, max: null, dispersion: null };
  const rt = span(responseTimes), lt = span(ltts), maxCall = maxOi(ce), maxPut = maxOi(pe);
  return {
    expiry: args.expiry,
    universe: { contracts: members.length, uniqueKeys: expected.size, duplicateKeys: [...keyCounts.values()].filter((n) => n > 1).length, invalidMembers, calls, puts },
    coverage: { requested: expected.size, covered: byToken.size, missing, unexpected, duplicateResponses, percent: expected.size ? round(byToken.size / expected.size * 100, 2)! : 0 },
    validity: { valid: observed.length - malformed, malformed, missingLtp, missingTimestamp, missingLtt, missingOi, missingPreviousOi, missingVolume, missingBid, missingAsk, missingDepth, invalidSpread },
    timestamps: { responseMin: rt.min, responseMax: rt.max, responseDispersionMs: rt.dispersion, lttMin: lt.min, lttMax: lt.max, lttDispersionMs: lt.dispersion, lttOlderThan60s: older, futureLtt: future },
    analytics: analyticsComplete ? { totalCallOi: callOi, totalPutOi: putOi, oiPcr: round(oiPcr), previousCallOi, previousPutOi, previousOiPcr: round(ratio(previousPutOi, previousCallOi)), callOiChange: callOi - previousCallOi, putOiChange: putOi - previousPutOi, callVolume, putVolume, volumePcr: round(ratio(putVolume, callVolume)), callOiConcentration: round(ratio(maxCall?.oi ?? 0, callOi)), putOiConcentration: round(ratio(maxPut?.oi ?? 0, putOi)), highestCallOiStrike: maxCall?.strike ?? null, highestPutOiStrike: maxPut?.strike ?? null } : null,
    comparison: { priceComparable, oiComparable, ltpMismatchOver2Pct, maxLtpDifferencePct: round(maxLtpDifferencePct), oiMismatch, maxOiDifference, reconstructedOiPcr: round(oiPcr), chainOiPcr: round(chainOiPcr), pcrDifference: oiPcr !== null && chainOiPcr !== null ? round(Math.abs(oiPcr - chainOiPcr)) : null },
  };
}
