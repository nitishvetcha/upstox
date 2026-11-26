// Tests for the dynamic MCX futures contract resolver.
// Network calls are never made: all Upstox fetches are stubbed via global fetch mock.
// Strategy 11.4 frozen core math is NOT touched or imported here.

import test from "node:test";
import assert from "node:assert/strict";
import {
  clearMcxResolverCache,
  daysUntilExpiry,
  selectActiveContract,
  resolveMcxContract,
  ROLLOVER_THRESHOLD_DAYS,
  RESOLVER_TTL_MS,
  getCachedMcxContract,
} from "./mcxContractResolver.ts";

// ---------------------------------------------------------------------------
// Helper: build a mock Upstox search response body
// ---------------------------------------------------------------------------
function makeFutBody(contracts: Array<{ key: string; symbol: string; expiry: string; lot?: number }>) {
  return JSON.stringify({
    status: "success",
    data: contracts.map(({ key, symbol, expiry, lot = 100 }) => ({
      instrument_key: key,
      trading_symbol: symbol,
      expiry,
      lot_size: lot,
      instrument_type: "FUT",
      segment: "MCX_FO",
      exchange: "MCX",
    })),
  });
}

// ---------------------------------------------------------------------------
// Pure helper: daysUntilExpiry
// ---------------------------------------------------------------------------
test("daysUntilExpiry: same day returns 0", () => {
  const now = new Date("2026-11-26T10:00:00Z");
  assert.equal(daysUntilExpiry("2026-11-26", now), 0);
});

test("daysUntilExpiry: 1 day ahead returns 1", () => {
  const now = new Date("2026-11-26T10:00:00Z");
  assert.equal(daysUntilExpiry("2026-11-27", now), 1);
});

test("daysUntilExpiry: 3 days ahead returns 3", () => {
  const now = new Date("2026-11-26T10:00:00Z");
  assert.equal(daysUntilExpiry("2026-11-29", now), 3);
});

test("daysUntilExpiry: past expiry returns negative", () => {
  const now = new Date("2026-11-26T10:00:00Z");
  assert.equal(daysUntilExpiry("2026-11-25", now), -1);
});

// ---------------------------------------------------------------------------
// Pure helper: selectActiveContract
// ---------------------------------------------------------------------------
const NOW = new Date("2026-11-26T10:00:00Z");

test("selectActiveContract: picks nearest active contract when daysToExpiry >= threshold", () => {
  const instruments = [
    { instrument_key: "MCX_FO|111", trading_symbol: "CRUDEOIL26DECFUT", expiry: "2026-12-19", lot_size: 100, instrument_type: "FUT" },
    { instrument_key: "MCX_FO|222", trading_symbol: "CRUDEOIL27JANFUT", expiry: "2027-01-16", lot_size: 100, instrument_type: "FUT" },
  ];
  const result = selectActiveContract(instruments, NOW);
  assert.ok(result);
  assert.equal(result.instrumentKey, "MCX_FO|111");
  assert.equal(result.expiry, "2026-12-19");
  assert.equal(result.rolledOver, false);
});

test("selectActiveContract: rolls over when nearest has daysToExpiry < threshold", () => {
  // 2 days to expiry < 3 → should roll over
  const nearExpiry = "2026-11-28"; // 2 days from NOW (2026-11-26)
  const nextExpiry = "2026-12-19";
  const instruments = [
    { instrument_key: "MCX_FO|111", trading_symbol: "CRUDEOIL26NOVFUT", expiry: nearExpiry, lot_size: 100, instrument_type: "FUT" },
    { instrument_key: "MCX_FO|222", trading_symbol: "CRUDEOIL26DECFUT", expiry: nextExpiry, lot_size: 100, instrument_type: "FUT" },
  ];
  const result = selectActiveContract(instruments, NOW);
  assert.ok(result);
  assert.equal(result.instrumentKey, "MCX_FO|222");
  assert.equal(result.expiry, nextExpiry);
  assert.equal(result.rolledOver, true);
});

test("selectActiveContract: threshold boundary — exactly 3 days is NOT rolled over", () => {
  const thresholdExpiry = "2026-11-29"; // exactly 3 days from NOW → should NOT roll
  const instruments = [
    { instrument_key: "MCX_FO|111", trading_symbol: "CRUDEOIL26NOVFUT", expiry: thresholdExpiry, lot_size: 100, instrument_type: "FUT" },
    { instrument_key: "MCX_FO|222", trading_symbol: "CRUDEOIL26DECFUT", expiry: "2026-12-19", lot_size: 100, instrument_type: "FUT" },
  ];
  const result = selectActiveContract(instruments, NOW);
  assert.ok(result);
  assert.equal(result.instrumentKey, "MCX_FO|111");
  assert.equal(result.rolledOver, false);
  assert.equal(result.daysToExpiry, 3);
});

test("selectActiveContract: threshold boundary — 2 days causes rollover", () => {
  const nearExpiry = "2026-11-28"; // 2 days
  const instruments = [
    { instrument_key: "MCX_FO|A", trading_symbol: "CRUDEOIL26NOVFUT", expiry: nearExpiry, lot_size: 100, instrument_type: "FUT" },
    { instrument_key: "MCX_FO|B", trading_symbol: "CRUDEOIL26DECFUT", expiry: "2026-12-19", lot_size: 100, instrument_type: "FUT" },
  ];
  const result = selectActiveContract(instruments, NOW);
  assert.ok(result);
  assert.equal(result.rolledOver, true);
});

test("selectActiveContract: filters out expired contracts", () => {
  const instruments = [
    { instrument_key: "MCX_FO|OLD", trading_symbol: "CRUDEOIL26OCTFUT", expiry: "2026-11-01", lot_size: 100, instrument_type: "FUT" }, // expired
    { instrument_key: "MCX_FO|222", trading_symbol: "CRUDEOIL26DECFUT", expiry: "2026-12-19", lot_size: 100, instrument_type: "FUT" },
  ];
  const result = selectActiveContract(instruments, NOW);
  assert.ok(result);
  assert.equal(result.instrumentKey, "MCX_FO|222");
});

test("selectActiveContract: returns null when no active FUT contracts", () => {
  const instruments = [
    { instrument_key: "MCX_FO|OLD", trading_symbol: "CRUDEOIL26OCTFUT", expiry: "2026-10-01", lot_size: 100, instrument_type: "FUT" },
  ];
  const result = selectActiveContract(instruments, NOW);
  assert.equal(result, null);
});

test("selectActiveContract: filters out non-FUT instrument types", () => {
  const instruments = [
    { instrument_key: "MCX_FO|OPT", trading_symbol: "CRUDEOILCE", expiry: "2026-12-19", lot_size: 100, instrument_type: "CE" },
    { instrument_key: "MCX_FO|222", trading_symbol: "CRUDEOIL26DECFUT", expiry: "2026-12-19", lot_size: 100, instrument_type: "FUT" },
  ];
  const result = selectActiveContract(instruments, NOW);
  assert.ok(result);
  assert.equal(result.instrumentKey, "MCX_FO|222");
});

test("selectActiveContract: handles FUTCOM instrument_type", () => {
  const instruments = [
    { instrument_key: "MCX_FO|333", trading_symbol: "NATURALGAS26DECFUT", expiry: "2026-12-26", lot_size: 1250, instrument_type: "FUTCOM" },
  ];
  const result = selectActiveContract(instruments, NOW);
  assert.ok(result);
  assert.equal(result.instrumentKey, "MCX_FO|333");
  assert.equal(result.lotSize, 1250);
});

test("selectActiveContract: only one contract near expiry → uses it despite threshold", () => {
  const nearExpiry = "2026-11-28"; // 2 days — below threshold but no next contract
  const instruments = [
    { instrument_key: "MCX_FO|ONLY", trading_symbol: "CRUDEOIL26NOVFUT", expiry: nearExpiry, lot_size: 100, instrument_type: "FUT" },
  ];
  const result = selectActiveContract(instruments, NOW);
  assert.ok(result); // still returns something (better than null)
  assert.equal(result.instrumentKey, "MCX_FO|ONLY");
  assert.equal(result.rolledOver, false);
});

// ---------------------------------------------------------------------------
// resolveMcxContract: live API resolution (fetch-stubbed)
// ---------------------------------------------------------------------------

/** Temporarily override globalThis.fetch, restoring after callback. */
async function withFetch<T>(stub: typeof globalThis.fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

/** Temporarily set env vars, restoring originals (async-safe). */
async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
}

test("resolveMcxContract: selects normal active month via API", async () => {
  clearMcxResolverCache();
  const fakeContracts = [
    { key: "MCX_FO|999", symbol: "CRUDEOIL26DECFUT", expiry: "2026-12-19", lot: 100 },
    { key: "MCX_FO|888", symbol: "CRUDEOIL27JANFUT", expiry: "2027-01-16", lot: 100 },
  ];
  const fakeResponse = makeFutBody(fakeContracts);

  const result = await withEnv({ MARKET_DATA_PROVIDER: "upstox" }, () =>
    withFetch(
      () => Promise.resolve(new Response(fakeResponse, { status: 200 })),
      () => resolveMcxContract("crudeoil", "fake-token", new Date("2026-11-26T10:00:00Z")),
    ),
  );
  assert.equal(result.commodityId, "crudeoil");
  assert.equal(result.instrumentKey, "MCX_FO|999");
  assert.equal(result.expiry, "2026-12-19");
  assert.equal(result.rolledOver, false);
  assert.equal(result.source, "API");
  assert.equal(result.lotSize, 100);
});

test("resolveMcxContract: auto-rollover when near-month < 3 days to expiry", async () => {
  clearMcxResolverCache();
  // near month expires 2026-11-28 (2 days from NOW=2026-11-26)
  const fakeContracts = [
    { key: "MCX_FO|NEAR", symbol: "CRUDEOIL26NOVFUT", expiry: "2026-11-28", lot: 100 },
    { key: "MCX_FO|NEXT", symbol: "CRUDEOIL26DECFUT", expiry: "2026-12-19", lot: 100 },
  ];
  const fakeResponse = makeFutBody(fakeContracts);

  await withEnv({ MARKET_DATA_PROVIDER: "upstox" }, async () => {
    const result = await withFetch(
      () => Promise.resolve(new Response(fakeResponse, { status: 200 })),
      () => resolveMcxContract("crudeoil", "fake-token", new Date("2026-11-26T10:00:00Z")),
    );
    assert.equal(result.instrumentKey, "MCX_FO|NEXT");
    assert.equal(result.expiry, "2026-12-19");
    assert.equal(result.rolledOver, true);
    assert.equal(result.source, "API");
  });
});

test("resolveMcxContract: falls back to env var on API HTTP error", async () => {
  clearMcxResolverCache();
  await withEnv(
    {
      MARKET_DATA_PROVIDER: "upstox",
      MCX_CRUDEOIL_KEY: "MCX_FO|ENV_KEY",
      MCX_CRUDEOIL_EXPIRY: "2026-12-19",
    },
    async () => {
      const result = await withFetch(
        () => Promise.resolve(new Response("", { status: 500 })),
        () => resolveMcxContract("crudeoil", "fake-token", new Date("2026-11-26T10:00:00Z")),
      );
      assert.equal(result.instrumentKey, "MCX_FO|ENV_KEY");
      assert.equal(result.source, "ENV_FALLBACK");
    },
  );
});

test("resolveMcxContract: falls back to default key when env var also absent", async () => {
  clearMcxResolverCache();
  await withEnv(
    {
      MARKET_DATA_PROVIDER: "upstox",
      MCX_CRUDEOIL_KEY: undefined,
      MCX_CRUDEOIL_EXPIRY: undefined,
    },
    async () => {
      const result = await withFetch(
        () => Promise.reject(new Error("network down")),
        () => resolveMcxContract("crudeoil", "fake-token", new Date("2026-11-26T10:00:00Z")),
      );
      // Should have fallen back — instrumentKey comes from module-level default
      assert.ok(result.instrumentKey.startsWith("MCX_FO|"));
      assert.equal(result.source, "DEFAULT_FALLBACK");
    },
  );
});

test("resolveMcxContract: falls back when MARKET_DATA_PROVIDER is not 'upstox'", async () => {
  clearMcxResolverCache();
  await withEnv(
    { MARKET_DATA_PROVIDER: "mock", MCX_CRUDEOIL_KEY: "MCX_FO|ENV_MOCK" },
    async () => {
      // The network gate throws UpstoxNetworkBlockedError → resolver catches and falls back
      const result = await resolveMcxContract("crudeoil", "fake-token", new Date("2026-11-26T10:00:00Z"));
      assert.ok(result.source === "ENV_FALLBACK" || result.source === "DEFAULT_FALLBACK");
    },
  );
});

test("resolveMcxContract: result is cached for RESOLVER_TTL_MS", async () => {
  clearMcxResolverCache();
  let callCount = 0;
  const fakeContracts = [{ key: "MCX_FO|CACHED", symbol: "CRUDEOIL26DECFUT", expiry: "2026-12-19", lot: 100 }];
  const fakeResponse = makeFutBody(fakeContracts);
  const mockFetch = () => {
    callCount++;
    return Promise.resolve(new Response(fakeResponse, { status: 200 }));
  };

  await withEnv({ MARKET_DATA_PROVIDER: "upstox" }, async () => {
    const now = new Date("2026-11-26T10:00:00Z");
    await withFetch(mockFetch as typeof fetch, () => resolveMcxContract("crudeoil", "fake-token", now));
    // Second call within TTL — should hit cache, no additional fetch
    await withFetch(mockFetch as typeof fetch, () => resolveMcxContract("crudeoil", "fake-token", now));
    assert.equal(callCount, 1, "Should only call API once within TTL");
  });
});

test("resolveMcxContract: cache is bypassed after TTL expires", async () => {
  clearMcxResolverCache();
  let callCount = 0;
  const fakeContracts = [{ key: "MCX_FO|TTL", symbol: "CRUDEOIL26DECFUT", expiry: "2026-12-19", lot: 100 }];
  const fakeResponse = makeFutBody(fakeContracts);
  const mockFetch = () => {
    callCount++;
    return Promise.resolve(new Response(fakeResponse, { status: 200 }));
  };

  await withEnv({ MARKET_DATA_PROVIDER: "upstox" }, async () => {
    const t0 = new Date("2026-11-26T10:00:00Z");
    await withFetch(mockFetch as typeof fetch, () => resolveMcxContract("crudeoil", "fake-token", t0));
    // Advance time past TTL
    const tExpired = new Date(t0.getTime() + RESOLVER_TTL_MS + 1);
    await withFetch(mockFetch as typeof fetch, () => resolveMcxContract("crudeoil", "fake-token", tExpired));
    assert.equal(callCount, 2, "Should re-fetch after TTL");
  });
});

test("getCachedMcxContract: returns null before first resolution", () => {
  clearMcxResolverCache();
  const hit = getCachedMcxContract("crudeoil", new Date("2026-11-26T10:00:00Z"));
  assert.equal(hit, null);
});

test("getCachedMcxContract: returns contract after successful resolution", async () => {
  clearMcxResolverCache();
  const fakeContracts = [{ key: "MCX_FO|GETTEST", symbol: "CRUDEOIL26DECFUT", expiry: "2026-12-19", lot: 100 }];
  const fakeResponse = makeFutBody(fakeContracts);

  await withEnv({ MARKET_DATA_PROVIDER: "upstox" }, async () => {
    const now = new Date("2026-11-26T10:00:00Z");
    await withFetch(
      () => Promise.resolve(new Response(fakeResponse, { status: 200 })),
      () => resolveMcxContract("crudeoil", "fake-token", now),
    );
    const hit = getCachedMcxContract("crudeoil", now);
    assert.ok(hit !== null);
    assert.equal(hit.instrumentKey, "MCX_FO|GETTEST");
  });
});

test("resolveMcxContract: naturalgas contract resolves independently of crudeoil", async () => {
  clearMcxResolverCache();
  const fakeGasContracts = [{ key: "MCX_FO|GAS123", symbol: "NATURALGAS26DECFUT", expiry: "2026-12-26", lot: 1250 }];
  const fakeResponse = makeFutBody(fakeGasContracts);

  await withEnv({ MARKET_DATA_PROVIDER: "upstox" }, async () => {
    const result = await withFetch(
      () => Promise.resolve(new Response(fakeResponse, { status: 200 })),
      () => resolveMcxContract("naturalgas", "fake-token", new Date("2026-11-26T10:00:00Z")),
    );
    assert.equal(result.commodityId, "naturalgas");
    assert.equal(result.instrumentKey, "MCX_FO|GAS123");
    assert.equal(result.lotSize, 1250);
  });
});

test("resolveMcxContract: goldm & silverm never emit invalid MCX_FO|GOLDM or MCX_FO|SILVERM on fallback", async () => {
  clearMcxResolverCache();
  await withEnv(
    { MARKET_DATA_PROVIDER: "mock", MCX_GOLDM_KEY: undefined, MCX_SILVERM_KEY: undefined },
    async () => {
      const g = await resolveMcxContract("goldm", "fake-token", new Date("2026-11-26T10:00:00Z"));
      const s = await resolveMcxContract("silverm", "fake-token", new Date("2026-11-26T10:00:00Z"));
      assert.equal(g.instrumentKey, "");
      assert.equal(s.instrumentKey, "");
    },
  );
});

test("resolveMcxContract: goldm resolves and rolls over when < 3 days to expiry", async () => {
  clearMcxResolverCache();
  const fakeContracts = [
    { key: "MCX_FO|GOLDM_NEAR", symbol: "GOLDM26NOVFUT", expiry: "2026-11-28", lot: 100 },
    { key: "MCX_FO|GOLDM_NEXT", symbol: "GOLDM26DECFUT", expiry: "2026-12-28", lot: 100 },
  ];
  const fakeResponse = makeFutBody(fakeContracts);

  await withEnv({ MARKET_DATA_PROVIDER: "upstox" }, async () => {
    const result = await withFetch(
      () => Promise.resolve(new Response(fakeResponse, { status: 200 })),
      () => resolveMcxContract("goldm", "fake-token", new Date("2026-11-26T10:00:00Z")),
    );
    assert.equal(result.commodityId, "goldm");
    assert.equal(result.instrumentKey, "MCX_FO|GOLDM_NEXT");
    assert.equal(result.rolledOver, true);
    assert.equal(result.lotSize, 100);
  });
});

test("resolveMcxContract: silverm resolves with 5 kg lot size", async () => {
  clearMcxResolverCache();
  const fakeContracts = [
    { key: "MCX_FO|SILVERM_DEC", symbol: "SILVERM26DECFUT", expiry: "2026-12-28", lot: 5 },
  ];
  const fakeResponse = makeFutBody(fakeContracts);

  await withEnv({ MARKET_DATA_PROVIDER: "upstox" }, async () => {
    const result = await withFetch(
      () => Promise.resolve(new Response(fakeResponse, { status: 200 })),
      () => resolveMcxContract("silverm", "fake-token", new Date("2026-11-26T10:00:00Z")),
    );
    assert.equal(result.commodityId, "silverm");
    assert.equal(result.instrumentKey, "MCX_FO|SILVERM_DEC");
    assert.equal(result.rolledOver, false);
    assert.equal(result.lotSize, 5);
  });
});
