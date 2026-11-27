import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { mockSnapshotTradeInputs } from "../testFixtures/mockSnapshotTradeInputs.ts";
import type { Snapshot } from "../types.ts";

const MIDDAY = new Date("2099-01-05T06:30:00.000Z");
let dir: string;

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "paper-auto-open-"));
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

function liveSnapshot(index: "nifty" | "banknifty", now: Date): Snapshot {
  const s = mockSnapshotTradeInputs(index, now);
  const sources = Object.fromEntries(Object.keys(s.sources).map((k) => [k, { source: "LIVE", provider: "UPSTOX" }]));
  return { ...s, sources, breadth: s.breadth ? { ...s.breadth, status: "LIVE" } : s.breadth } as Snapshot;
}

describe("automatic paper open for collected index options", () => {
  it("opens a linked PaperTrade, closes it with costs, and is recognised by readiness as a costed ledger record", async () => {
    const store = await import("./paperOpportunityStore.ts");
    const { createPaperOpportunity } = await import("./paperOpportunityMonitor.ts");
    const { setOpenSnapshotProviderForTests } = await import("./paperOpenDeps.ts");
    const { runOpenFlow } = await import("./paperOpportunityOpenFlow.ts");
    const { getPaperTradingEngine } = await import("./paperStore.ts");
    const { buildStrategyReadiness } = await import("./strategyReadiness.ts");
    const { PaperTradingEngine } = await import("../paperEngine.ts");
    const g = globalThis as unknown as { __upstoxPaperEngine?: unknown };
    g.__upstoxPaperEngine = new PaperTradingEngine({ accountCapital: 10_000_000 }, { allowMock: false });

    const snapshot = liveSnapshot("nifty", MIDDAY);
    const opp = createPaperOpportunity({
      instrumentType: "OPTION",
      underlying: "NIFTY",
      symbol: null,
      instrumentKey: "NSE_FO|12345",
      optionType: "CE",
      strike: snapshot.spot ?? 22100,
      expiry: "2099-12-31T15:30:00.000Z",
      strategyType: "LONG_CALL",
      direction: "BULLISH",
      entry: 100,
      stop: 60,
      target1: 160,
      target2: 200,
      spotAtEntry: snapshot.spot ?? 22050,
      iv: 15,
      delta: 0.45,
      oi: 50000,
      volume: 10000,
      spread: 2,
      score: 70,
      confidence: 70,
      grade: "A",
      signalAgreement: 5,
      regime: "NORMAL",
      eventRisk: null,
      reasons: ["Strong bullish trend"],
      strategyVersion: "20.1",
      source: "LIVE",
      provenance: "LIVE_COLLECTOR",
    } as never);
    store.savePaperOpportunity(opp);

    setOpenSnapshotProviderForTests(async () => snapshot, () => MIDDAY);
    try {
      const res = await runOpenFlow(opp.id);
      const body = (await res.json()) as { status: string; tradeId?: string; code: string };
      assert.equal(body.code, "OPENED", JSON.stringify(body));
      assert.equal(res.status, 201);
      assert.ok(body.tradeId);
      assert.equal(store.getPaperOpportunity(opp.id)?.openedPaperTradeId, body.tradeId);

      const engine = getPaperTradingEngine();
      const open = engine.getTrades().find((t) => t.id === body.tradeId)!;
      const closed = engine.closeTrade(open, "TARGET_HIT", snapshot, new Date(MIDDAY.getTime() + 60 * 60_000));
      assert.equal(closed.status, "TARGET_HIT");
      assert.ok(closed.transactionCosts, "closed trade carries transaction costs");
      assert.ok(closed.realizedPnL !== null && closed.realizedPnL !== undefined, "realized P&L is recorded net of costs");

      const { syncLinkedOpportunities } = await import("./paperOpportunitySync.ts");
      assert.equal(syncLinkedOpportunities(), 1);
      const linked = store.getPaperOpportunity(opp.id)!;
      assert.equal(linked.status, "TARGET1_HIT");
      assert.equal(linked.realizedR, Math.round((closed.realizedPnL! / closed.riskAmount) * 100) / 100);
      assert.equal(syncLinkedOpportunities(), 0, "a synced opportunity is not synced twice");
      const report = buildStrategyReadiness([linked], { costedTrades: [closed] }).find((r) => r.strategy === "NIFTY_OPTIONS")!;
      assert.equal(report.costedLedgerRecords, 1, "linked, closed, costed trade is recognised");
      assert.equal(report.quarantinedTrades, 1, "a single setup stays quarantined until its observation sample is reached");
      assert.equal(report.completedTrades, 0);
    } finally {
      setOpenSnapshotProviderForTests(null);
      delete g.__upstoxPaperEngine;
    }
  });
});
