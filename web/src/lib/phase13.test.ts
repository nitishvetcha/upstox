// Phase 13 — long-term data + recommendation diagnostics.
// RECOMMEND-* runs the real frozen engine (analyze) on a deterministic snapshot, then diagnose().
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyze, MIN_STRATEGY_SCORE } from "./engine/strategy.ts";
import { mockSnapshot } from "./services/mock.ts";
import type { Analysis, Snapshot } from "./types.ts";
import { classifyEngineBlocker, diagnose, isRecommendationEligible, type RecommendationDiagnostic } from "./recommendationDiagnostic.ts";
import { chartPoints, HISTORY_INTERVALS, HISTORY_RANGES, loadHistory, planHistoryChunks, PROVIDER_PLAN, rangeStart, type HistoryChunk } from "./marketHistory.ts";
import { normalizeStockQuote, searchInstruments, type StockInstrument } from "./services/stockService.ts";
import { STRATEGY_VERSION } from "./journalTypes.ts";

const MIDDAY = new Date("2026-10-05T07:00:00Z"); // Mon 12:30 IST
const NIGHT = new Date("2026-10-05T15:00:00Z"); // Mon 20:30 IST (closed)
const RISK = { accountCapital: 500_000 };

// The mock snapshot relabelled as LIVE Upstox data, with real-looking canonical keys.
function live(index: "nifty" | "banknifty" = "nifty", mut?: (s: Snapshot) => void): Snapshot {
  const s = structuredClone(mockSnapshot(index, MIDDAY));
  for (const k of Object.keys(s.sources) as (keyof Snapshot["sources"])[]) s.sources[k] = { ...s.sources[k], source: "LIVE", provider: "UPSTOX" };
  s.fallbackReason = null;
  for (const r of s.chain) {
    r.call.instrumentKey = `NSE_FO|T${r.strike}CE`;
    r.put.instrumentKey = `NSE_FO|T${r.strike}PE`;
  }
  mut?.(s);
  return s;
}
const run = (s: Snapshot, now = MIDDAY, inputs?: Parameters<typeof analyze>[3], cfg: Parameters<typeof analyze>[2] = RISK): RecommendationDiagnostic =>
  diagnose(analyze(s, now, cfg, inputs), now);
const codes = (d: RecommendationDiagnostic) => d.blockers.map((b) => b.code);

// ── RECOMMEND: §37 critical matrix + eligibility ──────────────────────────────

describe("RECOMMEND — eligibility matrix (frozen engine)", () => {
  it("RECOMMEND-01. Market open + all live data valid + valid strategy → TRADE, eligible", () => {
    const d = run(live());
    assert.equal(d.finalDecision, "TRADE");
    assert.equal(d.eligible, true);
    assert.deepEqual(d.blockers, []);
  });

  it("RECOMMEND-02. Market open + event risk → WAIT with EVENT_RISK", () => {
    const d = run(live("nifty", (s) => { s.news.eventRisk = "RBI monetary policy"; }));
    assert.equal(d.finalDecision, "WAIT");
    assert.ok(codes(d).includes("EVENT_RISK"));
    assert.equal(d.eventRisk.blocking, true);
  });

  it("RECOMMEND-03. Market closed → NO_TRADE with MARKET_CLOSED", () => {
    const d = run(live(), NIGHT);
    assert.equal(d.finalDecision, "NO_TRADE");
    assert.ok(codes(d).includes("MARKET_CLOSED"));
  });

  it("RECOMMEND-04. Stale spot → not TRADE, STALE_MARKET_DATA", () => {
    const d = run(live(), new Date(MIDDAY.getTime() + 30 * 60_000));
    assert.notEqual(d.finalDecision, "TRADE");
    assert.ok(codes(d).includes("STALE_MARKET_DATA"));
  });

  it("RECOMMEND-05. Option chain unavailable → not TRADE, INSUFFICIENT_OPTION_CHAIN", () => {
    const d = run(live("nifty", (s) => { s.sources.optionChain = { ...s.sources.optionChain, source: "UNAVAILABLE" }; }));
    assert.notEqual(d.finalDecision, "TRADE");
    assert.ok(codes(d).includes("INSUFFICIENT_OPTION_CHAIN"));
  });

  it("RECOMMEND-06. Missing instrument key → WAIT with OPTION_INSTRUMENT_ID_UNAVAILABLE", () => {
    const d = run(live("nifty", (s) => { for (const r of s.chain) { r.call.instrumentKey = null; r.put.instrumentKey = null; } }));
    assert.equal(d.finalDecision, "WAIT");
    assert.ok(codes(d).includes("OPTION_INSTRUMENT_ID_UNAVAILABLE"));
  });

  it("RECOMMEND-07. R:R below minimum → not TRADE, RISK_REWARD_TOO_LOW", () => {
    const d = run(live(), MIDDAY, undefined, { ...RISK, minRiskReward: 50 });
    assert.notEqual(d.finalDecision, "TRADE");
    assert.ok(codes(d).includes("RISK_REWARD_TOO_LOW"));
  });

  it("RECOMMEND-08. Position size zero → not TRADE, POSITION_SIZE_ZERO", () => {
    const d = run(live(), MIDDAY, undefined, { accountCapital: 1_000 });
    assert.notEqual(d.finalDecision, "TRADE");
    assert.ok(codes(d).some((c) => c === "POSITION_SIZE_ZERO" || c === "RISK_LIMIT_BLOCKED"), codes(d).join());
  });

  it("RECOMMEND-09. Daily loss exceeded → NO_TRADE, DAILY_LOSS_LIMIT", () => {
    const d = run(live(), MIDDAY, { realizedDailyLoss: 1_000_000 });
    assert.equal(d.finalDecision, "NO_TRADE");
    assert.ok(codes(d).includes("DAILY_LOSS_LIMIT"));
  });

  it("RECOMMEND-10. Open risk exceeded → not TRADE, OPEN_RISK_LIMIT", () => {
    const d = run(live(), MIDDAY, { existingOpenRisk: 1_000_000 });
    assert.notEqual(d.finalDecision, "TRADE");
    assert.ok(codes(d).includes("OPEN_RISK_LIMIT"));
  });

  it("RECOMMEND-11. Max concurrent positions → not TRADE, MAX_CONCURRENT_POSITIONS", () => {
    const d = run(live(), MIDDAY, { currentOpenPositions: 99 });
    assert.notEqual(d.finalDecision, "TRADE");
    assert.ok(codes(d).includes("MAX_CONCURRENT_POSITIONS"));
  });

  it("RECOMMEND-12. No valid strategy candidate → not TRADE, NO_VALID_STRATEGY", () => {
    const a = analyze(live(), MIDDAY, RISK);
    const none: Analysis = { ...a, candidates: [], plan: null, status: "WAIT", blockers: ["Signals conflict: no strategy qualifies"] };
    const d = diagnose(none, MIDDAY);
    assert.notEqual(d.finalDecision, "TRADE");
    assert.ok(codes(d).includes("NO_VALID_STRATEGY"));
    assert.ok(d.candidateSummary.startsWith("No valid strategy candidate"));
  });

  it("RECOMMEND-13. Historical options unavailable + live data valid → NOT a live blocker", () => {
    const d = run(live());
    assert.ok(d.warnings.some((w) => w.code === "HISTORICAL_OPTIONS_UNAVAILABLE"));
    assert.ok(!d.blockers.some((b) => b.source === "historical-data"));
    assert.equal(d.historicalDataBlocksLive, false);
    assert.equal(d.eligible, true);
  });

  it("RECOMMEND-14. Historical options unavailable + market closed → NO_TRADE because of MARKET_CLOSED only", () => {
    const d = run(live(), NIGHT);
    assert.equal(d.finalDecision, "NO_TRADE");
    assert.ok(!codes(d).some((c) => c.includes("HISTORICAL")));
  });

  it("RECOMMEND-15. Event risk + valid candidate → WAIT and candidate shown as blocked, not executable", () => {
    const d = run(live("nifty", (s) => { s.news.eventRisk = "RBI monetary policy"; }));
    assert.equal(d.finalDecision, "WAIT");
    assert.ok(d.candidates.every((c) => !c.executable));
  });

  it("RECOMMEND-16. Event risk cleared + valid candidate + risk passes → TRADE", () => {
    const d = run(live("nifty", (s) => { s.news.eventRisk = null; }));
    assert.equal(d.finalDecision, "TRADE");
    assert.ok(d.candidates.some((c) => c.executable));
  });

  it("RECOMMEND-17. Mock data (Upstox not connected) → NO_TRADE with UPSTOX_NOT_CONNECTED", () => {
    const d = run(mockSnapshot("nifty", MIDDAY));
    assert.equal(d.finalDecision, "NO_TRADE");
    assert.ok(codes(d).includes("UPSTOX_NOT_CONNECTED"));
  });

  it("RECOMMEND-18. Multiple blockers are all returned, none hidden", () => {
    const d = run(live("nifty", (s) => { s.news.eventRisk = "RBI policy"; }), MIDDAY, { realizedDailyLoss: 1_000_000 });
    assert.ok(d.blockers.length >= 1);
    const d2 = run(mockSnapshot("nifty", MIDDAY), NIGHT);
    assert.ok(codes(d2).includes("UPSTOX_NOT_CONNECTED") && codes(d2).includes("MARKET_CLOSED"));
  });

  it("RECOMMEND-19. finalDecision is never less strict than the engine", () => {
    const rank = { TRADE: 2, WAIT: 1, NO_TRADE: 0 };
    for (const d of [run(live()), run(live(), NIGHT), run(mockSnapshot("nifty", MIDDAY)), run(live("banknifty"))])
      assert.ok(rank[d.finalDecision] <= rank[d.engineDecision]);
  });

  it("RECOMMEND-20. isRecommendationEligible requires TRADE and zero blockers", () => {
    assert.equal(isRecommendationEligible({ finalDecision: "TRADE", blockers: [] }), true);
    assert.equal(isRecommendationEligible({ finalDecision: "WAIT", blockers: [] }), false);
    assert.equal(isRecommendationEligible({ finalDecision: "TRADE", blockers: [{ code: "EVENT_RISK", title: "", severity: "BLOCKING", message: "", source: "", resolved: false }] }), false);
  });

  it("RECOMMEND-21. Score below threshold is surfaced even alongside another rejection", () => {
    const a = analyze(live("banknifty"), MIDDAY, RISK);
    const low = a.candidates.filter((c) => c.score < MIN_STRATEGY_SCORE);
    const d = diagnose(a, MIDDAY);
    if (low.length && d.finalDecision !== "TRADE") assert.ok(codes(d).includes("INSUFFICIENT_SCORE"));
  });

  it("RECOMMEND-22. Event risk as sole blocker states the candidate/event-gate message", () => {
    const d = run(live("nifty", (s) => { s.news.eventRisk = "RBI monetary policy"; }));
    if (d.candidates.length && codes(d).every((c) => c === "EVENT_RISK" || c === "HIGH_EVENT_RISK"))
      assert.equal(d.candidateSummary, "The strategy generated a candidate, but the event-risk safety gate prevented execution.");
  });
});

// ── DEBUG: diagnostic contract ────────────────────────────────────────────────

describe("DEBUG — diagnostic contract", () => {
  const d = run(live());
  it("DEBUG-01. 15 pipeline stages in order", () => {
    assert.deepEqual(d.checks.map((c) => c.stage), Array.from({ length: 15 }, (_, i) => i + 1));
  });
  it("DEBUG-02. every check status is PASS|WARN|BLOCKED|NOT_EVALUATED", () => {
    for (const c of d.checks) assert.ok(["PASS", "WARN", "BLOCKED", "NOT_EVALUATED"].includes(c.status));
  });
  it("DEBUG-03. required top-level fields present", () => {
    for (const k of ["underlying", "evaluatedAt", "marketStatus", "freshness", "finalDecision", "blockers", "warnings", "checks", "candidates", "eventRisk"])
      assert.ok(k in d, k);
  });
  it("DEBUG-04. strategyVersion is 11.4-frozen", () => assert.equal(d.strategyVersion, "11.4-frozen"));
  it("DEBUG-05. blockers carry code/title/severity/message/source/resolved", () => {
    const b = run(live(), NIGHT).blockers[0];
    assert.deepEqual(Object.keys(b).sort(), ["code", "message", "resolved", "severity", "source", "title"]);
    assert.equal(b.severity, "BLOCKING");
  });
  it("DEBUG-06. candidate preview includes entry/stop/targets/rr/legs with instrument keys", () => {
    const c = d.candidates[0];
    assert.ok(c.entry > 0 && c.stop > 0 && c.target1 > 0 && c.rr > 0);
    assert.ok(c.legs.every((l) => l.instrumentKey?.startsWith("NSE_FO|")));
  });
  it("DEBUG-07. underlying label is NIFTY / BANKNIFTY", () => {
    assert.equal(d.underlying, "NIFTY");
    assert.equal(run(live("banknifty")).underlying, "BANKNIFTY");
  });
  it("DEBUG-08. freshness overall MOCK when on mock data", () => assert.equal(run(mockSnapshot("nifty", MIDDAY)).freshness.overall, "MOCK"));
  it("DEBUG-09. diagnose is deterministic apart from the timestamp", () => {
    const a = analyze(live(), MIDDAY, RISK);
    const x = diagnose(a, MIDDAY), y = diagnose(a, MIDDAY);
    assert.deepEqual({ ...x, evaluatedAt: 0 }, { ...y, evaluatedAt: 0 });
  });
  it("DEBUG-10. a blocked final check exists whenever decision is not TRADE", () => {
    const n = run(live(), NIGHT);
    assert.equal(n.checks.find((c) => c.stage === 15)!.status, "BLOCKED");
  });
});

describe("DEBUG — engine blocker classification", () => {
  const cases: [string, string][] = [
    ["Market data is stale", "STALE_MARKET_DATA"],
    ["News is stale", "INSUFFICIENT_FRESHNESS"],
    ["Market closed: quotes are end-of-day (END_OF_DAY)", "END_OF_DAY"],
    ["Opening 15 minutes: waiting for market confirmation", "OPENING_WINDOW"],
    ["Event risk: RBI", "EVENT_RISK"],
    ["Best strategy score 60 is below the 65 threshold", "INSUFFICIENT_SCORE"],
    ["News direction conflicts with market and option-chain signals.", "SIGNAL_CONFLICT"],
    ["Long Call: 25000 CE not in option chain", "NO_VALID_OPTION"],
    ["Long Call: No two-sided quote on 25000 CE", "INSUFFICIENT_LIQUIDITY"],
    ["Long Call: Bid-ask spread too wide on 25000 CE (7.0%)", "WIDE_BID_ASK"],
    ["Long Call: Risk/reward 1:0.9 below minimum 1:1.2", "RISK_REWARD_TOO_LOW"],
    ["Long Call: Lot size is unknown or unavailable from contract metadata", "LOT_SIZE_UNAVAILABLE"],
    ["OPTION_INSTRUMENT_ID_UNAVAILABLE: canonical Upstox contract identity not returned", "OPTION_INSTRUMENT_ID_UNAVAILABLE"],
    ["Not enough comparable data to trade: News sentiment unavailable", "INSUFFICIENT_TECHNICAL_DATA"],
    ["Something new the engine says", "UNCLASSIFIED"],
  ];
  for (const [text, code] of cases) it(`classify: ${code}`, () => assert.equal(classifyEngineBlocker(text), code));
});

// ── HISTORY: chunking, ranges, cache, retry ──────────────────────────────────

const candlesFor = (c: HistoryChunk) => {
  const out: unknown[] = [];
  for (let d = c.from; d <= c.to; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10))
    out.push([`${d}T00:00:00+05:30`, 100, 110, 90, 105, 1000]);
  return { candles: out };
};

describe("HISTORY — long-term loader", () => {
  const NOW = new Date("2026-10-07T06:00:00Z");
  it("HISTORY-01. 15m chunks never exceed the 1-month provider limit", () => {
    for (const c of planHistoryChunks("2024-01-01", "2026-10-07", "15m"))
      assert.ok((Date.parse(c.to) - Date.parse(c.from)) / 86_400_000 < 31);
  });
  it("HISTORY-02. chunks cover the range contiguously with no gaps", () => {
    const ch = planHistoryChunks("2025-01-01", "2026-10-07", "30m");
    assert.equal(ch[0].from, "2025-01-01");
    assert.equal(ch.at(-1)!.to, "2026-10-07");
    for (let i = 1; i < ch.length; i++) assert.equal(Date.parse(ch[i].from) - Date.parse(ch[i - 1].to), 86_400_000);
  });
  it("HISTORY-03. 5Y daily is a single chunk; weekly MAX is a single chunk", () => {
    assert.equal(planHistoryChunks(rangeStart("5Y", "1d", "2026-10-07").start, "2026-10-07", "1d").length, 1);
    assert.equal(planHistoryChunks("2000-01-01", "2026-10-07", "1w").length, 1);
  });
  it("HISTORY-04. MAX uses the provider floor, not a hard-coded 1 year", () => {
    assert.equal(rangeStart("MAX", "1d", "2026-10-07").start, "2000-01-01");
    assert.equal(rangeStart("MAX", "15m", "2026-10-07").start, "2022-01-01");
  });
  it("HISTORY-05. intraday ranges older than the provider floor are clamped and flagged", () => {
    const r = rangeStart("5Y", "15m", "2026-10-07");
    assert.equal(r.start, "2022-01-01");
    assert.equal(r.clamped, true);
  });
  it("HISTORY-06. all ranges/intervals from the spec are supported", () => {
    assert.deepEqual([...HISTORY_RANGES], ["1M", "3M", "6M", "1Y", "2Y", "3Y", "5Y", "MAX"]);
    for (const i of ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1mo"]) assert.ok((HISTORY_INTERVALS as readonly string[]).includes(i));
  });
  it("HISTORY-07. loader merges chunks, sorts and de-duplicates", async () => {
    const r = await loadHistory("NSE_INDEX|Nifty 50", "15m", "3M", async (_k, _u, _n, c) => candlesFor(c), { cacheDir: null, now: NOW });
    const ts = r.candles.map((c) => c.timestamp);
    assert.deepEqual(ts, [...new Set(ts)].sort());
    assert.equal(r.coverage.status, "FULL");
    assert.ok(r.coverage.chunks >= 3);
  });
  it("HISTORY-08. failed chunks are retried, then reported (never hidden)", async () => {
    let calls = 0;
    const r = await loadHistory("X", "15m", "3M", async (_k, _u, _n, c) => {
      calls++;
      if (c.from.startsWith("2026-08")) throw new Error("boom");
      return candlesFor(c);
    }, { cacheDir: null, now: NOW, retries: 2, backoffMs: 1 });
    assert.equal(r.coverage.status, "PARTIAL");
    assert.ok(r.coverage.failedChunks.length >= 1);
    assert.ok(calls > r.coverage.chunks, "failed chunk was retried");
  });
  it("HISTORY-09. completed chunks are persisted and reused; today's chunk is refetched", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p13-hist-"));
    let calls = 0;
    const f = async (_k: string, _u: string, _n: number, c: HistoryChunk) => { calls++; return candlesFor(c); };
    const a = await loadHistory("Y", "15m", "3M", f, { cacheDir: dir, now: NOW });
    const first = calls;
    const b = await loadHistory("Y", "15m", "3M", f, { cacheDir: dir, now: NOW });
    assert.equal(b.coverage.cachedChunks, a.coverage.chunks - 1);
    assert.equal(calls - first, 1);
    fs.rmSync(dir, { recursive: true });
  });
  it("HISTORY-10. empty provider response → EMPTY coverage, no fabricated bars", async () => {
    const r = await loadHistory("Z", "1d", "1Y", async () => ({ candles: [] }), { cacheDir: null, now: NOW });
    assert.equal(r.candles.length, 0);
    assert.equal(r.coverage.status, "EMPTY");
  });
});

// ── DATA: equities/indices + chart series ─────────────────────────────────────

const LIST: StockInstrument[] = [
  { symbol: "RELIANCE", name: "RELIANCE INDUSTRIES LTD", exchange: "NSE", instrumentKey: "NSE_EQ|INE002A01018", kind: "EQUITY" },
  { symbol: "RELAXO", name: "RELAXO FOOT LTD.", exchange: "NSE", instrumentKey: "NSE_EQ|INE131B01039", kind: "EQUITY" },
  { symbol: "TCS", name: "TATA CONSULTANCY SERV LT", exchange: "NSE", instrumentKey: "NSE_EQ|INE467B01029", kind: "EQUITY" },
];
const series = (n: number) => Array.from({ length: n }, (_, i) => ({
  timestamp: new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString(),
  open: 100 + i, high: 102 + i, low: 98 + i, close: 101 + i + (i % 5 === 0 ? -3 : 0), volume: 1000 + i,
}));

describe("DATA — stocks, indices, chart series", () => {
  it("DATA-01. exact symbol ranks first", () => assert.equal(searchInstruments(LIST, "TCS")[0].symbol, "TCS"));
  it("DATA-02. prefix search finds all matches", () => assert.deepEqual(searchInstruments(LIST, "REL").map((r) => r.symbol).sort(), ["RELAXO", "RELIANCE"]));
  it("DATA-03. name search works", () => assert.equal(searchInstruments(LIST, "tata")[0].symbol, "TCS"));
  it("DATA-04. indices are searchable alongside equities", () => assert.equal(searchInstruments(LIST, "BANKNIFTY")[0].kind, "INDEX"));
  it("DATA-05. empty query returns nothing", () => assert.deepEqual(searchInstruments(LIST, "  "), []));
  it("DATA-06. search is not limited to a hard-coded watchlist", () => {
    const big = Array.from({ length: 500 }, (_, i) => ({ ...LIST[0], symbol: `SYM${i}`, instrumentKey: `NSE_EQ|X${i}` }));
    assert.equal(searchInstruments(big, "SYM499")[0].symbol, "SYM499");
  });
  const inst = LIST[0];
  const raw = { "NSE_EQ:RELIANCE": { instrument_token: inst.instrumentKey, last_price: 1500, net_change: 15, volume: 12345, ohlc: { open: 1490, high: 1510, low: 1480 }, last_trade_time: String(MIDDAY.getTime() - 5_000) } };
  it("DATA-07. quote normalizes ltp/ohlc/change/prevClose/volume", () => {
    const q = normalizeStockQuote(raw, inst, MIDDAY);
    assert.equal(q.ltp, 1500);
    assert.equal(q.previousClose, 1485);
    assert.equal(q.high, 1510);
    assert.equal(q.volume, 12345);
    assert.ok(Math.abs(q.changePercent! - 1.01) < 0.01);
  });
  it("DATA-08. quote during session is LIVE", () => assert.equal(normalizeStockQuote(raw, inst, MIDDAY).freshness, "LIVE"));
  it("DATA-09. quote after close is END_OF_DAY", () => assert.equal(normalizeStockQuote(raw, inst, NIGHT).freshness, "END_OF_DAY"));
  it("DATA-10. old last-trade during session is STALE", () => {
    const old = { x: { ...raw["NSE_EQ:RELIANCE"], last_trade_time: String(MIDDAY.getTime() - 10 * 60_000) } };
    assert.equal(normalizeStockQuote(old, inst, MIDDAY).freshness, "STALE");
  });
  it("DATA-11. missing last_price → UNAVAILABLE with null ltp (no fake price)", () => {
    const q = normalizeStockQuote({}, inst, MIDDAY);
    assert.equal(q.ltp, null);
    assert.equal(q.freshness, "UNAVAILABLE");
  });
  it("DATA-12. EMA200 is null until 200 bars exist", () => {
    const p = chartPoints(series(250), "1d").points;
    assert.equal(p[198].ema200, null);
    assert.ok(p[199].ema200 !== null);
  });
  it("DATA-13. RSI stays within 0–100", () => {
    for (const p of chartPoints(series(120), "1d").points) if (p.rsi !== null) assert.ok(p.rsi >= 0 && p.rsi <= 100);
  });
  it("DATA-14. MACD histogram = macd − signal", () => {
    const p = chartPoints(series(120), "1d").points.at(-1)!;
    assert.ok(Math.abs(p.macdHist! - (p.macd! - p.macdSignal!)) < 1e-9);
  });
  it("DATA-15. VWAP only on intraday intervals; support ≤ resistance", () => {
    const daily = chartPoints(series(80), "1d");
    assert.ok(daily.points.every((p) => p.vwap === null));
    assert.ok(chartPoints(series(80), "15m").points.some((p) => p.vwap !== null));
    assert.ok(daily.support! <= daily.resistance!);
  });
});

// ── OPTIONS: live chain vs historical separation ──────────────────────────────

describe("OPTIONS — live vs historical separation", () => {
  const src = (f: string) => fs.readFileSync(path.join(import.meta.dirname, f), "utf8");
  it("OPTIONS-01. diagnostic never reads historical option data", () => {
    assert.ok(!/historicalOptions|HistoricalOption|expired-instruments/.test(src("recommendationDiagnostic.ts")));
  });
  it("OPTIONS-02. frozen engine never reads historical option data", () => {
    assert.ok(!/historicalOptions|HistoricalOption|expired-instruments/.test(src("engine/strategy.ts")));
  });
  it("OPTIONS-03. historical warning is severity WARNING with source historical-data", () => {
    const w = run(live()).warnings.find((x) => x.code === "HISTORICAL_OPTIONS_UNAVAILABLE")!;
    assert.equal(w.severity, "WARNING");
    assert.equal(w.source, "historical-data");
  });
  it("OPTIONS-04. warning text names UDAPI1149 and says it is not a live blocker", () => {
    const w = run(live()).warnings[0];
    assert.ok(w.message.includes("UDAPI1149") && w.message.includes("NOT a live-recommendation blocker"));
  });
  it("OPTIONS-05. live option-chain check is stage 3 and passes on a live chain", () => {
    const c = run(live()).checks.find((x) => x.stage === 3)!;
    assert.equal(c.status, "PASS");
  });
  it("OPTIONS-06. mock chain fails the live option-chain check", () => {
    assert.equal(run(mockSnapshot("nifty", MIDDAY)).checks.find((x) => x.stage === 3)!.status, "BLOCKED");
  });
  it("OPTIONS-07. option-history page shows a blocker state, never a synthetic chart", () => {
    const p = src("../app/option-history/page.tsx");
    assert.ok(p.includes("Historical Option Data Unavailable"));
    assert.ok(!/recharts|LineChart/.test(p));
  });
  it("OPTIONS-08. legs keep the chain's instrument key unchanged", () => {
    const d = run(live());
    for (const l of d.candidates[0].legs) assert.equal(l.instrumentKey, `NSE_FO|T${l.strike}${l.type}`);
  });
  it("OPTIONS-09. history plan has no option-specific endpoints", () => {
    assert.ok(!/expired|option/i.test(JSON.stringify(PROVIDER_PLAN)));
  });
  it("OPTIONS-10. engine decision on the same live snapshot is unchanged by diagnose()", () => {
    const a = analyze(live(), MIDDAY, RISK);
    const before = a.status;
    diagnose(a, MIDDAY);
    assert.equal(a.status, before);
  });
});

// ── SAFETY ────────────────────────────────────────────────────────────────────

describe("SAFETY — frozen strategy and order safety", () => {
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".test.ts") ? [path.join(d, e.name)] : []);
  const srcRoot = path.join(import.meta.dirname, "..");
  it("SAFETY-01. strategy version remains 11.4-frozen", () => assert.equal(STRATEGY_VERSION.strategyVersion, "11.4-frozen"));
  it("SAFETY-02. MIN_STRATEGY_SCORE unchanged at 65", () => assert.equal(MIN_STRATEGY_SCORE, 65));
  it("SAFETY-03. zero Upstox order endpoints in src/", () => {
    const hits = walk(srcRoot).filter((f) => /\/v[23]\/order\/|order\/place|order\/modify|order\/cancel|placeOrder|modifyOrder|cancelOrder/.test(fs.readFileSync(f, "utf8")));
    assert.deepEqual(hits, []);
  });
  it("SAFETY-04. new Phase 13 modules issue no POST/PUT/DELETE", () => {
    for (const f of ["recommendationDiagnostic.ts", "marketHistory.ts", "services/stockService.ts"])
      assert.ok(!/method:\s*["'](POST|PUT|DELETE)/.test(fs.readFileSync(path.join(import.meta.dirname, f), "utf8")), f);
  });
  it("SAFETY-05. diagnostic API route is GET-only", () => {
    const r = fs.readFileSync(path.join(srcRoot, "app/api/recommendations/diagnostic/route.ts"), "utf8");
    assert.ok(r.includes("export async function GET") && !/export async function (POST|PUT|DELETE)/.test(r));
  });
});
