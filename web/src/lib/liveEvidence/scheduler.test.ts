import test from "node:test";
import assert from "node:assert/strict";
import { SessionScheduler, oneSessionPilotCap, type CaptureOutcome, type SchedulerEvent, type SetTimer } from "./scheduler.ts";
import { sessionSlots } from "./collector.ts";

function harness(startedAtUtc: string, outcomes: CaptureOutcome[] = []) {
  const callbacks: { at: string; run: () => void | Promise<void>; cancelled: boolean }[] = [];
  const events: SchedulerEvent[] = [];
  const calls: { slot: string; seq: number }[] = [];
  let now = startedAtUtc;
  const setTimer: SetTimer = (at, run) => {
    const item = { at, run, cancelled: false };
    callbacks.push(item);
    return { cancel: () => { item.cancelled = true; } };
  };
  const scheduler = new SessionScheduler({
    slots: sessionSlots("2026-11-12"),
    startedAtUtc,
    nowUtc: () => now,
    setTimer,
    capture: async (slot, seq) => {
      calls.push({ slot, seq });
      return outcomes[calls.length - 1] ?? "STORED";
    },
    onEvent: (event) => events.push(event),
  });
  return {
    scheduler, callbacks, events, calls,
    setNow: (value: string) => { now = value; },
    run: async (index: number) => { if (!callbacks[index].cancelled) await callbacks[index].run(); },
  };
}

test("full session schedules 76 five-minute slots from 09:15 to 15:30 IST", () => {
  const h = harness("2026-11-12T03:45:00.000Z");
  h.scheduler.start();
  assert.equal(h.callbacks.length, 76);
  assert.equal(Date.parse(h.callbacks[1].at) - Date.parse(h.callbacks[0].at), 300_000);
  assert.equal(h.callbacks[0].at, "2026-11-12T03:45:00.000Z");
  assert.equal(h.callbacks[75].at, "2026-11-12T10:00:00.000Z");
});

test("each timer makes exactly one capture attempt and duplicate firing is ignored", async () => {
  const h = harness("2026-11-12T03:45:00.000Z");
  h.scheduler.start();
  await h.run(0);
  await h.run(0);
  assert.equal(h.calls.length, 1);
  assert.equal(h.events.filter((event) => event.kind === "CAPTURED").length, 1);
});

test("ordinary failure is recorded without retry and the next slot may run", async () => {
  const h = harness("2026-11-12T03:45:00.000Z", ["FAILED", "STORED"]);
  h.scheduler.start();
  await h.run(0);
  await h.run(1);
  assert.equal(h.calls.length, 2);
  assert.equal(h.events.filter((event) => event.kind === "FAILED").length, 1);
  assert.equal(h.events.filter((event) => event.kind === "CAPTURED").length, 1);
});

for (const stop of ["TOKEN_EXPIRY", "RATE_LIMIT"] as const) {
  test(`${stop} stops later captures with no retry`, async () => {
    const h = harness("2026-11-12T03:45:00.000Z", [stop]);
    h.scheduler.start();
    await h.run(0);
    await h.run(1);
    assert.equal(h.calls.length, 1);
    assert.ok(h.events.some((event) => event.kind === "STOPPED" && event.detail === stop));
    assert.ok(h.events.some((event) => event.kind === "NOT_ATTEMPTED"));
  });
}

test("restart records earlier slots missing and schedules only current/future slots", () => {
  const h = harness("2026-11-12T03:55:00.000Z");
  h.scheduler.start();
  assert.equal(h.events.filter((event) => event.kind === "MISSING").length, 2);
  assert.equal(h.callbacks.length, 74);
  assert.equal(h.callbacks[0].at, "2026-11-12T03:55:00.000Z");
  assert.equal(h.calls.length, 0, "missed slots are not backfilled");
});

test("cancel removes every scheduled callback without capturing", async () => {
  const h = harness("2026-11-12T03:45:00.000Z");
  h.scheduler.start();
  h.scheduler.cancel();
  await h.run(0);
  assert.equal(h.calls.length, 0);
  assert.ok(h.callbacks.every((callback) => callback.cancelled));
});

test("one-session cap distinguishes WebSocket setup from 76 pushed snapshots and REST requests", () => {
  assert.deepEqual(oneSessionPilotCap(76), {
    scheduledSnapshots: 76,
    websocketAuthorizedUrlRequests: 1,
    websocketConnections: 1,
    subscriptionMessages: 1,
    automaticReconnects: 0,
    restAlternativeRequests: 76,
  });
  assert.throws(() => oneSessionPilotCap(0), /positive integer/);
});
