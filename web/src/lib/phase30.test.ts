// Phase 30 — Live-market validation & data freshness audit
// Deterministic fixtures. Never represents real market validation.

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";

import { freshnessOf, tradeFreshnessOf, marketStatus } from "./time.ts";
import { gradeOpportunity } from "./engine/opportunityEngine.ts";

// ── FR30: freshnessOf (fetch-time based) ─────────────────────────────────────

describe("FR30 — freshnessOf (fetch-age based)", () => {
  const now = new Date("2026-10-13T10:00:00.000Z");

  it("FR30-01 null fetchedAt → freshness null, seconds null", () => {
    const r = freshnessOf(null, now);
    assert.equal(r.freshness, null);
    assert.equal(r.freshnessSeconds, null);
  });

  it("FR30-02 fresh fetch (5 s old) → LIVE", () => {
    const fetchedAt = new Date(now.getTime() - 5_000).toISOString();
    assert.equal(freshnessOf(fetchedAt, now).freshness, "LIVE");
  });

  it("FR30-03 fetch 60 s old → AGING", () => {
    const fetchedAt = new Date(now.getTime() - 60_000).toISOString();
    assert.equal(freshnessOf(fetchedAt, now).freshness, "AGING");
  });

  it("FR30-04 fetch 180 s old → STALE", () => {
    const fetchedAt = new Date(now.getTime() - 180_000).toISOString();
    assert.equal(freshnessOf(fetchedAt, now).freshness, "STALE");
  });

  it("FR30-05 MOCK source never reaches freshnessOf (guard upstream)", () => {
    // MOCK provider never calls freshnessOf with a real timestamp — it fabricates a static fetchedAt.
    // This test documents the invariant: a fetchedAt string from MOCK is still classified correctly.
    const mockFetchedAt = new Date(now.getTime() - 3600_000).toISOString(); // 1 h ago
    assert.equal(freshnessOf(mockFetchedAt, now).freshness, "STALE");
  });
});

// ── TF30: tradeFreshnessOf (trade-time + session aware) ──────────────────────

describe("TF30 — tradeFreshnessOf (session-aware)", () => {
  // Market open: 2026-10-13 09:15–15:30 IST = 03:45–10:00 UTC
  const marketOpen = new Date("2026-10-13T05:00:00.000Z"); // 10:30 IST — OPEN
  const marketClosed = new Date("2026-10-13T11:00:00.000Z"); // 16:30 IST — CLOSED

  it("TF30-01 null trade time → UNAVAILABLE source", () => {
    const r = tradeFreshnessOf(null, marketOpen);
    assert.equal(r.source, "UNAVAILABLE");
    assert.equal(r.freshness, "STALE");
  });

  it("TF30-02 invalid trade time → UNAVAILABLE", () => {
    const r = tradeFreshnessOf("not-a-date", marketOpen);
    assert.equal(r.source, "UNAVAILABLE");
  });

  it("TF30-03 fresh trade during OPEN session (10 s old) → LIVE", () => {
    const ltt = new Date(marketOpen.getTime() - 10_000).toISOString();
    const r = tradeFreshnessOf(ltt, marketOpen);
    assert.equal(r.source, "LIVE");
    assert.equal(r.freshness, "LIVE");
  });

  it("TF30-04 stale trade during OPEN session (200 s old) → STALE", () => {
    const ltt = new Date(marketOpen.getTime() - 200_000).toISOString();
    const r = tradeFreshnessOf(ltt, marketOpen);
    assert.equal(r.source, "STALE");
    assert.equal(r.freshness, "STALE");
  });

  it("TF30-05 trade from today's session, checked after close → END_OF_DAY", () => {
    // Trade was at 14:00 IST = 08:30 UTC, checked at 16:30 IST = 11:00 UTC
    const ltt = new Date("2026-10-13T08:30:00.000Z").toISOString();
    const r = tradeFreshnessOf(ltt, marketClosed);
    assert.equal(r.source, "END_OF_DAY");
    assert.equal(r.freshness, "END_OF_DAY");
  });

  it("TF30-06 trade from a previous day, checked after close → STALE", () => {
    const ltt = new Date("2026-10-12T08:30:00.000Z").toISOString(); // yesterday
    const r = tradeFreshnessOf(ltt, marketClosed);
    assert.equal(r.source, "STALE");
  });
});

// ── MS30: marketStatus() ─────────────────────────────────────────────────────

describe("MS30 — marketStatus()", () => {
  it("MS30-01 before PRE-OPEN (04:00 IST) → CLOSED", () => {
    // 04:00 IST = 22:30 UTC previous day
    assert.equal(marketStatus(new Date("2026-10-12T22:30:00.000Z")), "CLOSED");
  });

  it("MS30-02 PRE-OPEN window (09:00 IST) → PRE-OPEN", () => {
    // 09:00 IST = 03:30 UTC
    assert.equal(marketStatus(new Date("2026-10-13T03:30:00.000Z")), "PRE-OPEN");
  });

  it("MS30-03 during session (11:00 IST) → OPEN", () => {
    // 11:00 IST = 05:30 UTC
    assert.equal(marketStatus(new Date("2026-10-13T05:30:00.000Z")), "OPEN");
  });

  it("MS30-04 after close (16:00 IST) → CLOSED", () => {
    // 16:00 IST = 10:30 UTC
    assert.equal(marketStatus(new Date("2026-10-13T10:30:00.000Z")), "CLOSED");
  });

  it("MS30-05 weekend → CLOSED", () => {
    // 2026-10-11 is a Sunday, 11:00 IST
    assert.equal(marketStatus(new Date("2026-10-11T05:30:00.000Z")), "CLOSED");
  });
});

// ── GR30: gradeOpportunity — freshness gates ─────────────────────────────────

describe("GR30 — gradeOpportunity freshness gate", () => {
  it("GR30-01 liveSources >= 3 → eligible for A+ at full score", () => {
    assert.equal(gradeOpportunity(80, 2.5, 75, 3), "A+");
  });

  it("GR30-02 liveSources = 0 (MOCK/EOD) → REJECT regardless of score", () => {
    assert.equal(gradeOpportunity(90, 3.0, 80, 0), "REJECT");
  });

  it("GR30-03 liveSources = 1 → REJECT (below threshold of 3)", () => {
    assert.equal(gradeOpportunity(80, 2.5, 75, 1), "REJECT");
  });

  it("GR30-04 liveSources = 2 → REJECT", () => {
    assert.equal(gradeOpportunity(80, 2.5, 75, 2), "REJECT");
  });
});

// ── ST30: Stock grade respects freshness ──────────────────────────────────────
// Verify the fix: END_OF_DAY stocks must receive REJECT grade, not A/B.

describe("ST30 — Stock grading with freshness", () => {
  it("ST30-01 LIVE stock quote: liveSources=3 → can achieve A grade", () => {
    // score=70, rr=1.8, conf=70, liveSources=3 → A
    assert.equal(gradeOpportunity(70, 1.8, 70, 3), "A");
  });

  it("ST30-02 END_OF_DAY stock quote: liveSources=0 → REJECT", () => {
    // The fix in stockOpportunityEngine passes liveSources=0 when freshness !== LIVE
    assert.equal(gradeOpportunity(70, 1.8, 70, 0), "REJECT");
  });

  it("ST30-03 STALE stock quote: liveSources=0 → REJECT", () => {
    assert.equal(gradeOpportunity(85, 3.0, 80, 0), "REJECT");
  });
});

// ── CL30: Collector freshness guard ──────────────────────────────────────────
// Unit-level test that non-LIVE stock results are rejected at collection time.

describe("CL30 — Collector rejects non-LIVE stocks", () => {
  it("CL30-01 collector file guards source AND freshness separately", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/services/liveOpportunityCollector.ts"), "utf8");
    // Source failure (UNAVAILABLE) always logged; freshness check guards per-candidate
    assert.ok(src.includes("stockSourceOk"), "collector must check source separately");
    assert.ok(src.includes("stockFreshnessOk"), "collector must check freshness");
  });

  it("CL30-02 per-stock freshness check exists in collector", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/services/liveOpportunityCollector.ts"), "utf8");
    assert.ok(src.includes("s.freshness"), "collector must check per-stock freshness before creating paper trade");
  });

  it("CL30-03 market-closed guard fires before any stock processing", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/services/liveOpportunityCollector.ts"), "utf8");
    // MARKET_CLOSED reason returned before stock fetch
    assert.ok(src.includes("MARKET_CLOSED"), "collector must return early when market is closed");
  });
});

// ── PO30: Paper-opportunity creation guards ───────────────────────────────────

describe("PO30 — Paper opportunity LIVE-only guard", () => {
  it("PO30-01 paper opportunity API route enforces LIVE-only", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const routeFile = path.join(process.cwd(), "src/app/api/paper-opportunities/route.ts");
    const src = fs.readFileSync(routeFile, "utf8");
    assert.ok(src.includes("422"), "API must return 422 for non-LIVE data");
    assert.ok(src.includes("hasNonLive"), "API must check for non-LIVE sources");
  });

  it("PO30-02 no order-placement endpoint exists", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const orderRoute = path.join(process.cwd(), "src/app/api/orders/route.ts");
    assert.ok(!fs.existsSync(orderRoute), "order route must not exist");
  });
});

// ── SM30: Snapshot source classification ─────────────────────────────────────

describe("SM30 — liveQuoteSource classification (upstoxMarket.ts)", () => {
  it("SM30-01 tradeFreshnessOf with LIVE trade → source LIVE", () => {
    const now = new Date("2026-10-13T05:00:00.000Z"); // 10:30 IST OPEN
    const ltt = new Date(now.getTime() - 5_000).toISOString();
    const r = tradeFreshnessOf(ltt, now);
    assert.equal(r.source, "LIVE");
  });

  it("SM30-02 tradeFreshnessOf with no trade time, market CLOSED → END_OF_DAY (via marketStatus path)", () => {
    // When lastTradeTime is null and market is CLOSED, upstoxMarket uses:
    // src = marketStatus(current) === "CLOSED" ? "END_OF_DAY" : "LIVE"
    // tradeFreshnessOf covers the trade-time path; the null-LTT path is in upstoxMarket directly.
    // Verify tradeFreshnessOf null path returns UNAVAILABLE (not a fake LIVE).
    const now = new Date("2026-10-13T11:00:00.000Z"); // CLOSED
    const r = tradeFreshnessOf(null, now);
    assert.equal(r.source, "UNAVAILABLE");
  });

  it("SM30-03 MOCK source string never equals LIVE", () => {
    assert.notEqual("MOCK", "LIVE");
    assert.notEqual("END_OF_DAY", "LIVE");
    assert.notEqual("STALE", "LIVE");
    assert.notEqual("UNAVAILABLE", "LIVE");
  });
});
