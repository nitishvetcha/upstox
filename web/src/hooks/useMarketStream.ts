// Phase 3 — React Hook for Streaming Market Quotes via Server-Sent Events (SSE).
// Connects to /api/market/stream, maintains real-time quotes, tracks latency and tick direction.

"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { StreamingQuote } from "@/lib/services/streamingQuoteManager";

export type StreamStatus = "CONNECTING" | "STREAMING" | "DISCONNECTED" | "ERROR";

export interface MarketStreamState {
  quotes: Record<string, StreamingQuote>;
  status: StreamStatus;
  latencyMs: number;
  lastTickTime: number | null;
  quoteCount: number;
}

export function useMarketStream(): MarketStreamState {
  const [quotes, setQuotes] = useState<Record<string, StreamingQuote>>({});
  const [status, setStatus] = useState<StreamStatus>("CONNECTING");
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [lastTickTime, setLastTickTime] = useState<number | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (typeof window === "undefined") return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setStatus("CONNECTING");

    try {
      const es = new EventSource("/api/market/stream");
      eventSourceRef.current = es;

      es.addEventListener("open", () => {
        setStatus("STREAMING");
      });

      // Handle full snapshot on initial connection
      es.addEventListener("snapshot", (event) => {
        try {
          const snapshot = JSON.parse(event.data) as StreamingQuote[];
          const nextMap: Record<string, StreamingQuote> = {};
          for (const q of snapshot) {
            nextMap[q.instrumentKey] = q;
          }
          setQuotes(nextMap);
          if (snapshot.length > 0) {
            const avgLat = Math.round(
              snapshot.reduce((acc, q) => acc + q.latencyMs, 0) / snapshot.length
            );
            setLatencyMs(avgLat);
            setLastTickTime(Date.now());
          }
        } catch {
          // Parse error
        }
      });

      // Handle high-frequency tick events
      es.addEventListener("tick", (event) => {
        try {
          const quote = JSON.parse(event.data) as StreamingQuote;
          setQuotes((prev) => ({
            ...prev,
            [quote.instrumentKey]: quote,
          }));
          setLatencyMs(quote.latencyMs);
          setLastTickTime(Date.now());
          setStatus("STREAMING");
        } catch {
          // Parse error
        }
      });

      es.onerror = () => {
        setStatus("DISCONNECTED");
        es.close();
        eventSourceRef.current = null;

        // Schedule auto-reconnect with backoff
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connect();
          }, 3000);
        }
      };
    } catch {
      setStatus("ERROR");
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connect]);

  return {
    quotes,
    status,
    latencyMs,
    lastTickTime,
    quoteCount: Object.keys(quotes).length,
  };
}
