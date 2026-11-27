import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { mockSnapshotTradeInputs } from "../testFixtures/mockSnapshotTradeInputs.ts";
import type { Analysis, Snapshot } from "../types.ts";
import type { ContractOpportunity } from "../engine/opportunityEngine.ts";
import { COMMODITY_PAPER_MULTIPLIER, toPaperAnalysis } from "./paperCommodityAdapter.ts";
import { MCX_FO_PROFILE, configForAsset } from "./transactionCosts.ts";

const MIDDAY = new Date("2099-01-05T06:30:00.000Z");
let dir: string;

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "paper-commodity-"));
  process.env.PAPER_OPPORTUNITY_DIR = path.join(dir, "opps");
  process.env.PAPER_TRADES_DIR = path.join(dir, "trades");
  process.env.COLLECTION_LOG_DIR = path.join(dir, "logs");
});

after(() => {
  delete process.env.PAPER_OPPORTUNITY_DIR;
  delete process.env.PAPER_TRADES_DIR;
  delete process.env.COLLECTION_LOG_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

function liveCommoditySnapshot(id: "goldm" | "silverm" | "crudeoil" | "naturalgas"): Snapshot {
  const s = mockSnapshotTradeInputs("nifty", MIDDAY);
  const sources = Object.fromEntries(Object.keys(s.sources).map((k) => [k, { source: "LIVE", provider: "UPSTOX" }]));
  return { ...s, index: id, sources, breadth: s.breadth ? { ...s.breadth, status: "LIVE" } : s.breadth } as unknown as Snapshot;
}

function candidateAt(snapshot: Snapshot): ContractOpportunity {
  const row = snapshot.chain[Math.floor(snapshot.chain.length / 2)];
  const entry = row.call.ask ?? row.call.ltp ?? 100;
  return {
    underlying: "GOLDM", strike: row.strike, optionType: "CE", strategyType: "LONG_CALL", expiry: "2099-12-31",
    entry, entryLow: entry * 0.98, entryHigh: entry * 1.02, stop: entry * 0.6, target1: entry * 1.6, target2: entry * 2,
    rr: 1.6, maxLoss: entry * 0.4, maxProfit: null, breakeven: entry, opportunityScore: 70, grade: "A",
  } as unknown as ContractOpportunity;
}

describe("commodity paper multipliers", () => {
  it("quotes units per ₹1 move for each MCX contract", () => {
    assert.deepEqual(COMMODITY_PAPER_MULTIPLIER, { crudeoil: 100, naturalgas: 1250, goldm: 10, silverm: 5 });
  });

  it("sets the paper lot to the quoted-unit multiplier", () => {
    const snap = liveCommoditySnapshot("goldm");
    const analysis = toPaperAnalysis(snap, candidateAt(snap), "goldm");
    assert.ok(analysis);
    assert.equal(analysis.snapshot.lotSize, 10);
    assert.equal(analysis.status, "TRADE");
  });

  it("refuses spreads on the commodity path", () => {
    const snap = liveCommoditySnapshot("silverm");
    const spread = { ...candidateAt(snap), strategyType: "BULL_CALL_SPREAD" } as unknown as ContractOpportunity;
    assert.equal(toPaperAnalysis(snap, spread, "silverm"), null);
  });
});

describe("commodity ledger sizing and costs", () => {
  it("sizes in whole multiplier units and closes with MCX_FO statutory costs", async () => {
    const { PaperTradingEngine } = await import("../paperEngine.ts");
    const engine = new PaperTradingEngine({ accountCapital: 10_000_000 }, { allowMock: false });
    const snap = liveCommoditySnapshot("goldm");
    const analysis = toPaperAnalysis(snap, candidateAt(snap), "goldm") as Analysis;
    const result = engine.processRecommendation(analysis, MIDDAY);
    assert.equal(result.created, true, result.reason);
    const trade = result.trade!;
    assert.equal(trade.quantity % 10, 0, "quantity is a whole number of quoted units");
    assert.ok(trade.quantity >= 10);

    const cfg = configForAsset("goldm");
    assert.equal(cfg.sttRate, MCX_FO_PROFILE.taxRate, "CTT rate from MCX_FO_PROFILE");
    assert.equal(cfg.exchangeTxnRate, MCX_FO_PROFILE.exchangeTxnRate, "MCX exchange transaction rate");

    const closed = engine.closeTrade(trade, "TARGET_HIT", snap, new Date(MIDDAY.getTime() + 60 * 60_000));
    assert.ok(closed.transactionCosts && closed.transactionCosts.totalCosts > 0);
    assert.equal(closed.transactionCosts!.totalCosts > 0, true);
  });
});

describe("commodity auto-open refusal", () => {
  it("does not open when the options engine no longer produces the candidate", async () => {
    const store = await import("./paperOpportunityStore.ts");
    const { createPaperOpportunity } = await import("./paperOpportunityMonitor.ts");
    const { setOpenSnapshotProviderForTests } = await import("./paperOpenDeps.ts");
    const { runOpenFlow } = await import("./paperOpportunityOpenFlow.ts");
    const snap = liveCommoditySnapshot("goldm");
    const row = snap.chain[Math.floor(snap.chain.length / 2)];
    const opp = createPaperOpportunity({
      instrumentType: "OPTION", underlying: "GOLDM", symbol: null, instrumentKey: "MCX_FO|GOLDM|CE",
      optionType: "CE", strike: row.strike, expiry: "2099-12-31T15:30:00.000Z", strategyType: "LONG_CALL",
      direction: "BULLISH", entry: 100, stop: 60, target1: 160, target2: 200, spotAtEntry: snap.spot,
      iv: 15, delta: 0.45, oi: 50000, volume: 10000, spread: 2, score: 70, confidence: 70, grade: "A",
      signalAgreement: 5, regime: "NORMAL", eventRisk: null, reasons: ["test"], strategyVersion: "20.1",
      source: "LIVE", provenance: "LIVE_COLLECTOR",
    } as never);
    store.savePaperOpportunity(opp);
    setOpenSnapshotProviderForTests(async () => snap, () => MIDDAY);
    try {
      const res = await runOpenFlow(opp.id);
      assert.notEqual(res.status, 201, "no trade may open without an engine-produced candidate");
      assert.equal(store.getPaperOpportunity(opp.id)?.openedPaperTradeId ?? null, null);
    } finally {
      setOpenSnapshotProviderForTests(null);
    }
  });
});
