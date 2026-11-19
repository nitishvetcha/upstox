// Phase 9B Stage 3: decoded mock WebSocket messages stored through the existing evidence writer. Mocks only.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { encodeFeedResponse, decodeFeedResponse, normaliseFeeds } from "./wsDecoder.ts";
import { toSnapshotRecord } from "./wsClient.ts";
import { validateSnapshot } from "./evidence.ts";
import { storeWebSocketSnapshot } from "./collector.ts";

const INDICES = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX", "BANKEX"];
const KEYS = INDICES.flatMap((_, i) => [`NSE_FO|CE${i}`, `NSE_FO|PE${i}`]);
const META = Object.fromEntries(KEYS.map((k, i) => [k, { index: INDICES[Math.floor(i / 2)], expiry: "2026-11-17", strike: 25000, optionType: (i % 2 ? "PE" : "CE") as "CE" | "PE" }]));
const T0 = Date.parse("2026-11-12T04:00:00.000Z");
const TOKEN = "TEST-ONLY-TOKEN-9f3a";

function msg(ts: number) {
  const feeds: Record<string, unknown> = {};
  for (const k of KEYS) {
    feeds[k] = { requestMode: "full_d5", fullFeed: { marketFF: {
      ltpc: { ltp: 100, ltt: ts - 1000 }, oi: 5000, vtt: 900,
      marketLevel: { bidAskQuote: Array.from({ length: 5 }, (_, i) => ({ bidQ: 10 + i, bidP: 99 - i, askQ: 12 + i, askP: 101 + i })) },
    } } };
  }
  return encodeFeedResponse({ type: "live_feed", feeds, currentTs: ts });
}

test("decoded mock messages store through write-once evidence and validate VALID within 60 s", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wsint-"));
  const bytes = msg(T0);
  const n = normaliseFeeds(decodeFeedResponse(bytes));
  const rec = toSnapshotRecord(n.feeds, n.currentTs, {
    sessionDate: "2026-11-12", snapshotTimeUtc: new Date(T0 + 20_000).toISOString(),
    retrievedAtUtc: new Date(T0 + 20_100).toISOString(), requestSeq: 1, index: META,
  });
  const v = validateSnapshot(rec, { maxStaleSec: 900, maxSkewSec: 2 });
  assert.equal(v.verdict, "VALID");
  assert.equal(v.legs.length, 12);
  assert.ok(v.legs.every((l) => l.fresh === true));
  const stored = storeWebSocketSnapshot({ dir, record: rec, rawMessageBase64: Buffer.from(bytes).toString("base64"), rules: { maxStaleSec: 900, maxSkewSec: 2 } });
  assert.equal(stored.status, "STORED");
  assert.ok(stored.file && fs.existsSync(stored.file));
  const duplicate = storeWebSocketSnapshot({ dir, record: rec, rawMessageBase64: "x", rules: { maxStaleSec: 900, maxSkewSec: 2 } });
  assert.equal(duplicate.status, "DUPLICATE");
  assert.equal(fs.readFileSync(path.join(dir, "manifest.jsonl"), "utf8").trim().split("\n").length, 2);
});

test("stored WebSocket evidence contains no credential", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wsint-"));
  const bytes = msg(T0);
  const n = normaliseFeeds(decodeFeedResponse(bytes));
  const rec = toSnapshotRecord(n.feeds, n.currentTs, {
    sessionDate: "2026-11-12", snapshotTimeUtc: new Date(T0).toISOString(),
    retrievedAtUtc: new Date(T0).toISOString(), requestSeq: 2, index: META,
  });
  const stored = storeWebSocketSnapshot({ dir, record: rec, rawMessageBase64: Buffer.from(bytes).toString("base64"), rules: { maxStaleSec: 900, maxSkewSec: 2 } });
  assert.ok(stored.file);
  assert.doesNotMatch(fs.readFileSync(stored.file!, "utf8"), new RegExp(TOKEN));
});
