// Regression tests: journal outcome refresh must use only genuine market data and must never substitute the entry price.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveRefreshPrice, type SnapshotLike, type RecLike } from "./journalRefresh.ts";

const KEY = "NSE_FO|CE24000";
const liveSources = { market: { source: "UPSTOX" }, optionChain: { source: "UPSTOX" } };
const row = (ltp: number | null, ask: number | null = null) => ({
  strike: 24000,
  call: { instrumentKey: KEY, ltp, ask },
  put: { instrumentKey: "NSE_FO|PE24000", ltp: 99, ask: null },
});
const liveSnap = (r = row(120)): SnapshotLike => ({ chain: [r], fallbackReason: null, sources: liveSources });
const rec: RecLike = { contract: { instrumentKey: KEY, strike: 24000, optionType: "CE" } };

describe("resolveRefreshPrice", () => {
  test("JR-1 a genuine live quote is used", () => {
    assert.deepEqual(resolveRefreshPrice(liveSnap(), rec), { ok: true, price: 120 });
  });

  test("JR-2 a snapshot with a MOCK subsystem is refused, even if it has a price", () => {
    const snap = { ...liveSnap(), sources: { ...liveSources, optionChain: { source: "MOCK" } } };
    const r = resolveRefreshPrice(snap, rec);
    assert.equal(r.ok, false);
    assert.equal((r as { code: string }).code, "MOCK_INPUT");
  });

  test("JR-3 a snapshot with a fallback reason is refused (fallback counts as simulated input)", () => {
    const snap = { ...liveSnap(), fallbackReason: "UPSTOX_TIMEOUT" };
    assert.equal((resolveRefreshPrice(snap, rec) as { code: string }).code, "MOCK_INPUT");
  });

  test("JR-4 a zero last traded price falls through to the ask, never to the entry price", () => {
    assert.deepEqual(resolveRefreshPrice(liveSnap(row(0, 118)), rec), { ok: true, price: 118 });
  });

  test("JR-5 no positive price at all is an error, not a silent entry-price fallback", () => {
    const r = resolveRefreshPrice(liveSnap(row(0, null)), rec);
    assert.equal(r.ok, false);
    assert.equal((r as { code: string }).code, "NO_PRICE");
  });

  test("JR-6 a contract missing from the current chain is an error", () => {
    const snap: SnapshotLike = { chain: [{ strike: 23000, call: { instrumentKey: "X", ltp: 5 }, put: { instrumentKey: "Y", ltp: 5 } }], fallbackReason: null, sources: liveSources };
    assert.equal((resolveRefreshPrice(snap, rec) as { code: string }).code, "CONTRACT_NOT_IN_CHAIN");
  });

  test("JR-7 a recommendation without a contract is an error", () => {
    assert.equal((resolveRefreshPrice(liveSnap(), { contract: null }) as { code: string }).code, "CONTRACT_NOT_IN_CHAIN");
  });

  test("JR-8 without an instrument key, the strike and option type select the side", () => {
    const r: RecLike = { contract: { strike: 24000, optionType: "PE" } };
    assert.deepEqual(resolveRefreshPrice(liveSnap(row(120)), r), { ok: true, price: 99 });
  });

  test("JR-9 a MOCK snapshot is refused even when the contract is missing (no outcome either way)", () => {
    const snap = { ...liveSnap(), sources: { market: { source: "MOCK" } } };
    assert.equal((resolveRefreshPrice(snap, { contract: null }) as { code: string }).code, "MOCK_INPUT");
  });
});
