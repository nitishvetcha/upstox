// TEST FIXTURE ONLY. A mock snapshot whose breadth is labelled LIVE, so the engine can build a trade from it.
// Used by tests that need a trade-producing input (for example charge and fill checks). The source label stays MOCK,
// so provenance and guard tests still see MOCK. This is a test input, not market data. Production code never imports it.
import { mockSnapshot } from "../services/mock.ts";
import type { IndexId, Snapshot } from "../types.ts";

export function mockSnapshotTradeInputs(index: IndexId, now: Date): Snapshot {
  const s = mockSnapshot(index, now);
  // reason is reset to null: the pre-change LIVE breadth had no reason, and the engine reads it.
  return s.breadth ? { ...s, breadth: { ...s.breadth, status: "LIVE", reason: null } } : s;
}
