// Phase 3 — Upstox Protobuf WebSocket Streaming Client
// Manages real-time market data feed connection, Protobuf binary decoding,
// auto-reconnection, and fallback simulation mode for offline/paper trading.

import { decodeFeedResponse, normaliseFeeds } from "../liveEvidence/wsDecoder.ts";
import { quoteManager } from "./streamingQuoteManager.ts";
import { getAccessToken } from "./upstoxAuth.ts";

export type StreamClientStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "STREAMING"
  | "SIMULATION"
  | "ERROR";

export interface StreamClientOptions {
  autoReconnect?: boolean;
  reconnectIntervalMs?: number;
  simulationIntervalMs?: number;
  instruments?: string[];
}

export class UpstoxStreamClient {
  private status: StreamClientStatus = "DISCONNECTED";
  private ws: WebSocket | null = null;
  private subscribedInstruments: Set<string> = new Set([
    "NSE_INDEX|Nifty 50",
    "NSE_INDEX|Nifty Bank",
  ]);
  private simulationTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private options: Required<StreamClientOptions>;

  constructor(options?: StreamClientOptions) {
    this.options = {
      autoReconnect: options?.autoReconnect ?? true,
      reconnectIntervalMs: options?.reconnectIntervalMs ?? 5000,
      simulationIntervalMs: options?.simulationIntervalMs ?? 1000,
      instruments: options?.instruments ?? [
        "NSE_INDEX|Nifty 50",
        "NSE_INDEX|Nifty Bank",
      ],
    };
    for (const inst of this.options.instruments) {
      this.subscribedInstruments.add(inst);
    }
  }

  public getStatus(): StreamClientStatus {
    return this.status;
  }

  public getSubscribedInstruments(): string[] {
    return Array.from(this.subscribedInstruments);
  }

  /**
   * Ensures the streaming engine is active.
   * If real Upstox token is available, initiates WebSocket connection;
   * otherwise starts high-frequency simulated market feed so local/paper UI remains live.
   */
  public async ensureStarted(): Promise<void> {
    if (this.status === "STREAMING" || this.status === "CONNECTING" || this.status === "SIMULATION") {
      return;
    }

    const token = await getAccessToken();
    if (token) {
      await this.connectRealFeed(token);
    } else {
      this.startSimulationFeed();
    }
  }

  /**
   * Connects to Upstox Authorized Protobuf WebSocket feed.
   */
  public async connectRealFeed(token: string): Promise<boolean> {
    this.status = "CONNECTING";
    try {
      // 1. Request Authorized WebSocket Redirect URI from Upstox API
      const authRes = await fetch(
        "https://api.upstox.com/v2/feed/market-data-feed/authorize",
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        }
      );

      if (!authRes.ok) {
        throw new Error(`Feed authorization failed with HTTP ${authRes.status}`);
      }

      const authData = (await authRes.json()) as {
        data?: { authorizedRedirectUri?: string };
      };
      const wsUrl = authData.data?.authorizedRedirectUri;
      if (!wsUrl) {
        throw new Error("No authorizedRedirectUri returned by Upstox feed API");
      }

      // 2. Open WebSocket connection using runtime WebSocket
      if (typeof globalThis.WebSocket === "undefined") {
        throw new Error("WebSocket client not available in current environment");
      }

      const ws = new globalThis.WebSocket(wsUrl);
      this.ws = ws;

      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        this.status = "CONNECTED";
        this.sendSubscriptionFrame();
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          if (event.data instanceof ArrayBuffer) {
            this.handleBinaryMessage(new Uint8Array(event.data));
          } else if (typeof Buffer !== "undefined" && Buffer.isBuffer(event.data)) {
            this.handleBinaryMessage(new Uint8Array(event.data));
          }
        } catch {
          // Prevent malformed frame from breaking socket
        }
      };

      ws.onerror = () => {
        this.status = "ERROR";
      };

      ws.onclose = () => {
        this.status = "DISCONNECTED";
        this.ws = null;
        if (this.options.autoReconnect) {
          this.scheduleReconnect();
        }
      };

      return true;
    } catch {
      this.status = "ERROR";
      // Fallback to simulation feed so UI doesn't freeze
      this.startSimulationFeed();
      return false;
    }
  }

  /**
   * Sends subscription frame to Upstox WebSocket feed in full mode.
   */
  private sendSubscriptionFrame(): void {
    if (!this.ws || this.ws.readyState !== 1) return; // 1 = OPEN
    const payload = {
      guid: `sub_${Date.now()}`,
      method: "sub",
      params: {
        mode: "full",
        instrumentKeys: Array.from(this.subscribedInstruments),
      },
    };
    try {
      const jsonStr = JSON.stringify(payload);
      if (typeof Buffer !== "undefined") {
        this.ws.send(Buffer.from(jsonStr, "utf-8"));
      } else {
        this.ws.send(new TextEncoder().encode(jsonStr));
      }
      this.status = "STREAMING";
    } catch {
      // Ignored
    }
  }

  /**
   * Decodes incoming binary Protobuf feed frame and ingests into StreamingQuoteManager.
   */
  public handleBinaryMessage(bytes: Uint8Array): void {
    try {
      const decoded = decodeFeedResponse(bytes);
      const normalised = normaliseFeeds(decoded);
      for (const feed of normalised.feeds) {
        if (feed.ltp != null) {
          const bestBid = feed.bids[0]?.price ?? null;
          const bestAsk = feed.asks[0]?.price ?? null;
          quoteManager.ingestTick({
            instrumentKey: feed.instrumentKey,
            ltp: feed.ltp,
            ltt: feed.ltt ?? Date.now(),
            bid: bestBid,
            ask: bestAsk,
            volume: feed.vtt,
            oi: feed.oi,
            iv: feed.iv,
            delta: feed.greeks?.delta ?? null,
          });
        }
      }
      this.status = "STREAMING";
    } catch {
      // Handle quarantine / decode error gracefully
    }
  }

  /**
   * Starts high-frequency fallback tick simulation for offline & paper-trading modes.
   */
  public startSimulationFeed(): void {
    if (this.simulationTimer) return;
    this.status = "SIMULATION";

    // Base prices for simulated feed
    const basePrices: Record<string, number> = {
      "NSE_INDEX|Nifty 50": 24250.0,
      "NSE_INDEX|Nifty Bank": 51800.0,
    };

    this.simulationTimer = setInterval(() => {
      for (const [key, base] of Object.entries(basePrices)) {
        // Random micro tick between -0.05% and +0.05%
        const deltaPct = (Math.random() - 0.49) * 0.001;
        const newLtp = Math.round((base * (1 + deltaPct)) * 20) / 20; // 0.05 tick size
        basePrices[key] = newLtp;

        const spread = Math.round(newLtp * 0.0002 * 20) / 20;
        const bid = Math.round((newLtp - spread / 2) * 20) / 20;
        const ask = Math.round((newLtp + spread / 2) * 20) / 20;

        quoteManager.ingestTick({
          instrumentKey: key,
          symbol: key.includes("Bank") ? "BANKNIFTY" : "NIFTY",
          ltp: newLtp,
          ltt: Date.now() - Math.floor(Math.random() * 35), // 0-35ms simulated exchange latency
          bid,
          ask,
          volume: Math.floor(100000 + Math.random() * 5000),
          oi: Math.floor(500000 + Math.random() * 10000),
        });
      }
    }, this.options.simulationIntervalMs);
  }

  public stop(): void {
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.status = "DISCONNECTED";
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureStarted();
    }, this.options.reconnectIntervalMs);
  }
}

// Global singleton instance
export const upstoxStreamClient = new UpstoxStreamClient();
