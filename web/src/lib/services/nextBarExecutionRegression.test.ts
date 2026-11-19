// Regression cases for exec-next-bar-open-v1 that the core suite does not cover: gaps, budget, missing bars, multi-leg
// repricing, concurrency, determinism, and the legacy records. Deterministic fixtures; reads stored files read-only.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { BacktestEngine, executionTimingOf, repriceAtFill, slippageAwareSizing } from "../backtestEngine.ts";
import { BACKTEST_IV, priceOption } from "../backtestSnapshot.ts";
import { getRiskConfig } from "./risk/riskConfig.ts";
import type { Candle } from "../types.ts";
import type { BacktestRunConfig } from "../backtestTypes.ts";
console.info = () => {};

// --- fixtures: 25 fifteen-minute bars per weekday session (09:15 … 15:15 IST), as in nextBarExecution.test.ts -----
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
// Opens gapped against the prior close on every bar except each session's first (pct per bar, alternating).
function gapped(cs: Candle[], pct: (i: number) => number): Candle[] {
  return cs.map((c, i) => (i % 25 === 0 ? c : { ...c, open: Math.round(c.open * (1 + pct(i)) * 100) / 100 }));
}
const base = sessions(40);
const GAPS = gapped(base, (i) => (i % 2 ? 0.03 : -0.03));
// 1% alternating opening gaps: large enough to pass levels at the open, small enough to leave premium above the floor.
const GAP1 = gapped(base, (i) => (i % 2 ? 0.01 : -0.01));
const MISSING = base.filter((_, i) => i === 0 || i % 7 !== 3); // every 7th bar removed: the next candle is not one bar later
const CFG: BacktestRunConfig = { index: "nifty", timeframe: "15m", startDate: "2026-09-01", endDate: "2026-10-31", startingCapital: 1_000_000 };
const META = { candleSource: "MOCK" as const };
const engine = new BacktestEngine();
const legacy = (cs: Candle[], c: Partial<BacktestRunConfig> = {}) => engine.run({ ...CFG, ...c }, cs, [], META);
const indexOf = (cs: Candle[], ts: string) => cs.findIndex((c) => c.timestamp === ts);

// --- gaps ---------------------------------------------------------------------------------------------------------
test("RG1. gap-up and gap-down entries are priced at the actual open of the fill bar", () => {
  let up = 0, down = 0;
  for (const model of ["CLOSE_ONLY", "INTRABAR_MODEL_DERIVED"] as const) {
    const r = legacy(GAPS, { executionModel: model });
    for (const t of r.trades) {
      const i = indexOf(GAPS, t.entryBarTimestamp!);
      const fillBar = GAPS[i];
      const prevClose = GAPS[i - 1].close;
      if (fillBar.open > prevClose) up++;
      if (fillBar.open < prevClose) down++;
      for (const l of t.legs) {
        const atOpen = priceOption(l.type, fillBar.open, l.strike, t.expiry, new Date(t.entryTimestamp), BACKTEST_IV);
        assert.ok(Math.abs(atOpen - l.entryMid) < 0.02, `${t.tradeId}: entry mid ${l.entryMid} vs open-based ${atOpen}`);
      }
    }
  }
  assert.ok(up > 0 && down > 0, `gap-up fills ${up}, gap-down fills ${down}: both directions must occur`);
});

test("RG2. an adverse opening gap through the stop is booked at the open, at a loss", () => {
  for (const model of ["CLOSE_ONLY", "INTRABAR_MODEL_DERIVED"] as const) {
    const gapExits = legacy(GAP1, { executionModel: model }).trades.filter((t) => t.exitAtFill && t.exitReason === "GAP_EXIT");
    assert.ok(gapExits.length > 0, `${model}: fixture must produce gap exits at the open`);
    // A premium at the ₹0.05 floor pays one tick on the buy and cannot be sold below the tick: its round trip loses.
    // Such trades can never profit; losses are required somewhere in the set.
    assert.ok(gapExits.every((t) => t.realizedPnL <= 0), "no adverse gap exit may show a profit");
    assert.ok(gapExits.some((t) => t.realizedPnL < 0), `${model}: at least one adverse gap exit must lose`);
    for (const t of gapExits) {
      const open = GAP1[indexOf(GAP1, t.entryBarTimestamp!)].open;
      for (const l of t.legs) {
        const atOpen = priceOption(l.type, open, l.strike, t.expiry, new Date(t.exitTimestamp), BACKTEST_IV);
        assert.ok(Math.abs(atOpen - l.exitMid) < 0.02, `${t.tradeId}: exit mid ${l.exitMid} vs open-based ${atOpen}`);
      }
    }
  }
});

test("RG3. an opening gap already beyond the target is booked at the open: no profit from a passed level", () => {
  // Buying at an open already above the target and selling at that same open is a round trip: it can only lose
  // (slippage both ways). That is the conservative result. The profit path is a gap AFTER the fill, handled by the exits.
  const targetAtOpen = legacy(GAP1).trades.filter((t) => t.exitAtFill && t.exitReason === "TARGET");
  assert.ok(targetAtOpen.length > 0, "fixture must produce target exits at the open");
  for (const t of targetAtOpen) {
    assert.ok(t.realizedPnL < 0, `${t.tradeId}: round trip at the open P&L ${t.realizedPnL}`);
    const open = GAP1[indexOf(GAP1, t.entryBarTimestamp!)].open;
    for (const l of t.legs) {
      const atOpen = priceOption(l.type, open, l.strike, t.expiry, new Date(t.exitTimestamp), BACKTEST_IV);
      assert.ok(Math.abs(atOpen - l.exitMid) < 0.02, `${t.tradeId}: exit mid ${l.exitMid} vs open-based ${atOpen}`);
      assert.ok(t.legs.length >= 1);
    }
  }
});

// --- multi-leg repricing (pure) -----------------------------------------------------------------------------------
const OPEN = 23000, EXP = "2026-10-27", NOW = new Date("2026-10-06T04:00:00Z");
const bullCallSpread = [{ side: "BUY" as const, type: "CE" as const, strike: 23000 }, { side: "SELL" as const, type: "CE" as const, strike: 23300 }];
const ironCondor = [
  { side: "SELL" as const, type: "PE" as const, strike: 22600 }, { side: "BUY" as const, type: "PE" as const, strike: 22300 },
  { side: "SELL" as const, type: "CE" as const, strike: 23400 }, { side: "BUY" as const, type: "CE" as const, strike: 23700 },
];
const price = (l: { type: "CE" | "PE"; strike: number }, spot = OPEN) => Math.round(priceOption(l.type, spot, l.strike, EXP, NOW, BACKTEST_IV) * 100) / 100;

test("RG4. multi-leg debit spread: each leg is repriced at the open; net and value follow the leg signs", () => {
  const r = repriceAtFill({ legs: bullCallSpread, credit: false, stop: 0, target1: 1e9, expiry: EXP, openSpot: OPEN, fillTime: NOW, iv: BACKTEST_IV });
  assert.deepEqual(r.mids, bullCallSpread.map((l) => price(l)));
  assert.equal(r.net, Math.round((r.mids[0] - r.mids[1]) * 100) / 100);
  assert.equal(r.value, r.net);
  assert.equal(r.exitAtOpen, null);
});

test("RG5. multi-leg credit structure (iron condor): net is buys minus sells; value is the cost to close", () => {
  const r = repriceAtFill({ legs: ironCondor, credit: true, stop: 1e9, target1: -1e9, expiry: EXP, openSpot: OPEN, fillTime: NOW, iv: BACKTEST_IV });
  const mids = ironCondor.map((l) => price(l));
  assert.deepEqual(r.mids, mids);
  const net = ironCondor.reduce((a, l, k) => a + (l.side === "BUY" ? mids[k] : -mids[k]), 0);
  assert.equal(r.net, Math.round(net * 100) / 100);
  assert.equal(r.value, -r.net, "credit value is the cost to close (−net)");
});

test("RG6. a level passed at the open is detected for debit and credit structures", () => {
  const debit = repriceAtFill({ legs: bullCallSpread, credit: false, stop: 1e9, target1: 0, expiry: EXP, openSpot: OPEN, fillTime: NOW, iv: BACKTEST_IV });
  assert.equal(debit.stopBeyond, true, "debit: a stop above the value at the open is already passed");
  assert.equal(debit.exitAtOpen, "GAP_EXIT");
  const credit = repriceAtFill({ legs: ironCondor, credit: true, stop: 0, target1: 1e9, expiry: EXP, openSpot: OPEN, fillTime: NOW, iv: BACKTEST_IV });
  assert.equal(credit.stopBeyond, true, "credit: cost to close above the stop is a breach");
  assert.equal(credit.exitAtOpen, "GAP_EXIT");
});

test("RG7. for a valid plan (stop below target) the stop and target are never both passed at the open", () => {
  for (let spot = 21000; spot <= 25000; spot += 50) {
    const r = repriceAtFill({ legs: bullCallSpread, credit: false, stop: 40, target1: 120, expiry: EXP, openSpot: spot, fillTime: NOW, iv: BACKTEST_IV });
    assert.ok(!(r.stopBeyond && r.targetBeyond), `spot ${spot}`);
  }
});

// --- minimum one-lot budget ---------------------------------------------------------------------------------------
test("RG15. a position closed at its fill open loses no more than its recorded budget (round-trip slippage and charges)", () => {
  // Such a position's whole loss is the round trip at the fill price; it is sized on that, so the budget holds up to
  // the charge estimate (measured worst: 1.03R on the 1% gap fixture).
  for (const model of ["CLOSE_ONLY", "INTRABAR_MODEL_DERIVED"] as const) {
    const atFill = legacy(GAP1, { executionModel: model }).trades.filter((t) => t.exitAtFill);
    assert.ok(atFill.length > 0, `${model}: fixture must produce positions closed at the fill open`);
    for (const t of atFill) assert.ok(t.realizedPnL >= -t.riskAmount * 1.05, `${t.tradeId}: loss ${t.realizedPnL} vs budget ${t.riskAmount}`);
  }
});

test("RG8. entry is rejected when the budget cannot fund one lot at fill-time risk", () => {
  const sized = slippageAwareSizing({ plannedRiskPerUnit: 100, legs: [{ mid: 50, fill: 50.5 }], slip: 0.01, netMid: 50, stop: 0, lotSize: 75, maxLots: 5, budget: 1000, openRiskRoom: 1e9 });
  assert.equal(sized.lots, 0);
  assert.equal(sized.limitedBy, "POSITION_SIZE_ZERO");
  const tiny = legacy(base, { riskConfig: { riskPerTradePercent: 0.00001 } as never });
  assert.equal(tiny.trades.length, 0, "no trade may be booked when one lot exceeds the budget");
  assert.ok(Object.values(tiny.noTradeAnalytics.rejectionReasons).reduce((a, b) => a + b, 0) > 0, "the rejection is counted");
});

// --- decision / fill timing ---------------------------------------------------------------------------------------
test("RG9. a missing next candle never fills from a later bar", () => {
  for (const model of ["CLOSE_ONLY", "INTRABAR_MODEL_DERIVED"] as const) {
    const r = legacy(MISSING, { executionModel: model });
    for (const t of r.trades) {
      assert.equal(Date.parse(t.entryBarTimestamp!) - Date.parse(t.signalBarTimestamp!), 15 * 60_000, `${t.tradeId}: entry bar is not the next bar`);
    }
    assert.ok((r.noTradeAnalytics.rejectionReasons.PENDING_NEXT_BAR_MISSING ?? 0) > 0, `${model}: a signal before a gap must be counted as unfilled`);
  }
});

test("RG10. no fill at or after the expiry cutoff (15:15 IST on expiry day), on every fixture", () => {
  for (const cs of [base, GAPS, GAP1, MISSING]) {
    for (const t of legacy(cs).trades) {
      const cutoff = Date.parse(`${t.expiry}T09:45:00Z`);
      assert.ok(Date.parse(t.entryTimestamp) < cutoff, `${t.tradeId} entered at ${t.entryTimestamp}, cutoff ${new Date(cutoff).toISOString()}`);
    }
  }
});

test("RG11. open positions never exceed the concurrent-position limit at any fill", () => {
  const max = getRiskConfig({ accountCapital: CFG.startingCapital! }).maxConcurrentPositions;
  for (const cs of [base, GAPS, GAP1]) {
    const trades = legacy(cs).trades;
    for (const t of trades) {
      const open = trades.filter((o) => Date.parse(o.entryTimestamp) <= Date.parse(t.entryTimestamp) && (o.exitTimestamp === "" || Date.parse(o.exitTimestamp) > Date.parse(t.entryTimestamp)));
      assert.ok(open.length <= max, `${t.tradeId}: ${open.length} open > ${max}`);
    }
  }
});

test("RG12. the run is deterministic on gapped and missing-bar fixtures", () => {
  for (const cs of [GAPS, MISSING]) {
    const a = legacy(cs, { executionModel: "INTRABAR_MODEL_DERIVED" });
    const b = legacy(cs, { executionModel: "INTRABAR_MODEL_DERIVED" });
    assert.equal(JSON.stringify(a.trades), JSON.stringify(b.trades));
    assert.equal(JSON.stringify(a.equityCurve), JSON.stringify(b.equityCurve));
    assert.equal(a.runId, b.runId);
  }
});

// --- legacy records -----------------------------------------------------------------------------------------------
// SHA-256 of each stored legacy run file, recorded before the execution change. A change to any of them fails here.
const STORED: Record<string, string> = {
  "bt_482207d9.json": "d5a8a4fc63e57c91d8d532a4293f42d6e1d043ee15fcc4498597e940bd7db9a6",
  "bt_5ad11e54.json": "ef00d533f28b26939385fc5d38732476d9dc9cd05e567f4e9fadd4bdf807561e",
  "bt_6093f183.json": "1f6815f1dfaed02d61e0b018a6c4d5c4d703cfb6fc7d6f4015b85573a1077ff7",
  "bt_f817dfc2.json": "08da26bb5d94fd001772fa7f397f425b6fd2e9cf3f9107a6bdebc10b265ac90c",
};
const dir = path.resolve(process.cwd(), ".data/backtests");
for (const [file, sha] of Object.entries(STORED)) {
  const full = path.join(dir, file);
  test(`RG13. stored legacy record ${file} is unchanged and labelled LEGACY_SAME_CANDLE`, { skip: !fs.existsSync(full) && "stored run not present" }, () => {
    const raw = fs.readFileSync(full);
    assert.equal(createHash("sha256").update(raw).digest("hex"), sha, "stored legacy record was modified");
    const parsed = JSON.parse(raw.toString("utf8"));
    assert.equal(executionTimingOf(parsed), "LEGACY_SAME_CANDLE");
    assert.equal(parsed.metadata?.executionTiming, undefined, "legacy records carry no new marker");
  });
}

test("RG14. a new run never reuses a stored run ID", () => {
  const r = engine.run(CFG, base, [], META);
  for (const id of Object.keys(STORED).map((f) => f.replace(".json", ""))) assert.notEqual(r.runId, id);
  assert.match(r.runId, /^bt_[0-9a-f]{8}$/);
});

