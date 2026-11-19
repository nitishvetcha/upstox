// Paper-trade ledger report and reconciliation. Pure functions over the trade ledger (PaperTrade[] + events).
// Everything reported here comes from SIMULATED paper trades. It is never evidence of live-market profitability.
import type { PaperTrade, PaperTradeEvent } from "./paperTypes.ts";
import { calculateTradePnL, r2, tradeCostsFor } from "./paperMath.ts";
import { DEFAULT_TRANSACTION_COSTS, type TransactionCostConfig } from "./services/transactionCosts.ts";
import { sampleSizeLabel, type SampleSizeLabel } from "./services/paperOpportunityStore.ts";

export const REPORT_LABEL = "SIMULATED PAPER TRADES — NOT LIVE-MARKET PROOF";
export const CLOSED_STATUSES = ["CLOSED", "TARGET_HIT", "STOPPED_OUT", "EXPIRED", "SETTLED_VERIFIED"] as const;
const isClosed = (t: PaperTrade) => (CLOSED_STATUSES as readonly string[]).includes(t.status);

export interface GroupRow { key: string; trades: number; wins: number; netPnL: number; winRate: number | null }

export interface PaperLedgerReport {
  label: typeof REPORT_LABEL;
  counts: {
    total: number;
    open: number;
    closed: number;
    pending: number;
    rejected: number;
    cancelled: number;
    settlementPending: number;
    settlementUnverified: number;
    settledVerified: number;
  };
  grossPnL: number;
  totalCosts: number;
  netPnL: number; // realized, after modeled costs
  unrealizedPnL: number;
  winRate: number | null; // 0..100
  averageWin: number | null;
  averageLoss: number | null;
  profitFactor: number | null; // null when there is no loss: never Infinity
  expectancy: number | null; // mean net P&L per closed trade (INR)
  maxDrawdown: number | null; // INR, peak-to-trough of cumulative net realized P&L in exit order
  exposure: { openPositions: number; openRisk: number; openNotional: number };
  legacyWithoutCosts: number; // closed trades recorded before costs were modeled: their net == gross
  byStrategy: GroupRow[];
  byIndex: GroupRow[];
  sampleSize: SampleSizeLabel;
}

function group(trades: PaperTrade[], key: (t: PaperTrade) => string): GroupRow[] {
  const m = new Map<string, PaperTrade[]>();
  for (const t of trades) m.set(key(t), [...(m.get(key(t)) ?? []), t]);
  return [...m.entries()]
    .map(([k, ts]) => {
      const wins = ts.filter((t) => (t.realizedPnL ?? 0) > 0).length;
      return { key: k, trades: ts.length, wins, netPnL: r2(ts.reduce((a, t) => a + (t.realizedPnL ?? 0), 0)), winRate: ts.length ? r2((wins / ts.length) * 100) : null };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function buildPaperLedgerReport(trades: PaperTrade[]): PaperLedgerReport {
  const open = trades.filter((t) => t.status === "OPEN");
  const pendingSettlement = trades.filter((t) => t.status === "SETTLEMENT_PENDING");
  const unverifiedSettlement = trades.filter((t) => t.status === "SETTLEMENT_UNVERIFIED");
  const activeUnsettled = trades.filter(
    (t) => t.status === "OPEN" || t.status === "SETTLEMENT_PENDING" || t.status === "SETTLEMENT_UNVERIFIED",
  );
  const closed = trades.filter(isClosed);
  const net = (t: PaperTrade) => t.realizedPnL ?? 0;
  const wins = closed.filter((t) => net(t) > 0);
  const losses = closed.filter((t) => net(t) < 0);

  const gp = wins.reduce((a, t) => a + net(t), 0);
  const gl = Math.abs(losses.reduce((a, t) => a + net(t), 0));

  // Drawdown over the realized-P&L curve in exit order (ties keep ledger order: stable sort).
  let cum = 0, peak = 0, dd = 0;
  for (const t of [...closed].sort((a, b) => (a.exitTimestamp ?? "").localeCompare(b.exitTimestamp ?? ""))) {
    cum += net(t);
    peak = Math.max(peak, cum);
    dd = Math.max(dd, peak - cum);
  }

  return {
    label: REPORT_LABEL,
    counts: {
      total: trades.length,
      open: open.length,
      closed: closed.length,
      pending: trades.filter((t) => t.status === "PENDING").length,
      rejected: trades.filter((t) => t.status === "REJECTED").length,
      cancelled: trades.filter((t) => t.status === "CANCELLED").length,
      settlementPending: pendingSettlement.length,
      settlementUnverified: unverifiedSettlement.length,
      settledVerified: trades.filter((t) => t.status === "SETTLED_VERIFIED").length,
    },
    grossPnL: r2(closed.reduce((a, t) => a + (t.grossPnL ?? net(t)), 0)),
    totalCosts: r2(closed.reduce((a, t) => a + (t.transactionCosts?.totalCosts ?? 0), 0)),
    netPnL: r2(closed.reduce((a, t) => a + net(t), 0)),
    unrealizedPnL: r2(open.reduce((a, t) => a + (t.unrealizedPnL ?? 0), 0)),
    winRate: closed.length ? r2((wins.length / closed.length) * 100) : null,
    averageWin: wins.length ? r2(gp / wins.length) : null,
    averageLoss: losses.length ? r2(-gl / losses.length) : null,
    profitFactor: gl > 0 ? r2(gp / gl) : null,
    expectancy: closed.length ? r2(closed.reduce((a, t) => a + net(t), 0) / closed.length) : null,
    maxDrawdown: closed.length ? r2(dd) : null,
    exposure: {
      openPositions: activeUnsettled.length,
      openRisk: r2(activeUnsettled.reduce((a, t) => a + t.riskAmount, 0)),
      openNotional: r2(activeUnsettled.reduce((a, t) => a + Math.abs(t.entryPrice) * t.quantity, 0)),
    },
    legacyWithoutCosts: closed.filter((t) => t.transactionCosts == null).length,
    byStrategy: group(closed, (t) => t.strategy),
    byIndex: group(closed, (t) => t.index),
    sampleSize: sampleSizeLabel(closed.length),
  };
}

// ── Reconciliation ───────────────────────────────────────────────────────────

export type LedgerIssueCode =
  | "DUPLICATE_TRADE_ID"
  | "DUPLICATE_OPEN_POSITION"
  | "PNL_MISMATCH"
  | "COSTS_MISMATCH"
  | "NET_NOT_GROSS_MINUS_COSTS"
  | "CLOSED_WITHOUT_EXIT"
  | "OPEN_WITH_EXIT"
  | "MISSING_OPEN_EVENT"
  | "DUPLICATE_OPEN_EVENT"
  | "MISSING_EXIT_EVENT"
  | "DUPLICATE_EXIT_EVENT"
  | "EXIT_EVENT_ON_OPEN_TRADE"
  // Phase 2.3.14 settlement reconciliation issues
  | "SETTLEMENT_PENDING_WITH_EXIT"
  | "SETTLEMENT_MISSING_EVENT"
  | "SETTLED_WITHOUT_METADATA"
  | "SETTLED_EVENT_MISMATCH"
  | "SETTLEMENT_PROVENANCE_INVALID";

export interface LedgerIssue { code: LedgerIssueCode; tradeId: string; message: string }
export interface LedgerReconciliation { ok: boolean; checkedTrades: number; issues: LedgerIssue[] }

const TOL = 0.011; // INR rounding tolerance

/**
 * Recomputes every closed trade's P&L from its own leg fills and checks the ledger's internal consistency:
 * ids unique, one open position per (index, strategy), stored gross/costs/net equal the recomputation,
 * and each trade has exactly one open event and (when closed) exactly one exit event.
 * Dashboard, API and report all derive from the same ledger, so a clean reconciliation means they agree.
 */
export function reconcileLedger(
  trades: PaperTrade[],
  events: PaperTradeEvent[],
  cfg: TransactionCostConfig = DEFAULT_TRANSACTION_COSTS,
): LedgerReconciliation {
  const issues: LedgerIssue[] = [];
  const add = (code: LedgerIssueCode, tradeId: string, message: string) => issues.push({ code, tradeId, message });

  const ids = new Set<string>();
  const openKeys = new Set<string>();
  for (const t of trades) {
    if (ids.has(t.id)) add("DUPLICATE_TRADE_ID", t.id, "trade id appears more than once");
    ids.add(t.id);

    if (
      t.status === "OPEN" ||
      t.status === "PENDING" ||
      t.status === "SETTLEMENT_PENDING" ||
      t.status === "SETTLEMENT_UNVERIFIED"
    ) {
      const k = `${t.index}|${t.strategy}`;
      if (openKeys.has(k)) add("DUPLICATE_OPEN_POSITION", t.id, `more than one open position for ${k}`);
      openKeys.add(k);
    }

    const evs = events.filter((e) => e.tradeId === t.id);
    const opened = evs.filter((e) => e.event === "PAPER_TRADE_OPENED").length;
    const exited = evs.filter((e) => e.event === "PAPER_TRADE_EXITED" || e.event === "PAPER_TRADE_EXPIRED").length;
    const stlPending = evs.filter((e) => e.event === "PAPER_TRADE_SETTLEMENT_PENDING").length;
    const stlVerified = evs.filter((e) => e.event === "PAPER_TRADE_SETTLED_VERIFIED").length;
    const stlUnverified = evs.filter((e) => e.event === "PAPER_TRADE_SETTLEMENT_UNVERIFIED").length;

    if (t.status !== "REJECTED" && t.status !== "CANCELLED") {
      if (opened === 0) add("MISSING_OPEN_EVENT", t.id, "no PAPER_TRADE_OPENED event");
      if (opened > 1) add("DUPLICATE_OPEN_EVENT", t.id, `${opened} PAPER_TRADE_OPENED events`);
    }

    if (t.status === "OPEN") {
      if (t.exitTimestamp || t.exitPrice != null || t.realizedPnL != null) add("OPEN_WITH_EXIT", t.id, "open trade carries exit data");
      if (exited > 0) add("EXIT_EVENT_ON_OPEN_TRADE", t.id, "open trade has an exit event");
      if (stlPending > 0 || stlVerified > 0 || stlUnverified > 0) add("SETTLEMENT_PENDING_WITH_EXIT", t.id, "open trade has settlement events");
    }

    if (t.status === "SETTLEMENT_PENDING") {
      if (t.exitTimestamp || t.exitPrice != null || t.realizedPnL != null) {
        add("SETTLEMENT_PENDING_WITH_EXIT", t.id, "pending settlement trade carries exit data");
      }
      if (exited > 0) add("EXIT_EVENT_ON_OPEN_TRADE", t.id, "pending settlement trade has an exit event");
      if (stlPending === 0) add("SETTLEMENT_MISSING_EVENT", t.id, "missing PAPER_TRADE_SETTLEMENT_PENDING event");
      if (stlPending > 1) add("DUPLICATE_OPEN_EVENT", t.id, "duplicate PAPER_TRADE_SETTLEMENT_PENDING events");
      if (stlVerified > 0) add("SETTLED_EVENT_MISMATCH", t.id, "pending settlement trade has settled verified event");
    }

    if (t.status === "SETTLEMENT_UNVERIFIED") {
      if (t.exitTimestamp || t.exitPrice != null || t.realizedPnL != null) {
        add("SETTLEMENT_PENDING_WITH_EXIT", t.id, "unverified settlement trade carries exit data");
      }
      if (exited > 0) add("EXIT_EVENT_ON_OPEN_TRADE", t.id, "unverified settlement trade has an exit event");
      if (stlPending === 0) add("SETTLEMENT_MISSING_EVENT", t.id, "missing PAPER_TRADE_SETTLEMENT_PENDING event");
      if (stlUnverified === 0) add("SETTLEMENT_MISSING_EVENT", t.id, "missing PAPER_TRADE_SETTLEMENT_UNVERIFIED event");
      if (stlVerified > 0) add("SETTLED_EVENT_MISMATCH", t.id, "unverified settlement trade has settled verified event");
    }

    if (t.status === "SETTLED_VERIFIED") {
      if (!t.exitTimestamp || t.exitPrice == null || t.realizedPnL == null) {
        add("CLOSED_WITHOUT_EXIT", t.id, "settled verified trade missing exit timestamp, price or P&L");
        continue;
      }
      if (stlPending === 0) add("SETTLEMENT_MISSING_EVENT", t.id, "missing PAPER_TRADE_SETTLEMENT_PENDING event");
      if (stlVerified === 0) add("SETTLEMENT_MISSING_EVENT", t.id, "missing PAPER_TRADE_SETTLED_VERIFIED event");
      if (stlVerified > 1) add("SETTLED_EVENT_MISMATCH", t.id, `${stlVerified} PAPER_TRADE_SETTLED_VERIFIED events`);
      if (exited > 0) add("DUPLICATE_EXIT_EVENT", t.id, "settled trade has unexpected market exit events");
      if (!t.settlement) {
        add("SETTLED_WITHOUT_METADATA", t.id, "settled verified trade missing settlement metadata");
      } else {
        if (!t.settlement.archiveHash || !t.settlement.csvHash || !t.settlement.tradeDate) {
          add("SETTLEMENT_PROVENANCE_INVALID", t.id, "incomplete settlement provenance hashes or trade date");
        }
      }

      const gross = calculateTradePnL(t.legs, t.quantity, true).pnl;
      const stored = t.grossPnL ?? t.realizedPnL;
      if (Math.abs(gross - stored) > TOL) add("PNL_MISMATCH", t.id, `recomputed gross ${gross} != stored ${stored}`);

      if (t.transactionCosts) {
        const c = tradeCostsFor(t.legs, t.quantity, (l) => l.exitPrice ?? l.entryFillPrice, cfg).totalCosts;
        if (Math.abs(c - t.transactionCosts.totalCosts) > TOL) add("COSTS_MISMATCH", t.id, `recomputed costs ${c} != stored ${t.transactionCosts.totalCosts}`);
        if (Math.abs(r2((t.grossPnL ?? gross) - t.transactionCosts.totalCosts) - t.realizedPnL) > TOL) {
          add("NET_NOT_GROSS_MINUS_COSTS", t.id, `net ${t.realizedPnL} != gross ${t.grossPnL ?? gross} - costs ${t.transactionCosts.totalCosts}`);
        }
      }
    }

    if (isClosed(t) && t.status !== "SETTLED_VERIFIED") {
      if (!t.exitTimestamp || t.exitPrice == null || t.realizedPnL == null) {
        add("CLOSED_WITHOUT_EXIT", t.id, "closed trade is missing exit timestamp, price or P&L");
        continue;
      }
      if (exited === 0) add("MISSING_EXIT_EVENT", t.id, "no exit event");
      if (exited > 1) add("DUPLICATE_EXIT_EVENT", t.id, `${exited} exit events`);

      const gross = calculateTradePnL(t.legs, t.quantity, true).pnl;
      const stored = t.grossPnL ?? t.realizedPnL; // legacy records: net == gross
      if (Math.abs(gross - stored) > TOL) add("PNL_MISMATCH", t.id, `recomputed gross ${gross} != stored ${stored}`);

      if (t.transactionCosts) {
        const c = tradeCostsFor(t.legs, t.quantity, (l) => l.exitPrice ?? l.entryFillPrice, cfg).totalCosts;
        if (Math.abs(c - t.transactionCosts.totalCosts) > TOL) add("COSTS_MISMATCH", t.id, `recomputed costs ${c} != stored ${t.transactionCosts.totalCosts}`);
        if (Math.abs(r2((t.grossPnL ?? gross) - t.transactionCosts.totalCosts) - t.realizedPnL) > TOL) {
          add("NET_NOT_GROSS_MINUS_COSTS", t.id, `net ${t.realizedPnL} != gross ${t.grossPnL ?? gross} - costs ${t.transactionCosts.totalCosts}`);
        }
      }
    }
  }
  return { ok: issues.length === 0, checkedTrades: trades.length, issues };
}

/**
 * Distinguishes genuine Upstox live trades from synthetic, mock, manual UI, or unverified records.
 */
export function isVerifiedLiveTrade(t: PaperTrade): boolean {
  return t.marketDataSource === "UPSTOX_LIVE";
}

/**
 * Filters a trade list to only include genuine verified-live records.
 * Excludes synthetic test fixtures, mock simulations, manual UI entries, and unverified data.
 */
export function filterVerifiedLiveTrades(trades: PaperTrade[]): PaperTrade[] {
  return trades.filter(isVerifiedLiveTrade);
}
