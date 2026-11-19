#!/usr/bin/env node
import { assertCollectionAuthorized } from "./lib/collectionGuard.mjs";
assertCollectionAuthorized("backfill-intraday-bars.mjs", "upstox");

// Historical 1-min candle backfill for NIFTY 50 — Stock V2 research.
// Fetches the previous TARGET_SESSIONS trading sessions for each constituent.
//
// Storage: .research-data/intraday-bars-historical/
// Run:     node scripts/backfill-intraday-bars.mjs [--live] [--dry-run] [--sessions N] [--from YYYY-MM-DD]
//
// Safety:
//   - Default dry-run (requires --live)
//   - Never overwrites existing session files
//   - Atomic writes
//   - Sequential per-stock (no parallel bursts)
//   - Non-zero exit on critical failures

import * as fs from "node:fs";
import * as path from "node:path";
import { BASE, serverUp } from "./upstox-cli.mjs";

// ── constants ──────────────────────────────────────────────────────────────
const DRY_RUN = !process.argv.includes("--live");
const OUT_DIR = path.resolve(process.cwd(), ".research-data/intraday-bars-historical");
const CONSTITUENT_SRC = path.resolve(process.cwd(), "src/lib/services/breadthConstituents.generated.ts");
const TARGET_SESSIONS = (() => { const i = process.argv.indexOf("--sessions"); return i >= 0 ? parseInt(process.argv[i + 1]) : 60; })();
const FROM_OVERRIDE = (() => { const i = process.argv.indexOf("--from"); return i >= 0 ? process.argv[i + 1] : null; })();

// ── trading day calendar (mirrors time.ts NSE_HOLIDAYS) ───────────────────
const NSE_HOLIDAYS = new Set([
  "2026-01-26","2026-02-19","2026-03-14","2026-03-25","2026-03-31",
  "2026-04-02","2026-04-10","2026-04-14","2026-04-16","2026-04-30",
  "2026-05-01","2026-05-11","2026-06-23","2026-07-28","2026-07-30",
  "2026-08-15","2026-08-17","2026-09-14","2026-10-02","2026-10-20",
  "2026-11-10","2026-11-24",
]);

function addDays(d, n) {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

function isTradingDay(d) {
  const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
  return wd !== 0 && wd !== 6 && !NSE_HOLIDAYS.has(d);
}

// Return the last N completed trading sessions ending at (and including) endDate.
function lastNSessions(n, endDate) {
  const result = [];
  let d = endDate;
  while (result.length < n) {
    if (isTradingDay(d)) result.unshift(d);
    d = addDays(d, -1);
    if (d < "2020-01-01") break; // safety stop
  }
  return result;
}

// ── load constituents ──────────────────────────────────────────────────────
function loadConstituents() {
  const src = fs.readFileSync(CONSTITUENT_SRC, "utf8");
  const match = src.match(/export const NIFTY_50 = (\[[\s\S]*?\n\])/);
  if (!match) throw new Error("Could not parse NIFTY_50 from breadthConstituents.generated.ts");
  const constituents = JSON.parse(match[1]);
  if (!Array.isArray(constituents) || constituents.length !== 50) throw new Error(`Expected 50 constituents, got ${constituents.length}`);
  for (const c of constituents) {
    if (!c.symbol || !c.name || !c.isin || !c.instrumentKey) throw new Error(`Constituent missing required fields: ${JSON.stringify(c)}`);
  }
  return constituents;
}

// ── candle normalization (V3 array → object) ──────────────────────────────
function normalizeCandle(raw) {
  if (!Array.isArray(raw) || raw.length < 6) return null;
  return { timestamp: raw[0], open: raw[1], high: raw[2], low: raw[3], close: raw[4], volume: raw[5], openInterest: raw[6] ?? 0 };
}

function normalizeAndSort(rawCandles) {
  if (!Array.isArray(rawCandles)) return [];
  const candles = rawCandles.map(normalizeCandle).filter((c) => c !== null);
  // V3 returns newest-first; sort to oldest-first for research
  return candles.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

// ── candle validation ──────────────────────────────────────────────────────
const IST_OFFSET_MS = 330 * 60_000;
function istDay(iso) {
  return new Date(Date.parse(iso) + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function validateCandles(candles, expectedDate) {
  if (!Array.isArray(candles) || candles.length === 0) return { ok: false, reason: "empty", issues: [], missingIntervals: 0, zeroVolumeCount: 0, duplicateCount: 0, candleCount: 0, wrongDateCount: 0 };
  const issues = [];
  const seenTs = new Set();
  let missingIntervals = 0;
  let zeroVolumeCount = 0;
  let duplicateCount = 0;
  let wrongDateCount = 0;
  let prevTs = null;

  for (const c of candles) {
    if (!c.timestamp || c.open == null || c.high == null || c.low == null || c.close == null || c.volume == null) {
      issues.push("malformed candle: missing OHLCV fields"); break;
    }
    if (c.high < c.low || c.open < 0 || c.close < 0) issues.push(`invalid prices at ${c.timestamp}`);
    if (c.volume < 0) issues.push(`negative volume at ${c.timestamp}`);
    if (c.volume === 0) zeroVolumeCount++;
    if (expectedDate && istDay(c.timestamp) !== expectedDate) wrongDateCount++;
    if (seenTs.has(c.timestamp)) { issues.push(`duplicate timestamp ${c.timestamp}`); duplicateCount++; }
    seenTs.add(c.timestamp);
    if (prevTs !== null) {
      const gap = (new Date(c.timestamp) - new Date(prevTs)) / 1000;
      if (gap > 120) missingIntervals++;
    }
    prevTs = c.timestamp;
  }
  return { ok: issues.length === 0, issues, missingIntervals, zeroVolumeCount, duplicateCount, wrongDateCount, candleCount: candles.length };
}

// ── fetch with retries ─────────────────────────────────────────────────────
async function fetchRange(instrumentKey, from, to) {
  const encoded = encodeURIComponent(instrumentKey);
  const url = `${BASE}/api/research/stock-candles-range?instrumentKey=${encoded}&from=${from}&to=${to}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1_000 * 2 ** (attempt - 1)));
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      return res.json();
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
}

// ── split bulk response into per-session candles ───────────────────────────
function splitBySession(candles, tradingDays) {
  const byDay = new Map();
  for (const c of candles) {
    const d = istDay(c.timestamp);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(c);
  }
  return tradingDays.map((day) => ({ day, candles: byDay.get(day) ?? [] }));
}

// ── atomic write ──────────────────────────────────────────────────────────
function atomicWrite(filePath, data) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

// ── expected bars per session (regular: 09:15–15:29 inclusive = 375 at 1-min) ──
const SPECIAL_SESSIONS = { "2026-11-08": { open: 18 * 60, close: 19 * 60 } };
function expectedBars(day) {
  const w = SPECIAL_SESSIONS[day] ?? { open: 9 * 60 + 15, close: 15 * 60 + 30 };
  return w.close - w.open; // minutes
}

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const endDate = addDays(today, -1); // last completed session is yesterday at earliest

  console.log(`\nbackfill-intraday-bars  mode=${DRY_RUN ? "DRY-RUN" : "LIVE"}`);
  console.log(`  target sessions : ${TARGET_SESSIONS}`);
  console.log(`  end date        : ${endDate}`);

  if (DRY_RUN) console.log("\nPass --live to perform real API calls and write files.\n");

  if (!DRY_RUN && !(await serverUp())) {
    console.error("ERROR: dev server not running. Start with: npm run dev:upstox");
    process.exit(1);
  }

  const constituents = loadConstituents();
  const sessions = FROM_OVERRIDE
    ? (() => {
        const s = [];
        for (let d = FROM_OVERRIDE; d <= endDate; d = addDays(d, 1)) if (isTradingDay(d)) s.push(d);
        return s.slice(-TARGET_SESSIONS);
      })()
    : lastNSessions(TARGET_SESSIONS, endDate);

  if (sessions.length === 0) { console.error("ERROR: no trading sessions found"); process.exit(1); }

  const rangeFrom = sessions[0];
  const rangeTo = sessions[sessions.length - 1];

  console.log(`  sessions found  : ${sessions.length} (${rangeFrom} → ${rangeTo})`);
  console.log(`  universe        : ${constituents.length} stocks`);

  if (DRY_RUN) {
    // estimate API calls
    const calDays = Math.ceil((Date.parse(rangeTo) - Date.parse(rangeFrom)) / 86_400_000) + 1;
    const chunksPerStock = Math.ceil(calDays / 28);
    console.log(`\n  dry-run estimate:`);
    console.log(`    calendar span   : ${calDays} days`);
    console.log(`    chunks/stock    : ${chunksPerStock}`);
    console.log(`    total API calls : ${chunksPerStock * constituents.length}`);
    console.log(`    min time (130ms): ~${((chunksPerStock * constituents.length * 130) / 1000).toFixed(0)}s`);
    console.log(`\n  would write to: ${OUT_DIR}`);
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // save constituent snapshot
  const snapshotPath = path.join(OUT_DIR, `constituents-snapshot-${today}.json`);
  if (!fs.existsSync(snapshotPath)) {
    atomicWrite(snapshotPath, { date: today, generatedAt: new Date().toISOString(), source: "breadthConstituents.generated.ts", count: constituents.length, constituents });
    console.log(`\nsnapshot saved: ${snapshotPath}`);
  }

  const stats = { stocksOk: 0, stocksPartial: 0, stocksFailed: 0, sessionsOk: 0, sessionsPartial: 0, sessionsMissing: 0, totalCandles: 0 };
  const coverageReport = [];

  for (const { symbol, instrumentKey } of constituents) {
    console.log(`\n  ${symbol}`);
    let raw;
    try {
      raw = await fetchRange(instrumentKey, rangeFrom, rangeTo);
    } catch (err) {
      console.error(`    FAIL  fetch error: ${err.message}`);
      stats.stocksFailed++;
      coverageReport.push({ symbol, instrumentKey, status: "FAILED", reason: err.message, sessions: [] });
      continue;
    }

    const allCandles = normalizeAndSort(raw.candles ?? []);
    const sessionResults = splitBySession(allCandles, sessions);
    const stockCoverage = { symbol, instrumentKey, fetchedCandles: allCandles.length, failedChunks: raw.failedChunks ?? [], sessions: [] };
    let stockOk = true;

    for (const { day, candles } of sessionResults) {
      const outPath = path.join(OUT_DIR, `${day}-${symbol}.json`);
      if (fs.existsSync(outPath)) {
        console.log(`    skip  ${day} (exists)`);
        stats.sessionsOk++;
        stockCoverage.sessions.push({ day, status: "SKIPPED_EXISTS" });
        continue;
      }

      const validation = validateCandles(candles, day);
      const expBars = expectedBars(day);
      const sessionStatus = candles.length === 0 ? "MISSING"
        : validation.ok && candles.length >= expBars * 0.95 ? "OK"
        : "PARTIAL";

      const record = {
        date: day,
        symbol,
        instrumentKey,
        interval: "1minute",
        candles,
        collectedAt: new Date().toISOString(),
        provider: "upstox",
        candleCount: candles.length,
        expectedBars: expBars,
        validation,
        missingIntervalCount: validation.missingIntervals,
        zeroVolumeCount: validation.zeroVolumeCount,
        status: sessionStatus,
        backfill: { backfilledAt: new Date().toISOString(), rangeFrom, rangeTo, source: "backfill-intraday-bars.mjs" },
      };

      atomicWrite(outPath, record);
      stats.totalCandles += candles.length;

      if (sessionStatus === "OK") { console.log(`    ok    ${day}  ${candles.length}/${expBars} bars`); stats.sessionsOk++; }
      else if (sessionStatus === "PARTIAL") { console.log(`    part  ${day}  ${candles.length}/${expBars} bars`); stats.sessionsPartial++; stockOk = false; }
      else { console.log(`    miss  ${day}  (no candles)`); stats.sessionsMissing++; stockOk = false; }

      stockCoverage.sessions.push({ day, status: sessionStatus, candleCount: candles.length, expectedBars: expBars, zeroVolumeCount: validation.zeroVolumeCount, issues: validation.issues });
    }

    if (stockOk) stats.stocksOk++;
    else if (stats.stocksFailed === coverageReport.filter((s) => s.status === "FAILED").length + 1) stats.stocksFailed++;
    else stats.stocksPartial++;

    coverageReport.push({ symbol, instrumentKey, status: stockOk ? "OK" : "PARTIAL", ...stockCoverage });
  }

  // write coverage report
  const reportPath = path.join(OUT_DIR, `coverage-report-${today}.json`);
  atomicWrite(reportPath, { generatedAt: new Date().toISOString(), rangeFrom, rangeTo, sessions: sessions.length, constituents: constituents.length, stats, perStock: coverageReport });

  console.log(`\n── summary ────────────────────────────────────────`);
  console.log(`  sessions        : ${sessions.length} (${rangeFrom} → ${rangeTo})`);
  console.log(`  stocks OK       : ${stats.stocksOk}`);
  console.log(`  stocks PARTIAL  : ${stats.stocksPartial}`);
  console.log(`  stocks FAILED   : ${stats.stocksFailed}`);
  console.log(`  sessions OK     : ${stats.sessionsOk}`);
  console.log(`  sessions PARTIAL: ${stats.sessionsPartial}`);
  console.log(`  sessions MISSING: ${stats.sessionsMissing}`);
  console.log(`  total candles   : ${stats.totalCandles}`);
  console.log(`  coverage report : ${reportPath}`);

  if (stats.stocksFailed > constituents.length * 0.5) { console.error("CRITICAL: >50% stocks failed"); process.exit(1); }
  if (stats.stocksFailed > 0 || stats.sessionsMissing > sessions.length * 0.2) process.exit(2);
}

main().catch((err) => { console.error("FATAL:", err.message); process.exit(1); });
