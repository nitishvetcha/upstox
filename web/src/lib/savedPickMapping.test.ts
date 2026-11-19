// Opportunity-card → saved pick mapping, provenance rules, and integration through the real saved-picks API (temp store).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pick-map-"));
const picksFile = path.join(tmp, "picks.json");
const journalDir = path.join(tmp, "recommendations");
process.env.SAVED_PICKS_FILE = picksFile;
process.env.RECOMMENDATION_STORE_DIR = journalDir;

const { pickFromStock, pickFromContract, stockProvenance, contractProvenance } = await import("./savedPickMapping.ts");
process.env.OPERATOR_TOKEN = "test-operator-token-0123456789abcdef";
const __TOKEN = process.env.OPERATOR_TOKEN;
function authed(r: Request): Request { const h = new Headers(r.headers); h.set("authorization", "Bearer " + __TOKEN); return new Request(r, { headers: h }); }
const { POST: __POST, GET: __GET } = await import("../app/api/saved-picks/route.ts");
const POST = (r: Request) => __POST(authed(r));
const GET = (r: Request = new Request("http://x/api/saved-picks")) => __GET(authed(r));

// A fully verified live stock card: every provenance field present and consistent.
const stockBase = {
  symbol: "RELIANCE", direction: "BULLISH" as const, entry: 2500, stop: 2450, target1: 2560, target2: 2600,
  source: "UPSTOX", freshness: "LIVE", exchangeTimestamp: "2026-11-09T10:15:00+05:30",
  fetchedAt: "2026-11-09T10:15:05+05:30", dataAgeSeconds: 5, provider: null,
};
// A fully verified live option card.
const contractBase = {
  underlying: "NIFTY", expiry: "2026-11-12", strike: 24500, optionType: "CE" as const, entry: 120, stop: 90, target1: 150, target2: 180,
  contractPriceQuality: "CONTRACT_PRICE_LIVE", ltpConsistent: true, lastTradeTime: "2026-11-09T10:14:58+05:30", snapshotSource: "LIVE",
};

const post = (body: unknown) => new Request("http://x/api/saved-picks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => { try { fs.unlinkSync(picksFile); } catch {} });

// ── Mapping ──────────────────────────────────────────────────────────────────

test("M-1 fully verified bullish stock maps to LONG, LIVE, both targets", () => {
  const p = pickFromStock(stockBase);
  assert.equal(p.direction, "LONG");
  assert.equal(p.instrumentType, "STOCK");
  assert.equal(p.source, "LIVE");
  assert.deepEqual(p.targets, [2560, 2600]);
});

test("M-2 bearish stock maps to SHORT", () => {
  assert.equal(pickFromStock({ ...stockBase, direction: "BEARISH" }).direction, "SHORT");
});

test("M-4 non-finite targets are dropped, non-finite entry becomes null", () => {
  const p = pickFromStock({ ...stockBase, target2: Number.NaN, entry: Number.POSITIVE_INFINITY });
  assert.deepEqual(p.targets, [2560]);
  assert.equal(p.entry, null);
});

test("M-5 option instrument label carries underlying, expiry, strike and type", () => {
  assert.equal(pickFromContract(contractBase).instrument, "NIFTY 2026-11-12 24500 CE");
});

test("M-6 bought premium is always LONG, and PE is described as a long put", () => {
  const put = pickFromContract({ ...contractBase, optionType: "PE" });
  assert.equal(put.direction, "LONG");
  assert.match(put.note ?? "", /long put/);
  assert.equal(pickFromContract(contractBase).instrumentType, "INDEX_OPTION");
});

test("M-8 mapping never sets validation, so a user save can never be VALIDATED", () => {
  for (const p of [pickFromStock(stockBase), pickFromContract(contractBase)]) assert.equal("validation" in p, false);
});

test("M-9 each saved note states the data provenance reason", () => {
  assert.match(pickFromStock(stockBase).note ?? "", /Data: LIVE \(Upstox quote/);
  assert.match(pickFromStock({ ...stockBase, freshness: "STALE" }).note ?? "", /Data: RESEARCH \(freshness "STALE"/);
});

test("M-10 multi-leg spreads are rejected by pickFromContract (single-leg only)", () => {
  assert.throws(
    () => pickFromContract({ ...contractBase, strategyType: "BEAR_PUT_SPREAD" }),
    /Multi-leg strategy BEAR_PUT_SPREAD is not supported/,
  );
  assert.throws(
    () => pickFromContract({ ...contractBase, strategyType: "BULL_CALL_SPREAD" }),
    /Multi-leg strategy BULL_CALL_SPREAD is not supported/,
  );
  assert.throws(
    () => pickFromContract({ ...contractBase, isMultiLeg: true }),
    /Multi-leg strategy spread is not supported/,
  );
  assert.throws(
    () => pickFromContract({ ...contractBase, legs: [{}, {}] }),
    /Multi-leg strategy spread is not supported/,
  );
});

// ── C. Provenance: conflicting metadata, stale quotes, mock data ─────────────

test("C-1 a stock UPSTOX tag alone is not LIVE: missing freshness, timestamps or age all fail closed", () => {
  assert.equal(stockProvenance({ ...stockBase, freshness: null }).source, "RESEARCH");
  assert.equal(stockProvenance({ ...stockBase, exchangeTimestamp: null }).source, "RESEARCH");
  assert.equal(stockProvenance({ ...stockBase, fetchedAt: null }).source, "RESEARCH");
  assert.equal(stockProvenance({ ...stockBase, dataAgeSeconds: null }).source, "RESEARCH");
});

test("C-2 conflicting stock metadata: UPSTOX tag but freshness STALE or AGING is RESEARCH", () => {
  assert.equal(stockProvenance({ ...stockBase, freshness: "STALE" }).source, "RESEARCH");
  assert.equal(stockProvenance({ ...stockBase, freshness: "MIXED" }).source, "RESEARCH");
});

test("C-3 conflicting stock metadata: LIVE freshness but a non-UPSTOX source is RESEARCH", () => {
  assert.equal(stockProvenance({ ...stockBase, source: "UNAVAILABLE" }).source, "RESEARCH");
  assert.equal(stockProvenance({ ...stockBase, source: null }).source, "RESEARCH");
});

test("C-4 mock data is never LIVE, even when tagged UPSTOX and fresh", () => {
  assert.equal(stockProvenance({ ...stockBase, provider: "MOCK" }).source, "RESEARCH");
  assert.equal(stockProvenance({ ...stockBase, source: "MOCK" }).source, "RESEARCH");
  assert.equal(stockProvenance({ ...stockBase, provider: "mock" }).source, "RESEARCH", "case-insensitive mock marker");
  assert.match(stockProvenance({ ...stockBase, provider: "MOCK" }).reason, /mock marker/);
});

test("C-5 option from a MOCK fallback snapshot is never LIVE, even with a LIVE-looking contract", () => {
  assert.equal(contractProvenance({ ...contractBase, snapshotSource: "MOCK" }).source, "RESEARCH");
  assert.match(contractProvenance({ ...contractBase, snapshotSource: "MOCK" }).reason, /MOCK \(fallback\)/);
});

test("C-6 option with a stale or aging last trade is RESEARCH", () => {
  assert.equal(contractProvenance({ ...contractBase, contractPriceQuality: "CONTRACT_PRICE_STALE" }).source, "RESEARCH");
  assert.equal(contractProvenance({ ...contractBase, contractPriceQuality: "CONTRACT_PRICE_AGING" }).source, "RESEARCH");
  assert.equal(contractProvenance({ ...contractBase, lastTradeTime: null }).source, "RESEARCH");
});

test("C-7 option with conflicting price evidence (LTP mismatch) is RESEARCH", () => {
  assert.equal(contractProvenance({ ...contractBase, contractPriceQuality: "CONTRACT_PRICE_MISMATCH" }).source, "RESEARCH");
  assert.equal(contractProvenance({ ...contractBase, ltpConsistent: false }).source, "RESEARCH");
  assert.equal(contractProvenance({ ...contractBase, ltpConsistent: null }).source, "RESEARCH");
});

test("C-8 a fully verified option is LIVE only when the snapshot itself is LIVE", () => {
  assert.equal(contractProvenance(contractBase).source, "LIVE");
  assert.equal(contractProvenance({ ...contractBase, snapshotSource: "STALE" }).source, "RESEARCH");
  assert.equal(contractProvenance({ ...contractBase, snapshotSource: undefined }).source, "RESEARCH");
});

test("C-9 data-source status does not change validation: every mapped pick stays NOT_VALIDATED", async () => {
  const res = await POST(post(pickFromStock(stockBase)));
  const { pick } = (await res.json()) as { pick: { validation: string; source: string } };
  assert.equal(pick.source, "LIVE");
  assert.equal(pick.validation, "NOT_VALIDATED", "LIVE data must not imply strategy validation");
});

// ── Integration: mapped cards through the real API ───────────────────────────

test("I-1 a live bullish stock card saves through the API as NOT VALIDATED", async () => {
  const res = await POST(post(pickFromStock(stockBase)));
  assert.equal(res.status, 201);
  const { pick } = (await res.json()) as { pick: { validation: string; source: string; statusLabel: string; direction: string } };
  assert.equal(pick.validation, "NOT_VALIDATED");
  assert.equal(pick.source, "LIVE");
  assert.equal(pick.direction, "LONG");
  assert.match(pick.statusLabel, /NOT VALIDATED/);
});

test("I-2 a bearish stock with its stop below entry is rejected by the API (422), nothing saved", async () => {
  const res = await POST(post(pickFromStock({ ...stockBase, direction: "BEARISH", stop: 2450, entry: 2500 })));
  assert.equal(res.status, 422);
  const list = (await (await GET()).json()) as { picks: unknown[] };
  assert.equal(list.picks.length, 0);
});

test("I-3 an option card from a MOCK snapshot saves as RESEARCH with its contract label", async () => {
  const res = await POST(post(pickFromContract({ ...contractBase, snapshotSource: "MOCK", contractPriceQuality: "MODEL_DERIVED" })));
  assert.equal(res.status, 201);
  const { pick } = (await res.json()) as { pick: { instrument: string; source: string; instrumentType: string } };
  assert.equal(pick.instrument, "NIFTY 2026-11-12 24500 CE");
  assert.equal(pick.source, "RESEARCH");
  assert.equal(pick.instrumentType, "INDEX_OPTION");
});

test("I-4 saving cards never writes to the recommendation journal directory", async () => {
  await POST(post(pickFromStock(stockBase)));
  await POST(post(pickFromContract(contractBase)));
  assert.equal(fs.existsSync(journalDir), false, "journal directory must not be created by saving picks");
});

test("I-5 both cards persist and list back in order", async () => {
  await POST(post(pickFromStock(stockBase)));
  await POST(post(pickFromContract(contractBase)));
  const list = (await (await GET()).json()) as { picks: Array<{ instrument: string }> };
  assert.deepEqual(list.picks.map((p) => p.instrument), ["RELIANCE", "NIFTY 2026-11-12 24500 CE"]);
});
