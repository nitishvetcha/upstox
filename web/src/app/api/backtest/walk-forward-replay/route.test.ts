import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "./route.ts";
import { saveHistoricalCandles } from "../../../../lib/services/historicalDataPipeline.ts";
import type { Candle } from "../../../../lib/types.ts";

test("API-WFR-1: POST /api/backtest/walk-forward-replay rejects unknown underlying", async () => {
  const req = new Request("http://localhost:3000/api/backtest/walk-forward-replay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ underlying: "invalid_sym" }),
  });

  const res = await POST(req);
  assert.equal(res.status, 400);
});

test("API-WFR-2: POST /api/backtest/walk-forward-replay runs statistical validation on ingested series", async () => {
  const candles: Candle[] = [];
  const tradingDays = ["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23", "2026-11-25"];
  for (const day of tradingDays) {
    for (let slot = 0; slot < 24; slot++) {
      const minutesFromOpen = slot * 15;
      const istHour = 9 + Math.floor((15 + minutesFromOpen) / 60);
      const istMin = (15 + minutesFromOpen) % 60;
      const utcMs = Date.UTC(2026, 10, parseInt(day.split("-")[2], 10), istHour - 5, istMin - 30);
      const wave = Math.sin((slot + (tradingDays.indexOf(day) * 24)) / 3) * 120;
      const p = 25000 + wave;
      candles.push({
        timestamp: new Date(utcMs).toISOString(),
        open: p - 10,
        high: p + 25,
        low: p - 25,
        close: p,
        volume: 5000,
      });
    }
  }
  saveHistoricalCandles("nifty", "15m", candles);

  const req = new Request("http://localhost:3000/api/backtest/walk-forward-replay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ underlying: "nifty", timeframe: "15m", inSampleRatio: 0.70 }),
  });

  const res = await POST(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.report.underlying, "nifty");
  assert.ok(data.report.walkForward.inSample.candlesCount > 0);
  assert.ok(data.report.walkForward.outOfSample.candlesCount > 0);
  assert.ok(data.report.bootstrap.resamples > 0);
});
