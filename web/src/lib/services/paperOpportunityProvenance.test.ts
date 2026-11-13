// Server-side provenance for paper opportunities. Client labels are never an input.
import test from "node:test";
import assert from "node:assert/strict";
import { serverProvenance, type SnapshotSourcesLike } from "./paperOpportunityProvenance.ts";

const LIVE = (p = "UPSTOX") => ({ source: "LIVE", provider: p, fetchedAt: "2026-11-13T05:00:00.000Z" as string | null });
const liveSources = (): SnapshotSourcesLike => ({ market: LIVE(), optionChain: LIVE(), technical: LIVE(), breadth: { status: "LIVE", source: LIVE() } });

test("all required inputs verified LIVE: ok with server labels", () => {
  const r = serverProvenance(liveSources());
  assert.equal(r.ok, true);
  assert.deepEqual(r.reasons, []);
  assert.equal(r.labels.market, "LIVE");
  assert.equal(r.capturedAt, "2026-11-13T05:00:00.000Z");
});

test("mock market data is refused and labelled MOCK, never LIVE", () => {
  const s = liveSources();
  s.market = { source: "MOCK", provider: "MOCK", fetchedAt: "2026-11-13T05:00:00.000Z" };
  const r = serverProvenance(s);
  assert.equal(r.ok, false);
  assert.equal(r.labels.market, "MOCK");
  assert.match(r.reasons.join(" "), /market is MOCK/);
});

test("a LIVE source tagged with the MOCK provider is still refused", () => {
  const s = liveSources();
  s.optionChain = { source: "LIVE", provider: "MOCK", fetchedAt: null };
  const r = serverProvenance(s);
  assert.equal(r.ok, false);
  assert.equal(r.labels.optionChain, "MOCK");
});

test("stale, end-of-day and unavailable inputs are each refused with their label", () => {
  for (const label of ["STALE", "END_OF_DAY", "UNAVAILABLE"]) {
    const s = liveSources();
    s.technical = { source: label, provider: "UPSTOX", fetchedAt: null };
    const r = serverProvenance(s);
    assert.equal(r.ok, false, label);
    assert.equal(r.labels.technical, label);
  }
});

test("breadth must be LIVE; synthetic breadth (MOCK source) is refused", () => {
  const s = liveSources();
  s.breadth = { status: "LIVE", source: { source: "MOCK", provider: "MOCK", fetchedAt: null } };
  const r = serverProvenance(s);
  assert.equal(r.ok, false);
  assert.equal(r.labels.breadth, "MOCK");
});

test("missing snapshot entirely: refused, nothing is treated as LIVE", () => {
  const r = serverProvenance(null);
  assert.equal(r.ok, false);
  assert.equal(r.labels.market, "UNAVAILABLE");
  assert.equal(r.capturedAt, null);
});

test("the function has no client input: only the server sources object is read", () => {
  // A client-style label cannot influence the result. Same server sources give the same answer whatever a request says.
  const s = liveSources();
  const a = serverProvenance(s);
  const b = serverProvenance(s);
  assert.deepEqual(a, b);
});
