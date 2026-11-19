// Pure read-only diagnostics for Phase 4 options market data suitability and quality review.
// Does NOT modify audit thresholds, definitions, historical records, or strategy behavior.

import fs from "node:fs";
import path from "node:path";
import { AUDIT_DIR } from "./optionsAuditReport.ts";
import { AUDIT_VERSION, LIVE_MAX_AGE_S, PRICE_TOL, type Round } from "./optionsAudit.ts";
import { readJsonl } from "./ops/jsonl.ts";
import { INDICES } from "./services/instrumentRegistry.ts";

export type SampleClassification = "COMPARABLE" | "INDETERMINATE" | "STALE";

export interface ClassifiedSampleDiagnostic {
  key: string;
  strike: number;
  type: "CE" | "PE";
  classification: SampleClassification;
  chainLtp: number;
  quoteLtp: number | null;
  priceDiffPct: number | null;
  priceAgree: boolean;
  ageS: number | null;
  spotDriftPct: number;
  chainIv: number | null;
  recomputedIv: number | null;
  ivDiff: number | null;
}

export interface IndexQualityDiagnostic {
  index: string;
  totalRounds: number;
  totalSamples: number;
  liquidSamples: number;
  classifications: {
    comparable: { count: number; passCount: number; failCount: number; passRate: number | null };
    indeterminate: { count: number; passCount: number; failCount: number; passRate: number | null; reason: string };
    stale: { count: number; passCount: number; failCount: number; passRate: number | null; reason: string };
  };
  premiumTiers: {
    under5: { count: number; passCount: number; passRate: number | null };
    from5to20: { count: number; passCount: number; passRate: number | null };
    from20to50: { count: number; passCount: number; passRate: number | null };
    from50to100: { count: number; passCount: number; passRate: number | null };
    above100: { count: number; passCount: number; passRate: number | null };
  };
  spotDrift: {
    minPct: number;
    maxPct: number;
    medianPct: number;
    p95Pct: number;
  };
  ivQuality: {
    chainIvNullCount: number;
    recomputedIvNullCount: number;
    bothPresentCount: number;
    medianDiff: number | null;
    p95Diff: number | null;
  };
}

const pct = (arr: number[], p: number): number | null => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

export function classifySample(
  live: boolean,
  ageS: number | null,
  spotDriftPct: number
): SampleClassification {
  if (!live || ageS === null || ageS > LIVE_MAX_AGE_S) return "STALE";
  if (spotDriftPct > 0.01) return "INDETERMINATE";
  return "COMPARABLE";
}

type RoundRec = Round & { version?: string; at?: string; expiry?: string; spot?: number; chainSpot?: number; chainToQuoteMs?: number };

export function analyzeIndexRounds(index: string, rounds: RoundRec[]): IndexQualityDiagnostic {
  const matching = rounds.filter((r) => r.index === index && r.samples);
  let totalSamples = 0;
  let liquidSamples = 0;

  const compSamples: { pass: boolean; diffPct: number }[] = [];
  const indetSamples: { pass: boolean; diffPct: number }[] = [];
  const staleSamples: { pass: boolean; diffPct: number }[] = [];

  const tierCounts = {
    under5: { total: 0, pass: 0 },
    from5to20: { total: 0, pass: 0 },
    from20to50: { total: 0, pass: 0 },
    from50to100: { total: 0, pass: 0 },
    above100: { total: 0, pass: 0 },
  };

  const spotDrifts: number[] = [];
  let chainIvNullCount = 0;
  let recomputedIvNullCount = 0;
  const ivDiffs: number[] = [];

  for (const r of matching) {
    const spot = r.spot ?? 0;
    const chainSpot = r.chainSpot ?? 0;
    const spotDrift = Math.abs(spot - chainSpot);
    const spotDriftPct = spot > 0 ? (spotDrift / spot) * 100 : 0;
    spotDrifts.push(spotDriftPct);

    for (const s of r.samples || []) {
      totalSamples++;
      if (!s.liquid) continue;
      liquidSamples++;

      if (s.chainIv === null) chainIvNullCount++;
      if (s.recomputedIv === null) recomputedIvNullCount++;
      if (s.ivDiff !== null) ivDiffs.push(s.ivDiff);

      const pass = s.priceDiffPct !== null && s.priceDiffPct <= PRICE_TOL;
      const c = classifySample(s.live, s.ageS, spotDriftPct);

      if (c === "COMPARABLE") compSamples.push({ pass, diffPct: s.priceDiffPct ?? 0 });
      else if (c === "INDETERMINATE") indetSamples.push({ pass, diffPct: s.priceDiffPct ?? 0 });
      else staleSamples.push({ pass, diffPct: s.priceDiffPct ?? 0 });

      // Tier analysis for live samples with quote LTP
      if (s.live && s.quoteLtp !== null) {
        const p = s.quoteLtp;
        let t: { total: number; pass: number };
        if (p < 5) t = tierCounts.under5;
        else if (p < 20) t = tierCounts.from5to20;
        else if (p < 50) t = tierCounts.from20to50;
        else if (p < 100) t = tierCounts.from50to100;
        else t = tierCounts.above100;

        t.total++;
        if (pass) t.pass++;
      }
    }
  }

  const rate = (pass: number, total: number) => (total > 0 ? pass / total : null);

  const calcTier = (t: { total: number; pass: number }) => ({
    count: t.total,
    passCount: t.pass,
    passRate: rate(t.pass, t.total),
  });

  return {
    index,
    totalRounds: matching.length,
    totalSamples,
    liquidSamples,
    classifications: {
      comparable: {
        count: compSamples.length,
        passCount: compSamples.filter((x) => x.pass).length,
        failCount: compSamples.filter((x) => !x.pass).length,
        passRate: rate(compSamples.filter((x) => x.pass).length, compSamples.length),
      },
      indeterminate: {
        count: indetSamples.length,
        passCount: indetSamples.filter((x) => x.pass).length,
        failCount: indetSamples.filter((x) => !x.pass).length,
        passRate: rate(indetSamples.filter((x) => x.pass).length, indetSamples.length),
        reason: "Spot drift > 0.01% between chain snapshot and quote fetch",
      },
      stale: {
        count: staleSamples.length,
        passCount: staleSamples.filter((x) => x.pass).length,
        failCount: staleSamples.filter((x) => !x.pass).length,
        passRate: rate(staleSamples.filter((x) => x.pass).length, staleSamples.length),
        reason: "Quote last_trade_time age > 60s or null",
      },
    },
    premiumTiers: {
      under5: calcTier(tierCounts.under5),
      from5to20: calcTier(tierCounts.from5to20),
      from20to50: calcTier(tierCounts.from20to50),
      from50to100: calcTier(tierCounts.from50to100),
      above100: calcTier(tierCounts.above100),
    },
    spotDrift: {
      minPct: spotDrifts.length ? Math.min(...spotDrifts) : 0,
      maxPct: spotDrifts.length ? Math.max(...spotDrifts) : 0,
      medianPct: pct(spotDrifts, 0.5) ?? 0,
      p95Pct: pct(spotDrifts, 0.95) ?? 0,
    },
    ivQuality: {
      chainIvNullCount,
      recomputedIvNullCount,
      bothPresentCount: ivDiffs.length,
      medianDiff: pct(ivDiffs, 0.5),
      p95Diff: pct(ivDiffs, 0.95),
    },
  };
}

export function generateDataQualityDiagnostic(
  dir = AUDIT_DIR(),
  version = AUDIT_VERSION
): { version: string; indices: IndexQualityDiagnostic[] } {
  const { records } = readJsonl<RoundRec>(path.join(dir, "rounds.jsonl"));
  const versionRounds = records.filter((r) => r.version === version);
  const indices = INDICES.map((idx) => analyzeIndexRounds(idx, versionRounds));
  return { version, indices };
}
