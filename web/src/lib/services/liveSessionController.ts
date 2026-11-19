// Market session controller for Indian NSE.
// NSE regular session: 09:15 IST – 15:30 IST (Mon–Fri, excluding holidays).
// Holidays and special sessions come from the single NSE calendar in ../time.ts (isTradingDay); this module keeps
// no calendar of its own. (It used to ignore holidays, so a holiday read as OPEN while the top bar read CLOSED.)
// IST = UTC+05:30.
import { isTradingDay } from "../time.ts";

export type MarketStatus = "PRE_MARKET" | "OPEN" | "CLOSED";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+05:30

function toIST(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

function minutesSinceMidnightIST(date: Date): number {
  const ist = toIST(date);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

function dayOfWeekIST(date: Date): number {
  return toIST(date).getUTCDay(); // 0=Sun, 6=Sat
}

// Normal NSE session: 09:15–15:30 IST.
const SESSION_START = 9 * 60 + 15;   // 555 minutes
const SESSION_END   = 15 * 60 + 30;  // 930 minutes

export function marketStatus(now = new Date()): MarketStatus {
  const dow = dayOfWeekIST(now);
  if (dow === 0 || dow === 6) return "CLOSED"; // weekend
  if (!isTradingDay(toIST(now).toISOString().slice(0, 10))) return "CLOSED"; // NSE trading holiday
  const mins = minutesSinceMidnightIST(now);
  if (mins < SESSION_START) return "PRE_MARKET";
  if (mins >= SESSION_END) return "CLOSED";
  return "OPEN";
}

export function isMarketOpen(now = new Date()): boolean {
  return marketStatus(now) === "OPEN";
}

// Minutes remaining in current session (0 if not open).
export function minutesRemainingInSession(now = new Date()): number {
  if (!isMarketOpen(now)) return 0;
  return SESSION_END - minutesSinceMidnightIST(now);
}

// Returns an ISO timestamp for the next regular open: skips weekends and NSE trading holidays (time.ts calendar).
export function nextSessionStart(now = new Date()): string {
  const ist = toIST(now);
  const todayStart = new Date(ist);
  todayStart.setUTCHours(9, 15, 0, 0);
  const todayStartUtc = new Date(todayStart.getTime() - IST_OFFSET_MS);

  let candidate = new Date(todayStartUtc);
  if (candidate <= now) candidate = new Date(candidate.getTime() + 24 * 3600 * 1000);

  // Skip weekends and trading holidays (bounded: no real calendar has a gap this long).
  for (let i = 0; i < 14; i++) {
    const dow = dayOfWeekIST(candidate);
    if (dow !== 0 && dow !== 6 && isTradingDay(toIST(candidate).toISOString().slice(0, 10))) break;
    candidate = new Date(candidate.getTime() + 24 * 3600 * 1000);
  }
  return candidate.toISOString();
}
