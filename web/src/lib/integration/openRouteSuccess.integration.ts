// Successful opening through the REAL route handler. Test data only: the snapshot is the existing trade-producing fixture,
// with its sources relabelled LIVE for this test. The trade-plan generator, sizing, risk engine and paper engine are NOT mocked.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "open-ok-"));
const TOKEN = "integration-operator-token-0123456789abcdefghij";
process.env.OPERATOR_TOKEN = TOKEN;
process.env.PAPER_OPPORTUNITY_DIR = path.join(root, "opps");
process.env.PAPER_TRADES_DIR = path.join(root, "trades");
process.env.MARKET_DATA_PROVIDER = "mock";
// Test account capital (the same figure the existing trade-producing fixture tests use). The 1% limit stays 1% of this capital.
process.env.ACCOUNT_CAPITAL = "388500";
// Aggregate caps raised for this test only, so that several trades can coexist in one ledger. The per-trade 1% limit is NOT changed.
process.env.MAX_CONCURRENT_POSITIONS = "10";
process.env.MAX_OPEN_RISK_PERCENT = "20";

const { POST } = await import("../../app/api/paper-opportunities/[id]/open/route.ts");
const { createPaperOpportunity } = await import("../services/paperOpportunityMonitor.ts");
const { savePaperOpportunity, getPaperOpportunity } = await import("../services/paperOpportunityStore.ts");
const { setOpenSnapshotProviderForTests } = await import("../services/paperOpenDeps.ts");
const { mockSnapshotTradeInputs } = await import("../testFixtures/mockSnapshotTradeInputs.ts");
const { getPaperTradingEngine } = await import("../services/paperStore.ts");

// Test data: the trade-producing fixture, sources relabelled LIVE, timestamps set to now.
const FIXED_NOW = new Date("2026-10-05T07:00:00Z"); // same instant the existing trade-producing fixture tests use
function liveFixture(index: "nifty" | "banknifty", stale = false) {
  const now = stale ? new Date(FIXED_NOW.getTime() - 6 * 3600_000) : FIXED_NOW;
  const s = mockSnapshotTradeInputs(index, now) as unknown as Record<string, unknown>;
  const live = (p: string) => ({ source: "LIVE", provider: p === "x" ? "UPSTOX" : "UPSTOX", fetchedAt: now.toISOString(), lastTradeTime: now.toISOString() });
  const sources = s.sources as Record<string, unknown>;
  for (const k of Object.keys(sources)) sources[k] = live(k);
  if (s.breadth) (s.breadth as Record<string, unknown>).source = live("breadth");
  return s as never;
}

function makeOpp(over: Record<string, unknown> = {}) {
  const opp = createPaperOpportunity({
    instrumentType: "OPTION", underlying: "NIFTY", symbol: null, optionType: "CE", strike: 22000,
    direction: "BULLISH", entry: 100, stop: 80, target1: 140, target2: 180, ...(over as object),
  } as never);
  savePaperOpportunity(opp);
  return opp;
}

const call = (id: string) => POST(new Request(`http://localhost/api/paper-opportunities/${id}/open`, {
  method: "POST", headers: { Authorization: `Bearer ${TOKEN}` },
}), { params: Promise.resolve({ id }) });

test("successful opening: real route, real analysis, sizing, risk engine and ledger; opportunity linked; audit kept", async () => {
  setOpenSnapshotProviderForTests(async (index) => liveFixture(index as "nifty"), () => FIXED_NOW);
  const opp = makeOpp();
  const res = await call(opp.id);
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  assert.equal(body.code, "OPENED");
  const tradeId = body.tradeId as string;
  assert.ok(tradeId, "a trade id is returned");
  const trade = getPaperTradingEngine().getTrade(tradeId);
  assert.ok(trade, "the trade exists in the ledger");
  assert.ok(trade!.riskAmount > 0, "the trade carries a computed risk amount");
  assert.ok(trade!.riskAmount <= 0.01 * 388_500 + 1e-6, "the 1% risk limit (1% of the configured capital) is not exceeded");
  const stored = getPaperOpportunity(opp.id);
  assert.equal(stored?.openedPaperTradeId, tradeId, "opportunity linked to the trade");
  assert.equal(stored?.lastOpenAttempt?.code, "OPENED", "audit record of the accepted opening");

  // Duplicate opening of the same opportunity: refused before any engine call, no second trade.
  const tradesBefore = getPaperTradingEngine().getTrades().length;
  const again = await call(opp.id);
  assert.equal(again.status, 409);
  assert.equal(getPaperTradingEngine().getTrades().length, tradesBefore, "no second trade");
  setOpenSnapshotProviderForTests(null);
});

test("stale snapshot is refused by the paper engine's freshness gate and nothing is linked", async () => {
  setOpenSnapshotProviderForTests(async (index) => liveFixture(index as "nifty", true), () => FIXED_NOW);
  const opp = makeOpp();
  const res = await call(opp.id);
  const body = await res.json();
  assert.equal(res.status, 422);
  assert.match(String(body.code), /ENGINE_REJECTED|PROVENANCE|NO_PLAN|PLAN_REJECTED/);
  assert.equal(getPaperOpportunity(opp.id)?.openedPaperTradeId ?? null, null);
  setOpenSnapshotProviderForTests(null);
});

// Runs `fn` with the given environment values, restoring the previous values afterwards.
async function withEnv(vars: Record<string, string>, fn: () => Promise<void>) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) { prev[k] = process.env[k]; process.env[k] = vars[k]; }
  try { await fn(); } finally {
    for (const k of Object.keys(vars)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; }
  }
}

test("insufficient capital: at 1 lakh the 1% limit cannot size this trade; refused, no ledger change", async () => {
  await withEnv({ ACCOUNT_CAPITAL: "100000" }, async () => {
    setOpenSnapshotProviderForTests(async (index) => liveFixture(index as "nifty"), () => FIXED_NOW);
    const opp = makeOpp({ strike: 21000 });
    const before = getPaperTradingEngine().getTrades().length;
    const res = await call(opp.id);
    const body = await res.json();
    assert.equal(res.status, 422);
    assert.ok(["NO_PLAN", "ENGINE_REJECTED", "PLAN_REJECTED"].includes(body.code), body.code);
    assert.equal(getPaperTradingEngine().getTrades().length, before, "no ledger change");
    assert.equal(getPaperOpportunity(opp.id)?.openedPaperTradeId ?? null, null);
    setOpenSnapshotProviderForTests(null);
  });
});

test("risk rejection (aggregate open-risk cap exceeded) is returned with its reason and never mutates the ledger", async () => {
  await withEnv({ MAX_OPEN_RISK_PERCENT: "0.0001" }, async () => {
    setOpenSnapshotProviderForTests(async (index) => liveFixture(index as "nifty"), () => FIXED_NOW);
    const opp = makeOpp({ strike: 21500 });
    const before = getPaperTradingEngine().getTrades().length;
    const res = await call(opp.id);
    const body = await res.json();
    assert.equal(res.status, 422);
    assert.ok(["NO_PLAN", "ENGINE_REJECTED", "PLAN_REJECTED"].includes(body.code), body.code);
    assert.ok(body.reasons.length > 0, "a reason is returned");
    assert.equal(getPaperTradingEngine().getTrades().length, before, "no ledger mutation on risk rejection");
    setOpenSnapshotProviderForTests(null);
  });
});
