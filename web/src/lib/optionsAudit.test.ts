import { test } from "node:test";
import assert from "node:assert/strict";
import { impliedVolPct, yearsToExpiry, sampleRound, mappingCheck, indexVerdict, type Round, type Sample } from "./optionsAudit.ts";
import { bs } from "./services/mock.ts";
import type { OptionRow } from "./types.ts";

test("IV solver recovers the volatility used to price the option (CE and PE)", () => {
  const S = 24000, K = 24100, T = 5 / 365;
  for (const v of [0.1, 0.18, 0.35]) {
    assert.ok(Math.abs(impliedVolPct(bs(S, K, T, v).call, S, K, T, "CE")! - v * 100) < 0.01);
    assert.ok(Math.abs(impliedVolPct(bs(S, K, T, v).put, S, K, T, "PE")! - v * 100) < 0.01);
  }
  assert.equal(impliedVolPct(0.01, S, 20000, T, "CE"), null, "below intrinsic → unsolvable, not a fake number");
});

test("time to expiry runs to 15:30 IST on expiry day", () => {
  const t = yearsToExpiry("2026-10-27", new Date("2026-10-27T04:00:00Z")); // 09:30 IST same day → 6 h left
  assert.ok(Math.abs(t * 365 * 24 - 6) < 1e-6);
});

const side = (key: string, ltp: number, iv: number | null, oi = 1000, volume = 100) =>
  ({ ltp, bid: null, ask: null, oi, chgOi: null, volume, iv, delta: null, gamma: null, theta: null, vega: null, instrumentKey: key });

test("sampling: fresh vs 2-minute-old trade, price disagreement, illiquid flag, IV comparison", () => {
  const now = new Date("2026-10-26T05:00:00Z");
  const S = 24000, T = yearsToExpiry("2026-10-27", now);
  const fair = bs(S, 24000, T, 0.15).call;
  const rows: OptionRow[] = [{ strike: 24000, call: side("CE1", fair, 15), put: side("PE1", 50, 15, 10, 0) } as OptionRow];
  const quotes = new Map([
    ["CE1", { last_price: fair, last_trade_time: now.getTime() - 5_000 }],
    ["PE1", { last_price: 60, last_trade_time: now.getTime() - 120_000 }],
  ]);
  const [ce, pe] = sampleRound(rows, quotes, S, "2026-10-27", now);
  assert.equal(ce.live, true); assert.ok(ce.ivDiff! < 0.01); assert.equal(ce.priceDiffPct, 0);
  assert.equal(pe.live, false, "120 s old"); assert.equal(pe.liquid, false, "OI 10, volume 0");
  assert.ok(Math.abs(pe.priceDiffPct! - 10 / 60) < 1e-9);
});

test("mapping: chain/master mismatch and a missing quote are reported", () => {
  const rows = [{ strike: 100, call: side("K1", 1, 10), put: side("K2", 1, 10) } as OptionRow];
  const contracts = [
    { instrument_key: "K1", strike_price: 100, instrument_type: "CE", expiry: "2026-10-27", lot_size: 75 },
    { instrument_key: "K2", strike_price: 105, instrument_type: "PE", expiry: "2026-10-27", lot_size: 75 },
  ];
  const r = mappingCheck(contracts, rows, new Set(["K1"]), ["K1", "K2"], "2026-10-24");
  assert.equal(r.pass, false);
  assert.equal(r.issues.length, 2);
  assert.equal(mappingCheck(contracts.slice(0, 1), rows, new Set(["K1"]), ["K1"], "2026-10-24").pass, true);
});

const s = (o: Partial<Sample>): Sample => ({ key: "k", strike: 1, type: "CE", liquid: true, ageS: 5, live: true, chainLtp: 10, quoteLtp: 10, priceDiffPct: 0, chainIv: 15, recomputedIv: 15.2, ivDiff: 0.2, ...o });
const rounds = (sessions: number, perSession: number, sample: (i: number) => Sample): Round[] =>
  Array.from({ length: sessions * perSession }, (_, i) => ({ index: "nifty", session: `d${Math.floor(i / perSession)}`, samples: Array.from({ length: 20 }, (_, j) => sample(i * 20 + j)) }));

test("verdict gates: insufficient sample, trusted, stale data, mapping failure", () => {
  assert.equal(indexVerdict(rounds(4, 6, () => s({})), true).verdict, "INSUFFICIENT");
  assert.equal(indexVerdict(rounds(5, 6, () => s({})), true).verdict, "DATA_TRUSTED");
  assert.equal(indexVerdict(rounds(5, 6, (i) => s({ live: i % 10 !== 0 })), true).verdict, "DATA_NOT_TRUSTED", "90% fresh < 95%");
  assert.equal(indexVerdict(rounds(5, 6, () => s({})), false).verdict, "DATA_NOT_TRUSTED");
  const bigIv = indexVerdict(rounds(5, 6, () => s({ ivDiff: 2 })), true);
  assert.equal(bigIv.verdict, "PRICES_TRUSTED_IV_UNVERIFIED", "failed D is never waved through as DATA_TRUSTED");
  assert.match(bigIv.ivPolicy, /must not be used/);
});

test("errored/skipped rounds count against the sample instead of silently dropping out", () => {
  const good = rounds(5, 6, () => s({}));
  const failed = Array.from({ length: 3 }, (_, i) => ({ index: "nifty", session: `d${i}`, error: "quote fetch failed" }));
  assert.equal(indexVerdict([...good, ...failed], true).verdict, "INSUFFICIENT", "3/33 = 9% failed > 5%");
  assert.equal(indexVerdict([...good, failed[0]], true).verdict, "DATA_TRUSTED", "1/31 = 3% tolerated");
});

test("rounds from non-qualifying sessions do not enter the percentages", () => {
  const good = rounds(5, 6, () => s({}));
  const thinStaleDay = Array.from({ length: 3 }, () => ({ index: "nifty", session: "thin", samples: Array.from({ length: 20 }, () => s({ live: false })) }));
  const v = indexVerdict([...good, ...thinStaleDay], true);
  assert.equal(v.liveShare, 1);
  assert.equal(v.roundsUsed, 30);
});

test("mapping must hold in every round (expiries roll)", () => {
  const r = rounds(5, 6, () => s({}));
  r[7].mappingPass = false;
  assert.equal(indexVerdict(r, true).verdict, "DATA_NOT_TRUSTED");
});

test("liquidity uses the engine filters: a 30% bid-ask spread is not liquid", () => {
  const now = new Date("2026-10-26T05:00:00Z");
  const wide = { ...side("W", 10, 15), bid: 8.5, ask: 11.5 };
  const [w] = sampleRound([{ strike: 24000, call: wide, put: side("P", 10, 15) } as OptionRow], new Map(), 24000, "2026-10-27", now);
  assert.equal(w.liquid, false);
});

test("pricing model satisfies known relationships (put-call parity, bounds, monotonicity, independent value)", () => {
  const R = 0.065, S = 24000, T = 7 / 365;
  for (const K of [22000, 24000, 26000]) for (const v of [0.1, 0.25]) {
    const p = bs(S, K, T, v);
    assert.ok(Math.abs(p.call - p.put - (S - K * Math.exp(-R * T))) < 1e-6, "put-call parity");
    assert.ok(p.call >= Math.max(0, S - K * Math.exp(-R * T)) - 1e-9 && p.call <= S, "call bounds");
    assert.ok(p.callDelta > 0 && p.callDelta < 1 && Math.abs(p.putDelta - (p.callDelta - 1)) < 1e-12);
  }
  assert.ok(bs(S, S, T, 0.3).call > bs(S, S, T, 0.2).call, "price rises with volatility");
  // Independent check: S=100, K=100, T=1, σ=20%, r=6.5% → call 11.2639 (separate implementation, different normal-CDF approximation)
  const ref = bs(100, 100, 1, 0.2).call;
  assert.ok(Math.abs(ref - 11.2639) < 0.005, `got ${ref}`);
});

test("IV edge cases: expired / zero / invalid inputs return null, never a number", () => {
  assert.equal(impliedVolPct(100, 24000, 24000, 0, "CE"), null, "T = 0 (at expiry)");
  assert.equal(impliedVolPct(100, 24000, 24000, -0.01, "CE"), null, "after expiry");
  assert.equal(impliedVolPct(0, 24000, 24000, 0.02, "CE"), null, "zero price");
  assert.equal(impliedVolPct(-5, 24000, 24000, 0.02, "PE"), null, "negative price");
  assert.equal(impliedVolPct(100, 0, 24000, 0.02, "CE"), null, "invalid underlying");
  assert.equal(impliedVolPct(100, 24000, 0, 0.02, "CE"), null, "invalid strike");
  assert.equal(impliedVolPct(Number.NaN, 24000, 24000, 0.02, "CE"), null, "NaN");
  assert.equal(impliedVolPct(30000, 24000, 24000, 0.02, "CE"), null, "price above the underlying: no-arbitrage violation");
});

test("IV converges for deep ITM and far OTM contracts", () => {
  const S = 24000, T = 10 / 365;
  for (const [K, type] of [[21000, "CE"], [27000, "PE"], [26000, "CE"], [22000, "PE"]] as const) {
    const p = type === "CE" ? bs(S, K, T, 0.2).call : bs(S, K, T, 0.2).put;
    const iv = impliedVolPct(p, S, K, T, type);
    if (p > 0.5) assert.ok(iv !== null && Math.abs(iv - 20) < 0.05, `${K}${type} iv ${iv}`);
  }
});

test("Greeks agree with finite differences of the price", () => {
  const S = 24000, K = 24200, T = 6 / 365, v = 0.18, h = 1, dv = 0.001;
  const g = bs(S, K, T, v);
  const dC = (bs(S + h, K, T, v).call - bs(S - h, K, T, v).call) / (2 * h);
  const d2C = (bs(S + h, K, T, v).call - 2 * g.call + bs(S - h, K, T, v).call) / (h * h);
  const vegaFd = ((bs(S, K, T, v + dv).call - bs(S, K, T, v - dv).call) / (2 * dv)) / 100;
  const dT = 1 / 365, thetaFd = bs(S, K, T - dT, v).call - g.call;
  assert.ok(Math.abs(g.callDelta - dC) < 1e-3, "delta");
  assert.ok(Math.abs(g.gamma - d2C) / g.gamma < 0.01, "gamma");
  assert.ok(Math.abs(g.vega - vegaFd) / g.vega < 1e-3, "vega per 1 vol point");
  assert.ok(Math.abs(g.callTheta - thetaFd) / Math.abs(thetaFd) < 0.05, "theta per day");
});

test("time to expiry: after 15:30 IST on expiry day is negative (contract expired)", () => {
  assert.ok(yearsToExpiry("2026-10-27", new Date("2026-10-27T10:01:00Z")) < 0); // 15:31 IST
});

test("chain and quote mapping: matches identical instrument key and strike", () => {
  const now = new Date("2026-10-26T05:00:00Z");
  const row = { strike: 22450, call: side("NSE_FO|51328", 300, 20), put: side("NSE_FO|51329", 50, 20) } as OptionRow;
  const quotes = new Map([
    ["NSE_FO|51328", { last_price: 300, last_trade_time: now.getTime() - 2_000 }],
    ["NSE_FO|51329", { last_price: 50, last_trade_time: now.getTime() - 3_000 }],
  ]);
  const samples = sampleRound([row], quotes, 22450, "2026-10-27", now);
  assert.equal(samples.length, 2);
  const ce = samples.find((s) => s.type === "CE")!;
  assert.equal(ce.key, "NSE_FO|51328");
  assert.equal(ce.strike, 22450);
  assert.equal(ce.chainLtp, 300);
  assert.equal(ce.quoteLtp, 300);
  assert.equal(ce.priceDiffPct, 0);
});

test("freshness gate: stale trades (>60 s) and missing timestamps are flagged non-live", () => {
  const now = new Date("2026-10-26T05:00:00Z");
  const row = { strike: 22450, call: side("K_STALE", 100, 20), put: side("K_MISSING_LTT", 100, 20) } as OptionRow;
  const quotes = new Map([
    ["K_STALE", { last_price: 100, last_trade_time: now.getTime() - 65_000 }], // 65 seconds old
    ["K_MISSING_LTT", { last_price: 100, last_trade_time: null as unknown as number }],
  ]);
  const samples = sampleRound([row], quotes, 22450, "2026-10-27", now);
  const stale = samples.find((s) => s.key === "K_STALE")!;
  const missing = samples.find((s) => s.key === "K_MISSING_LTT")!;
  assert.equal(stale.live, false);
  assert.equal(stale.ageS, 65);
  assert.equal(missing.live, false);
  assert.equal(missing.ageS, null);
});

test("audit safety: options remain blocked (INSUFFICIENT or DATA_NOT_TRUSTED) when criteria are unmet", () => {
  // Scenario 1: Not enough sessions (only 2 sessions) → INSUFFICIENT
  const twoSessions = rounds(2, 6, () => s({}));
  assert.equal(indexVerdict(twoSessions, true).verdict, "INSUFFICIENT");

  // Scenario 2: Freshness below 95% → DATA_NOT_TRUSTED
  const staleRoundSet = rounds(5, 6, (i) => s({ live: i % 8 !== 0 })); // 87.5% fresh
  assert.equal(indexVerdict(staleRoundSet, true).verdict, "DATA_NOT_TRUSTED");

  // Scenario 3: Price agreement below 95% → DATA_NOT_TRUSTED
  const priceDisagreeSet = rounds(5, 6, (i) => s({ priceDiffPct: i % 10 === 0 ? 0.05 : 0 })); // 90% agree
  assert.equal(indexVerdict(priceDisagreeSet, true).verdict, "DATA_NOT_TRUSTED");

  // Scenario 4: IV unverified (median diff > 1.0) → PRICES_TRUSTED_IV_UNVERIFIED (Greeks/IV blocked)
  const highIvSet = rounds(5, 6, () => s({ ivDiff: 2.5 }));
  const v = indexVerdict(highIvSet, true);
  assert.equal(v.verdict, "PRICES_TRUSTED_IV_UNVERIFIED");
  assert.match(v.ivPolicy, /must not be used/);
});

test("protocol version constants: AUDIT_VERSION is options-audit-1a, AUDIT_VERSION_LEGACY is options-audit-1", async () => {
  const { AUDIT_VERSION: current, AUDIT_VERSION_LEGACY: legacy } = await import("./optionsAudit.ts");
  assert.equal(current, "options-audit-1a", "Active audit protocol must be options-audit-1a");
  assert.equal(legacy, "options-audit-1", "Legacy audit protocol must remain options-audit-1");
});
