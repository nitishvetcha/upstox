// Known-answer tests: the chain response passes instrument key and lot size through unchanged and never invents them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { atmFor, chainLotSize, chainStrikes, sideBody } from "./optionChainPayload.ts";
import type { OptionChain, OptionRow, Quote } from "./types.ts";

const q = (over: Partial<Quote> = {}): Quote =>
  ({ ltp: 100, bid: 99, ask: 101, volume: 10, oi: 1000, prevOi: 900, chgOi: 100, iv: 15, delta: 0.5, instrumentKey: "NSE_FO|TEST", ...over }) as Quote;

const row = (strike: number, call: Partial<Quote> = {}, put: Partial<Quote> = {}): OptionRow => ({ strike, call: q(call), put: q(put) }) as OptionRow;

test("instrument key from the provider is passed through on each side", () => {
  const b = sideBody(q({ instrumentKey: "NSE_FO|NIFTY06NOV2625000CE" }));
  assert.equal(b.instrumentKey, "NSE_FO|NIFTY06NOV2625000CE");
});

test("a missing provider instrument key stays null, never constructed", () => {
  assert.equal(sideBody(q({ instrumentKey: undefined as unknown as null })).instrumentKey, null);
  assert.equal(sideBody(q({ instrumentKey: null })).instrumentKey, null);
});

test("chain lot size is passed through only when a positive whole number", () => {
  assert.equal(chainLotSize({ lotSize: 75 }), 75);
  assert.equal(chainLotSize({ lotSize: null }), null);
  assert.equal(chainLotSize({ lotSize: undefined }), null);
  assert.equal(chainLotSize({ lotSize: 0 }), null);
  assert.equal(chainLotSize({ lotSize: 7.5 }), null);
  assert.equal(chainLotSize({ lotSize: -25 }), null);
});

test("ATM is the strike nearest spot; empty chain gives null instead of throwing", () => {
  const data = { rows: [row(25000), row(25050), row(25100)], spot: 25060 } as Pick<OptionChain, "rows" | "spot">;
  assert.equal(atmFor(data), 25050);
  assert.equal(atmFor({ rows: [], spot: 25000 } as Pick<OptionChain, "rows" | "spot">), null);
});

test("strikes window is ATM ± range, and each side carries its own premium and key", () => {
  const rows = [25000, 25050, 25100, 25150, 25200].map((s) =>
    row(s, { ltp: s / 100, instrumentKey: `CE${s}` }, { ltp: s / 200, instrumentKey: `PE${s}` }),
  );
  const out = chainStrikes({ rows, spot: 25100 } as Pick<OptionChain, "rows" | "spot">, 1);
  assert.deepEqual(out.map((r) => r.strike), [25050, 25100, 25150]);
  const atm = out[1];
  assert.equal(atm.call.ltp, 251);
  assert.equal(atm.call.instrumentKey, "CE25100");
  assert.equal(atm.put.ltp, 125.5);
  assert.equal(atm.put.instrumentKey, "PE25100");
});
