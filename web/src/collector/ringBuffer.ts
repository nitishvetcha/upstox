// Market Data Collector — Ingestion Ring Buffer & Bounded-Memory Backpressure Manager
// Implements WBS 4.3 and complies with COLLECTOR_ARCHITECTURE_SPECIFICATION.md & COLLECTOR_FAILURE_AND_RECOVERY_DESIGN.md.

export type DegradationStage =
  | "STAGE_NORMAL"         // < 80% buffer utilization
  | "STAGE_1_WARNING"      // 80% to 90% buffer utilization
  | "STAGE_2_SHEDDING"     // 90% to 100% buffer utilization (sheds non-critical telemetry)
  | "STAGE_3_FAIL_CLOSED";  // 100% capacity reached; explicit drop accounting recorded

export interface IngestionDropRecord {
  droppedAtUtcIso: string;
  droppedCount: number;
  bufferCapacity: number;
  reason: "RING_BUFFER_OVERFLOW";
}

export class IngestionRingBuffer<T> {
  private buffer: Array<T | undefined>;
  private head = 0;
  private tail = 0;
  private count = 0;
  private readonly capacity: number;

  private totalEventsPushed = 0;
  private totalEventsPopped = 0;
  private totalEventsDropped = 0;
  private dropRecords: IngestionDropRecord[] = [];

  constructor(capacity = 50000) {
    if (capacity <= 0) throw new Error("Capacity must be positive");
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  public getCapacity(): number {
    return this.capacity;
  }

  public size(): number {
    return this.count;
  }

  public getUtilization(): number {
    return this.count / this.capacity;
  }

  public getDegradationStage(): DegradationStage {
    const util = this.getUtilization();
    if (util >= 1.0) return "STAGE_3_FAIL_CLOSED";
    if (util >= 0.9) return "STAGE_2_SHEDDING";
    if (util >= 0.8) return "STAGE_1_WARNING";
    return "STAGE_NORMAL";
  }

  /**
   * Pushes an event into the ring buffer following the 4-stage backpressure policy.
   * If isCritical is false and buffer is in STAGE_2_SHEDDING, sheds the item.
   * If buffer is at 100% capacity, fails-closed and logs explicit drop accounting.
   */
  public push(item: T, isCritical = true): boolean {
    const stage = this.getDegradationStage();

    // Stage 2: Shed non-critical items (e.g. diagnostic telemetry)
    if (!isCritical && (stage === "STAGE_2_SHEDDING" || stage === "STAGE_3_FAIL_CLOSED")) {
      this.totalEventsDropped++;
      return false;
    }

    // Stage 3: Controlled Fail-Closed when at 100% capacity
    if (this.count >= this.capacity) {
      this.totalEventsDropped++;
      this.dropRecords.push({
        droppedAtUtcIso: new Date().toISOString(),
        droppedCount: 1,
        bufferCapacity: this.capacity,
        reason: "RING_BUFFER_OVERFLOW",
      });
      // Cap drop records log to 100 entries
      if (this.dropRecords.length > 100) this.dropRecords.shift();
      return false;
    }

    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    this.count++;
    this.totalEventsPushed++;
    return true;
  }

  /**
   * Pops the oldest item from the buffer.
   */
  public pop(): T | undefined {
    if (this.count === 0) return undefined;
    const item = this.buffer[this.head];
    this.buffer[this.head] = undefined; // release memory reference
    this.head = (this.head + 1) % this.capacity;
    this.count--;
    this.totalEventsPopped++;
    return item;
  }

  /**
   * Pops a batch of items from the buffer.
   */
  public popBatch(maxBatchSize: number): T[] {
    const batch: T[] = [];
    while (batch.length < maxBatchSize && this.count > 0) {
      const item = this.pop();
      if (item !== undefined) batch.push(item);
    }
    return batch;
  }

  public clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }

  public getStats() {
    return {
      capacity: this.capacity,
      size: this.count,
      utilizationPct: Number((this.getUtilization() * 100).toFixed(2)),
      degradationStage: this.getDegradationStage(),
      totalEventsPushed: this.totalEventsPushed,
      totalEventsPopped: this.totalEventsPopped,
      totalEventsDropped: this.totalEventsDropped,
      dropRecordsCount: this.dropRecords.length,
    };
  }

  public getDropRecords(): ReadonlyArray<IngestionDropRecord> {
    return [...this.dropRecords];
  }
}
