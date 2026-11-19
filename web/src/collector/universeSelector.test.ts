// Tests for Module 1: Dynamic Universe & Contract Resolution Engine (WBS 4.5)
import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAtmStrike,
  parseMasterContracts,
  resolveTargetExpiries,
  resolveUniverse,
  REGULATORY_CALENDAR_REF,
  SELECTION_RULE_VERSION,
  type RawMasterContract,
} from "./universeSelector.ts";

function generateMockMasterContracts(): RawMasterContract[] {
  const contracts: RawMasterContract[] = [
    // Spot Indices
    {
      instrumentKey: "NSE_INDEX|Nifty 50",
      exchangeToken: "26000",
      tradingSymbol: "NIFTY 50",
      underlying: "NIFTY",
      expiryDate: "2026-11-19",
      strikePrice: 0,
      instrumentType: "INDEX",
      lotSize: 1,
      segment: "NSE_INDEX",
    },
    {
      instrumentKey: "NSE_INDEX|Nifty Bank",
      exchangeToken: "26001",
      tradingSymbol: "NIFTY BANK",
      underlying: "BANKNIFTY",
      expiryDate: "2026-11-26",
      strikePrice: 0,
      instrumentType: "INDEX",
      lotSize: 1,
      segment: "NSE_INDEX",
    },
    // Near-Month Index Futures
    {
      instrumentKey: "NSE_FO|NIFTY26NOVFUT",
      exchangeToken: "40001",
      tradingSymbol: "NIFTY 26NOV FUT",
      underlying: "NIFTY",
      expiryDate: "2026-11-26",
      strikePrice: 0,
      instrumentType: "FUTIDX",
      lotSize: 25,
      segment: "NSE_FO",
    },
    {
      instrumentKey: "NSE_FO|BANKNIFTY26NOVFUT",
      exchangeToken: "40002",
      tradingSymbol: "BANKNIFTY 26NOV FUT",
      underlying: "BANKNIFTY",
      expiryDate: "2026-11-26",
      strikePrice: 0,
      instrumentType: "FUTIDX",
      lotSize: 15,
      segment: "NSE_FO",
    },
  ];

  // NIFTY: weekly expiries (2026-11-19, 2026-11-26)
  const niftyExpiries = ["2026-11-19", "2026-11-26"];
  const niftyAtm = 24500;
  for (const exp of niftyExpiries) {
    for (let offset = -15; offset <= 15; offset++) {
      const strike = niftyAtm + offset * 50;
      for (const type of ["CE", "PE"] as const) {
        contracts.push({
          instrumentKey: `NSE_FO|NIFTY${exp}${type}${strike}`,
          exchangeToken: `TOK_NIFTY_${exp}_${strike}_${type}`,
          tradingSymbol: `NIFTY ${exp} ${strike} ${type}`,
          underlying: "NIFTY",
          expiryDate: exp,
          strikePrice: strike,
          instrumentType: type,
          lotSize: 25,
          segment: "NSE_FO",
        });
      }
    }
  }

  // BANKNIFTY: monthly expiries (2026-11-26, 2026-12-31) per NSE/FAOP/64506
  const bankniftyExpiries = ["2026-11-26", "2026-12-31"];
  const bankniftyAtm = 51200;
  for (const exp of bankniftyExpiries) {
    for (let offset = -15; offset <= 15; offset++) {
      const strike = bankniftyAtm + offset * 100;
      for (const type of ["CE", "PE"] as const) {
        contracts.push({
          instrumentKey: `NSE_FO|BANKNIFTY${exp}${type}${strike}`,
          exchangeToken: `TOK_BN_${exp}_${strike}_${type}`,
          tradingSymbol: `BANKNIFTY ${exp} ${strike} ${type}`,
          underlying: "BANKNIFTY",
          expiryDate: exp,
          strikePrice: strike,
          instrumentType: type,
          lotSize: 15,
          segment: "NSE_FO",
        });
      }
    }
  }

  return contracts;
}

test("Universe Selector: calculateAtmStrike calculates correct ATM strike", () => {
  assert.equal(calculateAtmStrike(24523, 50), 24500);
  assert.equal(calculateAtmStrike(24535, 50), 24550);
  assert.equal(calculateAtmStrike(51240, 100), 51200);
  assert.equal(calculateAtmStrike(51260, 100), 51300);
});

test("Universe Selector: resolveTargetExpiries enforces BANKNIFTY monthly cycle per NSE/FAOP/64506", () => {
  const contracts: RawMasterContract[] = [
    // BANKNIFTY contracts in multiple dates
    { instrumentKey: "k1", exchangeToken: "1", tradingSymbol: "s1", underlying: "BANKNIFTY", expiryDate: "2026-11-12", strikePrice: 51000, instrumentType: "CE", lotSize: 15, segment: "NSE_FO" },
    { instrumentKey: "k2", exchangeToken: "2", tradingSymbol: "s2", underlying: "BANKNIFTY", expiryDate: "2026-11-26", strikePrice: 51000, instrumentType: "CE", lotSize: 15, segment: "NSE_FO" },
    { instrumentKey: "k3", exchangeToken: "3", tradingSymbol: "s3", underlying: "BANKNIFTY", expiryDate: "2026-12-31", strikePrice: 51000, instrumentType: "CE", lotSize: 15, segment: "NSE_FO" },
    // NIFTY contracts in weekly cycles
    { instrumentKey: "k4", exchangeToken: "4", tradingSymbol: "s4", underlying: "NIFTY", expiryDate: "2026-11-19", strikePrice: 24500, instrumentType: "CE", lotSize: 25, segment: "NSE_FO" },
    { instrumentKey: "k5", exchangeToken: "5", tradingSymbol: "s5", underlying: "NIFTY", expiryDate: "2026-11-26", strikePrice: 24500, instrumentType: "CE", lotSize: 25, segment: "NSE_FO" },
  ];

  const { niftyExpiries, bankniftyExpiries } = resolveTargetExpiries(contracts, "2026-11-16");
  assert.deepEqual(niftyExpiries, ["2026-11-19", "2026-11-26"]);
  // BANKNIFTY picks the last date of each month: 2026-11-26 and 2026-12-31 (monthly expiries)
  assert.deepEqual(bankniftyExpiries, ["2026-11-26", "2026-12-31"]);
});

test("Universe Selector: resolves full universe with COMPLETE status when all contracts exist", () => {
  const master = generateMockMasterContracts();
  const rawContent = JSON.stringify(master);

  const manifest = resolveUniverse({
    masterSource: "test_complete.json",
    masterRawContent: rawContent,
    retrievalDateIso: "2026-11-16T08:00:00.000Z",
    marketSessionDate: "2026-11-16",
    referencePrices: {
      niftyCashPrice: 24510,
      bankniftyCashPrice: 51220,
      priceTimestamp: "2026-11-16T09:00:00+05:30",
      method: "PRE_OPEN_CASH_0900_IST",
    },
    wingStrikesCount: 15,
  });

  assert.equal(manifest.universeStatus, "COMPLETE");
  assert.equal(manifest.calendarReference, REGULATORY_CALENDAR_REF);
  assert.equal(manifest.selectionRuleVersion, SELECTION_RULE_VERSION);
  assert.equal(manifest.missingKeys.length, 0);
  assert.equal(manifest.atmReference.niftyAtmStrike, 24500);
  assert.equal(manifest.atmReference.bankniftyAtmStrike, 51200);

  // Expected contracts calculation:
  // 2 spots + 2 futures + (31 strikes * 2 * 2 expiries) * 2 underlyings = 4 + 124 + 124 = 252 contracts
  assert.equal(manifest.expectedKeysCount, 252);
  assert.equal(manifest.resolvedKeysCount, 252);
  assert.ok(manifest.manifestHash.length === 64);
});

test("Universe Selector: missing core ATM strike triggers INVALID status and hard fail-closed", () => {
  const master = generateMockMasterContracts();
  // Remove Core ATM strike: NIFTY 2026-11-19 24500 CE
  const filtered = master.filter((c) => c.instrumentKey !== "NSE_FO|NIFTY2026-11-19CE24500");
  const rawContent = JSON.stringify(filtered);

  const manifest = resolveUniverse({
    masterSource: "test_missing_core.json",
    masterRawContent: rawContent,
    retrievalDateIso: "2026-11-16T08:00:00.000Z",
    marketSessionDate: "2026-11-16",
    referencePrices: {
      niftyCashPrice: 24510,
      bankniftyCashPrice: 51220,
      priceTimestamp: "2026-11-16T09:00:00+05:30",
      method: "PRE_OPEN_CASH_0900_IST",
    },
    wingStrikesCount: 15,
  });

  assert.equal(manifest.universeStatus, "INVALID");
  assert.ok(manifest.missingKeys.some((m) => m.tier === "CORE_ATM"));
});

test("Universe Selector: missing outer wing strike produces PARTIAL status without crashing", () => {
  const master = generateMockMasterContracts();
  // Remove Outer Wing strike: NIFTY strike offset 15 (strike 25250)
  const filtered = master.filter((c) => c.instrumentKey !== "NSE_FO|NIFTY2026-11-19CE25250");
  const rawContent = JSON.stringify(filtered);

  const manifest = resolveUniverse({
    masterSource: "test_missing_wing.json",
    masterRawContent: rawContent,
    retrievalDateIso: "2026-11-16T08:00:00.000Z",
    marketSessionDate: "2026-11-16",
    referencePrices: {
      niftyCashPrice: 24510,
      bankniftyCashPrice: 51220,
      priceTimestamp: "2026-11-16T09:00:00+05:30",
      method: "PRE_OPEN_CASH_0900_IST",
    },
    wingStrikesCount: 15,
  });

  assert.equal(manifest.universeStatus, "PARTIAL");
  assert.equal(manifest.missingKeys.length, 1);
  assert.equal(manifest.missingKeys[0].tier, "OUTER_WING");
});

test("Universe Selector: dynamic universe size adjusts when wing count is modified (not hardcoded 84/252)", () => {
  const master = generateMockMasterContracts();
  const rawContent = JSON.stringify(master);

  // If wingStrikesCount = 5 (11 strikes per expiry):
  // 2 spots + 2 futures + (11 * 2 * 2 expiries) * 2 underlyings = 4 + 44 + 44 = 92 contracts
  const manifest = resolveUniverse({
    masterSource: "test_dynamic_wings.json",
    masterRawContent: rawContent,
    retrievalDateIso: "2026-11-16T08:00:00.000Z",
    marketSessionDate: "2026-11-16",
    referencePrices: {
      niftyCashPrice: 24500,
      bankniftyCashPrice: 51200,
      priceTimestamp: "2026-11-16T09:00:00+05:30",
      method: "PRE_OPEN_CASH_0900_IST",
    },
    wingStrikesCount: 5,
  });

  assert.equal(manifest.universeStatus, "COMPLETE");
  assert.equal(manifest.expectedKeysCount, 92);
  assert.equal(manifest.resolvedKeysCount, 92);
});
