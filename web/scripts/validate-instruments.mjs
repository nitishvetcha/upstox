// READ-ONLY validation: configured breadth constituents + derivative lot sizes vs the Upstox NSE instrument master.
// Run: node scripts/validate-instruments.mjs   (no token needed; instrument master is public)
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

const URL_ = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";
const t0 = Date.now();
const res = await fetch(URL_);
const master = JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8"));
console.log(`instrument master: HTTP ${res.status}, ${master.length} rows, ${Date.now() - t0} ms, fetched ${new Date().toISOString()}`);

// Parse the config file textually so this script is independent of app code.
const cfg = readFileSync(new URL("../src/lib/services/breadthConstituents.generated.ts", import.meta.url), "utf8");
const block = (name) => {
  const s = cfg.indexOf(`export const ${name}`);
  const e = cfg.indexOf("] as const;", s);
  return [...cfg.slice(s, e).matchAll(/"symbol": "([^"]+)"[^}]*?"instrumentKey": "([^"]+)"/g)].map((m) => ({ symbol: m[1], key: m[2] }));
};

const eqByKey = new Map(master.filter((x) => x.segment === "NSE_EQ").map((x) => [x.instrument_key, x]));
const eqBySymbol = new Map(master.filter((x) => x.segment === "NSE_EQ" && x.instrument_type === "EQ").map((x) => [x.trading_symbol, x]));

for (const name of ["NIFTY_50", "BANK_NIFTY"]) {
  const list = block(name);
  let valid = 0;
  const bad = [];
  for (const c of list) {
    const byKey = eqByKey.get(c.key);
    const bySym = eqBySymbol.get(c.symbol);
    if (byKey && byKey.trading_symbol === c.symbol && byKey.instrument_type === "EQ") valid++;
    else bad.push({ symbol: c.symbol, configuredKey: c.key, keyFoundAs: byKey?.trading_symbol ?? null, symbolCurrentKey: bySym?.instrument_key ?? null, symbolName: bySym?.name ?? null });
  }
  console.log(`\n${name}: configured=${list.length} valid=${valid} invalid=${bad.length}`);
  for (const b of bad) console.log("  INVALID", JSON.stringify(b));
}

// Derivative lot sizes for the nearest expiries.
for (const [label, under] of [["NIFTY", "NSE_INDEX|Nifty 50"], ["BANKNIFTY", "NSE_INDEX|Nifty Bank"]]) {
  const fo = master.filter((x) => x.segment === "NSE_FO" && x.underlying_key === under && x.expiry >= Date.now() - 86_400_000);
  for (const type of ["CE", "FUT"]) {
    const rows = fo.filter((x) => x.instrument_type === type).sort((a, b) => a.expiry - b.expiry);
    const lots = [...new Set(rows.map((x) => x.lot_size))];
    const near = rows[0];
    console.log(`${label} ${type}: distinct lot sizes=${JSON.stringify(lots)} nearest=${near?.trading_symbol} lot=${near?.lot_size}`);
  }
}
