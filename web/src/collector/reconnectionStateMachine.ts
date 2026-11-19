// Market Data Collector — Module 10: Reconnection State Machine & Failure Detection
// Implements WBS 4.6 and complies with COLLECTOR_FAILURE_AND_RECOVERY_DESIGN.md.

import { randomUUID } from "node:crypto";
import type {
  ConnectionStatusEvent,
  DataGapRecord,
  FeedTransportHealthState,
} from "./collectorTypes.ts";

export interface ReconnectionConfig {
  connectionId: string;
  baseBackoffMs: number;
  maxBackoffMs: number;
  maxReconnectAttempts: number;
  feedSilenceWatchdogMs: number;
  stallReconnectThresholdMs: number;
}

export class ReconnectionStateMachine {
  private config: ReconnectionConfig;
  private healthState: FeedTransportHealthState = "STATE_TRANSPORT_UNHEALTHY";
  private connectionState: ConnectionStatusEvent["state"] = "DISCONNECTED";
  private reconnectAttempt = 0;

  private disconnectMonoNs: bigint | null = null;
  private lastMessageMonoNs: bigint | null = null;
  private lastPingSentMonoNs: bigint | null = null;
  private pendingPing = false;

  private isMarketOpen = true; // Set according to session schedule (09:15-15:30 IST)

  constructor(config: Partial<ReconnectionConfig> & { connectionId: string }) {
    this.config = {
      connectionId: config.connectionId,
      baseBackoffMs: config.baseBackoffMs ?? 1000,
      maxBackoffMs: config.maxBackoffMs ?? 30000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      feedSilenceWatchdogMs: config.feedSilenceWatchdogMs ?? 15000,
      stallReconnectThresholdMs: config.stallReconnectThresholdMs ?? 45000,
    };
  }

  public getHealthState(): FeedTransportHealthState {
    return this.healthState;
  }

  public getConnectionState(): ConnectionStatusEvent["state"] {
    return this.connectionState;
  }

  public setMarketOpen(isOpen: boolean): void {
    this.isMarketOpen = isOpen;
    if (!isOpen && (this.connectionState === "OPEN" || this.connectionState === "SUBSCRIBED")) {
      this.healthState = "STATE_MARKET_CLOSED_OR_HALTED";
    } else if (isOpen && this.connectionState === "SUBSCRIBED") {
      this.healthState = "STATE_TRANSPORT_HEALTHY_DATA_FLOWING";
    }
  }

  /**
   * Called when physical socket connects and subscription is confirmed.
   */
  public onConnected(nowMono: bigint = process.hrtime.bigint()): { status: ConnectionStatusEvent; gap: DataGapRecord | null } {
    let gap: DataGapRecord | null = null;

    if (this.disconnectMonoNs !== null) {
      const gapDurationMs = Number(nowMono - this.disconnectMonoNs) / 1_000_000;
      gap = {
        gapId: randomUUID(),
        sessionDate: new Date().toISOString().slice(0, 10),
        gapStartUtcIso: new Date(Date.now() - gapDurationMs).toISOString(),
        gapEndUtcIso: new Date().toISOString(),
        gapDurationMs: Number(gapDurationMs.toFixed(2)),
        affectedInstrumentsCount: 0,
        cause: "DISCONNECTION",
        restSnapshotReferenceTaken: false,
        notes: `Outage resolved after ${this.reconnectAttempt} reconnect attempts`,
      };
      this.disconnectMonoNs = null;
    }

    this.connectionState = "SUBSCRIBED";
    this.healthState = "STATE_TRANSPORT_HEALTHY_DATA_FLOWING";
    this.reconnectAttempt = 0;
    this.lastMessageMonoNs = nowMono;
    this.pendingPing = false;

    const status: ConnectionStatusEvent = {
      schemaVersion: "1.0.0",
      eventType: "CONNECTION_STATUS",
      connectionId: this.config.connectionId,
      state: "SUBSCRIBED",
      healthState: this.healthState,
      localReceiptUtcIso: new Date().toISOString(),
      localReceiptMonoNs: nowMono,
      remoteEndpoint: "wss://api.upstox.com/v3/feed/market-data-feed",
      reconnectAttempt: this.reconnectAttempt,
      gapDurationMs: gap ? gap.gapDurationMs : null,
      details: "Connection open and subscription confirmed; market data flowing",
    };

    return { status, gap };
  }

  /**
   * Called on incoming market data message.
   */
  public onMessageReceived(instrumentKey?: string, nowMono: bigint = process.hrtime.bigint()): void {
    this.lastMessageMonoNs = nowMono;
    this.pendingPing = false;
    if (this.healthState === "STATE_TRANSPORT_HEALTHY_DATA_STALLED") {
      this.healthState = "STATE_TRANSPORT_HEALTHY_DATA_FLOWING";
    }
  }

  /**
   * Called when an individual illiquid contract receives no updates.
   * Clarification: Individual illiquid contracts do NOT trigger reconnects.
   */
  public onIndividualContractInactive(instrumentKey: string): FeedTransportHealthState {
    return "STATE_INDIVIDUAL_CONTRACT_INACTIVE";
  }

  /**
   * Called on physical socket disconnect or transport error.
   */
  public onDisconnected(reason: string, nowMono: bigint = process.hrtime.bigint()): ConnectionStatusEvent {
    if (this.disconnectMonoNs === null) {
      this.disconnectMonoNs = nowMono;
    }

    this.connectionState = "DISCONNECTED";
    this.healthState = "STATE_TRANSPORT_UNHEALTHY";
    this.reconnectAttempt++;

    return {
      schemaVersion: "1.0.0",
      eventType: "CONNECTION_STATUS",
      connectionId: this.config.connectionId,
      state: "DISCONNECTED",
      healthState: this.healthState,
      localReceiptUtcIso: new Date().toISOString(),
      localReceiptMonoNs: nowMono,
      remoteEndpoint: "wss://api.upstox.com/v3/feed/market-data-feed",
      reconnectAttempt: this.reconnectAttempt,
      gapDurationMs: null,
      details: `Disconnected: ${reason}`,
    };
  }

  /**
   * Calculates next exponential backoff delay with jitter.
   */
  public calculateBackoffDelayMs(): number {
    const attempt = Math.max(0, this.reconnectAttempt - 1);
    const expDelay = this.config.baseBackoffMs * Math.pow(2, attempt);
    const capped = Math.min(expDelay, this.config.maxBackoffMs);
    // Add 10% random jitter
    const jitter = capped * 0.1 * Math.random();
    return Math.round(capped + jitter);
  }

  public isMaxReconnectExceeded(): boolean {
    return this.reconnectAttempt > this.config.maxReconnectAttempts;
  }

  /**
   * Periodic Watchdog Evaluation:
   * Separates transport health from feed-wide stall.
   */
  public evaluateWatchdog(currentTimeMonoNs: bigint = process.hrtime.bigint()): {
    action: "NONE" | "SEND_PING" | "TRIGGER_DIAGNOSTIC_RECONNECT";
    healthState: FeedTransportHealthState;
    reason?: string;
  } {
    if (this.connectionState !== "SUBSCRIBED") {
      return { action: "NONE", healthState: this.healthState };
    }

    if (!this.isMarketOpen) {
      this.healthState = "STATE_MARKET_CLOSED_OR_HALTED";
      return { action: "NONE", healthState: this.healthState };
    }

    if (this.lastMessageMonoNs === null) {
      this.lastMessageMonoNs = currentTimeMonoNs;
      return { action: "NONE", healthState: this.healthState };
    }

    const silenceMs = Number(currentTimeMonoNs - this.lastMessageMonoNs) / 1_000_000;

    // Check if feed silence exceeds stall reconnect threshold (> 45s)
    if (silenceMs >= this.config.stallReconnectThresholdMs) {
      this.healthState = "STATE_TRANSPORT_HEALTHY_DATA_STALLED";
      return {
        action: "TRIGGER_DIAGNOSTIC_RECONNECT",
        healthState: this.healthState,
        reason: `Feed-wide silence exceeded ${silenceMs.toFixed(0)}ms (> threshold ${this.config.stallReconnectThresholdMs}ms); triggering diagnostic reconnect`,
      };
    }

    // Check if feed silence exceeds watchdog threshold (15-30s)
    if (silenceMs >= this.config.feedSilenceWatchdogMs) {
      if (!this.pendingPing) {
        this.pendingPing = true;
        this.lastPingSentMonoNs = currentTimeMonoNs;
        return {
          action: "SEND_PING",
          healthState: this.healthState,
          reason: `Feed-wide silence for ${silenceMs.toFixed(0)}ms; sending protocol ping`,
        };
      } else if (this.lastPingSentMonoNs !== null) {
        const pingAgeMs = Number(currentTimeMonoNs - this.lastPingSentMonoNs) / 1_000_000;
        if (pingAgeMs > 5000) {
          // Protocol ping timed out (> 5s without pong)
          this.healthState = "STATE_TRANSPORT_UNHEALTHY";
          return {
            action: "TRIGGER_DIAGNOSTIC_RECONNECT",
            healthState: this.healthState,
            reason: `Protocol ping timed out (${pingAgeMs.toFixed(0)}ms > 5000ms); transport unhealthy`,
          };
        }
      }
    }

    return { action: "NONE", healthState: this.healthState };
  }

  /**
   * Called when protocol pong is received.
   */
  public onPongReceived(nowMono: bigint = process.hrtime.bigint()): void {
    this.pendingPing = false;
    this.lastPingSentMonoNs = null;
    // Protocol pong succeeded while market data is silent: transport is healthy, but data is stalled
    if (this.lastMessageMonoNs !== null) {
      const silenceMs = Number(nowMono - this.lastMessageMonoNs) / 1_000_000;
      if (silenceMs >= this.config.feedSilenceWatchdogMs) {
        this.healthState = "STATE_TRANSPORT_HEALTHY_DATA_STALLED";
      }
    }
  }
}
