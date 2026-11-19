import { assertCollectionAuthorized } from "./lib/collectionGuard.mjs";
assertCollectionAuthorized("options-research-inventory.ts", "upstox");

// Historical Options Research Lab — measures what historical options data actually exists. Read-only Upstox calls.
// Writes a new file per run: .data/options-research/inventory_<id>.json (never overwrites).
// Run: node scripts/options-research-inventory.ts
import { mkdirSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { getAccessToken } from "../src/lib/services/upstoxAuth.ts";
import { loadHistory } from "../src/lib/marketHistory.ts";
import { upstoxHistoryFetcher } from "../src/lib/services/upstoxMarket.ts";
import { INSTRUMENTS } from "../src/lib/services/instrumentRegistry.ts";
import { INVENTORY_VERSION, classifyLocalDataset, experimentReadiness, type ContractProbe, type Inventory } from "../src/lib/research/optionsInventory.ts";

const token = await getAccessToken();
if (!token) { console.error("BLOCKER: Upstox not connected — log in and re-run"); process.exit(1); }
console.info = () => {};
const api = async (p: string) => {
  const r = await fetch(`https://api.upstox.com${p}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  return { status: r.status, body: (await r.json().catch(() => null)) as { data?: unknown; errors?: { errorCode?: string; message?: string }[] } | null };
};
const ymd = (d: Date) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
const today = ymd(new Date());
const daysAgo = (n: number) => ymd(new Date(Date.now() - n * 86_400_000));
const INDICES = ["nifty", "banknifty"] as const;

// 1. Expired-contract history (the only source for completed expiries)
const ex = await api(`/v2/expired-instruments/expiries?instrument_key=${encodeURIComponent(INSTRUMENTS.nifty.underlyingKey)}`);
const expiredOk = ex.status === 200 && Array.isArray(ex.body?.data);
const expiredHistory = { available: expiredOk, status: ex.status, errorCode: ex.body?.errors?.[0]?.errorCode ?? null, message: ex.body?.errors?.[0]?.message ?? null };
const completedExpiriesRetrievable = expiredOk ? (ex.body!.data as string[]).filter((e) => e < today).length : 0;

// 2. Active contracts: nearest 3 expiries + furthest, ATM CE and PE
const activeContracts: ContractProbe[] = [];
const activeExpiries: Inventory["activeExpiries"] = {};
for (const index of INDICES) {
  const key = INSTRUMENTS[index].underlyingKey;
  const contracts = ((await api(`/v2/option/contract?instrument_key=${encodeURIComponent(key)}`)).body?.data ?? []) as { instrument_key: string; trading_symbol: string; expiry: string; strike_price: number; instrument_type: "CE" | "PE" }[];
  const expiries = [...new Set(contracts.map((c) => c.expiry))].sort();
  activeExpiries[index] = { count: expiries.length, nearest: expiries[0] ?? null, furthest: expiries.at(-1) ?? null };
  const q = (await api(`/v2/market-quote/quotes?instrument_key=${encodeURIComponent(key)}`)).body?.data as Record<string, { last_price?: number }> | undefined;
  const spot = Object.values(q ?? {})[0]?.last_price ?? 0;
  for (const e of [...expiries.slice(0, 3), expiries.at(-1)!].filter(Boolean)) {
    for (const type of ["CE", "PE"] as const) {
      const c = contracts.filter((x) => x.expiry === e && x.instrument_type === type).sort((a, b) => Math.abs(a.strike_price - spot) - Math.abs(b.strike_price - spot))[0];
      if (!c) continue;
      const k = encodeURIComponent(c.instrument_key);
      const d = ((await api(`/v3/historical-candle/${k}/days/1/${today}/${daysAgo(700)}`)).body?.data as { candles?: unknown[][] } | undefined)?.candles ?? [];
      const m = ((await api(`/v3/historical-candle/${k}/minutes/1/${today}/${daysAgo(27)}`)).body?.data as { candles?: unknown[][] } | undefined)?.candles ?? [];
      activeContracts.push({
        index, symbol: c.trading_symbol, expiry: e, type,
        dailyBars: d.length, dailyFirst: (d.at(-1)?.[0] as string | undefined)?.slice(0, 10) ?? null,
        minuteBars: m.length, minuteFirst: (m.at(-1)?.[0] as string) ?? null, minuteLast: (m[0]?.[0] as string) ?? null,
        volumePresent: m.some((r) => Number(r[5]) > 0), oiPresent: m.some((r) => r[6] !== undefined && r[6] !== null && Number(r[6]) > 0),
      });
    }
  }
}

// 3. Underlying index history (needed, but never a substitute for option prices)
const f = upstoxHistoryFetcher(token);
const underlying: Inventory["underlying"] = {};
for (const index of INDICES) {
  const h = await loadHistory(INSTRUMENTS[index].underlyingKey, "1d", "MAX", f);
  underlying[index] = { dailyFirst: h.candles[0]?.timestamp.slice(0, 10) ?? null, dailyBars: h.candles.length, intradayEarliest: "2022-01-01 (provider limit)" };
}

// 4. Field availability (measured where possible, otherwise stated with its source)
const anyOi = activeContracts.some((c) => c.oiPresent), anyVol = activeContracts.some((c) => c.volumePresent);
const fields: Inventory["fields"] = {
  optionOhlc: { available: activeContracts.some((c) => c.minuteBars > 0), source: "Upstox historical-candle (unexpired contracts only)", note: expiredOk ? "expired contracts also available" : "expired contracts blocked (Upstox Plus)" },
  volume: { available: anyVol, source: "candle field 5", note: "per bar" },
  openInterest: { available: anyOi, source: "candle field 6", note: "per bar, unexpired contracts only" },
  bidAsk: { available: false, source: "none", note: "No historical bid/ask in any Upstox history endpoint used here" },
  ivGreeks: { available: false, source: "none historical", note: "Chain IV/Greeks are live-only, untimestamped and unverified (options-audit-1). In-house IV can be recomputed from candles" },
  chainSnapshots: { available: false, source: "none", note: "No historical option-chain snapshot endpoint" },
  lotSizeHistory: { available: false, source: "current contract master only", note: "Past lot-size changes are not provided" },
  holidayCalendar: { available: false, source: "none", note: "Trading days are inferred from candles present; no official calendar feed" },
};

// 5. Local datasets, labelled
const dataDir = path.join(process.cwd(), ".data");
const localDatasets = readdirSync(dataDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => {
  const files = readdirSync(path.join(dataDir, d.name)).length;
  const cls = classifyLocalDataset(d.name);
  const fo = d.name === "history" ? readdirSync(path.join(dataDir, d.name)).filter((n) => n.includes("NSE_FO") || n.includes("BSE_FO")).length : 0;
  return { path: `.data/${d.name}`, class: cls.class, files, note: d.name === "history" && fo ? `${cls.note} (${fo} option files found — review)` : cls.note };
});

const createdAt = new Date().toISOString();
const inv: Inventory = { version: INVENTORY_VERSION, id: `inv_${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`, createdAt, expiredHistory, completedExpiriesRetrievable, activeContracts, activeExpiries, underlying, fields, localDatasets };
const out = path.join(dataDir, "options-research");
mkdirSync(out, { recursive: true });
const file = path.join(out, `inventory_${inv.id}.json`);
if (existsSync(file)) throw new Error("inventory id collision; re-run");
writeFileSync(file, JSON.stringify({ ...inv, experiments: experimentReadiness(inv) }, null, 2));

console.log(`inventory ${inv.id} → ${file}`);
console.log(`expired-contract history: ${expiredOk ? "AVAILABLE" : `BLOCKED (${expiredHistory.status} ${expiredHistory.errorCode})`}; completed expiries retrievable: ${completedExpiriesRetrievable}`);
for (const c of activeContracts) console.log(`  ${c.index.padEnd(9)} ${c.symbol.padEnd(28)} daily ${String(c.dailyBars).padStart(4)} from ${c.dailyFirst ?? "-"}  1m ${String(c.minuteBars).padStart(5)} from ${c.minuteFirst?.slice(0, 16) ?? "-"}  vol ${c.volumePresent} oi ${c.oiPresent}`);
for (const [k, v] of Object.entries(underlying)) console.log(`  ${k} index daily ${v.dailyBars} bars from ${v.dailyFirst}`);
for (const e of experimentReadiness(inv)) console.log(`  [${e.enabled ? "ENABLED " : "DISABLED"}] ${e.id}: ${e.reasons.join("; ") || "data sufficient"}`);
