import { test } from "node:test";
import assert from "node:assert/strict";
import { candidateStatus, RESEARCH_BANNER } from "./candidateStatus.ts";

test("no candidate kind is ever executable, and each states why", () => {
  for (const [kind, c] of [["intraday-stock", { direction: "BULLISH", freshness: "LIVE" }], ["positional-stock", { direction: "BULLISH" }], ["option", { optionType: "PE", grade: "REJECT" }]] as const) {
    const s = candidateStatus(kind, c);
    assert.equal(s.executable, false);
    assert.equal(s.banner, RESEARCH_BANNER);
    assert.ok(s.primaryBlock.length > 10);
    assert.ok(!/BUY|SELL/.test(s.hypothesis), "hypothesis wording, not an action");
  }
});

test("rejected option leads with the chain-verification reason; stale quotes are flagged", () => {
  assert.match(candidateStatus("option", { optionType: "CE", grade: "REJECT" }).primaryBlock, /Option chain unverified/);
  assert.ok(candidateStatus("intraday-stock", { direction: "BEARISH", freshness: "STALE" }).blocks.some((b) => /STALE/.test(b)));
});
