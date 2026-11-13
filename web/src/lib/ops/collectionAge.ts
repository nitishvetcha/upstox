// Age label for the last stored stock-collection run. Pure: the caller passes `now` (epoch ms).
// Behaviour is unchanged from the OpsPanel rule: under 24 hours shows hours; 24 hours or more is labelled STALE.
export interface CollectionAgeDisplay { text: string; stale: boolean; known: boolean }

export function collectionAgeDisplay(lastCollectionAt: string | null | undefined, now: number): CollectionAgeDisplay {
  const t = lastCollectionAt ? Date.parse(lastCollectionAt) : NaN;
  if (!Number.isFinite(t)) return { text: "no collection run recorded", stale: false, known: false };
  const hours = (now - t) / 3_600_000;
  if (hours < 24) return { text: `${Math.round(hours)} h ago`, stale: false, known: true };
  return { text: `${Math.round(hours / 24)} days ago — STALE (stored run, not current prices)`, stale: true, known: true };
}
