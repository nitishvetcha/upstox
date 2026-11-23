import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { UpstoxStreamClient } from "./upstoxStreamClient.ts";
import { quoteManager } from "./streamingQuoteManager.ts";

describe("UpstoxStreamClient", () => {
  let client: UpstoxStreamClient;

  afterEach(() => {
    if (client) {
      client.stop();
    }
    quoteManager.clear();
  });

  it("initializes with DISCONNECTED status and default indices", () => {
    client = new UpstoxStreamClient();
    assert.equal(client.getStatus(), "DISCONNECTED");
    const instruments = client.getSubscribedInstruments();
    assert.ok(instruments.includes("NSE_INDEX|Nifty 50"));
    assert.ok(instruments.includes("NSE_INDEX|Nifty Bank"));
  });

  it("starts simulation feed when no real token is present", async () => {
    client = new UpstoxStreamClient({ simulationIntervalMs: 50 });
    await client.ensureStarted();

    assert.equal(client.getStatus(), "SIMULATION");

    // Wait for at least one simulated tick to be ingested
    await new Promise((resolve) => setTimeout(resolve, 150));

    const quotes = quoteManager.getAllQuotes();
    assert.ok(quotes.length >= 2, `Expected at least 2 quotes, got ${quotes.length}`);

    const nifty = quoteManager.getQuote("NSE_INDEX|Nifty 50");
    assert.ok(nifty !== null);
    assert.ok((nifty?.ltp ?? 0) > 20000);
    assert.ok(nifty?.tickDirection === "UP" || nifty?.tickDirection === "DOWN" || nifty?.tickDirection === "FLAT");
  });

  it("handles malformed binary frames safely without crashing", () => {
    client = new UpstoxStreamClient();
    // Pass corrupted byte array (should not throw)
    assert.doesNotThrow(() => {
      client.handleBinaryMessage(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
    });
  });

  it("stops simulation timer and cleans up state on stop()", async () => {
    client = new UpstoxStreamClient({ simulationIntervalMs: 50 });
    await client.ensureStarted();
    assert.equal(client.getStatus(), "SIMULATION");

    client.stop();
    assert.equal(client.getStatus(), "DISCONNECTED");
  });
});
