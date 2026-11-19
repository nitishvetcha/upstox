/* eslint-disable @typescript-eslint/no-explicit-any -- research/verification script; typed interfaces deferred to avoid changing its logic */
// Integrity verification and cleaning of an immutable Upstox raw store. Reads raw files only. Writes a NEW output
// directory and refuses to overwrite one. A file is accepted only if its file-level checks pass; bar-level anomalies
// (out-of-range, OHLC inconsistency, off-grid time) are dropped and counted, never repaired.
// usage: node --experimental-strip-types scripts/upstox-verify-clean.ts <v1|v2> <rawDir> <outDir> [calendarRawDir]
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { planChunks, expectedBarsPerSession, type Chunk } from "../src/lib/services/historicalCandles.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const END_DATE = "2026-11-05";
type Interval = "1d" | "1h" | "15m";
type Bar = [string, number, number, number, number, number];
interface Inst { key: string; symbol: string }
interface Job { interval: Interval; start: string; scope: "all" | "equities" }
const PLANS: Record<string, Job[]> = {
  v1: [{ interval: "1d", start: "2000-01-01", scope: "all" }, { interval: "1h", start: "2022-01-01", scope: "equities" }],
  v2: [{ interval: "15m", start: "2022-01-01", scope: "equities" }],
  "daily-universe": [{ interval: "1d", start: "2000-01-01", scope: "equities" }],
  pilot: [{ interval: "1d", start: "2000-01-01", scope: "equities" }, { interval: "1h", start: "2022-01-01", scope: "equities" }, { interval: "15m", start: "2022-01-01", scope: "equities" }],
};
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/;
const GRID_1H = new Set(["09:15", "10:15", "11:15", "12:15", "13:15", "14:15", "15:15"]);
const sha = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");
const safe = (k: string) => k.replace(/[^A-Za-z0-9]+/g, "_");
const fileNameOf = (key: string, interval: Interval, c: Chunk) => `${safe(key)}__${interval}__${c.from}_${c.to}.json`;
const dateOf = (t: string) => t.slice(0, 10);
const minutesOf = (t: string) => Number(t.slice(11, 13)) * 60 + Number(t.slice(14, 16));

// Trading calendar: a date is a session if at least half of the equities listed by then have a bar that day.
// The index series is NOT used (it publishes zero-volume holiday bars). Equity first dates are returned for listing.
function calendarFrom(calRawDir: string) {
  const dir = path.join(calRawDir, "1d");
  const daysByKey = new Map<string, Set<string>>();
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".json") || !f.startsWith("NSE_EQ_")) continue;
    const rec = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const set = daysByKey.get(rec.instrumentKey) ?? new Set<string>();
    for (const row of rec.body?.data?.candles ?? []) set.add(dateOf(row[0]));
    daysByKey.set(rec.instrumentKey, set);
  }
  const firstDaily = new Map<string, string>();
  const perDay = new Map<string, number>();
  for (const [key, set] of daysByKey) {
    firstDaily.set(key, [...set].sort()[0]);
    for (const d of set) perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  const firsts = [...firstDaily.values()];
  const sessions = [...perDay.keys()].sort().filter((d) => {
    const listed = firsts.filter((f) => f <= d).length;
    return listed > 0 && (perDay.get(d) ?? 0) >= Math.max(1, Math.ceil(listed / 2));
  });
  return { sessions, firstDaily, equities: daysByKey.size };
}

interface FileResult {
  rel: string; key: string; symbol: string; interval: Interval; chunk: Chunk;
  present: boolean; fileValid: boolean; issues: string[]; fileSha256: string | null;
  bodyHashReproducible: boolean | null; rawCandles: number; droppedBars: Record<string, number>; bars: Bar[];
}

function checkFile(rawDir: string, rel: string, inst: Inst, interval: Interval, chunk: Chunk): FileResult {
  const base = { rel, key: inst.key, symbol: inst.symbol, interval, chunk, bars: [] as Bar[], rawCandles: 0, droppedBars: {} as Record<string, number> };
  const p = path.join(rawDir, rel);
  if (!fs.existsSync(p)) return { ...base, present: false, fileValid: false, issues: ["missing file"], fileSha256: null, bodyHashReproducible: null };
  const bytes = fs.readFileSync(p);
  const fileSha256 = sha(bytes);
  let rec: any;
  try { rec = JSON.parse(bytes.toString("utf8")); } catch { return { ...base, present: true, fileValid: false, issues: ["unparseable JSON"], fileSha256, bodyHashReproducible: null }; }
  const issues: string[] = [];
  if (rec.schema !== "upstox-raw-chunk-1") issues.push("schema");
  if (rec.instrumentKey !== inst.key) issues.push("instrumentKey mismatch");
  if (rec.interval !== interval) issues.push("interval mismatch");
  if (rec.from !== chunk.from || rec.to !== chunk.to) issues.push("chunk range mismatch");
  if (rec.httpStatus !== 200) issues.push(`httpStatus ${rec.httpStatus}`);
  if (!rec.body || rec.body.status !== "success") issues.push("body status not success");
  const candles = rec.body?.data?.candles;
  if (!Array.isArray(candles)) issues.push("no candles array");
  else if (rec.candleCount !== candles.length) issues.push("candleCount mismatch");
  const bodyHashReproducible = rec.body ? sha(JSON.stringify(rec.body)) === rec.bodySha256 : null;
  if (issues.length || !Array.isArray(candles)) return { ...base, present: true, fileValid: false, issues, fileSha256, bodyHashReproducible, rawCandles: Array.isArray(candles) ? candles.length : 0 };

  const drop = (k: string) => { base.droppedBars[k] = (base.droppedBars[k] ?? 0) + 1; };
  const seen = new Set<string>();
  for (const r of candles as unknown[]) {
    base.rawCandles++;
    if (!Array.isArray(r) || r.length < 6) { drop("malformed row"); continue; }
    const [t, o, h, l, c, v] = r as [string, number, number, number, number, number];
    if (typeof t !== "string" || !TS_RE.test(t)) { drop("bad timestamp format"); continue; }
    if (![o, h, l, c, v].every((x) => typeof x === "number" && Number.isFinite(x))) { drop("non-numeric field"); continue; }
    const d = dateOf(t);
    if (d < chunk.from || d > chunk.to) { drop("outside chunk range"); continue; }
    if (!(o > 0 && h > 0 && l > 0 && c > 0) || v < 0 || h + 1e-9 < Math.max(o, c) || l - 1e-9 > Math.min(o, c)) { drop("OHLC inconsistent"); continue; }
    if (interval === "15m") {
      const m = minutesOf(t);
      if (m < 555 || m > 915 || (m - 555) % 15 !== 0) { drop("off-grid time"); continue; }
    }
    if (interval === "1h" && !GRID_1H.has(t.slice(11, 16))) { drop("off-grid time"); continue; }
    if (seen.has(t)) { drop("duplicate timestamp"); continue; }
    seen.add(t);
    base.bars.push([t, o, h, l, c, v]);
  }
  return { ...base, present: true, fileValid: true, issues, fileSha256, bodyHashReproducible };
}

function main() {
  const [plan, rawDir, outDir, calArg] = process.argv.slice(2);
  if (!PLANS[plan] || !rawDir || !outDir) throw new Error("usage: <v1|v2> <rawDir> <outDir> [calendarRawDir]");
  if (fs.existsSync(outDir)) throw new Error(`${outDir} exists; verification outputs are written once`);
  const calRawDir = calArg ?? path.join(ROOT, ".research-data", "upstox-raw-2026-11-06-v1");
  fs.mkdirSync(path.join(outDir, "series"), { recursive: true });

  const universe = JSON.parse(fs.readFileSync(path.join(rawDir, "universe.json"), "utf8")) as { indices: Inst[]; equities: Inst[] };
  const cal = calendarFrom(calRawDir);
  const calSet = new Set(cal.sessions);

  // 1. Expected files = the registered plan applied to the universe file.
  const expected: { inst: Inst; interval: Interval; chunk: Chunk; rel: string; plannedStart: string }[] = [];
  for (const job of PLANS[plan]) {
    const insts = job.scope === "all" ? [...universe.indices, ...universe.equities] : universe.equities;
    for (const inst of insts) for (const chunk of planChunks(job.start, END_DATE, job.interval)) {
      expected.push({ inst, interval: job.interval, chunk, rel: path.join(job.interval, fileNameOf(inst.key, job.interval, chunk)), plannedStart: job.start });
    }
  }
  const expectedRel = new Set(expected.map((e) => e.rel));

  // 2. Manifest cross-check.
  const manifestRows = fs.readFileSync(path.join(rawDir, "manifest.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const storedByKey = new Map<string, any[]>();
  let failedRows = 0, stopRows = 0;
  for (const r of manifestRows) {
    if (r.stop) stopRows++;
    if (r.result === "FAILED") failedRows++;
    if (r.result === "STORED") {
      const k = `${r.key}|${r.interval}|${r.from}|${r.to}`;
      storedByKey.set(k, [...(storedByKey.get(k) ?? []), r]);
    }
  }
  const duplicateStored = [...storedByKey.values()].filter((v) => v.length > 1).length;

  // 3. Per-file checks.
  const results = expected.map((e) => checkFile(rawDir, e.rel, e.inst, e.interval, e.chunk));
  const invalid = results.filter((r) => !r.fileValid);
  const missingFiles = results.filter((r) => !r.present).map((r) => r.rel);
  const manifestMismatch: string[] = [];
  for (const e of expected) {
    const rows = storedByKey.get(`${e.inst.key}|${e.interval}|${e.chunk.from}|${e.chunk.to}`) ?? [];
    const r = results.find((x) => x.rel === e.rel)!;
    if (rows.length === 0) manifestMismatch.push(`no STORED manifest row: ${e.rel}`);
    else if (r.present && rows[0].file !== path.basename(e.rel)) manifestMismatch.push(`file name differs from manifest: ${e.rel}`);
    else if (r.fileValid && rows[0].candleCount !== r.rawCandles) manifestMismatch.push(`candleCount differs from manifest: ${e.rel}`);
  }
  const onDisk = new Set<string>();
  const tmpFiles: string[] = [];
  for (const job of PLANS[plan]) {
    const dir = path.join(rawDir, job.interval);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const rel = path.join(job.interval, f);
      if (f.endsWith(".tmp")) tmpFiles.push(rel);
      else onDisk.add(rel);
    }
  }
  const extraFiles = [...onDisk].filter((r) => !expectedRel.has(r));

  // 4. Series: merge valid chunks, dedupe, check sessions against the calendar and the listing start.
  // Listing start for instruments absent from the calendar source: the first daily bar in this dataset.
  const ownFirstDaily = new Map<string, string>();
  for (const e of expected) {
    if (e.interval !== "1d" || ownFirstDaily.has(e.inst.key)) continue;
    const f = checkFile(rawDir, e.rel, e.inst, "1d", e.chunk);
    if (f.bars.length) ownFirstDaily.set(e.inst.key, dateOf(f.bars[0][0]));
  }
  const groups = new Map<string, typeof expected>();
  for (const e of expected) {
    const k = `${e.inst.key}|${e.interval}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const series: Record<string, unknown>[] = [];
  for (const [k, list] of groups) {
    const { inst, interval } = list[0];
    const files = list.map((e) => results.find((r) => r.rel === e.rel)!);
    const bars = new Map<string, Bar>();
    let conflicts = 0, dupAcross = 0;
    const dropped: Record<string, number> = {};
    let raw = 0;
    for (const f of files) {
      raw += f.rawCandles;
      for (const [reason, n] of Object.entries(f.droppedBars)) dropped[reason] = (dropped[reason] ?? 0) + n;
      for (const b of f.bars) {
        const prev = bars.get(b[0]);
        if (prev) { dupAcross++; if (prev.slice(1).join() !== b.slice(1).join()) conflicts++; continue; }
        bars.set(b[0], b);
      }
    }
    const sorted = [...bars.values()].sort((a, b) => a[0].localeCompare(b[0]));
    const counts = new Map<string, number>();
    for (const b of sorted) counts.set(dateOf(b[0]), (counts.get(dateOf(b[0])) ?? 0) + 1);
    const listing = cal.firstDaily.get(inst.key) ?? ownFirstDaily.get(inst.key);
    const start = listing && listing > list[0].plannedStart ? listing : list[0].plannedStart;
    const expectedSessions = cal.sessions.filter((d) => d >= start && d <= END_DATE);
    const missing = expectedSessions.filter((d) => !counts.has(d));
    const partial = expectedSessions.filter((d) => counts.has(d) && (counts.get(d) as number) < expectedBarsPerSession(interval, d));
    const extra = [...counts.keys()].filter((d) => !calSet.has(d));
    const outName = `${safe(inst.key)}__${interval}.json`;
    const body = JSON.stringify({ key: inst.key, symbol: inst.symbol, interval, bars: sorted });
    fs.writeFileSync(path.join(outDir, "series", outName), body);
    series.push({
      key: inst.key, symbol: inst.symbol, interval, listingStart: start,
      chunksExpected: list.length, chunksValid: files.filter((f) => f.fileValid).length,
      rawCandles: raw, uniqueBars: sorted.length, duplicateAcrossChunks: dupAcross, conflictingDuplicates: conflicts,
      droppedBars: dropped, droppedTotal: Object.values(dropped).reduce((a, b) => a + b, 0),
      firstBar: sorted[0]?.[0] ?? null, lastBar: sorted.at(-1)?.[0] ?? null,
      expectedSessions: expectedSessions.length, sessionsWithBars: counts.size,
      missingSessions: { count: missing.length, sample: missing.slice(0, 10) },
      partialSessions: { count: partial.length, sample: partial.slice(0, 10) },
      extraSessions: { count: extra.length, sample: extra.slice(0, 10) },
      cleanedSha256: sha(body),
    });
  }

  const verification = {
    plan, rawDir: path.relative(ROOT, rawDir), calendarSource: path.relative(ROOT, calRawDir),
    expectedFiles: expected.length, presentFiles: results.filter((r) => r.present).length,
    validFiles: results.filter((r) => r.fileValid).length,
    missingFiles, invalidFiles: invalid.map((r) => ({ rel: r.rel, issues: r.issues })),
    extraFiles, tmpFiles, manifestRows: manifestRows.length, manifestFailedRows: failedRows, manifestStopRows: stopRows,
    manifestDuplicateStoredRows: duplicateStored, manifestMismatches: manifestMismatch,
    bodyHashReproducible: { yes: results.filter((r) => r.bodyHashReproducible === true).length, no: results.filter((r) => r.bodyHashReproducible === false).length },
    rawCandlesTotal: results.reduce((a, r) => a + r.rawCandles, 0),
    calendar: { sessions: cal.sessions.length, from: cal.sessions[0], to: cal.sessions.at(-1), rule: ">= half of equities listed by that date have a bar" },
    fileHashes: results.map((r) => ({ rel: r.rel, sha256: r.fileSha256 })),
  };
  fs.writeFileSync(path.join(outDir, "verification.json"), JSON.stringify(verification, null, 1));
  fs.writeFileSync(path.join(outDir, "coverage.json"), JSON.stringify({ plan, series }, null, 1));
  fs.writeFileSync(path.join(outDir, "calendar.json"), JSON.stringify({ sessions: cal.sessions, firstDaily: Object.fromEntries(cal.firstDaily) }, null, 1));
  fs.writeFileSync(path.join(outDir, "run-manifest.json"), JSON.stringify({ createdAt: new Date().toISOString(), script: "scripts/upstox-verify-clean.ts", manifestSha256: sha(fs.readFileSync(path.join(rawDir, "manifest.jsonl"))), universeSha256: sha(fs.readFileSync(path.join(rawDir, "universe.json"))) }, null, 1));
  console.log(JSON.stringify({
    expectedFiles: verification.expectedFiles, validFiles: verification.validFiles, missing: missingFiles.length,
    invalid: invalid.length, extra: extraFiles.length, tmp: tmpFiles.length, manifestMismatches: manifestMismatch.length,
    series: series.length, outDir: path.relative(ROOT, outDir),
  }));
}

main();
