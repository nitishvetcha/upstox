import { logEvent } from "./lib/ops/structuredLog.ts";

export function registerNodeInstrumentation() {
  logEvent("info", "app_startup", {
    node: process.version,
    provider: process.env.MARKET_DATA_PROVIDER ?? "upstox",
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      logEvent("info", "app_shutdown", { signal });
    });
  }
}
