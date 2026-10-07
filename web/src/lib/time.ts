// IST is UTC+5:30 with no DST, so a fixed offset is exact.
const IST_OFFSET_MIN = 330;

export function istMinutes(d: Date) {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return { minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(), weekday: shifted.getUTCDay() };
}

export type MarketStatus = "PRE-OPEN" | "OPEN" | "CLOSED";

// NSE equity/F&O TRADING holidays for 2026 (IST session dates; weekends are handled separately and not listed).
// Source: Upstox GET /v2/market/holidays (holiday_type TRADING_HOLIDAY with NSE/NFO closed), fetched 2026-10-06.
// Cross-checked: every weekday from 2026-01-01 to 2026-10-05 without a NIFTY daily candle is exactly the dates up to
// 2026-10-02 below. 2026-10-20 onward are from the Upstox list only (not yet observable in data). Settlement holidays
// and special-timing sessions (NSE trades) are deliberately excluded. Extend each year from the same source.
// 2025 entries (from the 2025-07-01 data start onward): Upstox GET /v2/market/holidays/{date}, each TRADING_HOLIDAY
// with NSE closed, and each a weekday with no NIFTY daily candle (and no other such weekday exists).
export const NSE_HOLIDAYS = new Set<string>([
  "2025-08-15", // Independence Day
  "2025-08-27", // Ganesh Chaturthi
  "2025-10-02", // Mahatma Gandhi Jayanti / Dussehra
  "2025-10-22", // Diwali-Balipratipada
  "2025-11-05", // Prakash Gurpurb Sri Guru Nanak Dev
  "2025-12-25", // Christmas
  "2026-01-15", // Municipal Corporation Election
  "2026-01-26", // Republic Day
  "2026-03-03", // Holi
  "2026-03-26", // Ram Navami
  "2026-03-31", // Mahavir Jayanti
  "2026-04-03", // Good Friday
  "2026-04-14", // Dr. Baba Saheb Ambedkar Jayanti
  "2026-05-01", // Maharashtra Day
  "2026-05-28", // Bakri Id / Eid-ul-Adha
  "2026-06-26", // Muharram
  "2026-09-14", // Ganesh Chaturthi
  "2026-10-02", // Gandhi Jayanti
  "2026-10-20", // Dussehra
  "2026-11-10", // Diwali-Balipratipada
  "2026-11-24", // Guru Nanak Jayanti
  "2026-12-25", // Christmas
]);

// SPECIAL_TIMING sessions (Upstox holidays API, NSE open window in IST minutes). These are trading days, including on
// a weekend, but only inside the window; a shortened session is never used as a contract expiry day.
export const NSE_SPECIAL_SESSIONS: Record<string, { open: number; close: number; label: string }> = {
  "2025-10-21": { open: 13 * 60 + 45, close: 14 * 60 + 45, label: "Diwali Laxmi Pujan (Muhurat)" },
  "2026-02-01": { open: 9 * 60 + 15, close: 15 * 60 + 30, label: "Budget Day Session (Sunday)" },
  "2026-11-08": { open: 18 * 60, close: 19 * 60, label: "Diwali Laxmi Pujan (Muhurat, Sunday)" },
};
export const REGULAR_SESSION = { open: 9 * 60 + 15, close: 15 * 60 + 30 };

export function isTradingDay(ymd: string) {
  if (NSE_SPECIAL_SESSIONS[ymd]) return true;
  const weekday = new Date(ymd + "T00:00:00Z").getUTCDay();
  return weekday !== 0 && weekday !== 6 && !NSE_HOLIDAYS.has(ymd);
}

// Session window (IST minutes) for a trading day; null when closed.
export function sessionWindow(ymd: string): { open: number; close: number } | null {
  return NSE_SPECIAL_SESSIONS[ymd] ?? (isTradingDay(ymd) ? REGULAR_SESSION : null);
}

// A full regular session: the only kind of day an exchange expiry is placed on (holiday/special → previous day).
export const isRegularSession = (ymd: string) => isTradingDay(ymd) && !NSE_SPECIAL_SESSIONS[ymd];

export function marketStatus(d: Date): MarketStatus {
  const { minutes } = istMinutes(d);
  const w = sessionWindow(istToday(d));
  if (!w) return "CLOSED";
  if (minutes >= w.open - 15 && minutes < w.open) return "PRE-OPEN";
  if (minutes >= w.open && minutes < w.close) return "OPEN";
  return "CLOSED";
}

export function fmtIst(iso: string | Date, withSeconds = true) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: false,
  });
}

export function fmtDate(ymd: string) {
  return new Date(ymd + "T00:00:00Z").toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Spec thresholds: < 30 s LIVE, 30–120 s AGING, > 120 s STALE. News refreshes slower, so it scales by `slow`.
export function freshnessOf(fetchedAt: string | null, now: Date, slow = 1) {
  if (!fetchedAt) return { freshnessSeconds: null, freshness: null };
  const freshnessSeconds = Math.max(0, Math.round((now.getTime() - new Date(fetchedAt).getTime()) / 1000));
  const freshness = freshnessSeconds > 120 * slow ? "STALE" : freshnessSeconds >= 30 * slow ? "AGING" : "LIVE";
  return { freshnessSeconds, freshness } as const;
}

// Today's date in IST as YYYY-MM-DD.
export function istToday(now: Date) {
  return new Date(now.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

// Latest active or completed trading session date in IST (YYYY-MM-DD).
export function latestTradingSessionDate(now: Date): string {
  const d = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  const { minutes } = istMinutes(now);
  const todayYmd = d.toISOString().slice(0, 10);

  // If today is a trading day and it is past market open (09:15 IST):
  // If after 09:15 IST today, today's session is active or completed.
  if (isTradingDay(todayYmd) && minutes >= 9 * 60 + 15) {
    return todayYmd;
  }

  // Otherwise (before 09:15 IST, or weekend/holiday), step backwards to find the last completed trading day.
  for (let i = 1; i <= 10; i++) {
    const prev = new Date(d.getTime() - i * 86_400_000);
    const ymd = prev.toISOString().slice(0, 10);
    if (isTradingDay(ymd)) {
      return ymd;
    }
  }
  return todayYmd;
}

export interface TradeFreshnessResult {
  freshnessSeconds: number | null;
  freshness: "LIVE" | "AGING" | "END_OF_DAY" | "STALE";
  source: "LIVE" | "END_OF_DAY" | "STALE" | "UNAVAILABLE";
}

export function tradeFreshnessOf(
  lastTradeTime: string | Date | null | undefined,
  now: Date,
  slow = 1,
): TradeFreshnessResult {
  if (!lastTradeTime) {
    return { freshnessSeconds: null, freshness: "STALE", source: "UNAVAILABLE" };
  }
  const tradeDate = typeof lastTradeTime === "string" ? new Date(lastTradeTime) : lastTradeTime;
  if (isNaN(tradeDate.getTime())) {
    return { freshnessSeconds: null, freshness: "STALE", source: "UNAVAILABLE" };
  }

  const ageSeconds = Math.max(0, Math.round((now.getTime() - tradeDate.getTime()) / 1000));
  const status = marketStatus(now);

  if (status === "OPEN" || status === "PRE-OPEN") {
    if (ageSeconds > 120 * slow) {
      return { freshnessSeconds: ageSeconds, freshness: "STALE", source: "STALE" };
    }
    const freshness = ageSeconds >= 30 * slow ? "AGING" : "LIVE";
    return { freshnessSeconds: ageSeconds, freshness, source: "LIVE" };
  }

  // Market is CLOSED (after 15:30 IST, before 09:15 IST, or weekend/holiday)
  const tradeYmd = istToday(tradeDate);
  const latestSessionYmd = latestTradingSessionDate(now);

  if (tradeYmd === latestSessionYmd) {
    return { freshnessSeconds: ageSeconds, freshness: "END_OF_DAY", source: "END_OF_DAY" };
  }

  return { freshnessSeconds: ageSeconds, freshness: "STALE", source: "STALE" };
}
