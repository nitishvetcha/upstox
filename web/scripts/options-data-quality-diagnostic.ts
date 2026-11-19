// Phase 4: Market-Data Suitability and Independent Validation
// Read-only diagnostic CLI tool: evaluates data quality across rounds in .data/options-audit/
// Does NOT modify existing audit definitions, thresholds, or historical files.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { generateDataQualityDiagnostic } from "../src/lib/optionsDataQualityDiagnostic.ts";
import { AUDIT_VERSION } from "../src/lib/optionsAudit.ts";

const dir = path.join(process.cwd(), ".data", "options-audit");
const version = process.argv[2] || AUDIT_VERSION;

const result = generateDataQualityDiagnostic(dir, version);
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const outPath = path.join(dir, `data-quality-diagnostic_${today}.json`);
writeFileSync(outPath, JSON.stringify(result, null, 2));

console.log(`\n========================================================================================`);
console.log(`OPTIONS DATA QUALITY DIAGNOSTIC REPORT — Version: ${version}`);
console.log(`Saved to: ${outPath}`);
console.log(`========================================================================================\n`);

for (const idx of result.indices) {
  console.log(`----------------------------------------------------------------------------------------`);
  console.log(`INDEX: ${idx.index.toUpperCase()} (Rounds: ${idx.totalRounds}, Liquid Samples: ${idx.liquidSamples})`);
  console.log(`----------------------------------------------------------------------------------------`);
  
  const comp = idx.classifications.comparable;
  const indet = idx.classifications.indeterminate;
  const stale = idx.classifications.stale;

  console.log(`1. CLASSIFICATION & PRICE AGREEMENT:`);
  console.log(`   - Comparable   (Live & Spot Drift <= 0.01%): ${comp.count.toString().padStart(3)} | Pass: ${comp.passCount.toString().padStart(3)} | Fail: ${comp.failCount.toString().padStart(3)} | Pass Rate: ${comp.passRate !== null ? (comp.passRate * 100).toFixed(1) + "%" : "-"}`);
  console.log(`   - Indeterminate (Spot Drift > 0.01%):         ${indet.count.toString().padStart(3)} | Pass: ${indet.passCount.toString().padStart(3)} | Fail: ${indet.failCount.toString().padStart(3)} | Pass Rate: ${indet.passRate !== null ? (indet.passRate * 100).toFixed(1) + "%" : "-"}`);
  console.log(`   - Stale         (Age > 60s or unquoted):      ${stale.count.toString().padStart(3)} | Pass: ${stale.passCount.toString().padStart(3)} | Fail: ${stale.failCount.toString().padStart(3)} | Pass Rate: ${stale.passRate !== null ? (stale.passRate * 100).toFixed(1) + "%" : "-"}`);

  console.log(`\n2. PRICE AGREEMENT BY PREMIUM TIER (Live samples):`);
  const tiers = idx.premiumTiers;
  console.log(`   - < ₹5 (Cheap / OTM):        Count: ${tiers.under5.count.toString().padStart(3)} | Pass: ${tiers.under5.passCount.toString().padStart(3)} | Pass Rate: ${tiers.under5.passRate !== null ? (tiers.under5.passRate * 100).toFixed(1) + "%" : "-"}`);
  console.log(`   - ₹5 - ₹20:                  Count: ${tiers.from5to20.count.toString().padStart(3)} | Pass: ${tiers.from5to20.passCount.toString().padStart(3)} | Pass Rate: ${tiers.from5to20.passRate !== null ? (tiers.from5to20.passRate * 100).toFixed(1) + "%" : "-"}`);
  console.log(`   - ₹20 - ₹50:                 Count: ${tiers.from20to50.count.toString().padStart(3)} | Pass: ${tiers.from20to50.passCount.toString().padStart(3)} | Pass Rate: ${tiers.from20to50.passRate !== null ? (tiers.from20to50.passRate * 100).toFixed(1) + "%" : "-"}`);
  console.log(`   - ₹50 - ₹100:                Count: ${tiers.from50to100.count.toString().padStart(3)} | Pass: ${tiers.from50to100.passCount.toString().padStart(3)} | Pass Rate: ${tiers.from50to100.passRate !== null ? (tiers.from50to100.passRate * 100).toFixed(1) + "%" : "-"}`);
  console.log(`   - >= ₹100 (Deep ITM):        Count: ${tiers.above100.count.toString().padStart(3)} | Pass: ${tiers.above100.passCount.toString().padStart(3)} | Pass Rate: ${tiers.above100.passRate !== null ? (tiers.above100.passRate * 100).toFixed(1) + "%" : "-"}`);

  console.log(`\n3. SPOT DRIFT & IV QUALITY:`);
  console.log(`   - Spot Drift: Min ${idx.spotDrift.minPct.toFixed(4)}% | Max ${idx.spotDrift.maxPct.toFixed(4)}% | Median ${idx.spotDrift.medianPct.toFixed(4)}% | P95 ${idx.spotDrift.p95Pct.toFixed(4)}%`);
  console.log(`   - Upstream Missing IV: ${idx.ivQuality.chainIvNullCount} nulls | Recomputed Unsolvable: ${idx.ivQuality.recomputedIvNullCount} nulls | Both Present: ${idx.ivQuality.bothPresentCount}`);
  console.log(`   - IV Diff: Median ${idx.ivQuality.medianDiff !== null ? idx.ivQuality.medianDiff.toFixed(2) : "-"} | P95 ${idx.ivQuality.p95Diff !== null ? idx.ivQuality.p95Diff.toFixed(2) : "-"}\n`);
}
