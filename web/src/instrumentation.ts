// Next.js instrumentation hook: startup and shutdown events, redacted.
import { logEvent } from "./lib/ops/structuredLog.ts";

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  logEvent("info", "app_startup", { node: process.version, provider: process.env.MARKET_DATA_PROVIDER ?? "mock" });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => { logEvent("info", "app_shutdown", { signal }); });
  }
}
