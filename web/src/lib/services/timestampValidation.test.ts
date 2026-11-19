import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tradeFreshnessOf, MIN_LTT_EPOCH_MS, FUTURE_TIMESTAMP_TOLERANCE_MS } from "../time.ts";
import { normalizeQuote } from "./upstoxMarket.ts";
import { parseLTT } from "./optionContractLTT.ts";

// Market pre-open Tuesday 09:05 IST = 03:35 UTC
const PRE_OPEN_NOW = new Date("2026-10-13T03:35:00.000Z");
// Market open Tuesday 11:00 IST = 05:30 UTC
const OPEN_NOW = new Date("2026-10-13T05:30:00.000Z");
// Market closed Tuesday 16:30 IST = 11:00 UTC
const CLOSED_NOW = new Date("2026-10-13T11:00:00.000Z");

function makeIndexRaw(ltt: unknown) {
  return {
    "NSE_INDEX:Nifty 50": {
      instrument_token: "NSE_INDEX|Nifty 50",
      last_price: 25100,
      net_change: 50,
      last_trade_time: ltt,
    },
  };
}

describe("Phase 1.7 — Future-Timestamp Guard & LTT Validation", () => {
  // ── 1. tradeFreshnessOf future-timestamp guard & exact boundary semantics ──
  describe("tradeFreshnessOf: future-timestamp guard & boundaries", () => {
    it("FT-01 timestamp 4s in future (within 5s tolerance) → LIVE, freshnessSeconds: 0", () => {
      const future4s = new Date(OPEN_NOW.getTime() + 4_000);
      const res = tradeFreshnessOf(future4s, OPEN_NOW);
      assert.equal(res.source, "LIVE");
      assert.equal(res.freshness, "LIVE");
      assert.equal(res.freshnessSeconds, 0);
    });

    it("FT-02 timestamp exactly 5s in future (at 5s tolerance boundary) → LIVE, freshnessSeconds: 0", () => {
      const future5s = new Date(OPEN_NOW.getTime() + 5_000);
      const res = tradeFreshnessOf(future5s, OPEN_NOW);
      assert.equal(res.source, "LIVE");
      assert.equal(res.freshness, "LIVE");
      assert.equal(res.freshnessSeconds, 0);
    });

    it("FT-03 timestamp 6s in future (exceeds 5s tolerance) → UNAVAILABLE / STALE, freshnessSeconds: null", () => {
      const future6s = new Date(OPEN_NOW.getTime() + 6_000);
      const res = tradeFreshnessOf(future6s, OPEN_NOW);
      assert.equal(res.source, "UNAVAILABLE");
      assert.equal(res.freshness, "STALE");
      assert.equal(res.freshnessSeconds, null);
    });

    it("FT-04 timestamp 60s in future (far exceeds tolerance) → UNAVAILABLE / STALE, freshnessSeconds: null (not clamped to 0)", () => {
      const future60s = new Date(OPEN_NOW.getTime() + 60_000);
      const res = tradeFreshnessOf(future60s, OPEN_NOW);
      assert.equal(res.source, "UNAVAILABLE");
      assert.equal(res.freshness, "STALE");
      assert.equal(res.freshnessSeconds, null);
    });

    it("FT-05 future timestamp when market CLOSED exceeds tolerance → UNAVAILABLE / STALE (fail-closed, not END_OF_DAY)", () => {
      const future6s = new Date(CLOSED_NOW.getTime() + 6_000);
      const res = tradeFreshnessOf(future6s, CLOSED_NOW);
      assert.equal(res.source, "UNAVAILABLE");
      assert.equal(res.freshness, "STALE");
      assert.equal(res.freshnessSeconds, null);
    });

    it("FT-06 future timestamps work identically with ISO string input", () => {
      const future4sIso = new Date(OPEN_NOW.getTime() + 4_000).toISOString();
      const future6sIso = new Date(OPEN_NOW.getTime() + 6_000).toISOString();

      const res4 = tradeFreshnessOf(future4sIso, OPEN_NOW);
      assert.equal(res4.source, "LIVE");
      assert.equal(res4.freshnessSeconds, 0);

      const res6 = tradeFreshnessOf(future6sIso, OPEN_NOW);
      assert.equal(res6.source, "UNAVAILABLE");
      assert.equal(res6.freshness, "STALE");
      assert.equal(res6.freshnessSeconds, null);
    });
  });

  // ── 2. tradeFreshnessOf invalid dates, lower bounds, missing timestamps ──
  describe("tradeFreshnessOf: invalid dates, lower bounds, and missing timestamps", () => {
    it("LB-01 missing / null / undefined timestamps fail-closed as UNAVAILABLE / STALE", () => {
      assert.deepEqual(tradeFreshnessOf(null, OPEN_NOW), {
        freshnessSeconds: null,
        freshness: "STALE",
        source: "UNAVAILABLE",
      });
      assert.deepEqual(tradeFreshnessOf(undefined, OPEN_NOW), {
        freshnessSeconds: null,
        freshness: "STALE",
        source: "UNAVAILABLE",
      });
      assert.deepEqual(tradeFreshnessOf("", OPEN_NOW), {
        freshnessSeconds: null,
        freshness: "STALE",
        source: "UNAVAILABLE",
      });
    });

    it("LB-02 invalid date string or invalid Date object fails-closed", () => {
      assert.deepEqual(tradeFreshnessOf("malformed-not-a-date", OPEN_NOW), {
        freshnessSeconds: null,
        freshness: "STALE",
        source: "UNAVAILABLE",
      });
      assert.deepEqual(tradeFreshnessOf(new Date("invalid"), OPEN_NOW), {
        freshnessSeconds: null,
        freshness: "STALE",
        source: "UNAVAILABLE",
      });
    });

    it("LB-03 zero and negative epoch timestamps fail-closed", () => {
      assert.deepEqual(tradeFreshnessOf(new Date(0), OPEN_NOW), {
        freshnessSeconds: null,
        freshness: "STALE",
        source: "UNAVAILABLE",
      });
      assert.deepEqual(tradeFreshnessOf(0 as unknown as string, OPEN_NOW), {
        freshnessSeconds: null,
        freshness: "STALE",
        source: "UNAVAILABLE",
      });
      assert.deepEqual(tradeFreshnessOf(new Date(-1000), OPEN_NOW), {
        freshnessSeconds: null,
        freshness: "STALE",
        source: "UNAVAILABLE",
      });
    });

    it("LB-04 implausible timestamps before 2020-01-01 fail-closed", () => {
      // 1 ms before 2020-01-01T00:00:00.000Z
      const pre2020 = new Date(MIN_LTT_EPOCH_MS - 1);
      assert.deepEqual(tradeFreshnessOf(pre2020, OPEN_NOW), {
        freshnessSeconds: null,
        freshness: "STALE",
        source: "UNAVAILABLE",
      });
    });

    it("LB-05 seconds-vs-milliseconds confusion is detected and rejected", () => {
      // Current era in seconds (~1.79e9), which in epoch ms is 1970
      const secondsTs = 1_776_000_000;
      assert.ok(secondsTs < MIN_LTT_EPOCH_MS);
      assert.deepEqual(tradeFreshnessOf(new Date(secondsTs), OPEN_NOW), {
        freshnessSeconds: null,
        freshness: "STALE",
        source: "UNAVAILABLE",
      });
      assert.deepEqual(tradeFreshnessOf(secondsTs as unknown as string, OPEN_NOW), {
        freshnessSeconds: null,
        freshness: "STALE",
        source: "UNAVAILABLE",
      });
    });

    it("LB-06 plausible valid epoch millisecond is accepted as LIVE", () => {
      const validMs = OPEN_NOW.getTime() - 10_000; // 10s ago
      const res = tradeFreshnessOf(new Date(validMs), OPEN_NOW);
      assert.equal(res.source, "LIVE");
      assert.equal(res.freshness, "LIVE");
      assert.equal(res.freshnessSeconds, 10);
    });
  });

  // ── 3. normalizeQuote LTT validation ───────────────────────────────────────
  describe("normalizeQuote: LTT lower-bound and unit validation", () => {
    it("NQ-01 valid epoch milliseconds → ISO string", () => {
      const ms = OPEN_NOW.getTime() - 5_000;
      const q = normalizeQuote(makeIndexRaw(ms), "nifty");
      assert.ok(q.lastTradeTime !== null);
      assert.equal(q.lastTradeTime, new Date(ms).toISOString());
    });

    it("NQ-02 numeric string of valid epoch milliseconds → ISO string", () => {
      const ms = OPEN_NOW.getTime() - 5_000;
      const q = normalizeQuote(makeIndexRaw(String(ms)), "nifty");
      assert.ok(q.lastTradeTime !== null);
      assert.equal(q.lastTradeTime, new Date(ms).toISOString());
    });

    it("NQ-03 seconds-instead-of-milliseconds → null (not converted to 1970 date)", () => {
      const seconds = Math.floor((OPEN_NOW.getTime() - 5_000) / 1000);
      const q = normalizeQuote(makeIndexRaw(seconds), "nifty");
      assert.equal(q.lastTradeTime, null);
    });

    it("NQ-04 zero → null", () => {
      const q = normalizeQuote(makeIndexRaw(0), "nifty");
      assert.equal(q.lastTradeTime, null);
    });

    it("NQ-05 negative value → null", () => {
      const q = normalizeQuote(makeIndexRaw(-5000), "nifty");
      assert.equal(q.lastTradeTime, null);
    });

    it("NQ-06 pre-2020 timestamp → null", () => {
      const q = normalizeQuote(makeIndexRaw(MIN_LTT_EPOCH_MS - 1000), "nifty");
      assert.equal(q.lastTradeTime, null);
    });

    it("NQ-07 malformed string → null", () => {
      const q = normalizeQuote(makeIndexRaw("not-a-number"), "nifty");
      assert.equal(q.lastTradeTime, null);
    });

    it("NQ-08 missing / null / undefined field → null", () => {
      assert.equal(normalizeQuote(makeIndexRaw(null), "nifty").lastTradeTime, null);
      assert.equal(normalizeQuote(makeIndexRaw(undefined), "nifty").lastTradeTime, null);
      const rawNoLtt = {
        "NSE_INDEX:Nifty 50": {
          instrument_token: "NSE_INDEX|Nifty 50",
          last_price: 25100,
          net_change: 50,
        },
      };
      assert.equal(normalizeQuote(rawNoLtt, "nifty").lastTradeTime, null);
    });
  });

  // ── 4. parseLTT lower-bound and unit validation ────────────────────────────
  describe("parseLTT: lower-bound and unit validation", () => {
    it("PL-01 valid epoch milliseconds → ISO string", () => {
      const ms = OPEN_NOW.getTime() - 5_000;
      const res = parseLTT({ last_trade_time: ms });
      assert.ok(res !== null);
      assert.equal(res, new Date(ms).toISOString());
    });

    it("PL-02 valid numeric string milliseconds → ISO string", () => {
      const ms = OPEN_NOW.getTime() - 5_000;
      const res = parseLTT({ last_trade_time: String(ms) });
      assert.ok(res !== null);
      assert.equal(res, new Date(ms).toISOString());
    });

    it("PL-03 seconds-instead-of-milliseconds → null", () => {
      const seconds = Math.floor((OPEN_NOW.getTime() - 5_000) / 1000);
      assert.equal(parseLTT({ last_trade_time: seconds }), null);
    });

    it("PL-04 zero → null", () => {
      assert.equal(parseLTT({ last_trade_time: 0 }), null);
    });

    it("PL-05 negative value → null", () => {
      assert.equal(parseLTT({ last_trade_time: -1_577_836_800_000 }), null);
    });

    it("PL-06 pre-2020 timestamp → null", () => {
      assert.equal(parseLTT({ last_trade_time: MIN_LTT_EPOCH_MS - 1 }), null);
    });

    it("PL-07 malformed string → null", () => {
      assert.equal(parseLTT({ last_trade_time: "corrupt_timestamp" }), null);
    });

    it("PL-08 missing field / null / undefined → null", () => {
      assert.equal(parseLTT({ last_trade_time: null }), null);
      assert.equal(parseLTT({ last_trade_time: undefined }), null);
      assert.equal(parseLTT({}), null);
      assert.equal(parseLTT(null), null);
      assert.equal(parseLTT(undefined), null);
    });
  });

  // ── 5. tradeFreshnessOf invalid reference-time (now) guard ────────────────
  describe("tradeFreshnessOf: invalid reference-time (now) guard", () => {
    const validLtt = "2026-10-13T05:29:50.000Z"; // 10s before OPEN_NOW

    it("IN-01 invalid Date object as now → fail-closed UNAVAILABLE / STALE (no throw)", () => {
      const invalidNow = new Date("invalid");
      assert.doesNotThrow(() => {
        const res = tradeFreshnessOf(validLtt, invalidNow);
        assert.deepEqual(res, {
          freshnessSeconds: null,
          freshness: "STALE",
          source: "UNAVAILABLE",
        });
      });
    });

    it("IN-02 null as now at runtime → fail-closed UNAVAILABLE / STALE (no throw)", () => {
      assert.doesNotThrow(() => {
        const res = tradeFreshnessOf(validLtt, null as unknown as Date);
        assert.deepEqual(res, {
          freshnessSeconds: null,
          freshness: "STALE",
          source: "UNAVAILABLE",
        });
      });
    });

    it("IN-03 undefined as now at runtime → fail-closed UNAVAILABLE / STALE (no throw)", () => {
      assert.doesNotThrow(() => {
        const res = tradeFreshnessOf(validLtt, undefined as unknown as Date);
        assert.deepEqual(res, {
          freshnessSeconds: null,
          freshness: "STALE",
          source: "UNAVAILABLE",
        });
      });
    });

    it("IN-04 non-Date types as now at runtime → fail-closed UNAVAILABLE / STALE (no throw)", () => {
      assert.doesNotThrow(() => {
        const res1 = tradeFreshnessOf(validLtt, "2026-10-13" as unknown as Date);
        assert.deepEqual(res1, {
          freshnessSeconds: null,
          freshness: "STALE",
          source: "UNAVAILABLE",
        });
        const res2 = tradeFreshnessOf(validLtt, {} as unknown as Date);
        assert.deepEqual(res2, {
          freshnessSeconds: null,
          freshness: "STALE",
          source: "UNAVAILABLE",
        });
      });
    });

    it("IN-05 valid now in OPEN session → existing behavior preserved", () => {
      const ltt10s = new Date(OPEN_NOW.getTime() - 10_000).toISOString();
      const res1 = tradeFreshnessOf(ltt10s, OPEN_NOW);
      assert.equal(res1.source, "LIVE");
      assert.equal(res1.freshness, "LIVE");
      assert.equal(res1.freshnessSeconds, 10);

      const ltt45s = new Date(OPEN_NOW.getTime() - 45_000).toISOString();
      const res2 = tradeFreshnessOf(ltt45s, OPEN_NOW);
      assert.equal(res2.source, "LIVE");
      assert.equal(res2.freshness, "AGING");
      assert.equal(res2.freshnessSeconds, 45);

      const ltt150s = new Date(OPEN_NOW.getTime() - 150_000).toISOString();
      const res3 = tradeFreshnessOf(ltt150s, OPEN_NOW);
      assert.equal(res3.source, "STALE");
      assert.equal(res3.freshness, "STALE");
      assert.equal(res3.freshnessSeconds, 150);
    });

    it("IN-06 valid now in PRE-OPEN session → existing behavior preserved (10s old is LIVE)", () => {
      const ltt10s = new Date(PRE_OPEN_NOW.getTime() - 10_000).toISOString();
      const res = tradeFreshnessOf(ltt10s, PRE_OPEN_NOW);
      assert.equal(res.source, "LIVE");
      assert.equal(res.freshness, "LIVE");
      assert.equal(res.freshnessSeconds, 10);
    });

    it("IN-07 valid now in CLOSED session → existing behavior preserved (today is END_OF_DAY, prior day is STALE)", () => {
      // Trade at 15:00 IST today
      const todayLtt = "2026-10-13T09:30:00.000Z";
      const resToday = tradeFreshnessOf(todayLtt, CLOSED_NOW);
      assert.equal(resToday.source, "END_OF_DAY");
      assert.equal(resToday.freshness, "END_OF_DAY");
      assert.equal(resToday.freshnessSeconds, 5400);

      // Trade yesterday
      const yesterdayLtt = "2026-10-12T09:30:00.000Z";
      const resYesterday = tradeFreshnessOf(yesterdayLtt, CLOSED_NOW);
      assert.equal(resYesterday.source, "STALE");
      assert.equal(resYesterday.freshness, "STALE");
      assert.equal(resYesterday.freshnessSeconds, 91800);
    });
  });
});
