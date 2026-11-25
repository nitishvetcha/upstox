// TradingView Symbol Mapping & Deep-Link Helper
// Normalizes Upstox index names, option underlyings, commodity symbols, and stock symbols to canonical TradingView tickers.

import { ALL_LIQUID_CONSTITUENTS } from "./services/breadthConstituents.generated.ts";
import { COMMODITIES } from "./services/instrumentRegistry.ts";

// Build reverse lookup from ISIN and Upstox instrument keys to NSE equity tickers
const ISIN_OR_KEY_TO_SYMBOL: Record<string, string> = {};
for (const c of ALL_LIQUID_CONSTITUENTS) {
  if (c.symbol) {
    const sym = c.symbol.trim().toUpperCase();
    if (c.isin) ISIN_OR_KEY_TO_SYMBOL[c.isin.trim().toUpperCase()] = sym;
    if (c.instrumentKey) ISIN_OR_KEY_TO_SYMBOL[c.instrumentKey.trim().toUpperCase()] = sym;
  }
}

/**
 * Normalizes any raw symbol, index ID, commodity name, option title, or Upstox instrument key
 * into a canonical, valid TradingView ticker symbol that will never 404.
 */
export function getTradingViewSymbol(rawSymbol: string): string {
  if (!rawSymbol || typeof rawSymbol !== "string") return "NSE:NIFTY";
  let clean = rawSymbol.trim().toUpperCase();

  // Decode URI-encoded characters if symbol was passed with % encoding
  if (clean.includes("%")) {
    try {
      clean = decodeURIComponent(clean).toUpperCase();
    } catch {
      // Keep clean as-is if decoding fails
    }
  }

  // Already prefixed with an exchange (idempotent guard)
  if (
    clean.startsWith("NSE:") ||
    clean.startsWith("BSE:") ||
    clean.startsWith("MCX:") ||
    clean.startsWith("NCDEX:") ||
    clean.startsWith("TVC:") ||
    clean.startsWith("INDEX:")
  ) {
    // Normalise commodity futures on MCX without contract suffix
    if (clean === "MCX:CRUDEOIL") return "MCX:CRUDEOIL1!";
    if (clean === "MCX:NATURALGAS") return "MCX:NATURALGAS1!";
    if (clean === "MCX:GOLD") return "MCX:GOLD1!";
    if (clean === "MCX:SILVER") return "MCX:SILVER1!";
    if (clean === "MCX:COPPER") return "MCX:COPPER1!";
    if (clean === "MCX:ZINC") return "MCX:ZINC1!";
    if (clean === "MCX:ALUMINIUM") return "MCX:ALUMINIUM1!";
    if (clean === "MCX:LEAD") return "MCX:LEAD1!";
    return clean;
  }

  // Check Upstox instrument keys with pipe (e.g. "NSE_INDEX|Nifty 50", "MCX_FO|576264", "NSE_EQ|INE002A01018")
  if (clean.includes("|")) {
    // Check known constituent instrument keys (ISIN mapping)
    if (ISIN_OR_KEY_TO_SYMBOL[clean]) {
      return getTradingViewSymbol(ISIN_OR_KEY_TO_SYMBOL[clean]);
    }

    // Check active commodity keys
    if (
      clean === COMMODITIES.crudeoil.underlyingKey ||
      (clean.startsWith("MCX_FO|") && (clean.includes("CRUDE") || clean.includes("576264")))
    ) {
      return "MCX:CRUDEOIL1!";
    }
    if (
      clean === COMMODITIES.naturalgas.underlyingKey ||
      (clean.startsWith("MCX_FO|") && (clean.includes("NAT") || clean.includes("578249") || clean.includes("GAS")))
    ) {
      return "MCX:NATURALGAS1!";
    }
    if (clean.startsWith("MOCK_FO|")) {
      if (clean.includes("245") || clean.includes("NAT")) return "MCX:NATURALGAS1!";
      if (clean.includes("CRUDE")) return "MCX:CRUDEOIL1!";
      return "NSE:NIFTY";
    }

    const afterPipe = clean.split("|")[1];
    return getTradingViewSymbol(afterPipe);
  }

  // Direct ISIN lookup (e.g. "INE002A01018")
  if (ISIN_OR_KEY_TO_SYMBOL[clean]) {
    return getTradingViewSymbol(ISIN_OR_KEY_TO_SYMBOL[clean]);
  }

  // Check if it's an option contract or spread string (e.g. "NATURALGAS 245/270 CE Spread", "CRUDEOIL 7500 CE", "NIFTY 24500 CE")
  if (
    clean.startsWith("NATURALGAS") ||
    clean.startsWith("NATURAL GAS") ||
    clean.startsWith("NATGAS")
  ) {
    return "MCX:NATURALGAS1!";
  }
  if (
    clean.startsWith("CRUDEOIL") ||
    clean.startsWith("CRUDE OIL") ||
    clean.startsWith("CRUDE")
  ) {
    return "MCX:CRUDEOIL1!";
  }
  if (clean.startsWith("BANKEX") || clean.startsWith("BSE BANKEX")) {
    return "BSE:BANKEX";
  }
  if (clean.startsWith("SENSEX") || clean.startsWith("BSE SENSEX")) {
    return "BSE:SENSEX";
  }
  if (
    clean.startsWith("BANKNIFTY") ||
    clean.startsWith("BANK NIFTY") ||
    clean.startsWith("NIFTY BANK")
  ) {
    return "NSE:BANKNIFTY";
  }
  if (
    clean.startsWith("FINNIFTY") ||
    clean.startsWith("FIN NIFTY") ||
    clean.startsWith("NIFTY FIN")
  ) {
    return "NSE:FINNIFTY";
  }
  if (
    clean.startsWith("MIDCPNIFTY") ||
    clean.startsWith("MIDCAP NIFTY") ||
    clean.startsWith("NIFTY MID")
  ) {
    return "NSE:MIDCPNIFTY";
  }
  if (clean.startsWith("NIFTY")) {
    return "NSE:NIFTY";
  }
  if (clean.startsWith("GOLD")) {
    return "MCX:GOLD1!";
  }
  if (clean.startsWith("SILVER")) {
    return "MCX:SILVER1!";
  }
  if (clean.startsWith("COPPER")) {
    return "MCX:COPPER1!";
  }

  // Multi-word strings for stock options (e.g. "RELIANCE 2500 CE", "TCS 4200 PE")
  if (clean.includes(" ") || clean.includes("/")) {
    const firstWord = clean.split(/[\s/]/)[0];
    if (firstWord && firstWord !== clean) {
      return getTradingViewSymbol(firstWord);
    }
  }

  // Commodities (exact match)
  if (
    clean === "CRUDEOIL" ||
    clean === "CRUDE OIL" ||
    clean === "CRUDE" ||
    clean === "CRUDEOILM" ||
    clean === "CRUDE OIL MINI" ||
    clean === "CRUDEOIL1!" ||
    clean === "576264"
  ) {
    return "MCX:CRUDEOIL1!";
  }
  if (
    clean === "NATURALGAS" ||
    clean === "NATURAL GAS" ||
    clean === "NATGAS" ||
    clean === "NATGASMINI" ||
    clean === "NATURAL GAS MINI" ||
    clean === "NATURALGAS MINI" ||
    clean === "NATURALGAS1!" ||
    clean === "578249"
  ) {
    return "MCX:NATURALGAS1!";
  }
  if (clean === "GOLD" || clean === "GOLDM" || clean === "GOLD MINI" || clean === "GOLD1!") {
    return "MCX:GOLD1!";
  }
  if (
    clean === "SILVER" ||
    clean === "SILVERM" ||
    clean === "SILVER MINI" ||
    clean === "SILVERMIC" ||
    clean === "SILVER1!"
  ) {
    return "MCX:SILVER1!";
  }
  if (clean === "COPPER" || clean === "COPPERM" || clean === "COPPER1!") {
    return "MCX:COPPER1!";
  }
  if (clean === "ZINC" || clean === "ZINCM" || clean === "ZINC1!") {
    return "MCX:ZINC1!";
  }
  if (clean === "ALUMINIUM" || clean === "ALUMINI" || clean === "ALUMINIUM1!") {
    return "MCX:ALUMINIUM1!";
  }
  if (clean === "LEAD" || clean === "LEADM" || clean === "LEAD1!") {
    return "MCX:LEAD1!";
  }

  // Major Indian Indices
  if (
    clean === "NIFTY" ||
    clean === "NIFTY 50" ||
    clean === "NIFTY50" ||
    clean === "NIFTY_50" ||
    clean === "NIFTY-50"
  ) {
    return "NSE:NIFTY";
  }
  if (
    clean === "BANKNIFTY" ||
    clean === "NIFTY BANK" ||
    clean === "BANK NIFTY" ||
    clean === "NIFTYBANK" ||
    clean === "BANK-NIFTY"
  ) {
    return "NSE:BANKNIFTY";
  }
  if (
    clean === "FINNIFTY" ||
    clean === "NIFTY FIN SERVICE" ||
    clean === "NIFTY FINANCIAL SERVICES" ||
    clean === "FIN NIFTY" ||
    clean === "NIFTYFIN"
  ) {
    return "NSE:FINNIFTY";
  }
  if (
    clean === "MIDCPNIFTY" ||
    clean === "NIFTY MID SELECT" ||
    clean === "NIFTY MIDCAP 50" ||
    clean === "NIFTY MIDCAP SELECT" ||
    clean === "MIDCAP NIFTY" ||
    clean === "MIDCP NIFTY"
  ) {
    return "NSE:MIDCPNIFTY";
  }
  if (clean === "NIFTY NEXT 50" || clean === "NIFTYJR" || clean === "NIFTYNXT50") {
    return "NSE:NIFTYJR";
  }
  if (clean === "INDIA VIX" || clean === "INDIAVIX" || clean === "VIX") {
    return "NSE:INDIAVIX";
  }
  if (clean === "SENSEX" || clean === "BSE SENSEX" || clean === "SENSEX 30") {
    return "BSE:SENSEX";
  }
  if (clean === "BANKEX" || clean === "BSE BANKEX") {
    return "BSE:BANKEX";
  }

  // Default to NSE equity ticker, sanitizing special characters (& and - to _)
  const sanitized = clean.replace(/[&-]/g, "_");
  return `NSE:${sanitized}`;
}

/** Returns the official TradingView Web chart URL for deep linking. */
export function getTradingViewChartUrl(symbol: string, interval = "15"): string {
  const tvSymbol = getTradingViewSymbol(symbol);
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}&interval=${interval}`;
}

/** Returns the official TradingView Embed Widget URL for responsive embedding. */
export function getTradingViewWidgetEmbedUrl(
  symbol: string,
  interval = "15",
  theme: "dark" | "light" = "dark",
): string {
  const tvSymbol = getTradingViewSymbol(symbol);
  const params = new URLSearchParams({
    symbol: tvSymbol,
    interval,
    theme,
    style: "1", // 1 = Candles
    timezone: "Asia/Kolkata",
    locale: "en",
    toolbarbg: theme === "dark" ? "09090b" : "ffffff",
    enable_publishing: "false",
    hide_top_toolbar: "false",
    hide_legend: "false",
    save_image: "false",
    container_id: "tradingview_widget",
  });
  return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
}
