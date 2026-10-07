import type { PaperTrade, PaperTradeEvent } from "../paperTypes.ts";
import { PaperTradingEngine } from "../paperEngine.ts";

let globalEngineInstance: PaperTradingEngine | null = null;
const globalTrades: PaperTrade[] = [];
const globalEvents: PaperTradeEvent[] = [];

export function getPaperTradingEngine(): PaperTradingEngine {
  if (!globalEngineInstance) {
    globalEngineInstance = new PaperTradingEngine();
    globalEngineInstance.setTrades(globalTrades, globalEvents);
  }
  return globalEngineInstance;
}
