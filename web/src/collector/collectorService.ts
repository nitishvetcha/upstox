// Market Data Collector — End-to-End Collector Service Orchestrator
// Coordinates Modules 1 through 11 for offline simulation and prototyping.

import { DataQualityMonitor } from "./dataQualityMonitor.ts";
import { EventNormalizer } from "./eventNormalizer.ts";
import { ProtobufDecoder } from "./protobufDecoder.ts";
import { ReconnectionStateMachine } from "./reconnectionStateMachine.ts";
import { IngestionRingBuffer } from "./ringBuffer.ts";
import { StorageManager } from "./storageManager.ts";
import { SubscriptionManager } from "./subscriptionManager.ts";
import { resolveUniverse, type RawMasterContract, type UniverseResolutionOptions } from "./universeSelector.ts";
import type {
  CanonicalMarketEvent,
  CollectorSessionManifest,
  DataGapRecord,
  HashedUniverseManifest,
} from "./collectorTypes.ts";

export interface CollectorServiceOptions {
  baseDirectory: string;
  sessionDate: string;
  masterSource: string;
  masterRawContent: string;
  referencePrices: UniverseResolutionOptions["referencePrices"];
  wingStrikesCount?: number;
  bufferCapacity?: number;
}

export class CollectorService {
  private universeManifest: HashedUniverseManifest;
  private subscriptionManager: SubscriptionManager;
  private decoder: ProtobufDecoder;
  private normalizer: EventNormalizer;
  private ringBuffer: IngestionRingBuffer<CanonicalMarketEvent>;
  private qualityMonitor: DataQualityMonitor;
  private storageManager: StorageManager;
  private reconnectStateMachine: ReconnectionStateMachine;

  private isRunning = false;

  constructor(options: CollectorServiceOptions) {
    // 1. Resolve Dynamic Universe
    this.universeManifest = resolveUniverse({
      masterSource: options.masterSource,
      masterRawContent: options.masterRawContent,
      retrievalDateIso: new Date().toISOString(),
      marketSessionDate: options.sessionDate,
      referencePrices: options.referencePrices,
      wingStrikesCount: options.wingStrikesCount,
    });

    if (this.universeManifest.universeStatus === "INVALID") {
      throw new Error(`COLLECTOR_INIT_ABORT: Universe resolution failed with INVALID status (${this.universeManifest.missingKeys.length} core missing)`);
    }

    // 2. Initialize Subsystems
    this.subscriptionManager = new SubscriptionManager();
    this.decoder = new ProtobufDecoder();
    this.normalizer = new EventNormalizer();
    this.ringBuffer = new IngestionRingBuffer<CanonicalMarketEvent>(options.bufferCapacity ?? 10000);
    this.qualityMonitor = new DataQualityMonitor();

    this.storageManager = new StorageManager({
      baseDirectory: options.baseDirectory,
      sessionDate: options.sessionDate,
      universeManifestHash: this.universeManifest.manifestHash,
    });

    this.reconnectStateMachine = new ReconnectionStateMachine({
      connectionId: "ws-pool-01",
    });
  }

  public getUniverseManifest(): Readonly<HashedUniverseManifest> {
    return this.universeManifest;
  }

  public getSubscriptionPlan() {
    return this.subscriptionManager.planSubscriptions(this.universeManifest.selectedContracts);
  }

  public start(): void {
    this.isRunning = true;
    const { status } = this.reconnectStateMachine.onConnected();
    const serialized = JSON.stringify(status, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    this.storageManager.appendRawFrame(new TextEncoder().encode(serialized));
  }

  /**
   * Ingests a raw binary Protobuf frame from simulated socket.
   */
  public ingestFrame(connectionId: string, frameBytes: Uint8Array): {
    ok: boolean;
    eventsProduced: number;
    dropped: boolean;
  } {
    if (!this.isRunning) throw new Error("Collector is not running");

    const receiptMonoNs = process.hrtime.bigint();
    const receiptUtcMs = Date.now();

    // Level 1: Append raw binary frame to forensic log
    this.storageManager.appendRawFrame(frameBytes);

    // Level 2: Decode Protobuf
    const decodeRes = this.decoder.decode(frameBytes);
    if (!decodeRes.ok) {
      return { ok: false, eventsProduced: 0, dropped: false };
    }

    // Level 3: Normalize Feeds
    const events = this.normalizer.normalizeFeedResponse(decodeRes.payload, {
      connectionId,
      localReceiptMonoNs: receiptMonoNs,
      localReceiptUtcMs: receiptUtcMs,
    });

    // Notify reconnection state machine of market data message
    this.reconnectStateMachine.onMessageReceived();

    // Push events to ring buffer
    let eventsProduced = 0;
    let anyDropped = false;

    for (const evt of events) {
      // Evaluate passively via DataQualityMonitor
      const extraFlags = this.qualityMonitor.evaluateEvent(evt);
      if (extraFlags.length > 0) {
        evt.qualityFlags.push(...extraFlags);
      }

      const pushed = this.ringBuffer.push(evt, true);
      if (pushed) {
        eventsProduced++;
      } else {
        anyDropped = true;
        this.storageManager.recordDroppedEvents(1);
      }
    }

    return { ok: true, eventsProduced, dropped: anyDropped };
  }

  /**
   * Flushes events from ring buffer to storage partitions.
   */
  public flushPending(batchSize = 1000): number {
    const batch = this.ringBuffer.popBatch(batchSize);
    for (const evt of batch) {
      this.storageManager.writeEvent(evt);
    }
    return batch.length;
  }

  public recordGap(gap: DataGapRecord): void {
    this.storageManager.recordGap(gap);
  }

  public stop(): CollectorSessionManifest {
    this.flushPending(100000);
    this.isRunning = false;
    return this.storageManager.finalizeSession();
  }

  public getSessionDir(): string {
    return this.storageManager.getSessionDir();
  }

  public getStats() {
    return {
      decoder: this.decoder.getStats(),
      ringBuffer: this.ringBuffer.getStats(),
      qualityMonitor: {
        latency: this.qualityMonitor.getLatencyDistribution(),
        interArrival: this.qualityMonitor.getInterArrivalDistribution(),
        anomalies: this.qualityMonitor.getAnomalyCounters(),
      },
      reconnectState: {
        health: this.reconnectStateMachine.getHealthState(),
        state: this.reconnectStateMachine.getConnectionState(),
      },
    };
  }
}
