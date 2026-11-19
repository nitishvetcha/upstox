import { test } from "node:test";
import assert from "node:assert/strict";
import { cycleAction, lockHeldByLiveRunner, healthRecord, openingWindowMissed, classifyStockErrors } from "../../scripts/runner-lib.mjs";
import { runLiveOpportunityCollection } from "./services/liveOpportunityCollector.ts";

const none = async () => ({ spot: 1, topOpportunities: [], rejectedContracts: [], dataQuality: { market: "LIVE" } }) as never;
const stocks = async () => ({ source: "UPSTOX", freshness: "LIVE", topOpportunities: [] }) as never;

test("09:10 IST start: the real collector says PRE_MARKET and the runner WAITS (does not end the session)", async () => {
  const at0910 = new Date("2026-10-26T03:40:00.000Z"); // Monday 09:10 IST
  const r = await runLiveOpportunityCollection(none, none, stocks, at0910);
  assert.equal(r.market, "PRE_MARKET");
  assert.equal(r.reason, "MARKET_CLOSED", "collector's reason is misleading on its own");
  assert.equal(cycleAction(r), "WAIT_PREOPEN");
});

test("only a CLOSED market ends the session; cutoff and errors keep the runner going", () => {
  assert.equal(cycleAction({ market: "CLOSED", reason: "MARKET_CLOSED" }), "EXIT_EOD");
  assert.equal(cycleAction({ market: "OPEN", reason: "ENTRY_CUTOFF", created: 0 }), "RUN", "after 14:30 monitoring continues");
  assert.equal(cycleAction({ market: "OPEN", created: 1 }), "RUN");
  assert.equal(cycleAction({ error: "fetch failed", market: "UNKNOWN" }), "ERROR");
});

test("stale lock: a live PID that is NOT paper-live does not block startup", () => {
  assert.equal(lockHeldByLiveRunner(process.pid, () => "/usr/sbin/coreaudiod"), false, "PID reused by another program");
  assert.equal(lockHeldByLiveRunner(process.pid, () => "node /x/scripts/paper-live.mjs"), true, "genuine running runner");
  assert.equal(lockHeldByLiveRunner(99999999, () => "node paper-live.mjs"), false, "dead PID");
  assert.equal(lockHeldByLiveRunner(NaN), false, "corrupt lock file");
});

test("health records: IST session date/time, and 09:15 opening-window rule", () => {
  const rec = healthRecord("RUNNER_START", new Date("2026-10-26T03:40:00.000Z"), { authStatus: "VALID" });
  assert.deepEqual([rec.event, rec.sessionDate, rec.atIst, (rec as { authStatus?: string }).authStatus], ["RUNNER_START", "2026-10-26", "09:10", "VALID"]);
  assert.equal(openingWindowMissed(new Date("2026-10-26T03:45:30.000Z")), false, "09:15 collection is on time");
  assert.equal(openingWindowMissed(new Date("2026-10-26T03:46:00.000Z")), true, "09:16 is late");
  assert.equal(openingWindowMissed(new Date("2026-10-26T06:09:00.000Z")), true, "11:39 start");
});

test("classifyStockErrors: aggregate warnings are distinct from individual stock collection errors", () => {
  const errors = [
    "Stocks: non-LIVE freshness (MIXED)",
    "Stocks: non-LIVE source (NONE)",
    "Stock RELIANCE: non-LIVE freshness (STALE)",
    "Stock TCS: quote fetch timed out",
    "NIFTY: non-LIVE data quality",
  ];
  const { individualErrors, aggregateWarnings, totalStockIssues, individualErrorDetails, aggregateWarningDetails } = classifyStockErrors(errors);
  assert.equal(individualErrors, 2, "only individual stock errors counted");
  assert.equal(aggregateWarnings, 2, "aggregate stock warnings counted separately");
  assert.equal(totalStockIssues, 4);
  assert.deepEqual(individualErrorDetails, ["Stock RELIANCE: non-LIVE freshness (STALE)", "Stock TCS: quote fetch timed out"]);
  assert.deepEqual(aggregateWarningDetails, ["Stocks: non-LIVE freshness (MIXED)", "Stocks: non-LIVE source (NONE)"]);
});

test("classifyStockErrors: empty or unrelated errors return zero counts", () => {
  assert.deepEqual(classifyStockErrors([]), {
    individualErrors: 0,
    aggregateWarnings: 0,
    totalStockIssues: 0,
    individualErrorDetails: [],
    aggregateWarningDetails: [],
  });
  assert.equal(classifyStockErrors(["NIFTY: non-LIVE data quality", "BANKNIFTY: timeout"]).totalStockIssues, 0);
});
