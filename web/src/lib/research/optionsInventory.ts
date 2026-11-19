// Historical Options Research Lab — data inventory and experiment readiness. Pure: no I/O.
// Research is read-only and separate from the live options audit (options-audit-1) and all frozen evaluations.

export const INVENTORY_VERSION = "options-inventory-1";

// Every dataset is labelled with exactly one class; only GENUINE_HISTORICAL may back a performance claim.
export type DataClass =
  | "GENUINE_HISTORICAL"       // exchange observations with their own timestamps, from the broker's history API
  | "LIVE_SNAPSHOT"            // current quotes captured live (e.g. audit rounds): genuine, but not a history
  | "MODEL_DERIVED_SYNTHETIC"  // computed by a model (e.g. Black-Scholes prices): never historical evidence
  | "TEST_FIXTURE";

export interface ContractProbe {
  index: string; symbol: string; expiry: string; type: "CE" | "PE";
  dailyBars: number; dailyFirst: string | null;
  minuteBars: number; minuteFirst: string | null; minuteLast: string | null;
  volumePresent: boolean; oiPresent: boolean;
}

export interface Inventory {
  version: string; id: string; createdAt: string;
  expiredHistory: { available: boolean; status: number | null; errorCode: string | null; message: string | null };
  completedExpiriesRetrievable: number; // expiries whose contracts can be fetched through to expiry
  activeContracts: ContractProbe[];
  activeExpiries: Record<string, { count: number; nearest: string | null; furthest: string | null }>;
  underlying: Record<string, { dailyFirst: string | null; dailyBars: number; intradayEarliest: string }>;
  fields: Record<string, { available: boolean; source: string; note: string }>;
  localDatasets: { path: string; class: DataClass; files: number; note: string }[];
}

// ── Experiments: each declares the data it needs; it is enabled only if the inventory proves that data exists ─
export interface Experiment { id: string; title: string; enabled: boolean; reasons: string[]; needs: string[] }

export const MIN_COMPLETED_EXPIRIES = 40; // ≈ 1 year of weeklies split into development + untouched validation

export function experimentReadiness(inv: Inventory): Experiment[] {
  const expired = inv.expiredHistory.available;
  const bidAsk = inv.fields.bidAsk?.available ?? false;
  const completedCycles = expired ? inv.completedExpiriesRetrievable : 0;
  const make = (id: string, title: string, needs: string[], blockers: (string | false)[]) => {
    const reasons = blockers.filter((b): b is string => !!b);
    return { id, title, needs, enabled: reasons.length === 0, reasons };
  };
  const plus = !expired && `Expired-contract history unavailable (${inv.expiredHistory.errorCode ?? "no access"}: ${inv.expiredHistory.message ?? "Upstox Plus required"})`;
  return [
    make("expiry-cycle-backtest", "Option buying/selling held to target, stop or expiry",
      ["1-min or 5-min candles for expired contracts", `≥ ${MIN_COMPLETED_EXPIRIES} completed expiries per index`, "historical lot sizes"],
      [plus, completedCycles < MIN_COMPLETED_EXPIRIES && `${completedCycles} completed expiry cycles retrievable (need ≥ ${MIN_COMPLETED_EXPIRIES})`]),
    make("intraday-option-replay", "Intraday option trades replayed minute by minute",
      ["1-min candles for expired contracts across ≥ 2 years", "historical bid/ask or a validated spread model"],
      [plus, !bidAsk && "No historical bid/ask: executable fills cannot be modelled credibly"]),
    make("iv-history-study", "Historical IV levels, skew and IV-vs-realised-volatility",
      ["timestamped historical option prices aligned with the underlying at the same minute", "≥ 1 year of expiries"],
      [plus]),
    make("active-contract-exploration", "Exploratory look at currently-listed contracts only",
      ["genuine candles for unexpired contracts (available)"],
      ["Only unexpired contracts exist: no completed expiry, a few weeks per contract, and survivorship by construction. Not usable for performance claims; no development/validation split is possible"]),
  ];
}

// ── Local dataset classification ──────────────────────────────────────────────
export function classifyLocalDataset(dirName: string): { class: DataClass; note: string } {
  if (dirName === "backtests") return { class: "MODEL_DERIVED_SYNTHETIC", note: "Option prices simulated with Black-Scholes from index candles; not historical option observations" };
  if (dirName === "options-audit") return { class: "LIVE_SNAPSHOT", note: "Live audit rounds (current quotes); evidence of data quality, not a history" };
  if (dirName === "history") return { class: "GENUINE_HISTORICAL", note: "Upstox candles for indices and stocks only; contains no option contracts" };
  if (dirName.startsWith(".test") || dirName.includes("fixture")) return { class: "TEST_FIXTURE", note: "Test data" };
  return { class: "LIVE_SNAPSHOT", note: "Application records, not historical option data" };
}
