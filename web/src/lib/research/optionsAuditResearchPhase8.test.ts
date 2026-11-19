// Phase 8: expiry-boundary semantics, report reproducibility and production isolation for options-audit-2-research.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  RESEARCH_AUDIT_VERSION,
  selectResearchExpiry,
  researchReport,
  type ResearchRound,
  type ResearchSample,
} from "./optionsAuditResearch.ts";
import {
  AUDIT_VERSION,
  LIVE_MAX_AGE_S,
  PRICE_TOL,
  MIN_SESSIONS,
  MIN_ROUNDS_PER_SESSION,
  PASS_SHARE,
  IV_MEDIAN_MAX,
  IV_P95_MAX,
  MAX_FAILED_ROUND_SHARE,
} from "../optionsAudit.ts";
import { auditReport } from "../optionsAuditReport.ts";
import { FROZEN_STRATEGY_VERSION } from "../strategyEvidenceEngine.ts";
import { marketStatus } from "../time.ts";

const ist = (s: string) => new Date(`${s}+05:30`);

describe("Phase 8: expiry selection boundaries (IST calendar days)", () => {
  const sel = (exp: string, at: string) =>
    selectResearchExpiry([exp], ist(at), 2, 7);

  it("1 calendar day: rejected (below window, no fallback)", () =>
    assert.equal(sel("2026-10-28", "2026-10-27T09:20:00"), null));
  it("expiry day itself: rejected even before 15:30", () =>
    assert.equal(sel("2026-10-27", "2026-10-27T09:20:00"), null));
  it("exactly 2 calendar days at 17:19 IST: admitted with exactDays < 2, never labelled as 2 exact days", () => {
    const s = sel("2026-10-29", "2026-10-27T17:19:00")!;
    assert.equal(s.calendarDays, 2);
    assert.ok(s.exactDays < 2 && s.exactDays > 1.9);
    assert.equal(s.horizon, "TARGET_WINDOW");
  });
  it("exactly 7 calendar days: target window", () =>
    assert.equal(
      sel("2026-11-03", "2026-10-27T15:29:00")!.horizon,
      "TARGET_WINDOW",
    ));
  it("8 calendar days: fallback, never target", () =>
    assert.equal(
      sel("2026-11-04", "2026-10-27T09:15:00")!.horizon,
      "FALLBACK",
    ));
  it("IST midnight boundary: 23:59 vs 00:00 IST changes calendarDays by one", () => {
    assert.equal(sel("2026-10-29", "2026-10-26T23:59:00")!.calendarDays, 3);
    assert.equal(sel("2026-10-29", "2026-10-27T00:00:00")!.calendarDays, 2);
    // 18:30 UTC is already the next IST date
    assert.equal(
      selectResearchExpiry(
        ["2026-10-29"],
        new Date("2026-10-26T18:30:00Z"),
        2,
        7,
      )!.calendarDays,
      2,
    );
  });
  it("monthly series = last listed expiry in its month; indices are not assumed to share a calendar", () => {
    const now = ist("2026-10-27T10:00:00");
    assert.equal(
      selectResearchExpiry(["2026-11-03", "2026-11-10", "2026-11-24"], now)!
        .seriesType,
      "WEEKLY",
    );
    assert.equal(
      selectResearchExpiry(["2026-11-26", "2026-12-31"], now)!.seriesType,
      "MONTHLY",
    );
  });
});

const sample = (
  key: string,
  over: Partial<ResearchSample> = {},
): ResearchSample => ({
  key,
  strike: 22500,
  type: "CE",
  expiry: "2026-11-03",
  timeToExpiryYears: 0.02,
  daysToExpiry: 7,
  liquid: true,
  chainLtp: 100,
  chainBid: 99,
  chainAsk: 101,
  chainIv: 15,
  quoteLtp: 100,
  quoteBestBid: 99,
  quoteBestAsk: 101,
  quoteResponseTime: null,
  quoteLastTradeTime: null,
  ageS: 5,
  live: true,
  priceDiffPct: 0,
  priceAgreeStandard: true,
  priceAgreeTickAware: true,
  recomputedIv: 15.1,
  ivDiff: 0.1,
  temporalClassification: "COMPARABLE",
  bookClassification: "WITHIN_SPREAD",
  spreadWidth: 2,
  ivClassification: "BOTH_PRESENT",
  ...over,
});
const round = (
  at: string,
  over: Partial<ResearchRound> = {},
): ResearchRound => ({
  version: RESEARCH_AUDIT_VERSION,
  index: "nifty",
  session: at.slice(0, 10),
  at: ist(at).toISOString(),
  runId: at,
  marketState: marketStatus(ist(at)),
  exchange: "NFO",
  exchangeStatus: "NORMAL_OPEN",
  expiry: "2026-11-03",
  calendarDays: 7,
  exactDays: 7,
  horizon: "TARGET_WINDOW",
  seriesType: "WEEKLY",
  mappingPass: true,
  expiryMatchesContractMaster: true,
  chainRequestedAt: ist(at).toISOString(),
  chainReceivedAt: new Date(ist(at).getTime() + 100).toISOString(),
  quotesReceivedAt: new Date(ist(at).getTime() + 300).toISOString(),
  spot: 22500,
  chainSpot: 22500,
  spotDriftPct: 0,
  chainToQuoteMs: 300,
  samples: [sample("K1"), sample("K2")],
  ...over,
});
const rep = (rs: ResearchRound[]) =>
  researchReport(rs, marketStatus, MIN_SESSIONS, MIN_ROUNDS_PER_SESSION);

describe("Phase 8: research report integrity", () => {
  it("after-hours rounds never qualify and land only in the reference section", () => {
    const r = rep([round("2026-10-27T17:09:00")]);
    assert.equal(r.rawCounts.qualifying, 0);
    assert.equal(r.liveValidation.status, "UNVERIFIED");
    assert.equal(r.liveValidation.horizons.length, 0);
    assert.equal(r.afterHoursReferenceOnly.horizons[0].rounds, 1);
  });
  it("a round recorded as CLOSED inside 09:15–15:30 (e.g. holiday) never qualifies", () => {
    const r = rep([round("2026-10-27T10:00:00", { marketState: "CLOSED" })]);
    assert.equal(r.rawCounts.qualifying, 0);
  });
  it("legacy record without marketState is classified from its timestamp, not assumed live", () => {
    const legacy = round("2026-10-27T17:19:00");
    delete legacy.marketState;
    const c = rep([legacy]).rounds[0];
    assert.equal(c.marketState, "CLOSED");
    assert.equal(c.marketStateSource, "DERIVED_FROM_AT");
    assert.equal(c.qualifies, false);
  });

    it("research timing: valid chain-to-quote timing qualifies", () => {
    const r = rep([round("2026-10-27T10:00:00")]);

    assert.equal(r.rounds[0].qualifies, true);
    assert.equal(r.rounds[0].exclusion, null);
  });

  it("research timing: missing timestamps disqualify the round", () => {
    const invalid = round("2026-10-27T10:00:00");
    delete invalid.chainRequestedAt;

    const r = rep([invalid]);

    assert.equal(r.rounds[0].qualifies, false);
    assert.match(r.rounds[0].exclusion!, /timing/);
  });

  it("research timing: more than 2000 ms disqualifies the round", () => {
    const at = ist("2026-10-27T10:00:00");
    const invalid = round("2026-10-27T10:00:00", {
      chainReceivedAt: new Date(at.getTime() + 1000).toISOString(),
      quotesReceivedAt: new Date(at.getTime() + 2500).toISOString(),
      chainToQuoteMs: 2500,
    });

    const r = rep([invalid]);

    assert.equal(r.rounds[0].qualifies, false);
    assert.match(r.rounds[0].exclusion!, /timing/);
  });

  it("duplicate invocations in the same 40-min slot count once", () => {
    const r = rep([
      round("2026-10-27T10:00:00"),
      round("2026-10-27T10:05:00"),
      round("2026-10-27T10:40:00"),
    ]);
    assert.equal(r.rawCounts.researchRounds, 3);
    assert.equal(r.rawCounts.qualifying, 2);
    assert.match(r.rounds[1].exclusion!, /duplicate/);
  });
  it("failed or empty collections are counted as failures, never as successful rounds", () => {
    const r = rep([
      round("2026-10-27T10:00:00", { samples: undefined, error: "HTTP 500" }),
      round("2026-10-27T10:40:00", { samples: [] }),
    ]);
    assert.equal(r.rawCounts.failed, 2);
    assert.equal(r.rawCounts.succeeded, 0);
    assert.equal(r.rawCounts.qualifying, 0);
  });
  it("target-window and fallback metrics are never blended", () => {
    const r = rep([
      round("2026-10-27T10:00:00"),
      round("2026-10-27T10:00:00", {
        index: "banknifty",
        horizon: "FALLBACK",
        seriesType: "MONTHLY",
        calendarDays: 27,
        samples: [sample("B1", { ivDiff: 2 })],
      }),
    ]);
    const h = r.liveValidation.horizons;
    assert.equal(h.length, 2);
    assert.ok(h.every((x) => x.rounds === 1));
    assert.ok(
      h.find((x) => x.horizon.startsWith("TARGET"))!.ivMedianDiff === 0.1,
    );
  });
  it("denominators equal raw counts; missing data stays missing", () => {
    const r = rep([
      round("2026-10-27T10:00:00", {
        samples: [
          sample("K1", {
            chainIv: null,
            ivDiff: null,
            quoteLtp: null,
            priceDiffPct: null,
          }),
          sample("K1", { liquid: false }),
        ],
      }),
    ]);
    const h = r.liveValidation.horizons[0];
    assert.equal(r.rawCounts.samples, 2);
    assert.equal(r.rawCounts.uniqueInstruments, 1);
    assert.equal(h.totalSamples, 2);
    assert.equal(h.liquidSamples, 1);
    assert.equal(h.pricedSamples, 0);
    assert.equal(h.priceAgreeStandardRate, null);
    assert.equal(h.ivMedianDiff, null);
    assert.equal(h.missingIvRate, 1);
  });
  it("empty horizon reports null rates, not 0", () => {
    const r = rep([
      round("2026-10-27T10:00:00", {
        samples: [sample("K1", { liquid: false })],
      }),
    ]);
    assert.equal(r.liveValidation.horizons[0].missingIvRate, null);
  });
  it("Phase 9: exchange status other than NORMAL_OPEN (or unrecorded) never qualifies, even inside clock hours", () => {
    const r = rep([
      round("2026-10-27T10:00:00", { exchangeStatus: "NORMAL_CLOSE" }),
      round("2026-10-27T10:40:00", { exchangeStatus: undefined }),
    ]);
    assert.equal(r.rawCounts.qualifying, 0);
    assert.match(r.rounds[0].exclusion!, /NORMAL_CLOSE/);
    assert.match(r.rounds[1].exclusion!, /not recorded/);
  });
  it("Phase 9: session summary reconciles attempts, failures by reason and observations", () => {
    const r = rep([
      round("2026-10-27T10:00:00", {
        samples: [
          sample("K1"),
          sample("K2", { liquid: false, live: false, quoteLtp: null }),
        ],
      }),
      round("2026-10-27T10:00:00", {
        index: "sensex",
        samples: undefined,
        error: "HTTP 429",
        errorReason: "UPSTOX_RATE_LIMITED",
        httpStatus: 429,
      }),
    ]);
    const s = r.sessions[0];
    assert.equal(s.attempted, 2);
    assert.equal(s.succeeded, 1);
    assert.equal(s.qualifying, 1);
    assert.deepEqual(s.errorsByReason, { UPSTOX_RATE_LIMITED: 1 });
    assert.deepEqual(s.observations, {
      total: 2,
      liquid: 1,
      illiquid: 1,
      fresh: 1,
      stale: 1,
      missingQuote: 1,
      missingChainIv: 0,
    });
    assert.equal(
      s.byIndex.find((x) => x.index === "nifty")!.sessionQualifies,
      false,
    );
  });
  it("always warns that Upstox provides no chain snapshot timestamp", () => {
    assert.ok(rep([]).warnings.some((w) => /no generation timestamp/.test(w)));
  });
  it("session qualifies at the production MIN_ROUNDS_PER_SESSION, distinct slots only", () => {
    const times = ["09:20", "10:00", "10:40", "11:20", "12:00", "12:40"].map(
      (t) => round(`2026-10-27T${t}:00`),
    );
    assert.deepEqual(rep(times).indices[0].qualifyingSessions, ["2026-10-27"]);
    assert.deepEqual(rep(times.slice(0, 5)).indices[0].qualifyingSessions, []);
  });
});

describe("Phase 8: production isolation", () => {
  it("research records in the production file do not change auditReport()", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "p8-iso-"));
    try {
      const prod = {
        version: AUDIT_VERSION,
        index: "nifty",
        session: "2026-10-27",
        samples: [{ key: "P", liquid: true, live: true, priceDiffPct: 0 }],
      };
      fs.writeFileSync(
        path.join(tmp, "rounds.jsonl"),
        JSON.stringify(prod) + "\n",
      );
      const before = JSON.stringify(auditReport(tmp, AUDIT_VERSION).indices);
      fs.appendFileSync(
        path.join(tmp, "rounds.jsonl"),
        JSON.stringify(round("2026-10-27T10:00:00")) + "\n",
      );
      assert.equal(
        JSON.stringify(auditReport(tmp, AUDIT_VERSION).indices),
        before,
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
  it("research runner writes only to .data/options-audit-research and never reads production storage", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "scripts", "options-audit-research.ts"),
      "utf8",
    );
    assert.ok(!/"options-audit"\)/.test(src) && !/rounds\.jsonl"/.test(src));
    assert.ok(/"options-audit-research"/.test(src));
    assert.ok(!/\/v[23]\/order/.test(src));
  });
  it("production thresholds and frozen strategy version unchanged", () => {
    assert.equal(FROZEN_STRATEGY_VERSION, "11.4-frozen");
    assert.equal(AUDIT_VERSION, "options-audit-1a");
    assert.deepEqual(
      [
        LIVE_MAX_AGE_S,
        PRICE_TOL,
        MIN_SESSIONS,
        MIN_ROUNDS_PER_SESSION,
        PASS_SHARE,
        IV_MEDIAN_MAX,
        IV_P95_MAX,
        MAX_FAILED_ROUND_SHARE,
      ],
      [60, 0.02, 5, 6, 0.95, 1.0, 3.0, 0.05],
    );
  });
});
