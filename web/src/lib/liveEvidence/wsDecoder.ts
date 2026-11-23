// Phase 9B Stage 3 — decoder for Upstox V3 market-data feed messages, using the official MarketDataFeed.proto.
// Offline only: decodes bytes it is given. Opens no connection.
import fs from "node:fs";
import path from "node:path";
import protobuf from "protobufjs";

function resolveProtoFile(): string {
  const dir =
    typeof import.meta !== "undefined" && import.meta.dirname
      ? import.meta.dirname
      : typeof __dirname !== "undefined"
      ? __dirname
      : path.resolve(process.cwd(), "src/lib/liveEvidence");

  const candidates = [
    path.join(dir, "proto", "MarketDataFeed.proto"),
    path.resolve(process.cwd(), "src/lib/liveEvidence/proto/MarketDataFeed.proto"),
    path.resolve(process.cwd(), "web/src/lib/liveEvidence/proto/MarketDataFeed.proto"),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

export const PROTO_FILE = resolveProtoFile();
export const PROTO_SHA256 = "3e1c939dce2c83a3fef91405c5ca268dfa089aae973319f56685f12a5afcf612";
const TYPE = "com.upstox.marketdatafeederv3udapi.rpc.proto.FeedResponse";

let cached: protobuf.Type | null = null;
export function feedResponseType(): protobuf.Type {
  if (!cached) {
    const root = protobuf.loadSync(PROTO_FILE);
    cached = root.lookupType(TYPE);
  }
  return cached;
}

// Decode a binary FeedResponse. Enums as names, 64-bit integers as numbers.
export function decodeFeedResponse(bytes: Uint8Array): Record<string, unknown> {
  const type = feedResponseType();
  const msg = type.decode(bytes);
  return type.toObject(msg, { enums: String, longs: Number, defaults: false, oneofs: true }) as Record<string, unknown>;
}

// Encode a FeedResponse object. Used by tests to build mock messages from the same schema.
export function encodeFeedResponse(obj: Record<string, unknown>): Uint8Array {
  const type = feedResponseType();
  // fromObject accepts enum names (e.g. "live_feed") and throws on unknown names or fields.
  return type.encode(type.fromObject(obj)).finish();
}

export interface NormalisedFeed {
  instrumentKey: string;
  requestMode: string;
  ltp: number | null;
  ltt: number | null; // as sent by the feed (unit to be confirmed; see completion report)
  bids: { price: number; quantity: number }[];
  asks: { price: number; quantity: number }[];
  oi: number | null;
  vtt: number | null;
  iv: number | null;
  greeks: Record<string, number> | null;
  feedKind: "marketFF" | "indexFF" | "ltpc" | "firstLevelWithGreeks" | "unknown";
}

// Extracts the fields the evidence specification needs from one decoded FeedResponse.
export function normaliseFeeds(decoded: Record<string, unknown>): { type: string; currentTs: number | null; feeds: NormalisedFeed[] } {
  const feeds = (decoded.feeds ?? {}) as Record<string, Record<string, unknown>>;
  const out: NormalisedFeed[] = [];
  for (const [instrumentKey, feed] of Object.entries(feeds)) {
    const requestMode = String(feed.requestMode ?? "");
    const full = feed.fullFeed as Record<string, unknown> | undefined;
    const mff = full?.marketFF as Record<string, unknown> | undefined;
    const flg = feed.firstLevelWithGreeks as Record<string, unknown> | undefined;
    const ltpcOnly = feed.ltpc as Record<string, unknown> | undefined;
    const ltpc = (mff?.ltpc ?? flg?.ltpc ?? ltpcOnly ?? {}) as Record<string, unknown>;
    let feedKind: NormalisedFeed["feedKind"] = "unknown";
    let bids: NormalisedFeed["bids"] = [];
    let asks: NormalisedFeed["asks"] = [];
    let oi: number | null = null;
    let vtt: number | null = null;
    let iv: number | null = null;
    let greeks: Record<string, number> | null = null;
    if (mff) {
      feedKind = "marketFF";
      const quotes = ((mff.marketLevel as { bidAskQuote?: unknown[] } | undefined)?.bidAskQuote ?? []) as { bidP: number; bidQ: number; askP: number; askQ: number }[];
      bids = quotes.map((q) => ({ price: q.bidP, quantity: q.bidQ }));
      asks = quotes.map((q) => ({ price: q.askP, quantity: q.askQ }));
      oi = (mff.oi as number) ?? null;
      vtt = (mff.vtt as number) ?? null;
      iv = (mff.iv as number) ?? null;
      greeks = (mff.optionGreeks as Record<string, number>) ?? null;
    } else if (flg) {
      feedKind = "firstLevelWithGreeks";
      const d = flg.firstDepth as { bidP: number; bidQ: number; askP: number; askQ: number } | undefined;
      if (d) { bids = [{ price: d.bidP, quantity: d.bidQ }]; asks = [{ price: d.askP, quantity: d.askQ }]; }
      oi = (flg.oi as number) ?? null;
      vtt = (flg.vtt as number) ?? null;
      iv = (flg.iv as number) ?? null;
      greeks = (flg.optionGreeks as Record<string, number>) ?? null;
    } else if (full?.indexFF || ltpcOnly) {
      feedKind = full?.indexFF ? "indexFF" : "ltpc";
    }
    out.push({
      instrumentKey, requestMode,
      ltp: (ltpc.ltp as number) ?? null,
      ltt: (ltpc.ltt as number) ?? null,
      bids, asks, oi, vtt, iv, greeks, feedKind,
    });
  }
  return { type: String(decoded.type ?? ""), currentTs: (decoded.currentTs as number) ?? null, feeds: out };
}
