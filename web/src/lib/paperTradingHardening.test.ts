// Paper-trading hardening regression suite.
// ALL scenarios here are deterministic SIMULATIONS (mock snapshots, hand-built ledgers). They demonstrate that the
// simulator's mechanics are correct; they are NOT live-market evidence and say nothing about profitability.
import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { PaperTradingEngine, calculateEntryFill, calculateExitFill } from "./paperEngine.ts";
import { expiryInstant as ledgerExpiryInstant, istDay } from "./paperMath.ts";
import { buildPaperLedgerReport, reconcileLedger, REPORT_LABEL } from "./paperReport.ts";
import { loadPaperLedger, savePaperLedger } from "./services/paperLedgerStore.ts";
import { optionMonitorInput } from "./services/paperPriceInput.ts";
import { costsFor, DEFAULT_TRANSACTION_COSTS } from "./services/transactionCosts.ts";
import { mockSnapshotTradeInputs as mockSnapshot } from "./testFixtures/mockSnapshotTradeInputs.ts";
import { analyze } from "./engine/strategy.ts";
import {
  createPaperOpportunity,
  evaluatePaperOpportunity,
  expiryInstant,
} from "./services/paperOpportunityMonitor.ts";
import {
  savePaperOpportunity,
  listPaperOpportunities,
  listUnreadablePaperOpportunityFiles,
} from "./services/paperOpportunityStore.ts";
import { runLiveOpportunityCollection } from "./services/liveOpportunityCollector.ts";
import type { Snapshot } from "./types.ts";
import type { PaperTrade, PaperTradeEvent } from "./paperTypes.ts";

const ROOT = path.join(process.cwd(), ".test-data", "paper_hardening");
const M = new Date("2026-10-05T07:00:00Z"); // Mon 12:30 IST
const CAP = 500_000;

function freshSetup(opts?: ConstructorParameters<typeof PaperTradingEngine>[1], cfg: Record<string, number> = {}) {
  const snap = mockSnapshot("nifty", M);
  const analysis = analyze(snap, M, { accountCapital: CAP, ...cfg });
  const engine = new PaperTradingEngine({ accountCapital: CAP, ...cfg }, opts);
  return { snap, analysis, engine };
}

// Every call quote in the chain set to one price (a simulated market move).
function withCallPrice(snap: Snapshot, px: number): Snapshot {
  const s = structuredClone(snap);
  for (const r of s.chain) { r.call.ltp = px; r.call.bid = px; r.call.ask = px; }
  return s;
}

function open(engine: PaperTradingEngine, analysis: ReturnType<typeof analyze>, at = M): PaperTrade {
  const r = engine.processRecommendation(analysis, at);
  assert.equal(r.created, true, `expected a paper trade, got ${r.reason}`);
  return r.trade!;
}

describe("SIMULATION: options paper engine, fills and costs", () => {
  it("long entry fills at ASK plus slippage (spread paid), exit at BID minus slippage", () => {
    const { analysis, engine } = freshSetup();
    const t = open(engine, analysis);
    // Mock quote: ltp 56.05, bid 55.95, ask 56.15. Entry is NOT the 56.05 last price.
    assert.equal(t.legs[0].entryFillSource, "ASK");
    assert.equal(t.legs[0].entryFillPrice, Math.round(56.15 * 1.01 * 100) / 100); // 56.71
    assert.ok(t.legs[0].entryFillPrice > t.legs[0].entryLtp, "paying the spread: fill above LTP");
    const exit = calculateExitFill(t.legs[0], { ltp: 100, bid: 99, ask: 101, oi: 1, chgOi: 0, volume: 1, iv: 1, delta: 1 }, 1.0);
    assert.equal(exit.source, "BID");
    assert.equal(exit.fillPrice, Math.round(99 * 0.99 * 100) / 100);
    // zero slippage still pays the spread
    assert.equal(calculateEntryFill({ side: "BUY", type: "CE", strike: 1, ltp: 56.05 }, { ltp: 56.05, bid: 55.95, ask: 56.15, oi: 1, chgOi: 0, volume: 1, iv: 1, delta: 1 }, 0).fillPrice, 56.15);
  });

  it("profitable trade: net P&L = gross − costs, costs hand-verified, ledger reconciles", () => {
    const { snap, analysis, engine } = freshSetup();
    const t = open(engine, analysis);
    assert.equal(t.quantity, 130);
    engine.evaluateOpenTrades(withCallPrice(snap, 100), new Date(M.getTime() + 60_000));
    assert.equal(t.status, "TARGET_HIT");
    // independent arithmetic: entry 56.71, exit round(100*.99)=99, qty 130
    assert.equal(t.legs[0].exitPrice, 99);
    assert.equal(t.grossPnL, Math.round((99 - 56.71) * 130 * 100) / 100); // 5497.7
    // hand-calculated under Plus research fallback: brokerage 60 + STT 19.31 + exch 7.19 + SEBI 0.02 + GST 12.09 + stamp 0.22 = 98.83
    assert.ok(Math.abs(t.transactionCosts!.totalCosts - 98.83) < 0.05, `costs ${t.transactionCosts!.totalCosts}`);
    assert.equal(t.realizedPnL, Math.round((t.grossPnL! - t.transactionCosts!.totalCosts) * 100) / 100);
    assert.ok(t.realizedPnL! < t.grossPnL!);
    assert.deepEqual(reconcileLedger(engine.getTrades(), engine.getEvents()).issues, []);
  });

  it("losing trade: costs make the loss larger than the gross loss", () => {
    const { snap, analysis, engine } = freshSetup();
    const t = open(engine, analysis);
    engine.evaluateOpenTrades(withCallPrice(snap, 28), new Date(M.getTime() + 60_000));
    assert.equal(t.status, "STOPPED_OUT");
    assert.equal(t.exitReason, "STOP_LOSS");
    assert.ok(t.grossPnL! < 0);
    assert.ok(t.realizedPnL! < t.grossPnL!, "net loss is worse than gross loss");
  });

  it("gap through the stop exits at the gapped price, not at the stop (loss can exceed planned risk)", () => {
    const { snap, analysis, engine } = freshSetup();
    const t = open(engine, analysis);
    engine.evaluateOpenTrades(withCallPrice(snap, 5), new Date(M.getTime() + 60_000));
    assert.equal(t.status, "STOPPED_OUT");
    assert.ok(t.exitPrice! < t.stopLoss, `exit ${t.exitPrice} must be below stop ${t.stopLoss}`);
    assert.ok(Math.abs(t.realizedPnL!) > t.riskAmount, "a gap realistically loses more than the planned risk");
  });

  it("unrealized P&L is net of estimated round-trip costs and starts below zero", () => {
    const { analysis, engine } = freshSetup();
    const t = open(engine, analysis);
    assert.ok(t.unrealizedPnL! < 0, "just opened: spread/slippage/cost drag, never a free profit");
  });

  it("sizing is re-checked at the simulated fill and only ever reduced", () => {
    // 1% of 391,000 = ₹3,910. Net basis: two lots fit at the plan entry (56.05) but only one at the 56.71 fill.
    const { analysis, engine } = freshSetup(undefined, { accountCapital: 391_000 });
    assert.equal(analysis.status, "TRADE");
    const r = engine.processRecommendation(analysis, M);
    assert.equal(r.created, true, r.reason);
    assert.equal(r.trade!.riskAssessmentSnapshot.lots, 2, "risk engine sized 2 lots on the plan entry");
    assert.equal(r.trade!.lots, 1, "re-sized to 1 lot at the actual fill");
    assert.equal(r.trade!.quantity, 65);
    assert.ok(r.trade!.riskAmount <= 3910);
    assert.match(String(engine.getEvents()[0].details?.sizingNote), /lots reduced 2 -> 1/);
  });

  it("post-fill sizing also respects remaining portfolio risk and position value", () => {
    const { analysis, engine } = freshSetup(undefined, { accountCapital: 370_000, maxOpenRiskPercent: 1.5, maxPositionValuePercent: 1.2 });
    const plannedRisk = analysis.plan!.risk!.totalRisk;
    const result = engine.processRecommendation(analysis, M, { existingOpenRisk: 5550 - plannedRisk });
    assert.equal(result.created, false, "a fill that would push aggregate risk or value beyond a limit must be rejected");
    assert.match(result.reason, /^RISK_REJECTED/);
  });
});

describe("SIMULATION: options paper engine, data trust", () => {
  it("MOCK snapshot is refused by the persisted-ledger engine configuration", () => {
    const { analysis, engine } = freshSetup({ allowMock: false });
    const r = engine.processRecommendation(analysis, M);
    assert.equal(r.created, false);
    assert.match(r.reason, /FRESHNESS_BLOCKED: Market data source is MOCK/);
  });

  it("a LIVE market paired with a MOCK option chain is refused by the persisted-ledger engine", () => {
    const { snap, analysis, engine } = freshSetup({ allowMock: false });
    analysis.snapshot = structuredClone(snap);
    analysis.snapshot.sources.market = { ...analysis.snapshot.sources.market, source: "LIVE" };
    analysis.snapshot.sources.optionChain = { ...analysis.snapshot.sources.optionChain, source: "MOCK" };
    analysis.status = "TRADE";
    const r = engine.processRecommendation(analysis, M);
    assert.equal(r.created, false);
    assert.match(r.reason, /Option chain data source is MOCK/);
  });

  it("a stale option chain freezes the position: no stop/target decision on untrusted data", () => {
    const { snap, analysis, engine } = freshSetup();
    const t = open(engine, analysis);
    const stale = withCallPrice(snap, 5); // would be a stop-out if trusted
    stale.sources.optionChain = { ...stale.sources.optionChain, source: "STALE" };
    engine.evaluateOpenTrades(stale, new Date(M.getTime() + 60_000));
    assert.equal(t.status, "OPEN");
    assert.equal(t.realizedPnL, null);
    assert.equal(t.monitoring?.status, "STALE_QUOTES");
    // repeat: still open, and the unavailable-quote event is not spammed
    engine.evaluateOpenTrades(stale, new Date(M.getTime() + 120_000));
    assert.equal(engine.getEvents(t.id).filter((e) => e.event === "PAPER_QUOTE_UNAVAILABLE").length, 1);
    // trusted data returns: monitoring recovers and the stop is honoured
    engine.evaluateOpenTrades(withCallPrice(snap, 5), new Date(M.getTime() + 180_000));
    assert.equal(t.status, "STOPPED_OUT");
  });

  it("zero/missing leg quote: position is not revalued and not closed", () => {
    const { snap, analysis, engine } = freshSetup();
    const t = open(engine, analysis);
    const before = t.currentPrice;
    engine.evaluateOpenTrades(withCallPrice(snap, 0), new Date(M.getTime() + 60_000));
    assert.equal(t.status, "OPEN");
    assert.equal(t.currentPrice, before);
    const missing = structuredClone(snap);
    missing.chain = missing.chain.filter((r) => r.strike !== t.legs[0].strike); // instrument data missing
    engine.evaluateOpenTrades(missing, new Date(M.getTime() + 120_000));
    assert.equal(t.status, "OPEN");
    assert.equal(t.monitoring?.status, "STALE_QUOTES");
  });

  it("expiry transitions to SETTLEMENT_PENDING without fabricated LTP fallback when quotes are missing/untrusted", () => {
    const { snap, analysis, engine } = freshSetup();
    const t = open(engine, analysis);
    const untrusted = structuredClone(snap);
    untrusted.sources.market = { ...untrusted.sources.market, source: "STALE" };
    engine.evaluateOpenTrades(untrusted, new Date(`${t.expiry}T16:00:00+05:30`));
    assert.equal(t.status, "SETTLEMENT_PENDING");
    assert.equal(t.exitPrice, null);
    assert.equal(t.legs[0].exitPrice, null);
    assert.equal(t.legs[0].exitFillSource, null);
    const ev = engine.getEvents(t.id).find((e) => e.event === "PAPER_TRADE_SETTLEMENT_PENDING")!;
    assert.ok(ev, "PAPER_TRADE_SETTLEMENT_PENDING event must be emitted");
  });

  it("expiry: a trade is not expired before 15:30 IST on expiry day", () => {
    const { snap, analysis, engine } = freshSetup();
    const t = open(engine, analysis);
    engine.evaluateOpenTrades(snap, new Date(`${t.expiry}T15:00:00+05:30`));
    assert.equal(t.status, "OPEN");
    engine.evaluateOpenTrades(snap, new Date(`${t.expiry}T15:30:00+05:30`));
    assert.equal(t.status, "SETTLEMENT_PENDING");
  });

  it("ledger expiry preserves a full ISO instant instead of appending an invalid IST suffix", () => {
    assert.equal(ledgerExpiryInstant("2026-10-15T15:30:00.000Z").toISOString(), "2026-10-15T15:30:00.000Z");
    const { snap, analysis, engine } = freshSetup();
    const t = open(engine, analysis);
    t.expiry = "2026-10-15T15:30:00.000Z";
    engine.evaluateOpenTrades(snap, new Date("2026-10-15T15:29:59.999Z"));
    assert.equal(t.status, "OPEN");
    engine.evaluateOpenTrades(snap, new Date("2026-10-15T15:30:00.000Z"));
    assert.equal(t.status, "SETTLEMENT_PENDING");
  });
});

describe("SIMULATION: duplicates, risk limits, IST day", () => {
  it("the same signal 6 minutes later cannot open a second identical position", () => {
    const { analysis, engine } = freshSetup();
    open(engine, analysis);
    const again = engine.processRecommendation(analysis, new Date(M.getTime() + 6 * 60_000));
    assert.equal(again.created, false);
    assert.match(again.reason, /^DUPLICATE_TRADE_PREVENTED/);
    // and an hour later, still the same single open position
    assert.equal(engine.processRecommendation(analysis, new Date(M.getTime() + 3600_000)).created, false);
    assert.equal(engine.getTrades().length, 1);
    assert.equal(engine.getEvents().filter((e) => e.event === "PAPER_TRADE_OPENED").length, 1);
  });

  it("realized daily loss limit blocks new entries after a net-loss close", () => {
    const { snap, analysis, engine } = freshSetup(undefined, { maxDailyLossPercent: 0.5 }); // ₹2,500
    open(engine, analysis);
    engine.evaluateOpenTrades(withCallPrice(snap, 28), new Date(M.getTime() + 60_000));
    const next = engine.processRecommendation(analysis, M);
    assert.equal(next.created, false);
    assert.match(next.reason, /^RISK_REJECTED/);
    assert.match(next.reason, /daily loss/i);
  });

  it("existing concurrent-position limit is unchanged", () => {
    const { analysis, engine } = freshSetup(undefined, { maxConcurrentPositions: 1 });
    open(engine, analysis);
    const bank = mockSnapshot("banknifty", M);
    const a2 = analyze(bank, M, { accountCapital: CAP, maxConcurrentPositions: 1 });
    a2.status = "TRADE"; a2.plan = { ...analysis.plan! };
    const r = engine.processRecommendation(a2, M);
    assert.equal(r.created, false);
    assert.match(r.reason, /RISK_REJECTED/);
  });

  it("day boundaries are IST, independent of the server time zone", () => {
    assert.equal(istDay("2026-10-05T18:29:59Z"), "2026-10-05");
    assert.equal(istDay("2026-10-05T18:30:00Z"), "2026-10-06");
  });
});

describe("SIMULATION: persistence and restart recovery", () => {
  const dir = path.join(ROOT, "ledger");
  beforeEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
  after(() => fs.rmSync(ROOT, { recursive: true, force: true }));
  const persisting = (d = dir) => ({ onChange: (t: PaperTrade[], e: PaperTradeEvent[]) => savePaperLedger(t, e, d) });

  it("restart resumes an open position with identical P&L and cannot re-open it", () => {
    const { snap, analysis, engine } = freshSetup(persisting());
    const t = open(engine, analysis);
    engine.evaluateOpenTrades(withCallPrice(snap, 70), new Date(M.getTime() + 60_000));
    const before = JSON.stringify(engine.getPortfolioSummary());

    // process restart: brand-new engine, state only from disk
    const led = loadPaperLedger(dir);
    assert.equal(led.error, null);
    const restarted = new PaperTradingEngine({ accountCapital: CAP }, persisting());
    restarted.setTrades(led.trades, led.events);
    assert.equal(JSON.stringify(restarted.getPortfolioSummary()), before, "P&L unchanged by restart");
    assert.equal(restarted.getTrade(t.id)!.status, "OPEN");
    // the repeated signal after restart is a duplicate, not a new trade
    const again = restarted.processRecommendation(analysis, new Date(M.getTime() + 120_000));
    assert.equal(again.created, false);
    assert.match(again.reason, /^DUPLICATE_TRADE_PREVENTED/);
    assert.equal(restarted.getTrades().length, 1);
  });

  it("a closed trade survives restart with unchanged P&L, events and a clean reconciliation", () => {
    const { snap, analysis, engine } = freshSetup(persisting());
    const t = open(engine, analysis);
    engine.evaluateOpenTrades(withCallPrice(snap, 100), new Date(M.getTime() + 60_000));
    const pnl = t.realizedPnL;
    const nEvents = engine.getEvents().length;
    const led = loadPaperLedger(dir);
    assert.equal(led.trades[0].realizedPnL, pnl);
    assert.equal(led.events.length, nEvents);
    assert.equal(led.corruptEventLines, 0);
    assert.deepEqual(reconcileLedger(led.trades, led.events).issues, []);
    // re-processing the persisted ledger does not append duplicates
    const restarted = new PaperTradingEngine({ accountCapital: CAP }, persisting());
    restarted.setTrades(led.trades, led.events);
    restarted.evaluateOpenTrades(withCallPrice(snap, 5), new Date(M.getTime() + 120_000));
    assert.equal(loadPaperLedger(dir).events.length, nEvents, "no new events: nothing was open");
  });

  it("events are still recorded if the ledger directory is replaced while the process runs (no stale counter)", () => {
    const { analysis, engine } = freshSetup(persisting());
    open(engine, analysis);
    assert.equal(loadPaperLedger(dir).events.length, 1);
    fs.rmSync(dir, { recursive: true, force: true }); // restored/replaced externally
    const { snap } = freshSetup();
    engine.evaluateOpenTrades(withCallPrice(snap, 100), new Date(M.getTime() + 60_000)); // closes: 1 new event + snapshot
    const led = loadPaperLedger(dir);
    assert.ok(led.events.some((e) => e.event === "PAPER_TRADE_EXITED"), "the exit event reached disk");
    assert.equal(led.trades.length, 1);
  });

  it("the audit event log is append-only: earlier lines are never rewritten", () => {
    const { snap, analysis, engine } = freshSetup(persisting());
    open(engine, analysis);
    const first = fs.readFileSync(path.join(dir, "events.jsonl"), "utf8");
    engine.evaluateOpenTrades(withCallPrice(snap, 100), new Date(M.getTime() + 60_000));
    const second = fs.readFileSync(path.join(dir, "events.jsonl"), "utf8");
    assert.ok(second.startsWith(first), "previous lines unchanged");
    assert.ok(second.length > first.length);
  });

  it("an unreadable ledger is never replaced by an empty one: engine is blocked and the file is untouched", () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "trades.json"), "{ not json");
    const led = loadPaperLedger(dir);
    assert.ok(led.error);
    const engine = new PaperTradingEngine({ accountCapital: CAP }, { ...persisting(), blocked: led.error });
    const { analysis } = freshSetup();
    const r = engine.processRecommendation(analysis, M);
    assert.equal(r.created, false);
    assert.match(r.reason, /^LEDGER_UNAVAILABLE/);
    assert.equal(fs.readFileSync(path.join(dir, "trades.json"), "utf8"), "{ not json");
  });

  it("a corrupt event log blocks the ledger and remains untouched", () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "events.jsonl"), '{ broken event\n');
    const led = loadPaperLedger(dir);
    assert.ok(led.error);
    assert.equal(led.corruptEventLines, 1);
    assert.equal(fs.readFileSync(path.join(dir, "events.jsonl"), "utf8"), '{ broken event\n');
  });

  it("a persisted event sequence that does not match its trade snapshot blocks the ledger", () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "trades.json"), JSON.stringify([{ id: "known", status: "OPEN" }]));
    fs.writeFileSync(path.join(dir, "events.jsonl"), JSON.stringify({ tradeId: "different", event: "PAPER_TRADE_OPENED" }) + "\n");
    const led = loadPaperLedger(dir);
    assert.ok(led.error);
    assert.match(led.error!, /absent from trades\.json/);
  });

  it("a corrupt snapshot is recovered from the last good backup", () => {
    const { analysis, snap, engine } = freshSetup(persisting());
    open(engine, analysis);
    engine.evaluateOpenTrades(withCallPrice(snap, 70), new Date(M.getTime() + 60_000)); // second save creates .bak
    fs.writeFileSync(path.join(dir, "trades.json"), "garbage");
    const led = loadPaperLedger(dir);
    assert.equal(led.error, null);
    assert.equal(led.recoveredFromBackup, true);
    assert.equal(led.trades.length, 1);
  });

  it("if the ledger cannot be written, the trade is rolled back (memory never disagrees with disk)", () => {
    const { analysis, engine } = freshSetup({ onChange: () => { throw new Error("disk full"); } });
    const r = engine.processRecommendation(analysis, M);
    assert.equal(r.created, false);
    assert.match(r.reason, /^LEDGER_WRITE_FAILED: disk full/);
    assert.equal(engine.getTrades().length, 0);
    assert.equal(engine.getEvents().length, 0);
  });
});

function ledgerTrade(id: string, strategy: string, index: string, net: number, exit: string, extra: Partial<PaperTrade> = {}): PaperTrade {
  return {
    id, status: net >= 0 ? "TARGET_HIT" : "STOPPED_OUT", index, strategy, exitTimestamp: exit, realizedPnL: net,
    riskAmount: 1000, entryPrice: 50, quantity: 10, ...extra,
  } as unknown as PaperTrade;
}

describe("SIMULATION: ledger report and reconciliation (hand-built ledger)", () => {
  const trades = [
    ledgerTrade("a", "Long Call", "nifty", 300, "2026-10-05T04:00:00Z"),
    ledgerTrade("b", "Long Call", "nifty", -100, "2026-10-05T05:00:00Z"),
    ledgerTrade("c", "Long Put", "banknifty", -200, "2026-10-05T06:00:00Z"),
    ledgerTrade("d", "Long Put", "banknifty", 50, "2026-10-05T07:00:00Z"),
  ];

  it("win rate, profit factor, expectancy, drawdown and groups match hand calculation", () => {
    const r = buildPaperLedgerReport(trades);
    assert.equal(r.label, REPORT_LABEL);
    assert.equal(r.netPnL, 50);
    assert.equal(r.winRate, 50);
    assert.equal(r.profitFactor, 1.17); // 350 / 300
    assert.equal(r.expectancy, 12.5);
    assert.equal(r.averageWin, 175);
    assert.equal(r.averageLoss, -150);
    assert.equal(r.maxDrawdown, 300); // cum 300 → 200 → 0 → 50: peak 300, trough 0
    assert.deepEqual(r.byStrategy.map((g) => [g.key, g.trades, g.netPnL]), [["Long Call", 2, 200], ["Long Put", 2, -150]]);
    assert.equal(r.sampleSize, "INSUFFICIENT_SAMPLE", "4 trades is never presented as a conclusion");
  });

  it("profit factor is null (not Infinity) when there are no losses", () => {
    const r = buildPaperLedgerReport([ledgerTrade("a", "x", "nifty", 10, "2026-10-05T04:00:00Z")]);
    assert.equal(r.profitFactor, null);
    assert.equal(buildPaperLedgerReport([]).winRate, null);
    assert.equal(buildPaperLedgerReport([]).maxDrawdown, null);
  });

  it("engine summary, API report and ledger totals agree", () => {
    const { snap, analysis, engine } = freshSetup();
    open(engine, analysis);
    engine.evaluateOpenTrades(withCallPrice(snap, 100), new Date(M.getTime() + 60_000));
    const s = engine.getPortfolioSummary();
    const rep = buildPaperLedgerReport(engine.getTrades());
    const sum = engine.getTrades().reduce((a, t) => a + (t.realizedPnL ?? 0), 0);
    assert.equal(s.realizedPnL, rep.netPnL);
    assert.equal(rep.netPnL, Math.round(sum * 100) / 100);
    assert.equal(s.grossPnL, rep.grossPnL);
    assert.equal(s.totalCosts, rep.totalCosts);
    assert.equal(Math.round((s.grossPnL - s.totalCosts) * 100) / 100, s.realizedPnL);
    assert.equal(reconcileLedger(engine.getTrades(), engine.getEvents()).ok, true);
  });

  it("reconciliation detects tampered P&L, tampered costs, duplicate exit events and duplicate open positions", () => {
    const { snap, analysis, engine } = freshSetup();
    const t = open(engine, analysis);
    engine.evaluateOpenTrades(withCallPrice(snap, 100), new Date(M.getTime() + 60_000));
    const codes = (tr: PaperTrade[], ev: PaperTradeEvent[]) => reconcileLedger(tr, ev).issues.map((i) => i.code);

    const bad1 = structuredClone(t); bad1.grossPnL = 1;
    assert.ok(codes([bad1], engine.getEvents()).includes("PNL_MISMATCH"));
    const bad2 = structuredClone(t); bad2.transactionCosts = { ...bad2.transactionCosts!, totalCosts: 1 };
    assert.ok(codes([bad2], engine.getEvents()).includes("COSTS_MISMATCH"));
    const exitEv = engine.getEvents().find((e) => e.event === "PAPER_TRADE_EXITED")!;
    assert.ok(codes([t], [...engine.getEvents(), exitEv]).includes("DUPLICATE_EXIT_EVENT"));
    const o1 = { ...structuredClone(t), id: "o1", status: "OPEN" as const, exitTimestamp: null, exitPrice: null, realizedPnL: null };
    const o2 = { ...o1, id: "o2" };
    assert.ok(codes([o1, o2], []).includes("DUPLICATE_OPEN_POSITION"));
  });

  it("closeTrade without a quote snapshot is labelled an unverified fallback exit", () => {
    const { analysis, engine } = freshSetup();
    const t = open(engine, analysis);
    engine.closeTrade(t, "CLOSED", undefined, new Date(M.getTime() + 60_000));
    const ev = engine.getEvents(t.id).find((e) => e.event === "PAPER_TRADE_EXITED")!;
    assert.equal(ev.details?.exitQuoteVerified, false);
    assert.equal(t.exitReason, "MANUAL_CLOSE");
  });

  it("costs reconcile with the shared cost model for a multi-order position", () => {
    const c = costsFor([{ side: "BUY", price: 100, quantity: 50 }, { side: "SELL", price: 120, quantity: 50 }], DEFAULT_TRANSACTION_COSTS);
    assert.equal(c.brokerage, 60); // 2 orders * ₹30 under Plus research fallback
    assert.equal(c.stt, 9); // 0.15% of 6000 sell premium
  });
});

describe("SIMULATION: opportunity-paper (live runner path) safeguards", () => {
  const dir = path.join(ROOT, "opps");
  beforeEach(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
    for (const k of ["PAPER_OPPORTUNITY_DIR", "SESSION_EVIDENCE_DIR", "COLLECTION_LOG_DIR", "MONITOR_LOG_DIR"]) {
      process.env[k] = path.join(dir, k);
    }
  });
  after(() => {
    for (const k of ["PAPER_OPPORTUNITY_DIR", "SESSION_EVIDENCE_DIR", "COLLECTION_LOG_DIR", "MONITOR_LOG_DIR"]) delete process.env[k];
    fs.rmSync(ROOT, { recursive: true, force: true });
  });

  const optOpp = (expiry: string) => {
    const o = createPaperOpportunity({
      instrumentType: "OPTION", underlying: "NIFTY", instrumentKey: "NSE_FO|X", optionType: "CE", strike: 25000, expiry,
      strategyType: "T", direction: "BULLISH", entry: 100, stop: 80, target1: 130, target2: 160, score: 80, confidence: 70,
      grade: "A", reasons: [], regime: "LIVE", strategyVersion: "t", source: "LIVE",
    } as Parameters<typeof createPaperOpportunity>[0]);
    savePaperOpportunity(o);
    return o;
  };

  it("date-only expiry means 15:30 IST that day: not expired at 09:30 IST, expired at 15:30 IST", () => {
    assert.equal(expiryInstant("2026-11-03").toISOString(), "2026-11-03T10:00:00.000Z");
    assert.equal(expiryInstant("2026-10-15T15:30:00.000Z").toISOString(), "2026-10-15T15:30:00.000Z", "full ISO unchanged");
    const o = optOpp("2026-11-03");
    const early = evaluatePaperOpportunity(o, { currentPrice: 101, timestamp: "2026-11-03T04:00:00.000Z" }); // 09:30 IST
    assert.equal(early.toStatus, null, "was wrongly EXPIRED at 09:30 IST before the fix");
    const close = evaluatePaperOpportunity(o, { currentPrice: 101, timestamp: "2026-11-03T10:00:00.000Z" }); // 15:30 IST
    assert.equal(close.toStatus, "EXPIRED");
  });

  it("option premium is LIVE only when BOTH market and option chain are LIVE in the snapshot", () => {
    const snap = mockSnapshot("nifty", M);
    const key = snap.chain[0].call.instrumentKey!;
    const live = structuredClone(snap);
    live.sources.market = { ...live.sources.market, source: "LIVE" };
    live.sources.optionChain = { ...live.sources.optionChain, source: "LIVE" };
    assert.equal(optionMonitorInput(live, key)?.source, "LIVE");
    const staleChain = structuredClone(live);
    staleChain.sources.optionChain = { ...staleChain.sources.optionChain, source: "STALE" };
    assert.equal(optionMonitorInput(staleChain, key), null, "STALE chain must not price a position");
    assert.equal(optionMonitorInput(snap, key), null, "MOCK is never LIVE");
    const zero = structuredClone(live); zero.chain[0].call.ltp = 0;
    assert.equal(optionMonitorInput(zero, key), null);
    assert.equal(optionMonitorInput(live, "NOT|THERE"), null);
  });

  it("records are written atomically (no temp files left) and unreadable records are surfaced, not hidden", () => {
    optOpp("2026-11-03");
    const d = process.env.PAPER_OPPORTUNITY_DIR!;
    assert.deepEqual(fs.readdirSync(d).filter((f) => f.includes(".tmp-")), []);
    assert.deepEqual(listUnreadablePaperOpportunityFiles(), []);
    fs.writeFileSync(path.join(d, "popp_broken.json"), '{"id":"broken", ');
    assert.deepEqual(listUnreadablePaperOpportunityFiles(), ["popp_broken.json"]);
    assert.equal(listPaperOpportunities().length, 1, "listing skips it ...");
    assert.equal(fs.readFileSync(path.join(d, "popp_broken.json"), "utf8"), '{"id":"broken", ', "... but never modifies it");
  });

  it("repeated collection of the same signal creates exactly one paper trade", async () => {
    const stock = { symbol: "ABC", instrumentKey: "NSE_EQ|ABC", setup: "BREAKOUT", freshness: "LIVE", direction: "BULLISH", entry: 100, stop: 95, target1: 110, target2: 120, ltp: 100, volume: 1, opportunityScore: 70, grade: "A", reasons: [] };
    const stocks = async () => ({ source: "UPSTOX", freshness: "LIVE", topOpportunities: [stock] }) as never;
    const none = async () => ({ spot: 1, topOpportunities: [], rejectedContracts: [], dataQuality: { market: "LIVE" } }) as never;
    const at = new Date("2026-10-06T05:00:00.000Z"); // 10:30 IST, before the 14:30 entry cutoff
    const first = await runLiveOpportunityCollection(none, none, stocks, at);
    const second = await runLiveOpportunityCollection(none, none, stocks, new Date(at.getTime() + 30_000));
    assert.equal(first.created, 1);
    assert.equal(second.created, 0);
    assert.equal(second.duplicates, 1);
    assert.equal(listPaperOpportunities().length, 1);
  });
});

describe("SIMULATION: no broker order can be sent from the paper paths", () => {
  const files = [
    "src/lib/paperEngine.ts", "src/lib/paperMath.ts", "src/lib/paperReport.ts", "src/lib/paperTypes.ts",
    "src/lib/services/paperStore.ts", "src/lib/services/paperLedgerStore.ts", "src/lib/services/paperPriceInput.ts",
    "src/lib/services/paperOpportunityMonitor.ts", "src/lib/services/paperOpportunityStore.ts",
    "src/app/api/paper-trading/enter/route.ts", "src/app/api/paper-trading/close/route.ts",
    "src/app/api/paper-trading/update/route.ts", "src/app/api/paper-trading/portfolio/route.ts",
    "src/app/api/paper-opportunities/monitor/route.ts",
  ];
  // Patterns assembled at runtime so this file does not itself trip the repo-wide source scans.
  const forbidden = ["place" + "Order", "modify" + "Order", "cancel" + "Order", "/v2/" + "order", "/v3/" + "order", "order/" + "place"];

  const resolveFile = (relPath: string) => {
    const direct = path.join(process.cwd(), relPath);
    if (fs.existsSync(direct)) return direct;
    return path.join(process.cwd(), "web", relPath);
  };

  it("none of the paper engine, store, report or route sources reference an order endpoint", () => {
    for (const f of files) {
      const src = fs.readFileSync(resolveFile(f), "utf8");
      for (const p of forbidden) assert.ok(!src.includes(p), `${f} references ${p}`);
    }
  });

  it("the engine, math, report and ledger store make no network calls", () => {
    for (const f of ["src/lib/paperEngine.ts", "src/lib/paperMath.ts", "src/lib/paperReport.ts", "src/lib/services/paperLedgerStore.ts", "src/lib/services/paperPriceInput.ts"]) {
      const src = fs.readFileSync(resolveFile(f), "utf8");
      assert.ok(!/\bfetch\s*\(|node:https?|XMLHttpRequest|WebSocket/.test(src), `${f} must not perform network I/O`);
    }
  });

  it("every trade the engine creates is executionMode PAPER", () => {
    const { analysis, engine } = freshSetup();
    assert.equal(open(engine, analysis).executionMode, "PAPER");
  });
});
