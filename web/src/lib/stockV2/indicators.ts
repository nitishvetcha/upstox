// Stock V2 indicators. Every output at index i uses only inputs at or before i.
export interface Bar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  // Set by the dataset loader on the flat zero-volume 15:15–15:29 closing bars. Labelled, never edited: prices are kept.
  placeholder?: boolean;
}

// Standard EMA seeded with the SMA of the first `period` values. Null until `period` values have been seen.
export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// Session VWAP from the first bar passed in. Pass one session at a time. Null while cumulative volume is zero.
export function sessionVwap(bars: Bar[]): (number | null)[] {
  const out: (number | null)[] = [];
  let pv = 0;
  let v = 0;
  for (const b of bars) {
    pv += ((b.high + b.low + b.close) / 3) * b.volume;
    v += b.volume;
    out.push(v > 0 ? pv / v : null);
  }
  return out;
}

// Wilder ATR over true range. Null until `period` true ranges exist.
export function atr(bars: Bar[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length <= period) return out;
  const tr: number[] = bars.map((b, i) =>
    i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close)),
  );
  let prev = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  out[period] = prev;
  for (let i = period + 1; i < bars.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}
