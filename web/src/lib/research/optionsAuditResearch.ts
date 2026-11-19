// Phase 6: Multi-Session Next-Weekly Validation Experiment
// Research Protocol: options-audit-2-research
// Evaluates contracts with 2–7 days to expiry (or nearest >= 2 DTE for monthly-only series).
//
// STRICT PROTECTION: Research-only. Does NOT modify production audit thresholds,
// verdict logic, historical audit records, or strategy behavior.

import type { OptionRow } from "../types.ts";
import {
  impliedVolPct,
  yearsToExpiry,
  LIVE_MAX_AGE_S,
  PRICE_TOL,
} from "../optionsAudit.ts";
import { FILTERS } from "../engine/opportunityEngine.ts";
import {
  AUTHORITATIVE_TICK_SIZE,
  classifyBidAskSpread,
  type BidAskClassification,
} from "./auditExperiments.ts";

export const RESEARCH_AUDIT_VERSION = "options-audit-2-research";
// The window is measured in IST CALENDAR DAYS (expiry date − capture date), not exact time remaining:
// a contract captured at 17:19 IST two dates before expiry has calendarDays 2 but exactDays ≈ 1.9.
// Both are recorded on every round; never describe calendarDays as exact time remaining.
export const RESEARCH_DTE_BASIS = "IST_CALENDAR_DAYS";
export const RESEARCH_MIN_DTE = 2;
export const RESEARCH_MAX_DTE = 7;
export const TARGET_LABEL = `TARGET_WINDOW (${RESEARCH_MIN_DTE}–${RESEARCH_MAX_DTE} IST calendar days)`;
export const FALLBACK_LABEL = `FALLBACK (> ${RESEARCH_MAX_DTE} IST calendar days)`;
// Research rounds per index count at most once per slot of this length from the 09:15 open (matches the production 40-min cadence).
export const RESEARCH_SLOT_MIN = 40;

export type ResearchHorizon = "TARGET_WINDOW" | "FALLBACK";
// MONTHLY = last listed expiry in its calendar month (from the broker contract list); otherwise WEEKLY.
export type SeriesType = "WEEKLY" | "MONTHLY" | "UNKNOWN";

export interface ResearchExpirySelection {
  expiry: string;
  calendarDays: number;
  exactDays: number;
  horizon: ResearchHorizon;
  seriesType: SeriesType;
}

const DAY_MS = 86_400_000;
export const istDate = (d: Date) =>
  new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
export const calendarDaysTo = (expiry: string, now: Date) =>
  Math.round(
    (Date.parse(`${expiry}T00:00:00Z`) -
      Date.parse(`${istDate(now)}T00:00:00Z`)) /
      DAY_MS,
  );
export const exactDaysTo = (expiry: string, now: Date) =>
  (Date.parse(`${expiry}T15:30:00+05:30`) - now.getTime()) / DAY_MS;
export const horizonOf = (
  calendarDays: number,
  maxDte = RESEARCH_MAX_DTE,
): ResearchHorizon => (calendarDays <= maxDte ? "TARGET_WINDOW" : "FALLBACK");

// Nearest expiry 2–7 IST calendar days away; else the nearest one beyond the window (FALLBACK).
// Never returns an expiry fewer than minDte calendar days away or one already past 15:30 IST.
export function selectResearchExpiry(
  expiries: string[],
  now: Date,
  minDte = RESEARCH_MIN_DTE,
  maxDte = RESEARCH_MAX_DTE,
): ResearchExpirySelection | null {
  const listed = [...new Set(expiries.filter(Boolean))].sort();
  const e = listed.find(
    (x) => calendarDaysTo(x, now) >= minDte && exactDaysTo(x, now) > 0,
  );
  if (!e) return null;
  const calendarDays = calendarDaysTo(e, now);
  const lastInMonth = listed
    .filter((x) => x.slice(0, 7) === e.slice(0, 7))
    .at(-1);
  return {
    expiry: e,
    calendarDays,
    exactDays: Math.round(exactDaysTo(e, now) * 100) / 100,
    horizon: horizonOf(calendarDays, maxDte),
    seriesType: lastInMonth === e ? "MONTHLY" : "WEEKLY",
  };
}

export interface QuoteDepthEntry {
  last_price?: number;
  last_trade_time?: number | string;
  timestamp?: string;
  depth?: {
    buy?: { price: number; quantity?: number; orders?: number }[];
    sell?: { price: number; quantity?: number; orders?: number }[];
  };
}

export interface ResearchSample {
  key: string;
  strike: number;
  type: "CE" | "PE";
  expiry: string;
  timeToExpiryYears: number;
  daysToExpiry: number;
  liquid: boolean;

  // Chain fields
  chainLtp: number;
  chainBid: number | null;
  chainAsk: number | null;
  chainIv: number | null;

  // Quote fields
  quoteLtp: number | null;
  quoteBestBid: number | null;
  quoteBestAsk: number | null;
  quoteResponseTime: string | null;
  quoteLastTradeTime: string | null;
  ageS: number | null;
  live: boolean;

  // Comparison metrics
  priceDiffPct: number | null;
  priceAgreeStandard: boolean;
  priceAgreeTickAware: boolean;
  recomputedIv: number | null;
  ivDiff: number | null;

  // Classifications
  temporalClassification: "COMPARABLE" | "INDETERMINATE" | "STALE";
  bookClassification: BidAskClassification;
  spreadWidth: number | null;
  ivClassification:
    | "BOTH_PRESENT"
    | "UPSTREAM_MISSING"
    | "RECOMPUTE_UNSOLVABLE";
}

export interface ResearchRound {
  version: typeof RESEARCH_AUDIT_VERSION;
  index: string;
  session: string;
  at: string;
  // Fields below are absent on legacy (pre-Phase-8) and failed records; the report derives what it can from `at`/`expiry`.
  runId?: string;
  marketState?: string;
  // Upstox GET /v2/market/status/{NFO|BFO} at round start; only "NORMAL_OPEN" can qualify.
  exchange?: "NFO" | "BFO";
  exchangeStatus?: string;
  expiry?: string;
  daysToExpiry?: number; // legacy: exact days, 1 decimal
  calendarDays?: number;
  exactDays?: number;
  horizon?: ResearchHorizon;
  seriesType?: SeriesType;
  mappingPass?: boolean;
  expiryMatchesContractMaster?: boolean;
  // Local clock times. Upstox's option-chain response carries no generation timestamp, so these are NOT snapshot times.
  chainRequestedAt?: string;
  chainReceivedAt?: string;
  quotesReceivedAt?: string;
  spot?: number;
  chainSpot?: number;
  spotDriftPct?: number;
  chainToQuoteMs?: number;
  samples?: ResearchSample[];
  error?: string;
  errorReason?: string; // UpstoxError reason, e.g. UPSTOX_AUTH_EXPIRED, UPSTOX_RATE_LIMITED, UPSTOX_NETWORK
  httpStatus?: number | null;
}

export function sampleResearchRound(
  rows: OptionRow[],
  quotes: Map<string, QuoteDepthEntry>,
  indexSpot: number,
  chainSpot: number,
  expiry: string,
  fetchedAt: Date,
  strikesEachSide = 5,
): ResearchSample[] {
  const sorted = [...rows].sort((a, b) => a.strike - b.strike);
  if (!sorted.length) return [];
  const atm = sorted.reduce(
    (b, r) =>
      Math.abs(r.strike - chainSpot) < Math.abs(b.strike - chainSpot) ? r : b,
    sorted[0],
  );
  const i0 = sorted.indexOf(atm);
  const T = yearsToExpiry(expiry, fetchedAt);
  const dteDays = Math.max(0, Math.round(T * 365 * 10) / 10);
  const spotDrift = Math.abs(indexSpot - chainSpot);
  const spotDriftPct = indexSpot > 0 ? (spotDrift / indexSpot) * 100 : 0;

  const out: ResearchSample[] = [];

  for (const row of sorted.slice(
    Math.max(0, i0 - strikesEachSide),
    i0 + strikesEachSide + 1,
  )) {
    for (const [type, side] of [
      ["CE", row.call],
      ["PE", row.put],
    ] as const) {
      if (!side.instrumentKey) continue;
      const q = quotes.get(side.instrumentKey);

      const ltt = Number(q?.last_trade_time);
      const ageS =
        Number.isFinite(ltt) && ltt > 1_577_836_800_000
          ? (fetchedAt.getTime() - ltt) / 1000
          : null;
      const quoteLtp = q?.last_price && q.last_price > 0 ? q.last_price : null;
      const live = ageS !== null && ageS >= 0 && ageS <= LIVE_MAX_AGE_S;

      const bestBid = q?.depth?.buy?.[0]?.price ?? null;
      const bestAsk = q?.depth?.sell?.[0]?.price ?? null;
      const bookRes = classifyBidAskSpread(side.ltp, bestBid, bestAsk);

      const recomputedIv =
        quoteLtp !== null
          ? impliedVolPct(quoteLtp, indexSpot, row.strike, T, type)
          : null;
      const chainIv = side.iv && side.iv > 0 ? side.iv : null;
      const ivDiff =
        chainIv !== null && recomputedIv !== null
          ? Math.abs(chainIv - recomputedIv)
          : null;

      const diff =
        quoteLtp !== null && side.ltp > 0
          ? Math.abs(side.ltp - quoteLtp)
          : null;
      const priceDiffPct =
        diff !== null && quoteLtp !== null ? diff / quoteLtp : null;

      const priceAgreeStandard =
        priceDiffPct !== null && priceDiffPct <= PRICE_TOL;
      const priceAgreeTickAware =
        diff !== null && quoteLtp !== null
          ? diff <= Math.max(0.02 * quoteLtp, AUTHORITATIVE_TICK_SIZE) + 1e-6
          : false;

      // Temporal classification
      // Temporal classification
      let temporalClassification: "COMPARABLE" | "INDETERMINATE" | "STALE" =
        "COMPARABLE";

      if (!live || ageS === null) {
        temporalClassification = "STALE";
      } else if (spotDriftPct > 0.01) {
        temporalClassification = "INDETERMINATE";
      }

      // IV classification
      let ivClassification:
        | "BOTH_PRESENT"
        | "UPSTREAM_MISSING"
        | "RECOMPUTE_UNSOLVABLE" = "BOTH_PRESENT";
      if (chainIv === null) ivClassification = "UPSTREAM_MISSING";
      else if (recomputedIv === null) ivClassification = "RECOMPUTE_UNSOLVABLE";

      out.push({
        key: side.instrumentKey,
        strike: row.strike,
        type,
        expiry,
        timeToExpiryYears: T,
        daysToExpiry: dteDays,
        liquid:
          side.ltp > 0 &&
          side.oi >= FILTERS.minOi &&
          side.volume >= FILTERS.minVolume &&
          (side.bid === null ||
            side.ask === null ||
            ((side.ask - side.bid) / side.ltp) * 100 <= FILTERS.maxSpreadPct),
        chainLtp: side.ltp,
        chainBid: side.bid,
        chainAsk: side.ask,
        chainIv,
        quoteLtp,
        quoteBestBid: bestBid,
        quoteBestAsk: bestAsk,
        quoteResponseTime: q?.timestamp ?? null,
        quoteLastTradeTime:
          Number.isFinite(ltt) && ltt > 0 ? new Date(ltt).toISOString() : null,
        ageS,
        live,
        priceDiffPct,
        priceAgreeStandard,
        priceAgreeTickAware,
        recomputedIv,
        ivDiff,
        temporalClassification,
        bookClassification: bookRes.classification,
        spreadWidth: bookRes.spreadWidth,
        ivClassification,
      });
    }
  }

  return out;
}

const pct = (arr: number[], p: number): number | null => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

export interface HorizonComparisonMetrics {
  horizon: string;
  rounds: number;
  totalSamples: number;
  liquidSamples: number;
  uniqueInstruments: number;
  pricedSamples: number;
  pricedComparableSamples: number;
  ivPairs: number;
  validBooks: number;
  missingIvCount: number;
  missingIvRate: number | null;
  missingQuoteCount: number;
  ivMedianDiff: number | null;
  ivP95Diff: number | null;
  priceAgreeStandardRate: number | null;
  priceAgreeTickAwareRate: number | null;
  withinBidAskRate: number | null;
  comparableShare: number | null;
  indeterminateShare: number | null;
  staleShare: number | null;
}

// Rates are over liquid samples; each rate's denominator is reported beside it. Empty denominators give null, never 0.
export function aggregateHorizonMetrics(
  horizonName: string,
  rounds: ResearchRound[],
): HorizonComparisonMetrics {
  const all = rounds.flatMap((r) => r.samples ?? []);
  const samples = all.filter((s) => s.liquid);

  const comparable = samples.filter(
    (s) =>
      s.temporalClassification === "COMPARABLE" &&
      s.live &&
      s.ageS !== null &&
      s.ageS >= 0 &&
      s.ageS <= LIVE_MAX_AGE_S,
  );

  const indeterminate = samples.filter(
    (s) => s.temporalClassification === "INDETERMINATE",
  );

  const stale = samples.filter(
    (s) =>
      s.temporalClassification === "STALE" ||
      !s.live ||
      s.ageS === null ||
      s.ageS < 0 ||
      s.ageS > LIVE_MAX_AGE_S,
  );

  const priced = samples.filter((s) => s.priceDiffPct !== null);
  const pricedComparable = comparable.filter((s) => s.priceDiffPct !== null);

  const ivDiffs = comparable
    .map((s) => s.ivDiff)
    .filter((d): d is number => d !== null && Number.isFinite(d));

  const missingIv = samples.filter((s) => s.chainIv === null).length;

  const stdPass = pricedComparable.filter((s) => s.priceAgreeStandard).length;

  const tkPass = pricedComparable.filter((s) => s.priceAgreeTickAware).length;

  const validBooks = samples.filter(
    (s) => s.bookClassification !== "INDETERMINATE",
  );

  const withinBooks = validBooks.filter(
    (s) => s.bookClassification === "WITHIN_SPREAD",
  ).length;

  const rate = (n: number, d: number) => (d > 0 ? n / d : null);

  return {
    horizon: horizonName,
    rounds: rounds.length,
    totalSamples: all.length,
    liquidSamples: samples.length,
    uniqueInstruments: new Set(all.map((s) => s.key)).size,
    pricedSamples: priced.length,
    pricedComparableSamples: pricedComparable.length,
    ivPairs: ivDiffs.length,
    validBooks: validBooks.length,
    missingIvCount: missingIv,
    missingIvRate: rate(missingIv, samples.length),
    missingQuoteCount: samples.filter((s) => s.quoteLtp === null).length,
    ivMedianDiff: pct(ivDiffs, 0.5),
    ivP95Diff: pct(ivDiffs, 0.95),
    priceAgreeStandardRate: rate(stdPass, pricedComparable.length),
    priceAgreeTickAwareRate: rate(tkPass, pricedComparable.length),
    withinBidAskRate: rate(withinBooks, validBooks.length),
    comparableShare: rate(comparable.length, samples.length),
    indeterminateShare: rate(indeterminate.length, samples.length),
    staleShare: rate(stale.length, samples.length),
  };
}

// ── Report (pure; rebuilt from every raw record each time) ───────────────────
export const CHAIN_TIMESTAMP_WARNING =
  "Upstox /v2/option/chain returns no generation timestamp; chainReceivedAt is local receipt time, not snapshot time. " +
  "Chain-vs-quote comparability is inferred from local timing, quote last_trade_time and spot drift only.";

export interface ClassifiedRound {
  index: string;
  session: string;
  at: string;
  runId: string;
  runIdSource: "RECORDED" | "DERIVED_FROM_AT_MINUTE";
  marketState: string;
  marketStateSource: "RECORDED" | "DERIVED_FROM_AT";
  expiry: string | null;
  calendarDays: number | null;
  exactDays: number | null;
  horizon: ResearchHorizon | null;
  seriesType: SeriesType;
  slot: number | null;
  succeeded: boolean;
  qualifies: boolean;
  exclusion: string | null;
}

const hasValidResearchTiming = (r: ResearchRound): boolean => {
  const requested = Date.parse(r.chainRequestedAt ?? "");
  const received = Date.parse(r.chainReceivedAt ?? "");
  const quotesReceived = Date.parse(r.quotesReceivedAt ?? "");
  const upperBoundMs = r.chainToQuoteMs;

  if (
    !Number.isFinite(requested) ||
    !Number.isFinite(received) ||
    !Number.isFinite(quotesReceived) ||
    typeof upperBoundMs !== "number" ||
    !Number.isFinite(upperBoundMs)
  ) {
    return false;
  }

  if (
    requested > received ||
    received > quotesReceived ||
    upperBoundMs < 0 ||
    upperBoundMs > 2000
  ) {
    return false;
  }

  return Math.abs(quotesReceived - requested - upperBoundMs) <= 100;
};

export function classifyRound(
  r: ResearchRound,
  marketStateAt: (d: Date) => string,
): ClassifiedRound {
  const at = new Date(r.at);
  const marketState = r.marketState ?? marketStateAt(at);
  const calendarDays = r.expiry
    ? (r.calendarDays ?? calendarDaysTo(r.expiry, at))
    : null;
  const exactDays = r.expiry
    ? (r.exactDays ?? Math.round(exactDaysTo(r.expiry, at) * 100) / 100)
    : null;
  const istMin = (at.getUTCHours() * 60 + at.getUTCMinutes() + 330) % 1440;
  const slot =
    istMin >= 555 ? Math.floor((istMin - 555) / RESEARCH_SLOT_MIN) : null;
  const succeeded = !r.error && !!r.samples?.length;
  const exclusion = r.error
    ? `collection error: ${r.error}`
    : !r.samples?.length
      ? "no samples recorded"
      : marketState !== "OPEN"
        ? `market ${marketState} at capture (closed-market reference only)`
        : r.exchangeStatus !== "NORMAL_OPEN"
          ? `exchange status ${r.exchangeStatus ?? "not recorded"} at capture`
          : r.mappingPass === false
            ? "contract mapping check failed"
            : r.expiryMatchesContractMaster === false
              ? "sampled contracts' expiry differs from selected expiry"
              : !hasValidResearchTiming(r)
                ? "missing, invalid, or greater-than-2-second chain/quote timing"
                : null;
  return {
    index: r.index,
    session: r.session,
    at: r.at,
    runId: r.runId ?? r.at.slice(0, 16),
    runIdSource: r.runId ? "RECORDED" : "DERIVED_FROM_AT_MINUTE",
    marketState,
    marketStateSource: r.marketState ? "RECORDED" : "DERIVED_FROM_AT",
    expiry: r.expiry ?? null,
    calendarDays,
    exactDays,
    horizon:
      r.horizon ?? (calendarDays !== null ? horizonOf(calendarDays) : null),
    seriesType: r.seriesType ?? "UNKNOWN",
    slot,
    succeeded,
    qualifies: exclusion === null,
    exclusion,
  };
}

export function researchReport(
  raw: ResearchRound[],
  marketStateAt: (d: Date) => string,
  minSessions: number,
  minRoundsPerSession: number,
  malformedLines = 0,
) {
  const rounds = raw.filter((r) => r.version === RESEARCH_AUDIT_VERSION);
  const cls = rounds.map((r) => classifyRound(r, marketStateAt));

  // One qualifying round per (index, session, slot): duplicate invocations in a slot are excluded, not double-counted.
  const seen = new Set<string>();
  const counted: ResearchRound[] = [];
  cls.forEach((c, i) => {
    if (!c.qualifies) return;
    const k = `${c.index}|${c.session}|${c.slot}`;
    if (seen.has(k)) {
      c.qualifies = false;
      c.exclusion = `duplicate in ${RESEARCH_SLOT_MIN}-min slot ${c.slot}`;
      return;
    }
    seen.add(k);
    counted.push(rounds[i]);
  });

  const bucketKey = (c: ClassifiedRound) =>
    `${c.horizon === "TARGET_WINDOW" ? TARGET_LABEL : FALLBACK_LABEL} / series ${c.seriesType}`;
  const buckets = (pick: (c: ClassifiedRound) => boolean) => {
    const m = new Map<string, ResearchRound[]>();
    cls.forEach((c, i) => {
      if (pick(c) && c.horizon)
        m.set(bucketKey(c), [...(m.get(bucketKey(c)) ?? []), rounds[i]]);
    });
    return [...m].map(([k, rs]) => aggregateHorizonMetrics(k, rs));
  };

  const indices = [...new Set(cls.map((c) => c.index))].map((index) => {
    const mine = cls.filter((c) => c.index === index && c.qualifies);
    const perSession = new Map<string, number>();
    for (const c of mine)
      perSession.set(c.session, (perSession.get(c.session) ?? 0) + 1);
    const qualifyingSessions = [...perSession]
      .filter(([, n]) => n >= minRoundsPerSession)
      .map(([s]) => s);
    return {
      index,
      qualifyingRounds: mine.length,
      roundsPerSession: Object.fromEntries(perSession),
      qualifyingSessions,
      liveTargetMet: qualifyingSessions.length >= minSessions,
    };
  });

  const exclusions: Record<string, number> = {};
  for (const c of cls)
    if (c.exclusion)
      exclusions[c.exclusion] = (exclusions[c.exclusion] ?? 0) + 1;
  const count = <T>(f: (c: ClassifiedRound) => T) =>
    cls.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [String(f(c))]: (m[String(f(c))] ?? 0) + 1 }),
      {},
    );

  const warnings = [CHAIN_TIMESTAMP_WARNING];
  if (cls.some((c) => c.marketStateSource === "DERIVED_FROM_AT"))
    warnings.push(
      "Some records lack a recorded marketState; it was derived from the capture timestamp and the NSE holiday calendar.",
    );
  if (!counted.length)
    warnings.push(
      "No live-market qualifying rounds: every live-validation criterion is UNVERIFIED.",
    );
  if (cls.some((c) => c.seriesType === "UNKNOWN"))
    warnings.push(
      "Legacy records lack the contract list, so weekly/monthly series type is UNKNOWN for them.",
    );

  const sessions = [...new Set(cls.map((c) => c.session))]
    .sort()
    .map((session) => {
      const idx = cls.flatMap((c, i) => (c.session === session ? [i] : []));
      const ss = idx.flatMap((i) => rounds[i].samples ?? []);
      const errorsByReason: Record<string, number> = {};
      for (const i of idx)
        if (rounds[i].error) {
          const k = rounds[i].errorReason ?? "UNCLASSIFIED";
          errorsByReason[k] = (errorsByReason[k] ?? 0) + 1;
        }
      return {
        session,
        attempted: idx.length,
        succeeded: idx.filter((i) => cls[i].succeeded).length,
        qualifying: idx.filter((i) => cls[i].qualifies).length,
        byMarketState: idx.reduce<Record<string, number>>(
          (m, i) => ({
            ...m,
            [cls[i].marketState]: (m[cls[i].marketState] ?? 0) + 1,
          }),
          {},
        ),
        errorsByReason,
        observations: {
          total: ss.length,
          liquid: ss.filter((x) => x.liquid).length,
          illiquid: ss.filter((x) => !x.liquid).length,
          fresh: ss.filter((x) => x.live).length,
          stale: ss.filter((x) => !x.live).length,
          missingQuote: ss.filter((x) => x.quoteLtp === null).length,
          missingChainIv: ss.filter((x) => x.chainIv === null).length,
        },
        byIndex: indices.map((x) => ({
          index: x.index,
          qualifyingRounds: x.roundsPerSession[session] ?? 0,
          sessionQualifies: x.qualifyingSessions.includes(session),
          why: x.qualifyingSessions.includes(session)
            ? `≥${minRoundsPerSession} distinct qualifying slots`
            : `${x.roundsPerSession[session] ?? 0}/${minRoundsPerSession} distinct qualifying slots`,
        })),
      };
    });

  return {
    version: RESEARCH_AUDIT_VERSION,
    dteBasis: RESEARCH_DTE_BASIS,
    qualificationRule: `round qualifies only if: no error, ≥1 sample, market OPEN at capture (holiday-aware clock) AND Upstox exchange status NORMAL_OPEN, mapping/expiry checks not failed, timing fields recorded; at most one per index per ${RESEARCH_SLOT_MIN}-min slot. Session qualifies per index at ≥${minRoundsPerSession} rounds; target ≥${minSessions} sessions.`,
    rawCounts: {
      jsonlRecords: raw.length + malformedLines,
      malformedLines,
      otherVersionRecords: raw.length - rounds.length,
      researchRounds: rounds.length,
      collectionRuns: new Set(cls.map((c) => c.runId)).size,
      sessions: new Set(cls.map((c) => c.session)).size,
      succeeded: cls.filter((c) => c.succeeded).length,
      failed: cls.filter((c) => !c.succeeded).length,
      qualifying: counted.length,
      samples: rounds.reduce((n, r) => n + (r.samples?.length ?? 0), 0),
      uniqueInstruments: new Set(
        rounds.flatMap((r) => (r.samples ?? []).map((s) => s.key)),
      ).size,
      byIndex: count((c) => c.index),
      byExpiry: count((c) => `${c.index} ${c.expiry}`),
      byCalendarDays: count((c) => c.calendarDays),
      byMarketState: count((c) => c.marketState),
      byHorizon: count((c) => c.horizon),
    },
    exclusions,
    indices,
    sessions,
    liveValidation: {
      status: counted.length ? "IN_PROGRESS" : "UNVERIFIED",
      horizons: buckets((c) => c.qualifies),
    },
    afterHoursReferenceOnly: {
      note: "Not live-market evidence. Price agreement after the close compares two stale prints and proves nothing about intraday synchronization.",
      horizons: buckets((c) => c.succeeded && c.marketState !== "OPEN"),
    },
    warnings,
    rounds: cls,
  };
}
