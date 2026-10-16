// Phase 30.4 — Prototype option-contract LTT association tests.
// All fixtures are deterministic. Not live-market validation.
// Tests verify freshness classification, key matching, fail-close behaviour,
// and feature-flag default. No real orders. No collector bypass.

import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";

import {
  OPTION_QUOTE_LTT_ENABLED,
  buildChainLTTAudit,
  extractEvaluationKeys,
  parseLTT,
} from "./services/optionContractLTT.ts";
import { FILTERS, OPPORTUNITY_ENGINE_VERSION } from "./engine/opportunityEngine.ts";
import type { OptionRow } from "./types.ts";

// ── Shared fixtures ────────────────────────────────────────────────────────────

// 10:30 IST = 05:00 UTC — market OPEN
const OPEN_NOW = new Date("2026-10-13T05:00:00.000Z");
// 17:00 IST = 11:30 UTC — market CLOSED
const CLOSED_NOW = new Date("2026-10-13T11:30:00.000Z");

const SPOT = 22700;
const ATM = 22700;

function makeRow(
  strike: number,
  ceKey: string | null,
  peKey: string | null,
  opts: { ltp?: number; iv?: number | null; delta?: number | null } = {},
): OptionRow {
  const ltp = opts.ltp ?? 100;
  const iv = opts.iv !== undefined ? opts.iv : 15;
  const delta = opts.delta !== undefined ? opts.delta : 0.5;
  // Both sides use the same LTP so fixture quote responses (also defaulting to 100) are consistent.
  return {
    strike,
    call: { ltp, bid: ltp - 0.5, ask: ltp + 0.5, oi: 10000, chgOi: 100, volume: 500, iv, delta, gamma: 0.001, theta: -5, vega: 8, instrumentKey: ceKey },
    put: { ltp, bid: ltp - 0.5, ask: ltp + 0.5, oi: 12000, chgOi: 200, volume: 600, iv, delta: delta ? -delta : null, gamma: 0.001, theta: -5, vega: 8, instrumentKey: peKey },
  };
}

function makeChain(strikesFromAtm = 3): OptionRow[] {
  const rows: OptionRow[] = [];
  for (let i = -strikesFromAtm; i <= strikesFromAtm; i++) {
    rows.push(makeRow(ATM + i * 50, `CE|${ATM + i * 50}`, `PE|${ATM + i * 50}`));
  }
  return rows;
}

// Quote response body (Upstox envelope already unwrapped by get())
function makeQuoteData(keys: string[], overrides: Record<string, Partial<{
  last_price: number;
  last_trade_time: number | null;
  instrument_token: string;
}>> = {}): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const key of keys) {
    const ov = overrides[key] ?? {};
    const symbolKey = key.replace("|", ":").replace(/(\d+)$/, "SYM$1");
    out[symbolKey] = {
      instrument_token: ov.instrument_token ?? key,
      last_price: ov.last_price ?? 100,
      last_trade_time: ov.last_trade_time !== undefined ? ov.last_trade_time : OPEN_NOW.getTime() - 5_000,
      oi: 10000,
      volume: 500,
      net_change: 1,
    };
  }
  return out;
}

function stubFetch(quoteData: Record<string, Record<string, unknown>>) {
  globalThis.fetch = (async () =>
    Response.json({ status: "success", data: quoteData })
  ) as typeof fetch;
}

function stubFetchError(status: number, message: string) {
  globalThis.fetch = (async () =>
    Response.json({ status: "error", errors: [{ message }] }, { status })
  ) as typeof fetch;
}

function stubFetchTimeout() {
  const err = new Error("The operation timed out");
  err.name = "TimeoutError";
  globalThis.fetch = (async () => { throw err; }) as typeof fetch;
}

const realFetch = globalThis.fetch;
const realWarn = console.warn;
const realInfo = console.info;
beforeEach(() => { console.warn = () => {}; console.info = () => {}; });
afterEach(() => { globalThis.fetch = realFetch; console.warn = realWarn; console.info = realInfo; });

// ── FF30: Feature flag ─────────────────────────────────────────────────────────

describe("FF30 — Feature flag", () => {
  it("FF30-01 OPTION_QUOTE_LTT_ENABLED is false by default", () => {
    assert.equal(OPTION_QUOTE_LTT_ENABLED, false);
  });
});

// ── KX30: Key extraction ───────────────────────────────────────────────────────

describe("KX30 — extractEvaluationKeys", () => {
  it("KX30-01 extracts CE and PE keys for ATM ± maxStrikesAtm (7) strikes", () => {
    const rows = makeChain(8); // 17 strikes
    const keys = extractEvaluationKeys(rows, SPOT);
    // ATM ± 7 = 15 strikes × 2 sides = 30 keys
    assert.equal(keys.length, 30);
  });

  it("KX30-02 does not include strikes beyond maxStrikesAtm", () => {
    const rows = makeChain(10); // 21 strikes; outer 3 each side should be excluded
    const keys = extractEvaluationKeys(rows, SPOT);
    assert.equal(keys.length, 30); // ATM ± 7 = 15 strikes × 2
  });

  it("KX30-03 empty rows → empty keys", () => {
    assert.deepEqual(extractEvaluationKeys([], SPOT), []);
  });

  it("KX30-04 null instrumentKey on one side is skipped", () => {
    const rows = [makeRow(ATM, "CE|22700", null)]; // no PE key
    const keys = extractEvaluationKeys(rows, SPOT);
    assert.equal(keys.length, 1);
    assert.ok(keys.includes("CE|22700"));
  });

  it("KX30-05 duplicate instrument keys are deduplicated", () => {
    // Two rows with the same CE key (shouldn't happen in practice but must not double-count)
    const rows = [makeRow(ATM, "CE|SAME", "PE|1"), makeRow(ATM + 50, "CE|SAME", "PE|2")];
    const keys = extractEvaluationKeys(rows, SPOT);
    const ceCount = keys.filter((k) => k === "CE|SAME").length;
    assert.equal(ceCount, 1);
  });
});

// ── PT30: parseLTT ────────────────────────────────────────────────────────────

describe("PT30 — parseLTT", () => {
  it("PT30-01 valid epoch ms → ISO string", () => {
    const ms = OPEN_NOW.getTime() - 5_000;
    const result = parseLTT({ last_trade_time: ms });
    assert.ok(result !== null);
    assert.ok(result.endsWith("Z"));
    assert.ok(Math.abs(new Date(result).getTime() - ms) < 1000);
  });

  it("PT30-02 null → null", () => {
    assert.equal(parseLTT({ last_trade_time: null }), null);
  });

  it("PT30-03 undefined → null", () => {
    assert.equal(parseLTT({}), null);
  });

  it("PT30-04 zero → null", () => {
    assert.equal(parseLTT({ last_trade_time: 0 }), null);
  });

  it("PT30-05 non-numeric string → null", () => {
    assert.equal(parseLTT({ last_trade_time: "bad-date" }), null);
  });

  it("PT30-06 implausible timestamp (before 2020) → null", () => {
    assert.equal(parseLTT({ last_trade_time: 1_000_000 }), null); // 1970-era seconds
  });

  it("PT30-07 string epoch ms is parsed correctly", () => {
    const ms = OPEN_NOW.getTime() - 10_000;
    const result = parseLTT({ last_trade_time: String(ms) });
    assert.ok(result !== null);
  });
});

// ── FR30B: Freshness classification ──────────────────────────────────────────

describe("FR30B — tradeFreshness classification", () => {
  it("FR30B-01 LTT 5s ago, market OPEN → LIVE, eligible", async () => {
    const rows = makeChain(1);
    const keys = extractEvaluationKeys(rows, SPOT);
    stubFetch(makeQuoteData(keys, {})); // default: LTT = OPEN_NOW - 5s
    const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "tok", OPEN_NOW);
    assert.equal(audit.error, null);
    assert.ok(audit.liveCount > 0);
    for (const c of audit.contracts) {
      assert.equal(c.tradeFreshness, "LIVE");
      assert.equal(c.eligible, true);
      assert.equal(c.ivFreshnessEvidence, "NONE");
    }
  });

  it("FR30B-02 LTT 31s ago, market OPEN → AGING, eligible", async () => {
    const rows = makeChain(1);
    const keys = extractEvaluationKeys(rows, SPOT);
    const ltt = OPEN_NOW.getTime() - 31_000;
    stubFetch(makeQuoteData(keys, Object.fromEntries(keys.map((k) => [k, { last_trade_time: ltt }]))));
    const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "tok", OPEN_NOW);
    assert.ok(audit.agingCount > 0);
    for (const c of audit.contracts) {
      assert.equal(c.tradeFreshness, "AGING");
      assert.equal(c.eligible, true);
    }
  });

  it("FR30B-03 LTT 121s ago, market OPEN → STALE, not eligible", async () => {
    const rows = makeChain(1);
    const keys = extractEvaluationKeys(rows, SPOT);
    const ltt = OPEN_NOW.getTime() - 121_000;
    stubFetch(makeQuoteData(keys, Object.fromEntries(keys.map((k) => [k, { last_trade_time: ltt }]))));
    const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "tok", OPEN_NOW);
    for (const c of audit.contracts) {
      assert.equal(c.tradeFreshness, "STALE");
      assert.equal(c.eligible, false);
      assert.ok(c.ineligibleReason?.includes("STALE"));
    }
  });

  it("FR30B-04 null LTT → UNAVAILABLE, not eligible", async () => {
    const rows = makeChain(1);
    const keys = extractEvaluationKeys(rows, SPOT);
    stubFetch(makeQuoteData(keys, Object.fromEntries(keys.map((k) => [k, { last_trade_time: null }]))));
    const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "tok", OPEN_NOW);
    for (const c of audit.contracts) {
      assert.equal(c.tradeFreshness, "UNAVAILABLE");
      assert.equal(c.eligible, false);
      assert.ok(c.ineligibleReason?.includes("last_trade_time"));
    }
  });

  it("FR30B-05 market CLOSED + today LTT → STALE, not eligible", async () => {
    // CLOSED + LTT from today → END_OF_DAY → maps to STALE in audit
    const rows = makeChain(1);
    const keys = extractEvaluationKeys(rows, SPOT);
    const ltt = new Date("2026-10-13T08:00:00.000Z").getTime(); // 13:30 IST — today's session
    stubFetch(makeQuoteData(keys, Object.fromEntries(keys.map((k) => [k, { last_trade_time: ltt }]))));
    const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "tok", CLOSED_NOW);
    for (const c of audit.contracts) {
      assert.notEqual(c.tradeFreshness, "LIVE");
      assert.equal(c.eligible, false);
    }
  });
});

// ── PB30: Partial / failed batch ──────────────────────────────────────────────

describe("PB30 — Partial and failed batch handling", () => {
  it("PB30-01 key missing from batch response → missingKeys populated, eligible=false", async () => {
    const rows = makeChain(1);
    const keys = extractEvaluationKeys(rows, SPOT);
    // Return only the first key
    const partial = makeQuoteData([keys[0]]);
    stubFetch(partial);
    const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "tok", OPEN_NOW);
    assert.ok(audit.missingKeys.length > 0);
    const missing = audit.contracts.find((c) => audit.missingKeys.includes(c.instrumentKey));
    assert.ok(missing);
    assert.equal(missing!.eligible, false);
    assert.equal(missing!.ineligibleReason, "quote not returned in batch");
  });

  it("PB30-02 auth error (401) → error populated, all contracts ineligible", async () => {
    stubFetchError(401, "UDAPI100068");
    const rows = makeChain(1);
    const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "tok", OPEN_NOW);
    assert.ok(audit.error !== null);
    assert.equal(audit.eligibleCount, 0);
    for (const c of audit.contracts) assert.equal(c.eligible, false);
  });

  it("PB30-03 timeout → error populated, all contracts ineligible", async () => {
    stubFetchTimeout();
    const rows = makeChain(1);
    const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "tok", OPEN_NOW);
    assert.ok(audit.error !== null);
    assert.equal(audit.eligibleCount, 0);
  });

  it("PB30-04 empty chain → no keys, error message, no fetch attempt", async () => {
    let fetchCalled = false;
    globalThis.fetch = (async () => { fetchCalled = true; return new Response("", { status: 200 }); }) as typeof fetch;
    const audit = await buildChainLTTAudit([], SPOT, "nifty", "tok", OPEN_NOW);
    assert.equal(audit.requestedKeys, 0);
    assert.ok(audit.error?.includes("no instrument keys"));
    assert.equal(fetchCalled, false);
  });
});

// ── KM30: Key matching ────────────────────────────────────────────────────────

describe("KM30 — Key matching (instrument_token join)", () => {
  it("KM30-01 response with symbol-based object key but correct instrument_token → matched", async () => {
    // Upstox returns NSE_FO:NIFTY...CE as the object key, but instrument_token = NSE_FO|44620
    const rows = [makeRow(ATM, "NSE_FO|44620", "NSE_FO|44621")];
    const quoteData: Record<string, Record<string, unknown>> = {
      "NSE_FO:NIFTY26O1322700CE": {
        instrument_token: "NSE_FO|44620",
        last_price: 100,
        last_trade_time: OPEN_NOW.getTime() - 5_000,
      },
      "NSE_FO:NIFTY26O1322700PE": {
        instrument_token: "NSE_FO|44621",
        last_price: 105,
        last_trade_time: OPEN_NOW.getTime() - 5_000,
      },
    };
    stubFetch(quoteData);
    const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "tok", OPEN_NOW);
    assert.equal(audit.missingKeys.length, 0);
    assert.ok(audit.contracts.every((c) => c.tradeFreshness === "LIVE"));
  });

  it("KM30-02 response with wrong instrument_token → treated as missing", async () => {
    const rows = [makeRow(ATM, "NSE_FO|44620", null)];
    const quoteData: Record<string, Record<string, unknown>> = {
      "NSE_FO:WRONG": {
        instrument_token: "NSE_FO|99999", // different key
        last_price: 100,
        last_trade_time: OPEN_NOW.getTime() - 5_000,
      },
    };
    stubFetch(quoteData);
    const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "tok", OPEN_NOW);
    assert.ok(audit.missingKeys.includes("NSE_FO|44620"));
  });
});

// ── LC30: LTP consistency ─────────────────────────────────────────────────────

describe("LC30 — LTP consistency check", () => {
  it("LC30-01 quoteLtp matches chainLtp within 2 % → ltpConsistent=true, eligible", async () => {
    const rows = [makeRow(ATM, "CE|1", null, { ltp: 100 })];
    stubFetch(makeQuoteData(["CE|1"], { "CE|1": { last_price: 101 } })); // 1 % diff
    const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "tok", OPEN_NOW);
    const c = audit.contracts[0];
    assert.equal(c.ltpConsistent, true);
    assert.equal(c.eligible, true);
  });

  it("LC30-02 quoteLtp differs by > 2 % → ltpConsistent=false, ineligible", async () => {
    const rows = [makeRow(ATM, "CE|1", null, { ltp: 100 })];
    stubFetch(makeQuoteData(["CE|1"], { "CE|1": { last_price: 103.5 } })); // 3.5 % diff
    const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "tok", OPEN_NOW);
    const c = audit.contracts[0];
    assert.equal(c.ltpConsistent, false);
    assert.equal(c.eligible, false);
    assert.ok(c.ineligibleReason?.includes("LTP discrepancy"));
  });

  it("LC30-03 quoteLtp absent → ltpDiscrepancy=null, ltpConsistent=null", async () => {
    const rows = [makeRow(ATM, "CE|1", null, { ltp: 100 })];
    stubFetch(makeQuoteData(["CE|1"], { "CE|1": { last_price: 0 } })); // 0 not positive
    const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "tok", OPEN_NOW);
    const c = audit.contracts[0];
    assert.equal(c.quoteLtp, null);
    assert.equal(c.ltpDiscrepancy, null);
    assert.equal(c.ltpConsistent, null);
  });
});

// ── IV30: IV/Greeks freshness limitations ────────────────────────────────────

describe("IV30 — IV and Greeks freshness", () => {
  it("IV30-01 iv present in chain → iv non-null, ivFreshnessEvidence always NONE", async () => {
    const rows = [makeRow(ATM, "CE|1", null, { iv: 16 })];
    stubFetch(makeQuoteData(["CE|1"]));
    const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "tok", OPEN_NOW);
    const c = audit.contracts[0];
    assert.equal(c.iv, 16);
    assert.equal(c.ivFreshnessEvidence, "NONE");
  });

  it("IV30-02 iv null in chain → iv null, greeksPresent false, ivFreshnessEvidence still NONE", async () => {
    const rows = [makeRow(ATM, "CE|1", null, { iv: null, delta: null })];
    stubFetch(makeQuoteData(["CE|1"]));
    const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "tok", OPEN_NOW);
    const c = audit.contracts[0];
    assert.equal(c.iv, null);
    assert.equal(c.greeksPresent, false);
    assert.equal(c.ivFreshnessEvidence, "NONE");
  });

  it("IV30-03 fresh trade + no IV → eligible=true but ivFreshnessEvidence=NONE (limitation documented)", async () => {
    // A fresh last_trade_time does not imply IV is fresh
    const rows = [makeRow(ATM, "CE|1", null, { iv: null, delta: null })];
    stubFetch(makeQuoteData(["CE|1"]));
    const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "tok", OPEN_NOW);
    const c = audit.contracts[0];
    assert.equal(c.tradeFreshness, "LIVE");
    assert.equal(c.ivFreshnessEvidence, "NONE"); // limitation: cannot verify IV freshness
    assert.equal(c.eligible, true);  // eligible by LTT; IV limitation is on caller to handle
  });
});

// ── SC30: Separation of timestamps ───────────────────────────────────────────

describe("SC30 — Timestamp separation", () => {
  it("SC30-01 quoteResponseTime and exchangeTradeTime are different fields", async () => {
    const rows = [makeRow(ATM, "CE|1", null)];
    const ltt = OPEN_NOW.getTime() - 5_000;
    stubFetch(makeQuoteData(["CE|1"], { "CE|1": { last_trade_time: ltt } }));
    const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "tok", OPEN_NOW);
    const c = audit.contracts[0];
    assert.ok(c.exchangeTradeTime !== null);
    assert.ok(c.quoteResponseTime !== null);
    // exchangeTradeTime ≈ OPEN_NOW - 5s; quoteResponseTime = OPEN_NOW (the now we passed)
    const ettMs = new Date(c.exchangeTradeTime!).getTime();
    const qrtMs = new Date(c.quoteResponseTime).getTime();
    assert.ok(Math.abs(ettMs - (OPEN_NOW.getTime() - 5_000)) < 1000, "exchangeTradeTime must match LTT");
    assert.ok(Math.abs(qrtMs - OPEN_NOW.getTime()) < 1000, "quoteResponseTime must match fetch time");
    assert.notEqual(c.exchangeTradeTime, c.quoteResponseTime);
  });
});

// ── AO30: No orders / no collector bypass ────────────────────────────────────

describe("AO30 — Safety: no orders, no collector bypass", () => {
  it("AO30-01 optionContractLTT.ts has no placeOrder or order endpoint references", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/lib/services/optionContractLTT.ts"),
      "utf8",
    );
    assert.ok(!src.includes("placeOrder"), "must not reference placeOrder");
    assert.ok(!src.includes("/api/orders"), "must not reference order endpoint");
    assert.ok(!src.includes("/v2/order"), "must not reference Upstox order endpoint");
  });

  it("AO30-02 buildChainLTTAudit does not call paperOpportunityStore or liveOpportunityCollector", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/lib/services/optionContractLTT.ts"),
      "utf8",
    );
    assert.ok(!src.includes("paperOpportunityStore"), "must not write to paper store");
    assert.ok(!src.includes("liveOpportunityCollector"), "must not call collector");
    assert.ok(!src.includes("isAllLive"), "must not interact with production gate");
  });

  it("AO30-03 OPTION_QUOTE_LTT_ENABLED=false means feature is gated", () => {
    // If the flag is false and caller respects it, buildChainLTTAudit is never reached.
    // This test documents that the flag is the caller's responsibility.
    assert.equal(OPTION_QUOTE_LTT_ENABLED, false);
  });

  it("AO30-04 eligible contracts do NOT automatically enter paper collection", async () => {
    // The audit result has no path to paper collection — it must be explicitly wired.
    // Verify: ChainLTTAudit has no 'created', 'saved', or 'paper' fields.
    const rows = [makeRow(ATM, "CE|1", null)];
    stubFetch(makeQuoteData(["CE|1"]));
    const audit = await buildChainLTTAudit(rows, SPOT, "nifty", "tok", OPEN_NOW);
    assert.ok(!("created" in audit), "audit must not have a created count");
    assert.ok(!("saved" in audit), "audit must not have a saved field");
    assert.ok(!("paper" in audit), "audit must not have a paper field");
  });
});

// ── SV30B: Strategy freeze and version integrity ──────────────────────────────

describe("SV30B — Strategy freeze", () => {
  it("SV30B-01 OPPORTUNITY_ENGINE_VERSION is still 20.1 (no version change from prototype)", () => {
    assert.equal(OPPORTUNITY_ENGINE_VERSION, "20.1");
  });

  it("SV30B-02 FILTERS.maxStrikesAtm is 7 (extractEvaluationKeys must match engine)", () => {
    assert.equal(FILTERS.maxStrikesAtm, 7);
  });
});
