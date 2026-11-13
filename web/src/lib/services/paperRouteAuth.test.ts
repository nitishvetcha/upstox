// Route-level operator authorization for paper routes (defence in depth; the proxy also protects these paths).
// Calls the real handlers with no operator session. Each must refuse before touching any state.
import test from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "../../app/api/paper-opportunities/route.ts";
import { listPaperOpportunities } from "./paperOpportunityStore.ts";

const isRefused = (r: Response | null | undefined) => !!r && (r.status === 401 || r.status === 403);

test("GET paper-opportunities without an operator session is refused", async () => {
  const res = await GET(new Request("http://localhost/api/paper-opportunities"));
  assert.ok(isRefused(res), `expected 401/403, got ${res.status}`);
});

test("POST paper-opportunities without an operator session is refused and creates no record", async () => {
  const before = listPaperOpportunities().length;
  const res = await POST(new Request("http://localhost/api/paper-opportunities", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instrumentType: "OPTION", underlying: "NIFTY", optionType: "CE", strike: 22000, direction: "BULLISH", entry: 100, stop: 80, target1: 140 }),
  }));
  assert.ok(isRefused(res), `expected 401/403, got ${res.status}`);
  assert.equal(listPaperOpportunities().length, before, "no record written by an unauthorized request");
});

test("a forged bearer header is not accepted when no OPERATOR_TOKEN is configured", async () => {
  const res = await GET(new Request("http://localhost/api/paper-opportunities", { headers: { Authorization: "Bearer not-a-real-token" } }));
  assert.ok(isRefused(res));
});
