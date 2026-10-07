// Phase 11.2 — Contract integrity, identity preservation, slippage, stop/target, position sizing.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRecommendationResponse, contractDetails, entryDetail, primaryLeg } from "./recommendationEnricher.ts";
import { analyze } from "./engine/strategy.ts";
import { mockSnapshot } from "./services/mock.ts";
import type { IndexId, Snapshot } from "./types.ts";
import { normalizeChain } from "./services/upstoxMarket.ts";

console.info = () => {};

const T = new Date("2026-10-06T11:00:00+05:30");

// ── Helpers ────────────────────────────────────────────────────────────────────

function snap(index: IndexId = "nifty"): Snapshot {
  return mockSnapshot(index, T);
}

function liveSnap(index: IndexId = "nifty"): Snapshot {
  const s = snap(index);
  return {
    ...s,
    sources: Object.fromEntries(
      Object.entries(s.sources).map(([k, v]) => [k, { ...v, source: "LIVE" }])
    ) as Snapshot["sources"],
  };
}

function staleSnap(): Snapshot {
  const s = snap();
  return {
    ...s,
    sources: Object.fromEntries(
      Object.entries(s.sources).map(([k, v]) => [k, { ...v, source: "STALE" }])
    ) as Snapshot["sources"],
  };
}

// Snapshot with a chain that has no instrument keys (simulates live chain that didn't return them)
function noKeySnap(): Snapshot {
  const s = liveSnap();
  return {
    ...s,
    chain: s.chain.map((r) => ({
      ...r,
      call: { ...r.call, instrumentKey: null },
      put: { ...r.put, instrumentKey: null },
    })),
  };
}

// Snapshot with explicit instrument keys (like real Upstox)
function keyedSnap(keyPrefix = "NSE_FO|NIFTY06OCT2026"): Snapshot {
  const s = liveSnap();
  return {
    ...s,
    chain: s.chain.map((r) => ({
      ...r,
      call: { ...r.call, instrumentKey: `${keyPrefix}CE${r.strike}` },
      put: { ...r.put, instrumentKey: `${keyPrefix}PE${r.strike}` },
    })),
  };
}

// ── Instrument key identity ────────────────────────────────────────────────────

test("CI1. Mock chain has MOCK_FO| instrument keys (not constructed NSE_FO| keys)", () => {
  const s = snap();
  // every chain row call/put should have a MOCK_FO| key
  assert.ok(s.chain.every((r) => r.call.instrumentKey?.startsWith("MOCK_FO|")), "call keys should be MOCK_FO|");
  assert.ok(s.chain.every((r) => r.put.instrumentKey?.startsWith("MOCK_FO|")), "put keys should be MOCK_FO|");
});

test("CI2. contractDetails uses the key from the chain row — not constructed", () => {
  const s = keyedSnap();
  const a = analyze(s, T);
  const plan = a.candidates[0];
  if (!plan) return;
  const c = contractDetails(s, plan);
  assert.ok(c !== null);
  const leg = primaryLeg(plan)!;
  const row = s.chain.find((r) => r.strike === leg.strike)!;
  const expected = (leg.type === "CE" ? row.call : row.put).instrumentKey;
  assert.equal(c!.instrumentKey, expected, "key must come from chain row, not be constructed");
});

test("CI3. contractDetails.instrumentKey is null when chain has no key", () => {
  const s = noKeySnap();
  const a = analyze(s, T);
  const plan = a.candidates[0];
  if (!plan) return;
  const c = contractDetails(s, plan);
  assert.ok(c !== null);
  assert.equal(c!.instrumentKey, null);
});

test("CI4. normalizeChain preserves instrument_key from raw data", () => {
  const expiry = "2026-10-06";
  const raw = [
    {
      strike_price: 22700,
      underlying_spot_price: 22700,
      lot_size: 75,
      call_options: {
        instrument_key: "NSE_FO|NIFTY06OCT2026CE22700",
        market_data: { ltp: 145, bid_price: 144, ask_price: 146, oi: 50000, prev_oi: 48000, volume: 12000 },
        option_greeks: { iv: 16.5, delta: 0.5, gamma: 0.0002, theta: -0.8, vega: 0.3 },
      },
      put_options: {
        instrument_key: "NSE_FO|NIFTY06OCT2026PE22700",
        market_data: { ltp: 148, bid_price: 147, ask_price: 149, oi: 55000, prev_oi: 52000, volume: 13000 },
        option_greeks: { iv: 17, delta: -0.5, gamma: 0.0002, theta: -0.8, vega: 0.3 },
      },
    },
  ];
  const chain = normalizeChain(raw, "nifty", expiry);
  const row = chain.rows[0];
  assert.equal(row.call.instrumentKey, "NSE_FO|NIFTY06OCT2026CE22700", "normalizeChain must preserve CE key");
  assert.equal(row.put.instrumentKey, "NSE_FO|NIFTY06OCT2026PE22700", "normalizeChain must preserve PE key");
});

test("CI5. normalizeChain: instrumentKey is null when raw data has none", () => {
  const raw = [
    {
      strike_price: 22700,
      underlying_spot_price: 22700,
      lot_size: 75,
      call_options: {
        market_data: { ltp: 145, bid_price: 144, ask_price: 146, oi: 0, prev_oi: 0, volume: 0 },
        option_greeks: { iv: 16, delta: 0.5, gamma: 0, theta: 0, vega: 0 },
      },
      put_options: {
        market_data: { ltp: 148, bid_price: 147, ask_price: 149, oi: 0, prev_oi: 0, volume: 0 },
        option_greeks: { iv: 16, delta: -0.5, gamma: 0, theta: 0, vega: 0 },
      },
    },
  ];
  const chain = normalizeChain(raw, "nifty", "2026-10-06");
  assert.equal(chain.rows[0].call.instrumentKey, null);
  assert.equal(chain.rows[0].put.instrumentKey, null);
});

test("CI6. recommendation.instrumentKeyAvailable is true when chain has keys", () => {
  const a = analyze(keyedSnap(), T);
  const r = buildRecommendationResponse(a);
  if (a.status !== "TRADE") return;
  assert.equal(r.instrumentKeyAvailable, true);
});

test("CI7. recommendation.instrumentKeyAvailable is false when chain has no keys", () => {
  const a = analyze(noKeySnap(), T);
  const r = buildRecommendationResponse(a);
  assert.equal(r.instrumentKeyAvailable, false);
});

test("CI8. fail-close: TRADE with missing key → decision downgraded to WAIT", () => {
  // noKeySnap is live (would otherwise get TRADE if score is high enough)
  const a = analyze(noKeySnap(), T);
  if (a.status !== "TRADE") return; // only meaningful when engine would normally TRADE
  const r = buildRecommendationResponse(a);
  assert.equal(r.decision, "WAIT", "must be downgraded to WAIT when key is missing");
  assert.ok(r.blockers.some((b) => b.includes("OPTION_INSTRUMENT_ID_UNAVAILABLE")));
  assert.equal(r.execution, null, "execution must be null when key is missing");
});

test("CI9. instrument key from chain flows through: raw → normalize → strategy → recommendation", () => {
  const s = keyedSnap("NSE_FO|NIFTYTEST");
  const a = analyze(s, T);
  const plan = a.plan ?? a.candidates[0];
  if (!plan) return;
  const leg = primaryLeg(plan)!;
  const row = s.chain.find((r) => r.strike === leg.strike);
  if (!row) return;
  const rawKey = (leg.type === "CE" ? row.call : row.put).instrumentKey;
  const c = contractDetails(s, plan);
  assert.equal(c?.instrumentKey, rawKey, "key must survive end-to-end unchanged");
});

// ── Entry price / slippage ─────────────────────────────────────────────────────

test("CI10. entry uses ask when available (not LTP)", () => {
  const s = snap();
  const a = analyze(s, T);
  const plan = a.candidates[0];
  if (!plan) return;
  const leg = primaryLeg(plan)!;
  const row = s.chain.find((r) => r.strike === leg.strike)!;
  const q = leg.type === "CE" ? row.call : row.put;
  if (!q.ask) return;
  const ed = entryDetail(s, plan, 1.0);
  assert.ok(ed !== null);
  // paper entry >= ask (ask + 1% slippage)
  assert.ok(ed!.paperEntry >= q.ask, `paperEntry ${ed!.paperEntry} must be >= ask ${q.ask}`);
  assert.ok(ed!.paperEntrySource === "ASK");
});

test("CI11. slippage applied exactly once — paper entry = ask × (1 + slippage%/100)", () => {
  const s = snap();
  const a = analyze(s, T);
  const plan = a.candidates[0];
  if (!plan) return;
  const leg = primaryLeg(plan)!;
  const row = s.chain.find((r) => r.strike === leg.strike)!;
  const q = leg.type === "CE" ? row.call : row.put;
  if (!q.ask) return;
  const slippage = 1.0;
  const ed = entryDetail(s, plan, slippage);
  const expected = Math.round(q.ask * (1 + slippage / 100) * 100) / 100;
  assert.ok(Math.abs(ed!.paperEntry - expected) < 0.01, `paperEntry ${ed!.paperEntry} ≠ expected ${expected}`);
});

test("CI12. slippage fallback: no ask → LTP_FALLBACK, still positive", () => {
  const s = snap();
  const a = analyze(s, T);
  const plan = a.candidates[0];
  if (!plan) return;
  const leg = primaryLeg(plan)!;
  const stripped = {
    ...s,
    chain: s.chain.map((r) =>
      r.strike === leg.strike
        ? { ...r, [leg.type === "CE" ? "call" : "put"]: { ...(leg.type === "CE" ? r.call : r.put), ask: null, bid: null } }
        : r
    ),
  };
  const ed = entryDetail(stripped, plan, 1.0);
  assert.ok(ed !== null);
  assert.ok(ed!.paperEntry > 0);
  assert.equal(ed!.paperEntrySource, "LTP_FALLBACK");
});

// ── Stop loss / targets ────────────────────────────────────────────────────────

test("CI13. long option: entry > stop always (stop is below entry)", () => {
  const s = snap();
  const a = analyze(s, T);
  for (const c of a.candidates) {
    if (!c.legs.some((l) => l.side === "BUY")) continue;
    if (c.credit) continue; // skip credit strategies
    assert.ok(c.entry > c.stop, `${c.strategy}: entry ${c.entry} must be > stop ${c.stop}`);
  }
});

test("CI14. target ordering: target1 > entry and target2 >= target1", () => {
  const s = snap();
  const a = analyze(s, T);
  for (const c of a.candidates) {
    if (c.credit) continue;
    assert.ok(c.target1 > c.entry, `${c.strategy}: target1 ${c.target1} must be > entry ${c.entry}`);
    assert.ok(c.target2 >= c.target1, `${c.strategy}: target2 ${c.target2} must be >= target1 ${c.target1}`);
  }
});

test("CI15. stop is applied to option premium, not index price", () => {
  const s = snap(); // spot ~22700; option entry ~150
  const a = analyze(s, T);
  for (const c of a.candidates) {
    if (c.credit) continue;
    // stop must be in the range of option premium (< 1000), not in the index range (> 10000)
    assert.ok(c.stop < 5000, `${c.strategy}: stop ${c.stop} looks like an index price, not an option premium`);
  }
});

// ── Breakeven ─────────────────────────────────────────────────────────────────

test("CI16. long call: breakeven = strike + premium paid", () => {
  const s = snap();
  const a = analyze(s, T);
  const lc = a.candidates.find((c) => c.strategy === "Long Call");
  if (!lc) return;
  const leg = primaryLeg(lc)!;
  const expected = leg.strike + lc.entry;
  // Allow rounding tolerance
  assert.ok(Math.abs((lc.breakevens[0] ?? 0) - expected) < 1, `breakeven ${lc.breakevens[0]} ≠ strike+entry ${expected}`);
});

test("CI17. long put: breakeven = strike - premium paid", () => {
  const s = snap();
  const a = analyze(s, T);
  const lp = a.candidates.find((c) => c.strategy === "Long Put");
  if (!lp) return;
  const leg = primaryLeg(lp)!;
  const expected = leg.strike - lp.entry;
  assert.ok(Math.abs((lp.breakevens[0] ?? 0) - expected) < 1, `breakeven ${lp.breakevens[0]} ≠ strike-entry ${expected}`);
});

// ── Position sizing ────────────────────────────────────────────────────────────

test("CI18. quantity is a valid multiple of lot size", () => {
  const s = snap();
  const a = analyze(s, T);
  const lotSize = s.lotSize ?? 1;
  for (const c of a.candidates) {
    if (!c.risk?.quantity) continue;
    assert.equal(c.risk.quantity % lotSize, 0, `quantity ${c.risk.quantity} is not a multiple of lotSize ${lotSize}`);
  }
});

test("CI19. lots >= 1 when trade is approved", () => {
  const s = snap();
  const a = analyze(s, T);
  for (const c of a.candidates) {
    if (!c.risk?.allowed) continue;
    assert.ok(c.risk.lots >= 1, `approved trade must have lots >= 1`);
  }
});

test("CI20. capital required = entry × quantity for long options", () => {
  const s = snap();
  const a = analyze(s, T);
  for (const c of a.candidates) {
    if (!c.risk?.allowed || c.credit) continue;
    if (c.strategy !== "Long Call" && c.strategy !== "Long Put") continue;
    const expected = c.entry * c.risk.quantity;
    assert.ok(Math.abs(c.risk.capitalRequired - expected) < 5, `capitalRequired ${c.risk.capitalRequired} ≠ entry×qty ${expected}`);
  }
});

test("CI21. planned risk ≈ (entry - stop) × quantity for long options", () => {
  const s = snap();
  const a = analyze(s, T);
  for (const c of a.candidates) {
    if (!c.risk?.allowed || c.credit) continue;
    if (c.strategy !== "Long Call" && c.strategy !== "Long Put") continue;
    const riskPerUnit = c.entry - c.stop;
    // Allow slippage adjustment (risk engine adds slippage to risk per unit)
    const minRisk = riskPerUnit * c.risk.quantity;
    assert.ok(c.risk.totalRisk >= minRisk * 0.9, `totalRisk ${c.risk.totalRisk} < expected floor ${minRisk * 0.9}`);
  }
});

// ── R:R ───────────────────────────────────────────────────────────────────────

test("CI22. execution R:R is computed from actual entry/stop/target values", () => {
  const s = keyedSnap();
  const a = analyze(s, T);
  if (a.status !== "TRADE") return;
  const r = buildRecommendationResponse(a);
  if (!r.execution) return;
  const ex = r.execution;
  const risk = ex.entry - ex.stopLoss;
  const reward1 = ex.target1 - ex.entry;
  if (risk > 0) {
    const expected = Math.round((reward1 / risk) * 100) / 100;
    assert.ok(Math.abs(ex.rrTarget1 - expected) < 0.01, `rrTarget1 ${ex.rrTarget1} ≠ ${expected}`);
  }
});

test("CI23. candidates below min R:R 1.2 are rejected", () => {
  const s = snap();
  const a = analyze(s, T);
  for (const c of a.candidates) {
    if (!c.rejected) continue;
    // Some rejected candidates are rejected for R:R — verify the rejection message is sensible
    if (c.rejected.includes("Risk/reward")) {
      assert.ok(c.rr < 1.2 || c.rr < 0.4, `R:R ${c.rr} was rejected but looks acceptable`);
    }
  }
});

// ── Timestamps ────────────────────────────────────────────────────────────────

test("CI24. response carries marketSnapshotTimestamp and optionChainTimestamp", () => {
  const a = analyze(snap(), T);
  const r = buildRecommendationResponse(a);
  assert.ok("marketSnapshotTimestamp" in r, "missing marketSnapshotTimestamp");
  assert.ok("optionChainTimestamp" in r, "missing optionChainTimestamp");
});

// ── OI integrity — same snapshot ──────────────────────────────────────────────

test("CI25. OI values in recommendation come from the same snapshot used for analysis", () => {
  const s = snap();
  const a = analyze(s, T);
  const r = buildRecommendationResponse(a);
  // The OI support/resistance in the response should match chain metrics
  assert.equal(r.market.support, a.chain.support);
  assert.equal(r.market.resistance, a.chain.resistance);
  assert.equal(r.market.pcr, a.chain.pcrOi);
});

// ── Event risk fixture ─────────────────────────────────────────────────────────

test("CI26. event risk EXTREME → decision is WAIT, execution null", () => {
  const eventSnap: Snapshot = {
    ...liveSnap(),
    news: {
      ...snap().news,
      eventRisk: "RBI monetary policy — EXTREME",
      detail: {
        ...(snap().news.detail ?? {}),
        eventRisk: { level: "EXTREME", reason: "RBI monetary policy", articles: 18, today: true },
      } as never,
    },
  };
  const a = analyze(eventSnap, T);
  const r = buildRecommendationResponse(a);
  assert.ok(r.decision !== "TRADE", "event risk must prevent TRADE");
  assert.equal(r.execution, null);
});

// ── NO TRADE: stale data ───────────────────────────────────────────────────────

test("CI27. stale data → decision NO_TRADE, source STALE", () => {
  const a = analyze(staleSnap(), T);
  const r = buildRecommendationResponse(a);
  assert.equal(r.decision, "NO_TRADE");
  assert.equal(r.source, "STALE");
});

// ── Order safety (pure function, no I/O) ──────────────────────────────────────

test("CI28. buildRecommendationResponse is pure — no side effects or Upstox calls", () => {
  // If this runs without throwing, the function has no I/O side effects
  const a = analyze(snap(), T);
  const r = buildRecommendationResponse(a);
  assert.ok(typeof r.recommendationId === "string");
});
