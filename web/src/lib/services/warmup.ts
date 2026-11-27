// Background workspace pre-warmer: deduplicated async warming for Overview, Opportunities,
// and real-time Upstox streaming ticks so login and first render finish in <2s.
import { triggerDashboardRevalidate } from "./market.ts";
import { triggerAuthoritativeRevalidate } from "./authoritativeOpportunity.ts";
import { triggerOpportunitiesRevalidate } from "./opportunitiesCache.ts";
import { upstoxStreamClient } from "./upstoxStreamClient.ts";

const gWarm = globalThis as typeof globalThis & { __workspaceWarmPromise?: Promise<void> | null };

export function warmWorkspaceCaches(): Promise<void> {
  if (process.env.MARKET_DATA_PROVIDER !== "upstox") return Promise.resolve();
  if (gWarm.__workspaceWarmPromise) return gWarm.__workspaceWarmPromise;
  gWarm.__workspaceWarmPromise = (async () => {
    void upstoxStreamClient.ensureStarted().catch(() => {});
    await Promise.allSettled([
      triggerDashboardRevalidate(),
      triggerAuthoritativeRevalidate(),
      triggerOpportunitiesRevalidate(),
    ]);
  })().finally(() => {
    gWarm.__workspaceWarmPromise = null;
  });
  return gWarm.__workspaceWarmPromise;
}
