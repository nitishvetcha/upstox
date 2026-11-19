// Phase 9B Stage 2 tests. Mocks only: no network, no real clock, no credentials.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectSession, sessionSlots, parseQuotes, readManifest, type PairSpec, type FetchFn, type FetchResult } from "./collector.ts";

const INDICES = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX", "BANKEX"];
const PAIRS: PairSpec[] = INDICES.map((ix, i) => ({
  index: ix, expiry: "2026-11-17", strike: 25000 + i * 100, ce: `NSE_FO|CE${i}`, pe: `NSE_FO|PE${i}`,
}));
const RULES = { maxStaleSec: 900, maxSkewSec: 2 }; // illustrative test values only
const SLOTS = ["2026-11-12T03:45:00.000Z", "2026-11-12T03:50:00.000Z", "2026-11-12T03:55:00.000Z"];
const TOKEN = "TEST-ONLY-TOKEN-9f3a";

function body(slot: string, keys: string[]) {
  const data: Record<string, unknown> = {};
  for (const k of keys) {
    data[k] = {
      instrument_token: k, last_price: 100, last_trade_time: new Date(Date.parse(slot) - 60_000).toISOString(), oi: 5000, volume: 900,
      depth: {
        buy: Array.from({ length: 5 }, (_, i) => ({ price: 99 - i, quantity: 10 + i })),
        sell: Array.from({ length: 5 }, (_, i) => ({ price: 101 + i, quantity: 12 + i })),
      },
    };
  }
  return { status: "success", data };
}

function okFetch(slots: string[]): { fn: FetchFn; calls: number } {
  const state = { fn: null as unknown as FetchFn, calls: 0 };
  let i = 0;
  state.fn = async (keys) => {
    state.calls++;
    const slot = slots[i++];
    const b = body(slot, keys);
    return { status: 200, body: b, raw: JSON.stringify(b), retrievedAtUtc: new Date(Date.parse(slot) + 500).toISOString() } as FetchResult;
  };
  return state;
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "collector-"));

test("six indices with paired CE and PE legs are all parsed", () => {
  const legs = parseQuotes(body(SLOTS[0], PAIRS.flatMap((p) => [p.ce, p.pe])), PAIRS);
  assert.equal(legs.length, 12);
  assert.deepEqual([...new Set(legs.map((l) => l.index))].sort(), [...INDICES].sort());
  assert.equal(legs.filter((l) => l.optionType === "CE").length, 6);
  assert.equal(legs.filter((l) => l.optionType === "PE").length, 6);
  assert.equal(legs[0].bidDepth?.length, 5);
});

test("full session: every slot stored VALID, session INCLUDED when calendar is known", async () => {
  const dir = tmp();
  const m = okFetch(SLOTS);
  const s = await collectSession({ sessionDate: "2026-11-12", slots: SLOTS, pairs: PAIRS, dir, fetch: m.fn, calendarKnown: true, nowUtc: SLOTS[0], rules: RULES });
  assert.equal(m.calls, 3);
  assert.ok(s.rows.every((r) => r.status === "STORED" && r.verdict === "VALID"));
  assert.equal(s.evaluation.status, "INCLUDED");
});

test("unknown calendar holds the session even when every slot is valid", async () => {
  const dir = tmp();
  const m = okFetch(SLOTS);
  const s = await collectSession({ sessionDate: "2026-11-12", slots: SLOTS, pairs: PAIRS, dir, fetch: m.fn, calendarKnown: false, nowUtc: SLOTS[0], rules: RULES });
  assert.equal(s.evaluation.status, "HOLD");
});

test("restart resumes: resolved slots are not requested again", async () => {
  const dir = tmp();
  const first = okFetch(SLOTS.slice(0, 2));
  await collectSession({ sessionDate: "2026-11-12", slots: SLOTS.slice(0, 2), pairs: PAIRS, dir, fetch: first.fn, calendarKnown: true, nowUtc: SLOTS[0], rules: RULES });
  const second = okFetch([SLOTS[2]]);
  await collectSession({ sessionDate: "2026-11-12", slots: SLOTS, pairs: PAIRS, dir, fetch: second.fn, calendarKnown: true, nowUtc: SLOTS[2], rules: RULES });
  assert.equal(second.calls, 1, "only the new slot is requested after restart");
});

test("slots missed before restart are MISSING and never backfilled", async () => {
  const dir = tmp();
  const m = okFetch([SLOTS[2]]);
  const s = await collectSession({ sessionDate: "2026-11-12", slots: SLOTS, pairs: PAIRS, dir, fetch: m.fn, calendarKnown: true, nowUtc: SLOTS[2], rules: RULES });
  assert.equal(m.calls, 1, "no request for slots that are already past");
  assert.equal(s.rows.filter((r) => r.status === "MISSING").length, 2);
  assert.equal(s.evaluation.status, "EXCLUDED", "missing slots reduce coverage below 95%");
});

test("token expiry (401) stops the session and records TOKEN_EXPIRY", async () => {
  const dir = tmp();
  let calls = 0;
  const fn: FetchFn = async () => { calls++; return { status: 401, body: {}, raw: "{}", retrievedAtUtc: SLOTS[0] }; };
  const s = await collectSession({ sessionDate: "2026-11-12", slots: SLOTS, pairs: PAIRS, dir, fetch: fn, calendarKnown: true, nowUtc: SLOTS[0], rules: RULES });
  assert.equal(s.stopped, "TOKEN_EXPIRY");
  assert.equal(calls, 1, "no further requests after 401");
  assert.equal(s.rows.filter((r) => r.status === "NOT_ATTEMPTED").length, 2);
  assert.match(fs.readFileSync(path.join(dir, "failures.jsonl"), "utf8"), /TOKEN_EXPIRY/);
});

test("rate limit (429) stops the session and records RATE_LIMIT", async () => {
  const dir = tmp();
  const fn: FetchFn = async () => ({ status: 429, body: {}, raw: "{}", retrievedAtUtc: SLOTS[0] });
  const s = await collectSession({ sessionDate: "2026-11-12", slots: SLOTS, pairs: PAIRS, dir, fetch: fn, calendarKnown: true, nowUtc: SLOTS[0], rules: RULES });
  assert.equal(s.stopped, "RATE_LIMIT");
  assert.match(fs.readFileSync(path.join(dir, "failures.jsonl"), "utf8"), /RATE_LIMIT/);
});

test("HTTP 500 fails that slot only: one attempt per slot, no retry, next slot still attempted", async () => {
  const dir = tmp();
  let calls = 0;
  const fn: FetchFn = async (keys) => {
    calls++;
    if (calls === 1) return { status: 500, body: {}, raw: "{}", retrievedAtUtc: SLOTS[0] };
    const b = body(SLOTS[calls - 1], keys);
    return { status: 200, body: b, raw: JSON.stringify(b), retrievedAtUtc: SLOTS[calls - 1] };
  };
  const s = await collectSession({ sessionDate: "2026-11-12", slots: SLOTS, pairs: PAIRS, dir, fetch: fn, calendarKnown: true, nowUtc: SLOTS[0], rules: RULES });
  assert.equal(calls, 3, "exactly one attempt per slot");
  assert.equal(s.rows[0].status, "FAILED");
  assert.equal(s.rows[1].status, "STORED");
});

test("network error fails that slot and is recorded", async () => {
  const dir = tmp();
  let calls = 0;
  const fn: FetchFn = async (keys) => {
    calls++;
    if (calls === 1) throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    const b = body(SLOTS[calls - 1], keys);
    return { status: 200, body: b, raw: JSON.stringify(b), retrievedAtUtc: SLOTS[calls - 1] };
  };
  const s = await collectSession({ sessionDate: "2026-11-12", slots: SLOTS, pairs: PAIRS, dir, fetch: fn, calendarKnown: true, nowUtc: SLOTS[0], rules: RULES });
  assert.equal(s.rows[0].status, "FAILED");
  assert.match(fs.readFileSync(path.join(dir, "failures.jsonl"), "utf8"), /NETWORK/);
});

test("duplicate snapshot is refused by write-once and recorded, not overwritten", async () => {
  const dir = tmp();
  const snapDir = path.join(dir, "snapshots");
  fs.mkdirSync(snapDir, { recursive: true });
  const name = `2026-11-12_${SLOTS[0].replace(/:/g, "-")}_seq1.json`;
  fs.writeFileSync(path.join(snapDir, name), "ORIGINAL");
  const m = okFetch(SLOTS);
  const s = await collectSession({ sessionDate: "2026-11-12", slots: SLOTS, pairs: PAIRS, dir, fetch: m.fn, calendarKnown: true, nowUtc: SLOTS[0], rules: RULES });
  assert.equal(s.rows[0].status, "DUPLICATE");
  assert.equal(fs.readFileSync(path.join(snapDir, name), "utf8"), "ORIGINAL");
});

test("credential in response body is refused and nothing is stored for that slot", async () => {
  const dir = tmp();
  const fn: FetchFn = async () => ({ status: 200, body: {}, raw: `{"leak":"${TOKEN}"}`, retrievedAtUtc: SLOTS[0] });
  await assert.rejects(
    collectSession({ sessionDate: "2026-11-12", slots: SLOTS, pairs: PAIRS, dir, fetch: fn, calendarKnown: true, nowUtc: SLOTS[0], rules: RULES, accessToken: TOKEN }),
    /credential found/,
  );
  assert.equal(fs.existsSync(path.join(dir, "snapshots")), false);
});

test("no stored file contains the token", async () => {
  const dir = tmp();
  const m = okFetch(SLOTS);
  await collectSession({ sessionDate: "2026-11-12", slots: SLOTS, pairs: PAIRS, dir, fetch: m.fn, calendarKnown: true, nowUtc: SLOTS[0], rules: RULES, accessToken: TOKEN });
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(dir)) assert.doesNotMatch(fs.readFileSync(f, "utf8"), new RegExp(TOKEN));
});

test("manifest has one row per slot and survives re-reading", async () => {
  const dir = tmp();
  const m = okFetch(SLOTS);
  await collectSession({ sessionDate: "2026-11-12", slots: SLOTS, pairs: PAIRS, dir, fetch: m.fn, calendarKnown: true, nowUtc: SLOTS[0], rules: RULES });
  assert.equal(readManifest(path.join(dir, "manifest.jsonl")).length, 3);
});

test("session slots run 09:15 to 15:30 IST inclusive every 5 minutes (76 slots, first 03:45Z, last 10:00Z)", () => {
  const s = sessionSlots("2026-11-12");
  assert.equal(s.length, 76);
  assert.equal(s[0], "2026-11-12T03:45:00.000Z");
  assert.equal(s[s.length - 1], "2026-11-12T10:00:00.000Z");
});
