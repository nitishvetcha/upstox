import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runEmpiricalOptionsValidation } from "./empiricalOptionsValidator.ts";
import type { Candle } from "../types.ts";

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function createCandle(
  isoTime: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 1000
): Candle {
  return {
    timestamp: isoTime,
    open,
    high,
    low,
    close,
    volume,
  };
}

describe("empiricalOptionsValidator — Stage 3 Empirical Validation Engine", () => {
  it("gracefully handles insufficient candle series (< 25 candles)", () => {
    const report = runEmpiricalOptionsValidation([]);
    assert.equal(report.tradeCount, 0);
    assert.equal(report.underlyingSpotMetrics.netR, 0);
    assert.equal(report.frictionInclusiveOptionsMetrics.netR, 0);
    assert.equal(report.observedTickDataRequirement.liveExecutionVerdict, "NO-GO");
    assert.equal(report.observedTickDataRequirement.observedHistoricalTicksPresent, false);
  });

  it("enforces Next-Bar Open execution (zero same-bar close look-ahead fill)", () => {
    const candles: Candle[] = [];
    const date = "2026-11-20";

    // 25 warmup bars on previous day (2026-11-19) to initialize EMAs
    for (let i = 0; i < 25; i++) {
      const h = pad(Math.floor(i / 4) + 4);
      const m = pad((i % 4) * 15);
      candles.push(createCandle(`2026-11-19T${h}:${m}:00.000Z`, 100, 102, 98, 100));
    }

    // Trade Day (2026-11-20):
    // 09:15 - 09:30 IST (03:45 UTC, 04:00 UTC) -> Opening Range: High=105, Low=95
    candles.push(createCandle(`${date}T03:45:00.000Z`, 100, 105, 98, 102));
    candles.push(createCandle(`${date}T04:00:00.000Z`, 102, 104, 95, 100));

    // Signal Bar: 09:45 IST (04:15 UTC) -> Closes at 110 (> ORB High 105)
    candles.push(createCandle(`${date}T04:15:00.000Z`, 101, 111, 100, 110));

    // Execution Bar: 10:00 IST (04:30 UTC) -> Opens at 112 (slippage/gap up from 110 close)
    // Target 2 reached on this bar
    candles.push(createCandle(`${date}T04:30:00.000Z`, 112, 160, 111, 155));

    const report = runEmpiricalOptionsValidation(candles, { symbol: "NIFTY" });
    assert.equal(report.tradeCount, 1);
    const trade = report.trades[0];

    // Signal was at 04:15 UTC with close 110
    assert.equal(trade.signalClosePrice, 110);
    assert.equal(trade.signalTime, `${date}T04:15:00.000Z`);

    // Verification: Entry MUST fill at Next Bar Open (112), NOT at signal close (110)
    assert.equal(trade.entryPrice, 112);
    assert.equal(trade.entryTime, `${date}T04:30:00.000Z`);
  });

  it("applies conservative Stop-First precedence when Stop and Target collide on same bar", () => {
    const candles: Candle[] = [];
    const date = "2026-11-20";

    // 25 warmup bars
    for (let i = 0; i < 25; i++) {
      const h = pad(Math.floor(i / 4) + 4);
      const m = pad((i % 4) * 15);
      candles.push(createCandle(`2026-11-19T${h}:${m}:00.000Z`, 100, 102, 98, 100));
    }

    // Trade Day: ORB High 105, Low 95
    candles.push(createCandle(`${date}T03:45:00.000Z`, 100, 105, 98, 102));
    candles.push(createCandle(`${date}T04:00:00.000Z`, 102, 104, 95, 100));

    // Signal Bar: 09:45 IST -> Close 110
    candles.push(createCandle(`${date}T04:15:00.000Z`, 101, 111, 100, 110));

    // Next Bar Open: 10:00 IST -> Opens at 110
    // Then extreme wick: Low plunges to 80 (below stop loss ~95), High surges to 160 (above target 2)
    candles.push(createCandle(`${date}T04:30:00.000Z`, 110, 160, 80, 115));

    const report = runEmpiricalOptionsValidation(candles, { symbol: "NIFTY" });
    assert.equal(report.tradeCount, 1);
    const trade = report.trades[0];

    // Under conservative precedence, Stop Loss MUST be evaluated first
    assert.equal(trade.outcome, "STOP_LOSS_HIT");
    assert.ok(trade.spotPnlR < 0, `Expected negative spot R, got ${trade.spotPnlR}`);
  });

  it("correctly calculates statutory friction drag on options P&L", () => {
    const candles: Candle[] = [];
    const date = "2026-11-20";

    // Warmup
    for (let i = 0; i < 25; i++) {
      const h = pad(Math.floor(i / 4) + 4);
      const m = pad((i % 4) * 15);
      candles.push(createCandle(`2026-11-19T${h}:${m}:00.000Z`, 100, 102, 98, 100));
    }

    // Trade Day: ORB High 105, Low 95
    candles.push(createCandle(`${date}T03:45:00.000Z`, 100, 105, 98, 102));
    candles.push(createCandle(`${date}T04:00:00.000Z`, 102, 104, 95, 100));

    // Signal Bar: Close 110
    candles.push(createCandle(`${date}T04:15:00.000Z`, 101, 111, 100, 110));

    // Entry Bar (Target 2 hit):
    candles.push(createCandle(`${date}T04:30:00.000Z`, 110, 180, 109, 175));

    const report = runEmpiricalOptionsValidation(candles, { symbol: "NIFTY", lotSize: 75 });
    assert.equal(report.tradeCount, 1);
    const trade = report.trades[0];

    // Verify friction fields exist and are deducted
    assert.ok(trade.transactionCostsRs > 0, "Transaction costs must be > 0");
    assert.ok(trade.slippageRs > 0, "Slippage must be > 0");
    assert.ok(
      trade.optionsNetPnlRs < trade.optionsGrossPnlRs,
      "Net options PnL must be less than gross options PnL"
    );
    assert.equal(
      trade.optionsNetPnlRs,
      trade.optionsGrossPnlRs - trade.transactionCostsRs - trade.slippageRs
    );
    assert.ok(report.optionsFrictionDragR !== undefined);
  });

  it("refuses to manufacture walk-forward evidence from fewer than 60 trades", () => {
    const candles: Candle[] = [];
    const baseDate = new Date("2026-09-01T00:00:00.000Z");

    // Warmup bars on 2026-08-31 to establish EMAs
    for (let i = 0; i < 25; i++) {
      const h = i.toString().padStart(2, "0");
      candles.push(createCandle(`2026-08-31T${h}:00:00.000Z`, 100, 102, 98, 100));
    }

    // Synthesize 20 trading sessions with consistent trend breakouts
    for (let day = 0; day < 20; day++) {
      const d = new Date(baseDate.getTime() + day * 86400000);
      const dStr = d.toISOString().split("T")[0];
      const basePrice = 100 + day * 10;

      // Morning ORB (09:15 - 09:30 IST)
      candles.push(createCandle(`${dStr}T03:45:00.000Z`, basePrice, basePrice + 4, basePrice - 4, basePrice));
      candles.push(createCandle(`${dStr}T04:00:00.000Z`, basePrice, basePrice + 3, basePrice - 3, basePrice));

      // Signal Bar: 09:45 IST (Close above ORB high)
      candles.push(createCandle(`${dStr}T04:15:00.000Z`, basePrice, basePrice + 10, basePrice, basePrice + 8));

      // Entry & Target Hit Bar: 10:00 IST
      candles.push(createCandle(`${dStr}T04:30:00.000Z`, basePrice + 8, basePrice + 80, basePrice + 7, basePrice + 75));

      // Session Close Bar: 15:15 IST (09:45 UTC)
      candles.push(createCandle(`${dStr}T09:45:00.000Z`, basePrice + 75, basePrice + 76, basePrice + 74, basePrice + 75));
    }

    const report = runEmpiricalOptionsValidation(candles, { symbol: "NIFTY" });
    assert.ok(report.tradeCount >= 15, `Expected >= 15 trades, got ${report.tradeCount}`);
    assert.equal(report.walkForwardAnalysis.windows.length, 0);
    assert.equal(report.walkForwardAnalysis.verdict, "OOS_FAILURE");
    assert.equal(report.observedTickDataRequirement.liveExecutionVerdict, "NO-GO");
  });

  it("keeps a modeled vertical spread below the evidence ceiling", () => {
    const candles: Candle[] = [];
    const baseDate = new Date("2026-09-01T00:00:00.000Z");

    for (let i = 0; i < 25; i++) {
      const h = i.toString().padStart(2, "0");
      candles.push(createCandle(`2026-08-31T${h}:00:00.000Z`, 100, 102, 98, 100));
    }

    for (let day = 0; day < 20; day++) {
      const d = new Date(baseDate.getTime() + day * 86400000);
      const dStr = d.toISOString().split("T")[0];
      const basePrice = 100 + day * 10;

      candles.push(createCandle(`${dStr}T03:45:00.000Z`, basePrice, basePrice + 4, basePrice - 4, basePrice, 1000));
      candles.push(createCandle(`${dStr}T04:00:00.000Z`, basePrice, basePrice + 3, basePrice - 3, basePrice, 1000));
      candles.push(createCandle(`${dStr}T04:15:00.000Z`, basePrice, basePrice + 10, basePrice, basePrice + 8, 1800));
      candles.push(createCandle(`${dStr}T04:30:00.000Z`, basePrice + 8, basePrice + 80, basePrice + 7, basePrice + 75, 1000));
      candles.push(createCandle(`${dStr}T09:45:00.000Z`, basePrice + 75, basePrice + 76, basePrice + 74, basePrice + 75, 1000));
    }

    const report = runEmpiricalOptionsValidation(candles, {
      symbol: "NIFTY",
      executionMode: "VERTICAL_SPREAD",
      volumeFilter: true,
      timeWindowFilter: true,
    });

    assert.equal(report.executionMode, "VERTICAL_SPREAD");
    assert.equal(report.volumeFilterEnabled, true);
    assert.ok(report.frictionInclusiveOptionsMetrics.netR > 0, "Vertical spread must yield positive net R");
    assert.ok(report.scoreBreakdown.optionsViabilityScore <= 3.0, `Modeled data must not earn a high options score, got ${report.scoreBreakdown.optionsViabilityScore}`);
    assert.ok(report.scoreBreakdown.spotStrategyScore >= 8.0, `Expected spot score >= 8.0, got ${report.scoreBreakdown.spotStrategyScore}`);
    assert.equal(report.observedTickDataRequirement.liveExecutionVerdict, "NO-GO");
  });

  it("applies volume confirmation filter to reject low-volume false breakouts", () => {
    const candles: Candle[] = [];
    const date = "2026-11-20";

    // 25 warmup bars with 10,000 volume each
    for (let i = 0; i < 25; i++) {
      const h = pad(Math.floor(i / 4) + 4);
      const m = pad((i % 4) * 15);
      candles.push(createCandle(`2026-11-19T${h}:${m}:00.000Z`, 100, 102, 98, 100, 10000));
    }

    // Trade Day: ORB High 105, Low 95 with normal volume
    candles.push(createCandle(`${date}T03:45:00.000Z`, 100, 105, 98, 102, 10000));
    candles.push(createCandle(`${date}T04:00:00.000Z`, 102, 104, 95, 100, 10000));

    // Signal Bar: Breakout price (110 > 105), but extremely weak volume (500 << 1.25 * 10000)
    candles.push(createCandle(`${date}T04:15:00.000Z`, 101, 111, 100, 110, 500));
    candles.push(createCandle(`${date}T04:30:00.000Z`, 110, 180, 109, 175, 10000));

    // With volumeFilter enabled, this trade must be REJECTED
    const filteredReport = runEmpiricalOptionsValidation(candles, {
      symbol: "NIFTY",
      volumeFilter: true,
    });
    assert.equal(filteredReport.tradeCount, 0, "Low-volume breakout should be filtered out");

    // Without volumeFilter, the trade triggers
    const unfilteredReport = runEmpiricalOptionsValidation(candles, {
      symbol: "NIFTY",
      volumeFilter: false,
    });
    assert.equal(unfilteredReport.tradeCount, 1, "Unfiltered should trigger trade");
  });
});
