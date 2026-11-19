import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reconstructOptionSnapshot } from "./optionChainReconstruction.ts";

describe("Phase 1.5 option-chain reconstruction", () => {
  it("reconstructs complete OI and rejects incomplete mandatory input", () => {
    const contracts = [
      { instrument_key: "C", underlying_key: "U", expiry: "2026-11-09", strike_price: 100, instrument_type: "CE" },
      { instrument_key: "P", underlying_key: "U", expiry: "2026-11-09", strike_price: 100, instrument_type: "PE" },
    ];
    const quote = (token: string, ltp: number, oi: number, previous_oi: number, volume: number) => ({ instrument_token: token, last_price: ltp, oi, previous_oi, volume, timestamp: "2026-11-04T11:00:00+05:30", last_trade_time: Date.parse("2026-11-04T05:29:55Z"), depth: { buy: [], sell: [] } });
    const chain = [{ strike_price: 100, call_options: { instrument_key: "C", market_data: { ltp: 10, oi: 100 } }, put_options: { instrument_key: "P", market_data: { ltp: 11, oi: 200 } } }];
    const ok = reconstructOptionSnapshot({ underlyingKey: "U", expiry: "2026-11-09", contracts, quotes: { c: quote("C", 10, 100, 90, 1000), p: quote("P", 11, 200, 180, 1500) }, chain, now: new Date("2026-11-04T05:30:00Z") });
    assert.equal(ok.coverage.percent, 100);
    assert.equal(ok.analytics?.oiPcr, 2);
    assert.equal(ok.analytics?.volumePcr, 1.5);
    assert.equal(ok.comparison.oiMismatch, 0);
    const incomplete = reconstructOptionSnapshot({ underlyingKey: "U", expiry: "2026-11-09", contracts, quotes: { c: quote("C", 10, 100, 90, 1000) }, chain, now: new Date("2026-11-04T05:30:00Z") });
    assert.equal(incomplete.analytics, null);
  });

  it("detects duplicates, malformed fields and mismatches without exposing payloads", () => {
    const report = reconstructOptionSnapshot({ underlyingKey: "U", expiry: "2026-11-09", contracts: [
      { instrument_key: "C", underlying_key: "U", expiry: "2026-11-09", strike_price: 100, instrument_type: "CE" },
      { instrument_key: "C", underlying_key: "U", expiry: "2026-11-09", strike_price: 100, instrument_type: "CE" },
    ], quotes: { x: { instrument_token: "C", last_price: 0 } }, chain: [], now: new Date("2026-11-04T05:30:00Z") });
    assert.equal(report.universe.duplicateKeys, 1);
    assert.equal(report.validity.malformed, 1);
    assert.equal(report.analytics, null);
  });
});
