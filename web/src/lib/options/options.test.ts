// Options successor engine tests. Synthetic fixtures only. No network. Strategy 11.4 immutability is checked by hash.
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { greeks, impliedVol, normCdf } from "./greeks.ts";
import { evaluate, chargesFor, OPT_GATES, type ChainRow, type QuoteSide, type RiskContext, type UnderlyingState } from "./recommend.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "../../..");
const NOW = "2026-11-05T05:00:00.000Z"; // 10:30 IST, market open
const EXPIRY = "2026-11-12"; // 7 calendar days
const SPOT = 24000;
const VOL = 0.14;

function quote(price: number, extra: Partial<QuoteSide> = {}): QuoteSide {
  return { ltp: price, bid: price * 0.995, ask: price * 1.005, oi: 50_000, volume: 5_000, lastTradeTime: new Date(Date.parse(NOW) - 5000).toISOString(), instrumentKey: "NSE_FO|TEST", ...extra };
}
function chain(overrides: (row: ChainRow) => ChainRow = (r) => r): ChainRow[] {
  const rows: ChainRow[] = [];
  for (let k = -6; k <= 6; k++) {
    const strike = 24000 + k * 50;
    const tY = (Date.parse(`${EXPIRY}T15:30:00+05:30`) - Date.parse(NOW)) / (365 * 24 * 3600 * 1000);
    const ce = greeks({ spot: SPOT, strike, tYears: tY, rate: OPT_GATES.rate, vol: VOL, type: "CE" }).price;
    const pe = greeks({ spot: SPOT, strike, tYears: tY, rate: OPT_GATES.rate, vol: VOL, type: "PE" }).price;
    rows.push(overrides({ strike, expiry: EXPIRY, lotSize: 75, call: quote(ce), put: quote(pe) }));
  }
  return rows;
}
const underlying = (o: Partial<UnderlyingState> = {}): UnderlyingState => ({
  index: "NIFTY", spot: SPOT, asOf: NOW, marketState: "OPEN", trend: "LONG", vwap: 23990, swingLow: 23950, swingHigh: 24050, target: 24200,
  eventRisk: "NONE", chainTimestamp: NOW, ...o,
});
const risk = (o: Partial<RiskContext> = {}): RiskContext => ({ capital: 1_000_000, dailyLossSoFar: 0, dailyLossLimitPct: 2, openRecommendations: 0, maxConcurrent: 3, ...o });

describe("Black-Scholes reference values", () => {
  const base = { spot: 100, strike: 100, tYears: 1, rate: 0.05, vol: 0.2 };
  it("call and put match the standard reference prices", () => {
    assert.ok(Math.abs(greeks({ ...base, type: "CE" }).price - 10.4506) < 1e-3);
    assert.ok(Math.abs(greeks({ ...base, type: "PE" }).price - 5.5735) < 1e-3);
  });
  it("call delta, gamma and vega match reference values", () => {
    const c = greeks({ ...base, type: "CE" });
    assert.ok(Math.abs(c.delta - 0.6368) < 1e-3);
    assert.ok(Math.abs(c.gamma - 0.018762) < 1e-4);
    assert.ok(Math.abs(c.vega - 0.37524) < 1e-3); // per vol point
  });
  it("put-call parity holds", () => {
    const c = greeks({ ...base, type: "CE" }).price;
    const p = greeks({ ...base, type: "PE" }).price;
    assert.ok(Math.abs(c - p - (100 - 100 * Math.exp(-0.05))) < 1e-6);
  });
  it("normal CDF is accurate at 0 and symmetric", () => {
    assert.ok(Math.abs(normCdf(0) - 0.5) < 1e-7);
    assert.ok(Math.abs(normCdf(1.5) + normCdf(-1.5) - 1) < 1e-7);
  });
  it("implied volatility round-trips the model price", () => {
    const p = greeks({ ...base, type: "CE" }).price;
    const iv = impliedVol(p, { spot: 100, strike: 100, tYears: 1, rate: 0.05, type: "CE" });
    assert.ok(iv !== null && Math.abs(iv - 0.2) < 1e-4);
  });
  it("implied volatility is null outside no-arbitrage bounds", () => {
    assert.equal(impliedVol(0.5, { spot: 100, strike: 100, tYears: 1, rate: 0.05, type: "CE" }), null); // below intrinsic (≈4.88)
    assert.equal(impliedVol(120, { spot: 100, strike: 100, tYears: 1, rate: 0.05, type: "CE" }), null);
  });
  it("invalid inputs throw rather than return numbers", () => {
    assert.throws(() => greeks({ spot: 0, strike: 100, tYears: 1, rate: 0.05, vol: 0.2, type: "CE" }));
  });
});

describe("recommendation: happy path", () => {
  it("LONG trend selects a CE with complete fields and passes gates", () => {
    const d = evaluate({ underlying: underlying(), chain: chain(), risk: risk(), now: NOW });
    assert.equal(d.status, "RECOMMENDATION");
    if (d.status !== "RECOMMENDATION") return;
    assert.equal(d.optionType, "CE");
    assert.equal(d.expiry, EXPIRY);
    assert.ok(d.greeks.delta >= OPT_GATES.deltaWindow.min && d.greeks.delta <= OPT_GATES.deltaWindow.max);
    assert.ok(d.rewardToRisk >= OPT_GATES.minRewardToRisk);
    assert.ok(d.stopPremium < d.entryPremium && d.targetPremium > d.entryPremium);
    assert.equal(d.quantity, d.lots * d.lotSize);
    assert.ok(d.capitalRequired <= 1_000_000);
    assert.ok(d.maxPlannedLoss > 0 && d.charges.total > 0);
    assert.equal(d.dataSource, "UPSTOX_OPTION_CHAIN_AND_QUOTES");
    assert.ok(d.dataQuality.some((q) => /unverified/.test(q)));
  });

  it("equal open interest resolves to the strike nearest the centre of the delta window (0.45)", () => {
    const d = evaluate({ underlying: underlying(), chain: chain(), risk: risk(), now: NOW });
    assert.equal(d.status, "RECOMMENDATION");
    if (d.status === "RECOMMENDATION") assert.equal(d.strike, 24100); // delta 0.446, nearest 0.45
  });

  it("SHORT trend selects a PE", () => {
    const d = evaluate({ underlying: underlying({ trend: "SHORT", swingHigh: 24050, target: 23800 }), chain: chain(), risk: risk(), now: NOW });
    assert.equal(d.status, "RECOMMENDATION");
    if (d.status === "RECOMMENDATION") assert.equal(d.optionType, "PE");
  });
});

describe("NO TRADE: data and gate failures", () => {
  const expectNoTrade = (d: ReturnType<typeof evaluate>, pattern: RegExp) => {
    assert.equal(d.status, "NO_TRADE");
    if (d.status === "NO_TRADE") assert.ok(d.reasons.some((r) => pattern.test(r)), JSON.stringify(d.reasons));
  };

  it("underlying gate failures still report contract-level causes (stale quotes)", () => {
    const stale = chain((r) => ({ ...r, call: r.call && { ...r.call, lastTradeTime: new Date(Date.parse(NOW) - 300_000).toISOString() } }));
    const d = evaluate({ underlying: underlying({ trend: "NONE", eventRisk: null }), chain: stale, risk: risk(), now: NOW });
    expectNoTrade(d, /quote stale/);
    expectNoTrade(d, /event risk data unavailable/);
  });

  it("market not OPEN", () => expectNoTrade(evaluate({ underlying: underlying({ marketState: "CLOSED" }), chain: chain(), risk: risk(), now: NOW }), /not OPEN/));
  it("event risk unavailable is never silently passed", () => expectNoTrade(evaluate({ underlying: underlying({ eventRisk: null }), chain: chain(), risk: risk(), now: NOW }), /event risk data unavailable/));
  it("HIGH event risk", () => expectNoTrade(evaluate({ underlying: underlying({ eventRisk: "HIGH" }), chain: chain(), risk: risk(), now: NOW }), /event risk HIGH/));
  it("no trend", () => expectNoTrade(evaluate({ underlying: underlying({ trend: "NONE" }), chain: chain(), risk: risk(), now: NOW }), /no underlying trend/));
  it("missing structure levels", () => expectNoTrade(evaluate({ underlying: underlying({ swingLow: null }), chain: chain(), risk: risk(), now: NOW }), /structure levels unavailable/));
  it("stale quote is rejected", () => {
    const stale = chain((r) => ({ ...r, call: r.call && { ...r.call, lastTradeTime: new Date(Date.parse(NOW) - 300_000).toISOString() } }));
    expectNoTrade(evaluate({ underlying: underlying(), chain: stale, risk: risk(), now: NOW }), /stale/);
  });
  it("future-dated quote is rejected", () => {
    const future = chain((r) => ({ ...r, call: r.call && { ...r.call, lastTradeTime: new Date(Date.parse(NOW) + 600_000).toISOString() } }));
    expectNoTrade(evaluate({ underlying: underlying(), chain: future, risk: risk(), now: NOW }), /future/);
  });
  it("missing trade time cannot be verified", () => {
    const missing = chain((r) => ({ ...r, call: r.call && { ...r.call, lastTradeTime: null } }));
    expectNoTrade(evaluate({ underlying: underlying(), chain: missing, risk: risk(), now: NOW }), /trade time missing/);
  });
  it("wide spread is rejected", () => {
    const wide = chain((r) => ({ ...r, call: r.call && { ...r.call, bid: r.call.ltp * 0.9, ask: r.call.ltp * 1.1 } }));
    expectNoTrade(evaluate({ underlying: underlying(), chain: wide, risk: risk(), now: NOW }), /passes quote, liquidity/);
  });
  it("low open interest is rejected", () => {
    const thin = chain((r) => ({ ...r, call: r.call && { ...r.call, oi: 10 } }));
    expectNoTrade(evaluate({ underlying: underlying(), chain: thin, risk: risk(), now: NOW }), /passes quote, liquidity/);
  });
  it("missing lot size is never guessed", () => {
    const noLot = chain((r) => ({ ...r, lotSize: null }));
    expectNoTrade(evaluate({ underlying: underlying(), chain: noLot, risk: risk(), now: NOW }), /lot size missing/);
  });
  it("expiry too close is excluded", () => {
    const d = evaluate({ underlying: underlying(), chain: chain(), risk: risk(), now: "2026-11-10T05:00:00.000Z" });
    expectNoTrade(d, /minimum days|passes quote|no expiry/);
  });
  it("concurrency and daily loss limits block new recommendations", () => {
    expectNoTrade(evaluate({ underlying: underlying(), chain: chain(), risk: risk({ openRecommendations: 3 }), now: NOW }), /maximum concurrent/);
    expectNoTrade(evaluate({ underlying: underlying(), chain: chain(), risk: risk({ dailyLossSoFar: 25_000 }), now: NOW }), /daily loss limit/);
  });
});

describe("sizing, reward-to-risk and costs", () => {
  it("quantity is whole lots and never exceeds the risk budget", () => {
    const d = evaluate({ underlying: underlying(), chain: chain(), risk: risk(), now: NOW });
    assert.equal(d.status, "RECOMMENDATION");
    if (d.status !== "RECOMMENDATION") return;
    const riskPerUnit = d.entryPremium - d.stopPremium;
    assert.ok(riskPerUnit * d.quantity <= 1_000_000 * 0.01 + 1e-6);
    assert.equal(d.quantity % d.lotSize, 0);
  });

  it("one lot above the risk budget is NO_TRADE, not forced to a larger size", () => {
    const d = evaluate({ underlying: underlying(), chain: chain(), risk: risk({ capital: 20_000 }), now: NOW });
    assert.equal(d.status, "NO_TRADE");
  });

  it("reward-to-risk below 1.5 is rejected", () => {
    const d = evaluate({ underlying: underlying({ target: 24010 }), chain: chain(), risk: risk(), now: NOW });
    assert.equal(d.status, "NO_TRADE");
    if (d.status === "NO_TRADE") assert.ok(d.reasons.some((r) => /reward-to-risk/.test(r)));
  });

  it("charges are positive and the sell side carries STT", () => {
    const c = chargesFor(200, 210, 75);
    assert.ok(c.total > 0);
    assert.ok(Math.abs(c.stt - 0.001 * 210 * 75) < 1e-9);
    assert.ok(c.brokerage <= 40 + 1e-9);
  });
});

describe("strategy immutability and safety", () => {
  it("Strategy 11.4 matches its frozen SHA-256", () => {
    const hash = crypto.createHash("sha256").update(fs.readFileSync(path.join(WEB, "src/lib/engine/strategy.ts"))).digest("hex");
    assert.equal(hash, "d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18");
  });

  it("the successor engine contains no order-placement code", () => {
    for (const f of ["greeks.ts", "recommend.ts"]) {
      assert.doesNotMatch(fs.readFileSync(path.join(HERE, f), "utf8"), /placeOrder|\/v2\/order|order_type|fetch\(/i, f);
    }
  });
});
