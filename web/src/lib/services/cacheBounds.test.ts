// Network-gate setup: these tests stub fetch to exercise the live (upstox) code path. Without this the gate refuses.
process.env.MARKET_DATA_PROVIDER = "upstox";
// Upstream cache bounds: expired entries are pruned, size is capped by least-recently-used eviction, a hit refreshes
// recency, and failures are never cached. Offline and deterministic.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { cached, clearUpstoxCache, MAX_ENTRIES, upstoxCacheSize } from "./cache.ts";

beforeEach(() => clearUpstoxCache());

test("CB-1. the cache never holds more than MAX_ENTRIES, however many distinct keys arrive", async () => {
  for (let i = 0; i < MAX_ENTRIES * 3; i++) await cached(`k-${i}`, 60_000, async () => i);
  assert.ok(upstoxCacheSize() <= MAX_ENTRIES, `size ${upstoxCacheSize()} > ${MAX_ENTRIES}`);
  assert.equal(upstoxCacheSize(), MAX_ENTRIES);
});

test("CB-2. eviction is least-recently-used: the oldest keys go first, the newest stay", async () => {
  for (let i = 0; i < MAX_ENTRIES + 10; i++) await cached(`k-${i}`, 60_000, async () => i);
  let loads = 0;
  await cached("k-0", 60_000, async () => { loads++; return -1; });
  assert.equal(loads, 1, "the oldest key was evicted and is reloaded");
  loads = 0;
  await cached(`k-${MAX_ENTRIES + 9}`, 60_000, async () => { loads++; return -1; });
  assert.equal(loads, 0, "the newest key is still cached");
});

test("CB-3. a hit refreshes recency: a key that keeps being read survives a flood", async () => {
  await cached("hot", 60_000, async () => "hot-value");
  for (let i = 0; i < MAX_ENTRIES * 2; i++) {
    await cached(`flood-${i}`, 60_000, async () => i);
    await cached("hot", 60_000, async () => "reloaded");
  }
  let loads = 0;
  const v = await cached("hot", 60_000, async () => { loads++; return "reloaded"; });
  assert.equal(loads, 0, "the hot key was never evicted");
  assert.equal(v, "hot-value");
});

test("CB-4. expired entries are pruned when new keys arrive", async () => {
  for (let i = 0; i < 50; i++) await cached(`short-${i}`, 1, async () => i);
  await new Promise((r) => setTimeout(r, 20));
  await cached("fresh", 60_000, async () => "x");
  assert.equal(upstoxCacheSize(), 1, "only the fresh entry remains");
});

test("CB-5. failures are never cached and never count against the bound", async () => {
  await assert.rejects(cached("bad", 60_000, async () => { throw new Error("upstream"); }));
  assert.equal(upstoxCacheSize(), 0);
  let loads = 0;
  await cached("bad", 60_000, async () => { loads++; return 1; });
  assert.equal(loads, 1, "a failed key is retried, not served from cache");
});
