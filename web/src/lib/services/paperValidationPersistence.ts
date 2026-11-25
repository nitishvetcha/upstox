// Cloud checkpoint/recovery for paper validation evidence. It never places orders.
// Postgres is optional in local/test environments; on Render, DATABASE_URL makes it
// the recovery source whenever an ephemeral instance starts with an empty local ledger.
import { getPaperTradingEngine } from "./paperStore.ts";
import { savePaperLedger } from "./paperLedgerStore.ts";
import {
  listPaperOpportunities,
  savePaperOpportunity,
} from "./paperOpportunityStore.ts";
import {
  loadPaperValidationSnapshot,
  savePaperValidationSnapshot,
  supabaseEnabled,
} from "./supabasePersistence.ts";

export type PaperValidationPersistenceResult = {
  enabled: boolean;
  restoredTrades: number;
  restoredOpportunities: number;
  snapshotUpdatedAt?: string;
};

export async function restorePaperValidationState(): Promise<PaperValidationPersistenceResult> {
  if (!supabaseEnabled()) return { enabled: false, restoredTrades: 0, restoredOpportunities: 0 };
  const snapshot = await loadPaperValidationSnapshot();
  if (!snapshot) return { enabled: true, restoredTrades: 0, restoredOpportunities: 0 };

  const engine = getPaperTradingEngine();
  let restoredTrades = 0;
  let restoredOpportunities = 0;

  // Never overwrite a non-empty local ledger: it may contain newer writes during a
  // live cycle. Empty means a fresh Render process after ephemeral-disk loss.
  if (engine.getTrades().length === 0 && snapshot.trades.length > 0) {
    try {
      savePaperLedger(snapshot.trades, snapshot.events);
      engine.setTrades(snapshot.trades, snapshot.events);
      restoredTrades = snapshot.trades.length;
    } catch {
      // Keep the engine fail-safe: a corrupt cloud snapshot must not be loaded.
    }
  }

  if (listPaperOpportunities().length === 0 && snapshot.opportunities.length > 0) {
    for (const opportunity of snapshot.opportunities) {
      try {
        savePaperOpportunity(opportunity);
        restoredOpportunities++;
      } catch {
        // Restore remaining records; the scheduled checkpoint will retry safely.
      }
    }
  }

  return { enabled: true, restoredTrades, restoredOpportunities, snapshotUpdatedAt: snapshot.updatedAt };
}

export async function checkpointPaperValidationState(): Promise<boolean> {
  if (!supabaseEnabled()) return false;
  const engine = getPaperTradingEngine();
  return savePaperValidationSnapshot(
    engine.getTrades(),
    engine.getEvents(),
    listPaperOpportunities(),
  );
}
