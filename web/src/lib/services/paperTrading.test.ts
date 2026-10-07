import { test } from "node:test";
import assert from "node:assert/strict";
import { PaperTradingEngine, calculateEntryFill, calculateExitFill, calculateNetValue, calculateTradePnL } from "../paperEngine.ts";
import { mockSnapshot } from "./mock.ts";
import { analyze } from "../engine/strategy.ts";
import type { Analysis, Quote, Snapshot, TradePlan } from "../types.ts";

const MIDDAY = new Date("2026-10-05T07:00:00Z"); // Mon 12:30 IST

test("1. Paper Engine: TRADE + APPROVED + LIVE market data creates paper trade", () => {
  const engine = new PaperTradingEngine({ accountCapital: 500_000 });
  const snapshot = mockSnapshot("nifty", MIDDAY);
  const analysis = analyze(snapshot, MIDDAY, { accountCapital: 500_000 });

  assert.equal(analysis.status, "TRADE");
  assert.ok(analysis.plan);

  const result = engine.processRecommendation(analysis, MIDDAY);
  assert.equal(result.created, true);
  assert.equal(result.reason, "PAPER_TRADE_OPENED");
  assert.ok(result.trade);
  assert.equal(result.trade!.status, "OPEN");
  assert.equal(result.trade!.executionMode, "PAPER");
  assert.equal(result.trade!.marketDataSource, "UPSTOX_LIVE");
  assert.equal(engine.getTrades().length, 1);
});

test("2. Paper Engine: WAIT produces no paper trade", () => {
  const engine = new PaperTradingEngine({ accountCapital: 500_000 });
  const snapshot = mockSnapshot("banknifty", MIDDAY);
  const analysis = analyze(snapshot, MIDDAY, { accountCapital: 500_000 });

  assert.equal(analysis.status, "WAIT");
  const result = engine.processRecommendation(analysis, MIDDAY);
  assert.equal(result.created, false);
  assert.equal(result.trade, null);
  assert.ok(result.reason.startsWith("RECOMMENDATION_NOT_TRADE"));
});

test("3. Paper Engine: END_OF_DAY market data cannot create a trade", () => {
  const engine = new PaperTradingEngine({ accountCapital: 500_000 });
  const snapshot = mockSnapshot("nifty", MIDDAY);
  snapshot.sources.market = { source: "END_OF_DAY", provider: "UPSTOX", fetchedAt: MIDDAY.toISOString() };

  const analysis = analyze(snapshot, MIDDAY, { accountCapital: 500_000 });
  const result = engine.processRecommendation(analysis, MIDDAY);

  assert.equal(result.created, false);
  assert.equal(result.trade, null);
  assert.ok(result.reason.includes("FRESHNESS_BLOCKED"));
});

test("4. Paper Engine: STALE market data cannot create a trade", () => {
  const engine = new PaperTradingEngine({ accountCapital: 500_000 });
  const snapshot = mockSnapshot("nifty", MIDDAY);
  snapshot.sources.market = { source: "STALE", provider: "UPSTOX", fetchedAt: MIDDAY.toISOString() };

  const analysis = analyze(snapshot, MIDDAY, { accountCapital: 500_000 });
  const result = engine.processRecommendation(analysis, MIDDAY);

  assert.equal(result.created, false);
  assert.equal(result.trade, null);
});

test("5. Paper Engine: Risk rejection prevents paper trade creation", () => {
  const engine = new PaperTradingEngine({ accountCapital: 100_000, riskPerTradePercent: 0.01 }); // Tiny capital to trigger risk limit
  const snapshot = mockSnapshot("nifty", MIDDAY);
  const analysis = analyze(snapshot, MIDDAY, { accountCapital: 100_000, riskPerTradePercent: 0.01 });

  const result = engine.processRecommendation(analysis, MIDDAY);
  assert.equal(result.created, false);
  assert.equal(result.trade, null);
  assert.ok(result.reason.startsWith("RISK_REJECTED") || result.reason.startsWith("RECOMMENDATION_NOT_TRADE"));
});

test("6. Paper Engine: MAX_CONCURRENT_POSITIONS prevents additional paper trades", () => {
  const engine = new PaperTradingEngine({ accountCapital: 500_000, maxConcurrentPositions: 1 });
  const snapshotNifty = mockSnapshot("nifty", MIDDAY);
  const analysisNifty = analyze(snapshotNifty, MIDDAY, { accountCapital: 500_000, maxConcurrentPositions: 1 });

  const r1 = engine.processRecommendation(analysisNifty, MIDDAY);
  assert.equal(r1.created, true);

  // Attempt second trade on BANK NIFTY (force status = TRADE)
  const snapshotBank = mockSnapshot("banknifty", MIDDAY);
  snapshotBank.indicators = snapshotNifty.indicators; // Give it valid indicators
  const analysisBank = analyze(snapshotBank, MIDDAY, { accountCapital: 500_000, maxConcurrentPositions: 1 });
  analysisBank.status = "TRADE";
  analysisBank.plan = { ...analysisNifty.plan! };

  const r2 = engine.processRecommendation(analysisBank, new Date(MIDDAY.getTime() + 10 * 60_000));
  assert.equal(r2.created, false);
  assert.ok(r2.reason.includes("RISK_REJECTED"), `reason should be RISK_REJECTED, got: ${r2.reason}`);
});

test("7. Paper Fill: Long entry uses ask and applies slippage", () => {
  const quote: Quote = { ltp: 100, bid: 99.5, ask: 100.5, oi: 1000, chgOi: 0, volume: 2000, iv: 15, delta: 0.5 };
  const fill = calculateEntryFill({ side: "BUY", type: "CE", strike: 25150, ltp: 100 }, quote, 1.0);
  assert.equal(fill.source, "ASK");
  assert.equal(fill.fillPrice, Math.round(100.5 * 1.01 * 100) / 100);
});

test("8. Paper Fill: Short leg uses bid and applies slippage", () => {
  const quote: Quote = { ltp: 100, bid: 99.5, ask: 100.5, oi: 1000, chgOi: 0, volume: 2000, iv: 15, delta: 0.5 };
  const fill = calculateEntryFill({ side: "SELL", type: "CE", strike: 25200, ltp: 100 }, quote, 1.0);
  assert.equal(fill.source, "BID");
  assert.equal(fill.fillPrice, Math.round(99.5 * 0.99 * 100) / 100);
});

test("9. P&L Math & Independent Verification: Long Call", () => {
  // Long Call 65 quantity (1 lot of NIFTY)
  // Entry fill: 100, Exit fill: 150
  // Manual P&L: (150 - 100) * 65 = ₹3250
  const legs = [
    { side: "BUY" as const, type: "CE" as const, strike: 25150, entryLtp: 100, entryFillPrice: 100, entryFillSource: "ASK" as const, currentPrice: 150, exitPrice: 150 },
  ];
  const manualPnL = (150 - 100) * 65;
  const computed = calculateTradePnL(legs, 65, true);
  assert.equal(computed.pnl, manualPnL);
  assert.equal(computed.pnl, 3250);
});

test("10. P&L Math & Independent Verification: Bull Call Spread", () => {
  // Long 25150 CE @ 100, Short 25250 CE @ 40 (Net entry debit = 60)
  // Exit: Long CE @ 140, Short CE @ 15 (Net exit debit value = 125)
  // Manual P&L per unit: (140 - 100) + (40 - 15) = +40 + 25 = +65
  // Total P&L for 65 qty: 65 * 65 = ₹4225
  const legs = [
    { side: "BUY" as const, type: "CE" as const, strike: 25150, entryLtp: 100, entryFillPrice: 100, entryFillSource: "ASK" as const, currentPrice: 140, exitPrice: 140 },
    { side: "SELL" as const, type: "CE" as const, strike: 25250, entryLtp: 40, entryFillPrice: 40, entryFillSource: "BID" as const, currentPrice: 15, exitPrice: 15 },
  ];
  const manualPnL = ((140 - 100) + (40 - 15)) * 65;
  const computed = calculateTradePnL(legs, 65, true);
  assert.equal(computed.pnl, manualPnL);
  assert.equal(computed.pnl, 4225);
});

test("11. P&L Math & Independent Verification: Straddle combined premium", () => {
  // ATM Straddle: Long CE @ 120, Long PE @ 110 (Combined entry premium = 230)
  // Exit: CE @ 200, PE @ 20 (Combined exit premium = 220)
  // Manual P&L: (220 - 230) * 65 = -₹650
  const legs = [
    { side: "BUY" as const, type: "CE" as const, strike: 25150, entryLtp: 120, entryFillPrice: 120, entryFillSource: "ASK" as const, currentPrice: 200, exitPrice: 200 },
    { side: "BUY" as const, type: "PE" as const, strike: 25150, entryLtp: 110, entryFillPrice: 110, entryFillSource: "ASK" as const, currentPrice: 20, exitPrice: 20 },
  ];
  const manualPnL = ((200 - 120) + (20 - 110)) * 65;
  const computed = calculateTradePnL(legs, 65, true);
  assert.equal(computed.pnl, manualPnL);
  assert.equal(computed.pnl, -650);
});

test("12. Lifecycle: Stop Loss Execution", () => {
  const engine = new PaperTradingEngine({ accountCapital: 500_000 });
  const snapshot = mockSnapshot("nifty", MIDDAY);
  const analysis = analyze(snapshot, MIDDAY, { accountCapital: 500_000 });
  const r = engine.processRecommendation(analysis, MIDDAY);
  assert.ok(r.trade);

  const trade = r.trade!;
  assert.equal(trade.status, "OPEN");

  // Simulate market crash below stop loss
  const crashSnapshot = mockSnapshot("nifty", MIDDAY);
  crashSnapshot.chain.forEach((row) => {
    row.call.ltp = 5; // Crashed to 5
    row.call.bid = 5;
    row.call.ask = 5;
  });

  const updated = engine.evaluateOpenTrades(crashSnapshot, new Date(MIDDAY.getTime() + 60_000));
  assert.equal(updated.length, 1);
  assert.equal(trade.status, "STOPPED_OUT");
  assert.equal(trade.exitReason, "STOP_LOSS");
  assert.ok((trade.realizedPnL ?? 0) < 0);
});

test("13. Lifecycle: Target Hit Execution", () => {
  const engine = new PaperTradingEngine({ accountCapital: 500_000 });
  const snapshot = mockSnapshot("nifty", MIDDAY);
  const analysis = analyze(snapshot, MIDDAY, { accountCapital: 500_000 });
  const r = engine.processRecommendation(analysis, MIDDAY);
  assert.ok(r.trade);

  const trade = r.trade!;

  // Simulate market surge reaching target 1
  const surgeSnapshot = mockSnapshot("nifty", MIDDAY);
  surgeSnapshot.chain.forEach((row) => {
    row.call.ltp = trade.target1 + 10;
    row.call.bid = trade.target1 + 10;
    row.call.ask = trade.target1 + 10;
  });

  const updated = engine.evaluateOpenTrades(surgeSnapshot, new Date(MIDDAY.getTime() + 60_000));
  assert.equal(updated.length, 1);
  assert.equal(trade.status, "TARGET_HIT");
  assert.equal(trade.exitReason, "TARGET");
  assert.equal(trade.targetReached, 1);
  assert.ok((trade.realizedPnL ?? 0) > 0);
});

test("14. Lifecycle: Expiry Execution", () => {
  const engine = new PaperTradingEngine({ accountCapital: 500_000 });
  const snapshot = mockSnapshot("nifty", MIDDAY);
  const analysis = analyze(snapshot, MIDDAY, { accountCapital: 500_000 });
  const r = engine.processRecommendation(analysis, MIDDAY);
  assert.ok(r.trade);

  const trade = r.trade!;

  // Simulate time after expiry date (e.g. 16:00 IST on expiry date)
  const postExpiryTime = new Date(`${trade.expiry}T16:00:00+05:30`);
  const updated = engine.evaluateOpenTrades(snapshot, postExpiryTime);

  assert.equal(updated.length, 1);
  assert.equal(trade.status, "EXPIRED");
  assert.equal(trade.exitReason, "EXPIRY");
});

test("15. Portfolio Summary Statistics", () => {
  const engine = new PaperTradingEngine({ accountCapital: 500_000 });
  const snapshot = mockSnapshot("nifty", MIDDAY);
  const analysis = analyze(snapshot, MIDDAY, { accountCapital: 500_000 });
  engine.processRecommendation(analysis, MIDDAY);

  const summary = engine.getPortfolioSummary();
  assert.equal(summary.startingCapital, 100_000);
  assert.equal(summary.openPositions, 1);
  assert.ok(summary.openRisk > 0);
});
