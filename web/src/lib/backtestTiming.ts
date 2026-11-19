// Execution timing of a backtest run. Dependency-free on purpose: research pages import this module, never the engine.
// exec-next-bar-open-v1: a signal decided at bar N's close fills at bar N+1's open.
// Runs stored before this version carry no marker. They are labelled LEGACY_SAME_CANDLE on read and never rewritten.
export const EXECUTION_TIMING = "NEXT_BAR_OPEN" as const;
export const EXECUTION_TIMING_VERSION = "exec-next-bar-open-v1";
export const LEGACY_EXECUTION_TIMING = "LEGACY_SAME_CANDLE" as const;

// Read-side label for a stored or in-memory result. Pure: never touches the file it came from.
export function executionTimingOf(r: { metadata?: Record<string, unknown> | null; execution?: { entryTiming?: string } | null }): typeof EXECUTION_TIMING | typeof LEGACY_EXECUTION_TIMING {
  return r.metadata?.executionTiming === EXECUTION_TIMING || r.execution?.entryTiming === EXECUTION_TIMING ? EXECUTION_TIMING : LEGACY_EXECUTION_TIMING;
}

// Whether a result may be quoted as performance. Derived from the execution model on read (never stored). CLOSE_ONLY
// checks stops only at the bar close, so its exits can overshoot the risk budget: performance claims are DISABLED.
// INTRABAR is RESEARCH ONLY: its option prices are synthetic (model-derived), and no observed option data exists here.
export const CLOSE_ONLY_CLAIM = "DISABLED_CLOSE_ONLY_STOPS" as const;
export const INTRABAR_CLAIM = "RESEARCH_ONLY_SYNTHETIC_OPTIONS" as const;
export function performanceClaimOf(model: string | null | undefined): typeof CLOSE_ONLY_CLAIM | typeof INTRABAR_CLAIM {
  return model === "INTRABAR_MODEL_DERIVED" ? INTRABAR_CLAIM : CLOSE_ONLY_CLAIM;
}
