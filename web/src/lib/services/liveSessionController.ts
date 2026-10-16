// Market session controller for Indian NSE.
// NSE regular session: 09:15 IST – 15:30 IST (Mon–Fri, excluding holidays).
// This module does NOT maintain a holiday list — that is out of scope.
// IST = UTC+05:30.

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

// Returns an ISO timestamp for next market open (approximate — no holiday calendar).
export function nextSessionStart(now = new Date()): string {
  const ist = toIST(now);
  const todayStart = new Date(ist);
  todayStart.setUTCHours(9, 15, 0, 0);
  const todayStartUtc = new Date(todayStart.getTime() - IST_OFFSET_MS);

  let candidate = new Date(todayStartUtc);
  if (candidate <= now) candidate = new Date(candidate.getTime() + 24 * 3600 * 1000);

  // Skip weekends
  for (let i = 0; i < 7; i++) {
    const dow = dayOfWeekIST(candidate);
    if (dow !== 0 && dow !== 6) break;
    candidate = new Date(candidate.getTime() + 24 * 3600 * 1000);
  }
  return candidate.toISOString();
}
