// Stock V2 experiment runner. Pure: takes a loaded dataset and returns results. No I/O, no network.
import type { HistoricalDataset } from "./dataset.ts";
import { summarize, groupBy } from "./metrics.ts";
import type { CostScenario } from "./risk.ts";
import { SCENARIOS } from "./risk.ts";
import { simulateStock, type GateMode, type SessionOutcome, type Trade } from "./simulate.ts";
import type { StrategyId } from "./signal.ts";
import type { GateInputs } from "./risk.ts";

export interface ExperimentSpec {
  name: string;
  phase: "DEVELOPMENT" | "VALIDATION";
  strategy: StrategyId;
  scenario: CostScenario;
  gateMode: GateMode;
  dates: string[]; // the sessions this experiment is scored on; warm-up may use earlier sessions
  excludePlaceholders?: boolean; // research variant: drop the labelled closing placeholders before indicators (default off)
}

export interface ExperimentResult {
  spec: Omit<ExperimentSpec, "dates"> & { dateFrom: string; dateTo: string; sessions: number; symbols: number };
  trades: Trade[];
  metrics: ReturnType<typeof summarize>;
  byStock: ReturnType<typeof groupBy<string>>;
  byMonth: ReturnType<typeof groupBy<string>>;
  bySide: ReturnType<typeof groupBy<string>>;
  sessionStatus: Record<SessionOutcome["status"], number>;
  rejectionCounts: Record<string, number>;
  gatedReasonCounts: Record<string, number>;
  missingMinutes: number;
  sessionsCovered: number;
}

const inScope = (date: string, set: Set<string>) => set.has(date);

export function runExperiment(dataset: HistoricalDataset, spec: ExperimentSpec, gates: Record<string, GateInputs> = {}): ExperimentResult {
  const scope = new Set(spec.dates);
  const trades: Trade[] = [];
  const sessionStatus: Record<SessionOutcome["status"], number> = { GATED: 0, NO_SIGNAL: 0, REJECTED_PLAN: 0, TRADED: 0 };
  const rejectionCounts: Record<string, number> = {};
  const gatedReasonCounts: Record<string, number> = {};
  let missingMinutes = 0;
  let sessionsCovered = 0;

  for (const symbol of dataset.symbols) {
    const bars = dataset.bars.get(symbol) ?? [];
    const { trades: all, sessions } = simulateStock(symbol, bars, gates, {
      strategy: spec.strategy,
      scenario: spec.scenario,
      gateMode: spec.gateMode,
      excludePlaceholders: spec.excludePlaceholders === true,
    });
    trades.push(...all.filter((t) => inScope(t.date, scope)));
    for (const s of sessions) {
      if (!inScope(s.date, scope)) continue;
      sessionsCovered++;
      sessionStatus[s.status]++;
      missingMinutes += s.missingMinutes;
      if (s.status === "GATED") for (const r of s.reasons) gatedReasonCounts[r] = (gatedReasonCounts[r] ?? 0) + 1;
      if (s.status === "REJECTED_PLAN") for (const r of s.reasons) {
        const code = r.replace(/^\d{2}:\d{2}\s+/, "");
        rejectionCounts[code] = (rejectionCounts[code] ?? 0) + 1;
      }
    }
  }

  trades.sort((a, b) => a.entryTime.localeCompare(b.entryTime) || a.symbol.localeCompare(b.symbol));
  const { dates: _dates, ...rest } = spec;
  void _dates;
  return {
    spec: { ...rest, dateFrom: [...spec.dates].sort()[0] ?? "", dateTo: [...spec.dates].sort().at(-1) ?? "", sessions: spec.dates.length, symbols: dataset.symbols.length },
    trades,
    metrics: summarize(trades),
    byStock: groupBy(trades, (t) => t.symbol),
    byMonth: groupBy(trades, (t) => t.date.slice(0, 7)),
    bySide: groupBy(trades, (t) => t.side),
    sessionStatus,
    rejectionCounts,
    gatedReasonCounts,
    missingMinutes,
    sessionsCovered,
  };
}

export const SCENARIO_SET = [SCENARIOS.BASE, SCENARIOS.CONSERVATIVE, SCENARIOS.ADVERSE_SLIPPAGE] as const;

// Pre-registered selection rule for development. Written before any result is seen, applied once.
export const SELECTION_RULE = {
  minDevelopmentTrades: 100,
  requireConservativeExpectancyPositive: true,
  description:
    "Choose the candidate with the higher BASE-scenario net expectancy in R among candidates with at least 100 development trades and positive CONSERVATIVE-scenario net expectancy. If none qualifies, no strategy is selected (NO-GO for the candidate set).",
} as const;

export function selectCandidate(candidates: { strategy: StrategyId; base: ExperimentResult; conservative: ExperimentResult }[]): { selected: StrategyId | null; reasons: Record<string, string> } {
  const reasons: Record<string, string> = {};
  const eligible: { strategy: StrategyId; exp: number }[] = [];
  for (const c of candidates) {
    const trades = c.base.metrics.trades;
    const baseExp = c.base.metrics.expectancyR;
    const consExp = c.conservative.metrics.expectancyR;
    if (trades < SELECTION_RULE.minDevelopmentTrades) {
      reasons[c.strategy] = `only ${trades} development trades (< ${SELECTION_RULE.minDevelopmentTrades})`;
    } else if (consExp === null || consExp <= 0) {
      reasons[c.strategy] = `CONSERVATIVE expectancy ${consExp ?? "n/a"} R is not positive`;
    } else if (baseExp === null) {
      reasons[c.strategy] = "no base expectancy";
    } else {
      reasons[c.strategy] = `eligible, base expectancy ${baseExp.toFixed(4)} R`;
      eligible.push({ strategy: c.strategy, exp: baseExp });
    }
  }
  eligible.sort((a, b) => b.exp - a.exp);
  return { selected: eligible[0]?.strategy ?? null, reasons };
}
