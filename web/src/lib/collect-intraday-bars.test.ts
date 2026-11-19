// Research-only stock collector: tests run the real core module with fixtures. No network, no production data.
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AuthError, candleRequestUrl, fetchWithRetry, normalizeCandle, normalizeCandles, resolveOutDir,
  runCollection, sessionComplete, validateSession, writeDecision,
} from "../../scripts/lib/intraday-core.mjs";
import { isIsoDate, isNseEqKey, planChunks } from "./research/stockCandleRequest.ts";

const DATE = "2026-11-04";
const noSleep = async () => {};
const ist = (min: number, date = DATE) => {
  const h = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${date}T${h}:${m}:00+05:30`;
};
// Regular session 09:15..15:29 inclusive = 375 one-minute bars, as Upstox returns them (newest first).
const raw = (ts: string, o = 100, h = 101, l = 99, c = 100, v = 1000) => [ts, o, h, l, c, v, 0];
const fullSession = (date = DATE, volume = 1000) =>
  Array.from({ length: 375 }, (_, i) => raw(ist(555 + i, date), 100, 101, 99, 100, volume)).reverse();
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "collector-"));
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("candle normalization", () => {
  it("maps the seven-element V3 array to named fields", () => {
    assert.deepEqual(normalizeCandle(["2026-11-04T09:15:00+05:30", 1, 2, 0.5, 1.5, 300, 9]), {
      timestamp: "2026-11-04T09:15:00+05:30", open: 1, high: 2, low: 0.5, close: 1.5, volume: 300, openInterest: 9,
    });
  });

  it("defaults openInterest to 0 and keeps zero volume as a real value", () => {
    const c = normalizeCandle(["2026-11-04T09:15:00+05:30", 1, 1, 1, 1, 0]);
    assert.equal(c?.openInterest, 0);
    assert.equal(c?.volume, 0);
  });

  it("rejects non-arrays, short arrays, bad timestamps and non-numeric fields", () => {
    assert.equal(normalizeCandle({ timestamp: "x" }), null);
    assert.equal(normalizeCandle(["2026-11-04T09:15:00+05:30", 1, 2, 3]), null);
    assert.equal(normalizeCandle(["not-a-date", 1, 2, 0, 1, 5]), null);
    assert.equal(normalizeCandle(["2026-11-04T09:15:00+05:30", "1", 2, 0, 1, 5]), null);
  });

  it("sorts oldest-first and counts malformed entries", () => {
    const { candles, malformed } = normalizeCandles([raw(ist(556)), ["bad"], raw(ist(555))]);
    assert.equal(malformed, 1);
    assert.deepEqual(candles.map((c) => c.timestamp), [ist(555), ist(556)]);
  });
});

describe("session validation", () => {
  it("a complete session with zero-volume bars is OK, and the zero-volume bars are reported", () => {
    const bars = fullSession();
    bars[0][5] = 0;
    bars[1][5] = 0;
    const { candles, malformed } = normalizeCandles(bars);
    const v = validateSession(candles, { date: DATE, malformed });
    assert.equal(v.status, "OK");
    assert.equal(v.zeroVolumeCount, 2);
    assert.equal(v.candleCount, 375);
  });

  it("missing bars make the session PARTIAL and report how many", () => {
    const { candles } = normalizeCandles(fullSession().slice(0, 300));
    const v = validateSession(candles, { date: DATE });
    assert.equal(v.status, "PARTIAL");
    assert.equal(v.missingBars, 75);
  });

  it("duplicate timestamps are PARTIAL", () => {
    const bars = [...fullSession(), raw(ist(555))];
    const { candles } = normalizeCandles(bars);
    const v = validateSession(candles, { date: DATE });
    assert.equal(v.status, "PARTIAL");
    assert.equal(v.duplicateCount, 1);
  });

  it("invalid OHLC and negative volume are PARTIAL", () => {
    const bad = normalizeCandles([raw(ist(555), 100, 90, 99, 100, 5)]).candles;
    assert.equal(validateSession(bad, { date: DATE }).status, "PARTIAL");
    const neg = normalizeCandles([raw(ist(555), 100, 101, 99, 100, -1)]).candles;
    assert.ok(validateSession(neg, { date: DATE }).issues.some((i) => /negative volume/.test(i)));
  });

  it("a candle dated outside the session or outside the regular window is PARTIAL", () => {
    const wrongDay = normalizeCandles([raw(ist(555, "2026-11-03"))]).candles;
    assert.equal(validateSession(wrongDay, { date: DATE }).wrongDateCount, 1);
    const late = normalizeCandles([raw(ist(16 * 60))]).candles;
    assert.equal(validateSession(late, { date: DATE }).outsideWindowCount, 1);
  });

  it("a gap longer than one minute is reported", () => {
    const { candles } = normalizeCandles([raw(ist(555)), raw(ist(560))]);
    const v = validateSession(candles, { date: DATE });
    assert.equal(v.missingIntervals, 1);
    assert.equal(v.status, "PARTIAL");
  });

  it("no candles is EMPTY, never OK", () => {
    assert.equal(validateSession([], { date: DATE }).status, "EMPTY");
  });

  it("malformed entries from the API count as invalid and cannot make a session OK", () => {
    const { candles, malformed } = normalizeCandles([...fullSession(), ["junk"]]);
    const v = validateSession(candles, { date: DATE, malformed });
    assert.equal(v.invalidCount, 1);
    assert.equal(v.status, "PARTIAL");
  });
});

describe("session completeness", () => {
  it("a past session is complete", () => assert.equal(sessionComplete("2026-11-03", "2026-11-04T06:00:00Z"), true));
  it("today before the regular close is not complete", () => assert.equal(sessionComplete(DATE, "2026-11-04T08:00:00Z"), false));
  it("today after 15:30 IST is complete", () => assert.equal(sessionComplete(DATE, "2026-11-04T10:31:00Z"), true));
  it("a future session is not complete", () => assert.equal(sessionComplete("2026-11-05", "2026-11-04T10:31:00Z"), false));
});

describe("fetch, retry and authentication", () => {
  const res = (status: number, body: unknown = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

  it("an authentication failure stops immediately with no retry", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return res(401); };
    await assert.rejects(fetchWithRetry({ url: "u", fetchImpl, sleep: noSleep }), AuthError);
    assert.equal(calls, 1);
  });

  it("a 403 is also treated as authentication failure", async () => {
    await assert.rejects(fetchWithRetry({ url: "u", fetchImpl: async () => res(403), sleep: noSleep }), AuthError);
  });

  it("transient upstream errors are retried a bounded number of times", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return res(502); };
    await assert.rejects(fetchWithRetry({ url: "u", fetchImpl, attempts: 3, sleep: noSleep }), /HTTP 502/);
    assert.equal(calls, 3);
  });

  it("a transient failure followed by success returns the body", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return calls === 1 ? res(502) : res(200, { candles: [] }); };
    assert.deepEqual(await fetchWithRetry({ url: "u", fetchImpl, attempts: 3, sleep: noSleep }), { candles: [] });
    assert.equal(calls, 2);
  });

  it("the request goes only to the research candle route with an encoded key and interval 1", () => {
    const url = candleRequestUrl("http://localhost:3123", "NSE_EQ|INE002A01018", "1");
    assert.equal(url, "http://localhost:3123/api/research/stock-candles?instrumentKey=NSE_EQ%7CINE002A01018&interval=1");
    assert.ok(!/paper|monitor|collect\?|order/i.test(url));
  });
});

describe("dry-run and storage safety", () => {
  const constituents = [
    { symbol: "AAA", instrumentKey: "NSE_EQ|INE000000001" },
    { symbol: "BBB", instrumentKey: "NSE_EQ|INE000000002" },
  ];
  const trap = async () => { throw new Error("network must not be used in dry-run"); };

  it("dry-run makes zero requests and writes nothing", async () => {
    const outDir = tmpDir();
    const r = await runCollection({ constituents, date: DATE, nowIso: "2026-11-04T10:31:00Z", live: false, base: "http://x", outDir, fetchImpl: trap, sleep: noSleep });
    assert.equal(r.mode, "DRY_RUN");
    assert.deepEqual((r.stocks as { action: string }[]).map((s) => s.action), ["WOULD_FETCH", "WOULD_FETCH"]);
    assert.deepEqual(fs.readdirSync(outDir), []);
  });

  it("an existing record is never overwritten or re-fetched", async () => {
    const outDir = tmpDir();
    const existing = path.join(outDir, `${DATE}-AAA.json`);
    fs.writeFileSync(existing, "ORIGINAL");
    const calls: string[] = [];
    const fetchImpl = async (url: string) => { calls.push(url); return { status: 200, ok: true, json: async () => ({ candles: fullSession() }) }; };
    const r = await runCollection({ constituents, date: DATE, nowIso: "2026-11-04T10:31:00Z", live: true, base: "http://x", outDir, fetchImpl, sleep: noSleep });
    assert.equal(fs.readFileSync(existing, "utf8"), "ORIGINAL");
    assert.equal(calls.length, 1);
    assert.ok(calls[0].includes("NSE_EQ%7CINE000000002"));
    assert.equal((r.stocks[0] as { action: string }).action, "SKIP_EXISTS");
    assert.equal(writeDecision(existing), "SKIP_EXISTS");
  });

  it("an authentication failure aborts the run and writes no records", async () => {
    const outDir = tmpDir();
    const fetchImpl = async () => ({ status: 401, ok: false, json: async () => ({}) });
    const r = await runCollection({ constituents, date: DATE, nowIso: "2026-11-04T10:31:00Z", live: true, base: "http://x", outDir, fetchImpl, sleep: noSleep });
    assert.equal(r.aborted, "AUTH");
    assert.deepEqual(fs.readdirSync(outDir), []);
  });

  it("a session that has not closed is not collected", async () => {
    const r = await runCollection({ constituents, date: DATE, nowIso: "2026-11-04T05:00:00Z", live: true, base: "http://x", outDir: tmpDir(), fetchImpl: trap, sleep: noSleep });
    assert.equal(r.aborted, "SESSION_NOT_COMPLETE");
  });

  it("live collection writes a status per stock and counts it", async () => {
    const outDir = tmpDir();
    const fetchImpl = async (url: string) => ({
      status: 200, ok: true,
      json: async () => ({ candles: url.includes("INE000000001") ? fullSession() : fullSession().slice(0, 10) }),
    });
    const r = await runCollection({ constituents, date: DATE, nowIso: "2026-11-04T10:31:00Z", live: true, base: "http://x", outDir, fetchImpl, sleep: noSleep });
    assert.equal(r.counts.OK, 1);
    assert.equal(r.counts.PARTIAL, 1);
    const rec = JSON.parse(fs.readFileSync(path.join(outDir, `${DATE}-BBB.json`), "utf8"));
    assert.equal(rec.status, "PARTIAL");
    assert.equal(rec.provider, "upstox");
  });

  it("resolves storage under .research-data and never under .data", () => {
    const out = resolveOutDir("/tmp/project");
    assert.equal(out, "/tmp/project/.research-data/intraday-bars");
    assert.ok(!out.split(path.sep).includes(".data"));
  });

  it("the collector source never references paper-trading or order endpoints", () => {
    const sources = ["scripts/collect-intraday-bars.mjs", "scripts/lib/intraday-core.mjs"]
      .map((p) => fs.readFileSync(path.join(repo, p), "utf8"));
    for (const src of sources) {
      assert.ok(!/paper-opportunities|paper-live|paper-cycle|placeOrder|\/v2\/order|\.data\//.test(src), "forbidden reference found");
    }
  });
});

describe("shared request validators", () => {
  it("accept only canonical NSE equity keys", () => {
    assert.ok(isNseEqKey("NSE_EQ|INE002A01018"));
    for (const bad of ["NSE_INDEX|Nifty 50", "BSE_EQ|INE002A01018", "NSE_EQ|ine002a01018", "../x", ""]) assert.ok(!isNseEqKey(bad), bad);
  });

  it("accept only real calendar dates", () => {
    assert.ok(isIsoDate("2026-11-04"));
    assert.ok(!isIsoDate("2026-13-40"));
    assert.ok(!isIsoDate("2026/11/04"));
  });

  it("plan non-overlapping chunks of at most 28 days covering the whole range", () => {
    const chunks = planChunks("2026-08-06", "2026-11-03");
    assert.equal(chunks.length, 4);
    assert.equal(chunks[0].from, "2026-08-06");
    assert.equal(chunks[chunks.length - 1].to, "2026-11-03");
    for (let i = 1; i < chunks.length; i++) assert.ok(chunks[i].from > chunks[i - 1].to);
  });
});
