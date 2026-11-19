// Market Data Collector — Module 1: Dynamic Universe & Contract Resolution Engine
// Implements WBS 4.5 and complies with COLLECTOR_ARCHITECTURE_SPECIFICATION.md & COLLECTOR_DATA_SCHEMA.md.

import { createHash } from "node:crypto";
import type {
  HashedUniverseManifest,
  UniverseContractDescriptor,
} from "./collectorTypes.ts";

export interface RawMasterContract {
  instrumentKey: string;
  exchangeToken: string;
  tradingSymbol: string;
  underlying: string;
  expiryDate: string; // YYYY-MM-DD
  strikePrice: number;
  instrumentType: "CE" | "PE" | "FUTIDX" | "INDEX";
  lotSize: number;
  segment: string; // e.g. 'NSE_FO', 'NSE_INDEX'
}

export interface UniverseResolutionOptions {
  masterSource: string;
  masterRawContent: string;
  retrievalDateIso: string;
  marketSessionDate: string; // YYYY-MM-DD
  referencePrices: {
    niftyCashPrice: number;
    bankniftyCashPrice: number;
    priceTimestamp: string;
    method: "PRE_OPEN_CASH_0900_IST" | "PREV_CLOSE_CASH";
  };
  /** Strike expansion bound: ATM +/- wingStrikesCount (default 15 strikes) */
  wingStrikesCount?: number;
}

export const REGULATORY_CALENDAR_REF = "NSE_CIRCULAR_NSE_FAOP_64506";
export const SELECTION_RULE_VERSION = "v1.2-nifty-weekly-banknifty-monthly";

/**
 * Computes canonical SHA-256 of a string or buffer.
 */
export function computeSha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Rounds spot/cash price to nearest ATM strike.
 * NIFTY interval = 50, BANKNIFTY interval = 100.
 */
export function calculateAtmStrike(price: number, interval: number): number {
  return Math.round(price / interval) * interval;
}

/**
 * Parses raw master records from JSON or CSV.
 */
export function parseMasterContracts(rawContent: string): RawMasterContract[] {
  const trimmed = rawContent.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : (parsed.contracts ?? []);
  }

  // Parse CSV format: instrumentKey,exchangeToken,tradingSymbol,underlying,expiryDate,strikePrice,instrumentType,lotSize,segment
  const lines = trimmed.split("\n");
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((c) => c.trim());
  const idx = {
    key: header.indexOf("instrumentKey"),
    token: header.indexOf("exchangeToken"),
    sym: header.indexOf("tradingSymbol"),
    und: header.indexOf("underlying"),
    exp: header.indexOf("expiryDate"),
    strike: header.indexOf("strikePrice"),
    type: header.indexOf("instrumentType"),
    lot: header.indexOf("lotSize"),
    seg: header.indexOf("segment"),
  };

  const records: RawMasterContract[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",").map((c) => c.trim());
    if (row.length < header.length) continue;
    records.push({
      instrumentKey: row[idx.key],
      exchangeToken: row[idx.token],
      tradingSymbol: row[idx.sym],
      underlying: row[idx.und],
      expiryDate: row[idx.exp],
      strikePrice: Number(row[idx.strike] ?? 0),
      instrumentType: row[idx.type] as RawMasterContract["instrumentType"],
      lotSize: Number(row[idx.lot] ?? 1),
      segment: row[idx.seg],
    });
  }
  return records;
}

/**
 * Resolves active expiries chronologically:
 * - NIFTY: front weekly + next weekly (or monthly when coinciding)
 * - BANKNIFTY: front monthly + next monthly (weekly index options abolished per NSE Circular NSE/FAOP/64506)
 */
export function resolveTargetExpiries(
  contracts: RawMasterContract[],
  sessionDate: string
): { niftyExpiries: string[]; bankniftyExpiries: string[] } {
  const niftyFutureExpiries = Array.from(
    new Set(
      contracts
        .filter((c) => c.underlying === "NIFTY" && c.expiryDate >= sessionDate && (c.instrumentType === "CE" || c.instrumentType === "PE"))
        .map((c) => c.expiryDate)
    )
  ).sort();

  // NIFTY selects front weekly and next weekly
  const niftyExpiries = niftyFutureExpiries.slice(0, 2);

  // BANKNIFTY: per NSE/FAOP/64506, weekly options discontinued; traded strictly in monthly cycles.
  // In exchange masters, monthly expiries are the last expiry date of each month or distinct monthly series.
  // We identify unique month-end expiries (group by YYYY-MM and pick latest date in each month).
  const bankniftyAllExpiries = Array.from(
    new Set(
      contracts
        .filter((c) => c.underlying === "BANKNIFTY" && c.expiryDate >= sessionDate && (c.instrumentType === "CE" || c.instrumentType === "PE"))
        .map((c) => c.expiryDate)
    )
  ).sort();

  const byMonth = new Map<string, string[]>();
  for (const exp of bankniftyAllExpiries) {
    const ym = exp.slice(0, 7);
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym)!.push(exp);
  }

  // Monthly expiry is the maximum expiry date in each calendar month
  const bankniftyMonthlyExpiries: string[] = [];
  for (const expiriesInMonth of byMonth.values()) {
    bankniftyMonthlyExpiries.push(expiriesInMonth[expiriesInMonth.length - 1]);
  }
  bankniftyMonthlyExpiries.sort();
  const bankniftyExpiries = bankniftyMonthlyExpiries.slice(0, 2);

  return { niftyExpiries, bankniftyExpiries };
}

/**
 * Dynamically resolves target universe from daily master.
 */
export function resolveUniverse(options: UniverseResolutionOptions): HashedUniverseManifest {
  const {
    masterSource,
    masterRawContent,
    retrievalDateIso,
    marketSessionDate,
    referencePrices,
    wingStrikesCount = 15,
  } = options;

  const masterContentSha256 = computeSha256(masterRawContent);
  const contracts = parseMasterContracts(masterRawContent);

  const niftyAtm = calculateAtmStrike(referencePrices.niftyCashPrice, 50);
  const bankniftyAtm = calculateAtmStrike(referencePrices.bankniftyCashPrice, 100);

  const { niftyExpiries, bankniftyExpiries } = resolveTargetExpiries(contracts, marketSessionDate);

  // Lookup map for fast contract retrieval: key = `${underlying}|${expiry}|${strike}|${type}`
  const lookup = new Map<string, RawMasterContract>();
  for (const c of contracts) {
    lookup.set(`${c.underlying}|${c.expiryDate}|${c.strikePrice}|${c.instrumentType}`, c);
    lookup.set(c.instrumentKey, c);
  }

  const selectedContracts: UniverseContractDescriptor[] = [];
  const missingKeys: HashedUniverseManifest["missingKeys"] = [];

  // 1. Add Underlying Cash Spot Reference Keys
  const spotIndexKeys = [
    { key: "NSE_INDEX|Nifty 50", underlying: "NIFTY" as const, sym: "NIFTY 50" },
    { key: "NSE_INDEX|Nifty Bank", underlying: "BANKNIFTY" as const, sym: "NIFTY BANK" },
  ];
  for (const spot of spotIndexKeys) {
    const found = lookup.get(spot.key) ?? contracts.find((c) => c.instrumentKey === spot.key || c.tradingSymbol === spot.sym);
    if (found) {
      selectedContracts.push({
        instrumentKey: found.instrumentKey,
        exchangeToken: found.exchangeToken,
        tradingSymbol: found.tradingSymbol,
        underlying: spot.underlying,
        expiryDate: marketSessionDate,
        strikePrice: 0,
        optionType: "INDEX",
        lotSize: 1,
        tier: "UNDERLYING_REFERENCE",
      });
    } else {
      missingKeys.push({
        instrumentKey: spot.key,
        tier: "CORE_ATM",
        reason: "Spot index reference key missing from daily master",
      });
    }
  }

  // 2. Add Near-Month Index Futures
  const futuresKeys = [
    { underlying: "NIFTY" as const, exp: niftyExpiries[0] },
    { underlying: "BANKNIFTY" as const, exp: bankniftyExpiries[0] },
  ];
  for (const fut of futuresKeys) {
    const found = contracts.find(
      (c) => c.underlying === fut.underlying && c.instrumentType === "FUTIDX" && c.expiryDate >= marketSessionDate
    );
    if (found) {
      selectedContracts.push({
        instrumentKey: found.instrumentKey,
        exchangeToken: found.exchangeToken,
        tradingSymbol: found.tradingSymbol,
        underlying: fut.underlying,
        expiryDate: found.expiryDate,
        strikePrice: 0,
        optionType: "FUTIDX",
        lotSize: found.lotSize,
        tier: "UNDERLYING_REFERENCE",
      });
    } else {
      missingKeys.push({
        instrumentKey: `${fut.underlying}_NEAR_FUTURES`,
        tier: "CORE_ATM",
        reason: `Near-month index futures missing for ${fut.underlying}`,
      });
    }
  }

  // Helper to select option strikes around ATM
  function processOptions(
    underlying: "NIFTY" | "BANKNIFTY",
    expiries: string[],
    atmStrike: number,
    interval: number
  ) {
    for (const expiry of expiries) {
      for (let offset = -wingStrikesCount; offset <= wingStrikesCount; offset++) {
        const strike = atmStrike + offset * interval;
        const tier = Math.abs(offset) <= 3 ? ("CORE_ATM" as const) : ("OUTER_WING" as const);

        for (const optionType of ["CE", "PE"] as const) {
          const matchKey = `${underlying}|${expiry}|${strike}|${optionType}`;
          const found = lookup.get(matchKey);

          if (found) {
            selectedContracts.push({
              instrumentKey: found.instrumentKey,
              exchangeToken: found.exchangeToken,
              tradingSymbol: found.tradingSymbol,
              underlying,
              expiryDate: expiry,
              strikePrice: strike,
              optionType,
              lotSize: found.lotSize,
              tier,
            });
          } else {
            missingKeys.push({
              instrumentKey: matchKey,
              tier,
              reason: `Unlisted contract in daily master for strike ${strike} ${optionType}`,
            });
          }
        }
      }
    }
  }

  // 3. Process NIFTY Options (interval 50)
  processOptions("NIFTY", niftyExpiries, niftyAtm, 50);

  // 4. Process BANKNIFTY Options (interval 100)
  processOptions("BANKNIFTY", bankniftyExpiries, bankniftyAtm, 100);

  // Expected keys count:
  // Spots: 2
  // Futures: 2
  // NIFTY: (2 * wingStrikesCount + 1) * 2 legs * niftyExpiries.length
  // BANKNIFTY: (2 * wingStrikesCount + 1) * 2 legs * bankniftyExpiries.length
  const strikesPerChain = 2 * wingStrikesCount + 1;
  const expectedKeysCount =
    2 + // spots
    2 + // futures
    strikesPerChain * 2 * niftyExpiries.length +
    strikesPerChain * 2 * bankniftyExpiries.length;

  const resolvedKeysCount = selectedContracts.length;

  // Session acceptance status:
  // Hard Invalidation (INVALID): Any CORE_ATM strike, near-month future, or spot reference missing
  // Partial (PARTIAL): Only OUTER_WING strikes missing
  // Complete (COMPLETE): 0 missing keys
  let universeStatus: HashedUniverseManifest["universeStatus"] = "COMPLETE";
  const coreMissing = missingKeys.some((m) => m.tier === "CORE_ATM");
  if (coreMissing || niftyExpiries.length < 2 || bankniftyExpiries.length < 2) {
    universeStatus = "INVALID";
  } else if (missingKeys.length > 0) {
    universeStatus = "PARTIAL";
  }

  const manifestPayloadWithoutHash = {
    schemaVersion: "1.0.0" as const,
    manifestType: "HashedUniverseManifest" as const,
    masterSource,
    masterRetrievalDate: retrievalDateIso,
    masterContentSha256,
    selectionRuleVersion: SELECTION_RULE_VERSION,
    calendarReference: REGULATORY_CALENDAR_REF,
    marketSessionDate,
    selectedExpiries: {
      NIFTY: niftyExpiries,
      BANKNIFTY: bankniftyExpiries,
    },
    atmReference: {
      method: referencePrices.method,
      priceTimestamp: referencePrices.priceTimestamp,
      niftyAtmStrike: niftyAtm,
      bankniftyAtmStrike: bankniftyAtm,
    },
    selectedContracts,
    expectedKeysCount,
    resolvedKeysCount,
    missingKeys,
    universeStatus,
  };

  const canonicalJson = JSON.stringify(manifestPayloadWithoutHash);
  const manifestHash = computeSha256(canonicalJson);

  return {
    ...manifestPayloadWithoutHash,
    manifestHash,
  };
}
