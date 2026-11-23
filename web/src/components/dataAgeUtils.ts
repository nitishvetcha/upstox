export function dataAge(now: Date, generatedAt: string): string {
  const mins = Math.max(0, Math.floor((now.getTime() - Date.parse(generatedAt)) / 60_000));
  return mins === 0 ? "just now" : `${mins}m old`;
}
