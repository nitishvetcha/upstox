// TradingView Symbol Mapping & Deep-Link Helper
// Normalizes Upstox index names, option underlyings, and stock symbols to canonical TradingView tickers.

export function getTradingViewSymbol(rawSymbol: string): string {
  if (!rawSymbol) return "NSE:NIFTY";
  const clean = rawSymbol.trim().toUpperCase();

  // Already prefixed
  if (clean.startsWith("NSE:") || clean.startsWith("BSE:")) {
    return clean;
  }

  // Indices (exact check or known index phrases)
  if (clean === "NIFTY" || clean === "NIFTY 50" || clean === "NIFTY50" || clean === "NIFTY_50") {
    return "NSE:NIFTY";
  }
  if (clean === "BANKNIFTY" || clean === "NIFTY BANK" || clean === "BANK NIFTY" || clean === "NIFTYBANK") {
    return "NSE:BANKNIFTY";
  }
  if (clean === "FINNIFTY" || clean === "NIFTY FIN SERVICE" || clean === "NIFTY FINANCIAL SERVICES") {
    return "NSE:FINNIFTY";
  }
  if (clean === "MIDCPNIFTY" || clean === "NIFTY MID SELECT" || clean === "NIFTY MIDCAP 50" || clean === "NIFTY MIDCAP SELECT") {
    return "NSE:MIDCPNIFTY";
  }
  if (clean === "SENSEX" || clean === "BSE SENSEX") {
    return "BSE:SENSEX";
  }

  // Strip Upstox instrument prefixes if present (e.g. "NSE_EQ|INE002A01018" or "NSE_INDEX|Nifty 50")
  if (clean.includes("|")) {
    const afterPipe = clean.split("|")[1];
    return getTradingViewSymbol(afterPipe);
  }

  // Default to NSE equity ticker
  return `NSE:${clean}`;
}

/** Returns the official TradingView Web chart URL for deep linking. */
export function getTradingViewChartUrl(symbol: string, interval = "15"): string {
  const tvSymbol = encodeURIComponent(getTradingViewSymbol(symbol));
  return `https://www.tradingview.com/chart/?symbol=${tvSymbol}&interval=${interval}`;
}

/** Returns the official TradingView Embed Widget URL for responsive embedding. */
export function getTradingViewWidgetEmbedUrl(
  symbol: string,
  interval = "15",
  theme: "dark" | "light" = "dark",
): string {
  const tvSymbol = encodeURIComponent(getTradingViewSymbol(symbol));
  const params = new URLSearchParams({
    symbol: getTradingViewSymbol(symbol),
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
