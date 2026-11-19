import type {
  BreadthClassification,
  ConstituentQuote,
  IndexId,
  MarketBreadth,
  PriceBreadthState,
  SourceInfo,
} from "../types.ts";
import {
  BREADTH_MIN_COVERAGE_PERCENT,
  BREADTH_NEUTRAL_TOLERANCE_PCT,
  INDEX_CONSTITUENTS,
} from "./breadthConfig.ts";

export function classifyBreadthSignal(signal: number): BreadthClassification {
  if (signal >= 0.6) return "STRONGLY BULLISH";
  if (signal >= 0.2) return "BULLISH";
  if (signal <= -0.6) return "STRONGLY BEARISH";
  if (signal <= -0.2) return "BEARISH";
  return "NEUTRAL";
}

export function classifyPriceBreadthState(
  spotChangePercent: number | null | undefined,
  breadthSignal: number,
): PriceBreadthState {
  const priceDirection =
    spotChangePercent == null
      ? "NEUTRAL"
      : spotChangePercent > 0.05
        ? "BULLISH"
        : spotChangePercent < -0.05
          ? "BEARISH"
          : "NEUTRAL";

  const breadthDirection =
    breadthSignal >= 0.2
      ? "BULLISH"
      : breadthSignal <= -0.2
        ? "BEARISH"
        : "NEUTRAL";

  if (priceDirection === "BULLISH" && breadthDirection === "BULLISH") {
    return "BULLISH_CONFIRMATION";
  }
  if (priceDirection === "BEARISH" && breadthDirection === "BEARISH") {
    return "BEARISH_CONFIRMATION";
  }
  if (priceDirection === "BULLISH" && breadthDirection === "BEARISH") {
    return "BEARISH_DIVERGENCE";
  }
  if (priceDirection === "BEARISH" && breadthDirection === "BULLISH") {
    return "BULLISH_DIVERGENCE";
  }
  if (priceDirection === "NEUTRAL" && Math.abs(breadthSignal) >= 0.4) {
    return "DIRECTIONAL_BUILDUP";
  }
  return "NEUTRAL_ALIGNMENT";
}

import { tradeFreshnessOf } from "../time.ts";

export function calculateBreadth(
  index: IndexId,
  constituentQuotes: ConstituentQuote[],
  spotChangePercent?: number | null,
  now = new Date(),
  sourceOverride?: SourceInfo,
): MarketBreadth {
  const expected = INDEX_CONSTITUENTS[index]?.length ?? 50;
  const validQuotes = constituentQuotes.filter(
    (q) => Number.isFinite(q.lastPrice) && Number.isFinite(q.previousClose) && q.previousClose > 0,
  );
  const total = validQuotes.length;
  const coverage = expected > 0 ? Math.round((total / expected) * 1000) / 10 : 0;

  let advances = 0;
  let declines = 0;
  let unchanged = 0;

  for (const q of validQuotes) {
    if (q.changePercent > BREADTH_NEUTRAL_TOLERANCE_PCT) {
      advances++;
    } else if (q.changePercent < -BREADTH_NEUTRAL_TOLERANCE_PCT) {
      declines++;
    } else {
      unchanged++;
    }
  }

  const advanceDeclineRatio =
    declines === 0 ? advances : Math.round((advances / declines) * 100) / 100;
  const advancePercent = total > 0 ? Math.round((advances / total) * 1000) / 10 : 0;
  const declinePercent = total > 0 ? Math.round((declines / total) * 1000) / 10 : 0;
  const rawBreadthPercent = total > 0 ? ((advances - declines) / total) * 100 : 0;
  const breadthPercent = Math.round(rawBreadthPercent * 10) / 10;
  const signal = total > 0 ? Math.min(1, Math.max(-1, (advances - declines) / total)) : 0;
  const classification = classifyBreadthSignal(signal);
  const priceBreadthState = classifyPriceBreadthState(spotChangePercent, signal);

  // Every valid constituent is judged on its own trade timestamp (Issue 2 / B4 finalisation). The set is LIVE only
  // when every quote is fresh within the existing 150 s window (tradeFreshnessOf with slow 1.25; AGING is inside it).
  // A stale, future-dated or unparseable/missing timestamp keeps the set from LIVE. The newest timestamp is kept in
  // the source for information only; it does not judge freshness.
  const counts = { fresh: 0, endOfDay: 0, stale: 0, undated: 0 };
  for (const q of validQuotes) {
    if (typeof q.timestamp !== "string" || !Number.isFinite(Date.parse(q.timestamp))) {
      counts.undated++;
      continue;
    }
    const f = tradeFreshnessOf(q.timestamp, now, 1.25).freshness;
    if (f === "LIVE" || f === "AGING") counts.fresh++;
    else if (f === "END_OF_DAY") counts.endOfDay++;
    else counts.stale++;
  }
  const notFresh = counts.stale + counts.undated;
  const timestamps = validQuotes
    .map((q) => q.timestamp)
    .filter((t): t is string => typeof t === "string" && Number.isFinite(Date.parse(t)));
  const latestTradeTime = timestamps.length ? [...timestamps].sort().reverse()[0] : null;

  let status: MarketBreadth["status"] = "LIVE";
  let reason: string | null = null;

  if (total === 0) {
    status = "UNAVAILABLE";
    reason = "No valid constituent quotes received";
  } else if (coverage < BREADTH_MIN_COVERAGE_PERCENT) {
    status = "UNAVAILABLE";
    reason = `Coverage ${coverage}% below minimum ${BREADTH_MIN_COVERAGE_PERCENT}% threshold`;
  } else if (sourceOverride?.source === "MOCK") {
    status = coverage < 100 ? "PARTIAL" : "LIVE";
  } else if (notFresh > 0) {
    status = "STALE";
    reason = [
      counts.stale > 0 ? `${counts.stale} of ${total} constituent quote(s) are stale or future-dated (outside the 150 s window)` : null,
      counts.undated > 0 ? `${counts.undated} of ${total} constituent quote(s) have no usable trade timestamp; freshness cannot be verified` : null,
    ].filter((r): r is string => r !== null).join("; ");
  } else if (counts.endOfDay > 0) {
    status = "END_OF_DAY";
    reason = "Market closed: constituent quotes are end-of-day (END_OF_DAY)";
  } else if (coverage < 100) {
    status = "PARTIAL";
    reason = `Partial coverage: ${total}/${expected} constituents`;
  }

  const sortedByChange = [...validQuotes].sort((a, b) => b.changePercent - a.changePercent);
  const topAdvancers = sortedByChange.slice(0, 3);
  const topDecliners = [...sortedByChange].reverse().slice(0, 3);

  const fetchedAt = sourceOverride?.fetchedAt ?? now.toISOString();
  const source: SourceInfo = sourceOverride ?? {
    source: status === "UNAVAILABLE" || status === "STALE" ? "UNAVAILABLE" : status === "END_OF_DAY" ? "END_OF_DAY" : "LIVE",
    provider: "UPSTOX",
    fetchedAt,
    lastTradeTime: latestTradeTime,
  };

  return {
    index,
    status,
    advances,
    declines,
    unchanged,
    total,
    expected,
    coverage,
    advanceDeclineRatio,
    advancePercent,
    declinePercent,
    breadthPercent,
    signal: Math.round(signal * 100) / 100,
    classification,
    priceBreadthState,
    fetchedAt,
    reason,
    topAdvancers,
    topDecliners,
    source,
  };
}

export function unavailableBreadth(index: IndexId, reason: string): MarketBreadth {
  const expected = INDEX_CONSTITUENTS[index]?.length ?? 50;
  return {
    index,
    status: "UNAVAILABLE",
    advances: 0,
    declines: 0,
    unchanged: 0,
    total: 0,
    expected,
    coverage: 0,
    advanceDeclineRatio: 0,
    advancePercent: 0,
    declinePercent: 0,
    breadthPercent: 0,
    signal: 0,
    classification: "NEUTRAL",
    priceBreadthState: "NEUTRAL_ALIGNMENT",
    fetchedAt: null,
    reason,
    source: { source: "UNAVAILABLE", provider: null, fetchedAt: null },
  };
}

// Mock providers only: synthetic breadth is labelled MOCK and never LIVE or PARTIAL, so the engine does not count it as
// evidence. Backtests call calculateBreadth directly with a MOCK-labelled source and are deliberately NOT changed here.
export function asMockBreadth(b: MarketBreadth): MarketBreadth {
  if (b.status !== "LIVE" && b.status !== "PARTIAL") return b;
  return { ...b, status: "MOCK", reason: "Mock constituent quotes (not live market data)" };
}
