// Market Data Collector — Module 8: Data-Quality & Freshness Monitor
// Implements WBS 4.3 and complies with COLLECTOR_ARCHITECTURE_SPECIFICATION.md & COLLECTOR_DATA_SCHEMA.md.

import type { BestBidAskEvent, CanonicalMarketEvent, LTPCEvent } from "./collectorTypes.ts";

export interface LatencyDistribution {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  sampleCount: number;
}

export interface AnomalyCounters {
  crossedBooks: number;
  zeroBids: number;
  tickJumps: number;
  staleQuotes: number;
  clockSkews: number;
  retransmissions: number;
}

export class DataQualityMonitor {
  private latencies: number[] = [];
  private interArrivals: number[] = [];
  private lastArrivalMonoNs = new Map<string, bigint>();
  private lastTradePrices = new Map<string, number>();

  private anomalies: AnomalyCounters = {
    crossedBooks: 0,
    zeroBids: 0,
    tickJumps: 0,
    staleQuotes: 0,
    clockSkews: 0,
    retransmissions: 0,
  };

  /**
   * Evaluates an incoming event passively, updating telemetry and recording quality flags.
   */
  public evaluateEvent(event: CanonicalMarketEvent): string[] {
    const detectedFlags: string[] = [];

    // 1. Transport Latency Tracking
    if (event.transportLatencyMs !== null && event.transportLatencyMs >= 0) {
      this.latencies.push(event.transportLatencyMs);
      if (this.latencies.length > 5000) this.latencies.shift();
    }
    if (event.qualityFlags.includes("SUSPECT_CLOCK_SKEW")) {
      this.anomalies.clockSkews++;
    }
    if (event.qualityFlags.includes("POSSIBLE_RETRANSMISSION")) {
      this.anomalies.retransmissions++;
    }

    // 2. Inter-arrival time tracking per instrument
    const prevMono = this.lastArrivalMonoNs.get(event.instrumentKey);
    if (prevMono !== undefined) {
      const deltaMs = Number(event.localReceiptMonoNs - prevMono) / 1_000_000;
      if (deltaMs >= 0) {
        this.interArrivals.push(deltaMs);
        if (this.interArrivals.length > 5000) this.interArrivals.shift();
      }
    }
    this.lastArrivalMonoNs.set(event.instrumentKey, event.localReceiptMonoNs);

    // 3. Best Bid / Ask Order-Book Checks
    if (event.eventType === "BEST_BID_ASK") {
      const bba = event as BestBidAskEvent;
      if (bba.bestBidPrice === null || bba.bestBidPrice <= 0) {
        this.anomalies.zeroBids++;
        detectedFlags.push("ZERO_BID");
      }
      if (
        bba.bestBidPrice !== null &&
        bba.bestAskPrice !== null &&
        bba.bestBidPrice >= bba.bestAskPrice
      ) {
        this.anomalies.crossedBooks++;
        detectedFlags.push("CROSSED_BOOK");
      }
    }

    // 4. Tick Jump Detection (LTP changes > 20% in single tick)
    if (event.eventType === "LTPC") {
      const ltpc = event as LTPCEvent;
      if (ltpc.ltp !== null && ltpc.ltp > 0) {
        const lastPrice = this.lastTradePrices.get(event.instrumentKey);
        if (lastPrice !== undefined && lastPrice > 0) {
          const changePct = Math.abs(ltpc.ltp - lastPrice) / lastPrice;
          if (changePct > 0.2) {
            this.anomalies.tickJumps++;
            detectedFlags.push("TICK_JUMP");
          }
        }
        this.lastTradePrices.set(event.instrumentKey, ltpc.ltp);
      }
    }

    return detectedFlags;
  }

  public getLatencyDistribution(): LatencyDistribution {
    return this.calculatePercentiles(this.latencies);
  }

  public getInterArrivalDistribution(): LatencyDistribution {
    return this.calculatePercentiles(this.interArrivals);
  }

  public getAnomalyCounters(): Readonly<AnomalyCounters> {
    return { ...this.anomalies };
  }

  private calculatePercentiles(samples: number[]): LatencyDistribution {
    if (samples.length === 0) {
      return { p50Ms: 0, p95Ms: 0, p99Ms: 0, sampleCount: 0 };
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    return {
      p50Ms: Number(p50.toFixed(2)),
      p95Ms: Number(p95.toFixed(2)),
      p99Ms: Number(p99.toFixed(2)),
      sampleCount: samples.length,
    };
  }
}
