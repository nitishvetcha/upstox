// Recommendation pipeline across all six registered indices: analysis → enricher labels, in mock mode (offline, no journal writes).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";

process.env.MARKET_DATA_PROVIDER = "mock";
process.env.RECOMMENDATION_STORE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "enricher-idx-"));
delete process.env.UPSTOX_ANALYTICS_TOKEN;

const { getSnapshot } = await import("./services/market.ts");
const { analyze } = await import("./engine/strategy.ts");
const { buildRecommendationResponse } = await import("./recommendationEnricher.ts");
const { INDICES, INSTRUMENTS } = await import("./services/instrumentRegistry.ts");

const EXPECTED: Record<string, string> = {
  nifty: "NIFTY", banknifty: "BANKNIFTY", finnifty: "FINNIFTY", midcpnifty: "MIDCPNIFTY", sensex: "SENSEX", bankex: "BANKEX",
};

test("B-1 the registry covers exactly the six expected indices", () => {
  assert.deepEqual([...INDICES].sort(), Object.keys(EXPECTED).sort());
});

for (const index of Object.keys(EXPECTED)) {
  test(`B-2 ${index}: enricher labels the underlying with its canonical symbol`, async () => {
    const snapshot = await getSnapshot(index as never);
    assert.equal(snapshot.index, index, "snapshot must be for the requested index");
    const rec = buildRecommendationResponse(analyze(snapshot));
    assert.equal(rec.underlying, EXPECTED[index]);
    assert.equal(rec.underlying, INSTRUMENTS[index as keyof typeof INSTRUMENTS].symbol);
    if (index !== "banknifty") assert.notEqual(rec.underlying, "BANKNIFTY", `${index} must never read as BANKNIFTY`);
  });
}

test("B-3 NIFTY and BANKNIFTY labels are unchanged from the pre-fix behaviour", async () => {
  assert.equal(buildRecommendationResponse(analyze(await getSnapshot("nifty"))).underlying, "NIFTY");
  assert.equal(buildRecommendationResponse(analyze(await getSnapshot("banknifty"))).underlying, "BANKNIFTY");
});
