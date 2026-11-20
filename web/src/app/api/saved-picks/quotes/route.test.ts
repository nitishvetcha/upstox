import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "api-quotes-"));
process.env.SAVED_PICKS_FILE = path.join(tmp, "picks.json");
process.env.OPERATOR_TOKEN = "test-operator-token-0123456789abcdef";
const __TOKEN = process.env.OPERATOR_TOKEN;

function authed(r: Request): Request {
  const h = new Headers(r.headers);
  h.set("authorization", "Bearer " + __TOKEN);
  return new Request(r, { headers: h });
}

const { GET: __GET } = await import("./route.ts");
const { savePick } = await import("../../../../lib/savedPicks.ts");

const GET = (r: Request = new Request("http://x/api/saved-picks/quotes")) => __GET(authed(r));

beforeEach(() => {
  try {
    fs.unlinkSync(process.env.SAVED_PICKS_FILE!);
  } catch {}
});

test("QUOTES-1. unauthenticated request is refused with 401", async () => {
  const res = await __GET(new Request("http://x/api/saved-picks/quotes"));
  assert.equal(res.status, 401);
});

test("QUOTES-2. GET on empty picks file returns empty quotes object", async () => {
  const res = await GET();
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.deepEqual(json.quotes, {});
  assert.ok(json.refreshedAt);
});

test("QUOTES-3. GET returns quote structure for saved picks without crashing", async () => {
  savePick(process.env.SAVED_PICKS_FILE!, {
    instrument: "EICHERMOT",
    instrumentType: "STOCK",
    direction: "LONG",
    entry: 7904,
    stopLoss: 7633,
    targets: [8386],
    source: "RESEARCH",
  });

  const res = await GET();
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(typeof json.quotes === "object");
});
