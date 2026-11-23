import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { quoteManager } from "./streamingQuoteManager.ts";

describe("StreamingQuoteManager", () => {
  beforeEach(() => {
    quoteManager.clear();
  });

  it("ingests initial tick with FLAT direction and calculates spread", () => {
    const quote = quoteManager.ingestTick({
      instrumentKey: "NSE_INDEX|Nifty 50",
      symbol: "NIFTY",
      ltp: 24000,
      ltt: Date.now() - 25,
      bid: 23998,
      ask: 24002,
      volume: 50000,
      oi: 120000,
    });

    assert.equal(quote.instrumentKey, "NSE_INDEX|Nifty 50");
    assert.equal(quote.symbol, "NIFTY");
    assert.equal(quote.ltp, 24000);
    assert.equal(quote.prevLtp, 24000);
    assert.equal(quote.tickDirection, "FLAT");
    assert.equal(quote.bid, 23998);
    assert.equal(quote.ask, 24002);
    // spread = (24002 - 23998) / 24000 = 4 / 24000 = ~0.0167% -> rounded to 0.02%
    assert.ok(quote.spreadPct !== null && quote.spreadPct > 0);
    assert.ok(quote.latencyMs >= 0);
  });

  it("computes UP direction when subsequent tick price rises", () => {
    quoteManager.ingestTick({
      instrumentKey: "NSE_INDEX|Nifty 50",
      ltp: 24000,
    });

    const secondQuote = quoteManager.ingestTick({
      instrumentKey: "NSE_INDEX|Nifty 50",
      ltp: 24005.5,
    });

    assert.equal(secondQuote.ltp, 24005.5);
    assert.equal(secondQuote.prevLtp, 24000);
    assert.equal(secondQuote.tickDirection, "UP");
  });

  it("computes DOWN direction when subsequent tick price drops", () => {
    quoteManager.ingestTick({
      instrumentKey: "NSE_INDEX|Nifty 50",
      ltp: 24000,
    });

    const secondQuote = quoteManager.ingestTick({
      instrumentKey: "NSE_INDEX|Nifty 50",
      ltp: 23995,
    });

    assert.equal(secondQuote.ltp, 23995);
    assert.equal(secondQuote.prevLtp, 24000);
    assert.equal(secondQuote.tickDirection, "DOWN");
  });

  it("broadcasts tick updates to subscribers and respects unsubscribe", () => {
    const received: string[] = [];
    const unsubscribe = quoteManager.subscribe((quote) => {
      received.push(`${quote.instrumentKey}:${quote.ltp}`);
    });

    assert.equal(quoteManager.getSubscriberCount(), 1);

    quoteManager.ingestTick({ instrumentKey: "NIFTY", ltp: 24100 });
    quoteManager.ingestTick({ instrumentKey: "BANKNIFTY", ltp: 51200 });

    assert.deepEqual(received, ["NIFTY:24100", "BANKNIFTY:51200"]);

    unsubscribe();
    assert.equal(quoteManager.getSubscriberCount(), 0);

    quoteManager.ingestTick({ instrumentKey: "NIFTY", ltp: 24150 });
    // Should not receive after unsubscribe
    assert.deepEqual(received, ["NIFTY:24100", "BANKNIFTY:51200"]);
  });

  it("returns health summary metrics", () => {
    quoteManager.ingestTick({
      instrumentKey: "SYM1",
      ltp: 100,
      ltt: Date.now() - 10,
    });
    quoteManager.ingestTick({
      instrumentKey: "SYM2",
      ltp: 200,
      ltt: Date.now() - 20,
    });

    const health = quoteManager.getHealth();
    assert.equal(health.activeQuotesCount, 2);
    assert.equal(health.subscriberCount, 0);
    assert.ok(health.isHealthy);
    assert.ok(health.averageLatencyMs >= 0);
    assert.ok(health.lastTickAgoSec !== null && health.lastTickAgoSec <= 1);
  });
});
