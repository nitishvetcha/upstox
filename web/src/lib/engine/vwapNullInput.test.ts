// Unavailable spot VWAP (null) contributes no directional score. It is not treated as zero and not replaced by futures VWAP.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mockSnapshot } from "../services/mock.ts";
import { analyzeMarket } from "./analysis.ts";
import type { Snapshot } from "../types.ts";

const NOW = new Date("2026-11-11T04:30:00.000Z");
const withVwap = (s: Snapshot, vwap: number | null): Snapshot => ({ ...s, indicators: { ...s.indicators!, vwap } });
const tech = (s: Snapshot) => analyzeMarket(s, NOW).factors.find((f) => f.key === "technical")!;
const clamp = (x: number) => Math.max(-1, Math.min(1, x));

test("null VWAP: technical direction is the average of RSI and MACD only (no VWAP term)", () => {
  const s = withVwap(mockSnapshot("nifty", NOW), null);
  const expected = (clamp((s.indicators!.rsi - 50) / 15) + Math.sign(s.indicators!.macdHist)) / 2;
  assert.ok(Math.abs(tech(s).direction - expected) < 1e-9, `got ${tech(s).direction}, expected ${expected}`);
});

test("null VWAP is not zero: a numeric VWAP of 0 is a real (above-spot) input and changes the direction", () => {
  const base = mockSnapshot("nifty", NOW);
  const nullDir = tech(withVwap(base, null)).direction;
  const zeroDir = tech(withVwap(base, 0)).direction; // spot is above 0, so this scores +1
  assert.notEqual(nullDir, zeroDir);
});

test("null VWAP note carries sign 0 and says the VWAP is unavailable", () => {
  const f = tech(withVwap(mockSnapshot("nifty", NOW), null));
  const n = f.notes[0];
  assert.equal(n.sign, 0);
  assert.match(n.text, /VWAP unavailable/);
});

test("a present spot VWAP still scores (the input is used when it exists)", () => {
  const base = mockSnapshot("nifty", NOW);
  const withPresent = tech(withVwap(base, 25000)).direction; // spot above VWAP: +1 vote
  const withNull = tech(withVwap(base, null)).direction;
  assert.notEqual(withPresent, withNull);
});

test("futures VWAP state never substitutes for an unavailable spot VWAP", () => {
  const s = withVwap(mockSnapshot("nifty", NOW), null);
  const withFut = { ...s, indicators: { ...s.indicators!, futuresVwapState: null } };
  assert.equal(tech(withFut).direction, tech(s).direction);
});
