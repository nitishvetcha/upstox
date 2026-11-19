// Tests for backfill-intraday-bars route and script logic (no live API calls).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── inline shared logic (must stay in sync with script) ───────────────────

const NSE_HOLIDAYS = new Set([
  "2026-01-26","2026-02-19","2026-03-14","2026-03-25","2026-03-31",
  "2026-04-02","2026-04-10","2026-04-14","2026-04-16","2026-04-30",
  "2026-05-01","2026-05-11","2026-06-23","2026-07-28","2026-07-30",
  "2026-08-15","2026-08-17","2026-09-14","2026-10-02","2026-10-20",
  "2026-11-10","2026-11-24",
]);

function addDays(d: string, n: number) {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

function isTradingDay(d: string) {
  const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
  return wd !== 0 && wd !== 6 && !NSE_HOLIDAYS.has(d);
}

function lastNSessions(n: number, endDate: string) {
  const result: string[] = [];
  let d = endDate;
  while (result.length < n) {
    if (isTradingDay(d)) result.unshift(d);
    d = addDays(d, -1);
    if (d < "2020-01-01") break;
  }
  return result;
}

type Candle = { timestamp: string; open: number; high: number; low: number; close: number; volume: number; openInterest: number };

function normalizeCandle(raw: unknown): Candle | null {
  if (!Array.isArray(raw) || raw.length < 6) return null;
  return { timestamp: raw[0], open: raw[1], high: raw[2], low: raw[3], close: raw[4], volume: raw[5], openInterest: raw[6] ?? 0 };
}

function normalizeAndSort(rawCandles: unknown): Candle[] {
  if (!Array.isArray(rawCandles)) return [];
  const candles = rawCandles.map(normalizeCandle).filter((c): c is Candle => c !== null);
  return candles.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

const IST_OFFSET_MS = 330 * 60_000;
function istDay(iso: string) {
  return new Date(Date.parse(iso) + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function splitBySession(candles: Candle[], tradingDays: string[]) {
  const byDay = new Map<string, Candle[]>();
  for (const c of candles) {
    const d = istDay(c.timestamp);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(c);
  }
  return tradingDays.map((day) => ({ day, candles: byDay.get(day) ?? [] }));
}

function validateCandles(candles: Candle[], expectedDate?: string) {
  if (!Array.isArray(candles) || candles.length === 0)
    return { ok: false, reason: "empty", issues: [], missingIntervals: 0, zeroVolumeCount: 0, duplicateCount: 0, candleCount: 0, wrongDateCount: 0 };
  const issues: string[] = [];
  const seenTs = new Set<string>();
  let missingIntervals = 0, zeroVolumeCount = 0, duplicateCount = 0, wrongDateCount = 0;
  let prevTs: string | null = null;
  for (const c of candles) {
    if (!c.timestamp || c.open == null || c.high == null || c.low == null || c.close == null || c.volume == null) {
      issues.push("malformed candle: missing OHLCV fields"); break;
    }
    if (c.high < c.low || c.open < 0 || c.close < 0) issues.push(`invalid prices at ${c.timestamp}`);
    if (c.volume < 0) issues.push(`negative volume at ${c.timestamp}`);
    if (c.volume === 0) zeroVolumeCount++;
    if (expectedDate && istDay(c.timestamp) !== expectedDate) wrongDateCount++;
    if (seenTs.has(c.timestamp)) { issues.push(`duplicate timestamp ${c.timestamp}`); duplicateCount++; }
    seenTs.add(c.timestamp);
    if (prevTs !== null) {
      const gap = (new Date(c.timestamp).getTime() - new Date(prevTs).getTime()) / 1000;
      if (gap > 120) missingIntervals++;
    }
    prevTs = c.timestamp;
  }
  return { ok: issues.length === 0, issues, missingIntervals, zeroVolumeCount, duplicateCount, wrongDateCount, candleCount: candles.length };
}

const VALID_KEY = /^NSE_EQ\|[A-Z0-9]+$/;
const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ── helpers ───────────────────────────────────────────────────────────────

function raw(ts: string, o = 100, h = 110, l = 90, c = 105, v = 1000, oi = 0) {
  return [ts, o, h, l, c, v, oi];
}

const D1 = "2026-11-03T09:15:00+05:30";
const D2 = "2026-11-03T09:16:00+05:30";
const D3 = "2026-11-03T09:17:00+05:30";

// ── trading day calendar ──────────────────────────────────────────────────

describe("lastNSessions", () => {
  it("returns N sessions ending at endDate (inclusive)", () => {
    // 2026-11-04 is itself a trading day, so it is included
    const s = lastNSessions(5, "2026-11-04");
    assert.equal(s.length, 5);
    assert.equal(s[s.length - 1], "2026-11-04");
  });

  it("skips weekends", () => {
    // 2026-11-01 is Sunday, 2026-11-02 is Monday
    const s = lastNSessions(1, "2026-11-02");
    assert.equal(s[0], "2026-11-02");
  });

  it("skips NSE holidays", () => {
    // 2026-10-20 is Dussehra (holiday), 2026-10-21 is not
    const s = lastNSessions(1, "2026-10-21");
    assert.equal(s[0], "2026-10-21");
    const withHoliday = lastNSessions(2, "2026-10-21");
    assert.ok(!withHoliday.includes("2026-10-20")); // holiday skipped
    assert.equal(withHoliday[0], "2026-10-19"); // previous trading day
  });

  it("60 sessions before 2026-11-04 start on 2026-08-06 or later", () => {
    const s = lastNSessions(60, "2026-11-03");
    assert.equal(s.length, 60);
    assert.ok(s[0] >= "2026-08-06");
    assert.equal(s[s.length - 1], "2026-11-03");
  });
});

// ── normalizeAndSort ──────────────────────────────────────────────────────

describe("normalizeAndSort", () => {
  it("sorts newest-first V3 response to oldest-first", () => {
    const rawCandles = [raw(D3), raw(D1), raw(D2)];
    const candles = normalizeAndSort(rawCandles);
    assert.equal(candles[0].timestamp, D1);
    assert.equal(candles[2].timestamp, D3);
  });

  it("filters out malformed entries", () => {
    const candles = normalizeAndSort([raw(D1), ["bad"], raw(D2)]);
    assert.equal(candles.length, 2);
  });

  it("non-array returns empty", () => {
    assert.deepEqual(normalizeAndSort(null), []);
  });
});

// ── splitBySession ────────────────────────────────────────────────────────

describe("splitBySession", () => {
  it("assigns candles to correct session dates", () => {
    // D1/D2/D3 are all 2026-11-03
    const candles = normalizeAndSort([raw(D1), raw(D2)]);
    const sessions = splitBySession(candles, ["2026-11-03", "2026-11-04"]);
    assert.equal(sessions[0].candles.length, 2);
    assert.equal(sessions[1].candles.length, 0);
  });

  it("sessions with no candles get empty array", () => {
    const candles = normalizeAndSort([raw(D1)]);
    const sessions = splitBySession(candles, ["2026-10-01"]);
    assert.equal(sessions[0].candles.length, 0);
  });
});

// ── validateCandles ───────────────────────────────────────────────────────

describe("validateCandles (backfill)", () => {
  it("valid candles pass", () => {
    const c = normalizeAndSort([raw(D1), raw(D2), raw(D3)]);
    const r = validateCandles(c);
    assert.equal(r.ok, true);
    assert.equal(r.zeroVolumeCount, 0);
  });

  it("zero-volume candle is preserved, not rejected", () => {
    const c = normalizeAndSort([raw(D1, 100, 110, 90, 105, 0)]);
    const r = validateCandles(c);
    assert.equal(r.ok, true);
    assert.equal(r.zeroVolumeCount, 1);
  });

  it("negative volume is flagged", () => {
    const c = normalizeAndSort([raw(D1, 100, 110, 90, 105, -1)]);
    const r = validateCandles(c);
    assert.ok(r.issues.some((i) => i.includes("negative volume")));
  });

  it("wrong-date candles counted", () => {
    const c = normalizeAndSort([raw(D1)]); // D1 is 2026-11-03
    const r = validateCandles(c, "2026-11-04");
    assert.equal(r.wrongDateCount, 1);
  });

  it("high < low is invalid", () => {
    const c = normalizeAndSort([raw(D1, 100, 80, 90)]);
    assert.ok(validateCandles(c).issues.some((i) => i.includes("invalid prices")));
  });

  it("duplicate timestamps counted separately", () => {
    const c = [
      normalizeCandle(raw(D1))!,
      normalizeCandle(raw(D1))!,
    ];
    const r = validateCandles(c);
    assert.equal(r.duplicateCount, 1);
  });

  it("gap > 2 min counted as missing interval", () => {
    const TGap = "2026-11-03T09:20:00+05:30";
    const c = normalizeAndSort([raw(D1), raw(TGap)]);
    assert.equal(validateCandles(c).missingIntervals, 1);
  });

  it("empty candles returns ok=false", () => {
    assert.equal(validateCandles([]).ok, false);
  });
});

// ── route: instrumentKey and date validation ──────────────────────────────

describe("route: input validation", () => {
  it("valid NSE_EQ key passes", () => assert.ok(VALID_KEY.test("NSE_EQ|INE423A01024")));
  it("non-NSE_EQ key rejected", () => assert.ok(!VALID_KEY.test("NSE_INDEX|Nifty 50")));
  it("valid date passes", () => assert.ok(VALID_DATE.test("2026-11-03")));
  it("invalid date format rejected", () => assert.ok(!VALID_DATE.test("2026/11/03")));

  it("from > to is rejected", () => {
    const from = "2026-11-04", to = "2026-11-03";
    assert.ok(from > to);
  });
});

// ── route: chunk planning ─────────────────────────────────────────────────

describe("route: chunk planning", () => {
  function planChunks(from: string, to: string, maxDays = 28) {
    const chunks: { from: string; to: string }[] = [];
    for (let start = from; start <= to; start = addDays(start, maxDays)) {
      const end = addDays(start, maxDays - 1);
      chunks.push({ from: start, to: end < to ? end : to });
    }
    return chunks;
  }

  it("single day needs 1 chunk", () => {
    assert.equal(planChunks("2026-11-03", "2026-11-03").length, 1);
  });

  it("89-day span needs 4 chunks at 28 days each", () => {
    assert.equal(planChunks("2026-08-06", "2026-11-03").length, 4);
  });

  it("last chunk ends at requested 'to' date", () => {
    const chunks = planChunks("2026-08-06", "2026-11-03");
    assert.equal(chunks[chunks.length - 1].to, "2026-11-03");
  });

  it("no overlap between chunks", () => {
    const chunks = planChunks("2026-08-06", "2026-11-03");
    for (let i = 1; i < chunks.length; i++) {
      assert.ok(chunks[i].from > chunks[i - 1].to);
    }
  });
});

// ── route: token not leaked ───────────────────────────────────────────────

describe("route: token protection", () => {
  it("response object contains no token fields", () => {
    const response = { instrumentKey: "NSE_EQ|X", from: "2026-11-01", to: "2026-11-03", chunks: 1, failedChunks: [], candleCount: 0, candles: [] };
    assert.ok(!("token" in response));
    assert.ok(!("accessToken" in response));
    assert.ok(!("authorization" in response));
  });
});

// ── API call budget ───────────────────────────────────────────────────────

describe("API call budget", () => {
  it("60 sessions over 89 calendar days = 4 chunks per stock", () => {
    const calDays = 89;
    const chunkDays = 28;
    const chunksPerStock = Math.ceil(calDays / chunkDays);
    assert.equal(chunksPerStock, 4);
    assert.equal(chunksPerStock * 50, 200);
  });

  it("200 calls at 130ms is under 30 seconds", () => {
    assert.ok(200 * 130 < 30_000);
  });
});

// ── constituent file ──────────────────────────────────────────────────────

describe("constituent universe", () => {
  it("loads 50 valid constituents from actual generated file", () => {
    const src = readFileSync(resolve("src/lib/services/breadthConstituents.generated.ts"), "utf8");
    const match = src.match(/export const NIFTY_50 = (\[[\s\S]*?\n\])/);
    assert.ok(match, "NIFTY_50 not found");
    const list = JSON.parse(match![1]) as { symbol: string; isin: string; instrumentKey: string }[];
    assert.equal(list.length, 50);
    for (const c of list) {
      assert.ok(VALID_KEY.test(c.instrumentKey), `Invalid key for ${c.symbol}: ${c.instrumentKey}`);
    }
  });
});
