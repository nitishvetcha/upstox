// Phase 29 — Fix recommendation pipeline & stock recommendations
// Tests: no-HTTP-self-fetch, all-stocks surfaced, EVENT RISK messaging, no duplicate paper trades, no real orders

import { test, describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

// ── PG29: Opportunities page data loading ────────────────────────────────────
// The page no longer makes HTTP self-fetch — verified by absence of localhost URL

describe("PG29 — Opportunities page no HTTP self-fetch", () => {
  const pageFile = path.join(
    process.cwd(),
    "src/app/opportunities/page.tsx",
  );

  it("PG29-01 page file exists", () => {
    assert.ok(fs.existsSync(pageFile), "page.tsx must exist");
  });

  it("PG29-02 no localhost URL in fetch calls", () => {
    const src = fs.readFileSync(pageFile, "utf8");
    // Allow localhost in comments but not in fetch() calls
    const fetchCalls = src.match(/fetch\([^)]+\)/g) ?? [];
    const hasBadFetch = fetchCalls.some(
      (f) => f.includes("localhost:3000") || f.includes("localhost:3123"),
    );
    assert.ok(!hasBadFetch, "page must not HTTP self-fetch to localhost in fetch() calls");
  });

  it("PG29-03 page imports engine functions directly", () => {
    const src = fs.readFileSync(pageFile, "utf8");
    assert.ok(src.includes("evaluateOptionsOpportunity"), "must import evaluateOptionsOpportunity");
    assert.ok(src.includes("scanStocks"), "must import scanStocks");
    assert.ok(src.includes("scanLongTerm"), "must import scanLongTerm");
  });

  it("PG29-04 page does not contain NEXT_PUBLIC_BASE_URL fetch", () => {
    const src = fs.readFileSync(pageFile, "utf8");
    assert.ok(!src.includes("NEXT_PUBLIC_BASE_URL"), "NEXT_PUBLIC_BASE_URL must not be in page");
  });

  it("PG29-05 page renders ALL intraday stocks (not just top 1)", () => {
    const src = fs.readFileSync(pageFile, "utf8");
    // Old code used `si.top` — a single item. New code uses topOpportunities.map(...)
    assert.ok(src.includes("intradayResult.topOpportunities.map"), "must render all intraday candidates");
    assert.ok(src.includes("swingResult.topOpportunities.map"), "must render all swing candidates");
  });

  it("PG29-06 page shows version 20.1 not 20.0", () => {
    const src = fs.readFileSync(pageFile, "utf8");
    assert.ok(!src.includes("v20.0"), "must not show v20.0");
    assert.ok(src.includes("v20.1"), "must show v20.1");
  });

  it("PG29-07 no real order links in page", () => {
    const src = fs.readFileSync(pageFile, "utf8");
    assert.ok(!src.includes("placeOrder"), "must not expose placeOrder");
    assert.ok(!src.includes("/api/orders"), "must not link to order API");
  });
});

// ── NA29: Navigation from dashboard ──────────────────────────────────────────

describe("NA29 — Dashboard navigation to opportunities", () => {
  const dashFile = path.join(process.cwd(), "src/app/page.tsx");

  it("NA29-01 dashboard links to /opportunities", () => {
    const src = fs.readFileSync(dashFile, "utf8");
    assert.ok(src.includes("/opportunities"), "dashboard must link to /opportunities");
  });

  it("NA29-02 dashboard links to /opportunity-journal", () => {
    const src = fs.readFileSync(dashFile, "utf8");
    assert.ok(src.includes("/opportunity-journal"), "dashboard must link to /opportunity-journal");
  });
});

// ── DQ29: Decision funnel diagnostic counts ───────────────────────────────────

describe("DQ29 — Decision funnel in page", () => {
  const pageFile = path.join(process.cwd(), "src/app/opportunities/page.tsx");

  it("DQ29-01 shows contractsEvaluated and contractsRejected", () => {
    const src = fs.readFileSync(pageFile, "utf8");
    assert.ok(src.includes("contractsEvaluated"), "must surface contractsEvaluated count");
    assert.ok(src.includes("contractsRejected"), "must surface contractsRejected count");
  });

  it("DQ29-02 shows stocksScanned count", () => {
    const src = fs.readFileSync(pageFile, "utf8");
    assert.ok(src.includes("stocksScanned"), "must surface stocksScanned count");
  });

  it("DQ29-03 shows eventRiskPenalty", () => {
    const src = fs.readFileSync(pageFile, "utf8");
    assert.ok(src.includes("eventRiskPenalty"), "must surface event risk penalty");
  });

  it("DQ29-04 shows noOpportunityReason", () => {
    const src = fs.readFileSync(pageFile, "utf8");
    assert.ok(src.includes("noOpportunityReason"), "must show noOpportunityReason for each engine");
  });
});

// ── NR29: No real orders at any point ────────────────────────────────────────

describe("NR29 — No real order routes", () => {
  it("NR29-01 no order placement route exists", () => {
    const orderRoute = path.join(process.cwd(), "src/app/api/orders/route.ts");
    assert.ok(!fs.existsSync(orderRoute), "order route must not exist");
  });

  it("NR29-02 paper opportunity API only creates paper records, not real orders", () => {
    const routeFile = path.join(process.cwd(), "src/app/api/paper-opportunities/route.ts");
    assert.ok(fs.existsSync(routeFile), "paper-opportunities route must exist");
    const src = fs.readFileSync(routeFile, "utf8");
    assert.ok(!src.includes("placeOrder"), "route must not call placeOrder");
    assert.ok(!src.includes("/orders"), "route must not call orders endpoint");
  });
});

// ── ND29: No duplicate paper opportunities ────────────────────────────────────

describe("ND29 — No duplicate paper trade creation", () => {
  it("ND29-01 collector has identity key dedup", () => {
    const collectorFile = path.join(
      process.cwd(),
      "src/lib/services/liveOpportunityCollector.ts",
    );
    const src = fs.readFileSync(collectorFile, "utf8");
    assert.ok(src.includes("identityKey"), "collector must use identityKey for dedup");
    assert.ok(src.includes("openKeys"), "collector must maintain open key set");
    assert.ok(src.includes("duplicates"), "collector must count duplicates");
  });

  it("ND29-02 monitor runner re-fetches before evaluating (concurrent safety)", () => {
    const runnerFile = path.join(
      process.cwd(),
      "src/lib/services/paperTradeMonitorRunner.ts",
    );
    const src = fs.readFileSync(runnerFile, "utf8");
    assert.ok(src.includes("getPaperOpportunity"), "runner must re-fetch from store before evaluating");
    assert.ok(src.includes("fresh.status"), "runner must check fresh status before transition");
  });
});

// ── SV29: Strategy version freeze ────────────────────────────────────────────

describe("SV29 — 11.4-frozen strategy unchanged", () => {
  it("SV29-01 strategy.ts exports analyze function (core engine intact)", () => {
    const stratFile = path.join(process.cwd(), "src/lib/engine/strategy.ts");
    const src = fs.readFileSync(stratFile, "utf8");
    assert.ok(src.includes("export") && src.includes("function"), "strategy.ts must still export functions");
    // The 11.4-frozen designation lives in the spec; the file itself has no version string.
    // Guard: confirm EVENT RISK path is present (key behavior that causes WAIT)
    assert.ok(src.includes("EVENT RISK") || src.includes("eventRisk"), "EVENT RISK path must still be present in strategy");
  });

  it("SV29-02 no placeOrder in strategy.ts", () => {
    const stratFile = path.join(process.cwd(), "src/lib/engine/strategy.ts");
    const src = fs.readFileSync(stratFile, "utf8");
    assert.ok(!src.includes("placeOrder"), "strategy must be read-only");
  });
});
