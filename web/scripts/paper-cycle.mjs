// npm run paper:cycle — collect then evaluate, once, then exit.
import { BASE, serverUp } from "./upstox-cli.mjs";

if (!(await serverUp())) {
  console.log(`Server not running at ${BASE}. Start with: npm run dev:upstox`);
  process.exit(1);
}

console.log("=== COLLECT ===");
const collect = await fetch(`${BASE}/api/paper-opportunities/collect`, { method: "POST" })
  .then((r) => r.json()).catch((e) => ({ error: e.message }));
if (collect.error) { console.error("Collection failed:", collect.error); process.exit(1); }
console.log(`Market: ${collect.market} | Created: ${collect.created} | Duplicates: ${collect.duplicates}`);

console.log("\n=== EVALUATE ===");
const monitor = await fetch(`${BASE}/api/paper-opportunities/monitor`, { method: "POST" })
  .then((r) => r.json()).catch((e) => ({ error: e.message }));
if (monitor.error) { console.error("Monitor failed:", monitor.error); process.exit(1); }
console.log(`Evaluated: ${monitor.evaluated} | Updated: ${monitor.updated} | T1: ${monitor.target1Hits} | Stop: ${monitor.stopHits}`);

console.log("\n=== SUMMARY ===");
const summary = await fetch(`${BASE}/api/opportunities/daily-summary`)
  .then((r) => r.json()).catch(() => null);
if (summary) {
  console.log(`Open: ${summary.open} | Completed: ${summary.completedTrades} | Sample: ${summary.sampleSizeLabel}`);
  if (summary.winRate !== null) console.log(`Win rate: ${(summary.winRate * 100).toFixed(0)}% | Avg R: ${summary.averageR?.toFixed(2)}`);
  else console.log("Performance: INSUFFICIENT_SAMPLE");
}
