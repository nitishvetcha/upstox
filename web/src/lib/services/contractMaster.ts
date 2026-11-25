// Phase 2 — Contract & Expiry Master with Free EOD Bhavcopy Specification.
// Provides authoritative contract rules (tick size, lot size, strike steps, trading sessions)
// and parsing for official NSE/MCX public Bhavcopy records without recurring subscription fees.

import type { UnderlyingId } from "../types.ts";
import {
  INSTRUMENTS,
  COMMODITIES,
  isIndexId,
  isCommodityId,
} from "./instrumentRegistry.ts";
import {
  getExchangeProfile,
  type ExchangeId,
  type ExchangeProfile,
} from "./transactionCosts.ts";
import { isRegularSession, commodityMarketStatus, marketStatus } from "../time.ts";

export interface ContractSpec {
  underlying: UnderlyingId;
  symbol: string;
  name: string;
  exchange: ExchangeId;
  lotSize: number;
  strikeStep: number;
  tickSize: number;
  expiryCycle: "WEEKLY" | "MONTHLY";
  tradingHours: ExchangeProfile["tradingHours"];
  autoSquareOffTime: string;
}

export interface HistoricalOptionRecord {
  underlying: UnderlyingId;
  date: string; // YYYY-MM-DD
  expiry: string; // YYYY-MM-DD
  strike: number;
  optionType: "CE" | "PE";
  open: number;
  high: number;
  low: number;
  close: number;
  settlePrice: number;
  contracts: number;
  valInLakh: number;
  openInterest: number;
  changeInOi: number;
}

/**
 * Returns static contract specifications for any supported underlying.
 */
export function getContractSpec(underlying: UnderlyingId): ContractSpec {
  const profile = getExchangeProfile(underlying);

  if (isCommodityId(underlying)) {
    const comm = COMMODITIES[underlying];
    return {
      underlying,
      symbol: comm.symbol,
      name: comm.name,
      exchange: profile.exchangeId,
      lotSize: comm.lotSize,
      strikeStep: comm.strikeStep,
      tickSize: underlying === "naturalgas" ? 0.10 : profile.tickSize,
      expiryCycle: "MONTHLY", // MCX Crude Oil and Natural Gas are monthly options expiring Tuesday
      tradingHours: profile.tradingHours,
      autoSquareOffTime: profile.autoSquareOffTime,
    };
  }

  const inst = INSTRUMENTS[underlying];
  // Lot sizes per current SEBI / exchange circulars (2026 revision)
  const lotSizes: Record<string, number> = {
    nifty: 65,
    banknifty: 30,
    finnifty: 65,
    midcpnifty: 120,
    sensex: 10,
    bankex: 15,
  };
  const strikeSteps: Record<string, number> = {
    nifty: 50,
    banknifty: 100,
    finnifty: 50,
    midcpnifty: 25,
    sensex: 100,
    bankex: 100,
  };

  return {
    underlying,
    symbol: inst.symbol,
    name: inst.name,
    exchange: profile.exchangeId,
    lotSize: lotSizes[underlying] ?? 50,
    strikeStep: strikeSteps[underlying] ?? 50,
    tickSize: profile.tickSize,
    expiryCycle: underlying === "sensex" || underlying === "nifty" || underlying === "banknifty" ? "WEEKLY" : "WEEKLY",
    tradingHours: profile.tradingHours,
    autoSquareOffTime: profile.autoSquareOffTime,
  };
}

/**
 * Checks whether an underlying's exchange session is currently active.
 */
export function isMarketSessionActive(underlying: UnderlyingId, now = new Date()): boolean {
  if (isCommodityId(underlying)) {
    return commodityMarketStatus(now) === "OPEN";
  }
  return marketStatus(now) === "OPEN";
}

/**
 * Parses a single row from official NSE F&O Bhavcopy CSV format.
 * Format handles both modern (BhavCopy_NSE_FO) and legacy (fo<DD><MON><YYYY>bhav.csv) schemas.
 */
export function parseBhavcopyRow(
  row: Record<string, string | number>,
  dateStr: string,
): HistoricalOptionRecord | null {
  // Normalize header keys: strip whitespace and uppercase
  const norm: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    norm[k.trim().toUpperCase()] = String(v ?? "").trim();
  }

  const instrType = norm["INSTRUMENT"] || norm["TckrSymb"] || norm["FININST_TP"] || "";
  const optTypeRaw = norm["OPTION_TYP"] || norm["OPTNTYPE"] || norm["OPTION_TYPE"] || "";

  // Filter for index options only (OPTIDX)
  const isOption =
    instrType.startsWith("OPT") || optTypeRaw === "CE" || optTypeRaw === "PE";
  if (!isOption) return null;

  const symbolRaw = (norm["SYMBOL"] || norm["TCKRSYMB"] || "").toUpperCase();
  let underlying: UnderlyingId | null = null;
  if (symbolRaw.includes("NIFTY 50") || symbolRaw === "NIFTY") underlying = "nifty";
  else if (symbolRaw.includes("BANKNIFTY") || symbolRaw === "BANK NIFTY") underlying = "banknifty";
  else if (symbolRaw.includes("FINNIFTY")) underlying = "finnifty";
  else if (symbolRaw.includes("MIDCPNIFTY")) underlying = "midcpnifty";
  else if (symbolRaw.includes("CRUDEOIL")) underlying = "crudeoil";
  else if (symbolRaw.includes("NATURALGAS")) underlying = "naturalgas";
  else if (symbolRaw.includes("SENSEX")) underlying = "sensex";
  else if (symbolRaw.includes("BANKEX")) underlying = "bankex";

  if (!underlying) return null;

  const strike = parseFloat(norm["STRIKE_PR"] || norm["STRK_PRC"] || norm["STRIKE"] || "0");
  if (!(strike > 0)) return null;

  const optionType: "CE" | "PE" = optTypeRaw.toUpperCase() === "PE" ? "PE" : "CE";
  const expiryRaw = norm["EXPIRY_DT"] || norm["XPIRTN_DT"] || "";

  return {
    underlying,
    date: dateStr,
    expiry: expiryRaw,
    strike,
    optionType,
    open: parseFloat(norm["OPEN"] || norm["OPN_PRC"] || "0"),
    high: parseFloat(norm["HIGH"] || norm["HGH_PRC"] || "0"),
    low: parseFloat(norm["LOW"] || norm["LW_PRC"] || "0"),
    close: parseFloat(norm["CLOSE"] || norm["CLS_PRC"] || "0"),
    settlePrice: parseFloat(norm["SETTLE_PR"] || norm["STTLM_PRC"] || norm["CLOSE"] || "0"),
    contracts: parseInt(norm["CONTRACTS"] || norm["TTL_TRAD_QTY"] || "0", 10),
    valInLakh: parseFloat(norm["VAL_INLAKH"] || norm["TTL_TRF_VAL"] || "0"),
    openInterest: parseInt(norm["OPEN_INT"] || norm["OPN_INTRST"] || "0", 10),
    changeInOi: parseInt(norm["CHG_IN_OI"] || norm["CHNG_IN_OPN_INTRST"] || "0", 10),
  };
}
