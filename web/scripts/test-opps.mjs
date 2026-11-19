import { getSnapshot } from "../src/lib/services/market.ts";
import { evaluateOptionsOpportunity } from "../src/lib/engine/opportunityEngine.ts";

const snap = await getSnapshot("banknifty");
const res = evaluateOptionsOpportunity(snap, "BANKNIFTY", new Date());
console.log("BANKNIFTY spot:", snap.spot);
console.log("Rejections count:", res.rejectedContracts.length);
for (const r of res.rejectedContracts.slice(0, 5)) {
  console.log(`- Strike ${r.strike} ${r.optionType}: ${r.reason}`);
}
