// Tests for Ring Buffer & Backpressure Degradation Policy (WBS 4.3)
import test from "node:test";
import assert from "node:assert/strict";
import { IngestionRingBuffer } from "./ringBuffer.ts";

test("Ring Buffer: normal FIFO enqueue and dequeue", () => {
  const rb = new IngestionRingBuffer<string>(10);
  assert.equal(rb.size(), 0);
  assert.equal(rb.getCapacity(), 10);

  assert.equal(rb.push("item1"), true);
  assert.equal(rb.push("item2"), true);
  assert.equal(rb.size(), 2);

  assert.equal(rb.pop(), "item1");
  assert.equal(rb.pop(), "item2");
  assert.equal(rb.pop(), undefined);
  assert.equal(rb.size(), 0);
});

test("Ring Buffer: multi-stage degradation policy transitions correctly", () => {
  const rb = new IngestionRingBuffer<string>(10);

  // 0 to 7 items: < 80% utilization -> STAGE_NORMAL
  for (let i = 0; i < 7; i++) {
    rb.push(`item_${i}`);
  }
  assert.equal(rb.getDegradationStage(), "STAGE_NORMAL");

  // 8 items: 80% utilization -> STAGE_1_WARNING
  rb.push("item_7");
  assert.equal(rb.getDegradationStage(), "STAGE_1_WARNING");

  // 9 items: 90% utilization -> STAGE_2_SHEDDING
  rb.push("item_8");
  assert.equal(rb.getDegradationStage(), "STAGE_2_SHEDDING");

  // In STAGE_2_SHEDDING: non-critical item is shed, critical item is admitted
  const nonCriticalPushed = rb.push("diag_telemetry", false);
  assert.equal(nonCriticalPushed, false); // shed!
  assert.equal(rb.size(), 9);

  // 10 items: 100% utilization -> STAGE_3_FAIL_CLOSED
  const criticalPushed = rb.push("critical_trade", true);
  assert.equal(criticalPushed, true);
  assert.equal(rb.size(), 10);
  assert.equal(rb.getDegradationStage(), "STAGE_3_FAIL_CLOSED");

  // Buffer full (10/10): further pushes fail-closed and record drop accounting
  const overflowPushed = rb.push("overflow_tick", true);
  assert.equal(overflowPushed, false);
  assert.equal(rb.size(), 10);

  const stats = rb.getStats();
  assert.equal(stats.totalEventsDropped, 2); // 1 non-critical shed + 1 overflow drop
  assert.equal(stats.dropRecordsCount, 1);
});

test("Ring Buffer: popBatch pops up to requested batch size", () => {
  const rb = new IngestionRingBuffer<number>(20);
  for (let i = 0; i < 15; i++) {
    rb.push(i);
  }

  const batch1 = rb.popBatch(10);
  assert.equal(batch1.length, 10);
  assert.equal(batch1[0], 0);
  assert.equal(batch1[9], 9);
  assert.equal(rb.size(), 5);

  const batch2 = rb.popBatch(10);
  assert.equal(batch2.length, 5);
  assert.equal(batch2[0], 10);
  assert.equal(batch2[4], 14);
  assert.equal(rb.size(), 0);
});

test("Ring Buffer: 100,000 throughput stress without unbounded memory growth", () => {
  const rb = new IngestionRingBuffer<number>(500);

  for (let cycle = 0; cycle < 1000; cycle++) {
    for (let i = 0; i < 100; i++) {
      rb.push(cycle * 100 + i);
    }
    const popped = rb.popBatch(100);
    assert.equal(popped.length, 100);
  }

  assert.equal(rb.size(), 0);
  assert.equal(rb.getStats().totalEventsPushed, 100000);
  assert.equal(rb.getStats().totalEventsPopped, 100000);
  assert.equal(rb.getStats().totalEventsDropped, 0);
});
