// Tests for Modules 5 & 6 & 7: Protobuf Decoder, Normalization & Provenance (WBS 4.3)
import test from "node:test";
import assert from "node:assert/strict";
import { ProtobufDecoder } from "./protobufDecoder.ts";
import { EventNormalizer } from "./eventNormalizer.ts";
import type { BestBidAskEvent, GreeksEvent, LTPCEvent, MarketDepthEvent, OpenInterestEvent } from "./collectorTypes.ts";

function createMockProtobufFrame(decoder: ProtobufDecoder, currentTs: number, options: {
  ltp?: number;
  bidP?: number;
  askP?: number;
  iv?: number;
  delta?: number;
  oi?: number;
  isIndex?: boolean;
} = {}): Uint8Array {
  const isIndex = options.isIndex ?? false;
  const key = isIndex ? "NSE_INDEX|Nifty 50" : "NSE_FO|NIFTY26NOV24500CE";

  const payload: Record<string, unknown> = {
    type: "live_feed",
    currentTs,
    feeds: {
      [key]: {
        requestMode: "full_d5",
        fullFeed: isIndex
          ? {
              indexFF: {
                ltpc: {
                  ltp: options.ltp ?? 24510.5,
                  ltt: currentTs - 200,
                  cp: 24450.0,
                },
              },
            }
          : {
              marketFF: {
                ltpc: {
                  ltp: options.ltp ?? 150.25,
                  ltq: 25,
                  ltt: currentTs - 100,
                  cp: 140.0,
                },
                marketLevel: {
                  bidAskQuote: [
                    { bidP: options.bidP ?? 150.0, bidQ: 50, askP: options.askP ?? 150.5, askQ: 75 },
                    { bidP: 149.5, bidQ: 100, askP: 151.0, askQ: 125 },
                  ],
                },
                oi: options.oi ?? 50000,
                vtt: 120000,
                iv: options.iv ?? 0.165,
                optionGreeks: {
                  delta: options.delta ?? 0.52,
                  gamma: 0.003,
                  theta: -12.5,
                  vega: 18.2,
                  rho: 0.04,
                  spotPrice: 24510.5,
                },
              },
            },
      },
    },
  };

  return decoder.encodeMock(payload);
}

test("Ingestion Engine: successfully decodes mock Protobuf and normalizes canonical events", () => {
  const decoder = new ProtobufDecoder();
  const normalizer = new EventNormalizer();

  const currentTs = Date.parse("2026-11-16T09:30:00.000Z");
  const bytes = createMockProtobufFrame(decoder, currentTs, { ltp: 155.0, bidP: 154.5, askP: 155.5 });

  const decodeRes = decoder.decode(bytes);
  assert.equal(decodeRes.ok, true);
  if (!decodeRes.ok) throw new Error("Decode failed");

  const events = normalizer.normalizeFeedResponse(decodeRes.payload, {
    connectionId: "ws-pool-01",
    localReceiptMonoNs: BigInt(1234567890),
    localReceiptUtcMs: currentTs + 15, // 15ms latency
  });

  assert.ok(events.length >= 4);

  // 1. Verify LTPC Event
  const ltpc = events.find((e) => e.eventType === "LTPC") as LTPCEvent;
  assert.ok(ltpc);
  assert.equal(ltpc.ltp, 155.0);
  assert.equal(ltpc.ltq, 25);
  assert.equal(ltpc.lastTradeTs, currentTs - 100);
  assert.equal(ltpc.provenance, "EXCHANGE_MATCHING_ENGINE");
  assert.equal(ltpc.transportLatencyMs, 15);
  assert.equal(ltpc.localReceiptMonoNs, BigInt(1234567890));

  // 2. Verify Best Bid / Ask Event
  const bba = events.find((e) => e.eventType === "BEST_BID_ASK") as BestBidAskEvent;
  assert.ok(bba);
  assert.equal(bba.bestBidPrice, 154.5);
  assert.equal(bba.bestAskPrice, 155.5);
  assert.equal(bba.quoteSourceTs, "UNKNOWN");
  assert.equal(bba.provenance, "EXCHANGE_ORDER_BOOK");

  // 3. Verify Market Depth Event
  const depth = events.find((e) => e.eventType === "MARKET_DEPTH") as MarketDepthEvent;
  assert.ok(depth);
  assert.equal(depth.levels.length, 5);
  assert.equal(depth.levels[0].bidPrice, 154.5);
  assert.equal(depth.levels[1].bidPrice, 149.5);
  // Missing levels must be explicit nulls, never synthetic 0.0
  assert.equal(depth.levels[2].bidPrice, null);
  assert.equal(depth.levels[3].bidPrice, null);
  assert.equal(depth.levels[4].bidPrice, null);
  assert.ok(depth.qualityFlags.includes("PARTIAL_DEPTH"));

  // 4. Verify Greeks Event
  const greeks = events.find((e) => e.eventType === "OPTION_GREEKS") as GreeksEvent;
  assert.ok(greeks);
  assert.equal(greeks.iv, 0.165);
  assert.equal(greeks.delta, 0.52);
  assert.equal(greeks.underlyingSpotPriceRef, null);
  assert.equal(greeks.greekCalculationTs, "UNKNOWN");
  assert.equal(greeks.provenance, "UPSTOX_SUPPLIED_GREEKS");

  // 5. Verify Open Interest Event
  const oi = events.find((e) => e.eventType === "OPEN_INTEREST") as OpenInterestEvent;
  assert.ok(oi);
  assert.equal(oi.openInterest, 50000);
  assert.equal(oi.oiBroadcastTs, "UNKNOWN");
  assert.equal(oi.provenance, "PERIODIC_EXCHANGE_OI");
});

test("Ingestion Engine: spot index calculation carries EXCHANGE_INDEX_CALCULATION and permanently null volume", () => {
  const decoder = new ProtobufDecoder();
  const normalizer = new EventNormalizer();
  const currentTs = Date.parse("2026-11-16T09:30:00.000Z");

  const bytes = createMockProtobufFrame(decoder, currentTs, { isIndex: true, ltp: 24515.2 });
  const decodeRes = decoder.decode(bytes);
  assert.equal(decodeRes.ok, true);
  if (!decodeRes.ok) throw new Error("Decode failed");

  const events = normalizer.normalizeFeedResponse(decodeRes.payload, {
    connectionId: "ws-pool-01",
    localReceiptMonoNs: BigInt(2000000000),
    localReceiptUtcMs: currentTs + 10,
  });

  const ltpc = events.find((e) => e.eventType === "LTPC") as LTPCEvent;
  assert.ok(ltpc);
  assert.equal(ltpc.provenance, "EXCHANGE_INDEX_CALCULATION");
  assert.equal(ltpc.sessionVolume, null); // Spot indices are non-traded; volume must be null
});

test("Ingestion Engine: flags crossed books when bid >= ask", () => {
  const decoder = new ProtobufDecoder();
  const normalizer = new EventNormalizer();
  const currentTs = Date.parse("2026-11-16T09:30:00.000Z");

  // Inverted book: bid 151.0 >= ask 150.0
  const bytes = createMockProtobufFrame(decoder, currentTs, { bidP: 151.0, askP: 150.0 });
  const decodeRes = decoder.decode(bytes);
  assert.equal(decodeRes.ok, true);
  if (!decodeRes.ok) throw new Error("Decode failed");

  const events = normalizer.normalizeFeedResponse(decodeRes.payload, {
    connectionId: "ws-pool-01",
    localReceiptMonoNs: BigInt(3000000000),
    localReceiptUtcMs: currentTs + 10,
  });

  const bba = events.find((e) => e.eventType === "BEST_BID_ASK") as BestBidAskEvent;
  assert.ok(bba);
  assert.ok(bba.qualityFlags.includes("CROSSED_BOOK"));
});

test("Ingestion Engine: preserves ambiguous candidate duplicate with POSSIBLE_RETRANSMISSION flag", () => {
  const decoder = new ProtobufDecoder();
  const normalizer = new EventNormalizer();
  const currentTs = Date.parse("2026-11-16T09:30:00.000Z");

  const bytes = createMockProtobufFrame(decoder, currentTs, { ltp: 150.0, bidP: 149.5, askP: 150.5 });
  const decodeRes = decoder.decode(bytes);
  assert.equal(decodeRes.ok, true);
  if (!decodeRes.ok) throw new Error("Decode failed");

  // First ingestion
  const events1 = normalizer.normalizeFeedResponse(decodeRes.payload, {
    connectionId: "ws-pool-01",
    localReceiptMonoNs: BigInt(4000000000),
    localReceiptUtcMs: currentTs + 10,
  });
  const ltpc1 = events1.find((e) => e.eventType === "LTPC")!;
  assert.equal(ltpc1.qualityFlags.includes("POSSIBLE_RETRANSMISSION"), false);

  // Second identical ingestion (same serverTs, same ltt, same ltp, same depth)
  const events2 = normalizer.normalizeFeedResponse(decodeRes.payload, {
    connectionId: "ws-pool-01",
    localReceiptMonoNs: BigInt(4000100000),
    localReceiptUtcMs: currentTs + 12,
  });
  const ltpc2 = events2.find((e) => e.eventType === "LTPC")!;
  // Non-destructive: NOT dropped, but flagged
  assert.ok(ltpc2.qualityFlags.includes("POSSIBLE_RETRANSMISSION"));
});

test("Ingestion Engine: flags SUSPECT_CLOCK_SKEW when local clock is behind server clock", () => {
  const decoder = new ProtobufDecoder();
  const normalizer = new EventNormalizer();
  const currentTs = Date.parse("2026-11-16T09:30:00.000Z");

  const bytes = createMockProtobufFrame(decoder, currentTs);
  const decodeRes = decoder.decode(bytes);
  assert.equal(decodeRes.ok, true);
  if (!decodeRes.ok) throw new Error("Decode failed");

  // Local time is 1000ms behind server timestamp
  const events = normalizer.normalizeFeedResponse(decodeRes.payload, {
    connectionId: "ws-pool-01",
    localReceiptMonoNs: BigInt(5000000000),
    localReceiptUtcMs: currentTs - 1000,
  });

  const ltpc = events.find((e) => e.eventType === "LTPC")!;
  assert.ok(ltpc.qualityFlags.includes("SUSPECT_CLOCK_SKEW"));
  assert.equal(ltpc.transportLatencyMs, -1000);
});

test("Ingestion Engine: catches corrupted binary frames, increments error counters, and does not throw", () => {
  const decoder = new ProtobufDecoder();
  const corruptedBytes = new Uint8Array([0x08, 0x96, 0x01, 0xff, 0xff, 0x00, 0x12, 0x34]);

  const res = decoder.decode(corruptedBytes);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.ok(res.error.length > 0);
    assert.equal(res.rawByteLength, 8);
    assert.ok(res.bytePreviewHex.length > 0);
  }

  const stats = decoder.getStats();
  assert.equal(stats.totalDecodeErrors, 1);
  assert.equal(stats.recentQuarantineFramesCount, 1);
});

test("Ingestion Engine: handles empty 0-byte frame gracefully without crashing", () => {
  const decoder = new ProtobufDecoder();
  const emptyBytes = new Uint8Array(0);

  const res = decoder.decode(emptyBytes);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.match(res.error, /EMPTY_BINARY_FRAME/);
  }
});
