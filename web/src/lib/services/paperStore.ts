import { PaperTradingEngine } from "../paperEngine.ts";
import { logEvent } from "../ops/structuredLog.ts";
import { loadPaperLedger, savePaperLedger } from "./paperLedgerStore.ts";

// Process-wide singleton, kept on globalThis so every route bundle shares one engine (and one in-memory ledger).
// State is durable: loaded from .data/paper-trades on first use and saved on every change, so a restart resumes
// open positions with identical P&L and cannot re-open them (the duplicate guard sees them).
const g = globalThis as unknown as { __upstoxPaperEngine?: PaperTradingEngine };

export function getPaperTradingEngine(): PaperTradingEngine {
  if (!g.__upstoxPaperEngine) {
    const ledger = loadPaperLedger();
    if (ledger.error) logEvent("error", "paper_ledger_load_failed", { reason: ledger.error });
    else if (ledger.recoveredFromBackup) logEvent("warn", "paper_ledger_recovered_from_backup", {});
    // allowMock: false: a MOCK snapshot can never open a trade in the real ledger.
    const engine = new PaperTradingEngine(undefined, {
      allowMock: false,
      blocked: ledger.error,
      onChange: (trades, events) => {
        try { savePaperLedger(trades, events); }
        catch (e) { logEvent("error", "paper_ledger_save_failed", { message: (e as Error).message }); throw e; }
      },
    });
    engine.setTrades(ledger.trades, ledger.events);
    g.__upstoxPaperEngine = engine;
  }
  return g.__upstoxPaperEngine;
}
