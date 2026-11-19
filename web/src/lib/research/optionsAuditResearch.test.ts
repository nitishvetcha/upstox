import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RESEARCH_AUDIT_VERSION,
  selectResearchExpiry,
  sampleResearchRound,
  aggregateHorizonMetrics,
  type ResearchRound,
} from "./optionsAuditResearch.ts";
import { AUDIT_VERSION } from "../optionsAudit.ts";

describe("optionsAuditResearch (Phase 6 Research Protocol)", () => {
  it("dataset isolation: research version differs strictly from production AUDIT_VERSION", () => {
    assert.equal(RESEARCH_AUDIT_VERSION, "options-audit-2-research");
    assert.equal(AUDIT_VERSION, "options-audit-1a");
    assert.notEqual(RESEARCH_AUDIT_VERSION, AUDIT_VERSION);
  });

  it("selectResearchExpiry: 2-7 IST calendar-day window, fallback beyond it, never below the minimum", () => {
    const now = new Date("2026-10-27T10:00:00+05:30");

    const sel1 = selectResearchExpiry(["2026-10-27", "2026-11-03", "2026-11-26"], now, 2, 7);
    assert.ok(sel1);
    assert.equal(sel1.expiry, "2026-11-03");
    assert.equal(sel1.calendarDays, 7);
    assert.equal(sel1.exactDays, 7.23);
    assert.equal(sel1.horizon, "TARGET_WINDOW");
    assert.equal(sel1.seriesType, "WEEKLY");

    const sel2 = selectResearchExpiry(["2026-10-27", "2026-11-26", "2026-12-31"], now, 2, 7);
    assert.ok(sel2);
    assert.equal(sel2.expiry, "2026-11-26");
    assert.equal(sel2.horizon, "FALLBACK");
    assert.equal(sel2.seriesType, "MONTHLY");

    assert.equal(selectResearchExpiry(["2026-10-20", "2026-10-26"], now, 2, 7), null);
    // Only same-day / next-day expiries listed: no fallback to a contract below the minimum
    assert.equal(selectResearchExpiry(["2026-10-27", "2026-10-28"], now, 2, 7), null);
  });

  it("sampleResearchRound: correctly classifies temporal, book, and IV states", () => {
    const fetchedAt = new Date("2026-10-27T10:00:00+05:30");
    const expiry = "2026-11-03";

    const rows = [
      {
        strike: 22500,
        call: {
          ltp: 150,
          bid: 149.5,
          ask: 150.5,
          oi: 10000,
          volume: 5000,
          iv: 15.2,
          delta: 0.5,
          gamma: 0.001,
          theta: -5,
          vega: 10,
          instrumentKey: "NSE_FO|1111",
          chgOi: null,
        },
        put: {
          ltp: 0,
          bid: null,
          ask: null,
          oi: 0,
          volume: 0,
          iv: null,
          delta: null,
          gamma: null,
          theta: null,
          vega: null,
          instrumentKey: "NSE_FO|2222",
          chgOi: null,
        },
      },
    ];

    const quotes = new Map([
      [
        "NSE_FO|1111",
        {
          last_price: 150.0,
          last_trade_time: fetchedAt.getTime() - 5000, // 5s ago (live)
          timestamp: fetchedAt.toISOString(),
          depth: {
            buy: [{ price: 149.5 }],
            sell: [{ price: 150.5 }],
          },
        },
      ],
    ]);

    // Test with negligible spot drift (<= 0.01%)
    const samples = sampleResearchRound(rows, quotes, 22500, 22500, expiry, fetchedAt);
    assert.equal(samples.length, 2);

    const callSample = samples.find((s) => s.key === "NSE_FO|1111")!;
    assert.equal(callSample.liquid, true);
    assert.equal(callSample.live, true);
    assert.equal(callSample.temporalClassification, "COMPARABLE");
    assert.equal(callSample.bookClassification, "WITHIN_SPREAD");
    assert.equal(callSample.spreadWidth, 1.0);
    assert.equal(callSample.priceAgreeStandard, true);
    assert.equal(callSample.ivClassification, "BOTH_PRESENT");
    
        // Future-dated quote timestamps must never be classified as LIVE.
    const futureQuotes = new Map(quotes);
    const existingQuote = futureQuotes.get("NSE_FO|1111")!;

    futureQuotes.set("NSE_FO|1111", {
      ...existingQuote,
      last_trade_time: fetchedAt.getTime() + 5000,
    });

    const futureSamples = sampleResearchRound(
      rows,
      futureQuotes,
      22500,
      22500,
      expiry,
      fetchedAt
    );

    const futureSample = futureSamples.find(
      (s) => s.key === "NSE_FO|1111"
    )!;

    assert.equal(futureSample.ageS, -5);
    assert.equal(futureSample.live, false);
    assert.equal(futureSample.temporalClassification, "STALE");

    // Put sample had no quote and 0 LTP
    const putSample = samples.find((s) => s.key === "NSE_FO|2222")!;
    assert.equal(putSample.liquid, false);
    assert.equal(putSample.temporalClassification, "STALE");
    assert.equal(putSample.bookClassification, "INDETERMINATE");
    assert.equal(putSample.ivClassification, "UPSTREAM_MISSING");
  });

  it("aggregateHorizonMetrics: aggregates metrics across rounds without fabricating missing data", () => {
    const round: ResearchRound = {
      version: RESEARCH_AUDIT_VERSION,
      index: "nifty",
      session: "2026-10-27",
      at: "2026-10-27T10:00:00Z",
      expiry: "2026-11-03",
      daysToExpiry: 7.0,
      spot: 22500,
      chainSpot: 22500,
      spotDriftPct: 0.0,
      chainToQuoteMs: 150,
      samples: [
        {
          key: "K1",
          strike: 22500,
          type: "CE",
          expiry: "2026-11-03",
          timeToExpiryYears: 7 / 365,
          daysToExpiry: 7.0,
          liquid: true,
          chainLtp: 100,
          chainBid: 99,
          chainAsk: 101,
          chainIv: 15.0,
          quoteLtp: 100.5,
          quoteBestBid: 99.5,
          quoteBestAsk: 101.5,
          quoteResponseTime: "2026-10-27T10:00:00Z",
          quoteLastTradeTime: "2026-10-27T09:59:55Z",
          ageS: 5,
          live: true,
          priceDiffPct: 0.005,
          priceAgreeStandard: true,
          priceAgreeTickAware: true,
          recomputedIv: 15.2,
          ivDiff: 0.2,
          temporalClassification: "COMPARABLE",
          bookClassification: "WITHIN_SPREAD",
          spreadWidth: 2.0,
          ivClassification: "BOTH_PRESENT",
        },
      ],
    };

        // Add stale and indeterminate samples.
    // They must remain visible in coverage counts but must not affect
    // price agreement or IV acceptance metrics.

    round.samples!.push(
      {
        ...round.samples![0],
        key: "K_STALE",
        ageS: 120,
        live: false,
        temporalClassification: "STALE",
        priceAgreeStandard: false,
        priceAgreeTickAware: false,
        ivDiff: 99,
      },
      {
        ...round.samples![0],
        key: "K_INDETERMINATE",
        ageS: 5,
        live: true,
        temporalClassification: "INDETERMINATE",
        priceAgreeStandard: false,
        priceAgreeTickAware: false,
        ivDiff: 88,
      }
    );

    const agg = aggregateHorizonMetrics("2-7 DTE (Next-Weekly)", [round]);
    assert.equal(agg.horizon, "2-7 DTE (Next-Weekly)");
    assert.equal(agg.rounds, 1);
       assert.equal(agg.liquidSamples, 3);
    assert.equal(agg.missingIvCount, 0);
    assert.equal(agg.missingIvRate, 0.0);

    // Only the fresh, comparable sample contributes to IV metrics.
    assert.equal(agg.ivPairs, 1);
    assert.equal(agg.ivMedianDiff, 0.2);
    assert.equal(agg.ivP95Diff, 0.2);

    // Only the fresh, comparable, priced sample contributes to price agreement.
    assert.equal(agg.pricedSamples, 3);
    assert.equal(agg.pricedComparableSamples, 1);
    assert.equal(agg.priceAgreeStandardRate, 1.0);
    assert.equal(agg.priceAgreeTickAwareRate, 1.0);

    assert.equal(agg.withinBidAskRate, 1.0);
    assert.equal(agg.comparableShare, 1 / 3);
    assert.equal(agg.indeterminateShare, 1 / 3);
    assert.equal(agg.staleShare, 1 / 3);
  });

  it("regression: production auditReport ignores research protocol records completely", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");
    const { auditReport } = await import("../optionsAuditReport.ts");

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "iso-test-"));
    try {
      const prodRound = {
        version: "options-audit-1a",
        index: "nifty",
        session: "2026-10-27",
        samples: [{ key: "P1", strike: 22500, type: "CE", liquid: true, live: true, priceDiffPct: 0.01 }],
      };
      const researchRound = {
        version: "options-audit-2-research",
        index: "nifty",
        session: "2026-10-27",
        samples: [{ key: "R1", strike: 22600, type: "CE", liquid: true, live: true, priceDiffPct: 0.01 }],
      };
      fs.writeFileSync(path.join(tmp, "rounds.jsonl"), JSON.stringify(prodRound) + "\n" + JSON.stringify(researchRound) + "\n");

      // Production auditReport defaults to options-audit-1a
      const rep = auditReport(tmp, "options-audit-1a");
      const nifty = rep.indices.find((i) => i.index === "nifty")!;
      // Only 1 round used (the prodRound), the researchRound must be completely ignored
      assert.equal(nifty.roundsAttempted, 1);
      assert.equal(nifty.roundsSucceeded, 1);
      assert.equal(rep.indices.every((i) => i.roundsAttempted <= 1), true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("regression: weekly (2-7 DTE) and monthly (>7 DTE) metrics remain separate in aggregations", () => {
    const weeklyRound: ResearchRound = {
      version: RESEARCH_AUDIT_VERSION,
      index: "nifty",
      session: "2026-10-27",
      at: "2026-10-27T10:00:00Z",
      expiry: "2026-11-03",
      daysToExpiry: 6.9,
      spot: 22500,
      chainSpot: 22500,
      spotDriftPct: 0.0,
      chainToQuoteMs: 150,
      samples: [
        {
          key: "WK1",
          strike: 22500,
          type: "CE",
          expiry: "2026-11-03",
          timeToExpiryYears: 7 / 365,
          daysToExpiry: 6.9,
          liquid: true,
          chainLtp: 100,
          chainBid: 99,
          chainAsk: 101,
          chainIv: 15.0,
          quoteLtp: 100,
          quoteBestBid: 99.5,
          quoteBestAsk: 100.5,
          quoteResponseTime: "2026-10-27T10:00:00Z",
          quoteLastTradeTime: "2026-10-27T09:59:55Z",
          ageS: 5,
          live: true,
          priceDiffPct: 0.0,
          priceAgreeStandard: true,
          priceAgreeTickAware: true,
          recomputedIv: 15.1,
          ivDiff: 0.1,
          temporalClassification: "COMPARABLE",
          bookClassification: "WITHIN_SPREAD",
          spreadWidth: 1.0,
          ivClassification: "BOTH_PRESENT",
        },
      ],
    };

    const monthlyRound: ResearchRound = {
      version: RESEARCH_AUDIT_VERSION,
      index: "banknifty",
      session: "2026-10-27",
      at: "2026-10-27T10:00:00Z",
      expiry: "2026-11-23",
      daysToExpiry: 26.9,
      spot: 52000,
      chainSpot: 52000,
      spotDriftPct: 0.0,
      chainToQuoteMs: 150,
      samples: [
        {
          key: "MN1",
          strike: 52000,
          type: "CE",
          expiry: "2026-11-23",
          timeToExpiryYears: 27 / 365,
          daysToExpiry: 26.9,
          liquid: true,
          chainLtp: 500,
          chainBid: 495,
          chainAsk: 505,
          chainIv: 18.0,
          quoteLtp: 510,
          quoteBestBid: 495,
          quoteBestAsk: 505,
          quoteResponseTime: "2026-10-27T10:00:00Z",
          quoteLastTradeTime: "2026-10-27T09:59:55Z",
          ageS: 5,
          live: true,
          priceDiffPct: 0.02,
          priceAgreeStandard: true,
          priceAgreeTickAware: true,
          recomputedIv: 19.5,
          ivDiff: 1.5,
          temporalClassification: "COMPARABLE",
          bookClassification: "OUTSIDE_SPREAD",
          spreadWidth: 10.0,
          ivClassification: "BOTH_PRESENT",
        },
      ],
    };

    const wkAgg = aggregateHorizonMetrics("2-7 DTE (Next-Weekly)", [weeklyRound]);
    const mnAgg = aggregateHorizonMetrics("Monthly (>7 DTE)", [monthlyRound]);

    assert.equal(wkAgg.horizon, "2-7 DTE (Next-Weekly)");
    assert.equal(wkAgg.ivMedianDiff, 0.1);
    assert.equal(wkAgg.withinBidAskRate, 1.0);

    assert.equal(mnAgg.horizon, "Monthly (>7 DTE)");
    assert.equal(mnAgg.ivMedianDiff, 1.5);
    assert.equal(mnAgg.withinBidAskRate, 0.0);
  });

  it("regression: missing data remains null and report denominators strictly match raw records", () => {
    const round: ResearchRound = {
      version: RESEARCH_AUDIT_VERSION,
      index: "nifty",
      session: "2026-10-27",
      at: "2026-10-27T10:00:00Z",
      expiry: "2026-11-03",
      daysToExpiry: 6.9,
      spot: 22500,
      chainSpot: 22500,
      spotDriftPct: 0.0,
      chainToQuoteMs: 150,
      samples: [
        {
          key: "K_MISSING_IV",
          strike: 22500,
          type: "CE",
          expiry: "2026-11-03",
          timeToExpiryYears: 7 / 365,
          daysToExpiry: 6.9,
          liquid: true,
          chainLtp: 100,
          chainBid: null,
          chainAsk: null,
          chainIv: null, // missing upstream IV
          quoteLtp: 100,
          quoteBestBid: null,
          quoteBestAsk: null,
          quoteResponseTime: null,
          quoteLastTradeTime: null,
          ageS: null,
          live: false,
          priceDiffPct: 0.0,
          priceAgreeStandard: true,
          priceAgreeTickAware: true,
          recomputedIv: 15.0,
          ivDiff: null, // must remain null
          temporalClassification: "STALE",
          bookClassification: "INDETERMINATE",
          spreadWidth: null,
          ivClassification: "UPSTREAM_MISSING",
        },
      ],
    };

    const agg = aggregateHorizonMetrics("2-7 DTE (Next-Weekly)", [round]);
    assert.equal(agg.totalSamples, 1);
    assert.equal(agg.liquidSamples, 1);
    assert.equal(agg.missingIvCount, 1);
    assert.equal(agg.missingIvRate, 1.0);
    assert.equal(agg.ivMedianDiff, null); // Cannot compute median when all IV diffs are null
    assert.equal(agg.ivP95Diff, null);
  });
});
