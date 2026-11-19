import fs from "node:fs";

// Tolerant JSONL reader: a missing file is empty; malformed or truncated lines are counted, never thrown.
export function readJsonl<T = Record<string, unknown>>(file: string): { records: T[]; malformed: number; missing: boolean } {
  let text: string;
  try { text = fs.readFileSync(file, "utf8"); } catch { return { records: [], malformed: 0, missing: true }; }
  const records: T[] = [];
  let malformed = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try { const v = JSON.parse(line); if (v && typeof v === "object") records.push(v as T); else malformed++; } catch { malformed++; }
  }
  return { records, malformed, missing: false };
}
