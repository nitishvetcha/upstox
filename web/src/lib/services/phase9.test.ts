// Run: npm test   (deterministic fixtures; no Upstox account needed)
import { test } from "node:test";
import assert from "node:assert/strict";
import { expectedBarsPerSession, fetchHistoricalRange, mergeAndValidate, planChunks, MAX_CHUNK_DAYS, type ChunkFetcher } from "./historicalCandles.ts";
import { loadBacktestInputs } from "./backtestInputs.ts";
import { evaluateIntrabarExit, intrabarPath } from "../backtestExecution.ts";
import { BacktestEngine, feasibility, overnightSessions, riskRejectionCode } from "../backtestEngine.ts";
import { priceOption } from "../backtestSnapshot.ts";
import { compareExecutionModels, runCapitalScenarios, CAPITAL_NOTE, SENSITIVITY_THRESHOLDS } from "./backtestScenarios.ts";
import { journal } from "./performance/journal.ts";
import { clearUpstoxCache } from "./cache.ts";
import { NSE_HOLIDAYS } from "../time.ts";
import type { Candle } from "../types.ts";
import type { BacktestResult, BacktestRunConfig } from "../backtestTypes.ts";

console.info = () => {};

// --- historical fixtures: 25 × 15-minute bars per IST session ---
const bar = (day: string, i: number, close = 100 + i): Candle => ({
  timestamp: new Date(Date.parse(`${day}T09:15:00+05:30`) + i * 900_000).toISOString(),
  open: close - 1, high: close + 2, low: close - 2, close, volume: null,
});
const session = (day: string) => Array.from({ length: 25 }, (_, i) => bar(day, i));
const raw = (cs: Candle[]) => ({ candles: [...cs].reverse().map((c) => [c.timestamp, c.open, c.high, c.low, c.close, 0, 0]) }); // newest first, like Upstox

test("1. one API chunk for a short range", () => {
  assert.deepEqual(planChunks("2026-09-01", "2026-09-20", "15m"), [{ from: "2026-09-01", to: "2026-09-20" }]);
});

test("2. multiple chunks: contiguous, non-overlapping, exactly covering the range", async () => {
  const chunks = planChunks("2026-01-01", "2026-10-05", "15m");
  assert.ok(chunks.length > 1);
  assert.equal(chunks[0].from, "2026-01-01");
  assert.equal(chunks.at(-1)!.to, "2026-10-05");
  for (let i = 1; i < chunks.length; i++) {
    assert.equal(Date.parse(chunks[i].from) - Date.parse(chunks[i - 1].to), 86_400_000, "no gap / overlap");
    assert.ok((Date.parse(chunks[i - 1].to) - Date.parse(chunks[i - 1].from)) / 86_400_000 + 1 <= MAX_CHUNK_DAYS["15m"]);
  }
  let calls = 0;
  await fetchHistoricalRange({ instrumentKey: "K", interval: "15m", startDate: "2026-01-01", endDate: "2026-10-05" }, async () => (calls++, { candles: [] }));
  assert.equal(calls, chunks.length, "one request per chunk");
});

test("3. exact boundary timestamps: first and last session bars kept, bars outside the range dropped", () => {
  const before = bar("2026-09-04", 24); // Fri 15:15 IST, day before range
  const { candles, coverage } = mergeAndValidate([[before, ...session("2026-09-07")]], "2026-09-07", "2026-09-07", "15m", 1);
  assert.equal(candles[0].timestamp, bar("2026-09-07", 0).timestamp); // 09:15 IST
  assert.equal(candles.at(-1)!.timestamp, bar("2026-09-07", 24).timestamp); // 15:15 IST
  assert.equal(coverage.outsideRangeBars, 1);
  assert.equal(coverage.coveragePercent, 100);
  assert.equal(expectedBarsPerSession("15m"), 25);
});

test("4. duplicate candles removed and counted", () => {
  const s = session("2026-09-07");
  const { candles, coverage } = mergeAndValidate([s, s.slice(20)], "2026-09-07", "2026-09-07", "15m", 2);
  assert.equal(candles.length, 25);
  assert.equal(coverage.duplicateBars, 5);
});

test("5. out-of-order candles corrected and counted", () => {
  const s = session("2026-09-07");
  const { candles, coverage } = mergeAndValidate([[...s.slice(10), ...s.slice(0, 10)]], "2026-09-07", "2026-09-07", "15m", 1);
  assert.ok(candles.every((c, i) => i === 0 || c.timestamp > candles[i - 1].timestamp));
  assert.equal(coverage.outOfOrderBars, 10);
});

test("6. missing trading day reported as a missing session", () => {
  const { coverage } = mergeAndValidate([[...session("2026-09-07"), ...session("2026-09-09")]], "2026-09-07", "2026-09-09", "15m", 1);
  assert.deepEqual(coverage.missingSessions, ["2026-09-08"]);
  assert.equal(coverage.status, "PARTIAL");
  assert.equal(coverage.coveragePercent, 66.67);
});

test("7. weekends are excluded, not missing", () => {
  const { coverage } = mergeAndValidate([[...session("2026-09-04"), ...session("2026-09-07")]], "2026-09-04", "2026-09-07", "15m", 1);
  assert.deepEqual(coverage.missingSessions, []);
  assert.equal(coverage.weekendDays, 2);
  assert.equal(coverage.status, "FULL");
});

test("8. configured holidays are excluded, not missing", () => {
  assert.ok(NSE_HOLIDAYS.has("2026-10-02"), "Gandhi Jayanti is in the shared calendar (not mutated by tests)");
  const { coverage } = mergeAndValidate([[...session("2026-10-01"), ...session("2026-10-05")]], "2026-10-01", "2026-10-05", "15m", 1);
  assert.deepEqual(coverage.holidays, ["2026-10-02"]);
  assert.deepEqual(coverage.missingSessions, []);
  assert.equal(coverage.status, "FULL");
});

test("9–10. requested start and end are preserved even when data is short", () => {
  const { coverage } = mergeAndValidate([session("2026-09-15")], "2026-09-01", "2026-09-30", "15m", 2);
  assert.equal(coverage.requestedStart, "2026-09-01");
  assert.equal(coverage.requestedEnd, "2026-09-30");
  assert.equal(coverage.actualStart, "2026-09-15");
  assert.equal(coverage.actualEnd, "2026-09-15");
  assert.equal(coverage.status, "PARTIAL");
});

test("11. partial historical response (failed chunk) is PARTIAL with a reason, never FULL", async () => {
  const fetcher: ChunkFetcher = async (_r, chunk) => {
    if (chunk.from === "2026-09-29") throw new Error("HTTP 500");
    return raw([...session("2026-09-01"), ...session("2026-09-02")]);
  };
  const r = await fetchHistoricalRange({ instrumentKey: "K", interval: "15m", startDate: "2026-09-01", endDate: "2026-10-05" }, fetcher);
  assert.equal(r.coverage.failedChunks.length, 1);
  assert.equal(r.coverage.status, "PARTIAL");
  assert.match(r.coverage.reason!, /did not return complete data/);
});

test("12. empty historical response is EMPTY", async () => {
  const r = await fetchHistoricalRange({ instrumentKey: "K", interval: "15m", startDate: "2026-09-01", endDate: "2026-09-05" }, async () => ({ candles: [] }));
  assert.equal(r.coverage.status, "EMPTY");
  assert.equal(r.candles.length, 0);
});

test("12b. backtest inputs: warmup fetched but coverage reported for the requested range only", async () => {
  clearUpstoxCache();
  const days = ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-31", "2026-09-01", "2026-09-02"];
  const fetcher: ChunkFetcher = async (req) => raw(req.interval === "1d" ? [] : days.flatMap(session));
  const i = await loadBacktestInputs({ index: "nifty", timeframe: "15m", startDate: "2026-09-01", endDate: "2026-09-02", startingCapital: 100_000 }, fetcher);
  assert.equal(i.candles.length, days.length * 25, "warmup bars available to indicators");
  assert.equal(i.meta.coverage!.requestedStart, "2026-09-01");
  assert.equal(i.meta.coverage!.barCount, 50);
  assert.equal(i.meta.coverage!.status, "FULL");
  assert.equal(i.meta.candleSource, "END_OF_DAY");
});

// --- intrabar model (value = underlying level, so levels are easy to read) ---
const lin = (s: number) => s;
test("13. long stop hit intrabar: fill at the stop level, not the bar low", () => {
  const r = evaluateIntrabarExit([100, 95, 99, 98], lin, false, 96, 110);
  assert.equal(r.exit!.reason, "STOP_LOSS");
  assert.ok(Math.abs(r.exit!.fillSpot - 96) < 1e-6);
  assert.equal(r.exit!.gap, false);
});
test("14. long target hit intrabar", () => {
  const r = evaluateIntrabarExit([100, 99, 105, 103], lin, false, 90, 104);
  assert.equal(r.exit!.reason, "TARGET");
  assert.ok(Math.abs(r.exit!.fillSpot - 104) < 1e-6);
});
test("15. short (credit) stop hit intrabar: cost to close rises to the stop", () => {
  const r = evaluateIntrabarExit([100, 99, 105, 103], lin, true, 104, 90);
  assert.equal(r.exit!.reason, "STOP_LOSS");
  assert.ok(Math.abs(r.exit!.fillSpot - 104) < 1e-6);
});
test("16. short (credit) target hit intrabar", () => {
  const r = evaluateIntrabarExit([100, 95, 99, 98], lin, true, 120, 96);
  assert.equal(r.exit!.reason, "TARGET");
});
test("17. stop and target both touched in one bar is flagged", () => {
  const r = evaluateIntrabarExit([100, 95, 105, 102], lin, false, 96, 104);
  assert.equal(r.exit!.bothTouched, true);
});
test("18. conservative stop-first: stop wins even when the assumed path reaches the target first", () => {
  const path = intrabarPath({ open: 100, high: 105, low: 95, close: 98 }); // bearish: O → H → L → C
  assert.deepEqual(path, [100, 105, 95, 98]);
  const r = evaluateIntrabarExit(path, lin, false, 96, 104);
  assert.equal(r.exit!.reason, "STOP_LOSS");
});
test("19. gap through the stop fills at the open, never at the better stop price", () => {
  const r = evaluateIntrabarExit([90, 89, 93, 92], lin, false, 96, 110);
  assert.equal(r.exit!.reason, "STOP_LOSS");
  assert.equal(r.exit!.fillSpot, 90);
  assert.equal(r.exit!.gap, true);
});

// --- engine fixture ---
function sessions(days: number, start = 23000): Candle[] {
  const out: Candle[] = [];
  let p = start;
  for (let k = 0; out.length < days * 25; k++) {
    const day = new Date(Date.parse("2026-09-01T00:00:00Z") + k * 86_400_000);
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
    const ymd = day.toISOString().slice(0, 10);
    for (let i = 0; i < 25; i++) {
      const n = out.length;
      p += Math.sin(n / 7) * 18 + Math.cos(n / 3) * 9 + 2.5;
      out.push({ timestamp: new Date(Date.parse(`${ymd}T09:15:00+05:30`) + i * 900_000).toISOString(), open: p - 5, high: p + 12, low: p - 12, close: Math.round(p * 100) / 100, volume: null });
    }
  }
  return out;
}
const candles = sessions(40);
const BASE: BacktestRunConfig = { index: "nifty", timeframe: "15m", startDate: "2026-09-01", endDate: "2026-10-31", startingCapital: 100_000 };
const META = { candleSource: "MOCK" as const };
const run = (c: Partial<BacktestRunConfig>) => new BacktestEngine().run({ ...BASE, ...c }, candles, [], META);
const close = run({});
const intra = run({ executionModel: "INTRABAR_MODEL_DERIVED" });

test("20. overnight positions tracked (entry/exit session, trading sessions held)", () => {
  assert.equal(overnightSessions("2026-09-04", "2026-09-07"), 1, "Fri → Mon is one session, weekend excluded");
  assert.equal(overnightSessions("2026-09-07", "2026-09-07"), 0);
  const big = run({ startingCapital: 1_000_000, executionModel: "INTRABAR_MODEL_DERIVED" });
  const on = big.trades.filter((t) => (t.overnightCount ?? 0) > 0);
  assert.ok(on.length > 0);
  for (const t of on) assert.ok(t.exitSession! > t.entrySession!);
});
test("21. expiry exits happen (positions are closed at expiry)", () => {
  assert.ok(intra.trades.some((t) => t.exitReason === "EXPIRY"));
  for (const t of [...intra.trades, ...close.trades]) assert.ok(t.exitSession! <= t.expiry, `${t.tradeId} held past expiry ${t.expiry}`);
  assert.ok((close.noTradeAnalytics.rejectionReasons.EXPIRY_CUTOFF ?? 0) > 0, "entries at the expiry-day cutoff are refused");
});
test("22. zero-price expiry is valid data (exit 0, full loss, journal complete)", () => {
  assert.equal(priceOption("CE", 22900, 23000, "2026-09-08", new Date("2026-09-08T10:00:00Z")), 0);
  const worthless = intra.trades.find((t) => t.exitReason === "EXPIRY" && t.legs.some((l) => l.exitMid === 0));
  if (worthless) assert.equal(journal(intra, [worthless])[0].legsComplete, true);
  const t = structuredClone(intra.trades[0]);
  t.legs = t.legs.map((l) => ({ ...l, exitPrice: 0, exitMid: 0 }));
  assert.equal(journal(intra, [t])[0].legsComplete, true);
});
test("23. synthetic option intrabar prices are labelled MODEL DERIVED (historical option OHLC NOT AVAILABLE)", () => {
  assert.ok(intra.trades.every((t) => t.executionDataQuality === "MODEL_DERIVED_INTRABAR"));
  assert.ok(intra.trades.some((t) => t.exitBarOptionOHLC && t.exitBarOptionOHLC.high >= t.exitBarOptionOHLC.low));
  assert.equal(intra.dataQuality.intrabarOptionPrices, "MODEL DERIVED INTRABAR");
  assert.equal(intra.dataQuality.historicalOptionOHLC, "NOT AVAILABLE");
  assert.equal(intra.execution.intrabarPathModel, "DETERMINISTIC_OHLC_PATH");
  assert.equal(intra.execution.sameBarExitPolicy, "CONSERVATIVE_STOP_FIRST");
  assert.equal(close.dataQuality.intrabarOptionPrices, "NOT AVAILABLE");
  assert.ok(close.trades.every((t) => t.executionDataQuality === "CLOSE_ONLY_SYNTHETIC"));
});
test("24. intrabar path is deterministic (bullish O→L→H→C, bearish O→H→L→C)", () => {
  assert.deepEqual(intrabarPath({ open: 100, high: 105, low: 95, close: 102 }), [100, 95, 105, 102]);
  assert.deepEqual(intrabarPath({ open: 100, high: 105, low: 95, close: 98 }), [100, 105, 95, 98]);
  assert.equal(JSON.stringify(run({ executionModel: "INTRABAR_MODEL_DERIVED" })), JSON.stringify(intra));
});
test("24b. intrabar losses are bounded by the stop level except where a gap is recorded", () => {
  for (const t of intra.trades.filter((x) => x.exitReason === "STOP_LOSS" && !x.exitGap)) {
    // At the stop level the only extra loss is exit slippage (1%) on the position value.
    const stopLoss = (t.entryPrice - t.stopLoss) * t.quantity;
    assert.ok(-t.realizedPnL <= stopLoss + Math.abs(t.stopLoss) * t.quantity * 0.011 + 1, `${t.tradeId}: ${t.realizedPnL} vs planned ${-stopLoss}`);
  }
});

// --- daily loss policy (tight limits on ₹10L make the limit reachable in the fixture; defaults are untouched) ---
const tight = { startingCapital: 1_000_000, riskConfig: { maxDailyLossPercent: 0.05 } };
const block = run(tight);
const flat = run({ ...tight, flattenOnDailyLossLimit: true });

test("25. daily loss below the limit: no blocks, no flattens", () => {
  const loose = run({ startingCapital: 1_000_000, riskConfig: { maxDailyLossPercent: 50 } });
  assert.equal(loose.noTradeAnalytics.rejectionReasons.DAILY_LOSS_LIMIT_BLOCK ?? 0, 0);
  assert.equal(loose.execution.dailyLossFlattens, 0);
});
test("26. daily loss reaching the limit is detected (realized-only definition)", () => {
  assert.equal(block.execution.dailyLossDefinition, "REALIZED_ONLY");
  assert.ok((block.noTradeAnalytics.rejectionReasons.DAILY_LOSS_LIMIT_BLOCK ?? 0) > 0 || block.riskMetrics.dailyLossBreaches > 0);
});
test("27. new entries are blocked with DAILY_LOSS_LIMIT_BLOCK", () => {
  assert.ok((block.noTradeAnalytics.rejectionReasons.DAILY_LOSS_LIMIT_BLOCK ?? 0) > 0);
  assert.equal(riskRejectionCode("DAILY_LOSS_LIMIT"), "DAILY_LOSS_LIMIT_BLOCK");
});
test("28. flatten=false (default): existing positions are NOT flattened", () => {
  assert.equal(block.execution.flattenOnDailyLossLimit, false);
  assert.equal(close.execution.flattenOnDailyLossLimit, false, "default stays false");
  assert.ok(block.trades.every((t) => t.exitReason !== "DAILY_LOSS_LIMIT_FLATTEN"));
});
test("29. flatten=true: open positions are flattened when the limit is reached", () => {
  assert.ok(flat.execution.dailyLossFlattens > 0);
  assert.ok(flat.trades.some((t) => t.exitReason === "DAILY_LOSS_LIMIT_FLATTEN"));
});
test("30. flatten exit reason and execution model are recorded", () => {
  for (const t of flat.trades.filter((x) => x.exitReason === "DAILY_LOSS_LIMIT_FLATTEN")) {
    assert.ok(t.exitTimestamp && t.legs.every((l) => Number.isFinite(l.exitPrice)));
    assert.equal(t.executionDataQuality, "CLOSE_ONLY_SYNTHETIC");
  }
});
test("31. no duplicate flatten: at most one flatten event (timestamp) per IST day", () => {
  const byDay = new Map<string, Set<string>>();
  for (const t of flat.trades.filter((x) => x.exitReason === "DAILY_LOSS_LIMIT_FLATTEN")) byDay.set(t.exitSession!, (byDay.get(t.exitSession!) ?? new Set()).add(t.exitTimestamp));
  for (const ts of byDay.values()) assert.equal(ts.size, 1);
});
test("32. next trading day resets daily loss: entries resume after a flatten day", () => {
  const firstFlatten = flat.trades.filter((x) => x.exitReason === "DAILY_LOSS_LIMIT_FLATTEN").map((t) => t.exitSession!).sort()[0];
  assert.ok(flat.trades.some((t) => t.entrySession! > firstFlatten));
});

// --- capital scenarios ---
const scen = runCapitalScenarios(BASE, candles, [], META, null, [100_000, 200_000, 500_000, 1_000_000]);
test("33–36. ₹1L / ₹2L / ₹5L / ₹10L scenarios: more capital → fewer position-size rejections, risk ≤ 1% each", () => {
  assert.deepEqual(scen.rows.map((r) => r.capital), [100_000, 200_000, 500_000, 1_000_000]);
  for (let i = 1; i < scen.rows.length; i++) assert.ok(scen.rows[i].positionSizeRejections <= scen.rows[i - 1].positionSizeRejections);
  scen.runs.forEach((r) => r.trades.forEach((t) => assert.ok(t.riskAmount <= r.config.startingCapital * 0.01 + 0.01)));
  assert.equal(scen.note, CAPITAL_NOTE);
});
test("37. minimum capital for one lot = one-lot risk ÷ risk %", () => {
  const f = feasibility(150_000, 1, 65, [800, 1200, 1000]);
  assert.deepEqual(f.minimumCapitalForOneLot, { min: 80_000, median: 100_000 });
  assert.equal(f.status, "SUFFICIENT");
  assert.equal(feasibility(90_000, 1, 65, [800, 1200, 1000]).status, "SOMETIMES SUFFICIENT");
  assert.equal(feasibility(50_000, 1, 65, [800, 1200, 1000]).status, "INSUFFICIENT CAPITAL");
  assert.equal(feasibility(50_000, 1, 65, []).status, "NO SIGNALS");
});
test("38. insufficient capital produces POSITION_SIZE_ZERO rejections (never a fractional lot)", () => {
  const tiny = run({ startingCapital: 20_000 });
  assert.ok((tiny.noTradeAnalytics.rejectionReasons.POSITION_SIZE_ZERO ?? 0) > 0);
  assert.equal(riskRejectionCode("ZERO_LOTS"), "POSITION_SIZE_ZERO");
});
test("39. no fractional lots: quantity is always whole lots of the contract lot size", () => {
  for (const r of [...scen.runs, intra]) for (const t of r.trades) {
    assert.ok(Number.isInteger(t.lots) && t.lots >= 1);
    assert.equal(t.quantity, t.lots * t.lotSize);
    assert.equal(t.lotSize, 65);
  }
});
test("40. identical strategy/config across capital scenarios (only capital differs)", () => {
  const strip = (r: BacktestResult) => JSON.stringify({ ...r.config, startingCapital: 0 });
  assert.ok(scen.runs.every((r) => strip(r) === strip(scen.runs[0])));
  assert.ok(scen.runs.every((r) => r.noTradeAnalytics.totalEvaluated === scen.runs[0].noTradeAnalytics.totalEvaluated));
});

// --- execution comparison ---
const cmp = compareExecutionModels(BASE, candles, [], META);
test("41. CLOSE_ONLY is deterministic (explicit model = default behaviour)", () => {
  const a = run({ executionModel: "CLOSE_ONLY" });
  assert.equal(JSON.stringify(run({ executionModel: "CLOSE_ONLY" })), JSON.stringify(a));
  assert.equal(JSON.stringify(a.trades.map((t) => ({ ...t, tradeId: "" }))), JSON.stringify(close.trades.map((t) => ({ ...t, tradeId: "" }))), "explicit CLOSE_ONLY trades = default trades");
});
test("42. INTRABAR_MODEL_DERIVED is deterministic", () => assert.equal(JSON.stringify(run({ executionModel: "INTRABAR_MODEL_DERIVED" })), JSON.stringify(intra)));
test("43. both models consume the same historical input", () => {
  assert.equal(cmp.runs.close.noTradeAnalytics.totalEvaluated, cmp.runs.intrabar.noTradeAnalytics.totalEvaluated);
  assert.equal(cmp.runs.close.equityCurve.length, cmp.runs.intrabar.equityCurve.length);
  assert.equal(JSON.stringify(cmp.runs.close.meta), JSON.stringify(cmp.runs.intrabar.meta));
});
test("44. only execution behaviour differs between the two runs", () => {
  const { executionModel: a, ...ca } = cmp.runs.close.config;
  const { executionModel: b, ...cb } = cmp.runs.intrabar.config;
  assert.equal(JSON.stringify(ca), JSON.stringify(cb));
  assert.deepEqual([a, b], ["CLOSE_ONLY", "INTRABAR_MODEL_DERIVED"]);
  assert.deepEqual(cmp.runs.close.capitalFeasibility, cmp.runs.intrabar.capitalFeasibility, "same signals → same one-lot risk samples");
});
test("45. comparison is reproducible and sensitivity follows the documented thresholds", () => {
  const again = compareExecutionModels(BASE, candles, [], META);
  const strip = (x: typeof cmp) => JSON.stringify({ ...x, runs: undefined });
  assert.equal(strip(again), strip(cmp));
  const d = Math.abs(cmp.returnDifferencePp);
  const expected = d > SENSITIVITY_THRESHOLDS.highReturnDiffPp || cmp.netPnLSignFlip ? "HIGH" : d > SENSITIVITY_THRESHOLDS.moderateReturnDiffPp ? "MODERATE" : "LOW";
  assert.equal(cmp.sensitivity, expected);
});
