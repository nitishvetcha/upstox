// Issue 2 / B5 — diagnostic and engine behaviour for each technical-candle condition. Offline; real frozen engine.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "./engine/strategy.ts";
import { mockSnapshot } from "./services/mock.ts";
import type { DataSource, Snapshot } from "./types.ts";
import type { TechnicalReasonCode } from "./services/candleFreshness.ts";
import { diagnose, type RecommendationDiagnostic } from "./recommendationDiagnostic.ts";

const MIDDAY = new Date("2026-10-05T07:00:00Z"); // Mon 12:30 IST, market open
const CLOSED = new Date("2026-10-05T11:21:00Z"); // Mon 16:51 IST
const RISK = { accountCapital: 500_000 };

function live(now: Date, opts: { technical?: DataSource; reason?: TechnicalReasonCode | null; reasonText?: string; marketClosed?: boolean } = {}): Snapshot {
  const s = mockSnapshot("nifty", now);
  const src = opts.marketClosed ? "END_OF_DAY" : "LIVE";
  for (const k of Object.keys(s.sources) as (keyof Snapshot["sources"])[]) s.sources[k] = { ...s.sources[k], source: src, provider: "UPSTOX" };
  s.sources.technical = { ...s.sources.technical, source: opts.technical ?? src, provider: "UPSTOX" };
  s.breadth = { ...s.breadth!, status: opts.marketClosed ? "END_OF_DAY" : "LIVE", source: s.sources.breadth } as Snapshot["breadth"];
  s.fallbackReason = null;
  s.news = { ...s.news, status: "LIVE" };
  for (const r of s.chain) {
    r.call.instrumentKey = `NSE_FO|T${r.strike}CE`;
    r.put.instrumentKey = `NSE_FO|T${r.strike}PE`;
  }
  s.technicalReasonCode = opts.reason ?? null;
  s.technicalReason = opts.reasonText ?? null;
  return s;
}
const run = (s: Snapshot, now: Date): RecommendationDiagnostic => diagnose(analyze(s, now, RISK, undefined), now);
const codes = (d: RecommendationDiagnostic) => d.blockers.map((b) => b.code);

describe("B5 — diagnostic and engine per technical-candle condition", () => {
  it("LIVE completed candles with live market → no technical blocker (baseline)", () => {
    const d = run(live(MIDDAY), MIDDAY);
    assert.equal(d.finalDecision, "TRADE");
    assert.ok(!codes(d).includes("INSUFFICIENT_FRESHNESS"));
    assert.ok(!codes(d).includes("NO_INTRADAY_CANDLES"));
  });

  it("STALE completed candle → not TRADE, INSUFFICIENT_FRESHNESS with the candle reason", () => {
    const s = live(MIDDAY, { technical: "STALE", reason: "STALE_CANDLE", reasonText: "Newest completed 15m candle closed 135 min ago; limit is 17 min." });
    const d = run(s, MIDDAY);
    assert.notEqual(d.finalDecision, "TRADE");
    const b = d.blockers.find((x) => x.code === "INSUFFICIENT_FRESHNESS" && x.source === "technical");
    assert.ok(b, "explicit technical freshness blocker");
    assert.match(b.message, /135 min ago/);
  });

  it("END_OF_DAY technical candles (closed session) → never eligible; END_OF_DAY blocker", () => {
    const d = run(live(CLOSED, { technical: "END_OF_DAY", marketClosed: true }), CLOSED);
    assert.equal(d.finalDecision, "NO_TRADE");
    assert.equal(d.eligible, false);
    assert.ok(codes(d).includes("END_OF_DAY"));
  });

  it("END_OF_DAY technical while the market reads LIVE → still not eligible", () => {
    const d = run(live(MIDDAY, { technical: "END_OF_DAY" }), MIDDAY);
    assert.notEqual(d.finalDecision, "TRADE");
    assert.ok(codes(d).includes("END_OF_DAY"));
  });

  it("opening window with no completed candle yet → NO_INTRADAY_CANDLES, not a market-closed blocker", () => {
    const now = new Date("2026-10-05T03:50:00Z"); // 09:20 IST
    const s = live(now, { technical: "UNAVAILABLE", reason: "NO_INTRADAY_CANDLES", reasonText: "Market open but no completed intraday candle for today yet." });
    const d = run(s, now);
    assert.notEqual(d.finalDecision, "TRADE");
    assert.ok(codes(d).includes("NO_INTRADAY_CANDLES"));
    assert.ok(!codes(d).includes("MARKET_CLOSED"), "the market is open; it must not be reported as closed");
  });

  it("pre-open → NO_INTRADAY_CANDLES with a pre-open message; not END_OF_DAY", () => {
    const now = new Date("2026-10-05T03:35:00Z"); // 09:05 IST
    const s = live(now, { technical: "UNAVAILABLE", reason: "PRE_OPEN", reasonText: "Pre-open: no intraday candles for today yet." });
    const d = run(s, now);
    assert.notEqual(d.finalDecision, "TRADE");
    const b = d.blockers.find((x) => x.code === "NO_INTRADAY_CANDLES");
    assert.ok(b);
    assert.match(b.message, /Pre-open/);
    assert.ok(!codes(d).includes("END_OF_DAY"));
  });

  it("malformed newest candle → INSUFFICIENT_TECHNICAL_DATA with the data-quality reason", () => {
    const s = live(MIDDAY, { technical: "UNAVAILABLE", reason: "DATA_QUALITY", reasonText: "Newest intraday candle is malformed." });
    const d = run(s, MIDDAY);
    assert.notEqual(d.finalDecision, "TRADE");
    const b = d.blockers.find((x) => x.code === "INSUFFICIENT_TECHNICAL_DATA" && x.source === "technical");
    assert.ok(b);
    assert.match(b.message, /malformed/);
  });

  it("no candles at all → INSUFFICIENT_TECHNICAL_DATA; never a TRADE", () => {
    const s = live(MIDDAY, { technical: "UNAVAILABLE", reason: "NO_CANDLES", reasonText: "No completed candles are available." });
    const d = run(s, MIDDAY);
    assert.notEqual(d.finalDecision, "TRADE");
    assert.ok(codes(d).includes("INSUFFICIENT_TECHNICAL_DATA"));
  });

  it("frozen engine: a STALE technical source is never a TRADE (factor unavailable → NO TRADE)", () => {
    const a = analyze(live(MIDDAY, { technical: "STALE", reason: "STALE_CANDLE" }), MIDDAY, RISK, undefined);
    assert.notEqual(a.status, "TRADE");
    assert.equal(a.factors.find((f) => f.key === "technical")!.available, false);
  });

  it("the NO_INTRADAY_CANDLES blocker is in the 'Technical warmup' stage", () => {
    const now = new Date("2026-10-05T03:50:00Z");
    const d = run(live(now, { technical: "UNAVAILABLE", reason: "NO_INTRADAY_CANDLES", reasonText: "Market open but no completed intraday candle for today yet." }), now);
    const stage = d.checks.find((c) => c.stage === 4)!;
    assert.equal(stage.status, "BLOCKED");
  });
});
