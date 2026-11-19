// F3 regression: journal records keep fetch time and exchange last-trade time as separate fields.
// Fixtures only: no broker access. Isolated temporary store directory.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { mockSnapshot } from "./services/mock.ts";
import { analyze } from "./engine/strategy.ts";
import { buildRecommendationResponse } from "./recommendationEnricher.ts";
import { createRecommendationStore } from "./services/recommendationStore.ts";
import type { Snapshot } from "./types.ts";

const NOW = new Date("2026-10-05T07:00:00Z");
const FETCH = "2026-10-05T07:00:00.000Z";
const MARKET_LTT = "2026-10-05T06:59:20.000Z"; // exchange last trade of the quote
const CHAIN_LTT = "2026-10-05T06:58:10.000Z";   // newest exchange last trade in the chain (different on purpose)
const KEYS = ["market", "optionChain", "technical", "news", "breadth"] as const;

function labelled(over: (s: Snapshot) => void = () => {}): Snapshot {
  const s = structuredClone(mockSnapshot("nifty", NOW));
  for (const k of KEYS) s.sources[k] = { ...s.sources[k], source: "LIVE", provider: "UPSTOX", fetchedAt: FETCH };
  s.sources.market = { ...s.sources.market, lastTradeTime: MARKET_LTT };
  s.sources.optionChain = { ...s.sources.optionChain, lastTradeTime: CHAIN_LTT };
  s.fallbackReason = null;
  s.lotSize = 75;
  over(s);
  return s;
}
const decide = (s: Snapshot) => buildRecommendationResponse(analyze(s, NOW, { accountCapital: 500_000 }, undefined), NOW);

describe("F3: exchange last-trade timestamps in the journal", () => {
  test("TS-1 fetch timestamps and exchange timestamps are both preserved, with their own values", () => {
    const r = decide(labelled());
    assert.equal(r.marketSnapshotTimestamp, FETCH, "fetch time unchanged");
    assert.equal(r.optionChainTimestamp, FETCH, "fetch time unchanged");
    assert.equal(r.marketLastTradeTime, MARKET_LTT);
    assert.equal(r.optionChainLastTradeTime, CHAIN_LTT);
  });

  test("TS-2 a missing exchange timestamp is null, never the fetch time", () => {
    const r = decide(labelled((s) => { s.sources.market = { ...s.sources.market, lastTradeTime: undefined }; s.sources.optionChain = { ...s.sources.optionChain, lastTradeTime: null }; }));
    assert.equal(r.marketLastTradeTime, null);
    assert.equal(r.optionChainLastTradeTime, null);
    assert.equal(r.marketSnapshotTimestamp, FETCH, "fetch time still reported as fetch time");
  });

  test("TS-3 market and option-chain exchange times cannot be mixed up", () => {
    const r = decide(labelled());
    assert.notEqual(r.marketLastTradeTime, r.optionChainLastTradeTime);
    assert.equal(r.marketLastTradeTime, MARKET_LTT);
    assert.equal(r.optionChainLastTradeTime, CHAIN_LTT);
  });

  test("TS-4 STALE and END_OF_DAY provenance are unchanged by the new fields", () => {
    const stale = decide(labelled((s) => { s.sources.market = { ...s.sources.market, source: "STALE" }; }));
    assert.equal(stale.decision, "NO_TRADE");
    assert.equal(stale.dataQuality.market, "STALE");
    assert.equal(stale.marketLastTradeTime, MARKET_LTT, "exchange time still carried for a STALE quote");
    const eod = decide(labelled((s) => { s.sources.market = { ...s.sources.market, source: "END_OF_DAY" }; }));
    assert.equal(eod.dataQuality.market, "END_OF_DAY");
    assert.notEqual(eod.decision, "TRADE");
  });

  test("TS-5 a store round trip keeps both timestamps", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-journal-"));
    const r = decide(labelled());
    const store = createRecommendationStore(dir);
    store.save({ id: r.recommendationId, createdAt: r.generatedAt, snapshot: r, status: "MONITORING", paperTradeId: null, outcome: null });
    const reloaded = createRecommendationStore(dir).get(r.recommendationId)!;
    assert.equal(reloaded.snapshot.marketSnapshotTimestamp, FETCH);
    assert.equal(reloaded.snapshot.marketLastTradeTime, MARKET_LTT);
    assert.equal(reloaded.snapshot.optionChainLastTradeTime, CHAIN_LTT);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("TS-6 an old record written before F3 (no exchange fields) remains readable and unchanged", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f3-old-"));
    const old = {
      id: "oldrec1", createdAt: FETCH, status: "MONITORING", paperTradeId: null, outcome: null,
      snapshot: { recommendationId: "oldrec1", generatedAt: FETCH, decision: "WAIT", underlying: "NIFTY", marketSnapshotTimestamp: FETCH, optionChainTimestamp: FETCH, dataQuality: { market: "LIVE" } },
    };
    const raw = JSON.stringify(old);
    fs.writeFileSync(path.join(dir, "oldrec1.json"), raw);
    const before = fs.readFileSync(path.join(dir, "oldrec1.json"), "utf8");
    const loaded = createRecommendationStore(dir).get("oldrec1")!;
    assert.equal(loaded.snapshot.marketSnapshotTimestamp, FETCH);
    assert.equal(loaded.snapshot.marketLastTradeTime, undefined, "absent, not fabricated");
    assert.equal(loaded.snapshot.optionChainLastTradeTime, undefined);
    assert.equal(fs.readFileSync(path.join(dir, "oldrec1.json"), "utf8"), before, "old file not rewritten by reading");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
