// npm run upstox:status — read-only connection report. Never prints the token.
import { BASE, fmtExpiry, getJson, serverUp } from "./upstox-cli.mjs";

if (!(await serverUp())) {
  console.log(`Server is not running at ${BASE}. Start it with: npm run dev:upstox`);
  process.exit(1);
}
const s = await getJson("/api/auth/status?verify=1");
const h = await getJson("/api/auth/health", 90_000).catch(() => null);
const st = (c) => (c ? `${c.status}${c.detail ? ` — ${c.detail}` : ""}` : "?");

console.log("Upstox Status\n=============\n");
console.log(`Connected: ${s.connected ? "YES" : "NO"}`);
console.log(`Token: ${s.tokenStatus}`);
console.log(`Expires: ${fmtExpiry(s.expiresAt)}\n`);
for (const [i, name] of [["nifty", "NIFTY"], ["banknifty", "BANK NIFTY"]]) {
  const c = h?.checks?.[i];
  console.log(`${name}`);
  console.log(`  Spot API: ${st(c?.spot)}`);
  console.log(`  Option Contract API: ${st(c?.optionContracts)}`);
  console.log(`  Option Chain API: ${st(c?.optionChain)}`);
}
const ho = h?.historicalOptions;
console.log(`\nHistorical Options: ${ho ? `${ho.status}${ho.code ? ` — ${ho.code}` : ""}` : "?"} (independent of login)`);
if (!s.connected) console.log(`\nLogin: npm run upstox:login  (or open ${BASE}/api/auth/login)`);
