// Phase 9B Stage 4 — offline session scheduler.
// It owns no transport, token, or network code. Time and timers are injected.
// Each slot is attempted at most once; missed slots are recorded, never backfilled.

export type CaptureOutcome = "STORED" | "FAILED" | "TOKEN_EXPIRY" | "RATE_LIMIT";

export type SchedulerEvent =
  | { kind: "SCHEDULED"; slot: string; seq: number; atUtc: string }
  | { kind: "MISSING"; slot: string; seq: number; atUtc: string; detail: string }
  | { kind: "CAPTURED"; slot: string; seq: number; atUtc: string }
  | { kind: "FAILED"; slot: string; seq: number; atUtc: string }
  | { kind: "STOPPED"; slot: string; seq: number; atUtc: string; detail: "TOKEN_EXPIRY" | "RATE_LIMIT" }
  | { kind: "NOT_ATTEMPTED"; slot: string; seq: number; atUtc: string; detail: string };

export interface TimerHandle { cancel(): void }
export type SetTimer = (runAtUtc: string, callback: () => void | Promise<void>) => TimerHandle;

export interface SessionSchedulerOptions {
  slots: string[];
  startedAtUtc: string;
  nowUtc: () => string;
  setTimer: SetTimer;
  capture: (slot: string, seq: number) => Promise<CaptureOutcome>;
  onEvent: (event: SchedulerEvent) => void;
}

export class SessionScheduler {
  private handles: TimerHandle[] = [];
  private stopped: "TOKEN_EXPIRY" | "RATE_LIMIT" | null = null;
  private cancelled = false;
  private attempted = new Set<string>();
  private readonly options: SessionSchedulerOptions;

  constructor(options: SessionSchedulerOptions) {
    this.options = options;
  }

  start(): void {
    const startMs = Date.parse(this.options.startedAtUtc);
    if (!Number.isFinite(startMs)) throw new Error("invalid scheduler start time");

    this.options.slots.forEach((slot, index) => {
      const seq = index + 1;
      const slotMs = Date.parse(slot);
      if (!Number.isFinite(slotMs)) throw new Error(`invalid slot time: ${slot}`);
      if (slotMs < startMs) {
        this.options.onEvent({ kind: "MISSING", slot, seq, atUtc: this.options.startedAtUtc, detail: "missed before scheduler start; not backfilled" });
        return;
      }
      this.options.onEvent({ kind: "SCHEDULED", slot, seq, atUtc: this.options.startedAtUtc });
      this.handles.push(this.options.setTimer(slot, () => this.runSlot(slot, seq)));
    });
  }

  private async runSlot(slot: string, seq: number): Promise<void> {
    if (this.cancelled || this.attempted.has(slot)) return;
    if (this.stopped) {
      this.options.onEvent({ kind: "NOT_ATTEMPTED", slot, seq, atUtc: this.options.nowUtc(), detail: `session stopped: ${this.stopped}` });
      return;
    }
    this.attempted.add(slot);
    const outcome = await this.options.capture(slot, seq); // exactly one call; no retry
    const atUtc = this.options.nowUtc();
    if (outcome === "STORED") {
      this.options.onEvent({ kind: "CAPTURED", slot, seq, atUtc });
    } else if (outcome === "FAILED") {
      this.options.onEvent({ kind: "FAILED", slot, seq, atUtc });
    } else {
      this.stopped = outcome;
      this.options.onEvent({ kind: "STOPPED", slot, seq, atUtc, detail: outcome });
    }
  }

  cancel(): void {
    this.cancelled = true;
    for (const handle of this.handles) handle.cancel();
    this.handles = [];
  }
}

export interface PilotCap {
  scheduledSnapshots: number;
  websocketAuthorizedUrlRequests: number;
  websocketConnections: number;
  subscriptionMessages: number;
  automaticReconnects: number;
  restAlternativeRequests: number;
}

// Fixed cap for a no-retry, no-reconnect pilot. Incoming feed ticks are pushed
// messages, not client requests, and therefore are not counted as API requests.
export function oneSessionPilotCap(slotCount: number): PilotCap {
  if (!Number.isInteger(slotCount) || slotCount <= 0) throw new Error("slotCount must be a positive integer");
  return {
    scheduledSnapshots: slotCount,
    websocketAuthorizedUrlRequests: 1,
    websocketConnections: 1,
    subscriptionMessages: 1,
    automaticReconnects: 0,
    restAlternativeRequests: slotCount,
  };
}
