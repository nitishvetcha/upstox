// Market Data Collector — Module 4: Subscription Manager & Configurable Sharding
// Implements WBS 4.3 and complies with COLLECTOR_ARCHITECTURE_SPECIFICATION.md & COLLECTOR_DATA_SCHEMA.md.

import { randomUUID } from "node:crypto";
import type {
  SubscriptionConfig,
  SubscriptionStatusEvent,
  UniverseContractDescriptor,
} from "./collectorTypes.ts";

export interface ShardAllocation {
  connectionId: string;
  instrumentKeys: string[];
  contracts: UniverseContractDescriptor[];
  chunkIndex: number;
  totalChunks: number;
}

export interface SubscriptionPlan {
  config: SubscriptionConfig;
  totalKeysCount: number;
  allocatedConnectionsCount: number;
  shards: ShardAllocation[];
  fallbackSingleSocketUsed: boolean;
  quotaStatus: "OK" | "INSUFFICIENT_SUBSCRIPTION_QUOTA";
}

export class SubscriptionManager {
  private config: SubscriptionConfig;
  private acknowledgedKeys = new Set<string>();
  private rejectedKeys = new Map<string, string>(); // key -> reason
  private activeShards = new Map<string, ShardAllocation>(); // connectionId -> ShardAllocation

  constructor(config: Partial<SubscriptionConfig> = {}) {
    this.config = {
      maxKeysPerSocket: config.maxKeysPerSocket ?? 100,
      maxConnections: config.maxConnections ?? 3,
      subscriptionStaggerMs: config.subscriptionStaggerMs ?? 500,
      subscriptionMode: "full",
    };
  }

  public getConfig(): Readonly<SubscriptionConfig> {
    return { ...this.config };
  }

  /**
   * Plans distribution of target universe keys across connections without hardcoded limits.
   */
  public planSubscriptions(
    contracts: UniverseContractDescriptor[],
    allowMultiConnection = true
  ): SubscriptionPlan {
    const totalKeys = contracts.length;
    const maxKeys = this.config.maxKeysPerSocket;
    const maxConns = allowMultiConnection ? this.config.maxConnections : 1;

    // Check theoretical quota capacity
    const totalCapacity = maxConns * maxKeys;
    const quotaStatus = totalKeys > totalCapacity ? "INSUFFICIENT_SUBSCRIPTION_QUOTA" : "OK";

    // Split contracts into chunks up to maxKeys
    const shards: ShardAllocation[] = [];
    let currentChunk: UniverseContractDescriptor[] = [];
    let chunkIdx = 0;

    for (let i = 0; i < totalKeys; i++) {
      currentChunk.push(contracts[i]);
      if (currentChunk.length >= maxKeys || i === totalKeys - 1) {
        const connId = `ws-pool-${String(chunkIdx + 1).padStart(2, "0")}`;
        shards.push({
          connectionId: connId,
          instrumentKeys: currentChunk.map((c) => c.instrumentKey),
          contracts: [...currentChunk],
          chunkIndex: chunkIdx,
          totalChunks: 0, // updated below
        });
        chunkIdx++;
        currentChunk = [];
      }
    }

    // Set totalChunks
    for (const shard of shards) {
      shard.totalChunks = shards.length;
      this.activeShards.set(shard.connectionId, shard);
    }

    return {
      config: this.getConfig(),
      totalKeysCount: totalKeys,
      allocatedConnectionsCount: shards.length,
      shards,
      fallbackSingleSocketUsed: !allowMultiConnection && totalKeys <= maxKeys,
      quotaStatus,
    };
  }

  /**
   * Encodes a binary or JSON subscription request for a specific shard.
   */
  public createSubscriptionFrame(shard: ShardAllocation): Uint8Array {
    const payload = {
      guid: randomUUID(),
      method: "sub",
      data: {
        mode: this.config.subscriptionMode,
        instrumentKeys: shard.instrumentKeys,
      },
    };
    return new TextEncoder().encode(JSON.stringify(payload));
  }

  /**
   * Processes subscription acknowledgment from Upstox gateway.
   * Handles partial rejections gracefully: acknowledged keys stay active, rejected keys are recorded.
   */
  public processAcknowledgment(
    connectionId: string,
    requestGuid: string,
    requestedKeys: string[],
    acknowledgedKeys: string[],
    rejected: { instrumentKey: string; reason: string }[] = []
  ): SubscriptionStatusEvent {
    for (const key of acknowledgedKeys) {
      this.acknowledgedKeys.add(key);
      this.rejectedKeys.delete(key);
    }
    for (const rej of rejected) {
      this.rejectedKeys.set(rej.instrumentKey, rej.reason);
      this.acknowledgedKeys.delete(rej.instrumentKey);
    }

    let status: SubscriptionStatusEvent["status"] = "CONFIRMED";
    if (rejected.length > 0 && acknowledgedKeys.length > 0) {
      status = "PARTIAL_REJECTION";
    } else if (rejected.length > 0 && acknowledgedKeys.length === 0) {
      status = "TOTAL_REJECTION";
    }

    return {
      schemaVersion: "1.0.0",
      eventType: "SUBSCRIPTION_STATUS",
      connectionId,
      localReceiptUtcIso: new Date().toISOString(),
      localReceiptMonoNs: process.hrtime.bigint(),
      requestGuid,
      mode: "full",
      keysRequestedCount: requestedKeys.length,
      keysAcknowledgedCount: acknowledgedKeys.length,
      rejectedKeys: rejected,
      status,
    };
  }

  public isKeyActive(instrumentKey: string): boolean {
    return this.acknowledgedKeys.has(instrumentKey);
  }

  public getRejectedKeys(): ReadonlyMap<string, string> {
    return new Map(this.rejectedKeys);
  }
}
