// Request validation for the research-only stock candle routes. Pure: no network, no auth.
export const NSE_EQ_KEY = /^NSE_EQ\|[A-Z0-9]+$/;
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_1MIN_CHUNK_DAYS = 28; // Upstox V3 limit for sub-15-minute units

export function isNseEqKey(v: string): boolean {
  return NSE_EQ_KEY.test(v);
}

export function isIsoDate(v: string): boolean {
  return ISO_DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

function addDays(d: string, n: number): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

// Inclusive, non-overlapping chunks of at most MAX_1MIN_CHUNK_DAYS calendar days covering [from, to].
export function planChunks(from: string, to: string, maxDays = MAX_1MIN_CHUNK_DAYS): { from: string; to: string }[] {
  const chunks: { from: string; to: string }[] = [];
  for (let start = from; start <= to; start = addDays(start, maxDays)) {
    const end = addDays(start, maxDays - 1);
    chunks.push({ from: start, to: end < to ? end : to });
  }
  return chunks;
}
