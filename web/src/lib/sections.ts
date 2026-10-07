// Sidebar order (spec §32). `phase` = the build phase that delivers the page.
export const SECTIONS = [
  { slug: "", title: "Dashboard", phase: 1 },
  { slug: "market", title: "Market Overview", phase: 2 },
  { slug: "option-chain", title: "Option Chain", phase: 2 },
  { slug: "strategies", title: "Strategies", phase: 5 },
  { slug: "recommendations", title: "Recommendation", phase: 6 },
  { slug: "paper-trading", title: "Paper Trading", phase: 7 },
  { slug: "backtest", title: "Backtest", phase: 8 },
  { slug: "performance", title: "Performance", phase: 9 },
  { slug: "walk-forward", title: "Walk-Forward", phase: 11 },
  { slug: "news", title: "News", phase: 4 },
  { slug: "system-health", title: "System Health", phase: 10 },
  { slug: "settings", title: "Settings", phase: 10 },
];
