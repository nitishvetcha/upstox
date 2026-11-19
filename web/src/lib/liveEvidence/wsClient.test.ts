// Phase 9B Stage 3 tests. Mock messages are encoded from the official schema. Mock transport only. No connection.
import test from "node:test";
import assert from "node:assert/strict";
import { encodeFeedResponse, decodeFeedResponse, normaliseFeeds, PROTO_SHA256 } from "./wsDecoder.ts";
import { FeedClient, encodeSubscriptionRequest, toSnapshotRecord, type ClientEvent, type Transport, type TransportEvent } from "./wsClient.ts";
import { validateSnapshot } from "./evidence.ts";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const INDICES = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX", "BANKEX"];
const KEYS = INDICES.flatMap((_, i) => [`NSE_FO|CE${i}`, `NSE_FO|PE${i}`]);
const META = Object.fromEntries(KEYS.map((k, i) => [k, { index: INDICES[Math.floor(i / 2)], expiry: "2026-11-17", strike: 25000, optionType: (i % 2 ? "PE" : "CE") as "CE" | "PE" }]));
const T0 = Date.parse("2026-11-12T04:00:00.000Z");

function levels(base: number, n: number, side: "bid" | "ask") {
  return Array.from({ length: n }, (_, i) => side === "bid"
    ? { bidQ: 10 + i, bidP: base - i, askQ: 0, askP: 0 }
    : { bidQ: 0, bidP: 0, askQ: 12 + i, askP: base + 1 + i });
}
const merged = (base: number, n: number) => levels(base, n, "bid").map((b, i) => ({ bidQ: b.bidQ, bidP: b.bidP, askQ: levels(base, n, "ask")[i].askQ, askP: levels(base, n, "ask")[i].askP }));

function fullMessage(keys: string[], currentTs: number, levelsN = 5, ltt = currentTs - 1000) {
  const feeds: Record<string, unknown> = {};
  for (const k of keys) {
    feeds[k] = {
      requestMode: "full_d5",
      fullFeed: { marketFF: { ltpc: { ltp: 100, ltt, ltq: 1, cp: 0 }, marketLevel: { bidAskQuote: merged(99, levelsN) }, oi: 5000, vtt: 900, iv: 0.2, optionGreeks: { delta: 0.5, theta: -1, gamma: 0.01, vega: 0.1, rho: 0.02 } } },
    };
  }
  return encodeFeedResponse({ type: "live_feed", feeds, currentTs });
}

function mockTransport() {
  let handler: ((e: TransportEvent) => void) | null = null;
  const state = { connects: 0, closed: 0, sent: [] as Uint8Array[] };
  const t: Transport = {
    connect(h) {
      state.connects++;
      handler = h;
      return { send: (b) => state.sent.push(b), close: () => { state.closed++; } };
    },
  };
  return { t, state, emit: (e: TransportEvent) => handler?.(e) };
}

function client(opts: { encodeSubscribe?: ((k: string[]) => Uint8Array) | null; maxReconnects?: number; missingAfterMessages?: number } = {}) {
  const mt = mockTransport();
  const events: ClientEvent[] = [];
  const feedBatches: { n: number; currentTs: number | null }[] = [];
  const c = new FeedClient({
    transport: mt.t, keys: KEYS,
    encodeSubscribe: opts.encodeSubscribe === undefined ? ((k) => new TextEncoder().encode(`SUB:${k.length}`)) : opts.encodeSubscribe,
    maxReconnects: opts.maxReconnects ?? 2,
    missingAfterMessages: opts.missingAfterMessages ?? 3,
    onEvent: (e) => events.push(e),
    onFeeds: (f, currentTs) => feedBatches.push({ n: f.length, currentTs }),
  });
  return { c, mt, events, feedBatches };
}

test("schema file is the official download (hash pinned)", () => {
  const file = path.join(import.meta.dirname, "proto", "MarketDataFeed.proto");
  assert.equal(createHash("sha256").update(fs.readFileSync(file)).digest("hex"), PROTO_SHA256);
});

test("five-level marketFF message decodes to five bid and five ask levels with timestamps", () => {
  const bytes = fullMessage(["NSE_FO|CE0"], T0);
  const n = normaliseFeeds(decodeFeedResponse(bytes));
  assert.equal(n.currentTs, T0);
  assert.equal(n.feeds[0].feedKind, "marketFF");
  assert.equal(n.feeds[0].bids.length, 5);
  assert.equal(n.feeds[0].asks.length, 5);
  assert.equal(n.feeds[0].ltp, 100);
  assert.equal(n.feeds[0].oi, 5000);
  assert.equal(n.feeds[0].vtt, 900);
  assert.equal(n.feeds[0].requestMode, "full_d5");
  assert.equal(n.feeds[0].greeks?.delta, 0.5);
});

test("firstLevelWithGreeks (option_greeks) decodes top-of-book only", () => {
  const bytes = encodeFeedResponse({
    type: "live_feed", currentTs: T0,
    feeds: { "NSE_FO|CE0": { requestMode: "option_greeks", firstLevelWithGreeks: { ltpc: { ltp: 50, ltt: T0 - 500 }, firstDepth: { bidQ: 5, bidP: 49, askQ: 6, askP: 51 }, optionGreeks: { delta: 0.4 }, oi: 77, iv: 0.3 } } },
  });
  const f = normaliseFeeds(decodeFeedResponse(bytes)).feeds[0];
  assert.equal(f.feedKind, "firstLevelWithGreeks");
  assert.equal(f.bids.length, 1);
  assert.equal(f.greeks?.delta, 0.4);
});

test("all six indices with paired CE and PE legs arrive in one message", () => {
  const { c, mt, feedBatches, events } = client();
  c.start("2026-11-12T04:00:00.000Z");
  mt.emit({ type: "open", atUtc: "2026-11-12T04:00:00.000Z" });
  mt.emit({ type: "message", bytes: fullMessage(KEYS, T0), atUtc: "2026-11-12T04:00:01.000Z" });
  assert.equal(feedBatches[0].n, 12);
  assert.equal(events.filter((e) => e.kind === "MISSING_INSTRUMENT").length, 0);
});

test("snapshot record: 12 legs, six indices, six pairs, quote time from currentTs", () => {
  const n = normaliseFeeds(decodeFeedResponse(fullMessage(KEYS, T0)));
  const rec = toSnapshotRecord(n.feeds, n.currentTs, { sessionDate: "2026-11-12", snapshotTimeUtc: new Date(T0).toISOString(), retrievedAtUtc: new Date(T0 + 300).toISOString(), requestSeq: 1, index: META });
  assert.equal(rec.legs.length, 12);
  assert.equal(new Set(rec.legs.map((l) => l.index)).size, 6);
  assert.equal(rec.legs.filter((l) => l.optionType === "CE").length, 6);
  assert.equal(rec.legs[0].quoteTimeUtc, new Date(T0).toISOString());
});

test("quote age within 60 s is VALID; 90 s old is INCOMPLETE (stale quote)", () => {
  const n = normaliseFeeds(decodeFeedResponse(fullMessage(["NSE_FO|CE0", "NSE_FO|PE0"], T0)));
  const mk = (snapMs: number) => toSnapshotRecord(n.feeds, n.currentTs, { sessionDate: "2026-11-12", snapshotTimeUtc: new Date(snapMs).toISOString(), retrievedAtUtc: new Date(snapMs + 200).toISOString(), requestSeq: 1, index: META });
  const fresh = validateSnapshot(mk(T0 + 30_000), { maxStaleSec: 900, maxSkewSec: 2 });
  assert.equal(fresh.verdict, "VALID");
  assert.equal(fresh.legs[0].fresh, true);
  const stale = validateSnapshot(mk(T0 + 90_000), { maxStaleSec: 900, maxSkewSec: 2 });
  assert.equal(stale.verdict, "INCOMPLETE");
  assert.match(stale.reasons.join(" "), /stale or missing quote timestamp/);
});

test("depth: three levels per side is INCOMPLETE (five-level rule)", () => {
  const n = normaliseFeeds(decodeFeedResponse(fullMessage(["NSE_FO|CE0"], T0, 3)));
  const rec = toSnapshotRecord(n.feeds, n.currentTs, { sessionDate: "2026-11-12", snapshotTimeUtc: new Date(T0).toISOString(), retrievedAtUtc: new Date(T0).toISOString(), requestSeq: 1, index: META });
  assert.equal(validateSnapshot(rec, { maxStaleSec: 900, maxSkewSec: 2 }).verdict, "INCOMPLETE");
});

test("subscription is sent on open when an encoder is supplied", () => {
  const { c, mt } = client();
  c.start("x");
  mt.emit({ type: "open", atUtc: "2026-11-12T04:00:00.000Z" });
  assert.equal(mt.state.sent.length, 1);
});

test("official subscription request is UTF-8 JSON in a binary payload", () => {
  const bytes = encodeSubscriptionRequest(["NSE_FO|45402", "NSE_FO|45403"], "stage3-mock-guid", "full");
  assert.ok(bytes instanceof Uint8Array);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(bytes)), {
    guid: "stage3-mock-guid",
    method: "sub",
    data: { mode: "full", instrumentKeys: ["NSE_FO|45402", "NSE_FO|45403"] },
  });
});

test("subscription request rejects empty keys and guid", () => {
  assert.throws(() => encodeSubscriptionRequest([], "guid"), /instrument key/);
  assert.throws(() => encodeSubscriptionRequest(["NSE_FO|45402"], ""), /guid/);
});

test("no subscription encoder: client records SUBSCRIBE_UNAVAILABLE, closes, and sends nothing", () => {
  const { c, mt, events } = client({ encodeSubscribe: null });
  c.start("x");
  mt.emit({ type: "open", atUtc: "2026-11-12T04:00:00.000Z" });
  assert.equal(mt.state.sent.length, 0);
  assert.equal(mt.state.closed, 1);
  assert.equal(events[0].kind, "SUBSCRIBE_UNAVAILABLE");
});

test("duplicate message is recorded and not delivered twice", () => {
  const { c, mt, feedBatches, events } = client();
  c.start("x");
  const bytes = fullMessage(KEYS, T0);
  mt.emit({ type: "message", bytes, atUtc: "2026-11-12T04:00:01.000Z" });
  mt.emit({ type: "message", bytes, atUtc: "2026-11-12T04:00:02.000Z" });
  assert.equal(feedBatches.length, 1);
  assert.ok(events.some((e) => e.kind === "DUPLICATE"));
});

test("instrument absent from consecutive messages is flagged once", () => {
  const { c, mt, events } = client({ missingAfterMessages: 3 });
  c.start("x");
  const partial = fullMessage(KEYS.slice(1), T0);
  for (let i = 0; i < 5; i++) mt.emit({ type: "message", bytes: fullMessage(KEYS.slice(1), T0 + i * 1000), atUtc: "2026-11-12T04:00:00.000Z" });
  void partial;
  const missing = events.filter((e) => e.kind === "MISSING_INSTRUMENT");
  assert.equal(missing.length, 1);
  assert.match(missing[0].detail, /NSE_FO\|CE0/);
});

test("disconnect then reconnect records a gap and never replays or backfills data", () => {
  const { c, mt, feedBatches, events } = client();
  c.start("x");
  mt.emit({ type: "message", bytes: fullMessage(KEYS, T0), atUtc: "2026-11-12T04:00:01.000Z" });
  mt.emit({ type: "close", reason: "network", atUtc: "2026-11-12T04:01:00.000Z" });
  c.reconnect("2026-11-12T04:02:00.000Z");
  assert.equal(mt.state.connects, 2);
  assert.equal(feedBatches.length, 1, "no replay of earlier data after reconnect");
  const gap = events.find((e) => e.kind === "SESSION_GAP");
  assert.ok(gap && /not backfilled/.test(gap.detail));
  assert.ok(events.some((e) => e.kind === "DISCONNECT"));
  assert.ok(events.some((e) => e.kind === "RECONNECT"));
});

test("reconnect limit reached: GAVE_UP and no further connection", () => {
  const { c, mt, events } = client({ maxReconnects: 1 });
  c.start("x");
  mt.emit({ type: "close", reason: "a", atUtc: "2026-11-12T04:01:00.000Z" });
  c.reconnect("2026-11-12T04:02:00.000Z");
  mt.emit({ type: "close", reason: "b", atUtc: "2026-11-12T04:03:00.000Z" });
  assert.ok(events.some((e) => e.kind === "GAVE_UP"));
  c.reconnect("2026-11-12T04:04:00.000Z");
  assert.equal(mt.state.connects, 2, "no connection after giving up");
});

test("silent feed is recorded after the threshold, not acted on", () => {
  const { c, mt, events } = client();
  c.start("x");
  mt.emit({ type: "message", bytes: fullMessage(KEYS, T0), atUtc: "2026-11-12T04:00:00.000Z" });
  c.checkSilence("2026-11-12T04:02:00.000Z", 60);
  assert.ok(events.some((e) => e.kind === "SILENT_FEED"));
  assert.equal(mt.state.connects, 1, "no automatic action");
});

test("garbage bytes are a recorded decode error, not a crash", () => {
  const { c, mt, events } = client();
  c.start("x");
  mt.emit({ type: "message", bytes: new Uint8Array([0xff, 0xff, 0xff, 0x01]), atUtc: "2026-11-12T04:00:00.000Z" });
  assert.ok(events.some((e) => e.kind === "DECODE_ERROR"));
});

test("no token or credential appears in the decoded output", () => {
  const n = normaliseFeeds(decodeFeedResponse(fullMessage(KEYS, T0)));
  assert.doesNotMatch(JSON.stringify(n), /Bearer|accessToken|TEST-ONLY-TOKEN/);
});
