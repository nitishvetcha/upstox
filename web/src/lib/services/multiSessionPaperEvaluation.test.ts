// Phase 2.3.16 Stage 2 — deterministic 12-scenario multi-session paper-evaluation harness.
//
// OFFLINE · SYNTHETIC · TEST-ONLY. Drives the existing options paper ledger across simulated trading sessions,
// process restarts and expiry settlement through its production wiring: getPaperTradingEngine() (allowMock: false,
// storage via PAPER_TRADES_DIR), paperLedgerStore, settlementIngestion, paperReport and transactionCosts.
// Nothing here is live-market evidence; every number comes from synthetic fixtures.
//
// Fixtures
//   Prices      the repository's deterministic mock chain (mock.ts: Black–Scholes, a pure function of the clock).
//   Sources     never hand-labelled: each snapshot is classified by the production tradeFreshnessOf() from a
//               synthetic exchange trade time, so 10:00 IST classifies LIVE and 15:45 IST END_OF_DAY exactly as Upstox
//               data would. provider is null: no fixture claims to come from Upstox.
//   Plans       Strategy 11.4 (unmodified) approves only the NIFTY Long Call in these fixtures. Every other position
//               reuses a plan verbatim from Strategy 11.4's own candidate list and is marked approved (SYNTHETIC
//               approval, as in paperTradingHardening.test.ts). No price, stop or target is written by hand.
//   Settlement  synthetic NSE F&O Bhavcopy CSVs, zipped in memory and ingested through ingestSettlementArchive().
//   Clock       every engine call receives an explicit instant. The file runs with TZ=America/Los_Angeles so no
//               result can come from the host happening to be in IST.
//
// Isolation (enforced, not assumed)
//   - every test gets its own mkdtemp root; PAPER_TRADES_DIR, UPSTOX_TOKEN_FILE and ACCOUNT_CAPITAL point into or
//     configure it and are restored afterwards; risk-limit env overrides are cleared so defaults apply;
//   - a write guard wraps every node:fs and node:fs/promises write API: a write outside the test's root throws;
//   - fetch is replaced by a guard that blocks every outbound request (S04 answers one with a synthetic HTTP 401);
//   - production .data/paper-trades, .data/settlement and .data/upstox-token.json are fingerprinted before/after.
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { getPaperTradingEngine } from "./paperStore.ts";
import { loadPaperLedger, paperLedgerDir, savePaperLedger } from "./paperLedgerStore.ts";
import { ingestSettlementArchive, listSettlementRecords } from "./settlementIngestion.ts";
import { DEFAULT_TRANSACTION_COSTS } from "./transactionCosts.ts";
import { DEFAULT_RISK_CONFIG, getRiskConfig } from "./risk/riskConfig.ts";
import { evaluateTradeRisk } from "./risk/riskService.ts";
import { loadToken, markTokenInvalid, saveToken, tokenStatus } from "./upstoxAuth.ts";
import { getSnapshot, withFallback, type FallbackDeps } from "./market.ts";
import { isOptionQuoteCanaryEnabled, isOptionQuoteLttEnabled, OPTION_QUOTE_LTT_ENABLED } from "./optionContractLTT.ts";
import { mockSnapshotTradeInputs as mockSnapshot } from "../testFixtures/mockSnapshotTradeInputs.ts";
import { analyze } from "../engine/strategy.ts";
import { buildPaperLedgerReport, reconcileLedger, REPORT_LABEL } from "../paperReport.ts";
import { calculateTradePnL, expiryInstant, istDay, r2, tradeCostsFor } from "../paperMath.ts";
import { canTransition } from "../paperStateMachine.ts";
import { STRATEGY_VERSION } from "../journalTypes.ts";
import { FROZEN_STRATEGY_VERSION } from "../strategyEvidenceEngine.ts";
import { marketStatus, tradeFreshnessOf } from "../time.ts";
import type { PaperTradingEngine } from "../paperEngine.ts";
import type { PaperTrade, PaperTradeStatus } from "../paperTypes.ts";
import type { Analysis, IndexId, Snapshot, SourceInfo, StrategyName } from "../types.ts";

// ── Fixture constants ─────────────────────────────────────────────────────────

// Configured account capital (ACCOUNT_CAPITAL). Every risk percentage and limit stays at DEFAULT_RISK_CONFIG.
const CAPITAL = 500_000;
const OPEN_RISK_CAP = CAPITAL * (DEFAULT_RISK_CONFIG.maxOpenRiskPercent / 100); // ₹15,000
const EXPIRY = "2026-10-27"; // NIFTY weekly and BANKNIFTY monthly expiry in the fixtures (a Tuesday)

// Three NSE sessions. Monday opens positions, Tuesday is expiry day, Wednesday evening the Bhavcopy is published.
const T = {
  s1Open: new Date("2026-10-26T04:30:00Z"), // Mon 10:00 IST
  s1Mid: new Date("2026-10-26T06:00:00Z"), // Mon 11:30 IST
  s1Last: new Date("2026-10-26T09:59:59Z"), // Mon 15:29:59 IST
  s1Eod: new Date("2026-10-26T10:15:00Z"), // Mon 15:45 IST, market closed
  s2Open: new Date("2026-10-27T03:50:00Z"), // Tue 09:20 IST
  s2Last: new Date("2026-10-27T09:59:59Z"), // Tue 15:29:59 IST
  s2Expiry: new Date("2026-10-27T10:00:00Z"), // Tue 15:30:00 IST = expiryInstant(EXPIRY)
  s2Eod: new Date("2026-10-27T10:30:00Z"), // Tue 16:00 IST
  s3Open: new Date("2026-10-28T04:00:00Z"), // Wed 09:30 IST
  s3Bhav: new Date("2026-10-28T12:30:00Z"), // Wed 18:00 IST, Bhavcopy published
  s4Open: new Date("2026-10-29T04:30:00Z"), // Thu 10:00 IST
};
const at = (base: Date, seconds: number) => new Date(base.getTime() + seconds * 1000);

// ── Isolation guards ──────────────────────────────────────────────────────────

type Fn = (...args: unknown[]) => unknown;
const guard = {
  roots: [] as string[], // realpaths of live test roots: the only places a write may land
  writes: [] as string[],
  violations: [] as string[],
  renameFault: null as string | null, // one-shot: the next rename into this directory fails like a crash
};
const unguard: (() => void)[] = [];

function checkTarget(op: string, target: unknown): void {
  const p = path.resolve(String(target));
  if (!guard.roots.some((r) => p === r || p.startsWith(r + path.sep))) {
    guard.violations.push(`${op} ${p}`);
    throw new Error(`TEST WRITE GUARD: ${op} outside isolated test storage: ${p}`);
  }
  guard.writes.push(`${op} ${p}`);
}

function wrap(obj: Record<string, unknown>, name: string, targets: number[], extra?: (args: unknown[]) => void): void {
  const orig = obj[name] as Fn;
  obj[name] = function (this: unknown, ...args: unknown[]) {
    for (const i of targets) checkTarget(name, args[i]);
    extra?.(args);
    return orig.apply(this, args);
  };
  unguard.push(() => { obj[name] = orig; });
}

function installWriteGuard(): void {
  const sync = fs as unknown as Record<string, unknown>;
  const prom = fsp as unknown as Record<string, unknown>;
  for (const n of ["writeFileSync", "appendFileSync", "mkdirSync", "rmSync", "unlinkSync", "rmdirSync"]) wrap(sync, n, [0]);
  wrap(sync, "copyFileSync", [0, 1]);
  wrap(sync, "renameSync", [0, 1], (args) => {
    if (guard.renameFault && path.resolve(String(args[1])).startsWith(guard.renameFault + path.sep)) {
      guard.renameFault = null;
      throw new Error("SIMULATED CRASH before the atomic rename");
    }
  });
  for (const n of ["writeFile", "appendFile", "mkdir", "rm", "unlink", "rmdir"]) wrap(prom, n, [0]);
  for (const n of ["copyFile", "rename"]) wrap(prom, n, [0, 1]);
  syncBuiltinESMExports(); // make `import * as fs` / `import { writeFile }` in production modules see the guard
}

const realFetch = globalThis.fetch;
const net = {
  calls: [] as { url: string; authorization: string | null }[],
  respond: null as ((url: string) => Response) | null, // null: every request is blocked
};

function installNetworkGuard(): void {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    net.calls.push({ url, authorization: new Headers(init?.headers).get("authorization") });
    if (!net.respond) throw new Error(`TEST NETWORK GUARD: outbound request blocked: ${url}`);
    return net.respond(url);
  }) as typeof fetch;
}

const PROD_DATA = path.join(process.cwd(), ".data");
const PROTECTED = ["paper-trades", "settlement", "upstox-token.json"];
const sha256 = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");

function fingerprint(p: string): Record<string, string> {
  if (!fs.existsSync(p)) return { [p]: "ABSENT" };
  if (fs.statSync(p).isFile()) return { [p]: sha256(fs.readFileSync(p)) };
  return Object.assign({ [p]: "DIR" }, ...fs.readdirSync(p).sort().map((f) => fingerprint(path.join(p, f))));
}
const productionFingerprint = () => Object.assign({}, ...PROTECTED.map((p) => fingerprint(path.join(PROD_DATA, p))));

const ENV_KEYS = [
  "PAPER_TRADES_DIR", "UPSTOX_TOKEN_FILE", "ACCOUNT_CAPITAL", "RISK_PER_TRADE_PERCENT", "MAX_DAILY_LOSS_PERCENT",
  "MAX_OPEN_RISK_PERCENT", "MAX_CONCURRENT_POSITIONS", "MARKET_DATA_PROVIDER", "TZ",
];
const savedEnv = new Map<string, string | undefined>();
function restoreEnv(keys: string[]): void {
  for (const k of keys) {
    const v = savedEnv.get(k);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const g = globalThis as unknown as { __upstoxPaperEngine?: PaperTradingEngine };

// ── Per-test harness ──────────────────────────────────────────────────────────

interface Harness { root: string; ledgerDir: string; settlementDir: string; tokenFile: string; allowedNetworkCalls: number }
let h: Harness;

// A process (re)start: the production singleton is discarded and rebuilt from disk by getPaperTradingEngine().
function startSession(): PaperTradingEngine {
  assert.equal(paperLedgerDir(), h.ledgerDir, "storage target must be verified before the engine can write");
  delete g.__upstoxPaperEngine;
  return getPaperTradingEngine();
}

// Synthetic snapshot at `now` (see header): mock prices; source labels from the production classifier.
function snapshotAt(index: IndexId, now: Date, exchangeTime = at(now, -5)): Snapshot {
  const s = structuredClone(mockSnapshot(index, now));
  const lastTradeTime = exchangeTime.toISOString();
  const info: SourceInfo = { source: tradeFreshnessOf(lastTradeTime, now).source, provider: null, fetchedAt: now.toISOString(), lastTradeTime };
  s.sources = { market: { ...info }, optionChain: { ...info }, technical: { ...info }, news: { ...info }, breadth: { ...info } };
  return s;
}

// The pre-change breadth shape (LIVE status, no reason) for analysis fixtures that predate the MOCK breadth label.
const legacyBreadth = (s: Snapshot): Snapshot => (s.breadth ? { ...s, breadth: { ...s.breadth, status: "LIVE", reason: null } } : s);

function bearishSnapshot(s: Snapshot): Snapshot {
  const c = structuredClone(s);
  if (c.indicators) {
    c.indicators.ema9 = c.spot * 0.98;
    c.indicators.ema21 = c.spot * 1.02;
    c.indicators.rsi = 35;
    c.indicators.macdHist = -15;
    (c.indicators as unknown as { supertrend: string }).supertrend = "BEARISH";
  }
  return c;
}

type LegRef = { strike: number; type: "CE" | "PE" };
const quoteOf = (s: Snapshot, leg: LegRef) => {
  const row = s.chain.find((r) => r.strike === leg.strike);
  assert.ok(row, `no chain row for strike ${leg.strike}`);
  return leg.type === "CE" ? row.call : row.put;
};
// Per-contract exchange trade times: each leg gets its own, independently of the others.
function withLegTimes(s: Snapshot, legs: [LegRef, string | null][]): Snapshot {
  const c = structuredClone(s);
  for (const [leg, ltt] of legs) quoteOf(c, leg).lastTradeTime = ltt;
  return c;
}

// Strategy 11.4's own decision, unmodified, asserted to be an approval.
function strategyApproval(index: IndexId, now: Date): Analysis {
  const a = analyze(snapshotAt(index, now), now);
  assert.equal(a.status, "TRADE", `Strategy 11.4 did not approve ${index} at ${now.toISOString()}`);
  return a;
}

// SYNTHETIC approval: a plan taken verbatim from Strategy 11.4's own candidates for this snapshot, marked approved.
function syntheticApproval(a: Analysis, strategy: StrategyName): Analysis {
  const plan = a.candidates.find((c) => c.strategy === strategy);
  assert.ok(plan, `Strategy 11.4 produced no ${strategy} candidate`);
  return { ...a, status: "TRADE", plan, blockers: [] };
}

function open(engine: PaperTradingEngine, a: Analysis, now: Date): PaperTrade {
  const r = engine.processRecommendation(a, now);
  assert.equal(r.created, true, `expected a position, got: ${r.reason}`);
  return r.trade!;
}

const json = <V>(v: V): V => JSON.parse(JSON.stringify(v)) as V;
const seq = (engine: PaperTradingEngine, id: string) => engine.getEvents(id).map((e) => e.event);
const ledgerFile = (f: string) => path.join(h.ledgerDir, f);
const readIf = (f: string) => (fs.existsSync(ledgerFile(f)) ? fs.readFileSync(ledgerFile(f), "utf8") : null);
const ledgerBytes = () => ({ trades: readIf("trades.json"), events: readIf("events.jsonl") });
const ACTIVE: PaperTradeStatus[] = ["OPEN", "PENDING", "SETTLEMENT_PENDING", "SETTLEMENT_UNVERIFIED"];
const reservedRisk = (trades: PaperTrade[]) => trades.filter((t) => ACTIVE.includes(t.status)).reduce((a, t) => a + t.riskAmount, 0);

// Disk equals memory, the ledger reloads without error, reconciliation finds nothing and no torn temp file exists.
function assertPersisted(engine: PaperTradingEngine) {
  const l = loadPaperLedger(h.ledgerDir);
  assert.equal(l.error, null);
  assert.equal(l.corruptEventLines, 0);
  assert.equal(l.recoveredFromBackup, false);
  assert.deepEqual(l.trades, json(engine.getTrades()));
  assert.deepEqual(l.events, json(engine.getEvents()));
  assert.deepEqual(reconcileLedger(l.trades, l.events).issues, []);
  assert.deepEqual(fs.readdirSync(h.ledgerDir).filter((f) => f.includes(".tmp-")), []);
  return l;
}

// ── Settlement fixtures ───────────────────────────────────────────────────────

interface BhavRow { symbol: string; expiry: string; strike: number; type: "CE" | "PE"; sttlm: string; instrument?: string }

function bhavcopyCsv(tradeDate: string, rows: BhavRow[]): string {
  const header = ["TradDt", "BizDt", "FinInstrmTp", "TckrSymb", "XpryDt", "StrkPric", "OptnTp", "SttlmPric", "ClsPric", "OpnIntrst"];
  const body = rows.map((r) => [tradeDate, tradeDate, r.instrument ?? "OPTIDX", r.symbol, r.expiry, r.strike.toFixed(2), r.type, r.sttlm, r.sttlm || "0", "1000"]);
  return [header, ...body].map((c) => c.join(",")).join("\r\n") + "\r\n";
}

// Minimal single-entry PKZIP (deflate) so the archive goes through the production extractor and hash chain.
function zipOne(name: string, text: string): Buffer {
  const data = Buffer.from(text, "utf8");
  const packed = zlib.deflateRawSync(data);
  const fname = Buffer.from(name, "utf8");
  const crc = zlib.crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(fname.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(fname.length, 28);
  const localPart = Buffer.concat([local, fname, packed]);
  const centralPart = Buffer.concat([central, fname]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralPart.length, 12); end.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, centralPart, end]);
}

function publishBhavcopy(tradeDate: string, rows: BhavRow[]) {
  const name = `BhavCopy_NSE_FO_0_0_0_${tradeDate.split("-").join("")}_F_0000.csv`;
  const csv = bhavcopyCsv(tradeDate, rows);
  const zip = zipOne(name, csv);
  const result = ingestSettlementArchive(zip, { storageDir: h.settlementDir, expectedTradeDate: tradeDate });
  return { result, zip, csv: Buffer.from(csv, "utf8"), name };
}

const legRows = (t: PaperTrade, prices: string[]): BhavRow[] =>
  t.legs.map((l, i) => ({ symbol: t.index.toUpperCase(), expiry: t.expiry, strike: l.strike, type: l.type, sttlm: prices[i]! }));
const contractKey = (t: PaperTrade, leg: LegRef) => `${t.expiry}|${t.index.toUpperCase()}|${t.expiry}|${leg.strike.toFixed(2)}|${leg.type}`;
const settleOpts = (now: Date) => ({ storageDir: h.settlementDir, now });

// NIFTY Bull Call Spread opened Monday 10:00 IST, carried through an overnight restart, and seen first after
// Tuesday's 15:30 IST close (END_OF_DAY data): it must move to SETTLEMENT_PENDING with nothing fabricated.
function expiredSpread(): { engine: PaperTradingEngine; id: string } {
  let engine = startSession();
  const t = open(engine, syntheticApproval(strategyApproval("nifty", T.s1Open), "Bull Call Spread"), T.s1Open);
  assert.equal(t.legs.length, 2);
  assert.equal(t.expiry, EXPIRY);
  engine = startSession();
  engine.evaluateOpenTrades(snapshotAt("nifty", T.s2Open), T.s2Open);
  engine.evaluateOpenTrades(snapshotAt("nifty", T.s2Expiry, T.s2Last), T.s2Expiry);
  assert.equal(engine.getTrade(t.id)?.status, "SETTLEMENT_PENDING");
  assert.deepEqual(seq(engine, t.id), ["PAPER_TRADE_OPENED", "PAPER_TRADE_SETTLEMENT_PENDING"]);
  return { engine, id: t.id };
}

let prodBefore: Record<string, string> = {};

describe("Phase 2.3.16 Stage 2 — deterministic multi-session paper evaluation (SYNTHETIC, offline)", { concurrency: 1 }, () => {
  before(() => {
    for (const k of ENV_KEYS) savedEnv.set(k, process.env[k]);
    // Preconditions this suite never changes: feature flags off, strategy frozen.
    assert.equal(isOptionQuoteLttEnabled(), false);
    assert.equal(isOptionQuoteCanaryEnabled(), false);
    assert.equal(OPTION_QUOTE_LTT_ENABLED, false);
    assert.equal(STRATEGY_VERSION.strategyVersion, "11.4-frozen");
    assert.equal(FROZEN_STRATEGY_VERSION, "11.4-frozen");
    prodBefore = productionFingerprint();
    process.env.TZ = "America/Los_Angeles";
    assert.notEqual(T.s1Open.getTimezoneOffset(), -330, "host zone must not be IST for this run");
    installWriteGuard();
    installNetworkGuard();
  });

  after(() => {
    for (const restore of unguard.splice(0).reverse()) restore();
    syncBuiltinESMExports();
    globalThis.fetch = realFetch;
    delete g.__upstoxPaperEngine;
    restoreEnv(ENV_KEYS);
    assert.deepEqual(productionFingerprint(), prodBefore, "production ledger, settlement store and token file are untouched");
    assert.equal(isOptionQuoteLttEnabled(), false);
    assert.equal(isOptionQuoteCanaryEnabled(), false);
  });

  beforeEach(() => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "mspe-")));
    guard.roots.push(root);
    h = { root, ledgerDir: path.join(root, "paper-trades"), settlementDir: path.join(root, "settlement"), tokenFile: path.join(root, "upstox-token.json"), allowedNetworkCalls: 0 };
    for (const k of ["RISK_PER_TRADE_PERCENT", "MAX_DAILY_LOSS_PERCENT", "MAX_OPEN_RISK_PERCENT", "MAX_CONCURRENT_POSITIONS"]) delete process.env[k];
    // Live-path scenarios (S04 mid-session expiry) stub fetch; the network gate needs the upstox provider to reach that stub.
    process.env.MARKET_DATA_PROVIDER = "upstox";
    process.env.PAPER_TRADES_DIR = h.ledgerDir;
    process.env.UPSTOX_TOKEN_FILE = h.tokenFile;
    process.env.ACCOUNT_CAPITAL = String(CAPITAL);
    delete g.__upstoxPaperEngine;
    net.calls = [];
    net.respond = null;
    guard.renameFault = null;
    // The production resolver now points into this test's root, never at .data/.
    assert.equal(paperLedgerDir(), h.ledgerDir);
    assert.ok(!h.ledgerDir.startsWith(PROD_DATA + path.sep));
    // Configured capital is the only setting supplied: every risk percentage and limit is the production default.
    assert.deepEqual(getRiskConfig(), { ...DEFAULT_RISK_CONFIG, accountCapital: CAPITAL });
  });

  afterEach(() => {
    delete g.__upstoxPaperEngine;
    const calls = net.calls.length;
    net.respond = null;
    guard.renameFault = null;
    restoreEnv(ENV_KEYS.filter((k) => k !== "TZ"));
    fs.rmSync(h.root, { recursive: true, force: true });
    guard.roots = guard.roots.filter((r) => r !== h.root);
    assert.equal(fs.existsSync(h.root), false, "temporary storage is removed");
    assert.deepEqual(guard.violations, [], "no write may land outside isolated storage");
    assert.equal(calls, h.allowedNetworkCalls, "unexpected outbound request");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Harness self-check — isolation is enforced, not assumed", () => {
    it("the ledger resolves into the test root only by injection; writes outside it and outbound requests are blocked", async () => {
      h.allowedNetworkCalls = 1;
      // Without PAPER_TRADES_DIR the production resolver would point at .data/paper-trades: injection is what isolates.
      delete process.env.PAPER_TRADES_DIR;
      assert.equal(paperLedgerDir(), path.join(PROD_DATA, "paper-trades"));
      process.env.PAPER_TRADES_DIR = h.ledgerDir;
      assert.equal(paperLedgerDir(), h.ledgerDir);

      // A harmless sentinel outside the test root (never a production path): every write API is stopped first.
      const outside = path.join(os.tmpdir(), `mspe-guard-sentinel-${process.pid}`);
      assert.throws(() => savePaperLedger([], [], outside), /TEST WRITE GUARD: mkdirSync outside isolated test storage/);
      assert.throws(() => fs.writeFileSync(path.join(outside, "x"), "x"), /TEST WRITE GUARD/);
      await assert.rejects(async () => fsp.writeFile(path.join(outside, "x"), "x"), /TEST WRITE GUARD/);
      assert.equal(fs.existsSync(outside), false);
      assert.equal(guard.violations.length, 3);
      guard.violations = [];

      // Outbound requests never leave the process (.invalid is a reserved, unroutable TLD).
      await assert.rejects(fetch("https://upstox-order-endpoint.invalid/v2/order/place"), /TEST NETWORK GUARD: outbound request blocked/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("S01 — Fresh startup and clean ledger", () => {
    it("starts empty without writing; the first position persists exactly one snapshot and one event", () => {
      // Initial state: no ledger directory at all.
      assert.equal(fs.existsSync(h.ledgerDir), false);
      const fresh = loadPaperLedger(h.ledgerDir);
      assert.deepEqual(
        { trades: fresh.trades, events: fresh.events, error: fresh.error, corrupt: fresh.corruptEventLines, backup: fresh.recoveredFromBackup },
        { trades: [], events: [], error: null, corrupt: 0, backup: false },
      );
      const engine = startSession();
      assert.deepEqual(engine.getPortfolioSummary(), {
        startingCapital: CAPITAL, currentCapital: CAPITAL, realizedPnL: 0, unrealizedPnL: 0, totalPnL: 0,
        openRisk: 0, usedRisk: 0, availableRisk: OPEN_RISK_CAP, openPositions: 0, closedTrades: 0,
        winningTrades: 0, losingTrades: 0, winRate: null, averageWin: null, averageLoss: null, maxDrawdown: null,
        grossPnL: 0, totalCosts: 0, profitFactor: null, expectancy: null,
      });
      assert.equal(fs.existsSync(h.ledgerDir), false, "startup must not write");

      // Input: Strategy 11.4's own approval of a NIFTY Long Call at Monday 10:00 IST.
      const a = strategyApproval("nifty", T.s1Open);
      assert.equal(a.plan?.strategy, "Long Call");
      const t = open(engine, a, T.s1Open);

      // Transition PENDING -> OPEN, filled on the executable side.
      assert.equal(t.status, "OPEN");
      assert.equal(t.executionMode, "PAPER");
      assert.equal(t.entryTimestamp, T.s1Open.toISOString());
      assert.equal(t.legs.length, 1);
      assert.equal(t.legs[0]!.entryFillSource, "ASK");
      assert.ok(t.legs[0]!.entryFillPrice > quoteOf(a.snapshot, t.legs[0]!).ask!, "spread and slippage are paid on entry");

      // Capital reservation within the production limits.
      assert.ok(t.riskAmount > 0 && t.riskAmount <= CAPITAL * (DEFAULT_RISK_CONFIG.riskPerTradePercent / 100));
      assert.ok(t.lots >= 1 && t.lots <= DEFAULT_RISK_CONFIG.maxLotsPerTrade);
      assert.equal(t.quantity, t.lots * t.lotSize);
      assert.ok(Math.abs(t.entryPrice) * t.quantity <= CAPITAL * (DEFAULT_RISK_CONFIG.maxPositionValuePercent / 100));
      const s = engine.getPortfolioSummary();
      assert.equal(s.openRisk, t.riskAmount);
      assert.equal(s.availableRisk, OPEN_RISK_CAP - t.riskAmount);
      assert.equal(s.openPositions, 1);

      // P&L: nothing realized; unrealized is minus the estimated round-trip costs at the entry marks.
      assert.equal(t.realizedPnL, null);
      const estCosts = tradeCostsFor(t.legs, t.quantity, (l) => l.currentPrice ?? l.entryFillPrice, DEFAULT_TRANSACTION_COSTS).totalCosts;
      assert.equal(t.unrealizedPnL, r2(-estCosts));
      assert.ok(t.unrealizedPnL! < 0);
      assert.equal(s.currentCapital, r2(CAPITAL + t.unrealizedPnL!));

      // Persisted ledger: one snapshot, one event line, no backup yet (first write), no temp files.
      assert.deepEqual(fs.readdirSync(h.ledgerDir).sort(), ["events.jsonl", "trades.json"]);
      assert.equal(readIf("events.jsonl")!.trim().split("\n").length, 1);
      assert.deepEqual(seq(engine, t.id), ["PAPER_TRADE_OPENED"]);
      const ev = engine.getEvents(t.id)[0]!;
      assert.equal(ev.price, t.entryPrice);
      assert.equal(ev.timestamp, T.s1Open.toISOString());
      assert.deepEqual(ev.details?.legs, json(t.legs));
      assertPersisted(engine);
    });

    it("refuses to start from an empty ledger when an event log exists without its snapshot (fail-closed)", () => {
      fs.mkdirSync(h.ledgerDir, { recursive: true });
      const orphan = { timestamp: T.s1Open.toISOString(), tradeId: "pt_orphan", event: "PAPER_TRADE_OPENED", marketDataTimestamp: null, price: 1, reason: "orphan" };
      fs.writeFileSync(ledgerFile("events.jsonl"), JSON.stringify(orphan) + "\n");
      const bytes = ledgerBytes();

      const engine = startSession();
      const r = engine.processRecommendation(strategyApproval("nifty", T.s1Open), T.s1Open);
      assert.equal(r.created, false);
      assert.match(r.reason, /^LEDGER_UNAVAILABLE: events\.jsonl exists but trades\.json is missing/);
      assert.deepEqual(engine.getTrades(), []);
      assert.deepEqual(ledgerBytes(), bytes, "the unreadable ledger is left untouched for inspection");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("S02 — Restart with existing open positions", () => {
    it("restarts preserve identity, entry prices, legs, reserved risk and marks; re-submitted signals cannot re-enter", () => {
      let engine = startSession();
      const a = strategyApproval("nifty", T.s1Open);
      const lc = open(engine, a, T.s1Open);
      const bcs = open(engine, syntheticApproval(a, "Bull Call Spread"), T.s1Open);
      engine.evaluateOpenTrades(snapshotAt("nifty", T.s1Mid), T.s1Mid); // mark-to-market at 11:30 IST
      const trades = json(engine.getTrades());
      const events = json(engine.getEvents());
      const summary = engine.getPortfolioSummary();
      assert.equal(summary.openRisk, lc.riskAmount + bcs.riskAmount);
      assertPersisted(engine);

      // Process restart: the engine is rebuilt from disk.
      engine = startSession();
      assert.deepEqual(json(engine.getTrades()), trades);
      assert.deepEqual(json(engine.getEvents()), events);
      for (const before of [lc, bcs]) {
        const after = engine.getTrade(before.id)!;
        assert.equal(after.status, "OPEN");
        assert.equal(after.entryPrice, before.entryPrice);
        assert.equal(after.riskAmount, before.riskAmount);
        assert.equal(after.quantity, before.quantity);
        assert.deepEqual(after.legs.map((l) => l.entryFillPrice), before.legs.map((l) => l.entryFillPrice));
      }
      assert.deepEqual(engine.getPortfolioSummary(), summary);

      // The same approved signals replayed after the restart are refused without any write.
      const bytes = ledgerBytes();
      const writes = guard.writes.length;
      for (const replay of [a, syntheticApproval(a, "Bull Call Spread")]) {
        const r = engine.processRecommendation(replay, T.s1Mid);
        assert.equal(r.created, false);
        assert.match(r.reason, /^DUPLICATE_TRADE_PREVENTED: nifty /);
      }
      assert.equal(guard.writes.length, writes);
      assert.deepEqual(ledgerBytes(), bytes);

      // Overnight restart; the next session revalues the carried positions.
      engine = startSession();
      engine.evaluateOpenTrades(snapshotAt("nifty", T.s2Open), T.s2Open);
      for (const t of engine.getTrades()) {
        assert.equal(t.status, "OPEN");
        assert.deepEqual(t.monitoring, { status: "OK", lastValidQuoteAt: T.s2Open.toISOString(), reason: null });
        assert.deepEqual(seq(engine, t.id), ["PAPER_TRADE_OPENED"]);
      }
      assert.equal(engine.getPortfolioSummary().openRisk, lc.riskAmount + bcs.riskAmount);
      assertPersisted(engine);
    });

    it("a corrupt snapshot is recovered from its backup with identities, entries and reservations intact", () => {
      let engine = startSession();
      const a = strategyApproval("nifty", T.s1Open);
      const lc = open(engine, a, T.s1Open); // write 1: trades.json = [LC]
      const bcs = open(engine, syntheticApproval(a, "Bull Call Spread"), T.s1Open); // write 2: .bak = [LC]
      engine.evaluateOpenTrades(snapshotAt("nifty", T.s1Mid), T.s1Mid); // write 3: .bak = both at entry marks
      const backup = JSON.parse(fs.readFileSync(ledgerFile("trades.json.bak"), "utf8")) as PaperTrade[];
      fs.writeFileSync(ledgerFile("trades.json"), "{ torn write");

      const l = loadPaperLedger(h.ledgerDir);
      assert.equal(l.error, null);
      assert.equal(l.recoveredFromBackup, true);
      assert.deepEqual(l.trades, backup);
      engine = startSession();
      for (const before of [lc, bcs]) {
        const after = engine.getTrade(before.id)!;
        assert.equal(after.status, "OPEN");
        assert.equal(after.entryPrice, before.entryPrice);
        assert.equal(after.riskAmount, before.riskAmount);
        assert.deepEqual(after.legs.map((l) => l.entryFillPrice), before.legs.map((l) => l.entryFillPrice));
      }
      // Known limit: the 11:30 mark is lost (the backup holds entry-time marks); identity and reservation are not.
      assert.equal(engine.getPortfolioSummary().openRisk, lc.riskAmount + bcs.riskAmount);
      assert.equal(readIf("trades.json"), "{ torn write", "startup does not overwrite the unreadable file");
      assert.match(engine.processRecommendation(a, T.s1Mid).reason, /^DUPLICATE_TRADE_PREVENTED/);
    });

    it("a backup that lags the event log blocks the ledger instead of dropping a position", () => {
      const engine = startSession();
      const a = strategyApproval("nifty", T.s1Open);
      open(engine, a, T.s1Open); // write 1
      const bcs = open(engine, syntheticApproval(a, "Bull Call Spread"), T.s1Open); // write 2: .bak = [LC] only
      fs.writeFileSync(ledgerFile("trades.json"), "{ torn write");
      const bytes = ledgerBytes();

      assert.equal(loadPaperLedger(h.ledgerDir).error, `event references trade ${bcs.id} absent from trades.json`);
      const restarted = startSession();
      const r = restarted.processRecommendation(a, T.s1Mid);
      assert.equal(r.created, false);
      assert.match(r.reason, /^LEDGER_UNAVAILABLE: event references trade/);
      assert.deepEqual(ledgerBytes(), bytes);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("S03 — Duplicate event protection", () => {
    it("the same approved signal, retried, delayed and replayed after a restart, opens exactly one position", () => {
      let engine = startSession();
      const a = strategyApproval("nifty", T.s1Open);
      const t = open(engine, a, T.s1Open);
      const bytes = ledgerBytes();
      const writes = guard.writes.length;

      const attempts: [Analysis, Date][] = [
        [a, T.s1Open], // immediate retry
        [a, T.s1Open], // second retry in the same cycle
        [strategyApproval("nifty", at(T.s1Open, 360)), at(T.s1Open, 360)], // the same signal six minutes later
      ];
      for (const [x, when] of attempts) {
        const r = engine.processRecommendation(x, when);
        assert.equal(r.created, false);
        assert.equal(r.reason, `DUPLICATE_TRADE_PREVENTED: nifty Long Call position ${t.id} is already active`);
      }
      engine = startSession();
      assert.equal(engine.processRecommendation(a, T.s1Mid).created, false, "a restart does not reset the guard");

      assert.equal(engine.getTrades().length, 1);
      assert.deepEqual(seq(engine, t.id), ["PAPER_TRADE_OPENED"]);
      assert.equal(guard.writes.length, writes, "refused attempts write nothing");
      assert.deepEqual(ledgerBytes(), bytes);
      assert.equal(engine.getPortfolioSummary().openRisk, t.riskAmount);
      assertPersisted(engine);
    });

    it("duplicated events are refused on write, detected on load and flagged by reconciliation", () => {
      const engine = startSession();
      const t = open(engine, strategyApproval("nifty", T.s1Open), T.s1Open);
      const trades = json(engine.getTrades());
      const events = json(engine.getEvents());
      const bytes = ledgerBytes();

      // Saving the same ledger again appends nothing: the event log is not duplicated by retries.
      savePaperLedger(trades, events, h.ledgerDir);
      savePaperLedger(trades, events, h.ledgerDir);
      assert.equal(readIf("events.jsonl"), bytes.events);

      // A duplicated event in memory, or a divergent history, is refused before anything is written.
      assert.throws(() => savePaperLedger(trades, [...events, events[0]!], h.ledgerDir), /does not have exactly one open event/);
      assert.throws(() => savePaperLedger(trades, [{ ...events[0]!, reason: "rewritten" }], h.ledgerDir), /does not match the expected ledger event sequence/);
      assert.equal(readIf("events.jsonl"), bytes.events);

      // Reconciliation reports the duplicate; it is not forced to pass.
      const rec = reconcileLedger(trades, [...events, events[0]!]);
      assert.equal(rec.ok, false);
      assert.deepEqual(rec.issues.map((i) => [i.code, i.tradeId]), [["DUPLICATE_OPEN_EVENT", t.id]]);

      // A duplicated line on disk (a replayed append) blocks the ledger on the next start; files stay untouched.
      fs.appendFileSync(ledgerFile("events.jsonl"), JSON.stringify(events[0]) + "\n");
      const dup = ledgerBytes();
      assert.equal(loadPaperLedger(h.ledgerDir).error, `trade ${t.id} does not have exactly one open event`);
      const restarted = startSession();
      assert.match(restarted.processRecommendation(strategyApproval("nifty", T.s1Mid), T.s1Mid).reason, /^LEDGER_UNAVAILABLE: trade .* does not have exactly one open event$/);
      assert.deepEqual(ledgerBytes(), dup);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("S04 — Mid-session authentication expiry", () => {
    it("a 401 invalidates the session; fallback data neither opens nor revalues positions; re-login resumes", async () => {
      h.allowedNetworkCalls = 1;
      let expiredCalls = 0;
      // The production auth guard bound to this test's token file (nothing touches the real token or login endpoint).
      const authAt = (now: Date): FallbackDeps => ({
        mode: "upstox",
        now: () => now,
        getToken: async () => (await loadToken(now, h.tokenFile))?.accessToken ?? null,
        onAuthExpired: async () => { expiredCalls++; await markTokenInvalid(now, h.tokenFile); },
        tokenStatus: async () => (await tokenStatus(now, h.tokenFile)).status,
      });
      await saveToken({ provider: "upstox", accessToken: "SYNTHETIC-TEST-TOKEN-NOT-REAL", userId: null, userName: null, issuedAt: "2026-10-26T03:40:00.000Z", expiresAt: "2026-10-26T22:00:00.000Z" }, h.tokenFile);
      assert.equal((await tokenStatus(T.s1Open, h.tokenFile)).status, "CONFIGURED_UNVERIFIED");

      // 10:00 IST: a position opened while the session is valid.
      const engine = startSession();
      const t = open(engine, strategyApproval("nifty", T.s1Open), T.s1Open);
      const verified = { currentPrice: t.currentPrice, unrealizedPnL: t.unrealizedPnL, lastValidQuoteAt: t.monitoring?.lastValidQuoteAt };

      // 11:00 IST: Upstox rejects the token on a market-data request (synthetic HTTP 401).
      const t401 = new Date("2026-10-26T05:30:00Z");
      net.respond = () => new Response(JSON.stringify({ status: "error", errors: [{ errorCode: "UDAPI100050", message: "Invalid token used to access API" }] }), { status: 401, headers: { "content-type": "application/json" } });
      const r401 = await withFallback((p) => p.getMarketSnapshot("nifty"), authAt(t401));
      net.respond = null; // any further request would now throw
      assert.equal(r401.fallbackReason, "UPSTOX_AUTH_EXPIRED");
      assert.equal(r401.data.source.source, "MOCK");
      assert.equal(expiredCalls, 1);
      assert.equal(net.calls.length, 1);
      assert.match(net.calls[0]!.url, /^https:\/\/api\.upstox\.com\/v2\/market-quote\/quotes\?/);
      assert.equal(net.calls[0]!.authorization, "Bearer SYNTHETIC-TEST-TOKEN-NOT-REAL");
      assert.equal((await tokenStatus(t401, h.tokenFile)).status, "INVALID");
      assert.equal(await loadToken(t401, h.tokenFile), null);

      // 11:05 IST: the next snapshot falls back to simulated data without touching the network.
      const t1105 = new Date("2026-10-26T05:35:00Z");
      const fb = await getSnapshot("nifty", authAt(t1105), t1105);
      assert.equal(fb.fallbackReason, "UPSTOX_AUTH_EXPIRED");
      assert.deepEqual(Object.values(fb.sources).map((x) => x.source), ["MOCK", "MOCK", "MOCK", "MOCK", "MOCK"]);
      assert.equal(net.calls.length, 1);

      // Fallback data cannot open a position, even presented as an approved recommendation.
      const entry = engine.processRecommendation(syntheticApproval(analyze(legacyBreadth(fb), t1105), "Bull Call Spread"), t1105);
      assert.deepEqual(entry, { created: false, trade: null, reason: "FRESHNESS_BLOCKED: Market data source is MOCK" });

      // Nor revalue or exit one: fallback prices are set far through the stop, and must be ignored.
      const hostile = structuredClone(fb);
      for (const row of hostile.chain) row.call = { ...row.call, ltp: 0.05, bid: 0.05, ask: 0.05 };
      engine.evaluateOpenTrades(hostile, t1105);
      engine.evaluateOpenTrades(hostile, at(t1105, 300));
      const frozen = engine.getTrade(t.id)!;
      assert.equal(frozen.status, "OPEN");
      assert.equal(frozen.currentPrice, verified.currentPrice);
      assert.equal(frozen.unrealizedPnL, verified.unrealizedPnL);
      assert.deepEqual(frozen.monitoring, { status: "STALE_QUOTES", lastValidQuoteAt: verified.lastValidQuoteAt, reason: "source not trusted (market MOCK, option chain MOCK)" });
      assert.deepEqual(seq(engine, t.id), ["PAPER_TRADE_OPENED", "PAPER_QUOTE_UNAVAILABLE"], "one event per outage, not per cycle");
      assert.equal(engine.getPortfolioSummary().openRisk, t.riskAmount);
      assert.equal(engine.getPortfolioSummary().realizedPnL, 0);
      assertPersisted(engine);

      // 11:30 IST recovery: the user logs in again and trusted data resumes revaluation.
      await saveToken({ provider: "upstox", accessToken: "SYNTHETIC-TEST-TOKEN-2-NOT-REAL", userId: null, userName: null, issuedAt: T.s1Mid.toISOString(), expiresAt: "2026-10-26T22:00:00.000Z" }, h.tokenFile);
      assert.equal(await authAt(T.s1Mid).getToken(), "SYNTHETIC-TEST-TOKEN-2-NOT-REAL");
      const live = snapshotAt("nifty", T.s1Mid);
      engine.evaluateOpenTrades(live, T.s1Mid);
      const resumed = engine.getTrade(t.id)!;
      assert.deepEqual(resumed.monitoring, { status: "OK", lastValidQuoteAt: T.s1Mid.toISOString(), reason: null });
      assert.equal(resumed.currentPrice, quoteOf(live, resumed.legs[0]!).bid);
      assert.deepEqual(seq(engine, t.id), ["PAPER_TRADE_OPENED", "PAPER_QUOTE_UNAVAILABLE"]);
      assertPersisted(engine);
      assert.equal(net.calls.length, 1, "no login, token or market request beyond the one synthetic 401");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("S05 — Missing or stale option quotes (per-leg contract timestamps)", () => {
    it("each leg's exchange trade time is checked independently at entry and on every revaluation cycle", () => {
      assert.equal(isOptionQuoteLttEnabled(), false, "the optional live LTT feature stays off; timestamps are fixture data");
      const engine = startSession();
      const approved = syntheticApproval(strategyApproval("nifty", T.s1Open), "Bull Call Spread");
      assert.equal(approved.plan!.legs.length, 2);
      const buy = approved.plan!.legs[0]!;
      const sell = approved.plan!.legs[1]!;
      assert.deepEqual([buy.side, sell.side], ["BUY", "SELL"]);
      const ago = (now: Date, s: number) => at(now, -s).toISOString();
      const variant = (b: string | null, s: string | null): Analysis => ({ ...approved, snapshot: withLegTimes(approved.snapshot, [[buy, b], [sell, s]]) });

      // Entry: one bad leg blocks the position and names that contract, whichever leg it is.
      const o = T.s1Open;
      const entryCases: [string | null, string | null, string][] = [
        [ago(o, 5), ago(o, 600), `Contract ${sell.strike} CE quote is STALE`],
        [ago(o, 600), ago(o, 5), `Contract ${buy.strike} CE quote is STALE`],
        [ago(o, 5), null, `Contract ${sell.strike} CE quote has no exchange trade timestamp`],
        [ago(o, 5), ago(o, 60), `Contract ${sell.strike} CE quote is AGING`],
        [ago(o, 5), at(o, 10).toISOString(), `Contract ${sell.strike} CE quote is STALE`], // >5 s in the future
      ];
      for (const [b, s, reason] of entryCases) {
        assert.deepEqual(engine.processRecommendation(variant(b, s), o), { created: false, trade: null, reason: `FRESHNESS_BLOCKED: ${reason}` });
      }
      assert.deepEqual(engine.getTrades(), []);
      assert.equal(fs.existsSync(h.ledgerDir), false, "refused entries write nothing");

      const t = open(engine, variant(ago(o, 5), ago(o, 5)), o);
      const verified = { currentPrice: t.currentPrice, unrealizedPnL: t.unrealizedPnL };

      // Revaluation cycles: a fresh snapshot with fresh per-leg times, then one defect per cycle.
      const cycle = (now: Date, edit: (s: Snapshot) => void) => {
        const s = withLegTimes(snapshotAt("nifty", now), [[buy, ago(now, 5)], [sell, ago(now, 5)]]);
        edit(s);
        engine.evaluateOpenTrades(s, now);
        return { s, t: engine.getTrade(t.id)! };
      };
      const c1030 = new Date("2026-10-26T05:00:00Z");
      const defects: [Date, (s: Snapshot) => void, string][] = [
        // Stale short leg while both prices are set far through the stop: no stop decision on untrusted data.
        [c1030, (s) => { quoteOf(s, sell).lastTradeTime = ago(c1030, 600); Object.assign(quoteOf(s, buy), { ltp: 0.05, bid: 0.05, ask: 0.05 }); Object.assign(quoteOf(s, sell), { ltp: 0.05, bid: 0.05, ask: 0.05 }); }, "untrusted STALE quote on one or more legs"],
        [at(c1030, 300), (s) => { Object.assign(quoteOf(s, sell), { ltp: 0, bid: null, ask: null }); }, "missing or zero quote on one or more legs"],
        [at(c1030, 600), (s) => { quoteOf(s, buy).bid = null; }, "missing executable bid on long option leg"],
        [at(c1030, 900), (s) => { quoteOf(s, sell).ask = null; }, "missing executable ask on short option leg"],
        [at(c1030, 1200), (s) => { quoteOf(s, buy).lastTradeTime = null; }, "missing exchange trade timestamp on one or more legs"],
      ];
      for (const [now, edit, reason] of defects) {
        const { t: x } = cycle(now, edit);
        assert.equal(x.status, "OPEN");
        assert.equal(x.currentPrice, verified.currentPrice);
        assert.equal(x.unrealizedPnL, verified.unrealizedPnL);
        assert.deepEqual(x.monitoring, { status: "STALE_QUOTES", lastValidQuoteAt: o.toISOString(), reason });
        assert.equal(engine.getPortfolioSummary().openRisk, t.riskAmount);
      }

      // Recovery: both legs fresh and executable -> revalued on the conservative side (long at bid, short at ask).
      const { s, t: ok } = cycle(at(c1030, 1500), () => {});
      assert.deepEqual(ok.monitoring, { status: "OK", lastValidQuoteAt: at(c1030, 1500).toISOString(), reason: null });
      assert.equal(ok.currentPrice, r2(quoteOf(s, buy).bid! - quoteOf(s, sell).ask!));
      assert.equal(ok.realizedPnL, null);
      assert.deepEqual(seq(engine, t.id), ["PAPER_TRADE_OPENED", "PAPER_QUOTE_UNAVAILABLE"]);
      assertPersisted(engine);
      assert.equal(isOptionQuoteLttEnabled(), false);
      assert.equal(OPTION_QUOTE_LTT_ENABLED, false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("S06 — Market close and end-of-day transition", () => {
    it("after the close nothing opens or revalues; the position carries overnight and expires into SETTLEMENT_PENDING at 15:30 IST", () => {
      let engine = startSession();
      const approval = strategyApproval("nifty", T.s1Open);
      const t = open(engine, approval, T.s1Open);

      // 15:29:59 IST Monday: still in session, revalued normally.
      engine.evaluateOpenTrades(snapshotAt("nifty", T.s1Last), T.s1Last);
      const lastMark = engine.getTrade(t.id)!;
      assert.equal(lastMark.monitoring?.status, "OK");

      // 15:45 IST Monday: the production classifier labels post-close data END_OF_DAY.
      assert.equal(marketStatus(T.s1Eod), "CLOSED");
      const eod = snapshotAt("nifty", T.s1Eod, T.s1Last);
      assert.equal(eod.sources.market.source, "END_OF_DAY");
      const lateEntry = engine.processRecommendation({ ...syntheticApproval(approval, "Bull Call Spread"), snapshot: eod }, T.s1Eod);
      assert.deepEqual(lateEntry, { created: false, trade: null, reason: "FRESHNESS_BLOCKED: Market data source is END_OF_DAY" });
      engine.evaluateOpenTrades(eod, T.s1Eod);
      const closedDay = engine.getTrade(t.id)!;
      assert.equal(closedDay.status, "OPEN", "the session close is not an exit");
      assert.equal(closedDay.currentPrice, lastMark.currentPrice);
      assert.equal(closedDay.unrealizedPnL, lastMark.unrealizedPnL);
      assert.deepEqual(closedDay.monitoring, { status: "STALE_QUOTES", lastValidQuoteAt: T.s1Last.toISOString(), reason: "source not trusted (market END_OF_DAY, option chain END_OF_DAY)" });

      // Overnight restart, then Tuesday's session.
      engine = startSession();
      assert.equal(engine.getPortfolioSummary().openRisk, t.riskAmount);
      engine.evaluateOpenTrades(snapshotAt("nifty", T.s2Open), T.s2Open);
      assert.equal(engine.getTrade(t.id)!.monitoring?.status, "OK");
      engine.evaluateOpenTrades(snapshotAt("nifty", T.s2Last), T.s2Last);
      assert.equal(engine.getTrade(t.id)!.status, "OPEN", "not expired at 15:29:59 IST");

      // 15:30:00 IST on expiry day, first look after the close: pending settlement, nothing fabricated.
      assert.equal(expiryInstant(EXPIRY).getTime(), T.s2Expiry.getTime());
      engine.evaluateOpenTrades(snapshotAt("nifty", T.s2Expiry, T.s2Last), T.s2Expiry);
      const pending = engine.getTrade(t.id)!;
      assert.equal(pending.status, "SETTLEMENT_PENDING");
      assert.deepEqual([pending.exitPrice, pending.exitTimestamp, pending.realizedPnL], [null, null, null]);
      assert.ok(pending.legs.every((l) => l.exitPrice === null && l.exitFillSource === null));
      const pendingEvent = engine.getEvents(t.id).at(-1)!;
      assert.equal(pendingEvent.details?.riskAmountReserved, t.riskAmount);
      const s = engine.getPortfolioSummary();
      assert.deepEqual([s.openPositions, s.openRisk, s.closedTrades, s.realizedPnL], [1, t.riskAmount, 0, 0]);
      assert.deepEqual(seq(engine, t.id), ["PAPER_TRADE_OPENED", "PAPER_QUOTE_UNAVAILABLE", "PAPER_TRADE_SETTLEMENT_PENDING"]);
      assertPersisted(engine);
    });

    it("session boundaries and IST days are identical whatever the host time zone", () => {
      const facts = () => [
        marketStatus(T.s1Last), marketStatus(T.s1Eod), istDay(T.s1Eod), istDay(new Date("2026-10-26T18:29:59Z")), istDay(new Date("2026-10-26T18:30:00Z")),
        expiryInstant(EXPIRY).toISOString(), tradeFreshnessOf(T.s1Last.toISOString(), T.s1Eod).source,
      ];
      const results = ["Asia/Kolkata", "UTC", "America/Los_Angeles"].map((tz) => { process.env.TZ = tz; return facts(); });
      process.env.TZ = "America/Los_Angeles";
      for (const r of results) assert.deepEqual(r, ["OPEN", "CLOSED", "2026-10-26", "2026-10-26", "2026-10-27", "2026-10-27T10:00:00.000Z", "END_OF_DAY"]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("S07 — Expiry with settlement unavailable", () => {
    it("without an authoritative dataset the position becomes SETTLEMENT_UNVERIFIED: no price invented, risk kept reserved", () => {
      const spread = expiredSpread();
      const id = spread.id;
      let engine = spread.engine;
      const risk = engine.getTrade(id)!.riskAmount;

      // Tuesday 16:00 IST: no Bhavcopy has been ingested.
      const res = engine.settlePendingTrades(EXPIRY, settleOpts(T.s2Eod));
      assert.deepEqual(res.errors, [`No settlement metadata found for trade date ${EXPIRY}`]);
      assert.equal(res.settled.length, 0);
      assert.deepEqual(res.unverified.map((x) => x.id), [id]);
      assert.equal(fs.existsSync(h.settlementDir), false, "a settlement attempt does not create storage");

      const t = engine.getTrade(id)!;
      assert.equal(t.status, "SETTLEMENT_UNVERIFIED");
      assert.deepEqual([t.exitPrice, t.exitTimestamp, t.realizedPnL, t.grossPnL, t.transactionCosts], [null, null, null, null, null]);
      assert.ok(t.legs.every((l) => l.exitPrice === null && l.exitFillSource === null));
      assert.deepEqual(t.settlement, {
        settledAt: T.s2Eod.toISOString(), tradeDate: EXPIRY, archiveHash: "", csvHash: "", sourceFile: "",
        costVerificationStatus: "UNVERIFIED_MISSING_EXERCISE_SPECIFICATION", legs: [],
        unverifiedReason: `No settlement metadata found for trade date ${EXPIRY}`,
      });
      const s = engine.getPortfolioSummary();
      assert.deepEqual([s.openPositions, s.openRisk, s.closedTrades, s.realizedPnL], [1, risk, 0, 0]);
      const rep = buildPaperLedgerReport(engine.getTrades());
      assert.deepEqual([rep.counts.settlementUnverified, rep.counts.closed, rep.unrealizedPnL, rep.netPnL], [1, 0, 0, 0]);

      // The reservation still blocks a duplicate of the same position.
      assert.match(engine.processRecommendation(syntheticApproval(strategyApproval("nifty", T.s3Open), "Bull Call Spread"), T.s3Open).reason, /^DUPLICATE_TRADE_PREVENTED/);

      // Retrying without data, and after a quarantined (self-contradicting) archive, changes nothing.
      const events = json(engine.getEvents());
      assert.deepEqual(engine.settlePendingTrades(EXPIRY, settleOpts(T.s3Open)).errors, [`No settlement metadata found for trade date ${EXPIRY}`]);
      const [buy] = t.legs;
      const bad = publishBhavcopy(EXPIRY, [
        { symbol: "NIFTY", expiry: EXPIRY, strike: buy!.strike, type: buy!.type, sttlm: "100.00" },
        { symbol: "NIFTY", expiry: EXPIRY, strike: buy!.strike, type: buy!.type, sttlm: "150.00" },
      ]);
      assert.equal(bad.result.status, "QUARANTINED");
      // A quarantined archive must never produce settlement records — the key invariant.
      // The quarantine log itself (quarantine_log.jsonl) IS written for audit durability.
      assert.equal(fs.existsSync(path.join(h.settlementDir, `settlement_${EXPIRY}.json`)), false, "quarantine never creates settlement records");
      assert.equal(fs.existsSync(path.join(h.settlementDir, `meta_${EXPIRY}.json`)), false, "quarantine never creates settlement metadata");
      assert.equal(fs.existsSync(path.join(h.settlementDir, "quarantine_log.jsonl")), true, "quarantine log is written for audit trail");
      assert.deepEqual(engine.settlePendingTrades(EXPIRY, settleOpts(T.s3Bhav)).errors, [`No settlement metadata found for trade date ${EXPIRY}`]);
      assert.deepEqual(json(engine.getEvents()), events);
      assert.equal(engine.getTrade(id)!.status, "SETTLEMENT_UNVERIFIED");

      engine = startSession();
      assert.equal(engine.getTrade(id)!.status, "SETTLEMENT_UNVERIFIED");
      assert.deepEqual(seq(engine, id), ["PAPER_TRADE_OPENED", "PAPER_TRADE_SETTLEMENT_PENDING", "PAPER_TRADE_SETTLEMENT_UNVERIFIED"]);
      assertPersisted(engine);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("S08 — Delayed authoritative settlement arrival", () => {
    it("a Bhavcopy arriving a day late settles at the exchange SttlmPric by exact five-field match, once, with dual-hash provenance", () => {
      const spread = expiredSpread();
      const id = spread.id;
      let engine = spread.engine;
      engine.settlePendingTrades(EXPIRY, settleOpts(T.s2Eod));
      assert.equal(engine.getTrade(id)!.status, "SETTLEMENT_UNVERIFIED");
      const t0 = engine.getTrade(id)!;
      const buy = t0.legs[0]!;
      const sell = t0.legs[1]!;

      // Wednesday 18:00 IST: the exchange file arrives. Near-miss rows carry different prices so a loose match would show.
      const rows: BhavRow[] = [
        ...legRows(t0, ["152.40", "0.00"]),
        { symbol: "NIFTY", expiry: EXPIRY, strike: buy.strike, type: "PE", sttlm: "11.11" }, // wrong option type
        { symbol: "NIFTY", expiry: EXPIRY, strike: sell.strike, type: "PE", sttlm: "22.22" },
        { symbol: "BANKNIFTY", expiry: EXPIRY, strike: buy.strike, type: "CE", sttlm: "33.33" }, // wrong symbol
        { symbol: "FINNIFTY", expiry: EXPIRY, strike: buy.strike, type: "CE", sttlm: "44.44" }, // unsupported symbol
        { symbol: "NIFTY", expiry: "2026-11-03", strike: buy.strike, type: "CE", sttlm: "55.55" }, // not expiring today
        { symbol: "NIFTY", expiry: EXPIRY, strike: buy.strike, type: "CE", sttlm: "66.66", instrument: "FUTIDX" }, // not an option
      ];
      const pub = publishBhavcopy(EXPIRY, rows);
      assert.equal(pub.result.status, "SUCCESS");
      assert.deepEqual(pub.result.errors, []);
      assert.equal(pub.result.records.length, 5);
      assert.equal(pub.result.archiveHash, sha256(pub.zip));
      assert.equal(pub.result.csvHash, sha256(pub.csv));

      const settleAt = at(T.s3Bhav, 300);
      const res = engine.settlePendingTrades(EXPIRY, settleOpts(settleAt));
      assert.deepEqual([res.settled.map((x) => x.id), res.unverified, res.errors], [[id], [], []]);

      const t = engine.getTrade(id)!;
      assert.equal(t.status, "SETTLED_VERIFIED");
      assert.deepEqual(t.legs.map((l) => [l.exitPrice, l.exitFillSource]), [[152.4, "EXCHANGE_SETTLEMENT"], [0, "EXCHANGE_SETTLEMENT"]]);
      assert.equal(t.exitPrice, 152.4);
      assert.equal(t.exitReason, "SETTLEMENT");
      assert.equal(t.exitTimestamp, settleAt.toISOString());
      // Accounting: gross by hand from the settlement prices, costs from the shared cost model, net = gross − costs.
      assert.ok(Math.abs(t.grossPnL! - r2((152.4 - t.entryPrice) * t.quantity)) <= 0.011);
      assert.equal(t.grossPnL, calculateTradePnL(t.legs, t.quantity, true).pnl);
      assert.deepEqual(t.transactionCosts, tradeCostsFor(t.legs, t.quantity, (l) => l.exitPrice!, DEFAULT_TRANSACTION_COSTS));
      assert.equal(t.realizedPnL, r2(t.grossPnL! - t.transactionCosts!.totalCosts));
      assert.equal(t.unrealizedPnL, 0);
      // Provenance: both hashes, the source file and the still-unverified exercise-cost status.
      assert.deepEqual(
        { ...t.settlement, legs: t.settlement!.legs.map((l) => [l.strike, l.type, l.settlementPrice]) },
        { settledAt: settleAt.toISOString(), tradeDate: EXPIRY, archiveHash: sha256(pub.zip), csvHash: sha256(pub.csv), sourceFile: pub.name, costVerificationStatus: "UNVERIFIED_MISSING_EXERCISE_SPECIFICATION", legs: [[buy.strike, "CE", 152.4], [sell.strike, "CE", 0]], advisoryDiscrepancy: false },
      );
      const ev = engine.getEvents(id).at(-1)!;
      assert.equal(ev.event, "PAPER_TRADE_SETTLED_VERIFIED");
      assert.deepEqual([ev.details?.archiveHash, ev.details?.csvHash, ev.details?.realizedPnL, ev.details?.costVerificationStatus], [sha256(pub.zip), sha256(pub.csv), t.realizedPnL, "UNVERIFIED_MISSING_EXERCISE_SPECIFICATION"]);
      // Capital released.
      const s = engine.getPortfolioSummary();
      assert.deepEqual([s.openPositions, s.openRisk, s.availableRisk, s.closedTrades, s.realizedPnL, s.currentCapital], [0, 0, OPEN_RISK_CAP, 1, t.realizedPnL, r2(CAPITAL + t.realizedPnL!)]);

      // Idempotent: settling again, re-ingesting the same file, or a later revision changes nothing.
      const settled = json(engine.getTrades());
      const events = json(engine.getEvents());
      assert.deepEqual(engine.settlePendingTrades(EXPIRY, settleOpts(at(settleAt, 3600))), { settled: [], unverified: [], errors: [] });
      assert.equal(publishBhavcopy(EXPIRY, rows).result.status, "IDEMPOTENT_NOOP");
      assert.equal(publishBhavcopy(EXPIRY, legRows(t0, ["160.00", "0.00"])).result.status, "CANDIDATE_REVISION");
      assert.deepEqual(listSettlementRecords(EXPIRY, { storageDir: h.settlementDir }).filter((r) => r.symbol === "NIFTY" && r.optionType === "CE").map((r) => r.settlementPrice).sort(), [0, 152.4]);
      engine.settlePendingTrades(EXPIRY, settleOpts(at(settleAt, 7200)));
      assert.deepEqual(json(engine.getTrades()), settled);
      assert.deepEqual(json(engine.getEvents()), events);

      engine = startSession();
      assert.deepEqual(json(engine.getTrades()), settled);
      assert.deepEqual(seq(engine, id), ["PAPER_TRADE_OPENED", "PAPER_TRADE_SETTLEMENT_PENDING", "PAPER_TRADE_SETTLEMENT_UNVERIFIED", "PAPER_TRADE_SETTLED_VERIFIED"]);
      assertPersisted(engine);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("S09 — Interrupted or incomplete multi-leg settlement", () => {
    it("a Bhavcopy missing one leg leaves the whole spread unverified: no leg is settled and risk stays reserved", () => {
      const { engine, id } = expiredSpread();
      const t0 = engine.getTrade(id)!;
      const buy = t0.legs[0]!;
      const sell = t0.legs[1]!;

      // The short leg's row has a blank SttlmPric: ingestion drops that row, keeps the other.
      const pub = publishBhavcopy(EXPIRY, legRows(t0, ["152.40", ""]));
      assert.equal(pub.result.status, "SUCCESS");
      assert.equal(pub.result.records.length, 1);
      assert.match(pub.result.errors.join("|"), new RegExp(`missing settlement price for NIFTY ${sell.strike} CE`));

      const res = engine.settlePendingTrades(EXPIRY, settleOpts(T.s3Bhav));
      const reason = `Missing settlement record for contract ${contractKey(t0, sell)}`;
      assert.deepEqual([res.settled, res.unverified.map((x) => x.id), res.errors], [[], [id], [reason]]);
      const t = engine.getTrade(id)!;
      assert.equal(t.status, "SETTLEMENT_UNVERIFIED");
      assert.ok(t.legs.every((l) => l.exitPrice === null && l.exitFillSource === null), "the priced long leg is not settled on its own");
      assert.deepEqual([t.exitPrice, t.realizedPnL], [null, null]);
      assert.deepEqual([t.settlement?.legs, t.settlement?.unverifiedReason, t.settlement?.archiveHash, t.settlement?.csvHash], [[], reason, sha256(pub.zip), sha256(pub.csv)]);
      assert.equal(engine.getPortfolioSummary().openRisk, t.riskAmount);
      assert.equal(engine.getPortfolioSummary().closedTrades, 0);
      assert.ok(buy.strike !== sell.strike);

      // A corrected archive does not silently replace the active dataset: it is held as a candidate revision.
      assert.equal(publishBhavcopy(EXPIRY, legRows(t0, ["152.40", "0.00"])).result.status, "CANDIDATE_REVISION");
      const events = json(engine.getEvents());
      engine.settlePendingTrades(EXPIRY, settleOpts(at(T.s3Bhav, 600)));
      assert.equal(engine.getTrade(id)!.status, "SETTLEMENT_UNVERIFIED");
      assert.deepEqual(json(engine.getEvents()), events);
      assert.deepEqual(seq(engine, id), ["PAPER_TRADE_OPENED", "PAPER_TRADE_SETTLEMENT_PENDING", "PAPER_TRADE_SETTLEMENT_UNVERIFIED"]);
      assertPersisted(engine);
    });

    it("an interrupted settlement write rolls back in memory, never persists a partial settlement and blocks the ledger on restart", () => {
      const { engine, id } = expiredSpread();
      const t0 = engine.getTrade(id)!;
      assert.equal(publishBhavcopy(EXPIRY, legRows(t0, ["152.40", "0.00"])).result.status, "SUCCESS");

      // The process "crashes" at the atomic rename of trades.json (after the event append, as savePaperLedger orders it).
      guard.renameFault = h.ledgerDir;
      const res = engine.settlePendingTrades(EXPIRY, settleOpts(T.s3Bhav));
      assert.deepEqual([res.settled, res.unverified], [[], []]);
      assert.equal(res.errors.length, 1);
      assert.match(res.errors[0]!, /^LEDGER_PERSIST_FAILED: SIMULATED CRASH before the atomic rename$/);

      // Memory: rolled back to pending, every leg unsettled.
      const mem = engine.getTrade(id)!;
      assert.equal(mem.status, "SETTLEMENT_PENDING");
      assert.deepEqual([mem.exitPrice, mem.realizedPnL, mem.settlement], [null, null, undefined]);
      assert.ok(mem.legs.every((l) => l.exitPrice === null && l.exitFillSource === null));

      // Disk: the snapshot never shows a settled leg; the append-only log ran one event ahead (torn write).
      const disk = (JSON.parse(readIf("trades.json")!) as PaperTrade[]).find((x) => x.id === id)!;
      assert.equal(disk.status, "SETTLEMENT_PENDING");
      assert.ok(disk.legs.every((l) => l.exitPrice === null));
      assert.equal(JSON.parse(readIf("events.jsonl")!.trim().split("\n").at(-1)!).event, "PAPER_TRADE_SETTLED_VERIFIED");
      assert.equal(fs.readdirSync(h.ledgerDir).filter((f) => f.includes(".tmp-")).length, 1, "the crashed write's temp file is left behind");

      // The running process refuses further writes until the ledger is inspected.
      const retry = engine.settlePendingTrades(EXPIRY, settleOpts(at(T.s3Bhav, 60)));
      assert.match(retry.errors[0]!, /^LEDGER_PERSIST_FAILED: events\.jsonl does not match the expected ledger event sequence/);
      assert.equal(engine.getTrade(id)!.status, "SETTLEMENT_PENDING");

      // Restart: fail-closed; nothing is rewritten.
      const bytes = ledgerBytes();
      assert.equal(loadPaperLedger(h.ledgerDir).error, `settlement pending trade ${id} has settled verified event`);
      const restarted = startSession();
      assert.match(restarted.processRecommendation(strategyApproval("nifty", T.s4Open), T.s4Open).reason, /^LEDGER_UNAVAILABLE: settlement pending trade .* has settled verified event$/);
      assert.deepEqual(ledgerBytes(), bytes);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("S10 — Restart after verified settlement", () => {
    it("a verified settlement survives restart unchanged, is terminal, and no longer blocks a new position", () => {
      const spread = expiredSpread();
      const id = spread.id;
      let engine = spread.engine;
      assert.equal(publishBhavcopy(EXPIRY, legRows(engine.getTrade(id)!, ["152.40", "0.00"])).result.status, "SUCCESS");
      assert.equal(engine.settlePendingTrades(EXPIRY, settleOpts(T.s3Bhav)).settled.length, 1);
      const trades = json(engine.getTrades());
      const summary = engine.getPortfolioSummary();
      const report = buildPaperLedgerReport(engine.getTrades());

      // Restart: identical record, P&L, provenance and released capital.
      engine = startSession();
      assert.deepEqual(json(engine.getTrades()), trades);
      assert.deepEqual(engine.getPortfolioSummary(), summary);
      assert.deepEqual(buildPaperLedgerReport(engine.getTrades()), report);
      assert.deepEqual([summary.openRisk, summary.closedTrades], [0, 1]);

      // Terminal: every transition out of SETTLED_VERIFIED is refused and nothing is written.
      const statuses: PaperTradeStatus[] = ["PENDING", "OPEN", "TARGET_HIT", "STOPPED_OUT", "EXPIRED", "CLOSED", "CANCELLED", "REJECTED", "SETTLEMENT_PENDING", "SETTLEMENT_UNVERIFIED", "SETTLED_VERIFIED"];
      assert.deepEqual(statuses.filter((s) => canTransition("SETTLED_VERIFIED", s)), []);
      const bytes = ledgerBytes();
      const settled = engine.getTrade(id)!;
      assert.throws(() => engine.closeTrade(settled, "CLOSED", snapshotAt("nifty", T.s4Open), T.s4Open), /cannot transition from SETTLED_VERIFIED to CLOSED/);
      assert.throws(() => engine.transitionToPendingSettlement(settled, T.s4Open), /cannot transition from SETTLED_VERIFIED to SETTLEMENT_PENDING/);
      assert.deepEqual(engine.settlePendingTrades(EXPIRY, settleOpts(T.s4Open)), { settled: [], unverified: [], errors: [] });
      assert.deepEqual(json(engine.getTrades()), trades);
      assert.deepEqual(ledgerBytes(), bytes);

      // Re-entry: the settled spread does not block a new one (a new identity).
      const next = open(engine, syntheticApproval(strategyApproval("nifty", T.s4Open), "Bull Call Spread"), T.s4Open);
      assert.notEqual(next.id, id);
      assert.equal(engine.getTrades().length, 2);
      assert.equal(engine.getPortfolioSummary().openRisk, next.riskAmount);
      assertPersisted(engine);

      // Tampering with the terminal record is detected, never accepted.
      const tamper = (edit: (t: PaperTrade) => void) => {
        const copy = json(engine.getTrades());
        edit(copy.find((t) => t.id === id)!);
        return reconcileLedger(copy, json(engine.getEvents())).issues.map((i) => [i.code, i.tradeId]);
      };
      assert.deepEqual(tamper((t) => { t.realizedPnL = t.realizedPnL! + 500; }), [["NET_NOT_GROSS_MINUS_COSTS", id]]);
      assert.deepEqual(tamper((t) => { t.settlement!.csvHash = ""; }), [["SETTLEMENT_PROVENANCE_INVALID", id]]);
      assert.deepEqual(tamper((t) => { t.legs[0]!.exitPrice = t.legs[0]!.exitPrice! + 1; }), [["PNL_MISMATCH", id], ["COSTS_MISMATCH", id]]);
      const onDisk = JSON.parse(readIf("trades.json")!) as PaperTrade[];
      delete onDisk.find((t) => t.id === id)!.settlement;
      fs.writeFileSync(ledgerFile("trades.json"), JSON.stringify(onDisk, null, 2));
      assert.equal(loadPaperLedger(h.ledgerDir).error, `settled verified trade ${id} missing settlement provenance metadata`);
      assert.match(startSession().processRecommendation(strategyApproval("nifty", T.s4Open), T.s4Open).reason, /^LEDGER_UNAVAILABLE: settled verified trade/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("S11 — Multiple open multi-leg positions and insufficient capital", () => {
    it("three positions reserve risk; the fourth is refused for insufficient available risk capital; releasing capital admits it", () => {
      let engine = startSession();
      const nifty = strategyApproval("nifty", T.s1Open);
      const bank = analyze(bearishSnapshot(snapshotAt("banknifty", T.s1Open)), T.s1Open); // Strategy 11.4 says WAIT: SYNTHETIC approvals below
      const lc = open(engine, nifty, T.s1Open);
      const bcs = open(engine, syntheticApproval(nifty, "Bull Call Spread"), T.s1Open);
      const bps = open(engine, syntheticApproval(bank, "Bear Put Spread"), T.s1Open);
      assert.deepEqual([lc, bcs, bps].map((t) => [t.index, t.strategy, t.legs.length]), [["nifty", "Long Call", 1], ["nifty", "Bull Call Spread", 2], ["banknifty", "Bear Put Spread", 2]]);
      for (const t of [lc, bcs, bps]) {
        assert.ok(t.riskAmount > 0 && t.riskAmount <= CAPITAL * (DEFAULT_RISK_CONFIG.riskPerTradePercent / 100));
        assert.ok(t.lots <= DEFAULT_RISK_CONFIG.maxLotsPerTrade);
        assert.ok(Math.abs(t.entryPrice) * t.quantity <= CAPITAL * (DEFAULT_RISK_CONFIG.maxPositionValuePercent / 100));
      }
      const held = lc.riskAmount + bcs.riskAmount + bps.riskAmount;
      const s3 = engine.getPortfolioSummary();
      assert.deepEqual([s3.openPositions, s3.openRisk, s3.availableRisk], [3, held, OPEN_RISK_CAP - held]);
      assert.equal(reservedRisk(engine.getTrades()), held);

      // Fourth position: the production risk engine rejects portfolio allocation, keeping market recommendation valid.
      const fourth = syntheticApproval(bank, "Long Put");
      const ra = evaluateTradeRisk(fourth.plan!, fourth.snapshot, { currentOpenPositions: 3, existingOpenRisk: held, realizedDailyLoss: 0 }, undefined, T.s1Open);
      assert.equal(ra.allowed, true, "Recommendation itself remains allowed; only portfolio allocation is rejected");
      assert.equal(ra.portfolioAllowed, false, "Portfolio allocation is rejected");
      assert.ok(ra.portfolioReasons?.includes("OPEN_RISK_LIMIT"), ra.portfolioReasons?.join(","));
      assert.ok(ra.portfolioReasons?.includes("MAX_CONCURRENT_POSITIONS"), ra.portfolioReasons?.join(","));
      assert.ok(ra.totalRisk > s3.availableRisk, "available risk capital is insufficient for the fourth position");
      const bytes = ledgerBytes();
      const writes = guard.writes.length;
      const r = engine.processRecommendation(fourth, T.s1Open);
      assert.deepEqual(r, { created: false, trade: null, reason: `RISK_REJECTED: ${ra.portfolioHumanReasons?.[0]}` });
      assert.match(r.reason, /^RISK_REJECTED: Combined open risk ₹[\d,]+ exceeds portfolio open risk limit ₹15,000$/);
      assert.equal(guard.writes.length, writes, "a refused entry writes nothing (and is not logged as an event)");
      assert.deepEqual(ledgerBytes(), bytes);
      assert.deepEqual(engine.getPortfolioSummary(), s3);

      // Release capital: the Long Call is closed at 11:30 IST; its reservation returns.
      engine.closeTrade(engine.getTrade(lc.id)!, "CLOSED", snapshotAt("nifty", T.s1Mid), T.s1Mid);
      const closed = engine.getTrade(lc.id)!;
      assert.deepEqual([closed.status, closed.exitReason], ["CLOSED", "MANUAL_CLOSE"]);
      assert.equal(closed.realizedPnL, r2(closed.grossPnL! - closed.transactionCosts!.totalCosts));
      const s4 = engine.getPortfolioSummary();
      assert.deepEqual([s4.openPositions, s4.openRisk], [2, bcs.riskAmount + bps.riskAmount]);

      // The fourth position now fits (sized down by the post-fill check if needed).
      const lp = open(engine, syntheticApproval(analyze(bearishSnapshot(snapshotAt("banknifty", T.s1Mid)), T.s1Mid), "Long Put"), T.s1Mid);
      assert.ok(lp.riskAmount <= s4.availableRisk);
      const s5 = engine.getPortfolioSummary();
      const open3 = engine.getTrades().filter((t) => t.status === "OPEN");
      assert.deepEqual([s5.openPositions, s5.openRisk, s5.realizedPnL], [3, bcs.riskAmount + bps.riskAmount + lp.riskAmount, closed.realizedPnL]);
      assert.equal(s5.unrealizedPnL, r2(open3.reduce((a, t) => a + t.unrealizedPnL!, 0)));
      assert.equal(s5.currentCapital, r2(CAPITAL + closed.realizedPnL! + s5.unrealizedPnL));
      assert.deepEqual(seq(engine, lc.id), ["PAPER_TRADE_OPENED", "PAPER_TRADE_EXITED"]);
      for (const t of [bcs, bps, lp]) assert.deepEqual(seq(engine, t.id), ["PAPER_TRADE_OPENED"]);
      assertPersisted(engine);

      engine = startSession();
      assert.deepEqual(engine.getPortfolioSummary(), s5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("S12 — Reporting and capital reconciliation", () => {
    it("a three-session ledger reconciles: realized only from closed and verified trades, reservations from active ones", () => {
      // Monday: three positions; the Long Call is closed at 11:30 IST; the close leaves the others END_OF_DAY.
      let engine = startSession();
      const nifty = strategyApproval("nifty", T.s1Open);
      const t1 = open(engine, nifty, T.s1Open);
      const t2 = open(engine, syntheticApproval(nifty, "Bull Call Spread"), T.s1Open);
      const t3 = open(engine, syntheticApproval(analyze(bearishSnapshot(snapshotAt("banknifty", T.s1Open)), T.s1Open), "Bear Put Spread"), T.s1Open);
      engine.closeTrade(engine.getTrade(t1.id)!, "CLOSED", snapshotAt("nifty", T.s1Mid), T.s1Mid);
      for (const idx of ["nifty", "banknifty"] as const) engine.evaluateOpenTrades(snapshotAt(idx, T.s1Eod, T.s1Last), T.s1Eod);

      // Tuesday (restart): expiry; the first post-close look moves both spreads to SETTLEMENT_PENDING.
      engine = startSession();
      for (const idx of ["nifty", "banknifty"] as const) engine.evaluateOpenTrades(snapshotAt(idx, T.s2Open), T.s2Open);
      assert.deepEqual([t2, t3].map((t) => engine.getTrade(t.id)!.monitoring?.status), ["OK", "OK"]);
      for (const idx of ["nifty", "banknifty"] as const) engine.evaluateOpenTrades(snapshotAt(idx, T.s2Expiry, T.s2Last), T.s2Expiry);
      assert.deepEqual([t2, t3].map((t) => engine.getTrade(t.id)!.status), ["SETTLEMENT_PENDING", "SETTLEMENT_PENDING"]);

      // Wednesday (restart). Negative case: a recommendation with gross reward-to-risk below the 1.2 minimum
      // must be refused by the risk gate, creating no trade and writing no event.
      engine = startSession();
      const eventsBeforeRefusal = engine.getEvents().length;
      const baseLp = syntheticApproval(analyze(bearishSnapshot(snapshotAt("banknifty", T.s3Open)), T.s3Open), "Long Put");
      const lowRRLp: Analysis = {
        ...baseLp,
        plan: baseLp.plan ? { ...baseLp.plan, rr: 0.8 } : null,
      };
      const lpRefused = engine.processRecommendation(lowRRLp, T.s3Open);
      assert.equal(lpRefused.created, false, "NO TRADE: fails the gross reward-to-risk gate");
      assert.equal(lpRefused.trade, null);
      assert.match(lpRefused.reason, /^RISK_REJECTED: Risk\/reward 1:0\.8 is below minimum 1:1\.2 for debit strategy$/);
      assert.equal(engine.getTrades().length, 3, "a refused signal creates no trade");
      assert.equal(engine.getEvents().length, eventsBeforeRefusal, "a refused signal writes no event");

      // Positive case, kept separate: a Bhavcopy with NIFTY rows only, then settlement.
      assert.equal(publishBhavcopy(EXPIRY, legRows(engine.getTrade(t2.id)!, ["152.40", "0.00"])).result.status, "SUCCESS");
      const res = engine.settlePendingTrades(EXPIRY, settleOpts(T.s3Bhav));
      assert.deepEqual([res.settled.map((t) => t.id), res.unverified.map((t) => t.id)], [[t2.id], [t3.id]]);
      // Then a NIFTY Bull Call Spread, opened after settlement: its net ratio on Wednesday is 1:1.24 (passes), and the
      // BANKNIFTY spread is still active, so the same-index duplicate guard would refuse a second one.
      const t4 = open(engine, syntheticApproval(analyze(snapshotAt("nifty", T.s3Open), T.s3Open), "Bull Call Spread"), T.s3Open);

      engine = startSession();
      const [T1, T2, T3, T4] = [t1, t2, t3, t4].map((t) => engine.getTrade(t.id)!);
      assert.deepEqual([T1!.status, T2!.status, T3!.status, T4!.status], ["CLOSED", "SETTLED_VERIFIED", "SETTLEMENT_UNVERIFIED", "OPEN"]);
      assert.deepEqual(seq(engine, t1.id), ["PAPER_TRADE_OPENED", "PAPER_TRADE_EXITED"]);
      assert.deepEqual(seq(engine, t2.id), ["PAPER_TRADE_OPENED", "PAPER_QUOTE_UNAVAILABLE", "PAPER_TRADE_SETTLEMENT_PENDING", "PAPER_TRADE_SETTLED_VERIFIED"]);
      assert.deepEqual(seq(engine, t3.id), ["PAPER_TRADE_OPENED", "PAPER_QUOTE_UNAVAILABLE", "PAPER_TRADE_SETTLEMENT_PENDING", "PAPER_TRADE_SETTLEMENT_UNVERIFIED"]);
      assert.deepEqual(seq(engine, t4.id), ["PAPER_TRADE_OPENED"]);

      // Report: realized only from CLOSED + SETTLED_VERIFIED; unrealized only from OPEN; unverified in neither.
      const rep = buildPaperLedgerReport(engine.getTrades());
      assert.equal(rep.label, REPORT_LABEL);
      assert.deepEqual(rep.counts, { total: 4, open: 1, closed: 2, pending: 0, rejected: 0, cancelled: 0, settlementPending: 0, settlementUnverified: 1, settledVerified: 1 });
      assert.equal(rep.netPnL, r2(T1!.realizedPnL! + T2!.realizedPnL!));
      assert.equal(rep.grossPnL, r2(T1!.grossPnL! + T2!.grossPnL!));
      assert.equal(rep.totalCosts, r2(T1!.transactionCosts!.totalCosts + T2!.transactionCosts!.totalCosts));
      assert.ok(Math.abs(rep.grossPnL - rep.totalCosts - rep.netPnL) <= 0.011);
      assert.equal(rep.unrealizedPnL, T4!.unrealizedPnL);
      assert.deepEqual([T3!.realizedPnL, T3!.exitPrice], [null, null]);
      assert.deepEqual(rep.exposure.openPositions, 2);
      assert.equal(rep.exposure.openRisk, T3!.riskAmount + T4!.riskAmount);
      assert.equal(rep.legacyWithoutCosts, 0);
      assert.deepEqual(rep.byIndex.map((g) => [g.key, g.trades]), [["nifty", 2]]);

      // Capital: starting + realized + unrealized; reservations = active positions; available = cap − reserved.
      const s = engine.getPortfolioSummary();
      assert.equal(s.currentCapital, r2(CAPITAL + rep.netPnL + rep.unrealizedPnL));
      assert.deepEqual([s.realizedPnL, s.unrealizedPnL, s.closedTrades, s.openPositions], [rep.netPnL, rep.unrealizedPnL, 2, 2]);
      assert.equal(s.openRisk, reservedRisk(engine.getTrades()));
      assert.equal(s.availableRisk, r2(OPEN_RISK_CAP - s.openRisk));

      // Accounting limitation stays visible: verified settlements carry unverified exercise costs.
      assert.equal(T2!.settlement?.costVerificationStatus, "UNVERIFIED_MISSING_EXERCISE_SPECIFICATION");
      assert.equal(engine.getEvents(t2.id).at(-1)!.details?.costVerificationStatus, "UNVERIFIED_MISSING_EXERCISE_SPECIFICATION");

      // The valid ledger reconciles with zero issues, and the report rebuilds from disk.
      const l = assertPersisted(engine);
      assert.deepEqual(buildPaperLedgerReport(l.trades), rep);

      // Intentionally invalid copies are flagged precisely, never forced to pass.
      const issues = (trades: PaperTrade[], events = json(engine.getEvents())) => {
        const r = reconcileLedger(trades, events);
        assert.equal(r.ok, false);
        return r.issues.map((i) => [i.code, i.tradeId]);
      };
      const copy = (id: string, edit: (t: PaperTrade) => void) => { const c = json(engine.getTrades()); edit(c.find((t) => t.id === id)!); return c; };
      assert.deepEqual(issues(copy(t1.id, (t) => { t.realizedPnL = t.realizedPnL! + 100; })), [["NET_NOT_GROSS_MINUS_COSTS", t1.id]]);
      assert.deepEqual(issues(copy(t3.id, (t) => { t.exitPrice = 10; })), [["SETTLEMENT_PENDING_WITH_EXIT", t3.id]]);
      assert.deepEqual(issues(copy(t2.id, (t) => { delete t.settlement; })), [["SETTLED_WITHOUT_METADATA", t2.id]]);
      const dupSettled = engine.getEvents(t2.id).at(-1)!;
      assert.deepEqual(issues(json(engine.getTrades()), [...json(engine.getEvents()), json(dupSettled)]), [["SETTLED_EVENT_MISMATCH", t2.id]]);
    });
  });
});
