import { assertCollectionAuthorized } from "./lib/collectionGuard.mjs";
assertCollectionAuthorized("upstox-discovery.mjs", "upstox");

// Phase A: Upstox historical-data discovery. Read-only GET requests, sequential, rate-limited, one attempt per probe.
// Raw responses are stored unchanged in a NEW isolated directory with a SHA-256 manifest. Nothing in .data/ or
// .research-data/ existing records is read for writing or modified. The access token is read from web/.env.local and
// is never printed or stored.
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, ".research-data", "upstox-discovery-2026-11-06");
const API = "https://api.upstox.com";
const DELAY_MS = 600;

function readToken() {
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const m = env.match(/^UPSTOX_ANALYTICS_TOKEN=(.+)$/m);
  if (!m || !m[1].trim()) throw new Error("UPSTOX_ANALYTICS_TOKEN not configured");
  return m[1].trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

async function call(token, label, urlPath) {
  const url = API + urlPath;
  let res, text;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
      text = await res.text();
      if (res.status === 429) { await sleep(3000 * attempt); continue; }
      break;
    } catch (e) {
      text = String(e.message);
      res = { status: 0 };
      await sleep(2000 * attempt);
    }
  }
  await sleep(DELAY_MS);
  let body = null;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  const candles = Array.isArray(body?.data?.candles) ? body.data.candles : null;
  const errorCodes = Array.isArray(body?.errors) ? body.errors.map((e) => e.errorCode).filter(Boolean) : [];
  const record = {
    label,
    path: urlPath,
    httpStatus: res.status,
    errorCodes,
    errorMessage: Array.isArray(body?.errors) ? body.errors[0]?.message ?? null : null,
    candleCount: candles ? candles.length : null,
    firstCandle: candles?.length ? candles[candles.length - 1][0] : null,
    lastCandle: candles?.length ? candles[0][0] : null,
    responseSha256: sha(text),
    checkedAt: new Date().toISOString(),
  };
  fs.mkdirSync(OUT, { recursive: true });
  const fname = `${label.replace(/[^\w-]+/g, "_")}.json`;
  fs.writeFileSync(path.join(OUT, fname), text);
  return record;
}

const enc = encodeURIComponent;
const probes = [
  // Expired-contract history: the October run recorded UDAPI1149 (Plus plan). One request, to confirm the current state.
  ["expired-expiries-nifty", "/v2/expired-instruments/expiries?instrument_key=" + enc("NSE_INDEX|Nifty 50")],
  // Index daily depth before and after 2000, all six registered indices (v3 days unit).
  ["idx-nifty-daily-1990-2000", "/v3/historical-candle/" + enc("NSE_INDEX|Nifty 50") + "/days/1/2000-12-31/1990-01-01"],
  ["idx-banknifty-daily-1990-2000", "/v3/historical-candle/" + enc("NSE_INDEX|Nifty Bank") + "/days/1/2000-12-31/1990-01-01"],
  ["idx-finnifty-daily-2000-2026", "/v3/historical-candle/" + enc("NSE_INDEX|Nifty Fin Service") + "/days/1/2026-10-02/2000-01-01"],
  ["idx-midcpnifty-daily-2000-2026", "/v3/historical-candle/" + enc("NSE_INDEX|NIFTY MID SELECT") + "/days/1/2026-10-02/2000-01-01"],
  ["idx-sensex-daily-2000-2026", "/v3/historical-candle/" + enc("BSE_INDEX|SENSEX") + "/days/1/2026-10-02/2000-01-01"],
  ["idx-bankex-daily-2000-2026", "/v3/historical-candle/" + enc("BSE_INDEX|BANKEX") + "/days/1/2026-10-02/2000-01-01"],
  // Stock daily: fill-the-gap test (2019-09-18 .. 2021-12-31) and depth before 2000, for one stock (RELIANCE).
  ["stk-reliance-daily-gap-2019-2021", "/v3/historical-candle/" + enc("NSE_EQ|INE002A01018") + "/days/1/2021-12-31/2019-09-18"],
  ["stk-reliance-daily-pre2000", "/v3/historical-candle/" + enc("NSE_EQ|INE002A01018") + "/days/1/1999-12-31/1990-01-01"],
  // Intraday depth: 2021-12 (before the stated 2022-01-01 limit) and the 2022 start, at 60, 15 and 5 minutes.
  ["stk-reliance-60m-2021-12", "/v3/historical-candle/" + enc("NSE_EQ|INE002A01018") + "/hours/1/2021-12-31/2021-12-01"],
  ["stk-reliance-15m-2022-01", "/v3/historical-candle/" + enc("NSE_EQ|INE002A01018") + "/minutes/15/2022-01-31/2022-01-03"],
  ["stk-reliance-5m-2022-01", "/v3/historical-candle/" + enc("NSE_EQ|INE002A01018") + "/minutes/5/2022-01-10/2022-01-03"],
  // Corporate actions: no endpoint is documented in this codebase. One probe, to record the answer.
  ["corporate-actions-reliance", "/v2/corporate-actions?instrument_key=" + enc("NSE_EQ|INE002A01018")],
];

const token = readToken();
const results = [];
for (const [label, p] of probes) {
  const r = await call(token, label, p);
  results.push(r);
  console.log(JSON.stringify({ label: r.label, status: r.httpStatus, errors: r.errorCodes, candles: r.candleCount, first: r.firstCandle, last: r.lastCandle }));
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "_summary.json"), JSON.stringify({ createdAt: new Date().toISOString(), probes: results }, null, 2));
console.log("summary written:", path.relative(ROOT, path.join(OUT, "_summary.json")));
