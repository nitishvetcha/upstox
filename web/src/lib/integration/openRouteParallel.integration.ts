// Duplicate-open protection through the REAL route handler, with simultaneous requests. Test data only; no network.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "open-parallel-"));
const TOKEN = "integration-operator-token-0123456789abcdefghij";
process.env.OPERATOR_TOKEN = TOKEN;
process.env.PAPER_OPPORTUNITY_DIR = path.join(root, "opps");
process.env.PAPER_TRADES_DIR = path.join(root, "trades");
process.env.MARKET_DATA_PROVIDER = "mock";
process.env.ACCOUNT_CAPITAL = "388500";
process.env.MAX_CONCURRENT_POSITIONS = "10";
process.env.MAX_OPEN_RISK_PERCENT = "20";

const { POST } = await import("../../app/api/paper-opportunities/[id]/open/route.ts");
const { createPaperOpportunity } = await import("../services/paperOpportunityMonitor.ts");
const { savePaperOpportunity, getPaperOpportunity } = await import("../services/paperOpportunityStore.ts");
const { setOpenSnapshotProviderForTests } = await import("../services/paperOpenDeps.ts");
const { mockSnapshotTradeInputs } = await import("../testFixtures/mockSnapshotTradeInputs.ts");
const { getPaperTradingEngine } = await import("../services/paperStore.ts");

const FIXED_NOW = new Date("2026-10-05T07:00:00Z");
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Same trade-producing fixture the successful-open test uses, relabelled LIVE for test data only.
function liveFixture(index: string) {
  const s = mockSnapshotTradeInputs(index as "nifty", FIXED_NOW) as unknown as Record<string, unknown>;
  const live = () => ({ source: "LIVE", provider: "UPSTOX", fetchedAt: FIXED_NOW.toISOString(), lastTradeTime: FIXED_NOW.toISOString() });
  const sources = s.sources as Record<string, unknown>;
  for (const k of Object.keys(sources)) sources[k] = live();
  if (s.breadth) (s.breadth as Record<string, unknown>).source = live();
  return s as never;
}

function makeOpp() {
  const opp = createPaperOpportunity({
    instrumentType: "OPTION", underlying: "NIFTY", symbol: null, optionType: "CE", strike: 22000,
    direction: "BULLISH", entry: 100, stop: 80, target1: 140, target2: 180,
  } as never);
  savePaperOpportunity(opp);
  return opp;
}

const call = (id: string) => POST(new Request(`http://localhost/api/paper-opportunities/${id}/open`, {
  method: "POST", headers: { Authorization: `Bearer ${TOKEN}` },
}), { params: Promise.resolve({ id }) });

test("two simultaneous opens: exactly one trade, the other is ALREADY_OPENED, one link", async () => {
  // The snapshot is slow, so both requests are in flight at the same time.
  setOpenSnapshotProviderForTests(async (index) => { await delay(50); return liveFixture(index); }, () => FIXED_NOW);
  const opp = makeOpp();
  const [a, b] = await Promise.all([call(opp.id), call(opp.id)]);
  const results = [{ status: a.status, body: await a.json() }, { status: b.status, body: await b.json() }];
  const opened = results.filter((r) => r.status === 201);
  const refused = results.filter((r) => r.status === 409);
  assert.equal(opened.length, 1, JSON.stringify(results));
  assert.equal(refused.length, 1, JSON.stringify(results));
  assert.equal(refused[0]!.body.code, "ALREADY_OPENED");
  assert.equal(getPaperTradingEngine().getTrades().length, 1, "exactly one paper trade in the ledger");
  const saved = getPaperOpportunity(opp.id)!;
  assert.equal(saved.openedPaperTradeId, opened[0]!.body.tradeId, "the opportunity links to that one trade");
  assert.ok(!saved.openingClaimedAt, "claim released after the attempt");
});

test("a refused attempt releases its claim and links nothing; the next attempt is evaluated, not refused as in progress", async () => {
  // Unlabelled mock snapshot: provenance refuses it, so no trade is attempted.
  setOpenSnapshotProviderForTests(async (index) => mockSnapshotTradeInputs(index as "nifty", FIXED_NOW), () => FIXED_NOW);
  const opp = makeOpp();
  const first = await call(opp.id);
  assert.equal(first.status, 422);
  assert.equal((await first.json()).code, "PROVENANCE");
  const saved = getPaperOpportunity(opp.id)!;
  assert.ok(!saved.openedPaperTradeId, "nothing linked");
  assert.ok(!saved.openingClaimedAt, "claim released");
  const second = await call(opp.id);
  assert.equal(second.status, 422, "evaluated again, not stuck behind a claim");
});
