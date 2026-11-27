// Phase 3 — React Hook for Streaming Market Quotes via Server-Sent Events (SSE).
// Uses a single shared EventSource per browser tab across all UI components
// (TopBar, StreamStatusPill, MarketPulseTable), with visibility-aware reconnects.

"use client";

import { useEffect, useState } from "react";
import type { StreamingQuote } from "@/lib/services/streamingQuoteManager";
import { isStreamStale, streamAgeMs } from "./streamFreshness.ts";

export type StreamStatus = "CONNECTING" | "STREAMING" | "STALE" | "DISCONNECTED" | "ERROR";

export interface MarketStreamState {
  quotes: Record<string, StreamingQuote>;
  status: StreamStatus;
  latencyMs: number;
  lastTickTime: number | null;
  quoteCount: number;
}

const INITIAL_STATE: MarketStreamState = {
  quotes: {},
  status: "CONNECTING",
  latencyMs: 0,
  lastTickTime: null,
  quoteCount: 0,
};

let sharedState: MarketStreamState = INITIAL_STATE;
const subscribers = new Set<(state: MarketStreamState) => void>();
let sharedEs: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let teardownTimer: ReturnType<typeof setTimeout> | null = null;
let visibilityBound = false;

function notifySubscribers() {
  for (const listener of subscribers) {
    listener(sharedState);
  }
}

function updateSharedState(updater: (prev: MarketStreamState) => MarketStreamState) {
  sharedState = updater(sharedState);
  notifySubscribers();
}

function closeStream() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (sharedEs) {
    sharedEs.close();
    sharedEs = null;
  }
}

function connectStream() {
  if (typeof window === "undefined") return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  if (sharedEs) return;

  if (teardownTimer) {
    clearTimeout(teardownTimer);
    teardownTimer = null;
  }

  updateSharedState((prev) => ({ ...prev, status: "CONNECTING" }));

  try {
    const es = new EventSource("/api/market/stream");
    sharedEs = es;

    es.addEventListener("open", () => {
      updateSharedState((prev) => ({ ...prev, status: "STREAMING" }));
    });

    es.addEventListener("snapshot", (event) => {
      try {
        const snapshot = JSON.parse(event.data) as StreamingQuote[];
        const nextMap: Record<string, StreamingQuote> = { ...sharedState.quotes };
        for (const q of snapshot) {
          nextMap[q.instrumentKey] = q;
        }
        const avgLat = snapshot.length > 0
          ? Math.round(snapshot.reduce((acc, q) => acc + q.latencyMs, 0) / snapshot.length)
          : sharedState.latencyMs;
        updateSharedState((prev) => ({
          quotes: nextMap,
          status: prev.status,
          latencyMs: avgLat,
          lastTickTime: snapshot.length > 0 ? Date.now() : prev.lastTickTime,
          quoteCount: Object.keys(nextMap).length,
        }));
      } catch {
        // Ignore malformed snapshot frame
      }
    });

    es.addEventListener("tick", (event) => {
      try {
        const quote = JSON.parse(event.data) as StreamingQuote;
        updateSharedState((prev) => {
          const quotes = { ...prev.quotes, [quote.instrumentKey]: quote };
          return {
            quotes,
            status: "STREAMING",
            latencyMs: quote.latencyMs,
            lastTickTime: Date.now(),
            quoteCount: Object.keys(quotes).length,
          };
        });
      } catch {
        // Ignore malformed tick frame
      }
    });

    es.onerror = () => {
      closeStream();
      updateSharedState((prev) => ({ ...prev, status: "DISCONNECTED" }));
      if (subscribers.size > 0 && !reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (subscribers.size > 0) connectStream();
        }, 4_000);
      }
    };
  } catch {
    updateSharedState((prev) => ({ ...prev, status: "ERROR" }));
  }
}

function handleVisibilityChange() {
  if (typeof document === "undefined") return;
  if (document.visibilityState === "visible") {
    if (subscribers.size > 0 && !sharedEs) {
      connectStream();
    }
  } else {
    closeStream();
  }
}

export function useMarketStream(): MarketStreamState & { ageMs: number | null } {
  const [state, setState] = useState<MarketStreamState>(sharedState);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    subscribers.add(setState);
    if (teardownTimer) {
      clearTimeout(teardownTimer);
      teardownTimer = null;
    }
    if (!visibilityBound && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
      visibilityBound = true;
    }
    const startTimer = setTimeout(() => {
      if (!sharedEs) connectStream();
    }, 0);
    const clock = setInterval(() => setNow(Date.now()), 1_000);

    return () => {
      clearTimeout(startTimer);
      clearInterval(clock);
      subscribers.delete(setState);
      if (subscribers.size === 0) {
        teardownTimer = setTimeout(() => {
          if (subscribers.size === 0) {
            closeStream();
            if (visibilityBound && typeof document !== "undefined") {
              document.removeEventListener("visibilitychange", handleVisibilityChange);
              visibilityBound = false;
            }
          }
        }, 500);
      }
    };
  }, []);

  return {
    ...state,
    status: isStreamStale(state.status, state.lastTickTime, now) ? "STALE" : state.status,
    ageMs: streamAgeMs(state.lastTickTime, now),
  };
}
