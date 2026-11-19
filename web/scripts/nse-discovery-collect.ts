import { assertCollectionAuthorized } from "./lib/collectionGuard.mjs";
assertCollectionAuthorized("nse-discovery-collect.ts", "external");

// Free NSE public data, approved by the owner: F&O bhavcopy (daily option OHLC, volume, OI, lot size) and corporate
// actions. Resumable, throttled, immutable raw store in a NEW directory, manifest per request, stops below 2 GiB free.
// Downloaded archives are stored as bytes and never executed.
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

const ROOT = path.resolve(import.meta.dirname, "..");
const CLEAN = path.join(ROOT, ".research-data", "upstox-clean-2026-11-06-v1");
const OUT = path.join(ROOT, ".research-data", "nse-bhavcopy-2026-11-06");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const THROTTLE_MS = 1500;
const FLOOR_BYTES = 2 * 1024 ** 3;
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const NEW_FORMAT_FROM = "2024-07-08"; // the archive file name changed; both formats are tried, the expected one first

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");

function calendar(): string[] {
  const perDay = new Map<string, number>();
  const first = new Map<string, string>();
  for (const f of fs.readdirSync(CLEAN)) {
    if (!f.startsWith("NSE_EQ_") || !f.endsWith("__1d.json")) continue;
    const doc = JSON.parse(fs.readFileSync(path.join(CLEAN, f), "utf8")) as { bars: { t: string }[] };
    for (const b of doc.bars) {
      const d = b.t.slice(0, 10);
      perDay.set(d, (perDay.get(d) ?? 0) + 1);
      if (!first.has(f)) first.set(f, d);
    }
  }
  const starts = [...first.values()];
  const days = [...perDay.keys()].sort();
  return days.filter((d) => {
    const listed = starts.filter((s) => s <= d).length;
    return listed > 0 && (perDay.get(d) ?? 0) >= Math.max(1, Math.ceil(listed / 2));
  });
}

function bhavUrls(day: string): string[] {
  const [y, m, d] = day.split("-");
  const compact = `${y}${m}${d}`;
  const oldUrl = `https://archives.nseindia.com/content/historical/DERIVATIVES/${y}/${MON[+m - 1]}/fo${d}${MON[+m - 1]}${y}bhav.csv.zip`;
  const newUrl = `https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${compact}_F_0000.csv.zip`;
  return day >= NEW_FORMAT_FROM ? [newUrl, oldUrl] : [oldUrl, newUrl];
}

async function get(url: string): Promise<{ status: number; body: Buffer }> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, signal: AbortSignal.timeout(60_000) });
  return { status: res.status, body: Buffer.from(await res.arrayBuffer()) };
}

function freeBytes(dir: string) {
  const s = fs.statfsSync(dir);
  return Number(s.bavail) * Number(s.bsize);
}

async function main() {
  fs.mkdirSync(path.join(OUT, "bhavcopy"), { recursive: true });
  fs.mkdirSync(path.join(OUT, "corporate-actions"), { recursive: true });
  const manifest = path.join(OUT, "manifest.jsonl");
  const days = calendar();
  let stored = 0, skipped = 0, missing = 0;
  // Corporate actions by calendar year first (small); then bhavcopy day by day.
  for (const year of [...new Set(days.map((d) => d.slice(0, 4)))]) {
    const target = path.join(OUT, "corporate-actions", `${year}.json`);
    if (fs.existsSync(target)) { skipped++; continue; }
    const url = `https://www.nseindia.com/api/corporates-corporateActions?index=equities&from_date=01-01-${year}&to_date=31-12-${year}`;
    const r = await get(url);
    fs.appendFileSync(manifest, JSON.stringify({ kind: "corporate-actions", year, httpStatus: r.status, bytes: r.body.length, sha256: sha(r.body) }) + "\n");
    if (r.status === 200) fs.writeFileSync(target, r.body);
    await sleep(THROTTLE_MS);
  }
  for (const day of days) {
    const target = path.join(OUT, "bhavcopy", `${day}.zip`);
    if (fs.existsSync(target)) { skipped++; continue; }
    if (freeBytes(OUT) < FLOOR_BYTES) { console.log(JSON.stringify({ stop: "disk floor", freeGiB: (freeBytes(OUT) / 1024 ** 3).toFixed(2) })); return; }
    let got: Buffer | null = null, used = "";
    for (const url of bhavUrls(day)) {
      const r = await get(url);
      await sleep(THROTTLE_MS);
      fs.appendFileSync(manifest, JSON.stringify({ kind: "bhavcopy", day, url, httpStatus: r.status, bytes: r.body.length, sha256: r.status === 200 ? sha(r.body) : null }) + "\n");
      if (r.status === 200 && r.body.length > 1000) { got = r.body; used = url; break; }
      if (r.status === 403 || r.status === 429) { console.log(JSON.stringify({ stop: "access refused", day, status: r.status })); return; }
    }
    if (got) {
      const tmp = target + ".tmp";
      fs.writeFileSync(tmp, got);
      fs.renameSync(tmp, target);
      stored++;
    } else {
      missing++; // non-trading or unavailable day: recorded in the manifest, never fabricated
    }
  }
  console.log(JSON.stringify({ done: true, calendarDays: days.length, stored, skipped, missing, outDir: path.relative(ROOT, OUT) }));
}

main();
