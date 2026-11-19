// Log age classification for System Health. No network, no file writes.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classifyLogAge, logAgeInfo, LOG_STALE_AFTER_MS } from "./logAge.ts";

const NOW = Date.UTC(2026, 10, 9, 4, 0, 0);

describe("classifyLogAge", () => {
  test("LA-1 a log written 1 hour ago is CURRENT", () => {
    const r = classifyLogAge(NOW - 3600_000, [], NOW);
    assert.equal(r.status, "CURRENT");
    assert.equal(r.ageHours, 1);
  });

  test("LA-2 a log written 30 days ago is STALE, and the original write time is kept", () => {
    const written = NOW - 30 * 24 * 3600_000;
    const r = classifyLogAge(written, [], NOW);
    assert.equal(r.status, "STALE");
    assert.equal(r.writtenAt, new Date(written).toISOString());
  });

  test("LA-3 exactly the 24 h threshold is still CURRENT; one millisecond beyond is STALE", () => {
    assert.equal(classifyLogAge(NOW - LOG_STALE_AFTER_MS, [], NOW).status, "CURRENT");
    assert.equal(classifyLogAge(NOW - LOG_STALE_AFTER_MS - 1, [], NOW).status, "STALE");
  });

  test("LA-4 the latest ISO timestamp in the tail is reported, not the first", () => {
    const lines = [
      "[2026-10-30T05:56:17.693Z] [SUPERVISOR] paper-live.mjs exited with code 0.",
      "[2026-10-30T05:56:17.712Z] [SUPERVISOR] Stopping server process...",
    ];
    assert.equal(classifyLogAge(NOW, lines, NOW).latestRecordAt, "2026-10-30T05:56:17.712Z");
  });

  test("LA-5 a tail with no ISO timestamp reports null, not a guessed time", () => {
    assert.equal(classifyLogAge(NOW, ["[10:57:34 am] collect: created=0"], NOW).latestRecordAt, null);
  });

  test("LA-6 a future-dated file is not reported as negative age", () => {
    assert.equal(classifyLogAge(NOW + 3600_000, [], NOW).ageHours, 0);
  });
});

describe("logAgeInfo (filesystem)", () => {
  test("LA-7 a missing file returns null rather than a fabricated record", () => {
    assert.equal(logAgeInfo("/nonexistent/path/launchd.stdout.log", []), null);
  });
});
