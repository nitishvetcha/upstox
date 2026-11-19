#!/usr/bin/env node
import { assertCollectionAuthorized } from "./lib/collectionGuard.mjs";
assertCollectionAuthorized("collect-intraday-bars.mjs", "upstox");

// Research-only 1-minute stock collector (NIFTY 50). Reads candles through /api/research/stock-candles only.
// It never calls the paper-trading collect/monitor endpoints and never writes under the production data root.
// Run:  node scripts/collect-intraday-bars.mjs            (dry-run: no requests, no writes)
//       node scripts/collect-intraday-bars.mjs --live     (requires a running app and a valid login)
import * as fs from "node:fs";
import * as path from "node:path";
import { BASE, serverUp } from "./upstox-cli.mjs";
import { resolveOutDir, runCollection, atomicWriteJson, writeDecision } from "./lib/intraday-core.mjs";

const LIVE = process.argv.includes("--live");
const CWD = process.cwd();
const CONSTITUENT_SRC = path.resolve(CWD, "src/lib/services/breadthConstituents.generated.ts");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadConstituents() {
  const src = fs.readFileSync(CONSTITUENT_SRC, "utf8");
  const match = src.match(/export const NIFTY_50 = (\[[\s\S]*?\n\])/);
  if (!match) throw new Error("Could not parse NIFTY_50 from breadthConstituents.generated.ts");
  const list = JSON.parse(match[1]);
  if (!Array.isArray(list) || list.length !== 50) throw new Error(`Expected 50 constituents, got ${Array.isArray(list) ? list.length : typeof list}`);
  for (const c of list) {
    if (!c.symbol || !c.name || !c.isin || !c.instrumentKey) throw new Error(`Constituent missing required fields: ${c.symbol ?? "?"}`);
  }
  return list;
}

function istToday(nowIso) {
  return new Date(Date.parse(nowIso) + 330 * 60_000).toISOString().slice(0, 10);
}

async function main() {
  const nowIso = new Date().toISOString();
  const date = process.env.COLLECT_DATE ?? istToday(nowIso);
  const outDir = resolveOutDir(CWD);
  const constituents = loadConstituents();
  console.log(`collect-intraday-bars  mode=${LIVE ? "LIVE" : "DRY-RUN"}  session=${date}  stocks=${constituents.length}`);
  console.log(`output: ${outDir}`);

  if (!LIVE) {
    const result = await runCollection({ constituents, date, nowIso, live: false, base: BASE, outDir, fetchImpl: null, sleep });
    if (result.aborted) {
      console.log(`not run: ${result.aborted} (the session has not closed yet)`);
      return 0;
    }
    const wouldFetch = result.stocks.filter((s) => s.action === "WOULD_FETCH").length;
    console.log(`dry-run: ${wouldFetch} stock(s) would be fetched, ${result.stocks.length - wouldFetch} already exist. No requests made.`);
    console.log("Pass --live to fetch and write.");
    return 0;
  }

  if (!(await serverUp())) {
    console.error("ERROR: app server not running. Start it yourself (npm run dev:upstox), then retry.");
    return 1;
  }
  fs.mkdirSync(outDir, { recursive: true });
  const snapshotPath = path.join(outDir, `constituents-snapshot-${date}.json`);
  if (writeDecision(snapshotPath) === "WRITE") {
    atomicWriteJson(snapshotPath, { date, generatedAt: nowIso, source: "breadthConstituents.generated.ts", count: constituents.length, constituents });
  }

  const result = await runCollection({ constituents, date, nowIso, live: true, base: BASE, outDir, fetchImpl: fetch, sleep });
  if (result.aborted === "AUTH") {
    console.error(`ABORTED: ${result.error}`);
    return 3;
  }
  if (result.aborted) {
    console.error(`not run: ${result.aborted}`);
    return 1;
  }
  for (const s of result.stocks) {
    if (s.action === "WRITTEN") console.log(`  ${s.status.padEnd(7)} ${s.symbol.padEnd(12)} ${s.candleCount} bars`);
    else if (s.action === "FAILED") console.log(`  FAILED  ${s.symbol.padEnd(12)} ${s.error}`);
    else console.log(`  skip    ${s.symbol.padEnd(12)} already collected`);
  }
  const { OK, PARTIAL, EMPTY, FAILED, SKIPPED } = result.counts;
  console.log(`\nsummary: OK=${OK} PARTIAL=${PARTIAL} EMPTY=${EMPTY} FAILED=${FAILED} SKIPPED=${SKIPPED}`);
  if (FAILED > constituents.length / 2) return 1;
  if (FAILED || PARTIAL || EMPTY) return 2;
  return 0;
}

main().then((code) => { process.exitCode = code; }).catch((err) => { console.error("FATAL:", err.message); process.exitCode = 1; });
