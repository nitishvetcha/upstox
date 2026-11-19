// Phase 9B Stage 3 — WebSocket feed client with injected transport. Offline: the transport is always a mock in tests.
// Never reconnects silently: every disconnect and reconnect is recorded as an event, and missed data is never backfilled.
import { decodeFeedResponse, normaliseFeeds, type NormalisedFeed } from "./wsDecoder.ts";
import { type LegQuote, type SnapshotRecord } from "./evidence.ts";

export type TransportEvent =
  | { type: "open"; atUtc: string }
  | { type: "message"; bytes: Uint8Array; atUtc: string }
  | { type: "close"; reason: string; atUtc: string };

export interface Connection { send(bytes: Uint8Array): void; close(): void }
export interface Transport { connect(onEvent: (e: TransportEvent) => void): Connection }

export type ClientEventKind =
  | "SUBSCRIBE_UNAVAILABLE" | "DISCONNECT" | "RECONNECT" | "SESSION_GAP" | "DUPLICATE"
  | "MISSING_INSTRUMENT" | "DECODE_ERROR" | "GAVE_UP" | "SILENT_FEED";

export interface ClientEvent { kind: ClientEventKind; atUtc: string; detail: string }

export interface ClientOptions {
  transport: Transport;
  keys: string[];
  // Subscription request encoder. The official schema has no request message, so this must be supplied and is not built here.
  encodeSubscribe: ((keys: string[]) => Uint8Array) | null;
  maxReconnects: number;
  missingAfterMessages: number; // consecutive messages without an instrument before it is flagged
  onEvent: (e: ClientEvent) => void;
  onFeeds: (feeds: NormalisedFeed[], currentTs: number | null, atUtc: string) => void;
}

export type SubscriptionMethod = "sub" | "change_mode" | "unsub";
export type SubscriptionMode = "ltpc" | "option_greeks" | "full" | "full_d30";

// Upstox documents subscription requests as UTF-8 JSON sent in a binary WebSocket
// frame. The response .proto intentionally contains no request message.
export function encodeSubscriptionRequest(
  keys: string[],
  guid: string,
  mode: SubscriptionMode = "full",
  method: SubscriptionMethod = "sub",
): Uint8Array {
  if (!guid.trim()) throw new Error("subscription guid is required");
  if (!keys.length) throw new Error("at least one instrument key is required");
  return new TextEncoder().encode(JSON.stringify({ guid, method, data: { mode, instrumentKeys: keys } }));
}

export class FeedClient {
  private conn: Connection | null = null;
  private reconnects = 0;
  private lastMessageUtc: string | null = null;
  private seen = new Set<string>();
  private absentRun = new Map<string, number>();
  private flaggedMissing = new Set<string>();
  private stopped = false;
  private readonly o: ClientOptions;

  constructor(options: ClientOptions) {
    this.o = options;
  }

  start(atUtc: string) {
    this.stopped = false;
    this.conn = this.o.transport.connect((e) => this.handle(e));
    void atUtc;
  }

  private handle(e: TransportEvent) {
    if (this.stopped) return;
    if (e.type === "open") this.onOpen(e.atUtc);
    else if (e.type === "message") this.onMessage(e.bytes, e.atUtc);
    else this.onClose(e.reason, e.atUtc);
  }

  private onOpen(atUtc: string) {
    if (!this.o.encodeSubscribe) {
      this.o.onEvent({ kind: "SUBSCRIBE_UNAVAILABLE", atUtc, detail: "no subscription encoder: schema has no request message; not connecting further" });
      this.stop(atUtc);
      return;
    }
    this.conn?.send(this.o.encodeSubscribe(this.o.keys));
  }

  private onMessage(bytes: Uint8Array, atUtc: string) {
    this.lastMessageUtc = atUtc;
    let decoded;
    try {
      decoded = normaliseFeeds(decodeFeedResponse(bytes));
    } catch (err) {
      this.o.onEvent({ kind: "DECODE_ERROR", atUtc, detail: (err as Error).name });
      return;
    }
    const fresh: NormalisedFeed[] = [];
    for (const f of decoded.feeds) {
      const id = `${f.instrumentKey}|${f.ltt}|${decoded.currentTs}`;
      if (this.seen.has(id)) {
        this.o.onEvent({ kind: "DUPLICATE", atUtc, detail: `${f.instrumentKey} repeated message; not stored twice` });
        continue;
      }
      this.seen.add(id);
      fresh.push(f);
    }
    if (fresh.length) this.o.onFeeds(fresh, decoded.currentTs, atUtc);

    // Missing-instrument check: subscribed keys absent from consecutive messages.
    const present = new Set(decoded.feeds.map((f) => f.instrumentKey));
    for (const k of this.o.keys) {
      if (present.has(k)) { this.absentRun.set(k, 0); continue; }
      const n = (this.absentRun.get(k) ?? 0) + 1;
      this.absentRun.set(k, n);
      if (n >= this.o.missingAfterMessages && !this.flaggedMissing.has(k)) {
        this.flaggedMissing.add(k);
        this.o.onEvent({ kind: "MISSING_INSTRUMENT", atUtc, detail: `${k} absent from ${n} consecutive messages` });
      }
    }
  }

  private onClose(reason: string, atUtc: string) {
    this.conn = null;
    this.o.onEvent({ kind: "DISCONNECT", atUtc, detail: reason });
    if (this.stopped) return;
    if (this.reconnects >= this.o.maxReconnects) {
      this.o.onEvent({ kind: "GAVE_UP", atUtc, detail: `reconnect limit ${this.o.maxReconnects} reached` });
      this.stopped = true;
    }
  }

  // Called by the owner or a test. Records the gap; never requests or fills missed data.
  reconnect(atUtc: string) {
    if (this.stopped) return;
    if (this.reconnects >= this.o.maxReconnects) {
      this.o.onEvent({ kind: "GAVE_UP", atUtc, detail: `reconnect limit ${this.o.maxReconnects} reached` });
      this.stopped = true;
      return;
    }
    this.reconnects++;
    const gapFrom = this.lastMessageUtc ?? atUtc;
    this.o.onEvent({ kind: "SESSION_GAP", atUtc, detail: `gap from ${gapFrom} to ${atUtc}; not backfilled` });
    this.o.onEvent({ kind: "RECONNECT", atUtc, detail: `attempt ${this.reconnects} of ${this.o.maxReconnects}` });
    this.conn = this.o.transport.connect((e) => this.handle(e));
  }

  // Heartbeat check: owner calls with current time. Records a silent feed; does not act on it.
  checkSilence(nowUtc: string, maxSilentSec: number) {
    if (!this.lastMessageUtc) return;
    const silent = (Date.parse(nowUtc) - Date.parse(this.lastMessageUtc)) / 1000;
    if (silent > maxSilentSec) this.o.onEvent({ kind: "SILENT_FEED", atUtc: nowUtc, detail: `no message for ${silent.toFixed(0)} s` });
  }

  stop(atUtc: string) {
    void atUtc;
    this.stopped = true;
    this.conn?.close();
    this.conn = null;
  }
}

// Converts decoded feeds into the evidence record used by the collector. currentTs is epoch milliseconds (unit to confirm).
export function toSnapshotRecord(feeds: NormalisedFeed[], currentTs: number | null, opts: {
  sessionDate: string; snapshotTimeUtc: string; retrievedAtUtc: string; requestSeq: number; index: Record<string, { index: string; expiry: string; strike: number; optionType: "CE" | "PE" }>;
}): SnapshotRecord {
  const quoteTimeUtc = currentTs ? new Date(currentTs).toISOString() : null;
  const legs: LegQuote[] = feeds.map((f) => {
    const meta = opts.index[f.instrumentKey];
    return {
      instrumentKey: f.instrumentKey,
      index: meta?.index ?? "UNKNOWN",
      expiry: meta?.expiry ?? "",
      strike: meta?.strike,
      optionType: meta?.optionType,
      lastPrice: f.ltp,
      bidPrice: f.bids[0]?.price ?? null,
      askPrice: f.asks[0]?.price ?? null,
      bidQty: f.bids[0]?.quantity ?? null,
      askQty: f.asks[0]?.quantity ?? null,
      bidDepth: f.bids.length ? f.bids : null,
      askDepth: f.asks.length ? f.asks : null,
      lastTradeTime: f.ltt ? new Date(f.ltt).toISOString() : null,
      quoteTimeUtc,
      oi: f.oi,
      volume: f.vtt,
    };
  });
  return {
    sessionDate: opts.sessionDate, snapshotTimeUtc: opts.snapshotTimeUtc, retrievedAtUtc: opts.retrievedAtUtc,
    requestSeq: opts.requestSeq, httpStatus: 200, source: "WEBSOCKET", legs,
  };
}
