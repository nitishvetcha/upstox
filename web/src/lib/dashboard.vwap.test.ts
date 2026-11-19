// Spot VWAP is shown only from the analysis. The snapshot indicators.vwap (mock literal, no verified provenance) is never shown as VWAP.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mockSnapshot } from "./services/mock.ts";
import { analyze } from "./engine/strategy.ts";
import { toDashboardView } from "./dashboard.ts";
import { DEFAULT_RISK_CONFIG } from "./services/risk/riskConfig.ts";

const NOW = new Date("2026-11-11T04:30:00.000Z");
const CFG = { ...DEFAULT_RISK_CONFIG, accountCapital: 500_000 };

test("mock snapshot carries null spot VWAP (no unsupported literal), and the dashboard view shows it as null", () => {
  const s = mockSnapshot("nifty", NOW);
  assert.equal(s.indicators?.vwap, null, "spot VWAP is unavailable for index candles");
  const a = analyze(s, NOW, CFG, undefined);
  const v = toDashboardView(a, CFG, NOW.toISOString(), NOW);
  assert.equal(v.technicals.vwap, null);
});

test("snapshot vwap does not leak into the view for BANK NIFTY either", () => {
  const s = mockSnapshot("banknifty", NOW);
  const v = toDashboardView(analyze(s, NOW, CFG, undefined), CFG, NOW.toISOString(), NOW);
  assert.equal(v.technicals.vwap, null);
});
