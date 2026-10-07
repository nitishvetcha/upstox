// The one short-lived server-side cache for Upstox data (quotes, chains, candles, futures).
// Kept on globalThis: Next can load modules once per route bundle, and every route must share one cache.
type Entry = { expires: number; value: Promise<unknown> };
const g = globalThis as typeof globalThis & { __upstoxCache?: Map<string, Entry> };
const cache = (g.__upstoxCache ??= new Map<string, Entry>());

export function clearUpstoxCache() {
  cache.clear();
}

export function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value as Promise<T>;
  const value = load(); // the promise is cached, so concurrent callers share one request
  cache.set(key, { expires: now + ttl, value });
  value.catch(() => cache.get(key)?.value === value && cache.delete(key)); // never cache failures
  return value;
}
