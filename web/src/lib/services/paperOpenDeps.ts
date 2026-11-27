// Injection point for the opening route's server-side snapshot. Production uses the real market service.
// Only tests replace it, through setOpenSnapshotProviderForTests, which production code never calls.
import { getSnapshot } from "./market.ts";
import type { IndexId, Snapshot, UnderlyingId } from "../types.ts";

export const openDeps: { getSnapshot: (index: UnderlyingId) => Promise<Snapshot>; now: () => Date } = {
  getSnapshot: (index) => getSnapshot(index),
  now: () => new Date(),
};

export function setOpenSnapshotProviderForTests(fn: ((index: UnderlyingId) => Promise<Snapshot>) | null, clock?: () => Date): void {
  openDeps.getSnapshot = fn ?? ((index) => getSnapshot(index));
  openDeps.now = clock ?? (() => new Date());
}
