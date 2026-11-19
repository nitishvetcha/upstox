// Pure filter and sort for the saved-picks list. No I/O. Filtering never changes what a pick says; it only hides rows.
export interface FilterablePick {
  id: string;
  savedAt: string;
  instrument: string;
  instrumentType: string;
  direction: string;
  source: string;
  statusLabel: string;
  validation: string;
  note?: string;
}

export interface PickFilter {
  query: string;
  instrumentType: string; // "ALL" or a type
  source: string; // "ALL" or a source
  validation: string; // "ALL" or a validation status
}

export const ALL: string = "ALL";

export function filterPicks<T extends FilterablePick>(picks: T[], f: PickFilter): T[] {
  const q = f.query.trim().toLowerCase();
  return picks.filter((p) => {
    if (f.instrumentType !== ALL && p.instrumentType !== f.instrumentType) return false;
    if (f.source !== ALL && p.source !== f.source) return false;
    if (f.validation !== ALL && p.validation !== f.validation) return false;
    if (q && !`${p.instrument} ${p.note ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

// Newest first. Ties keep their original order (stable sort).
export function sortNewestFirst<T extends FilterablePick>(picks: T[]): T[] {
  return [...picks].sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
}

export function distinct<T extends FilterablePick>(picks: T[], key: "instrumentType" | "source" | "validation"): string[] {
  return [...new Set(picks.map((p) => p[key]))].sort();
}
