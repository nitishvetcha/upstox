import test from "node:test";
import assert from "node:assert/strict";
import {
  getContractSpec,
  isMarketSessionActive,
  parseBhavcopyRow,
} from "./contractMaster.ts";

test("CM-SPEC-1: Returns authoritative contract specifications for NSE index options", () => {
  const nifty = getContractSpec("nifty");
  assert.equal(nifty.underlying, "nifty");
  assert.equal(nifty.exchange, "NSE_FO");
  assert.equal(nifty.tickSize, 0.05);
  assert.equal(nifty.lotSize, 65);
  assert.equal(nifty.strikeStep, 50);
  assert.equal(nifty.autoSquareOffTime, "15:15");

  const bn = getContractSpec("banknifty");
  assert.equal(bn.exchange, "NSE_FO");
  assert.equal(bn.lotSize, 30);
  assert.equal(bn.strikeStep, 100);
});

test("CM-SPEC-2: Returns authoritative contract specifications for MCX commodity options", () => {
  const crude = getContractSpec("crudeoil");
  assert.equal(crude.underlying, "crudeoil");
  assert.equal(crude.exchange, "MCX_FO");
  assert.equal(crude.symbol, "CRUDEOIL");
  assert.equal(crude.lotSize, 100);
  assert.equal(crude.strikeStep, 50);
  assert.equal(crude.tickSize, 1.0);
  assert.equal(crude.expiryCycle, "MONTHLY");
  assert.equal(crude.autoSquareOffTime, "23:15");

  const ng = getContractSpec("naturalgas");
  assert.equal(ng.underlying, "naturalgas");
  assert.equal(ng.exchange, "MCX_FO");
  assert.equal(ng.lotSize, 1250);
  assert.equal(ng.strikeStep, 5);
  assert.equal(ng.tickSize, 0.10);
  assert.equal(ng.autoSquareOffTime, "23:15");
});

test("CM-SESSION-1: Correctly evaluates session activity for NSE vs MCX", () => {
  // 11:00 AM IST on regular weekday: both open
  const morningRegular = new Date("2026-11-25T05:30:00Z"); // 11:00 IST
  assert.equal(isMarketSessionActive("nifty", morningRegular), true);
  assert.equal(isMarketSessionActive("crudeoil", morningRegular), true);

  // 19:00 PM IST on regular weekday: NSE closed, MCX open
  const eveningRegular = new Date("2026-11-25T13:30:00Z"); // 19:00 IST
  assert.equal(isMarketSessionActive("nifty", eveningRegular), false);
  assert.equal(isMarketSessionActive("crudeoil", eveningRegular), true);

  // 11:00 AM IST on MCX morning holiday (Guru Nanak Jayanti 2026-11-24): both closed
  const morningHoliday = new Date("2026-11-24T05:30:00Z"); // 11:00 IST
  assert.equal(isMarketSessionActive("nifty", morningHoliday), false);
  assert.equal(isMarketSessionActive("crudeoil", morningHoliday), false);

  // 18:00 PM IST on MCX morning holiday (Guru Nanak Jayanti 2026-11-24): NSE closed, MCX open
  const eveningHoliday = new Date("2026-11-24T12:30:00Z"); // 18:00 IST
  assert.equal(isMarketSessionActive("nifty", eveningHoliday), false);
  assert.equal(isMarketSessionActive("crudeoil", eveningHoliday), true);
});

test("CM-BHAVCOPY-1: Parses standard NSE F&O Bhavcopy row", () => {
  const row = {
    INSTRUMENT: "OPTIDX",
    SYMBOL: "NIFTY",
    EXPIRY_DT: "2026-11-26",
    STRIKE_PR: "25000",
    OPTION_TYP: "CE",
    OPEN: "120.00",
    HIGH: "185.50",
    LOW: "95.00",
    CLOSE: "165.25",
    SETTLE_PR: "165.25",
    CONTRACTS: "45000",
    VAL_INLAKH: "56250.00",
    OPEN_INT: "3200000",
    CHG_IN_OI: "450000",
  };

  const parsed = parseBhavcopyRow(row, "2026-11-24");
  assert.ok(parsed);
  assert.equal(parsed?.underlying, "nifty");
  assert.equal(parsed?.strike, 25000);
  assert.equal(parsed?.optionType, "CE");
  assert.equal(parsed?.expiry, "2026-11-26");
  assert.equal(parsed?.close, 165.25);
  assert.equal(parsed?.openInterest, 3200000);
  assert.equal(parsed?.contracts, 45000);
});

test("CM-BHAVCOPY-2: Parses MCX Commodity Bhavcopy row", () => {
  const row = {
    INSTRUMENT: "OPTCOM",
    SYMBOL: "CRUDEOIL",
    EXPIRY_DT: "2026-12-16",
    STRIKE_PR: "6800",
    OPTION_TYP: "PE",
    OPEN: "85.0",
    HIGH: "115.0",
    LOW: "70.0",
    CLOSE: "98.5",
    SETTLE_PR: "98.5",
    CONTRACTS: "8500",
    VAL_INLAKH: "8372.5",
    OPEN_INT: "142000",
    CHG_IN_OI: "12500",
  };

  const parsed = parseBhavcopyRow(row, "2026-11-24");
  assert.ok(parsed);
  assert.equal(parsed?.underlying, "crudeoil");
  assert.equal(parsed?.strike, 6800);
  assert.equal(parsed?.optionType, "PE");
  assert.equal(parsed?.close, 98.5);
  assert.equal(parsed?.openInterest, 142000);
});

test("CM-BHAVCOPY-3: Rejects futures, non-index equities, and invalid rows", () => {
  // Futures contract
  const futRow = {
    INSTRUMENT: "FUTIDX",
    SYMBOL: "NIFTY",
    EXPIRY_DT: "2026-11-26",
    STRIKE_PR: "0",
    OPTION_TYP: "XX",
  };
  assert.equal(parseBhavcopyRow(futRow, "2026-11-24"), null);

  // Stock option (not in our index/commodity master)
  const stockRow = {
    INSTRUMENT: "OPTSTK",
    SYMBOL: "RELIANCE",
    EXPIRY_DT: "2026-11-26",
    STRIKE_PR: "3000",
    OPTION_TYP: "CE",
  };
  assert.equal(parseBhavcopyRow(stockRow, "2026-11-24"), null);

  // Missing or zero strike
  const zeroStrike = {
    INSTRUMENT: "OPTIDX",
    SYMBOL: "NIFTY",
    STRIKE_PR: "0",
    OPTION_TYP: "CE",
  };
  assert.equal(parseBhavcopyRow(zeroStrike, "2026-11-24"), null);
});
