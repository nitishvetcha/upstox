// Offline mock tests for the rate-limit test runner. No network. The sender is a mock function.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { plannedRequests, runRateLimitTest, HARD_CAP, candleFacts, shapeProblem, redactHeaders, remainingQuota, type SendResult, type Sender } from "./runner.ts";

const TOKEN = "TEST-ONLY-TOKEN-7c1e";
const NOW = () => "2026-11-12T06:00:00.000Z";
const noSleep = async () => {};
const newDir = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rlt-")), "out");

function okCandles(from: string, to: string, n = 3): SendResult {
  const candles = Array.from({ length: n }, (_, i) => [new Date(Date.parse(to + "T09:15:00+05:30") - i * 1800_000).toISOString(), 1, 2, 0.5, 1.5, 100, 1000]);
  const body = JSON.stringify({ status: "success", data: { candles } });
  return { status: 200, headers: { "content-type": "application/json", "x-ratelimit-remaining": "900" }, body };
}
function okList(): SendResult {
  return { status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "success", data: [] }) };
}

// Mock sender: answers each planned path from its own plan entry.
function mockSender(overrides: Record<number, () => SendResult | Promise<SendResult>> = {}, plan = plannedRequests()) {
  const calls: string[] = [];
  const headersSeen: Record<string, string>[] = [];
  const send: Sender = async (p, h) => {
    const idx = calls.length;
    calls.push(p);
    headersSeen.push(h);
    if (overrides[idx + 1]) return overrides[idx + 1]();
    const req = plan[idx];
    return req.kind === "candles" ? okCandles(req.from!, req.to!) : okList();
  };
  return { send, calls, headersSeen };
}

test("plan has exactly 35 requests in the specified block order", () => {
  const plan = plannedRequests();
  assert.equal(plan.length, HARD_CAP);
  const counts: Record<string, number> = {};
  for (const r of plan) counts[r.block] = (counts[r.block] ?? 0) + 1;
  assert.deepEqual(counts, { A: 6, B: 4, C: 20, D: 2, E: 2, F: 1 });
  assert.equal(plan.map((r) => r.block).join(""), "AAAAAABBBBCCCCCCCCCCCCCCCCCCCCDDEEF");
});

test("plan uses only the three sample keys and fixed windows (no discovery)", () => {
  const plan = plannedRequests();
  const keysUsed = new Set(plan.filter((r) => r.block !== "E" && r.block !== "F").map((r) => decodeURIComponent(r.path.split("/historical-candle/")[1]?.split("/")[0] ?? "")));
  assert.deepEqual([...keysUsed].sort(), ["BSE_FO|1134391|05-11-2026", "NSE_FO|40039|09-11-2026", "NSE_FO|49415|27-10-2026"].sort());
  assert.ok(plan.filter((r) => r.block === "A").map((r) => r.from).every(Boolean));
  assert.deepEqual(plan.filter((r) => r.block === "A").map((r) => r.to === "2026-11-09").every(Boolean), true);
});

test("block B covers the four intervals; block A covers six window lengths", () => {
  const plan = plannedRequests();
  assert.deepEqual(plan.filter((r) => r.block === "B").map((r) => r.interval), ["1minute", "5minute", "15minute", "day"]);
  assert.equal(new Set(plan.filter((r) => r.block === "A").map((r) => r.from)).size, 6);
});

test("runner refuses a plan that is not exactly 35 requests", async () => {
  const plan = [...plannedRequests(), plannedRequests()[0]];
  await assert.rejects(runRateLimitTest({ requests: plan, send: mockSender().send, token: TOKEN, sleep: noSleep, now: NOW, outDir: newDir(), tokenUsable: true }), /exactly 35/);
});

test("runner refuses to run without a usable token and sends nothing", async () => {
  const m = mockSender();
  await assert.rejects(runRateLimitTest({ requests: plannedRequests(), send: m.send, token: TOKEN, sleep: noSleep, now: NOW, outDir: newDir(), tokenUsable: false }), /token missing/);
  assert.equal(m.calls.length, 0);
});

test("runner refuses an existing output directory and sends nothing", async () => {
  const dir = newDir();
  fs.mkdirSync(dir, { recursive: true });
  const m = mockSender();
  await assert.rejects(runRateLimitTest({ requests: plannedRequests(), send: m.send, token: TOKEN, sleep: noSleep, now: NOW, outDir: dir, tokenUsable: true }), /exists/);
  assert.equal(m.calls.length, 0);
});

test("full mock run: exactly 35 sends, zero retries, pacing per block (C = 5 s, others 1 s)", async () => {
  const m = mockSender();
  const sleeps: number[] = [];
  const plan = plannedRequests();
  const s = await runRateLimitTest({ requests: plan, send: m.send, token: TOKEN, sleep: async (ms) => { sleeps.push(ms); }, now: NOW, outDir: newDir(), tokenUsable: true });
  assert.equal(m.calls.length, 35);
  assert.equal(s.requestsSent, 35);
  assert.equal(s.stopped, false);
  assert.equal(sleeps.length, 34);
  // sleeps[i-1] is the pause before request i (1-based), so compare with each request's own pacing
  plan.slice(1).forEach((r, i) => assert.equal(sleeps[i], r.pacingMs));
  assert.ok(plan.filter((r) => r.block === "C").every((r) => r.pacingMs === 5000));
  assert.ok(plan.filter((r) => r.block !== "C").every((r) => r.pacingMs === 1000));
});

test("a response containing the token is not persisted and the run stops", async () => {
  const dir = newDir();
  const m = mockSender({ 2: () => ({ status: 200, headers: {}, body: JSON.stringify({ status: "success", data: { candles: [], echo: TOKEN } }) }) });
  const s = await runRateLimitTest({ requests: plannedRequests(), send: m.send, token: TOKEN, sleep: noSleep, now: NOW, outDir: dir, tokenUsable: true });
  assert.equal(m.calls.length, 2);
  assert.match(s.stopReason!, /token value found/);
  assert.equal(fs.existsSync(path.join(dir, "02.body")), false);
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(dir)) assert.doesNotMatch(fs.readFileSync(f, "utf8"), new RegExp(TOKEN), f);
});

test("HTTP 401 stops the run at that request; no further sends", async () => {
  const m = mockSender({ 3: () => ({ status: 401, headers: {}, body: "{}" }) });
  const s = await runRateLimitTest({ requests: plannedRequests(), send: m.send, token: TOKEN, sleep: noSleep, now: NOW, outDir: newDir(), tokenUsable: true });
  assert.equal(m.calls.length, 3);
  assert.equal(s.stopped, true);
  assert.match(s.stopReason!, /401/);
});

test("HTTP 429 stops immediately, records retry-after, no retry", async () => {
  const m = mockSender({ 5: () => ({ status: 429, headers: { "retry-after": "60" }, body: "{}" }) });
  const s = await runRateLimitTest({ requests: plannedRequests(), send: m.send, token: TOKEN, sleep: noSleep, now: NOW, outDir: newDir(), tokenUsable: true });
  assert.equal(m.calls.length, 5, "no retry of request 5");
  assert.match(s.stopReason!, /429.*60/);
});

test("HTTP 500 stops the run", async () => {
  const m = mockSender({ 2: () => ({ status: 500, headers: {}, body: "" }) });
  const s = await runRateLimitTest({ requests: plannedRequests(), send: m.send, token: TOKEN, sleep: noSleep, now: NOW, outDir: newDir(), tokenUsable: true });
  assert.equal(m.calls.length, 2);
  assert.equal(s.stopped, true);
});

test("network failure stops the run and is recorded", async () => {
  const m = mockSender({ 4: () => { throw Object.assign(new Error("reset"), { name: "ECONNRESET" }); } });
  const s = await runRateLimitTest({ requests: plannedRequests(), send: m.send, token: TOKEN, sleep: noSleep, now: NOW, outDir: newDir(), tokenUsable: true });
  assert.equal(m.calls.length, 4);
  assert.match(s.stopReason!, /ECONNRESET/);
});

test("unexpected body shape (no status success) stops the run", async () => {
  const m = mockSender({ 1: () => ({ status: 200, headers: {}, body: JSON.stringify({ status: "error" }) }) });
  const s = await runRateLimitTest({ requests: plannedRequests(), send: m.send, token: TOKEN, sleep: noSleep, now: NOW, outDir: newDir(), tokenUsable: true });
  assert.equal(m.calls.length, 1);
  assert.match(s.stopReason!, /unexpected response/);
});

test("error code inside a 200 body stops the run", async () => {
  const m = mockSender({ 6: () => ({ status: 200, headers: {}, body: JSON.stringify({ status: "success", data: { candles: [] }, errors: [{ errorCode: "UDAPI1020" }] }) }) });
  const s = await runRateLimitTest({ requests: plannedRequests(), send: m.send, token: TOKEN, sleep: noSleep, now: NOW, outDir: newDir(), tokenUsable: true });
  assert.equal(m.calls.length, 6);
  assert.match(s.stopReason!, /UDAPI1020/);
});

test("quota header near exhaustion stops before the limit is reached (conservative)", async () => {
  const m = mockSender({ 7: () => ({ status: 200, headers: { "x-ratelimit-remaining": "8" }, body: JSON.stringify({ status: "success", data: { candles: [] } }) }) });
  const s = await runRateLimitTest({ requests: plannedRequests(), send: m.send, token: TOKEN, sleep: noSleep, now: NOW, outDir: newDir(), tokenUsable: true });
  assert.equal(m.calls.length, 7);
  assert.match(s.stopReason!, /nearly exhausted/);
});

test("token is sent only in the request header and never written to output", async () => {
  const dir = newDir();
  const m = mockSender({ 2: () => ({ status: 200, headers: { "set-cookie": "s=1", authorization: `Bearer ${TOKEN}`, "x-note": TOKEN }, body: JSON.stringify({ status: "success", data: { candles: [] } }) }) });
  await runRateLimitTest({ requests: plannedRequests(), send: m.send, token: TOKEN, sleep: noSleep, now: NOW, outDir: dir, tokenUsable: true });
  assert.ok(m.headersSeen.every((h) => h.Authorization === `Bearer ${TOKEN}`));
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(dir)) assert.doesNotMatch(fs.readFileSync(f, "utf8"), new RegExp(TOKEN), f);
});

test("candle facts use timestamps only, with no assumed bar count", () => {
  const body = { status: "success", data: { candles: [
    ["2026-11-09T09:15:00+05:30", 1, 1, 1, 1, 0, 0],
    ["2026-11-02T15:15:00+05:30", 1, 1, 1, 1, 0, 0],
    ["2026-11-05T11:00:00+05:30", 1, 1, 1, 1, 0, 0],
  ] } };
  const f = candleFacts(body, "2026-11-01");
  assert.equal(f!.count, 3);
  assert.equal(f!.firstTimestamp, "2026-11-02T15:15:00+05:30");
  assert.equal(f!.lastTimestamp, "2026-11-09T09:15:00+05:30");
  assert.equal(f!.reachesRequestedStart, false);
  assert.equal(candleFacts({ status: "success", data: { candles: [] } }, "2026-11-01")!.reachesRequestedStart, null);
});

test("shape check and redaction helpers", () => {
  const plan = plannedRequests();
  assert.equal(shapeProblem(plan[0], { status: "success", data: { candles: [] } }), null);
  assert.match(shapeProblem(plan[0], { status: "success", data: {} })!, /candles missing/);
  assert.deepEqual(redactHeaders({ Authorization: "x", "Set-Cookie": "y", "X-A": "1" }, "zzz"), { "x-a": "1" });
  assert.equal(remainingQuota({ "x-ratelimit-remaining": "42" }), 42);
  assert.equal(remainingQuota({ "content-type": "json" }), null);
});
