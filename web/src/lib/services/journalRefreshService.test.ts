// Refresh-route decision path, tested with injected fixtures. TEST FIXTURES ONLY: no market data, no broker access.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { refreshJournalOutcome, type RefreshDeps, type RefreshEntry } from "./journalRefreshService.ts";

const KEY = "NSE_FO|FX24000CE";
const liveSources = { market: { source: "LIVE" }, optionChain: { source: "LIVE" }, technical: { source: "LIVE" }, news: { source: "LIVE" }, breadth: { source: "LIVE" } };
const chainRow = (ltp: number | null, ask: number | null = null) => ({
  strike: 24000,
  call: { instrumentKey: KEY, ltp, ask },
  put: { instrumentKey: "NSE_FO|FX24000PE", ltp: 99, ask: null },
});

function tradeEntry(over: Partial<RefreshEntry> = {}): RefreshEntry {
  return {
    id: "fxtrade1",
    status: "OPEN",
    snapshot: { decision: "TRADE", underlying: "NIFTY", execution: { entry: 150 }, contract: { instrumentKey: KEY, strike: 24000, optionType: "CE" } },
    outcome: null,
    ...over,
  };
}

// Records every call so tests can assert that nothing was written when a check fails.
function fakeDeps(opts: { entry?: RefreshEntry | null; snapshot?: unknown; updateReturns?: "entry" | "null" | "throw" } = {}) {
  const calls = { getSnapshot: 0, update: [] as { id: string; patch: unknown }[], compute: 0 };
  const entry = opts.entry === undefined ? tradeEntry() : opts.entry;
  const snapshot = opts.snapshot ?? { chain: [chainRow(120)], fallbackReason: null, sources: liveSources };
  const deps: RefreshDeps = {
    getEntry: () => entry,
    getSnapshot: async () => { calls.getSnapshot++; return snapshot as never; },
    updateEntry: (id, patch) => {
      calls.update.push({ id, patch });
      if (opts.updateReturns === "throw") throw new Error("disk full");
      if (opts.updateReturns === "null") return null;
      return { ...(entry as RefreshEntry), status: patch.status, outcome: patch.outcome };
    },
    computeOutcome: (_rec, price, _now, prev) => { calls.compute++; return { status: price >= 150 ? "TARGET_1_HIT" : "OPEN", price, prevPresent: prev !== null }; },
    now: () => new Date("2026-11-09T05:00:00Z"),
  };
  return { deps, calls };
}

describe("refreshJournalOutcome: refusals write nothing", () => {
  test("RS-1 unknown id returns 404 and never fetches or writes", async () => {
    const { deps, calls } = fakeDeps({ entry: null });
    const r = await refreshJournalOutcome("nope", deps);
    assert.equal(r.status, 404);
    assert.equal(calls.getSnapshot, 0);
    assert.equal(calls.update.length, 0);
  });

  test("RS-2 non-trade entry is returned unchanged without a market fetch", async () => {
    const e = tradeEntry({ snapshot: { decision: "WAIT", underlying: "NIFTY" } as never });
    const { deps, calls } = fakeDeps({ entry: e });
    const r = await refreshJournalOutcome("fxtrade1", deps);
    assert.equal(r.status, 200);
    assert.equal(calls.getSnapshot, 0);
    assert.equal(calls.update.length, 0);
  });

  test("RS-3 already-closed entry is returned unchanged without a market fetch", async () => {
    const { deps, calls } = fakeDeps({ entry: tradeEntry({ status: "TARGET_1_HIT" }) });
    const r = await refreshJournalOutcome("fxtrade1", deps);
    assert.equal(r.status, 200);
    assert.equal(calls.getSnapshot, 0);
    assert.equal(calls.update.length, 0);
  });

  test("RS-4 MOCK source returns 409 and writes nothing", async () => {
    const snap = { chain: [chainRow(120)], fallbackReason: null, sources: { ...liveSources, optionChain: { source: "MOCK" } } };
    const { deps, calls } = fakeDeps({ snapshot: snap });
    const r = await refreshJournalOutcome("fxtrade1", deps);
    assert.equal(r.status, 409);
    assert.equal((r.body as { error: string }).error, "MOCK_INPUT");
    assert.equal(calls.update.length, 0);
    assert.equal(calls.compute, 0);
  });

  test("RS-5 fallback reason returns 409 and writes nothing", async () => {
    const { deps, calls } = fakeDeps({ snapshot: { chain: [chainRow(120)], fallbackReason: "UPSTOX_TIMEOUT", sources: liveSources } });
    assert.equal((await refreshJournalOutcome("fxtrade1", deps)).status, 409);
    assert.equal(calls.update.length, 0);
  });

  test("RS-6 STALE option chain returns 422 CHAIN_NOT_LIVE and writes nothing", async () => {
    const snap = { chain: [chainRow(120)], fallbackReason: null, sources: { ...liveSources, optionChain: { source: "STALE" } } };
    const { deps, calls } = fakeDeps({ snapshot: snap });
    const r = await refreshJournalOutcome("fxtrade1", deps);
    assert.equal(r.status, 422);
    assert.equal((r.body as { error: string }).error, "CHAIN_NOT_LIVE");
    assert.equal(calls.update.length, 0);
  });

  test("RS-7 END_OF_DAY option chain is not treated as current and returns 422", async () => {
    const snap = { chain: [chainRow(120)], fallbackReason: null, sources: { ...liveSources, optionChain: { source: "END_OF_DAY" } } };
    const { deps, calls } = fakeDeps({ snapshot: snap });
    assert.equal((await refreshJournalOutcome("fxtrade1", deps)).status, 422);
    assert.equal(calls.update.length, 0);
  });

  test("RS-8 contract missing from the live chain returns 422 and writes nothing", async () => {
    const snap = { chain: [{ strike: 23000, call: { instrumentKey: "X", ltp: 5 }, put: { instrumentKey: "Y", ltp: 5 } }], fallbackReason: null, sources: liveSources };
    const { deps, calls } = fakeDeps({ snapshot: snap });
    const r = await refreshJournalOutcome("fxtrade1", deps);
    assert.equal(r.status, 422);
    assert.equal((r.body as { error: string }).error, "CONTRACT_NOT_IN_CHAIN");
    assert.equal(calls.update.length, 0);
  });

  test("RS-9 missing price returns 422, writes nothing, and the entry price is never used", async () => {
    const snap = { chain: [chainRow(0, null)], fallbackReason: null, sources: liveSources };
    const { deps, calls } = fakeDeps({ snapshot: snap });
    const r = await refreshJournalOutcome("fxtrade1", deps);
    assert.equal(r.status, 422);
    assert.equal((r.body as { error: string }).error, "NO_PRICE");
    assert.equal(calls.compute, 0, "outcome must not be computed from a substituted price");
    assert.equal(calls.update.length, 0);
  });
});

describe("refreshJournalOutcome: valid live price", () => {
  test("RS-10 a live price updates the entry once and returns the updated record", async () => {
    const { deps, calls } = fakeDeps();
    const r = await refreshJournalOutcome("fxtrade1", deps);
    assert.equal(r.status, 200);
    assert.equal(calls.update.length, 1);
    assert.equal(calls.update[0].id, "fxtrade1");
    assert.deepEqual(calls.update[0].patch, { status: "OPEN", outcome: { status: "OPEN", price: 120, prevPresent: false } });
  });

  test("RS-11 only status and outcome are written; the frozen snapshot is not modified", async () => {
    const { deps, calls } = fakeDeps();
    await refreshJournalOutcome("fxtrade1", deps);
    assert.deepEqual(Object.keys(calls.update[0].patch as object).sort(), ["outcome", "status"]);
  });

  test("RS-12 repeated refresh with the same live price writes the same outcome for the same id (no duplicates)", async () => {
    const { deps, calls } = fakeDeps();
    const a = await refreshJournalOutcome("fxtrade1", deps);
    const b = await refreshJournalOutcome("fxtrade1", deps);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(calls.update.length, 2);
    assert.ok(calls.update.every((u) => u.id === "fxtrade1"), "every write targets the same entry");
    assert.deepEqual(calls.update[0].patch, calls.update[1].patch);
  });

  test("RS-13 a target-hit price moves the status and the outcome carries the price used", async () => {
    const { deps, calls } = fakeDeps({ snapshot: { chain: [chainRow(160)], fallbackReason: null, sources: liveSources } });
    await refreshJournalOutcome("fxtrade1", deps);
    assert.deepEqual(calls.update[0].patch, { status: "TARGET_1_HIT", outcome: { status: "TARGET_1_HIT", price: 160, prevPresent: false } });
  });
});

describe("refreshJournalOutcome: failed writes", () => {
  test("RS-14 a write that returns null reports a 500 with journalUpdated false", async () => {
    const { deps, calls } = fakeDeps({ updateReturns: "null" });
    const r = await refreshJournalOutcome("fxtrade1", deps);
    assert.equal(r.status, 500);
    assert.equal((r.body as { journalUpdated: boolean }).journalUpdated, false);
    assert.equal(calls.update.length, 1, "one attempt, no retry loop");
  });

  test("RS-15 a write that throws propagates to the caller (the route returns 500); no second write is attempted", async () => {
    const { deps, calls } = fakeDeps({ updateReturns: "throw" });
    await assert.rejects(refreshJournalOutcome("fxtrade1", deps), /disk full/);
    assert.equal(calls.update.length, 1);
  });
});
