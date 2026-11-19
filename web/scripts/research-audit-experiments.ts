// Phase 5: Research-Only Audit Methodology Experiments CLI
// Evaluates Experiments A (Next-Weekly Expiry), B (Tick-Aware Tolerance),
// C (Bid/Ask Consistency), and D (Black-Scholes IV Sensitivity).
//
// STRICT PROTECTION: Research-only. Does NOT alter active audit thresholds,
// verdict logic, historical records, or strategy behavior.

import fs from "node:fs";
import path from "node:path";
import { getAccessToken } from "../src/lib/services/upstoxAuth.ts";
import { get, normalizeChain, normalizeQuote } from "../src/lib/services/upstoxMarket.ts";
import { INDICES, INSTRUMENTS } from "../src/lib/services/instrumentRegistry.ts";
import {
  AUTHORITATIVE_TICK_SIZE,
  evaluateTickAwareComparison,
  classifyBidAskSpread,
  evaluateIvSensitivity,
} from "../src/lib/research/auditExperiments.ts";
import { impliedVolPct, yearsToExpiry } from "../src/lib/optionsAudit.ts";
import { readJsonl } from "../src/lib/ops/jsonl.ts";

const dir = path.join(process.cwd(), ".data", "options-audit");
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const outPath = path.join(dir, `research-experiments_${today}.json`);

console.log("\n==========================================================================================");
console.log("PHASE 5: RESEARCH-ONLY AUDIT METHODOLOGY EXPERIMENT REPORT");
console.log("==========================================================================================\n");

// ── 1. Experiment B: Tick-Aware Comparison on Active Audit Dataset ──────────────────────
console.log("------------------------------------------------------------------------------------------");
console.log("EXPERIMENT B: TICK-AWARE PRICE COMPARISON (Across Active 2026-10-27 Dataset)");
console.log("------------------------------------------------------------------------------------------");

type RoundRec = {
  version?: string;
  index: string;
  samples?: {
    chainLtp: number;
    quoteLtp: number | null;
    liquid: boolean;
  }[];
};

const { records } = readJsonl<RoundRec>(path.join(dir, "rounds.jsonl"));
const v1a = records.filter((r) => r.version === "options-audit-1a");

const tiers = [
  { name: "< ₹5 (Cheap/OTM)", filter: (p: number) => p < 5 },
  { name: "₹5 - ₹20", filter: (p: number) => p >= 5 && p < 20 },
  { name: "₹20 - ₹50", filter: (p: number) => p >= 20 && p < 50 },
  { name: "₹50 - ₹100", filter: (p: number) => p >= 50 && p < 100 },
  { name: ">= ₹100 (Deep ITM)", filter: (p: number) => p >= 100 },
];

const expBByIndex: Record<string, ReturnType<typeof evaluateTickAwareComparison>> = {};
const expBByTier: Record<string, ReturnType<typeof evaluateTickAwareComparison>> = {};

for (const idx of INDICES) {
  const samples = v1a.filter((r) => r.index === idx).flatMap((r) => r.samples || []);
  expBByIndex[idx] = evaluateTickAwareComparison(samples, AUTHORITATIVE_TICK_SIZE);
}

for (const t of tiers) {
  const allSamples = v1a.flatMap((r) => r.samples || []);
  const tierSamples = allSamples.filter((s) => s.quoteLtp !== null && t.filter(s.quoteLtp));
  expBByTier[t.name] = evaluateTickAwareComparison(tierSamples, AUTHORITATIVE_TICK_SIZE);
}

console.log("\n1. By Index Comparison (Standard 2.0% vs Proposed max(2%, tick/P)):");
console.table(
  Object.entries(expBByIndex).map(([idx, res]) => ({
    Index: idx.toUpperCase(),
    Samples: res.total,
    "Standard 2% Pass": res.passStandard2Pct,
    "Std Pass %": (res.passRateStandard! * 100).toFixed(1) + "%",
    "Tick-Aware Pass": res.passTickAware,
    "Tick Pass %": (res.passRateTickAware! * 100).toFixed(1) + "%",
    "Delta Count": res.deltaCount,
    "Median Abs Diff": res.medianAbsoluteDiff !== null ? "₹" + res.medianAbsoluteDiff.toFixed(2) : "-",
  }))
);

console.log("\n2. By Premium Tier Comparison:");
console.table(
  Object.entries(expBByTier).map(([tier, res]) => ({
    Tier: tier,
    Samples: res.total,
    "Standard 2% Pass": res.passStandard2Pct,
    "Std Pass %": (res.passRateStandard! * 100).toFixed(1) + "%",
    "Tick-Aware Pass": res.passTickAware,
    "Tick Pass %": (res.passRateTickAware! * 100).toFixed(1) + "%",
    "Delta Count": res.deltaCount,
    "<= 1 Tick Diff": res.diffLessThan1Tick,
    "> ₹1.00 Diff": res.diffGreaterThan1Rupee,
  }))
);

// ── 2. Experiment D: Black-Scholes IV Sensitivity Grid ──────────────────────────────────
console.log("\n------------------------------------------------------------------------------------------");
console.log("EXPERIMENT D: BLACK-SCHOLES IV SENSITIVITY GRID");
console.log("------------------------------------------------------------------------------------------");

const S = 22750;
const ivBase = 0.15;
const horizons = [
  { name: "0-DTE (1h left)", T: 1 / (365 * 24) },
  { name: "0-DTE (4h left)", T: 4 / (365 * 24) },
  { name: "2-DTE (SENSEX)", T: 2 / 365 },
  { name: "7-DTE (Next-Wk)", T: 7 / 365 },
  { name: "30-DTE (Monthly)", T: 30 / 365 },
];

const strikes = [
  { label: "ITM Call (22500)", K: 22500 },
  { label: "ATM Call (22750)", K: 22750 },
  { label: "OTM Call (23000)", K: 23000 },
];

const expDResults: Array<{
  Horizon: string;
  Strike: string;
  "Price (₹)": string;
  "Vega (₹/pt)": string;
  "ΔIV (+₹0.50)": string;
  "ΔIV (+₹1.00)": string;
  Stability: string;
}> = [];

for (const h of horizons) {
  for (const st of strikes) {
    const res = evaluateIvSensitivity(S, st.K, h.T, ivBase, "CE");
    expDResults.push({
      Horizon: h.name,
      Strike: st.label,
      "Price (₹)": res.theoreticalPrice.toFixed(2),
      "Vega (₹/pt)": res.vega.toFixed(4),
      "ΔIV (+₹0.50)": res.deltaIv50p !== null ? res.deltaIv50p.toFixed(2) + " pts" : "UNSOLVABLE",
      "ΔIV (+₹1.00)": res.deltaIv100p !== null ? res.deltaIv100p.toFixed(2) + " pts" : "UNSOLVABLE",
      Stability: res.stable ? "STABLE" : "UNSTABLE (<0.20)",
    });
  }
}

console.table(expDResults);

// ── 3. Live Research Probes (Experiments A and C) ───────────────────────────────────────
const token = await getAccessToken();

let expAResult: Record<string, unknown> | null = null;
let expCResult: Record<string, unknown> | null = null;

if (token) {
  console.log("\n------------------------------------------------------------------------------------------");
  console.log("EXPERIMENT A: NEXT-WEEKLY EXPIRY INVESTIGATION (NIFTY 2026-11-03, 7 DTE)");
  console.log("------------------------------------------------------------------------------------------");

  const expiry = "2026-11-03";
  const key = "NSE_INDEX|Nifty 50";
  const chainRaw = (await get(token, "/v2/option/chain", { instrument_key: key, expiry_date: expiry }, { index: "nifty", expiry })) as unknown;
  const chain = normalizeChain(chainRaw, "nifty", expiry);
  const idxQuote = normalizeQuote(await get(token, "/v2/market-quote/quotes", { instrument_key: key }, { index: "nifty" }), "nifty");

  const sorted = chain.rows;
  const atm = sorted.reduce((b, r) => (Math.abs(r.strike - chain.spot) < Math.abs(b.strike - chain.spot) ? r : b), sorted[0]);
  const i0 = sorted.indexOf(atm);
  const sampleRows = sorted.slice(Math.max(0, i0 - 5), i0 + 6);
  const sampleKeys = sampleRows.flatMap((r) => [r.call.instrumentKey, r.put.instrumentKey]).filter((k): k is string => !!k);

  const quotesRaw = (await get(token, "/v2/market-quote/quotes", { instrument_key: sampleKeys.join(",") }, { index: "nifty" })) as Record<string, { last_price?: number; last_trade_time?: number; depth?: { buy?: { price: number }[]; sell?: { price: number }[] } }>;
  const quotes = new Map<string, typeof quotesRaw[string]>();
  for (const e of Object.values(quotesRaw)) if ((e as { instrument_token?: string })?.instrument_token) quotes.set((e as { instrument_token: string }).instrument_token, e);

  const T = yearsToExpiry(expiry, new Date());
  const aSamples: Array<{ strike: number; type: string; chainLtp: number; quoteLtp: number | null; chainIv: number | null; recomputedIv: number | null; ivDiff: number | null }> = [];

  for (const row of sampleRows) {
    for (const [type, side] of [["CE", row.call], ["PE", row.put]] as const) {
      const q = quotes.get(side.instrumentKey!);
      const qLtp = q?.last_price ?? null;
      const recomputedIv = qLtp ? impliedVolPct(qLtp, idxQuote.spot, row.strike, T, type) : null;
      const ivDiff = side.iv !== null && recomputedIv !== null ? Math.abs(side.iv - recomputedIv) : null;
      aSamples.push({
        strike: row.strike,
        type,
        chainLtp: side.ltp,
        quoteLtp: qLtp,
        chainIv: side.iv,
        recomputedIv,
        ivDiff,
      });
    }
  }

  const ivDiffs = aSamples.map((s) => s.ivDiff).filter((d): d is number => d !== null).sort((a, b) => a - b);
  const med = ivDiffs[Math.floor(ivDiffs.length * 0.5)];
  const p95 = ivDiffs[Math.floor(ivDiffs.length * 0.95)];

  expAResult = {
    expiry,
    daysToExpiry: Math.round(T * 365),
    samples: aSamples.length,
    missingIvCount: aSamples.filter((s) => s.chainIv === null).length,
    medianIvDiff: med,
    p95IvDiff: p95,
  };

  console.log(`\nNext-Weekly Expiry: ${expiry} (${Math.round(T * 365)} days to expiry)`);
  console.log(`Samples: ${aSamples.length} | Missing Upstream IV: ${aSamples.filter((s) => s.chainIv === null).length}`);
  console.log(`IV Difference: Median = ${med?.toFixed(2)} pts | P95 = ${p95?.toFixed(2)} pts`);
  console.log(`Comparison with 0-DTE NIFTY:`);
  console.log(`- 0-DTE Median IV Diff: 1.29 pts  vs  7-DTE Median IV Diff: ${med?.toFixed(2)} pts`);
  console.log(`- 0-DTE P95 IV Diff:    32.04 pts vs  7-DTE P95 IV Diff:    ${p95?.toFixed(2)} pts (PASSES <= 3.0)`);

  // ── Experiment C: Bid/Ask Consistency Probe ───────────────────────────────────────────
  console.log("\n------------------------------------------------------------------------------------------");
  console.log("EXPERIMENT C: BID/ASK SPREAD CONSISTENCY PROBE");
  console.log("------------------------------------------------------------------------------------------");

  const cRows: Array<{
    Index: string;
    Expiry: string;
    Total: number;
    WithinSpread: number;
    OutsideSpread: number;
    Indeterminate: number;
    "Within Spread %": string;
  }> = [];

  const expCSummary: Record<string, unknown> = {};

  for (const index of INDICES) {
    const uKey = INSTRUMENTS[index].underlyingKey;
    const cList = (await get(token, "/v2/option/contract", { instrument_key: uKey }, { index })) as { expiry?: string }[];
    const exps = [...new Set(cList.map((c) => c.expiry).filter((e): e is string => !!e && e >= today))].sort();
    const exp = exps[0];
    if (!exp) continue;

    const cRaw = (await get(token, "/v2/option/chain", { instrument_key: uKey, expiry_date: exp }, { index, expiry: exp })) as unknown;
    const ch = normalizeChain(cRaw, index, exp);
    const sortedCh = ch.rows;
    const atmCh = sortedCh.reduce((b, r) => (Math.abs(r.strike - ch.spot) < Math.abs(b.strike - ch.spot) ? r : b), sortedCh[0]);
    const idx0 = sortedCh.indexOf(atmCh);
    const sRows = sortedCh.slice(Math.max(0, idx0 - 5), idx0 + 6);
    const sKeys = sRows.flatMap((r) => [r.call.instrumentKey, r.put.instrumentKey]).filter((k): k is string => !!k);

    const qRaw = (await get(token, "/v2/market-quote/quotes", { instrument_key: sKeys.join(",") }, { index })) as Record<string, { last_price?: number; depth?: { buy?: { price: number }[]; sell?: { price: number }[] } }>;
    const qMap = new Map<string, typeof qRaw[string]>();
    for (const e of Object.values(qRaw)) if ((e as { instrument_token?: string })?.instrument_token) qMap.set((e as { instrument_token: string }).instrument_token, e);

    let within = 0;
    let outside = 0;
    let indet = 0;

    for (const r of sRows) {
      for (const [, side] of [["CE", r.call], ["PE", r.put]] as const) {
        const q = qMap.get(side.instrumentKey!);
        const bid = q?.depth?.buy?.[0]?.price ?? null;
        const ask = q?.depth?.sell?.[0]?.price ?? null;
        const cls = classifyBidAskSpread(side.ltp, bid, ask);
        if (cls.classification === "WITHIN_SPREAD") within++;
        else if (cls.classification === "OUTSIDE_SPREAD") outside++;
        else indet++;
      }
    }

    const total = within + outside + indet;
    cRows.push({
      Index: index.toUpperCase(),
      Expiry: exp,
      Total: total,
      WithinSpread: within,
      OutsideSpread: outside,
      Indeterminate: indet,
      "Within Spread %": total > 0 ? ((within / total) * 100).toFixed(1) + "%" : "-",
    });
  }

  console.table(cRows);
  expCResult = { summary: cRows };
}

// ── Save Full Research Artifact ─────────────────────────────────────────────────────────
const fullArtifact = {
  date: today,
  authoritativeTickSize: AUTHORITATIVE_TICK_SIZE,
  experimentA_nextWeekly: expAResult,
  experimentB_tickAware: { byIndex: expBByIndex, byTier: expBByTier },
  experimentC_bidAsk: expCResult,
  experimentD_ivSensitivity: expDResults,
};

fs.writeFileSync(outPath, JSON.stringify(fullArtifact, null, 2));
console.log(`\nFull research artifact written to: ${outPath}\n`);
