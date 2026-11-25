// Market session controller for Indian NSE.
// NSE regular session: 09:15 IST – 15:30 IST (Mon–Fri, excluding holidays).
// Holidays and special sessions come from the single NSE calendar in ../time.ts (isTradingDay, sessionWindow).
// IST = UTC+05:30.
import { isTradingDay, sessionWindow } from "../time.ts";

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

export function marketStatus(now = new Date()): MarketStatus {
  const ymd = toIST(now).toISOString().slice(0, 10);
  const win = sessionWindow(ymd);
  if (!win) return "CLOSED";
  const mins = minutesSinceMidnightIST(now);
  if (mins < win.open) return "PRE_MARKET";
  if (mins >= win.close) return "CLOSED";
  return "OPEN";
}

export function isMarketOpen(now = new Date()): boolean {
  return marketStatus(now) === "OPEN";
}

// Minutes remaining in current session (0 if not open).
export function minutesRemainingInSession(now = new Date()): number {
  if (!isMarketOpen(now)) return 0;
  const ymd = toIST(now).toISOString().slice(0, 10);
  const win = sessionWindow(ymd);
  if (!win) return 0;
  return Math.max(0, win.close - minutesSinceMidnightIST(now));
}

// Returns an ISO timestamp for the next regular or special open: skips weekends and NSE trading holidays (time.ts calendar).
export function nextSessionStart(now = new Date()): string {
  const ist = toIST(now);
  const ymd = ist.toISOString().slice(0, 10);
  const win = sessionWindow(ymd);
  const mins = minutesSinceMidnightIST(now);

  // If today's session has not opened yet:
  if (win && mins < win.open) {
    const todayOpen = new Date(ist);
    todayOpen.setUTCHours(Math.floor(win.open / 60), win.open % 60, 0, 0);
    return new Date(todayOpen.getTime() - IST_OFFSET_MS).toISOString();
  }

  // Otherwise search forward for the next trading day's session open
  let candidate = new Date(now.getTime() + 24 * 3600 * 1000);
  for (let i = 0; i < 14; i++) {
    const cIst = toIST(candidate);
    const cYmd = cIst.toISOString().slice(0, 10);
    const cWin = sessionWindow(cYmd);
    if (cWin) {
      const openDate = new Date(cIst);
      openDate.setUTCHours(Math.floor(cWin.open / 60), cWin.open % 60, 0, 0);
      return new Date(openDate.getTime() - IST_OFFSET_MS).toISOString();
    }
    candidate = new Date(candidate.getTime() + 24 * 3600 * 1000);
  }
  return new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
}
