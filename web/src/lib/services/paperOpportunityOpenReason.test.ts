import test from "node:test";
import assert from "node:assert/strict";
import { publicEngineReason } from "./paperOpportunityOpen.ts";

test("ledger write failure is sanitized: code kept, no path or exception text", () => {
  const raw = "LEDGER_WRITE_FAILED: ENOTDIR: not a directory, mkdir '/Users/someone/secret/trades'";
  const out = publicEngineReason(raw);
  assert.equal(out, "LEDGER_WRITE_FAILED: the paper ledger could not be saved; no trade was opened");
  assert.ok(!out.includes("/Users"));
  assert.ok(!out.includes("ENOTDIR"));
});

test("other engine refusals pass through unchanged", () => {
  assert.equal(publicEngineReason("FRESHNESS_BLOCKED: Market data source is STALE"), "FRESHNESS_BLOCKED: Market data source is STALE");
  assert.equal(publicEngineReason("PAPER_TRADE_OPENED"), "PAPER_TRADE_OPENED");
});
