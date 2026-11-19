// Regression tests for Upstox error classification. No network access: every case uses in-memory responses.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { reasonFor, normalizeQuote, DOCUMENTED_INVALID_INSTRUMENT_CODES, UDAPI_NOT_FOUND } from "./upstoxMarket.ts";
import { INSTRUMENTS } from "./instrumentRegistry.ts";
import { UpstoxError } from "./errors.ts";

const key = INSTRUMENTS.nifty.underlyingKey; // e.g. "NSE_INDEX|Nifty 50"
const colonKey = key.replace("|", ":");

function quoteBody(entryKey: string, extra: Record<string, unknown> = {}) {
  return {
    [entryKey]: { instrument_token: key, last_price: 25000, net_change: 10, last_trade_time: Date.UTC(2026, 10, 8, 4, 0), ...extra },
  };
}

describe("reasonFor: classification uses status and documented codes only", () => {
  test("EC-1 a 400 whose message mentions 'instrument' is NOT classed as invalid instrument", () => {
    assert.equal(reasonFor(400, null), "UPSTOX_API_ERROR");
  });

  test("EC-2 a 400 with an undocumented error code is reported as an API error", () => {
    assert.equal(reasonFor(400, "UDAPI1148"), "UPSTOX_API_ERROR");
  });

  test("EC-3 no documented invalid-instrument code exists, so no HTTP status maps to INVALID_INSTRUMENT", () => {
    assert.equal(DOCUMENTED_INVALID_INSTRUMENT_CODES.length, 0);
    for (const s of [400, 404, 422, 500]) assert.notEqual(reasonFor(s, "ANY"), "UPSTOX_INVALID_INSTRUMENT");
  });

  test("EC-4 404 is not-found; the documented not-found code maps to not-found on any status", () => {
    assert.equal(reasonFor(404, null), "UPSTOX_NOT_FOUND");
    assert.equal(reasonFor(400, UDAPI_NOT_FOUND), "UPSTOX_NOT_FOUND");
  });

  test("EC-5 auth, forbidden and rate-limit classes are unchanged", () => {
    assert.equal(reasonFor(401, null), "UPSTOX_AUTH_EXPIRED");
    assert.equal(reasonFor(403, null), "UPSTOX_FORBIDDEN");
    assert.equal(reasonFor(429, null), "UPSTOX_RATE_LIMITED");
  });

  test("EC-6 an unrelated server error stays an API error", () => {
    assert.equal(reasonFor(500, null), "UPSTOX_API_ERROR");
  });
});

describe("normalizeQuote: missing data is separated from invalid instruments", () => {
  test("EC-7 a well-formed response without the requested key raises QUOTE_MISSING, not INVALID_INSTRUMENT", () => {
    const data = quoteBody("NSE_INDEX:Some Other Index", { instrument_token: "NSE_INDEX|Some Other Index" });
    assert.throws(
      () => normalizeQuote(data, "nifty"),
      (e: unknown) => e instanceof UpstoxError && e.reason === "UPSTOX_QUOTE_MISSING" && e.message.includes(key),
    );
  });

  test("EC-8 malformed (null) data raises BAD_RESPONSE", () => {
    assert.throws(() => normalizeQuote(null, "nifty"), (e: unknown) => e instanceof UpstoxError && e.reason === "UPSTOX_BAD_RESPONSE");
  });

  test("EC-9 key present but last_price missing raises BAD_RESPONSE", () => {
    const data = { [colonKey]: { instrument_token: key, last_price: 0 } };
    assert.throws(() => normalizeQuote(data, "nifty"), (e: unknown) => e instanceof UpstoxError && e.reason === "UPSTOX_BAD_RESPONSE");
  });

  test("EC-10 the key is matched in either the pipe or the colon form", () => {
    const pipe = normalizeQuote(quoteBody(key), "nifty");
    const colon = normalizeQuote(quoteBody(colonKey), "nifty");
    assert.equal(pipe.spot, 25000);
    assert.equal(colon.spot, 25000);
  });
});
