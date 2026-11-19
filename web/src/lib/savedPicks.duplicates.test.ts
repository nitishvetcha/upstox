// Duplicate handling for saved picks: one identical card per IST day; a new day or changed levels are new picks.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pick-dup-"));
const file = path.join(tmp, "picks.json");
process.env.SAVED_PICKS_FILE = file;
const { savePick, loadPicks, istDay } = await import("./savedPicks.ts");
process.env.OPERATOR_TOKEN = "test-operator-token-0123456789abcdef";
function authed(r: Request): Request { const h = new Headers(r.headers); h.set("authorization", "Bearer " + process.env.OPERATOR_TOKEN); return new Request(r, { headers: h }); }
const { POST: __POST } = await import("../app/api/saved-picks/route.ts");
const POST = (r: Request) => __POST(authed(r));

const input = { instrument: "RELIANCE", instrumentType: "STOCK" as const, direction: "LONG" as const, entry: 2500, stopLoss: 2450, targets: [2560, 2600], source: "LIVE" as const };
const morning = new Date("2026-11-09T04:30:00Z"); // 10:00 IST, 9 Nov
const afternoon = new Date("2026-11-09T07:00:00Z"); // 12:30 IST, same day
const nextDay = new Date("2026-11-10T04:30:00Z"); // 10:00 IST, 10 Nov

beforeEach(() => { try { fs.unlinkSync(file); } catch {} });

test("D-1 the same card saved twice on the same IST day is refused and stored once", () => {
  assert.equal(savePick(file, input, morning).ok, true);
  const second = savePick(file, input, afternoon);
  assert.equal(second.ok, false);
  assert.ok("duplicate" in second && second.duplicate === true);
  assert.equal(loadPicks(file).length, 1);
});

test("D-2 the same card on the next IST day is a new pick", () => {
  savePick(file, input, morning);
  assert.equal(savePick(file, input, nextDay).ok, true);
  assert.equal(loadPicks(file).length, 2);
});

test("D-3 a changed entry price is a different pick, not a duplicate", () => {
  savePick(file, input, morning);
  assert.equal(savePick(file, { ...input, entry: 2510 }, afternoon).ok, true);
  assert.equal(loadPicks(file).length, 2);
});

test("D-4 duplicate detection is case-insensitive on the instrument symbol", () => {
  savePick(file, input, morning);
  assert.ok("duplicate" in savePick(file, { ...input, instrument: "reliance" }, afternoon));
});

test("D-5 the IST day boundary: 23:30 IST and 00:30 IST next day are different days", () => {
  assert.equal(istDay(new Date("2026-11-09T18:00:00Z")), "2026-11-09"); // 23:30 IST
  assert.equal(istDay(new Date("2026-11-09T19:00:00Z")), "2026-11-10"); // 00:30 IST
});

test("D-6 the API returns 409 with the existing pick for a same-day duplicate", async () => {
  const req = () => new Request("http://x/api/saved-picks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  assert.equal((await POST(req())).status, 201);
  const second = await POST(req());
  assert.equal(second.status, 409);
  const body = (await second.json()) as { error: string; existing: { instrument: string } };
  assert.match(body.error, /already saved today/);
  assert.equal(body.existing.instrument, "RELIANCE");
});
