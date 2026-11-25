import test from "node:test";
import assert from "node:assert/strict";
import { paperPortfolioRiskContext } from "./paperPortfolioRiskContext.ts";
import type { PaperTrade } from "../paperTypes.ts";

const trade = (status: PaperTrade["status"], index: PaperTrade["index"], unrealizedPnL: number | null) => ({ status, index, unrealizedPnL }) as PaperTrade;

test("portfolio risk context counts active trades and only adverse unrealized P&L", () => {
  const result = paperPortfolioRiskContext([
    trade("OPEN", "nifty", -950),
    trade("PENDING", "banknifty", 120),
    trade("CLOSED", "nifty", -500),
  ]);
  assert.deepEqual(result, {
    openPositionsCount: 2,
    unrealizedMtmLoss: 950,
    openUnderlyingSymbols: ["nifty", "banknifty"],
  });
});
