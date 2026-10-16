// npm run paper:collect — one live collection cycle, then exit.
import { BASE, getJson, serverUp } from "./upstox-cli.mjs";

if (!(await serverUp())) {
  console.log(`Server not running at ${BASE}. Start with: npm run dev:upstox`);
  process.exit(1);
}

console.log("Running one live collection cycle...\n");
const result = await fetch(`${BASE}/api/paper-opportunities/collect`, { method: "POST" })
  .then((r) => r.json())
  .catch((e) => ({ error: e.message }));

if (result.error) {
  console.error("Collection failed:", result.error);
  process.exit(1);
}

console.log(`Market:     ${result.market}`);
console.log(`Source:     ${result.source}`);
if (result.reason) console.log(`Reason:     ${result.reason}`);
console.log(`Generated:  ${result.generated}`);
console.log(`Accepted:   ${result.accepted}`);
console.log(`Created:    ${result.created}`);
console.log(`Duplicates: ${result.duplicates}`);
console.log(`Rejected:   ${result.rejected}`);
console.log(`  NIFTY:    ${result.niftyCount}`);
console.log(`  BANKNIFTY:${result.bankNiftyCount}`);
console.log(`  Stocks:   ${result.stockCount}`);
if (result.errors?.length) {
  console.log("\nErrors:");
  for (const e of result.errors) console.log(`  - ${e}`);
}
