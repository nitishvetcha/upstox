// Ops status must still find the newest LIVE collection after many closed-market runs (retention keeps it).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "live-collect-"));
const root = fs.mkdtempSync(path.join(os.tmpdir(), "live-root-"));
process.env.COLLECTION_LOG_DIR = logDir;
const { saveCollectionRun } = await import("../services/liveOpportunityCollector.ts");
const { runnerStatus } = await import("./opsStatus.ts");

const iso = (ms: number) => new Date(ms).toISOString();
function run(ms: number, sourceStatus: string) {
  return {
    id: `${ms}_api`, timestamp: iso(ms), marketStatus: "CLOSED", sourceStatus, generatedCount: 0, acceptedCount: 0,
    createdCount: 0, duplicateCount: 0, rejectedCount: 0, niftyCount: 0, bankNiftyCount: 0, stockCount: 0, durationMs: 0, errors: [],
  };
}

test("after 300 closed-market runs, ops status still reports the newest LIVE collection", () => {
  const liveAt = 1_700_000_000_000 + 5_000; // a LIVE run that is far outside the newest 200
  saveCollectionRun(run(liveAt, "LIVE") as never);
  for (let i = 1; i <= 300; i++) saveCollectionRun(run(liveAt + i * 30_000, "AUTH_UNAVAILABLE") as never);

  const status = runnerStatus("CLOSED", new Date(liveAt + 300 * 30_000), root);
  assert.equal(status.lastCollectionAt, iso(liveAt), "last LIVE timestamp survives retention");
  assert.ok(fs.readdirSync(logDir).length <= 201, "retained count is at most 201");
});

test("a newer LIVE run replaces the older one as the reported last LIVE collection", () => {
  const newer = 1_700_000_000_000 + 10_000_000;
  saveCollectionRun(run(newer, "LIVE") as never);
  const status = runnerStatus("OPEN", new Date(newer + 1_000), root);
  assert.equal(status.lastCollectionAt, iso(newer));
});
