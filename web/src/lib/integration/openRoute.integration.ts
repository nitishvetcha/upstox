// Integration test: the real POST /api/paper-opportunities/[id]/open route, with isolated storage and test credentials.
// Run with: npm run test:integration. Market data is the default MOCK provider, so the success path is not reachable here
// (it needs fresh LIVE data); the success path is covered by the pure decision tests and the paper-engine tests.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "open-int-"));
const TOKEN = "integration-operator-token-0123456789abcdefghij";
process.env.OPERATOR_TOKEN = TOKEN;
process.env.PAPER_OPPORTUNITY_DIR = path.join(root, "opps");
process.env.PAPER_TRADES_DIR = path.join(root, "trades");
process.env.MARKET_DATA_PROVIDER = "mock";

const { POST } = await import("../../app/api/paper-opportunities/[id]/open/route.ts");
const { createPaperOpportunity } = await import("../services/paperOpportunityMonitor.ts");
const { savePaperOpportunity, getPaperOpportunity, listPaperOpportunities } = await import("../services/paperOpportunityStore.ts");

function makeOpp(over: Record<string, unknown> = {}) {
  const opp = createPaperOpportunity({
    instrumentType: "OPTION", underlying: "NIFTY", symbol: null, optionType: "CE", strike: 22000,
    direction: "BULLISH", entry: 100, stop: 80, target1: 140, target2: 180,
    ...(over as object),
  } as never);
  savePaperOpportunity(opp);
  return opp;
}

const call = (id: string, auth: boolean) =>
  POST(new Request(`http://localhost/api/paper-opportunities/${id}/open`, {
    method: "POST",
    headers: auth ? { Authorization: `Bearer ${TOKEN}` } : {},
  }), { params: Promise.resolve({ id }) });

test("unauthenticated open is refused with 401 and changes nothing", async () => {
  const opp = makeOpp();
  const before = getPaperOpportunity(opp.id);
  const res = await call(opp.id, false);
  assert.equal(res.status, 401);
  assert.deepEqual(getPaperOpportunity(opp.id), before);
});

test("unknown opportunity is 404 (authorized)", async () => {
  const res = await call("does-not-exist", true);
  assert.equal(res.status, 404);
});

test("stock opportunity cannot be opened from the index snapshot (422, UNSUPPORTED)", async () => {
  const opp = makeOpp({ instrumentType: "STOCK", underlying: "RELIANCE", optionType: null, strike: null });
  const res = await call(opp.id, true);
  const body = await res.json();
  assert.equal(res.status, 422);
  assert.equal(body.code, "UNSUPPORTED");
});

test("already-opened opportunity is refused with 409 and not opened again", async () => {
  const opp = makeOpp({});
  const { updatePaperOpportunity } = await import("../services/paperOpportunityStore.ts");
  updatePaperOpportunity(opp.id, { openedPaperTradeId: "TRADE-EXISTING" });
  const res = await call(opp.id, true);
  const body = await res.json();
  assert.equal(res.status, 409);
  assert.equal(body.code, "ALREADY_OPENED");
  assert.equal(getPaperOpportunity(opp.id)?.openedPaperTradeId, "TRADE-EXISTING");
});

test("mock market data is refused at opening (422 PROVENANCE, labels MOCK, audit recorded, no trade created)", async () => {
  const opp = makeOpp({});
  const res = await call(opp.id, true);
  const body = await res.json();
  assert.equal(res.status, 422);
  assert.equal(body.code, "PROVENANCE");
  assert.ok(body.reasons.some((r: string) => /MOCK|not verified LIVE|UNAVAILABLE/.test(r)), JSON.stringify(body.reasons));
  const stored = getPaperOpportunity(opp.id);
  assert.equal(stored?.openedPaperTradeId ?? null, null, "no trade is linked");
  assert.equal(stored?.lastOpenAttempt?.code, "PROVENANCE", "rejection is recorded for audit");
});

test("a client-supplied LIVE label cannot open mock-backed data (body is ignored)", async () => {
  const opp = makeOpp({});
  const res = await POST(new Request(`http://localhost/api/paper-opportunities/${opp.id}/open`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ dataQuality: { market: "LIVE", optionChain: "LIVE", technical: "LIVE", breadth: "LIVE" }, source: "LIVE" }),
  }), { params: Promise.resolve({ id: opp.id }) });
  assert.equal(res.status, 422);
  assert.equal(getPaperOpportunity(opp.id)?.openedPaperTradeId ?? null, null);
});

test("opening attempts never create a ledger trade on mock data", async () => {
  const tradesFile = path.join(root, "trades");
  const ledgerExists = fs.existsSync(tradesFile) ? fs.readdirSync(tradesFile).length : 0;
  const opp = makeOpp({});
  await call(opp.id, true);
  const after = fs.existsSync(tradesFile) ? fs.readdirSync(tradesFile).length : 0;
  assert.equal(after, ledgerExists, "no new ledger file content from a refused open");
});

test("no opportunity is ever created as OPEN with a trade id by a refused request", async () => {
  const linked = listPaperOpportunities().filter((o) => o.openedPaperTradeId && o.lastOpenAttempt?.code === "PROVENANCE");
  assert.equal(linked.length, 0);
});
