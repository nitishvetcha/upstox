// Phase 3 — In-Memory Streaming Quote Manager & Tick Ring Buffer.
// Ingests high-frequency tick updates from Upstox Protobuf WebSocket feed,
// calculates tick directions, spreads, and latencies, and broadcasts to SSE clients.

export interface StreamingQuote {
  instrumentKey: string;
  symbol?: string;
  ltp: number;
  prevLtp?: number;
  tickDirection: "UP" | "DOWN" | "FLAT";
  ltt: number; // exchange timestamp in epoch ms
  bid: number | null;
  ask: number | null;
  spreadPct: number | null;
  volume: number | null;
  oi: number | null;
  iv?: number | null;
  delta?: number | null;
  latencyMs: number;
  updatedAt: number;
}

export type TickListener = (quote: StreamingQuote) => void;

class StreamingQuoteManager {
  private quotes = new Map<string, StreamingQuote>();
  private listeners = new Set<TickListener>();
  private lastTickEpoch: number | null = null;

  /** Ingests an incoming tick, computes direction & latency, and notifies subscribers. */
  ingestTick(input: {
    instrumentKey: string;
    symbol?: string;
    ltp: number;
    ltt?: number;
    bid?: number | null;
    ask?: number | null;
    volume?: number | null;
    oi?: number | null;
    iv?: number | null;
    delta?: number | null;
  }): StreamingQuote {
    const now = Date.now();
    const ltt = input.ltt || now;
    this.lastTickEpoch = now;

    const existing = this.quotes.get(input.instrumentKey);
    const prevLtp = existing?.ltp ?? input.ltp;

    const tickDirection: StreamingQuote["tickDirection"] =
      input.ltp > prevLtp ? "UP" : input.ltp < prevLtp ? "DOWN" : "FLAT";

    const bid = input.bid != null ? input.bid : (existing?.bid ?? null);
    const ask = input.ask != null ? input.ask : (existing?.ask ?? null);

    const spreadPct =
      bid != null && ask != null && input.ltp > 0
        ? Math.round((Math.max(0, ask - bid) / input.ltp) * 10000) / 100
        : null;

    const latencyMs = Math.max(0, now - ltt);

    const quote: StreamingQuote = {
      instrumentKey: input.instrumentKey,
      symbol: input.symbol || existing?.symbol,
      ltp: input.ltp,
      prevLtp,
      tickDirection,
      ltt,
      bid,
      ask,
      spreadPct,
      volume: input.volume != null ? input.volume : (existing?.volume ?? null),
      oi: input.oi != null ? input.oi : (existing?.oi ?? null),
      iv: input.iv != null ? input.iv : (existing?.iv ?? null),
      delta: input.delta != null ? input.delta : (existing?.delta ?? null),
      latencyMs,
      updatedAt: now,
    };

    this.quotes.set(input.instrumentKey, quote);
    if (this.quotes.size > 500) {
      const oldest = this.quotes.keys().next().value;
      if (oldest) this.quotes.delete(oldest);
    }

    // Notify registered real-time SSE listeners
    for (const listener of this.listeners) {
      try {
        listener(quote);
      } catch {
        // Prevent subscriber error from disrupting ingestion loop
      }
    }

    return quote;
  }

  getQuote(instrumentKey: string): StreamingQuote | null {
    return this.quotes.get(instrumentKey) ?? null;
  }

  getAllQuotes(): StreamingQuote[] {
    return Array.from(this.quotes.values());
  }

  /** Subscribes to real-time tick broadcasts. Returns unsubscribe callback. */
  subscribe(listener: TickListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSubscriberCount(): number {
    return this.listeners.size;
  }

  /** Clears cache (useful for testing). */
  clear(): void {
    this.quotes.clear();
    this.lastTickEpoch = null;
  }

  getHealth(): {
    activeQuotesCount: number;
    subscriberCount: number;
    averageLatencyMs: number;
    lastTickAgoSec: number | null;
    isHealthy: boolean;
  } {
    const all = this.getAllQuotes();
    const count = all.length;
    const now = Date.now();

    const avgLatency =
      count > 0 ? Math.round(all.reduce((acc, q) => acc + q.latencyMs, 0) / count) : 0;

    const lastTickAgoSec =
      this.lastTickEpoch != null ? Math.max(0, Math.round((now - this.lastTickEpoch) / 1000)) : null;

    const isHealthy = this.lastTickEpoch != null && (now - this.lastTickEpoch) < 30_000;

    return {
      activeQuotesCount: count,
      subscriberCount: this.listeners.size,
      averageLatencyMs: avgLatency,
      lastTickAgoSec,
      isHealthy,
    };
  }
}

// Global singleton instance
export const quoteManager = new StreamingQuoteManager();
