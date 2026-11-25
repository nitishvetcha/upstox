import test from "node:test";
import assert from "node:assert/strict";
import { mockSnapshot } from "./mock.ts";

const NOW = new Date("2026-11-25T05:30:00.000Z");

test("mock snapshots keep every supported equity index's own contract metadata", () => {
  const expected = {
    nifty: { name: "NIFTY 50", step: 50, lotSize: 65 },
    banknifty: { name: "BANK NIFTY", step: 100, lotSize: 30 },
    finnifty: { name: "NIFTY FIN SERVICE", step: 50, lotSize: 65 },
    midcpnifty: { name: "NIFTY MIDCAP SELECT", step: 25, lotSize: 120 },
    sensex: { name: "SENSEX", step: 100, lotSize: 10 },
    bankex: { name: "BANKEX", step: 100, lotSize: 15 },
  } as const;

  for (const [index, meta] of Object.entries(expected)) {
    const snapshot = mockSnapshot(index as keyof typeof expected, NOW);
    assert.equal(snapshot.name, meta.name, `${index} must retain its own display name`);
    assert.equal(snapshot.strikeStep, meta.step, `${index} must retain its own strike step`);
    assert.equal(snapshot.lotSize, meta.lotSize, `${index} must retain its own lot size`);
    assert.ok(snapshot.chain.length > 0, `${index} must have a usable mock chain`);
    assert.ok(snapshot.chain.every((row) => Math.abs(row.strike / meta.step - Math.round(row.strike / meta.step)) < 1e-9), `${index} chain strikes must match its step`);
  }
});

test("mock breadth is not mislabelled as BANKNIFTY breadth for another index", () => {
  assert.equal(mockSnapshot("banknifty", NOW).breadth?.index, "banknifty");
  assert.equal(mockSnapshot("finnifty", NOW).breadth, null);
  assert.equal(mockSnapshot("midcpnifty", NOW).breadth, null);
  assert.equal(mockSnapshot("sensex", NOW).breadth, null);
  assert.equal(mockSnapshot("bankex", NOW).breadth, null);
});
