// npm run paper:evaluate — evaluate OPEN paper trades once, then exit.
import { BASE, serverUp } from "./upstox-cli.mjs";

if (!(await serverUp())) {
  console.log(`Server not running at ${BASE}. Start with: npm run dev:upstox`);
  process.exit(1);
}

console.log("Evaluating OPEN paper trades...\n");
const result = await fetch(`${BASE}/api/paper-opportunities/monitor`, { method: "POST" })
  .then((r) => r.json())
  .catch((e) => ({ error: e.message }));

if (result.error) {
  console.error("Monitor failed:", result.error);
  process.exit(1);
}

console.log(`Open before:  ${result.openBefore}`);
console.log(`Evaluated:    ${result.evaluated}`);
console.log(`Updated:      ${result.updated}`);
console.log(`  T1 hits:    ${result.target1Hits}`);
console.log(`  T2 hits:    ${result.target2Hits}`);
console.log(`  Stop hits:  ${result.stopHits}`);
console.log(`  Expired:    ${result.expirations}`);
console.log(`Duration:     ${result.durationMs}ms`);
if (result.errors?.length) {
  console.log("\nErrors:");
  for (const e of result.errors) console.log(`  - ${e}`);
}
