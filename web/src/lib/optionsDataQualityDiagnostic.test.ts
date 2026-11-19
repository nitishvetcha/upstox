import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  classifySample,
  analyzeIndexRounds,
  generateDataQualityDiagnostic,
} from "./optionsDataQualityDiagnostic.ts";

describe("optionsDataQualityDiagnostic", () => {
  it("classifySample: categorizes STALE, INDETERMINATE, and COMPARABLE", () => {
    // Stale cases
    assert.equal(classifySample(false, 30, 0.005), "STALE");
    assert.equal(classifySample(true, null, 0.005), "STALE");
    assert.equal(classifySample(true, 61, 0.005), "STALE");

    // Indeterminate case (spot drift > 0.01%)
    assert.equal(classifySample(true, 10, 0.015), "INDETERMINATE");

    // Comparable case (live, age <= 60s, spot drift <= 0.01%)
    assert.equal(classifySample(true, 5, 0.005), "COMPARABLE");
    assert.equal(classifySample(true, 60, 0.01), "COMPARABLE");
  });

  it("analyzeIndexRounds: aggregates empty rounds gracefully", () => {
    const res = analyzeIndexRounds("nifty", []);
    assert.equal(res.index, "nifty");
    assert.equal(res.totalRounds, 0);
    assert.equal(res.liquidSamples, 0);
    assert.equal(res.classifications.comparable.count, 0);
    assert.equal(res.classifications.comparable.passRate, null);
    assert.equal(res.spotDrift.minPct, 0);
    assert.equal(res.ivQuality.chainIvNullCount, 0);
  });

  it("analyzeIndexRounds: computes breakdown and tier analysis correctly", () => {
    const round = {
      index: "nifty",
      session: "2026-10-27",
      spot: 22500,
      chainSpot: 22500, // 0.00% drift
      samples: [
        {
          key: "K1",
          strike: 22500,
          type: "CE" as const,
          liquid: true,
          ageS: 5,
          live: true,
          chainLtp: 100,
          quoteLtp: 101, // 0.99% diff -> pass
          priceDiffPct: 0.0099,
          chainIv: 15.0,
          recomputedIv: 15.2,
          ivDiff: 0.2,
        },
        {
          key: "K2",
          strike: 22600,
          type: "CE" as const,
          liquid: true,
          ageS: 5,
          live: true,
          chainLtp: 3.0,
          quoteLtp: 3.5, // 14.28% diff -> fail
          priceDiffPct: 0.1428,
          chainIv: null,
          recomputedIv: 16.0,
          ivDiff: null,
        },
        {
          key: "K3",
          strike: 22400,
          type: "PE" as const,
          liquid: true,
          ageS: 90, // stale
          live: false,
          chainLtp: 50,
          quoteLtp: 50,
          priceDiffPct: 0,
          chainIv: 14.0,
          recomputedIv: 14.0,
          ivDiff: 0,
        },
      ],
    };

    const res = analyzeIndexRounds("nifty", [round]);
    assert.equal(res.totalRounds, 1);
    assert.equal(res.liquidSamples, 3);

    // Classifications
    assert.equal(res.classifications.comparable.count, 2);
    assert.equal(res.classifications.comparable.passCount, 1);
    assert.equal(res.classifications.comparable.failCount, 1);
    assert.equal(res.classifications.comparable.passRate, 0.5);

    assert.equal(res.classifications.stale.count, 1);
    assert.equal(res.classifications.stale.passCount, 1);

    // Premium tiers
    assert.equal(res.premiumTiers.under5.count, 1); // K2: quoteLtp 3.5
    assert.equal(res.premiumTiers.under5.passCount, 0);
    assert.equal(res.premiumTiers.above100.count, 1); // K1: quoteLtp 101
    assert.equal(res.premiumTiers.above100.passCount, 1);

    // IV quality
    assert.equal(res.ivQuality.chainIvNullCount, 1);
    assert.equal(res.ivQuality.bothPresentCount, 2);
    assert.equal(res.ivQuality.medianDiff, 0.2); // [0, 0.2] median at index 1 is 0.2
  });

  it("generateDataQualityDiagnostic: filters by version in isolated directory", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "diag-test-"));
    try {
      const records = [
        {
          version: "options-audit-1a",
          index: "nifty",
          session: "2026-10-27",
          spot: 22500,
          chainSpot: 22500,
          samples: [
            {
              key: "K1",
              strike: 22500,
              type: "CE",
              liquid: true,
              ageS: 5,
              live: true,
              chainLtp: 100,
              quoteLtp: 100,
              priceDiffPct: 0,
              chainIv: 15,
              recomputedIv: 15,
              ivDiff: 0,
            },
          ],
        },
        {
          version: "options-audit-1", // legacy version
          index: "nifty",
          session: "2026-10-26",
          spot: 22400,
          chainSpot: 22400,
          samples: [
            {
              key: "K_LEGACY",
              strike: 22400,
              type: "CE",
              liquid: true,
              ageS: 5,
              live: true,
              chainLtp: 50,
              quoteLtp: 60,
              priceDiffPct: 0.2,
              chainIv: 14,
              recomputedIv: 14,
              ivDiff: 0,
            },
          ],
        },
      ];
      fs.writeFileSync(path.join(tmp, "rounds.jsonl"), records.map((r) => JSON.stringify(r)).join("\n") + "\n");

      const diag = generateDataQualityDiagnostic(tmp, "options-audit-1a");
      assert.equal(diag.version, "options-audit-1a");
      const nifty = diag.indices.find((i) => i.index === "nifty")!;
      assert.equal(nifty.totalRounds, 1);
      assert.equal(nifty.liquidSamples, 1);
      assert.equal(nifty.classifications.comparable.passCount, 1);

      // Verify legacy version selection
      const legacyDiag = generateDataQualityDiagnostic(tmp, "options-audit-1");
      const legacyNifty = legacyDiag.indices.find((i) => i.index === "nifty")!;
      assert.equal(legacyNifty.totalRounds, 1);
      assert.equal(legacyNifty.classifications.comparable.failCount, 1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
