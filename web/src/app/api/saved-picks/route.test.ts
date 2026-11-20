// API access, persistence, source separation, validation labels, deletion and journal isolation through the route handlers.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "api-picks-"));
process.env.SAVED_PICKS_FILE = path.join(tmp, "picks.json");
process.env.OPERATOR_TOKEN = "test-operator-token-0123456789abcdef";
const __TOKEN = process.env.OPERATOR_TOKEN;
function authed(r: Request): Request { const h = new Headers(r.headers); h.set("authorization", "Bearer " + __TOKEN); return new Request(r, { headers: h }); }
const { GET: __GET, POST: __POST, DELETE: __DELETE } = await import("./route.ts");
const GET = (r: Request = new Request("http://x/api/saved-picks")) => __GET(authed(r));
const POST = (r: Request) => __POST(authed(r));
const DELETE = (r: Request) => __DELETE(authed(r));
const body = { instrument: "RELIANCE", instrumentType: "STOCK", direction: "LONG", entry: 100, stopLoss: 95, targets: [110], source: "RESEARCH" };
const req = (b: unknown) => new Request("http://x/api/saved-picks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
beforeEach(() => { try { fs.unlinkSync(process.env.SAVED_PICKS_FILE!); } catch {} });

test("API-1. GET on an empty store returns an empty list with a research note", async () => {
  const j = await (await GET()).json();
  assert.deepEqual(j.picks, []);
  assert.match(j.note, /Research records/);
});
test("API-2. POST saves, returns 201, and the record persists across GET", async () => {
  const r = await POST(req(body));
  assert.equal(r.status, 201);
  const j = await (await GET()).json();
  assert.equal(j.picks.length, 1); assert.equal(j.picks[0].instrument, "RELIANCE");
});
test("API-3. validation labels: default status NOT VALIDATED and never VALIDATED", async () => {
  const r = await POST(req(body)); const j = await r.json();
  assert.match(j.pick.statusLabel, /NOT VALIDATED/);
  const bad = await POST(req({ ...body, validation: "VALIDATED" }));
  assert.equal(bad.status, 422);
});
test("API-4. source separation: MOCK picks are labelled MOCK DATA", async () => {
  const j = await (await POST(req({ ...body, source: "MOCK" }))).json();
  assert.match(j.pick.statusLabel, /MOCK DATA/);
});
test("API-5. invalid input is rejected with 422 and details", async () => {
  const r = await POST(req({ ...body, direction: "LONG", stopLoss: 105 }));
  assert.equal(r.status, 422);
  const j = await r.json(); assert.ok(j.details.length > 0);
});
test("API-6. DELETE removes the named pick; unknown id returns 404; missing id returns 400", async () => {
  const j = await (await POST(req(body))).json();
  const d = await DELETE(new Request(`http://x/api/saved-picks?id=${j.pick.id}`, { method: "DELETE" }));
  assert.equal(d.status, 200);
  assert.equal((await DELETE(new Request("http://x/api/saved-picks?id=nope", { method: "DELETE" }))).status, 404);
  assert.equal((await DELETE(new Request("http://x/api/saved-picks", { method: "DELETE" }))).status, 400);
});
test("API-7. journal isolation: saving never writes under .data/recommendations", async () => {
  const before = fs.existsSync(path.join(process.cwd(), ".data", "recommendations")) ? fs.readdirSync(path.join(process.cwd(), ".data", "recommendations")).length : -1;
  await POST(req(body));
  const after = fs.existsSync(path.join(process.cwd(), ".data", "recommendations")) ? fs.readdirSync(path.join(process.cwd(), ".data", "recommendations")).length : -1;
  assert.equal(after, before);
  assert.ok(!process.env.SAVED_PICKS_FILE!.includes("recommendations"));
});
test("API-8. invalid JSON body returns 400", async () => {
  const r = await POST(new Request("http://x", { method: "POST", body: "{bad" }));
  assert.equal(r.status, 400);
});
test("API-9. DELETE with ?purgeCompleted=true purges completed intraday picks", async () => {
  // Save an old intraday pick directly to the test file
  const pastPick = {
    id: "old-intraday",
    savedAt: "2026-11-01T05:00:00.000Z",
    instrument: "EICHERMOT",
    instrumentType: "STOCK",
    direction: "LONG",
    entry: 7900,
    source: "LIVE",
    validation: "NOT_VALIDATED",
    note: "Saved from stock opportunity card",
  };
  fs.writeFileSync(process.env.SAVED_PICKS_FILE!, JSON.stringify([pastPick], null, 2));

  // Also add an active pick via POST
  await POST(req({ ...body, instrument: "NIFTY 2026-11-23 25600 CE", instrumentType: "INDEX_OPTION" }));

  const res = await DELETE(new Request("http://x/api/saved-picks?purgeCompleted=true", { method: "DELETE" }));
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.purged, true);
  assert.equal(j.removedCount, 1);
  assert.deepEqual(j.removedIds, ["old-intraday"]);

  // GET should now only return the active option
  const list = await (await GET()).json();
  assert.equal(list.picks.length, 1);
  assert.equal(list.picks[0].instrument, "NIFTY 2026-11-23 25600 CE");
  assert.equal(list.picks[0].isCompleted, false);
});

