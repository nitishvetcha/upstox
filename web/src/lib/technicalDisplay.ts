// Display rules for the technical-indicator panel. Pure: no I/O, no calculation. Values come from GET /api/technical/[index].
// Null means "not available in this response" and is never shown as 0. Zero is a real value and is shown as 0.

export type TechnicalPayload = {
  index?: string;
  timeframe?: string;
  status?: string | null;
  source?: string | null;
  fetchedAt?: string | null;
  lastCandleCloseAt?: string | null;
  lastCandleAt?: string | null;
  unavailableReason?: string | null;
  ema9?: number | null;
  ema21?: number | null;
  ema50?: number | null;
  ema200?: number | null;
  rsi?: number | null;
  rsiState?: string | null;
  macd?: number | null;
  macdSignal?: number | null;
  macdHistogram?: number | null;
  macdState?: string | null;
  atr?: number | null;
  atrPercent?: number | null;
  dailyAtr?: number | null;
  vwap?: number | null;
  futuresVwap?: {
    instrument?: string | null;
    price?: number | null;
    vwap?: number | null;
    distance?: number | null;
    distancePercent?: number | null;
    state?: string | null;
    reason?: string | null;
  } | null;
  previousDayHigh?: number | null;
  previousDayLow?: number | null;
  previousDayClose?: number | null;
  openingRangeHigh?: number | null;
  openingRangeLow?: number | null;
  trend?: string | null;
};

export function isPresent(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// Returns the text to show. Missing values are "N/A", never 0.
export function fmtIndicator(v: unknown, digits = 2): { text: string; missing: boolean } {
  if (!isPresent(v)) return { text: "N/A", missing: true };
  return { text: v.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits }), missing: false };
}

export function statusBadge(status: string | null | undefined, source: string | null | undefined): { label: string; tone: "ok" | "warn" | "bad" } {
  switch (status) {
    case "LIVE":
      return { label: "LIVE", tone: "ok" };
    case "STALE":
      return { label: "STALE", tone: "warn" };
    case "END_OF_DAY":
      return { label: "END OF DAY", tone: "warn" };
    case "UNAVAILABLE":
      return { label: "UNAVAILABLE", tone: "bad" };
    default:
      // The route reports no freshness for mock or unclassified sources. Name them, never call them live.
      if (source === "MOCK") return { label: "MOCK DATA · NOT LIVE", tone: "warn" };
      return { label: "STATUS UNKNOWN", tone: "warn" };
  }
}

export type IndicatorRow = { label: string; value: string; missing: boolean; note?: string };
export type IndicatorGroup = { title: string; rows: IndicatorRow[] };

// Only indicators the response carries. Nothing is calculated here.
export function indicatorGroups(p: TechnicalPayload): IndicatorGroup[] {
  const r = (label: string, v: unknown, digits = 2, note?: string): IndicatorRow => {
    const f = fmtIndicator(v, digits);
    return { label, value: f.text, missing: f.missing, note };
  };
  const f = p.futuresVwap ?? null;
  return [
    {
      title: "Moving averages",
      rows: [r("EMA 9", p.ema9), r("EMA 21", p.ema21), r("EMA 50", p.ema50), r("EMA 200", p.ema200)],
    },
    {
      title: "Momentum and volatility",
      rows: [
        r("RSI 14", p.rsi, 1, p.rsiState ?? undefined),
        r("MACD", p.macd),
        r("MACD signal", p.macdSignal),
        r("MACD histogram", p.macdHistogram, 2, p.macdState ?? undefined),
        r("ATR 14 (candles)", p.atr),
        r("ATR % of price", p.atrPercent, 2),
        r("Daily ATR", p.dailyAtr),
      ],
    },
    {
      title: "VWAP",
      rows: [
        r("Spot VWAP", p.vwap, 2, p.vwap === null || p.vwap === undefined ? "Index candles carry no volume" : undefined),
        r("Futures VWAP", f?.vwap ?? null, 2, f?.instrument ? `${f.instrument}${f.state ? ` · ${f.state}` : ""}` : undefined),
        r("Futures price", f?.price ?? null),
        r("Futures distance from VWAP", f?.distance ?? null, 2, isPresent(f?.distancePercent) ? `${f!.distancePercent!.toFixed(2)}%` : undefined),
      ],
    },
    {
      title: "Levels",
      rows: [
        r("Previous day high", p.previousDayHigh, 0),
        r("Previous day low", p.previousDayLow, 0),
        r("Previous day close", p.previousDayClose, 0),
        r("Opening range high", p.openingRangeHigh, 0),
        r("Opening range low", p.openingRangeLow, 0),
      ],
    },
  ];
}

// True when at least one indicator is present. Used to decide between "data" and "no indicators" states.
export function hasAnyIndicator(p: TechnicalPayload): boolean {
  return indicatorGroups(p).some((g) => g.rows.some((row) => !row.missing));
}
