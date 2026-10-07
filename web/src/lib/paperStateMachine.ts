import type { PaperTradeStatus } from "./paperTypes.ts";

const VALID_TRANSITIONS: Record<PaperTradeStatus, PaperTradeStatus[]> = {
  PENDING: ["OPEN", "REJECTED", "CANCELLED"],
  OPEN: ["TARGET_HIT", "STOPPED_OUT", "EXPIRED", "CLOSED"],
  TARGET_HIT: [],
  STOPPED_OUT: [],
  EXPIRED: [],
  CLOSED: [],
  CANCELLED: [],
  REJECTED: [],
};

export function canTransition(from: PaperTradeStatus, to: PaperTradeStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function validateTransition(from: PaperTradeStatus, to: PaperTradeStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid paper trade state transition: cannot transition from ${from} to ${to}`);
  }
}
