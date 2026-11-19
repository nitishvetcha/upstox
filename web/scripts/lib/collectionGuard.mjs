// Fail-closed guard for standalone collection scripts, historical download utilities and research collectors.
// Call assertCollectionAuthorized() as the first statement. When the required configuration is absent the
// process prints a warning and exits with code 2 BEFORE any network call is made.
//
// Kinds:
//   "upstox"   - calls Upstox (quotes, candles, instruments, OAuth). Requires MARKET_DATA_PROVIDER=upstox
//                AND UPSTOX_COLLECTION_ENABLED=true.
//   "external" - calls other external hosts (NSE, BSE, niftyindices, Upstox public assets).
//                Requires EXTERNAL_COLLECTION_ENABLED=true.
// Nothing is enabled by default. Normal development startup (npm run dev) never runs these scripts.

const RULES = {
  upstox: [["MARKET_DATA_PROVIDER", "upstox"], ["UPSTOX_COLLECTION_ENABLED", "true"]],
  external: [["EXTERNAL_COLLECTION_ENABLED", "true"]],
};

export function assertCollectionAuthorized(name, kind) {
  const rule = RULES[kind];
  if (!rule) throw new Error(`collectionGuard: unknown kind "${kind}" for ${name}`);
  const missing = rule.filter(([k, v]) => process.env[k] !== v);
  if (missing.length === 0) {
    console.warn(`[COLLECTION AUTHORIZED] ${name} (${kind}): external requests will be made.`);
    return;
  }
  const need = rule.map(([k, v]) => `${k}=${v}`).join(" and ");
  console.error(`[COLLECTION BLOCKED] ${name}: requires ${need}. No network request was sent.`);
  process.exit(2);
}

// Registry of every guarded entry point. The regression test checks that each file carries its guard.
export const GUARDED = {
  "backfill-intraday-bars.mjs": "upstox",
  "phase8-connectivity-test.ts": "upstox",
  "phase8-option-keys.ts": "upstox",
  "historical-expired-probe.ts": "upstox",
  "historical-coverage-probe.ts": "upstox",
  "historical-pilot-acquire.ts": "upstox",
  "rate-limit-test.ts": "upstox",
  "recover-intraday-bars.mjs": "upstox",
  "collect-intraday-bars.mjs": "upstox",
  "upstox-collect.ts": "upstox",
  "upstox-daily-universe-collect.ts": "upstox",
  "upstox-pilot-collect.ts": "upstox",
  "upstox-discovery.mjs": "upstox",
  "options-research-inventory.ts": "upstox",
  "options-audit-research.ts": "upstox",
  "upstox-login.mjs": "upstox",
  "upstox-status.mjs": "upstox",
  "dev-upstox.mjs": "upstox",
  "nse-discovery-collect.ts": "external",
  "sync-constituents.mjs": "external",
  "validate-instruments.mjs": "external",
  "nse-bhavcopy-sweep.py": "external",
  "nse-bhavcopy-sweep-v2.py": "external",
};
