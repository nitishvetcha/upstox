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

    let lots = Math.max(1, Math.floor(riskBudget / riskPerLot));
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
    };
  } else {
    // STOCK sizing
    let units = Math.max(1, Math.floor(riskBudget / riskPerUnit));
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
    };
  }
}
