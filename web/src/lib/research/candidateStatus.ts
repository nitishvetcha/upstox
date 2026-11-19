// Every opportunity card is a research candidate. This helper states why none is an executable trade.
export const RESEARCH_BANNER = "PAPER RESEARCH — MANUAL REVIEW ONLY. NO AUTOMATIC BROKER ORDERS.";

export type CandidateKind = "intraday-stock" | "positional-stock" | "option";

export function candidateStatus(
  kind: CandidateKind,
  c: {
    direction?: string;
    optionType?: string;
    freshness?: string;
    grade?: string;
    gradeReasons?: string[];
  },
) {
  const up = kind === "option" ? c.optionType === "CE" : c.direction === "BULLISH";
  const blocks: string[] = [];

  // 1. Primary Strategy/Audit-level block
  if (kind === "option") {
    if (c.gradeReasons && c.gradeReasons.length > 0) {
      for (const reason of c.gradeReasons) {
        if (!blocks.includes(reason)) blocks.push(reason);
      }
    } else if (c.grade === "REJECT") {
      blocks.push("Option chain unverified: Upstox /v2/option/chain carries no exchange or trade timestamp (provider limitation), so chain prices/IV/Greeks cannot be proven fresh");
    }
    blocks.push("Chain delta/IV unverified: excluded from scoring and ordering");
  } else if (kind === "intraday-stock") {
    blocks.push("Strategy failed its historical replay (intraday-replay-1: NEGATIVE after costs); paper-tracked only to complete intraday-eval-1");
  } else if (kind === "positional-stock") {
    blocks.push("Strategy retired (positional-v1 lost money in a 5-year backtest)");
  }

  // 2. Quote freshness block if applicable
  if (c.freshness && c.freshness !== "LIVE") {
    const qMsg = `Quote ${c.freshness}, not live`;
    if (!blocks.includes(qMsg)) blocks.push(qMsg);
  }

  // 3. Additional engine-level rejection reasons for stocks
  if (kind !== "option" && c.gradeReasons && c.gradeReasons.length > 0) {
    for (const reason of c.gradeReasons) {
      if (!blocks.includes(reason)) blocks.push(reason);
    }
  }

  return {
    banner: RESEARCH_BANNER,
    executable: false as const,
    hypothesis:
      kind === "option"
        ? `Hypothesis: index ${up ? "UP" : "DOWN"} (${c.optionType})`
        : `Hypothesis: ${up ? "UP (long)" : "DOWN (short)"}`,
    primaryBlock: blocks[0] ?? "Not approved for live execution",
    blocks,
  };
}
