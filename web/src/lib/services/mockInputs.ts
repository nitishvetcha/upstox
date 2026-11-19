// Single definition of "simulated input". Any MOCK subsystem, or a fallback to mock data, makes a snapshot
// non-executable and keeps it out of the recommendation journal.
import type { Snapshot } from "../types.ts";

export function hasMockInput(s: Snapshot): boolean {
  return s.fallbackReason !== null || Object.values(s.sources).some((x) => x.source === "MOCK");
}
