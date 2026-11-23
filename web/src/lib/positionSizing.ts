export interface PositionSizeParams {
  type: "OPTION" | "STOCK";
  accountCapital: number;
  riskPercent?: number; // default 1.5%
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  lotSize?: number | null; // e.g. 65 for Nifty, 1 for Stock
  unitPrice?: number | null; // premium or share price
  maxCapitalAllocationPct?: number; // default 50%
}

export interface PositionSizeResult {
  recommendedLots: number;
  recommendedUnits: number;
  riskBudget: number;
  totalRisk: number;
  totalRiskPercent: number;
  capitalRequired: number;
  capitalRequiredPercent: number;
  target1Profit: number;
  target2Profit: number;
  isCappedByCapital: boolean;
  isCapitalConstrained?: boolean;
  minCapitalNeeded?: number;
  riskWarning?: string | null;
}

export function calculatePositionSize(params: PositionSizeParams): PositionSizeResult {
  const {
    type,
    accountCapital,
    riskPercent = 1.5,
    entry,
    stop,
    target1,
    target2,
    lotSize = 1,
    unitPrice,
    maxCapitalAllocationPct = 50,
  } = params;

  const validCapital = Math.max(accountCapital, 1000);
  const effectiveLotSize = Math.max(lotSize ?? 1, 1);
  const effectiveUnitPrice = unitPrice != null && unitPrice > 0 ? unitPrice : entry;
  const riskPerUnit = Math.max(Math.abs(entry - stop), 0.01);
  const riskBudget = Math.round(validCapital * (riskPercent / 100) * 100) / 100;
  const maxAllowedCapital = validCapital * (maxCapitalAllocationPct / 100);

  if (type === "OPTION") {
    const riskPerLot = riskPerUnit * effectiveLotSize;
    const capitalPerLot = effectiveUnitPrice * effectiveLotSize;

    // Strict 1% (or user riskPercent) risk enforcement:
    // If risk per lot exceeds the entire risk budget, do NOT force 1 lot (which would risk 15%-30% on small accounts).
    // Instead return 0 lots with an explicit capital shortfall calculation.
    const rawLots = Math.floor(riskBudget / riskPerLot);
    if (rawLots < 1) {
      const minCapitalNeeded = Math.ceil(riskPerLot / (riskPercent / 100));
      return {
        recommendedLots: 0,
        recommendedUnits: 0,
        riskBudget,
        totalRisk: 0,
        totalRiskPercent: 0,
        capitalRequired: 0,
        capitalRequiredPercent: 0,
        target1Profit: 0,
        target2Profit: 0,
        isCappedByCapital: false,
        isCapitalConstrained: true,
        minCapitalNeeded,
        riskWarning: `Account capital (₹${validCapital.toLocaleString("en-IN")}) is insufficient to trade 1 lot within your ${riskPercent}% risk budget (₹${riskBudget.toLocaleString("en-IN")}). Risk per lot is ₹${Math.round(riskPerLot).toLocaleString("en-IN")}. Minimum capital needed: ₹${minCapitalNeeded.toLocaleString("en-IN")}.`,
      };
    }

    let lots = rawLots;
    let isCappedByCapital = false;

    // Capital allocation guard (e.g. max 50% account capital deployed)
    if (lots * capitalPerLot > maxAllowedCapital) {
      const maxCapitalLots = Math.floor(maxAllowedCapital / capitalPerLot);
      if (maxCapitalLots >= 1) {
        lots = maxCapitalLots;
        isCappedByCapital = true;
      }
    }

    const totalUnits = lots * effectiveLotSize;
    const totalRisk = Math.round(lots * riskPerLot * 100) / 100;
    const capitalRequired = Math.round(lots * capitalPerLot * 100) / 100;
    const target1Profit = Math.round(totalUnits * Math.max(target1 - entry, 0) * 100) / 100;
    const target2Profit = Math.round(totalUnits * Math.max(target2 - entry, 0) * 100) / 100;

    return {
      recommendedLots: lots,
      recommendedUnits: totalUnits,
      riskBudget,
      totalRisk,
      totalRiskPercent: Math.round((totalRisk / validCapital) * 10000) / 100,
      capitalRequired,
      capitalRequiredPercent: Math.round((capitalRequired / validCapital) * 10000) / 100,
      target1Profit,
      target2Profit,
      isCappedByCapital,
      isCapitalConstrained: false,
      minCapitalNeeded: undefined,
      riskWarning: null,
    };
  } else {
    // STOCK sizing:
    // If risk per share exceeds the entire risk budget, return 0 shares with capital shortfall details.
    const rawUnits = Math.floor(riskBudget / riskPerUnit);
    if (rawUnits < 1) {
      const minCapitalNeeded = Math.ceil(riskPerUnit / (riskPercent / 100));
      return {
        recommendedLots: 0,
        recommendedUnits: 0,
        riskBudget,
        totalRisk: 0,
        totalRiskPercent: 0,
        capitalRequired: 0,
        capitalRequiredPercent: 0,
        target1Profit: 0,
        target2Profit: 0,
        isCappedByCapital: false,
        isCapitalConstrained: true,
        minCapitalNeeded,
        riskWarning: `Account capital (₹${validCapital.toLocaleString("en-IN")}) is insufficient to buy 1 share within your ${riskPercent}% risk budget (₹${riskBudget.toLocaleString("en-IN")}). Risk per share is ₹${riskPerUnit.toFixed(2)}. Minimum capital needed: ₹${minCapitalNeeded.toLocaleString("en-IN")}.`,
      };
    }

    let units = rawUnits;
    let isCappedByCapital = false;

    if (units * effectiveUnitPrice > maxAllowedCapital) {
      const maxCapitalUnits = Math.floor(maxAllowedCapital / effectiveUnitPrice);
      if (maxCapitalUnits >= 1) {
        units = maxCapitalUnits;
        isCappedByCapital = true;
      }
    }

    const totalRisk = Math.round(units * riskPerUnit * 100) / 100;
    const capitalRequired = Math.round(units * effectiveUnitPrice * 100) / 100;
    const target1Profit = Math.round(units * Math.max(target1 - entry, 0) * 100) / 100;
    const target2Profit = Math.round(units * Math.max(target2 - entry, 0) * 100) / 100;

    return {
      recommendedLots: units, // for stocks, lots = shares
      recommendedUnits: units,
      riskBudget,
      totalRisk,
      totalRiskPercent: Math.round((totalRisk / validCapital) * 10000) / 100,
      capitalRequired,
      capitalRequiredPercent: Math.round((capitalRequired / validCapital) * 10000) / 100,
      target1Profit,
      target2Profit,
      isCappedByCapital,
      isCapitalConstrained: false,
      minCapitalNeeded: undefined,
      riskWarning: null,
    };
  }
}
