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

/**
 * Returns the IST calendar day string (YYYY-MM-DD) for a Date object.
 */
export function istDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Determines whether a pick represents an intraday setup.
 * Stock opportunity setups default to intraday (unless explicitly noted as long-term or multi-month).
 * Option setups with explicit intraday notes are also intraday.
 */
export function isIntradayPick(p: { instrumentType: string; note?: string }): boolean {
  const note = (p.note ?? "").toLowerCase();
  if (p.instrumentType === "STOCK") {
    // If explicitly marked as long-term or accumulation, it is swing/investment
    if (note.includes("long-term") || note.includes("accumulation") || note.includes("months+")) {
      return false;
    }
    return true;
  }
  if (p.instrumentType === "STOCK_INTRADAY" || p.instrumentType === "INDEX_INTRADAY") {
    return true;
  }
  if (note.includes("intraday") || note.includes("3:15 pm")) {
    return true;
  }
  return false;
}

/**
 * Checks whether an intraday trading session has completed.
 * In Indian markets (NSE/BSE), intraday trading ends at 15:30 IST.
 * - If saved on a previous calendar day (in IST): session is completed (true).
 * - If saved today during trading hours (<= 15:30 IST) and current time is now >= 15:30 IST: session is completed (true).
 * - If saved today after 15:30 IST (after-hours prep): session is active for next day (false).
 */
export function isSessionCompleted(savedAtIso: string, now = new Date()): boolean {
  try {
    const savedDate = new Date(savedAtIso);
    if (Number.isNaN(savedDate.getTime())) return false;

    const savedDay = istDay(savedDate);
    const currentDay = istDay(now);

    // If saved on a previous calendar day in IST, session has completed
    if (currentDay > savedDay) {
      return true;
    }

    // If saved on the same day in IST:
    if (currentDay === savedDay) {
      const marketCloseToday = new Date(`${savedDay}T15:30:00+05:30`).getTime();
      // If saved during or before market session, and current time is past 15:30 IST:
      if (savedDate.getTime() <= marketCloseToday && now.getTime() >= marketCloseToday) {
        return true;
      }
      return false;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Checks if an option contract has expired based on contract expiry in the instrument string (e.g. YYYY-MM-DD).
 */
export function isOptionExpired(instrument: string, now = new Date()): boolean {
  const match = instrument.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (!match) return false;
  const expiryDate = match[1];
  const currentDay = istDay(now);
  if (currentDay > expiryDate) return true;
  if (currentDay === expiryDate) {
    const marketCloseToday = new Date(`${expiryDate}T15:30:00+05:30`).getTime();
    return now.getTime() >= marketCloseToday;
  }
  return false;
}

/**
 * Checks if a pick is completed / expired (intraday session completed or option contract expired).
 */
export function isPickCompleted(p: { instrument: string; instrumentType: string; savedAt: string; note?: string }, now = new Date()): boolean {
  if (isIntradayPick(p) && isSessionCompleted(p.savedAt, now)) {
    return true;
  }
  if ((p.instrumentType === "INDEX_OPTION" || p.instrumentType === "STOCK_OPTION") && isOptionExpired(p.instrument, now)) {
    return true;
  }
  return false;
}

