// Closing-window placeholders: labelled at load time, prices untouched, counted on the dataset. Deterministic; no I/O.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EXPECTED_BARS, isClosingPlaceholder, parseSessionFile } from "./dataset.ts";
import type { Bar } from "./indicators.ts";

// One 375-bar session: 09:15 … 15:29. Bars 15:15–15:29 are flat zero-volume placeholders except one real bar (15:28).
function session(date: string, symbol: string, overrides: Partial<Record<number, { volume: number }>> = {}) {
  const candles = [];
  for (let i = 0; i < EXPECTED_BARS; i++) {
    const minute = 9 * 60 + 15 + i; // IST minutes
    const hh = String(Math.floor(minute / 60)).padStart(2, "0");
    const mm = String(minute % 60).padStart(2, "0");
    const isClosing = minute >= 15 * 60 + 15;
    const price = 1000 + i * 0.5;
    const override = overrides[i];
    const volume = override ? override.volume : isClosing ? 0 : 1000 + i;
    candles.push({
      timestamp: `${date}T${hh}:${mm}:00+05:30`,
      open: isClosing && volume === 0 ? price : price - 1,
      high: isClosing && volume === 0 ? price : price + 2,
      low: isClosing && volume === 0 ? price : price - 2,
      close: price,
      volume,
      openInterest: 0,
    });
  }
  return { status: "OK", date, symbol, interval: "1minute", candles };
}

test("CP1. the 14 flat zero-volume bars in 15:15–15:29 are labelled; the rest are not", () => {
  // 15:28 (index 373) carries real volume, as in the stored files; 15:15–15:27 and 15:29 are the 14 placeholders.
  const parsed = parseSessionFile(`2026-08-06-ADANIENT.json`, session("2026-08-06", "ADANIENT", { 373: { volume: 500 } }));
  assert.ok("bars" in parsed, "session with 375 bars is accepted");
  const labelled = parsed.bars.filter((b) => b.placeholder);
  assert.equal(labelled.length, 14);
  for (const b of labelled) assert.ok(b.timestamp.slice(11, 16) >= "15:15" && b.timestamp.slice(11, 16) <= "15:29", b.timestamp);
  assert.equal(parsed.bars.filter((b) => !b.placeholder).length, EXPECTED_BARS - 14);
});

test("CP2. labelling never changes prices or volume (the simulator's inputs are the stored values)", () => {
  const raw = session("2026-08-06", "ADANIENT");
  const parsed = parseSessionFile(`2026-08-06-ADANIENT.json`, raw);
  assert.ok("bars" in parsed);
  const byTs = new Map(raw.candles.map((c) => [c.timestamp, c]));
  for (const b of parsed.bars) {
    const c = byTs.get(b.timestamp)!;
    assert.equal(b.close, c.close);
    assert.equal(b.open, c.open);
    assert.equal(b.high, c.high);
    assert.equal(b.low, c.low);
    assert.equal(b.volume, c.volume);
  }
});

test("CP3. a closing bar with real volume is not a placeholder, even if its price is flat", () => {
  const b: Bar = { timestamp: "2026-08-06T15:20:00+05:30", open: 10, high: 10, low: 10, close: 10, volume: 500 };
  assert.equal(isClosingPlaceholder(b), false);
});

test("CP4. a flat zero-volume bar outside 15:15–15:29 is not a placeholder", () => {
  assert.equal(isClosingPlaceholder({ timestamp: "2026-08-06T11:00:00+05:30", open: 10, high: 10, low: 10, close: 10, volume: 0 }), false);
  assert.equal(isClosingPlaceholder({ timestamp: "2026-08-06T15:30:00+05:30", open: 10, high: 10, low: 10, close: 10, volume: 0 }), false);
});

test("CP5. a zero-volume closing bar whose OHLC is not flat is not labelled (a real print, not a forward fill)", () => {
  assert.equal(isClosingPlaceholder({ timestamp: "2026-08-06T15:18:00+05:30", open: 10, high: 11, low: 9, close: 10, volume: 0 }), false);
});

test("CP6. the 375-bar rule still rejects a session with a missing bar", () => {
  const raw = session("2026-08-06", "ADANIENT");
  raw.candles.pop();
  const parsed = parseSessionFile(`2026-08-06-ADANIENT.json`, raw);
  assert.ok("reason" in parsed);
});
