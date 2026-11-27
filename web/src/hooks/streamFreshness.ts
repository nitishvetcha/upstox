export const STALE_AFTER_MS = 15_000;

export function streamAgeMs(lastTickTime: number | null, now: number): number | null {
  return lastTickTime === null ? null : Math.max(0, now - lastTickTime);
}

export function isStreamStale(status: string, lastTickTime: number | null, now: number): boolean {
  const age = streamAgeMs(lastTickTime, now);
  return status === "STREAMING" && age !== null && age > STALE_AFTER_MS;
}
