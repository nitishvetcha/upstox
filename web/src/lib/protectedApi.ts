// Paths that require an operator session or bearer token. Backtest and paper-trading routes are protected here,
// in addition to any per-handler check. Login, logout, status and health stay open.
const PROTECTED: RegExp[] = [
  /^\/api\/backtest(\/|$)/,
  /^\/api\/paper-opportunities(\/|$)/,
  /^\/api\/paper-trading(\/|$)/,
  /^\/api\/recommendations\/[^/]+\/paper-trade(\/|$)/,
  /^\/api\/bot(\/|$)/,
  /^\/api\/notifications(\/|$)/,
  /^\/api\/market\/stream(\/|$)/,
];

export function isProtectedApiPath(pathname: string): boolean {
  return PROTECTED.some((re) => re.test(pathname));
}
