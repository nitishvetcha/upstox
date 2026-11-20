// Operator PIN: a 6-digit PIN for signing in to the analyzer. Stored only as a salted scrypt hash in a local file.
// Failed attempts are limited: 5 consecutive failures lock sign-in for 15 minutes. A success resets the counter.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const PIN_LENGTH = 6;
export const MAX_FAILURES = 5;
export const LOCK_MS = 15 * 60_000;

export interface PinRecord {
  v: 1;
  salt: string; // hex
  hash: string; // hex
  failures: number;
  lockedUntil: number | null; // epoch ms
}

export function pinFile(env: NodeJS.ProcessEnv = process.env): string {
  return env.OPERATOR_PIN_FILE ?? path.join(process.cwd(), ".data", "operator-pin.json");
}

export function isValidPinFormat(pin: unknown): pin is string {
  return typeof pin === "string" && new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

function derive(pin: string, saltHex: string): string {
  return crypto.scryptSync(pin, Buffer.from(saltHex, "hex"), 32).toString("hex");
}

function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

let memoryRecord: PinRecord | null = null;

export function readRecord(file = pinFile()): PinRecord | null {
  try {
    const r = JSON.parse(fs.readFileSync(file, "utf8")) as PinRecord;
    return r && r.v === 1 && typeof r.salt === "string" && typeof r.hash === "string" ? r : null;
  } catch {
    if (memoryRecord) return memoryRecord;
    const envPin = process.env.OPERATOR_PIN;
    if (envPin && isValidPinFormat(envPin)) {
      const rec = makeRecord(envPin);
      try {
        writeRecord(rec, file);
      } catch {
        // file write may fail on read-only cloud environments
      }
      memoryRecord = rec;
      return rec;
    }
    return null;
  }
}

// Changes only when the PIN is set or changed (a new salt). Sessions are bound to it, so a PIN change ends all of them
// in the same single write as the new PIN. Failed attempts and successful checks keep the salt, so they keep the value.
export function pinGeneration(file = pinFile()): string {
  const rec = readRecord(file);
  return rec ? crypto.createHash("sha256").update(rec.salt, "utf8").digest("hex").slice(0, 32) : "none";
}

function writeRecord(rec: PinRecord, file: string): void {
  memoryRecord = rec;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(rec), { mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch {
    // In-memory fallback if filesystem is read-only
  }
}

function makeRecord(pin: string): PinRecord {
  const salt = crypto.randomBytes(16).toString("hex");
  return { v: 1, salt, hash: derive(pin, salt), failures: 0, lockedUntil: null };
}

export type CheckResult =
  | { ok: true }
  | { ok: false; reason: "NOT_SET_UP" }
  | { ok: false; reason: "LOCKED"; retryAfterSec: number }
  | { ok: false; reason: "WRONG_PIN"; attemptsLeft: number };

// Verifies a PIN and updates the failure counter. Never reveals which part was wrong beyond the lock.
export function checkPin(pin: string, now = Date.now(), file = pinFile()): CheckResult {
  const rec = readRecord(file);
  if (!rec) return { ok: false, reason: "NOT_SET_UP" };
  if (rec.lockedUntil && rec.lockedUntil > now) {
    return { ok: false, reason: "LOCKED", retryAfterSec: Math.ceil((rec.lockedUntil - now) / 1000) };
  }
  if (isValidPinFormat(pin) && sameHex(derive(pin, rec.salt), rec.hash)) {
    writeRecord({ ...rec, failures: 0, lockedUntil: null }, file);
    return { ok: true };
  }
  const failures = (rec.lockedUntil && rec.lockedUntil <= now ? 0 : rec.failures) + 1;
  if (failures >= MAX_FAILURES) {
    writeRecord({ ...rec, failures: 0, lockedUntil: now + LOCK_MS }, file);
    return { ok: false, reason: "LOCKED", retryAfterSec: Math.ceil(LOCK_MS / 1000) };
  }
  writeRecord({ ...rec, failures, lockedUntil: null }, file);
  return { ok: false, reason: "WRONG_PIN", attemptsLeft: MAX_FAILURES - failures };
}

export type SetResult = { ok: true } | { ok: false; reason: "INVALID_FORMAT" | "WRONG_CURRENT" | "LOCKED"; retryAfterSec?: number };

// Changing the PIN needs the current PIN, so a signed-in browser alone cannot take over the gate.
export function changePin(current: string, next: string, now = Date.now(), file = pinFile()): SetResult {
  if (!isValidPinFormat(next)) return { ok: false, reason: "INVALID_FORMAT" };
  const c = checkPin(current, now, file);
  if (!c.ok) {
    if (c.reason === "LOCKED") return { ok: false, reason: "LOCKED", retryAfterSec: c.retryAfterSec };
    return { ok: false, reason: "WRONG_CURRENT" };
  }
  writeRecord(makeRecord(next), file);
  return { ok: true };
}

// First-time setup only. Refuses to overwrite an existing PIN; use changePin for that.
export function setupPin(pin: string, file = pinFile()): SetResult {
  if (!isValidPinFormat(pin)) return { ok: false, reason: "INVALID_FORMAT" };
  if (readRecord(file)) return { ok: false, reason: "WRONG_CURRENT" };
  writeRecord(makeRecord(pin), file);
  return { ok: true };
}
