// The one short-lived server-side cache for Upstox data (quotes, chains, candles, futures, news).
// Kept on globalThis: Next can load modules once per route bundle, and every route must share one cache.
// Bounded: expired entries are pruned, and the least recently used entries are evicted above MAX_ENTRIES.
type Entry = { expires: number; value: Promise<unknown> };
const g = globalThis as typeof globalThis & { __upstoxCache?: Map<string, Entry> };
const cache = (g.__upstoxCache ??= new Map<string, Entry>());

// Insertion order of a Map is the recency order here: a hit moves its entry to the end.
export const MAX_ENTRIES = 80;

export function clearUpstoxCache() {
  cache.clear();
}

export function upstoxCacheSize() {
  return cache.size;
}

function enforceBounds(now: number) {
  for (const [key, entry] of cache) if (entry.expires <= now) cache.delete(key);
  for (const key of cache.keys()) {
    if (cache.size <= MAX_ENTRIES) break;
    cache.delete(key);
  }
}

export function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) {
    cache.delete(key);
    cache.set(key, hit); // refresh recency
    return hit.value as Promise<T>;
  }
  if (hit) cache.delete(key);
  const value = load(); // the promise is cached, so concurrent callers share one request
  cache.set(key, { expires: now + ttl, value });
  value.catch(() => cache.get(key)?.value === value && cache.delete(key)); // never cache failures
  enforceBounds(now);
  return value;
}
