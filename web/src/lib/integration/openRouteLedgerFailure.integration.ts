// Ledger persistence failure during opening, through the REAL route handler. Test data only.
// The write is forced to fail by pointing PAPER_TRADES_DIR under a regular file (mkdir fails). No production rule is changed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "open-ledger-fail-"));
const TOKEN = "integration-operator-token-0123456789abcdefghij";
process.env.OPERATOR_TOKEN = TOKEN;
process.env.PAPER_OPPORTUNITY_DIR = path.join(root, "opps");
process.env.PAPER_TRADES_DIR = path.join(root, "trades");
process.env.MARKET_DATA_PROVIDER = "mock";
process.env.ACCOUNT_CAPITAL = "388500";
process.env.MAX_CONCURRENT_POSITIONS = "10";
process.env.MAX_OPEN_RISK_PERCENT = "20";

const { POST } = await import("../../app/api/paper-opportunities/[id]/open/route.ts");
const { createPaperOpportunity } = await import("../services/paperOpportunityMonitor.ts");
const { savePaperOpportunity, getPaperOpportunity } = await import("../services/paperOpportunityStore.ts");
const { setOpenSnapshotProviderForTests } = await import("../services/paperOpenDeps.ts");
const { mockSnapshotTradeInputs } = await import("../testFixtures/mockSnapshotTradeInputs.ts");
const { getPaperTradingEngine } = await import("../services/paperStore.ts");

const FIXED_NOW = new Date("2026-10-05T07:00:00Z");
function liveFixture(index: "nifty" | "banknifty") {
  const s = mockSnapshotTradeInputs(index, FIXED_NOW) as unknown as Record<string, unknown>;
  const live = () => ({ source: "LIVE", provider: "UPSTOX", fetchedAt: FIXED_NOW.toISOString(), lastTradeTime: FIXED_NOW.toISOString() });
  const sources = s.sources as Record<string, unknown>;
  for (const k of Object.keys(sources)) sources[k] = live();
  if (s.breadth) (s.breadth as Record<string, unknown>).source = live();
  return s as never;
}

function makeOpp() {
  const opp = createPaperOpportunity({
    instrumentType: "OPTION", underlying: "NIFTY", symbol: null, optionType: "CE", strike: 22000,
    direction: "BULLISH", entry: 100, stop: 80, target1: 140, target2: 180,
  } as never);
  savePaperOpportunity(opp);
  return opp;
}

const call = (id: string) => POST(new Request(`http://localhost/api/paper-opportunities/${id}/open`, {
  method: "POST", headers: { Authorization: `Bearer ${TOKEN}` },
}), { params: Promise.resolve({ id }) });

test("ledger write failure: no false success, no opened link, no ledger entries, redacted logs; retry opens exactly once", async () => {
  // Engine created first with a writable ledger directory.
  const engine = getPaperTradingEngine();
  assert.equal(engine.getTrades().length, 0);
  const eventsBefore = engine.getEvents().length;

  setOpenSnapshotProviderForTests(async (index) => liveFixture(index as "nifty"), () => FIXED_NOW);
  const opp = makeOpp();

  // Force persistence to fail: the ledger directory cannot be created beneath a regular file.
  const blocker = path.join(root, "blocker");
  fs.writeFileSync(blocker, "not a directory");
  process.env.PAPER_TRADES_DIR = path.join(blocker, "trades");

  const logged: string[] = [];
  const spies = (["log", "warn", "error"] as const).map((m) => {
    const original = console[m];
    console[m] = (...args: unknown[]) => { logged.push(args.map(String).join(" ")); };
    return { m, original };
  });
  let res: Response;
  try {
    res = await call(opp.id);
  } finally {
    for (const s of spies) console[s.m] = s.original;
  }

  // No false success.
  const body = await res.json() as Record<string, unknown>;
  assert.notEqual(res.status, 201, "must not report success");
  assert.equal(body.status, "rejected");
  assert.equal(body.code, "ENGINE_REJECTED");
  assert.equal(body.tradeId, undefined, "no trade id returned");
  assert.deepEqual(body.reasons, ["LEDGER_WRITE_FAILED: the paper ledger could not be saved; no trade was opened"], "sanitized reason");
  assert.equal(body.reference, opp.id, "audit reference returned");
  const raw = JSON.stringify(body);
  assert.ok(!raw.includes(root), "no filesystem path in the response");
  assert.ok(!/ENOTDIR|EEXIST|mkdir|\.test-data|open-ledger-fail/.test(raw), "no exception internals in the response");

  // No partial or duplicate ledger entries in memory.
  assert.equal(engine.getTrades().length, 0, "trade rolled back in memory");
  assert.equal(engine.getEvents().length, eventsBefore, "no event left behind");

  // No inconsistent opportunity state: not linked to a trade; the attempt is recorded for audit.
  const after = getPaperOpportunity(opp.id);
  assert.ok(after);
  assert.ok(!after!.openedPaperTradeId, "opportunity is not marked opened");
  assert.equal(after!.lastOpenAttempt?.code, "ENGINE_REJECTED");

  // Redacted error logging: the failure is logged, and no secret appears.
  const joined = logged.join("\n");
  assert.match(joined, /paper_ledger_save_failed/);
  assert.match(joined, /ENOTDIR/, "full diagnostic stays in the redacted server log");
  assert.match(joined, /paper_open_rejected/);
  assert.ok(!joined.includes(TOKEN), "operator token never logged");

  // Nothing was written to disk under the failed directory.
  assert.equal(fs.existsSync(path.join(blocker, "trades")), false);

  // Restore a writable ledger; a retry opens exactly once and both files agree.
  process.env.PAPER_TRADES_DIR = path.join(root, "trades");
  const retry = await call(opp.id);
  const retryBody = await retry.json() as Record<string, unknown>;
  assert.equal(retry.status, 201, JSON.stringify(retryBody));
  assert.equal(getPaperTradingEngine().getTrades().length, 1, "exactly one trade after retry");
  const eventLines = fs.readFileSync(path.join(root, "trades", "events.jsonl"), "utf8").trim().split("\n");
  assert.equal(eventLines.length, getPaperTradingEngine().getEvents().length, "file and memory event counts agree");
  const savedTrades = JSON.parse(fs.readFileSync(path.join(root, "trades", "trades.json"), "utf8")) as unknown[];
  assert.equal(savedTrades.length, 1, "exactly one trade on disk");
});
