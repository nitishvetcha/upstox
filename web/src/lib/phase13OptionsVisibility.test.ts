import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Phase 1.3 options data-quality visibility", () => {
  it("exposes safe aggregate contract diagnostics without raw provider payloads", () => {
    const engine = fs.readFileSync(path.join(process.cwd(), "src/lib/engine/opportunityEngine.ts"), "utf8");
    for (const field of ["requestedKeys", "coveredKeys", "liveKeys", "agingKeys", "staleKeys", "unavailableKeys", "mismatchedKeys"]) {
      assert.match(engine, new RegExp(`\\b${field}\\b`));
    }
    assert.doesNotMatch(engine, /missingKeys:\s*summary\.missingKeys/);
  });

  it("renders distinct NIFTY and BANKNIFTY quality summaries and the analytics warning", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/opportunities/page.tsx"), "utf8");
    for (const label of ["Underlying market", "Option chain", "Individual contract prices", "Full-chain analytics", "Candidate eligibility", "MISMATCHED"]) {
      assert.ok(page.includes(label), `missing dashboard label: ${label}`);
    }
    assert.match(page, /o\.underlying === "NIFTY" \|\| o\.underlying === "BANKNIFTY"/);
    assert.match(page, /bounded REST analytics, not an atomic or exchange-synchronised snapshot/);
  });
});
