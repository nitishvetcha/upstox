export interface CalculatorPick {
  id: string;
  instrument: string;
  instrumentType: string;
  direction: string;
  entry?: number | null;
  stopLoss?: number | null;
  targets?: number[];
  source?: string;
  note?: string;
  livePrice?: number | null;
}

export function defaultLotSize(instrument: string, instrumentType: string): number {
  if (instrumentType === "STOCK") return 1;
  const upper = instrument.toUpperCase();
  if (upper.includes("BANKNIFTY") || upper.includes("BANK NIFTY")) return 15;
  if (upper.includes("FINNIFTY") || upper.includes("FIN NIFTY")) return 25;
  if (upper.includes("MIDCPNIFTY") || upper.includes("MIDCAP")) return 50;
  if (upper.includes("SENSEX")) return 10;
  if (upper.includes("BANKEX")) return 15;
  if (upper.includes("NIFTY")) return 75;
  return 1;
}
